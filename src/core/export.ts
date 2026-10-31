import { parseCapture, readSaveText, type Capture, type Placement, type Pose } from './save';
import { attachment, exportIssues, relativePose } from './editor';
import { validateReplayRows } from './replay-validation';
export function exportCapture(source: Capture): Capture {
  const issues = exportIssues(source);
  if (issues.length) throw new Error(`Export blocked: ${issues.join('\n')}`);
  const data = structuredClone(source);
  for (const key of [
    'verification',
    'excludedCandidates',
    'initialPlacements',
    'numericRoundTripFailures',
    'captureMode',
  ])
    delete data[key];
  data.schemaVersion = 6;
  data.coverage = 'loaded-player-placed-actors-and-referenced-supports';
  data.completeHomebase = false;
  data.replayPolicy = 'build-placement-records-only';
  data.attachmentReference = 'actorPath';
  data.relativeTransformConvention = 'Unreal-MakeRelativeTransform-child-parent';
  data.editor = {
    application: 'Homebase Designer',
    purpose: 'custom-blueprint',
    validation: 'offline-support-and-placement-checks; game-server-acceptance-unverified',
  };
  data.placements = data.placements
    .filter((p) => p.captureRole === 'placement')
    .sort((a, b) => Number(a.kind === 'trap') - Number(b.kind === 'trap'));
  const byId = new Map(data.placements.map((p) => [p.actorPath, p]));
  for (const p of data.placements) {
    p.mirrored = Boolean(p.mirrored);
    p.savedActorGuid = '00000000000000000000000000000000';
    if (p.kind === 'trap') {
      const a = attachment(p)!,
        parent = byId.get(a.supportActorPath)!;
      p.attachment = {
        ...a,
        supportTransform: structuredClone(parent.transform),
        relativeTransform: relativePose(p.transform, parent.transform),
      };
    } else
      p.attachment = {
        status: 'not-applicable',
        supportActorPath: '',
        side: 255,
        supportTransform: null,
        relativeTransform: null,
      };
  }
  data.capturedCount = data.placements.length;
  data.scannedCount = data.placements.length;
  let numericRoundTripFailures = 0;
  for (const p of data.placements) {
    const a = attachment(p)!;
    for (const pose of [p.transform, p.meshTransform, a.supportTransform, a.relativeTransform]) {
      if (!pose) continue;
      const decoded = JSON.parse(replayPose(pose)) as Pose;
      for (const key of ['translation', 'rotation', 'scale'] as const)
        numericRoundTripFailures += pose[key].filter(
          (value, i) => value !== decoded[key][i],
        ).length;
    }
  }
  if (numericRoundTripFailures) throw new Error('Export changed transform precision.');
  return { numericRoundTripFailures, ...data };
}
const escape = (value: unknown) =>
  (typeof value === 'string' ? value : JSON.stringify(value))
    .replaceAll('%', '%25')
    .replaceAll('|', '%7C')
    .replaceAll('\n', '%0A')
    .replaceAll('\r', '%0D');
export function replayNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Replay coordinates must be finite.');
  const text = String(value);
  if (!/[eE]/.test(text)) return text;
  const [mantissa, power] = text.split(/[eE]/),
    sign = mantissa.startsWith('-') ? '-' : '',
    unsigned = mantissa.replace(/^-/, ''),
    digits = unsigned.replace('.', '');
  const point = (unsigned.includes('.') ? unsigned.indexOf('.') : unsigned.length) + Number(power);
  return (
    sign +
    (point <= 0
      ? '0.' + '0'.repeat(-point) + digits
      : point >= digits.length
        ? digits + '0'.repeat(point - digits.length)
        : digits.slice(0, point) + '.' + digits.slice(point))
  );
}
export function replayPose(pose: Pose | null): string {
  if (!pose) return 'null';
  return (
    '{' +
    (['translation', 'rotation', 'scale'] as const)
      .map((key) => `"${key}":[${pose[key].map(replayNumber).join(',')}]`)
      .join(',') +
    '}'
  );
}
export function replayRow(p: Placement): string {
  const a = attachment(p)!;
  const fields = [
    p.captureRole,
    p.kind,
    p.actorPath,
    p.classPath,
    p.itemPath ?? '',
    p.meshPath ?? '',
    a.supportActorPath,
    p.attachmentType ?? 9,
    Boolean(p.mirrored),
    p.resourceType ?? 0,
    p.level ?? 0,
    replayPose(p.transform),
    replayPose(p.meshTransform),
    replayPose(a.supportTransform),
    replayPose(a.relativeTransform),
    p.savedActorGuid ?? '',
    p,
  ];
  return fields.map(escape).join('|');
}
export function exportSave(template: Uint8Array, source: Capture): Uint8Array {
  readSaveText(template);
  const data = exportCapture(source);
  const rows = data.placements.map(replayRow);
  validateReplayRows(rows);
  const document = JSON.stringify(data);
  if (!document.includes('"numericRoundTripFailures":0,'))
    throw new Error('Export is missing the menu precision result.');
  const payload = `STW_HOMEBASE_1\n${document}\n${rows.join('\n')}`;
  if (payload.length > 64 * 1024 * 1024)
    throw new Error('Blueprint exceeds the menu 64 Mi-character limit.');
  const marker = new TextEncoder().encode('\x11\0\0\0ExternalDataJson\0\x0c\0\0\0StrProperty\0');
  let at = -1;
  for (let i = 0; i < Math.min(template.length - marker.length, 65537); i++)
    if (marker.every((v, j) => template[i + j] === v)) {
      at = i;
      break;
    }
  if (at < 0) throw new Error('Missing save container marker.');
  const sizeAt = at + marker.length + 4,
    textAt = sizeAt + 5;
  const oldLength = new DataView(
    template.buffer,
    template.byteOffset,
    template.byteLength,
  ).getInt32(textAt, true);
  const encoded = new TextEncoder().encode(payload);
  const oldEnd = textAt + 4 + Math.abs(oldLength) * (oldLength < 0 ? 2 : 1),
    bytes = encoded.length + 1;
  const result = new Uint8Array(textAt + 4 + bytes + template.length - oldEnd);
  if (result.length > 128 * 1024 * 1024)
    throw new Error('Blueprint exceeds the 128 MiB .sav limit.');
  result.set(template.subarray(0, textAt));
  const view = new DataView(result.buffer);
  view.setInt32(sizeAt, bytes + 4, true);
  view.setInt32(textAt, bytes, true);
  result.set(encoded, textAt + 4);
  result.set(template.subarray(oldEnd), textAt + 4 + bytes);
  if (
    readSaveText(result) !== payload ||
    parseCapture(result).placements.length !== data.placements.length
  )
    throw new Error('Export round-trip verification failed.');
  return result;
}
export function exportJson(source: Capture): string {
  return JSON.stringify(exportCapture(source), null, 2) + '\n';
}

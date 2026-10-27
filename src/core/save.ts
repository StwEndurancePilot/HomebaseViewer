export type Pose = {
  translation: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
};
export type Placement = {
  actorPath: string;
  classPath: string;
  meshPath: string;
  itemPath?: string;
  kind: 'structure' | 'trap';
  captureRole: 'placement' | 'existing-world' | 'unavailable';
  transform: Pose;
  meshTransform: Pose;
  mirrored?: boolean;
  [key: string]: unknown;
};
export type Capture = {
  schemaVersion: number;
  format: string;
  worldPath: string;
  placements: Placement[];
  completeHomebase: boolean;
  [key: string]: unknown;
};
const MAX_SIZE = 128 * 1024 * 1024;
const marker = new TextEncoder().encode('\x11\0\0\0ExternalDataJson\0\x0c\0\0\0StrProperty\0');
const trailer = new Uint8Array([5, 0, 0, 0, 78, 111, 110, 101, 0, 0, 0, 0, 0]);
const ascii = new TextDecoder('utf-8', { fatal: true });
function matchAt(bytes: Uint8Array, pattern: Uint8Array, at: number) {
  return pattern.every((value, index) => bytes[at + index] === value);
}
export function readSaveText(bytes: Uint8Array): string {
  if (bytes.length > MAX_SIZE || bytes.length < 80 || ascii.decode(bytes.subarray(0, 4)) !== 'GVAS')
    throw new Error(
      'Choose a menu homebase .sav (SpriteSaveGame), or a capture JSON. Epic cloud saves are a different format.',
    );
  let markerAt = -1;
  for (let i = 4; i <= Math.min(65536, bytes.length - marker.length); i++) {
    if (matchAt(bytes, marker, i)) {
      markerAt = i;
      break;
    }
  }
  if (
    markerAt < 0 ||
    !new TextDecoder()
      .decode(bytes.subarray(0, markerAt))
      .includes('/Script/ExtractionCoreRuntime.SpriteSaveGame\0')
  )
    throw new Error('This is not an STW menu homebase save.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sizeAt = markerAt + marker.length + 4,
    textAt = sizeAt + 5;
  if (textAt + 4 > bytes.length || view.getInt32(sizeAt - 4, true) !== 0 || bytes[sizeAt + 4] !== 0)
    throw new Error('Unsupported save property layout.');
  const length = view.getInt32(textAt, true);
  const count = Math.abs(length) * (length < 0 ? 2 : 1),
    end = textAt + 4 + count;
  const terminator = length < 0 ? 2 : 1;
  if (
    !length ||
    end > bytes.length ||
    view.getInt32(sizeAt, true) !== count + 4 ||
    bytes.length !== end + trailer.length ||
    !matchAt(bytes, trailer, end) ||
    bytes.subarray(end - terminator, end).some((value) => value !== 0)
  )
    throw new Error('Truncated or unsupported homebase save.');
  return new TextDecoder(length < 0 ? 'utf-16le' : 'utf-8', { fatal: true }).decode(
    bytes.subarray(textAt + 4, end - terminator),
  );
}
export function decodeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parts = /^binary64:([+-]?\d+):([+-]?\d+):([+-]?\d+)$/.exec(value);
    if (parts) {
      const high = Number(parts[1]),
        low = Number(parts[2]),
        exponent = Number(parts[3]);
      if (
        Number.isSafeInteger(high) &&
        Number.isSafeInteger(low) &&
        Math.abs(high) >= 67108864 &&
        Math.abs(high) < 134217728 &&
        Math.abs(low) < 67108864 &&
        high * low >= 0 &&
        exponent >= -1074 &&
        exponent <= 1023
      ) {
        const normalized = (high * 67108864 + low) / 4503599627370496;
        const result = normalized * 2 ** exponent;
        if (Number.isFinite(result) && result !== 0 && result / 2 ** exponent === normalized)
          return result;
      }
    }
  }
  throw new Error('A transform contains an invalid or unsupported number.');
}
function pose(value: unknown, label: string): Pose {
  if (!value || typeof value !== 'object')
    throw new Error(`${label} is missing. Re-capture this base with full mesh transforms.`);
  const source = value as Record<string, unknown>;
  const result: Record<string, number[]> = {};
  for (const [key, length] of [
    ['translation', 3],
    ['rotation', 4],
    ['scale', 3],
  ] as const) {
    if (!Array.isArray(source[key]) || source[key].length !== length)
      throw new Error(`${label}.${key} is invalid.`);
    result[key] = source[key].map(decodeNumber);
  }
  const norm = Math.hypot(...result.rotation);
  if (Math.abs(norm - 1) > 1e-5)
    throw new Error(`${label} has a non-unit quaternion; it cannot be silently corrected.`);
  return result as Pose;
}
export function parseCapture(bytes: Uint8Array): Capture {
  if (bytes.length > MAX_SIZE) throw new Error('Homebase files must be 128 MiB or smaller.');
  const isSave = matchAt(bytes, new TextEncoder().encode('GVAS'), 0);
  const text = isSave ? readSaveText(bytes) : ascii.decode(bytes).replace(/^\uFEFF/, '');
  let source: unknown;
  if (isSave) {
    if (!text.startsWith('STW_HOMEBASE_1\n'))
      throw new Error('Choose a captured homebase, not settings or the homebase library index.');
    const lines = text.split('\n');
    source = JSON.parse(lines[1]);
    for (const line of lines.slice(2)) {
      if (!line) continue;
      const fields = line.split('|');
      if (
        fields.length !== 17 ||
        !['placement', 'existing-world', 'unavailable'].includes(fields[0])
      )
        throw new Error('Invalid homebase replay record.');
    }
  } else source = JSON.parse(text);
  const data = source as Capture;
  if (
    !data ||
    data.format !== 'stw-homebase-capture' ||
    ![3, 4, 5, 6].includes(data.schemaVersion) ||
    data.coordinateUnit !== 'unreal-world-units' ||
    data.rotationEncoding !== 'quaternion-xyzw' ||
    !Array.isArray(data.placements)
  )
    throw new Error('Expected a schema 3–6 STW homebase capture with full world transforms.');
  if (data.capturedCount !== undefined && data.capturedCount !== data.placements.length)
    throw new Error('The capture count does not match its placement records.');
  const actors = new Set<string>();
  const placements = data.placements.map((p, index) => {
    if (
      !p ||
      !['structure', 'trap'].includes(p.kind) ||
      typeof p.actorPath !== 'string' ||
      !p.actorPath ||
      typeof p.classPath !== 'string' ||
      typeof p.meshPath !== 'string'
    )
      throw new Error(`Invalid placement ${index + 1}.`);
    if (actors.has(p.actorPath))
      throw new Error(`Duplicate actor record at placement ${index + 1}.`);
    actors.add(p.actorPath);
    const role = p.captureRole ?? 'placement';
    if (!['placement', 'existing-world', 'unavailable'].includes(role))
      throw new Error(`Invalid capture role at ${index + 1}.`);
    return {
      ...p,
      captureRole: role,
      transform: pose(p.transform, `Actor ${index + 1}`),
      meshTransform: pose(p.meshTransform, `Mesh ${index + 1}`),
    };
  });
  return { ...data, placements };
}
export function zoneForCapture(data: Capture): string | null {
  const path = String(data.worldPath ?? '').toLowerCase();
  return path.includes('stonewood')
    ? 'pve_01'
    : path.includes('plankerton')
      ? 'pve_02'
      : path.includes('canny')
        ? 'pve_03'
        : path.includes('twine')
          ? 'pve_04'
          : null;
}

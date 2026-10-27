import { ArchiveReader } from './archive-reader';
import { Quaternion, Vector3 } from 'three';
import type { Capture, Placement, Pose } from '../core/save';
import { relativePose } from '../core/editor';
import catalogData from './catalog.json';
import container from './menu-container.json';
type ClassInfo = {
  classPath: string;
  meshPath: string;
  meshRelative: Pose;
  attachmentType: number;
  buildingType: number;
  resourceType: number;
  level: number;
  variants: number;
};
const catalog = catalogData as unknown as {
  classes: Record<string, ClassInfo>;
  items: Record<string, string>;
};
const zones: Record<string, string> = {
  pve_01: 'Stonewood',
  pve_02: 'Plankerton',
  pve_03: 'CannyValley',
  pve_04: 'TwinePeaks',
};
export function menuContainer(): Uint8Array {
  return Uint8Array.from(atob(container.base64), (c) => c.charCodeAt(0));
}
function defaultTrapLevel(p: Placement) {
  p.trapLevel = 50;
  p.trapLevelSource = 'default-tier-5';
  const name = p.itemPath
    ?.split('.')
    .at(-1)
    ?.replace(/_T\d{2}$/i, '_T05')
    .toLowerCase();
  if (name && catalog.items[name]) p.itemPath = catalog.items[name];
}
export function applyCloudTrapLevelFallback(data: Capture) {
  let changed = 0;
  for (const p of data.placements) {
    if (p.kind !== 'trap' || !p.cloudImport || !Array.isArray(p.cloudIssues)) continue;
    const old = p.cloudIssues as string[],
      next = old.filter(
        (s) =>
          s !== 'Cloud trap level is invalid.' &&
          s !== 'Cloud trap level could not be read. Import this trap from a menu capture.',
      );
    if (next.length !== old.length) {
      defaultTrapLevel(p);
      p.cloudIssues = next;
      changed++;
    }
  }
  return changed;
}
function compose(local: Pose, parent: Pose): Pose {
  return {
    translation: new Vector3(...local.translation)
      .multiply(new Vector3(...parent.scale))
      .applyQuaternion(new Quaternion(...parent.rotation))
      .add(new Vector3(...parent.translation))
      .toArray() as Pose['translation'],
    rotation: new Quaternion(...parent.rotation)
      .multiply(new Quaternion(...local.rotation))
      .toArray() as Pose['rotation'],
    scale: local.scale.map((v, i) => v * parent.scale[i]) as Pose['scale'],
  };
}
const identity: Pose = { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
type RecordData = {
  classPath: string;
  guid: string | null;
  pose: Pose;
  state: number;
  spawned: boolean;
  start: number;
  end: number;
  offset: number;
  issues: string[];
  encoding: string;
};
function actorRecord(r: ArchiveReader, pathStart: number, path: string): RecordData | null {
  const string = r.string(pathStart - 4);
  if (string?.value !== path || pathStart < 21) return null;
  const state = r.bytes[pathStart - 5];
  if (state > 5) return null;
  const candidates: RecordData[] = [];
  for (const [words, width] of [
    [4, 8],
    [4, 4],
    [3, 4],
    [3, 8],
  ]) {
    const after = string.next,
      spawnedAt = after + (words + 6) * width,
      sizeAt = spawnedAt + 4;
    if (sizeAt + 4 > r.bytes.length) continue;
    const read = (i: number) =>
      width === 8
        ? r.view.getFloat64(after + i * width, true)
        : r.view.getFloat32(after + i * width, true);
    const values = Array.from({ length: words + 6 }, (_, i) => read(i));
    if (!values.every(Number.isFinite)) continue;
    const norm = values.slice(0, words).reduce((sum, v) => sum + v * v, 0);
    if (Math.abs(norm - 1) > 0.00001) continue;
    const translation = values.slice(words, words + 3) as Pose['translation'],
      scale = values.slice(words + 3) as Pose['scale'];
    if (translation.some((v) => Math.abs(v) > 1000000) || scale.some((v) => Math.abs(v) > 1000))
      continue;
    const spawned = r.view.getUint32(spawnedAt, true),
      size = r.view.getUint32(sizeAt, true),
      end = sizeAt + 4 + size;
    if (spawned > 1 || end > r.bytes.length) continue;
    const issues: string[] = [];
    let rotation: Pose['rotation'];
    if (words === 4) rotation = values.slice(0, 4) as Pose['rotation'];
    else {
      if (Math.abs(values[0]) > 1e-7)
        issues.push(
          'Legacy cloud rotation contains tilt that cannot be recovered exactly. Import this piece from a menu capture.',
        );
      rotation = [0, 0, values[1], values[2]];
    }
    if (Math.abs(rotation.reduce((s, v) => s + v * v, 0) - 1) > 1e-6) {
      issues.push(
        'Cloud quaternion precision is outside the menu export tolerance. Import this piece from a menu capture.',
      );
      rotation = new Quaternion(...rotation).normalize().toArray() as Pose['rotation'];
    }
    candidates.push({
      classPath: path,
      guid: r.guid(pathStart - 21),
      pose: { translation, rotation, scale },
      state,
      spawned: !!spawned,
      start: sizeAt + 4,
      end,
      offset: pathStart,
      issues,
      encoding: `${words === 4 ? 'quaternion' : 'legacy-upright'}-float${width * 8}`,
    });
  }
  if (candidates.length > 1)
    candidates[0].issues.push(
      'Cloud actor has an ambiguous transform layout. Import this piece from a menu capture.',
    );
  return candidates[0] ?? null;
}
function canonicalPath(path: string) {
  return path.replace(/^\/Game\/Items\/Traps\//i, '/SaveTheWorld/Items/Traps/');
}
const canonicalClasses = new Map(
  Object.entries(catalog.classes).map(([key, info]) => [canonicalPath(key).toLowerCase(), info]),
);
function assetString(r: ArchiveReader, start: number, end: number, prefix: string): string | null {
  const matches = [
    ...r.text.slice(start, end).matchAll(/\/(?:Game|SaveTheWorld)\/[A-Za-z0-9_/]+\.[A-Za-z0-9_]+/g),
  ].filter((m) => m[0].split('.').at(-1)!.startsWith(prefix));
  const unique = [...new Set(matches.map((m) => m[0]))];
  return unique.length === 1 ? canonicalPath(unique[0]) : null;
}
export function convertCloudSave(bytes: Uint8Array, zoneId: string, filename: string): Capture {
  if (bytes.length > 256 * 1024 * 1024)
    throw new Error('Cloud archive exceeds the decoded size limit.');
  if (!zones[zoneId])
    throw new Error('Choose the homebase zone before importing its cloud archive.');
  const r = new ArchiveReader(bytes);
  if (!r.text.includes('SavedActors') && !r.text.includes('++Fortnite+Release'))
    throw new Error(
      'This cloud archive has no supported actor stream. It was not imported as an empty base.',
    );
  const pattern =
    /\/(?:Game\/Building\/ActorBlueprints\/Player\/[A-Za-z0-9_/]+\.PBWA_[A-Za-z0-9_]+_C|(?:SaveTheWorld|Game)\/Items\/Traps\/Blueprints\/Trap_[A-Za-z0-9_]+\.Trap_[A-Za-z0-9_]+_C)/g;
  const records: RecordData[] = [],
    unreadable: number[] = [],
    spans: {
      start: number;
      end: number;
    }[] = [];
  let match: RegExpExecArray | null,
    consumed = 0;
  while ((match = pattern.exec(r.text))) {
    if (match.index < consumed) continue;
    const record = actorRecord(r, match.index, match[0]);
    if (record) {
      consumed = record.end;
      spans.push({ start: match.index, end: record.end });
      if (record.spawned && record.state !== 3) records.push(record);
    } else if (r.string(match.index - 4)?.value === match[0] && r.bytes[match.index - 5] <= 5)
      unreadable.push(match.index);
    if (records.length > 100000) throw new Error('Cloud archive contains too many actor records.');
  }
  let spanIndex = 0;
  for (const prefix of r.text.matchAll(
    /\/(?:Game\/Building\/ActorBlueprints\/Player\/|(?:SaveTheWorld|Game)\/Items\/Traps\/Blueprints\/)/g,
  )) {
    const at = prefix.index;
    while (spanIndex < spans.length && spans[spanIndex].end <= at) spanIndex++;
    if (spans[spanIndex] && at >= spans[spanIndex].start) continue;
    if (at >= 21 && r.bytes[at - 5] <= 5) {
      const length = r.view.getInt32(at - 4, true);
      if (length > prefix[0].length && length <= 8192 && !unreadable.includes(at))
        unreadable.push(at);
    }
  }
  if (!records.length)
    throw new Error(
      unreadable.length
        ? 'The cloud actor format could not be decoded. No empty blueprint was created.'
        : 'No active player builds were found in this cloud backup.',
    );
  const session = crypto.randomUUID(),
    byGuid = new Map<string, Placement[]>(),
    pending: {
      p: Placement;
      record: RecordData;
    }[] = [],
    warnings = new Set<string>();
  const placements = records.map((record) => {
    const { start, end } = record,
      mirror = r.property('bMirrored', start, end)?.bool ?? false,
      classPath = canonicalPath(record.classPath),
      key = classPath.toLowerCase() + '|' + mirror,
      info = catalog.classes[key] ?? canonicalClasses.get(key);
    const kind = classPath.includes('/Items/Traps/') ? 'trap' : 'structure',
      issues = [...record.issues];
    if (!info)
      issues.push(
        'No verified primary-mesh mapping for this cloud class. Import its equivalent from a menu capture.',
      );
    if (info?.variants > 1)
      warnings.add(
        'Some classes have multiple observed component variants; the most common captured class default is used for the preview.',
      );
    const pose = structuredClone(record.pose),
      p: Placement = {
        actorPath: `/CloudImport/${session}/${record.guid ?? record.offset}.Placement`,
        classPath: info?.classPath ?? classPath,
        kind,
        captureRole: 'placement',
        meshPath: info?.meshPath ?? '',
        transform: pose,
        meshTransform: compose(info?.meshRelative ?? identity, pose),
        mirrored: mirror,
        savedActorGuid: record.guid ?? '00000000000000000000000000000000',
        resourceType: info?.resourceType ?? 6,
        level: info?.level ?? 0,
        buildingType: info?.buildingType ?? 10,
        attachmentType: info?.attachmentType ?? (kind === 'structure' ? 9 : -1),
        itemPath: '',
        trapLevel: 0,
        trapPerks: '',
        trapPerksStatus: kind === 'trap' ? 'not-recorded' : 'not-trap',
        trapPerksSource: 'cloud-save',
        attachment: {
          status: 'not-applicable',
          supportActorPath: '',
          side: 255,
          supportTransform: null,
          relativeTransform: null,
        },
        cloudImport: {
          recordOffset: record.offset,
          rotationEncoding: record.encoding,
          actorState: record.state,
          sourceClass: record.classPath,
          rawTransform: record.pose,
        },
        cloudIssues: issues,
      };
    if (record.guid) {
      const found = byGuid.get(record.guid) ?? [];
      found.push(p);
      byGuid.set(record.guid, found);
    }
    if (kind === 'trap') {
      p.itemPath = assetString(r, start, end, 'TID_') ?? '';
      if (!p.itemPath) {
        const short = [...new Set(r.text.slice(start, end).match(/TID_[A-Za-z0-9_]+/g) ?? [])];
        if (short.length === 1) p.itemPath = catalog.items[short[0].toLowerCase()] ?? '';
      }
      const level =
        r.property('OriginalTrapLevel', start, end) ?? r.property('TrapLevel', start, end);
      const n =
        level?.type === 'IntProperty' && level.end - level.start === 4
          ? r.view.getInt32(level.start, true)
          : NaN;
      if (Number.isInteger(n) && n >= 0 && n < 1000) p.trapLevel = n;
      else {
        defaultTrapLevel(p);
        warnings.add(
          'Unreadable trap levels default to level 50 (tier 5); known matching tier-5 item definitions are used where available.',
        );
      }
      const perks = r.property('AppliedAlterations', start, end);
      if (perks) {
        const paths: string[] = [];
        let at = perks.start,
          valid =
            perks.type === 'ArrayProperty' &&
            perks.subtype === 'ObjectProperty' &&
            at + 4 <= perks.end;
        const count = valid ? r.view.getInt32(at, true) : -1;
        at += 4;
        valid = valid && count >= 0 && count <= 64;
        if (valid)
          for (let i = 0; i < count; i++) {
            const entry = r.string(at, perks.end);
            if (
              !entry ||
              !/^\/(?:Game|SaveTheWorld)\/[A-Za-z0-9_/]+\.AID_[A-Za-z0-9_]+$/.test(entry.value)
            ) {
              valid = false;
              break;
            }
            paths.push(entry.value);
            at = entry.next;
          }
        if (valid && at === perks.end) {
          p.trapPerks = paths.length ? 'perks1;' + paths.join(';') : '';
          p.trapPerksStatus = paths.length ? 'captured' : 'empty';
        } else
          issues.push(
            'Cloud trap perks could not be decoded without loss. Import this trap from a menu capture.',
          );
      } else
        warnings.add(
          'Some trap records contain no perk array; those traps use an empty perk override, as with menu captures that did not record perks.',
        );
      pending.push({ p, record });
    }
    return p;
  });
  for (const { p, record } of pending) {
    const prop = r.property('AttachedTo', record.start, record.end);
    let parent: Placement | undefined;
    if (prop) {
      const refs = new Set<string>();
      if (prop.end - prop.start === 16) {
        const guid = r.guid(prop.start, prop.end);
        if (guid) refs.add(guid);
      }
      const text = r.string(prop.start, prop.end)?.value;
      if (text) {
        const stripped = text.replace(/[-{}]/g, '').toLowerCase();
        for (const guid of stripped.match(/(?<![a-f0-9])[a-f0-9]{32}(?![a-f0-9])/g) ?? [])
          if (byGuid.has(guid)) refs.add(guid);
      }
      const targets = [...refs]
        .flatMap((g) => byGuid.get(g) ?? [])
        .filter((s) => s.kind === 'structure');
      if (targets.length === 1) parent = targets[0];
    }
    const sideProp = r.property('AttachedToSide', record.start, record.end);
    let side = 255,
      sideSource = 'not-serialized';
    if (sideProp && sideProp.end - sideProp.start === 1 && r.bytes[sideProp.start] <= 1)
      side = r.bytes[sideProp.start];
    else if (sideProp) {
      (p.cloudIssues as string[]).push(
        'Cloud trap attachment side could not be decoded. Import this trap from a menu capture.',
      );
    } else
      warnings.add(
        'Epic did not serialize trap attachment sides. They are marked unknown (255); menu replay uses the saved support and exact world pose.',
      );
    if (sideProp) sideSource = 'saved-property';
    p.cloudImport = {
      ...(p.cloudImport as object),
      supportGuid: parent?.savedActorGuid ?? null,
      sideSource,
    };
    p.attachment = {
      status: parent ? 'resolved' : 'unresolved',
      supportActorPath: parent?.actorPath ?? '',
      side,
      supportTransform: parent ? structuredClone(parent.transform) : null,
      relativeTransform:
        parent && !parent.transform.scale.some((v) => Math.abs(v) < 1e-12)
          ? relativePose(p.transform, parent.transform)
          : null,
    };
  }
  return {
    schemaVersion: 6,
    format: 'stw-homebase-capture',
    coordinateUnit: 'unreal-world-units',
    rotationEncoding: 'quaternion-xyzw',
    worldPath: `/STW_Zones/Maps/Zones/Outpost/Zone_Outpost_${zones[zoneId]}.Zone_Outpost_${zones[zoneId]}`,
    completeHomebase: false,
    capturedCount: placements.length,
    placements,
    cloudImport: {
      filename,
      zoneId,
      source: 'Epic cloud backup',
      convertedAt: new Date().toISOString(),
      unreadableRecords: unreadable,
      warnings: [...warnings],
      meshPolicy:
        'Observed menu class component defaults; cloud saves do not contain authoritative primary mesh transforms.',
    },
    cloudIssues: unreadable.length
      ? [
          `${unreadable.length} cloud actor records could not be decoded. Import a menu capture to avoid an incomplete export.`,
        ]
      : [],
  };
}

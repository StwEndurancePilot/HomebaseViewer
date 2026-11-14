import { canonicalPath, classInfo, compose, missingMeshIssue } from './convert';
import { validateCapture, type Capture, type Placement, type Pose } from '../core/save';

export function jsonPlacements(source: unknown): unknown[] | null {
  const rows = Array.isArray(source)
    ? source
    : source && typeof source === 'object'
      ? (source as Record<string, unknown>).placements
      : null;
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows.some((p) => p && typeof p === 'object' && 'assetPath' in p) &&
    !rows.some((p) => p && typeof p === 'object' && ('transform' in p || 'meshTransform' in p))
    ? rows
    : null;
}

function vector(value: unknown, keys: string[], label: string): number[] {
  if (!value || typeof value !== 'object') throw new Error(`${label} is missing.`);
  return keys.map((key) => {
    const n = (value as Record<string, unknown>)[key];
    if (typeof n !== 'number' || !Number.isFinite(n))
      throw new Error(`${label}.${key} must be a finite number.`);
    return n;
  });
}

export function convertPlacementJson(
  source: unknown,
  rows: unknown[],
  zoneId: string,
  filename: string,
): Capture {
  if (rows.length > 100000) throw new Error('JSON contains too many placement records.');
  const metadata = source as Record<string, unknown>;
  if (metadata.coordinateUnit !== undefined && metadata.coordinateUnit !== 'unreal-world-units')
    throw new Error('Placement JSON positions must use unreal-world-units.');
  if (metadata.rotationEncoding !== undefined && metadata.rotationEncoding !== 'quaternion-xyzw')
    throw new Error('Placement JSON rotations must use quaternion-xyzw.');
  if (metadata.capturedCount !== undefined && metadata.capturedCount !== rows.length)
    throw new Error('The capture count does not match its placement records.');
  const session = crypto.randomUUID();
  const identity: Pose = { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
  const placements = rows.map((value, index): Placement => {
    const row = value as Record<string, unknown>;
    if (
      !row ||
      !['structure', 'trap'].includes(String(row.kind)) ||
      typeof row.assetPath !== 'string' ||
      !/^\/(?:Game|SaveTheWorld)\/[A-Za-z0-9_/]+\.[A-Za-z0-9_]+_C$/.test(row.assetPath)
    )
      throw new Error(
        `Invalid JSON placement ${index + 1}: expected kind and blueprint assetPath.`,
      );
    if (row.mirrored !== undefined && typeof row.mirrored !== 'boolean')
      throw new Error(`Invalid mirrored flag at placement ${index + 1}.`);
    if ((row.kind === 'trap') !== /\/Items\/Traps\//i.test(row.assetPath))
      throw new Error(`Placement ${index + 1} kind does not match its blueprint assetPath.`);
    const kind = row.kind as Placement['kind'],
      classPath = canonicalPath(row.assetPath),
      mirrored = row.mirrored === true,
      info = classInfo(classPath, mirrored),
      transform: Pose = {
        translation: vector(
          row.position,
          ['x', 'y', 'z'],
          `Placement ${index + 1} position`,
        ) as Pose['translation'],
        rotation: vector(
          row.rotationQuaternion,
          ['x', 'y', 'z', 'w'],
          `Placement ${index + 1} rotationQuaternion`,
        ) as Pose['rotation'],
        scale: vector(row.scale, ['x', 'y', 'z'], `Placement ${index + 1} scale`) as Pose['scale'],
      };
    return {
      actorPath: `/JsonImport/${session}/${index}.Placement`,
      classPath: info?.classPath ?? classPath,
      meshPath: info?.meshPath ?? '',
      kind,
      captureRole: 'placement',
      transform,
      meshTransform: compose(info?.meshRelative ?? identity, transform),
      mirrored,
      resourceType: info?.resourceType ?? 6,
      level: info?.level ?? 0,
      buildingType: info?.buildingType ?? 10,
      attachmentType: info?.attachmentType ?? (kind === 'structure' ? 9 : -1),
      itemPath: '',
      trapLevel: 0,
      trapPerks: '',
      trapPerksStatus: kind === 'trap' ? 'not-recorded' : 'not-trap',
      trapPerksSource: 'placement-json',
      attachment: {
        status: kind === 'trap' ? 'unresolved' : 'not-applicable',
        supportActorPath: '',
        side: 255,
        supportTransform: null,
        relativeTransform: null,
      },
      cloudImport: {
        source: 'placement-json',
        sourceClass: row.assetPath,
        rawTransform: transform,
      },
      cloudIssues: info ? [] : [missingMeshIssue],
    };
  });
  const zones: Record<string, string> = {
    pve_01: 'Stonewood',
    pve_02: 'Plankerton',
    pve_03: 'CannyValley',
    pve_04: 'TwinePeaks',
  };
  if (!zones[zoneId]) throw new Error('Choose the homebase zone before importing its JSON.');
  return validateCapture({
    format: 'stw-homebase-capture',
    schemaVersion: 6,
    coordinateUnit: 'unreal-world-units',
    rotationEncoding: 'quaternion-xyzw',
    worldPath: `/STW_Zones/Maps/Zones/Outpost/Zone_Outpost_${zones[zoneId]}.Zone_Outpost_${zones[zoneId]}`,
    completeHomebase: false,
    capturedCount: placements.length,
    placements,
    cloudImport: {
      filename,
      zoneId,
      source: 'Placement JSON',
      convertedAt: new Date().toISOString(),
      warnings: [
        'Mesh transforms use known class defaults. Placement JSON does not establish full capture fidelity.',
        'Trap item definitions, levels, perks and support links are not provided by this placement format. Use the original API binary download to retain serialized trap details.',
      ],
    },
  });
}

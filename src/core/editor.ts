import { Euler, Quaternion, Vector3 } from 'three';
import type { Capture, Placement, Pose } from './save';
import { meshStem } from './mesh-identity';
import { structureKind, patternOf, definitionFor, type BuildKind } from './build-pieces';
export type Attachment = {
  status: string;
  supportActorPath: string;
  side: number;
  supportTransform: Pose | null;
  relativeTransform: Pose | null;
};
export type Vec3 = [number, number, number];
export type OffsetLimit = 'placement' | 'free' | 'unrestricted';
export const OFFSET_LIMITS = {
  placement: { position: 1000, angle: 180 },
  free: { position: 2000, angle: 3600 },
  unrestricted: { position: Infinity, angle: Infinity },
};
export type Offsets = {
  position: Vec3;
  angles: Vec3;
  limit?: OffsetLimit;
  constrainZ?: boolean;
};
export const ESTIMATED_TRAP_Z = {
  floor: [-472, 472],
  ceiling: [-472, 472],
  wall: [-345, 720],
} as const;
export function trapZDeltaRange(record: Placement, support: Placement): [number, number] {
  const category = trapCategory(record);
  if (category === 'unknown') return [0, 0];
  const [min, max] = ESTIMATED_TRAP_Z[category],
    z = record.transform.translation[2] - support.transform.translation[2];
  return [Math.min(min, z) - z, Math.max(max, z) - z];
}
export function selectionZDeltaRange(records: Placement[], all: Placement[]): [number, number] {
  let min = -Infinity,
    max = Infinity;
  const byId = new Map(all.map((p) => [p.actorPath, p]));
  for (const record of records) {
    const support = byId.get(attachment(record)?.supportActorPath ?? '');
    if (!support || support.kind !== 'structure' || support.captureRole !== 'placement')
      throw new Error('Selected traps need captured building supports.');
    const range = trapZDeltaRange(record, support);
    min = Math.max(min, range[0]);
    max = Math.min(max, range[1]);
  }
  return [min, max];
}
export type Clipboard = {
  records: Placement[];
  anchor: Vec3;
  worldPath: string;
};
export type PastePlan = {
  records: Placement[];
  added: string[];
  skipped: number;
  errors: string[];
};
export const ZERO_OFFSETS: Offsets = { position: [0, 0, 0], angles: [0, 0, 0] };
const rad = Math.PI / 180;
const zeroGuid = '00000000000000000000000000000000';
export const attachment = (p: Placement) => p.attachment as Attachment | undefined;
const clone = <T>(x: T): T => structuredClone(x);
const q = (pose: Pose) => new Quaternion(...pose.rotation);
const vec = (v: readonly number[]) => new Vector3(...v);
const arr = (v: Vector3) => v.toArray() as Vec3;
const id = () => `/HomebaseEditor/${crypto.randomUUID().replaceAll('-', '')}.Placement`;
export function unrealRotator(pitch: number, yaw: number, roll: number): Pose['rotation'] {
  return new Quaternion()
    .setFromAxisAngle(new Vector3(0, 0, 1), yaw * rad)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -pitch * rad))
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -roll * rad))
    .toArray() as Pose['rotation'];
}
export function relativePose(child: Pose, parent: Pose): Pose {
  if (parent.scale.some((s) => Math.abs(s) < 1e-12))
    throw new Error('Cannot attach to a zero-scale support.');
  return {
    translation: arr(
      vec(child.translation)
        .sub(vec(parent.translation))
        .applyQuaternion(q(parent).invert())
        .divide(vec(parent.scale)),
    ),
    rotation: q(parent).invert().multiply(q(child)).toArray() as Pose['rotation'],
    scale: child.scale.map((s, i) => s / parent.scale[i]) as Vec3,
  };
}
function composedPose(local: Pose, parent: Pose): Pose {
  return {
    translation: arr(
      vec(local.translation)
        .multiply(vec(parent.scale))
        .applyQuaternion(q(parent))
        .add(vec(parent.translation)),
    ),
    rotation: q(parent).multiply(q(local)).toArray() as Pose['rotation'],
    scale: local.scale.map((s, i) => s * parent.scale[i]) as Vec3,
  };
}
function rigidPose(p: Pose, anchor: Vec3, destination: Vec3, rotation: Quaternion): Pose {
  if (rotation.x === 0 && rotation.y === 0 && rotation.z === 0 && rotation.w === 1)
    return {
      ...clone(p),
      translation: p.translation.map((v, i) => v + (destination[i] - anchor[i])) as Vec3,
    };
  return {
    translation: arr(
      vec(p.translation).sub(vec(anchor)).applyQuaternion(rotation).add(vec(destination)),
    ),
    rotation: rotation.clone().multiply(q(p)).toArray() as Pose['rotation'],
    scale: [...p.scale],
  };
}
export function withOffsets(record: Placement, offsets: Offsets, support: Placement): Placement {
  const limit = OFFSET_LIMITS[offsets.limit ?? 'free'];
  if (![...offsets.position, ...offsets.angles].every(Number.isFinite))
    throw new Error('Offsets must be finite numbers.');
  if (
    offsets.position.some((n) => Math.abs(n) > limit.position) ||
    offsets.angles.some((n) => Math.abs(n) > limit.angle)
  )
    throw new Error(
      `This edit is limited to ±${limit.position} cm per axis and ±${limit.angle}° per angle.`,
    );
  if (offsets.constrainZ) {
    const [min, max] = trapZDeltaRange(record, support),
      z = offsets.position[2];
    if (z < min - 1e-7 || z > max + 1e-7)
      throw new Error(
        `Estimated ${trapCategory(record)} trap Z limit: this trap can move ${min.toFixed(2)} to ${max.toFixed(2)} cm vertically from its current position. Disable Constrain Z for unrestricted editing.`,
      );
  }
  const result = clone(record),
    euler = new Euler().setFromQuaternion(q(record.transform), 'ZYX');
  const hasAngles = offsets.angles.some((v) => v !== 0);
  const rotation = hasAngles
    ? new Quaternion(
        ...unrealRotator(
          -euler.y / rad + offsets.angles[0],
          euler.z / rad + offsets.angles[1],
          -euler.x / rad + offsets.angles[2],
        ),
      )
    : q(record.transform);
  const delta = hasAngles
    ? rotation.clone().multiply(q(record.transform).invert())
    : new Quaternion();
  const destination = arr(vec(record.transform.translation).add(vec(offsets.position)));
  result.transform = rigidPose(record.transform, record.transform.translation, destination, delta);
  result.meshTransform = rigidPose(
    record.meshTransform,
    record.transform.translation,
    destination,
    delta,
  );
  if (
    [result.transform, result.meshTransform].some(
      (p) => ![...p.translation, ...p.rotation, ...p.scale].every(Number.isFinite),
    )
  )
    throw new Error('The offset exceeds the finite transform range.');
  result.attachment = {
    ...attachment(record),
    status: 'resolved',
    supportActorPath: support.actorPath,
    supportTransform: clone(support.transform),
    relativeTransform: relativePose(result.transform, support.transform),
  };
  result.editorPlacementMode = 'menu-offset';
  return result;
}
export function shapeOf(p: Placement): 'floor' | 'wall' | 'other' {
  const known = structureKind(p);
  if (known === 'floor' || known === 'wall') return known;
  const stem = meshStem(p.meshPath);
  return /^pbw_[wbm][123]_floor(?:_2)?$/.test(stem)
    ? 'floor'
    : /^pbw_[wbm][123]_solid$/.test(stem)
      ? 'wall'
      : 'other';
}
export function trapCategory(p: Placement): 'floor' | 'wall' | 'ceiling' | 'unknown' {
  const path = `${p.classPath} ${p.itemPath ?? ''}`.toLowerCase();
  return /trap_wall_|tid_wall_/.test(path)
    ? 'wall'
    : /trap_ceiling_|tid_ceiling_/.test(path)
      ? 'ceiling'
      : /trap_floor_|tid_floor_/.test(path)
        ? 'floor'
        : 'unknown';
}
function standardSupport(p: Placement, full = true) {
  const cone = patternOf(p)?.id === 'RoofS';
  if (full && structureKind(p) === 'roof' && !cone)
    throw new Error(
      'Edit the cone into a ramp (Sloped roof: two adjacent raised corners) before placing a trap.',
    );
  if (
    p.kind !== 'structure' ||
    p.captureRole !== 'placement' ||
    (shapeOf(p) === 'other' && !cone && (full || !structureKind(p)))
  )
    throw new Error('Point at a supported player-built piece.');
  if (full && !cone && patternOf(p) && !['Solid', 'Floor'].includes(patternOf(p)!.id))
    throw new Error('Traps require a full floor, a cone edited into a ramp, or a solid wall.');
  const up = vec([0, 0, 1]).applyQuaternion(q(p.transform));
  const forward = vec([1, 0, 0]).applyQuaternion(q(p.transform));
  if (
    p.transform.scale.some(
      (v, i) => Math.abs(((!full || cone) && i === 0 ? Math.abs(v) : v) - 1) > 1e-6,
    ) ||
    up.distanceTo(vec([0, 0, 1])) > 1e-6 ||
    Math.min(Math.abs(forward.x), Math.abs(forward.y)) > 1e-6
  )
    throw new Error(
      'Standard placement needs an upright, unit-scale support at a 90° orientation. Use copy/paste to preserve unusual captured builds.',
    );
}
export function buildingRecord(
  kind: BuildKind,
  material: 0 | 1 | 2,
  tier: 1 | 2 | 3,
  pose: Pose,
): Placement {
  if (kind === 'stair' || kind === 'roof') {
    const base = buildingRecord('floor', material, tier, pose),
      def = definitionFor(kind === 'stair' ? 'StairW' : 'RoofC', material, tier);
    return {
      ...base,
      classPath: def.classPath,
      meshPath: def.meshPath,
      buildingType: kind === 'stair' ? 5 : 6,
    };
  }
  const actorLetter = ['W', 'S', 'M'][material],
    meshLetter = ['W', 'B', 'M'][material],
    folder = ['Wood', 'Stone', 'Metal'][material];
  const shape = kind === 'wall' ? 'Solid' : material === 2 && tier === 3 ? 'Floor_2' : 'Floor';
  const actor = `PBWA_${actorLetter}${tier}_${shape}`,
    mesh = `PBW_${meshLetter}${tier}_${kind === 'wall' ? 'Solid' : 'Floor'}`;
  return {
    kind: 'structure',
    captureRole: 'placement',
    actorPath: id(),
    classPath: `/Game/Building/ActorBlueprints/Player/${folder}/L${tier}/${actor}.${actor}_C`,
    meshPath: `/Game/Packages/PBW/${['Wood', 'Brick', 'Metal'][material]}/L${tier}/${mesh}.${mesh}`,
    itemPath: '',
    savedActorGuid: zeroGuid,
    resourceType: material,
    level: tier - 1,
    buildingType: kind === 'wall' ? 0 : 1,
    attachmentSlot: kind === 'wall' ? 1 : 0,
    attachmentType: 9,
    trapLevel: 0,
    trapPerks: '',
    trapPerksStatus: 'not-trap',
    trapPerksSource: 'none',
    mirrored: false,
    transform: clone(pose),
    meshTransform: clone(pose),
    attachment: {
      status: 'not-applicable',
      supportActorPath: '',
      side: 255,
      supportTransform: null,
      relativeTransform: null,
    },
    editorPlacementMode: 'standard',
  };
}
export function placeStructure(
  support: Placement,
  kind: BuildKind,
  direction: string,
  material: 0 | 1 | 2,
  tier: 1 | 2 | 3,
): Placement {
  standardSupport(support, false);
  const parentShape = structureKind(support) === 'wall' ? 'wall' : 'floor';
  if (kind === 'stair' || kind === 'roof') {
    const pose = clone(support.transform);
    pose.scale = [1, 1, 1];
    const z = direction === 'below' ? -384 : direction === 'above' ? 384 : 0;
    pose.translation[2] += z;
    return buildingRecord(kind, material, tier, pose);
  }
  let offset: Vec3 = [0, 0, 0],
    yaw = 0;
  if (kind === 'wall' && parentShape === 'floor') {
    const choices: Record<string, [Vec3, number]> = {
      south: [[0, 0, 0], 0],
      north: [[0, 512, 0], 180],
      east: [[256, 256, 0], 90],
      west: [[-256, 256, 0], 270],
    };
    const edge = direction.replace(/-below$/, '');
    if (!choices[edge]) throw new Error('Choose a floor edge: north, east, south or west.');
    [offset, yaw] = choices[edge];
    if (direction.endsWith('-below')) offset = [offset[0], offset[1], -384];
  } else if (kind === 'floor' && parentShape === 'floor') {
    const choices: Record<string, Vec3> = {
      north: [0, 512, 0],
      south: [0, -512, 0],
      east: [512, 0, 0],
      west: [-512, 0, 0],
      above: [0, 0, 384],
      below: [0, 0, -384],
    };
    if (!choices[direction])
      throw new Error('Floors extend horizontally from an existing full floor.');
    offset = choices[direction];
  } else if (kind === 'wall' && parentShape === 'wall') {
    const choices: Record<string, Vec3> = {
      above: [0, 0, 384],
      below: [0, 0, -384],
      east: [512, 0, 0],
      west: [-512, 0, 0],
    };
    if (!choices[direction])
      throw new Error('Extend this wall above, east or west (relative to its orientation).');
    offset = choices[direction];
  } else if (kind === 'floor' && parentShape === 'wall') {
    const choices: Record<string, Vec3> = {
      above: [0, 0, 384],
      below: [0, 0, 0],
      'above-back': [0, -512, 384],
      'below-back': [0, -512, 0],
    };
    if (!choices[direction]) throw new Error('Choose the top or base of the wall.');
    offset = choices[direction];
  }
  const pose: Pose = {
    translation: arr(
      vec(offset).applyQuaternion(q(support.transform)).add(vec(support.transform.translation)),
    ),
    rotation: q(support.transform)
      .multiply(new Quaternion(...unrealRotator(0, yaw, 0)))
      .toArray() as Pose['rotation'],
    scale: [1, 1, 1],
  };
  return buildingRecord(kind, material, tier, pose);
}
export function placeTrap(
  template: Placement,
  support: Placement,
  turn: number,
  side: 0 | 1,
  offsets: Offsets,
  mode: 'standard' | 'menu-offset',
  inverted = false,
  autoFitCone = true,
): Placement {
  standardSupport(support);
  const category = trapCategory(template),
    rampCone = patternOf(support)?.id === 'RoofS',
    fitCone = rampCone && autoFitCone,
    shape = rampCone ? 'floor' : shapeOf(support);
  if (template.kind !== 'trap' || !template.itemPath)
    throw new Error('Choose a captured trap variant with a valid item definition.');
  if (category === 'unknown')
    throw new Error(
      'This trap family has no verified floor/wall/ceiling rule. Copy its existing placement instead.',
    );
  if (category === 'wall' ? shape !== 'wall' : shape !== 'floor')
    throw new Error(
      `${category} traps require a ${category === 'wall' ? 'solid wall support' : 'full floor support or cone edited into a ramp'}.`,
    );
  if (!Number.isFinite(turn) || turn % 90 !== 0)
    throw new Error('Standard trap orientation must use 90° steps.');
  const result = clone(template);
  result.actorPath = id();
  result.savedActorGuid = zeroGuid;
  result.mirrored = false;
  result.captureRole = 'placement';
  delete result.perkReadProbe;
  if (result.trapPerksStatus !== 'observed-effects') delete result.trapEffectSources;
  const orientation = q(support.transform).multiply(
    new Quaternion(...unrealRotator(0, category === 'wall' ? side * 180 : turn, 0)),
  );
  if (inverted && !fitCone) {
    if (category !== 'ceiling') throw new Error('The upside-down preset requires a ceiling trap.');
    orientation.multiply(new Quaternion(0, -1, 0, 0));
  }
  let origin = vec(support.transform.translation);
  if (category !== 'wall') {
    const center = vec([0, 256, 0]).applyQuaternion(q(support.transform)).add(origin);
    const centrePivot = /patrol_ward_trap/i.test(result.meshPath);
    origin = centrePivot ? center : center.sub(vec([0, 256, 0]).applyQuaternion(orientation));
  }
  const pose: Pose = {
    translation: arr(origin),
    rotation: orientation.toArray() as Pose['rotation'],
    scale: [1, 1, 1],
  };
  result.transform = clone(pose);
  result.meshTransform = composedPose(
    relativePose(template.meshTransform, template.transform),
    pose,
  );
  result.attachment = {
    status: 'resolved',
    supportActorPath: support.actorPath,
    side: category === 'wall' ? side : category === 'ceiling' ? 1 : 0,
    supportTransform: clone(support.transform),
    relativeTransform: relativePose(pose, support.transform),
  };
  result.editorPlacementMode = inverted ? 'menu-offset' : mode;
  if (mode === 'standard' && [...offsets.position, ...offsets.angles].some((v) => v !== 0))
    throw new Error('Enable Menu offsets to apply XYZ or angle offsets.');
  const fitted = fitCone
    ? withOffsets(
        result,
        {
          position: arr(vec([0, -512, 0]).applyQuaternion(q(support.transform)).setZ(-91)),
          angles: [0, 180, 180],
        },
        support,
      )
    : result;
  return mode === 'menu-offset' ? withOffsets(fitted, offsets, support) : fitted;
}
export function flipCeilingTrap(record: Placement, support: Placement): Placement {
  if (record.kind !== 'trap' || trapCategory(record) !== 'ceiling')
    throw new Error('Select ceiling traps to flip upside down.');
  const result = clone(record),
    rotation = q(record.transform).multiply(new Quaternion(0, -1, 0, 0));
  const delta = rotation.clone().multiply(q(record.transform).invert());
  result.transform = {
    ...clone(record.transform),
    rotation: rotation.toArray() as Pose['rotation'],
  };
  result.meshTransform = rigidPose(
    record.meshTransform,
    record.transform.translation,
    record.transform.translation,
    delta,
  );
  result.attachment = {
    ...attachment(record),
    status: 'resolved',
    supportActorPath: support.actorPath,
    side: 1,
    supportTransform: clone(support.transform),
    relativeTransform: relativePose(result.transform, support.transform),
  };
  result.editorPlacementMode = 'menu-offset';
  return result;
}
function samePose(a: Pose, b: Pose, epsilon = 1e-5) {
  return (
    vec(a.translation).distanceTo(vec(b.translation)) < epsilon &&
    a.scale.every((v, i) => Math.abs(v - b.scale[i]) < epsilon) &&
    1 - Math.abs(q(a).dot(q(b))) < epsilon
  );
}
function buildingCentre(p: Placement) {
  return (structureKind(p) && structureKind(p) !== 'wall') || shapeOf(p) === 'floor'
    ? vec([0, 256, 0]).applyQuaternion(q(p.transform)).add(vec(p.transform.translation))
    : vec(p.transform.translation);
}
export function placementConflict(p: Placement, rows: Placement[]): string | null {
  for (const other of rows) {
    if (
      other.actorPath === p.actorPath ||
      other.captureRole !== 'placement' ||
      other.kind !== p.kind
    )
      continue;
    if (
      p.kind === 'structure' &&
      (structureKind(p) || shapeOf(p) !== 'other') &&
      (structureKind(p) ?? shapeOf(p)) === (structureKind(other) ?? shapeOf(other))
    ) {
      if (buildingCentre(p).distanceTo(buildingCentre(other)) < 0.01) {
        if (
          (structureKind(p) !== 'wall' && shapeOf(p) !== 'wall') ||
          Math.abs(
            vec([1, 0, 0])
              .applyQuaternion(q(p.transform))
              .dot(vec([1, 0, 0]).applyQuaternion(q(other.transform))),
          ) >
            1 - 1e-6
        )
          return 'A building already occupies that floor tile or wall edge.';
      }
    } else if (
      p.kind === 'trap' &&
      trapCategory(p) === trapCategory(other) &&
      samePose(p.transform, other.transform)
    )
      return 'A trap of this support category already occupies that exact position and orientation.';
    if (
      p.kind === 'trap' &&
      p.editorPlacementMode === 'standard' &&
      attachment(p)?.supportActorPath === attachment(other)?.supportActorPath &&
      attachment(p)?.side === attachment(other)?.side
    )
      return 'That support face already has a trap. Choose the other face or use Menu offsets for a distinct offset placement.';
  }
  return null;
}
export function copyGroup(data: Capture, selected: ReadonlySet<string>): Clipboard {
  if (!selected.size) throw new Error('Select pieces to copy.');
  const byId = new Map(data.placements.map((p) => [p.actorPath, p])),
    ids = new Set(selected);
  for (const p of data.placements)
    if (p.kind === 'trap' && ids.has(attachment(p)?.supportActorPath ?? '')) ids.add(p.actorPath);
  for (const key of [...ids]) {
    const p = byId.get(key);
    if (!p) throw new Error('A selected actor no longer exists.');
    if (p.captureRole !== 'placement')
      throw new Error('Fixed world scenery and unavailable records cannot be copied as builds.');
    if (p.kind === 'trap') {
      const parent = byId.get(attachment(p)?.supportActorPath ?? '');
      if (!parent || parent.kind !== 'structure' || parent.captureRole !== 'placement')
        throw new Error(
          'A selected trap has no captured player-built support. It cannot be safely relocated.',
        );
      ids.add(parent.actorPath);
    }
  }
  const records = data.placements.filter((p) => ids.has(p.actorPath));
  const anchor = byId.get(selected.values().next().value!)!.transform.translation;
  return { records: clone(records), anchor: [...anchor], worldPath: data.worldPath };
}
export function planPaste(
  data: Capture,
  clipboard: Clipboard,
  destination: Vec3,
  yaw: number,
  snap: boolean,
): PastePlan {
  if (![...destination, yaw].every(Number.isFinite) || yaw % 90 !== 0)
    throw new Error('Paste rotation must use 90° steps and finite anchor coordinates.');
  const at = destination.map((v, i) =>
    snap
      ? clipboard.anchor[i] +
        Math.round((v - clipboard.anchor[i]) / (i === 2 ? 384 : 512)) * (i === 2 ? 384 : 512)
      : v,
  ) as Vec3;
  const rotation = new Quaternion(...unrealRotator(0, yaw, 0)),
    remap = new Map<string, string>();
  const all = clipboard.records.map((original) => {
    const p = clone(original);
    remap.set(original.actorPath, (p.actorPath = id()));
    p.savedActorGuid = zeroGuid;
    p.transform = rigidPose(p.transform, clipboard.anchor, at, rotation);
    p.meshTransform = rigidPose(p.meshTransform, clipboard.anchor, at, rotation);
    delete p.perkReadProbe;
    if (p.trapPerksStatus !== 'observed-effects') delete p.trapEffectSources;
    p.editorPlacementMode = 'copied';
    return { original, p };
  });
  const result: PastePlan = { records: [], added: [], skipped: 0, errors: [] };
  for (const { original, p } of all.filter((x) => x.p.kind === 'structure')) {
    const equivalent = data.placements.find(
      (t) =>
        t.kind === 'structure' &&
        t.captureRole === 'placement' &&
        t.classPath === p.classPath &&
        t.meshPath === p.meshPath &&
        Boolean(t.mirrored) === Boolean(p.mirrored) &&
        samePose(t.transform, p.transform) &&
        samePose(t.meshTransform, p.meshTransform),
    );
    if (equivalent) {
      remap.set(original.actorPath, equivalent.actorPath);
      result.skipped++;
      continue;
    }
    const conflict = placementConflict(p, [...data.placements, ...result.records]);
    if (conflict) result.errors.push(`${meshStem(p.meshPath)}: ${conflict}`);
    result.records.push(p);
    result.added.push(p.actorPath);
  }
  for (const { p, original } of all.filter((x) => x.p.kind === 'trap')) {
    const supportId = remap.get(attachment(original)?.supportActorPath ?? '');
    const parent = [...data.placements, ...result.records].find(
      (t) => t.actorPath === supportId && t.kind === 'structure',
    );
    if (!parent) {
      result.errors.push('A copied trap lost its captured support.');
      continue;
    }
    p.attachment = {
      ...attachment(original),
      status: 'resolved',
      supportActorPath: parent.actorPath,
      supportTransform: clone(parent.transform),
      relativeTransform: relativePose(p.transform, parent.transform),
    };
    const equivalent = data.placements.find(
      (t) =>
        t.kind === 'trap' &&
        t.itemPath === p.itemPath &&
        t.trapPerks === p.trapPerks &&
        t.trapLevel === p.trapLevel &&
        attachment(t)?.supportActorPath === parent.actorPath &&
        samePose(t.transform, p.transform) &&
        samePose(t.meshTransform, p.meshTransform),
    );
    if (equivalent) {
      result.skipped++;
      continue;
    }
    const conflict = placementConflict(p, [...data.placements, ...result.records]);
    if (conflict) result.errors.push(`${meshStem(p.meshPath)}: ${conflict}`);
    result.records.push(p);
    result.added.push(p.actorPath);
  }
  return result;
}
export type ExportIssue = {
  code: string;
  message: string;
  actorPaths: string[];
};
export function exportDiagnostics(data: Capture): ExportIssue[] {
  const issues: ExportIssue[] = [],
    byId = new Map(data.placements.map((p) => [p.actorPath, p]));
  const add = (code: string, message: string, ...actorPaths: string[]) =>
    issues.push({ code, message, actorPaths: [...new Set(actorPaths)] });
  if (Array.isArray(data.cloudIssues))
    for (const message of data.cloudIssues)
      if (typeof message === 'string') add('cloud-conversion', message);
  if (byId.size !== data.placements.length) {
    const counts = new Map<string, number>();
    for (const p of data.placements) counts.set(p.actorPath, (counts.get(p.actorPath) ?? 0) + 1);
    for (const [id, count] of counts)
      if (count > 1)
        add('duplicate-actor', `Duplicate actor identity (${count} pieces share it).`, id);
  }
  if (!data.placements.some((p) => p.captureRole === 'placement'))
    add('empty-blueprint', 'Blueprint has no build placements.');
  const trapTypes = new Set(
    data.placements
      .filter((p) => p.captureRole === 'placement' && p.kind === 'trap')
      .map((p) => (p.itemPath || p.classPath).split('.').at(-1)!.toLowerCase()),
  );
  if (trapTypes.size > 64)
    add('trap-row-limit', `${trapTypes.size} trap definitions; the menu supports at most 64.`);
  for (const p of data.placements) {
    if (p.captureRole !== 'placement') continue;
    if (Array.isArray(p.cloudIssues))
      for (const message of p.cloudIssues)
        if (typeof message === 'string') add('cloud-conversion', message, p.actorPath);
    if (!p.classPath || !p.meshPath)
      add('missing-path', 'Missing class or mesh path.', p.actorPath);
    if (p.mirrored !== undefined && typeof p.mirrored !== 'boolean')
      add('invalid-mirror', 'Invalid mirrored state.', p.actorPath);
    if (p.kind === 'structure' && ![0, 1, 2].includes(Number(p.resourceType ?? 0)))
      add('invalid-material', 'Building material must be wood, brick or metal.', p.actorPath);
    for (const [name, pose] of [
      ['Actor', p.transform],
      ['Mesh', p.meshTransform],
    ] as const)
      if (
        ![...pose.translation, ...pose.rotation, ...pose.scale].every(Number.isFinite) ||
        Math.abs(pose.rotation.reduce((sum, v) => sum + v * v, 0) - 1) > 1e-6
      )
        add('invalid-transform', `${name} has an invalid transform.`, p.actorPath);
    if (p.kind === 'trap') {
      const a = attachment(p),
        parent = byId.get(a?.supportActorPath ?? '');
      if (!p.itemPath) add('missing-item', 'Missing trap item definition.', p.actorPath);
      if (
        !Number.isInteger(p.attachmentType) ||
        Number(p.attachmentType) < 0 ||
        Number(p.attachmentType) > 255
      )
        add('invalid-attachment-type', 'Missing or invalid trap attachment type.', p.actorPath);
      if (
        a?.status !== 'resolved' ||
        !parent ||
        parent.kind !== 'structure' ||
        parent.captureRole !== 'placement'
      )
        add(
          'missing-support',
          'Missing player-built support; menu replay cannot resolve it.',
          p.actorPath,
        );
      else if (parent.transform.scale.some((v) => Math.abs(v) < 1e-12))
        add(
          'zero-scale-support',
          'Support has zero scale; the trap attachment cannot be exported.',
          p.actorPath,
          parent.actorPath,
        );
    }
  }
  return issues;
}
export function exportIssues(data: Capture): string[] {
  return exportDiagnostics(data).map(
    (issue) =>
      `${issue.actorPaths.length ? issue.actorPaths.join(', ') + ': ' : ''}${issue.message}`,
  );
}

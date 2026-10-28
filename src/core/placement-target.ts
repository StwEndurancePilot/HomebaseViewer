import { Quaternion, Vector3 } from 'three';
import type { Placement } from './save';
import { buildingRecord, shapeOf, type Vec3 } from './editor';
import { structureKind } from './build-pieces';

export function groundSupport(point: Vec3, records: Placement[]): Placement {
  const reference = records.find((p) => {
    if (p.captureRole !== 'placement' || !structureKind(p)) return false;
    const rotation = new Quaternion(...p.transform.rotation);
    const up = new Vector3(0, 0, 1).applyQuaternion(rotation);
    const forward = new Vector3(1, 0, 0).applyQuaternion(rotation);
    return (
      p.transform.scale.every((v) => Math.abs(Math.abs(v) - 1) < 1e-6) &&
      up.z > 1 - 1e-6 &&
      Math.min(Math.abs(forward.x), Math.abs(forward.y)) < 1e-6
    );
  });
  const origin = new Vector3(...(reference?.transform.translation ?? [0, 0, 0]));
  const rotation = new Quaternion(...(reference?.transform.rotation ?? [0, 0, 0, 1]));
  const local = new Vector3(...point).sub(origin).applyQuaternion(rotation.clone().invert());
  local.set(
    Math.round(local.x / 512) * 512,
    Math.floor(local.y / 512) * 512,
    Math.round(local.z / 384) * 384,
  );
  return buildingRecord('floor', 0, 1, {
    translation: local.applyQuaternion(rotation).add(origin).toArray() as Vec3,
    rotation: rotation.toArray() as Placement['transform']['rotation'],
    scale: [1, 1, 1],
  });
}
function localPoint(support: Placement, world: Vec3) {
  return new Vector3(...world)
    .sub(new Vector3(...support.transform.translation))
    .applyQuaternion(new Quaternion(...support.transform.rotation).invert());
}
export function directionAt(
  support: Placement,
  world: Vec3,
  kind: 'wall' | 'floor',
  cycle = 0,
  vertical: 'auto' | 'above' | 'below' | 'beside' = 'auto',
  camera?: Vec3,
): string {
  const point = localPoint(support, world);
  if (shapeOf(support) === 'wall') {
    if (kind === 'floor')
      return (
        (vertical === 'above'
          ? 'above'
          : vertical === 'below'
            ? 'below'
            : point.z < 192
              ? 'below'
              : 'above') + (camera && localPoint(support, camera).y < 0 ? '-back' : '')
      );
    if (vertical === 'above' || vertical === 'below') return vertical;
    const options = ['east', 'above', 'west', 'below'];
    const base =
      vertical !== 'beside' && point.z > 288
        ? 'above'
        : vertical !== 'beside' && point.z < 96
          ? 'below'
          : point.x >= 0
            ? 'east'
            : 'west';
    return options[(options.indexOf(base) + (cycle % 4) + 4) % 4];
  }
  if (kind === 'floor' && (vertical === 'above' || vertical === 'below')) return vertical;
  const x = point.x,
    y = point.y - 256;
  const base = Math.abs(x) > Math.abs(y) ? (x >= 0 ? 'east' : 'west') : y >= 0 ? 'north' : 'south';
  const edges = ['north', 'east', 'south', 'west'];
  const below =
    kind === 'wall' &&
    (vertical === 'below' || (vertical === 'auto' && camera && localPoint(support, camera).z < 0));
  return edges[(edges.indexOf(base) + (cycle % 4) + 4) % 4] + (below ? '-below' : '');
}
export function wallFaceAt(support: Placement, camera: Vec3, flipped = false): 0 | 1 {
  const side = localPoint(support, camera).y >= 0 ? 0 : 1;
  return (flipped ? 1 - side : side) as 0 | 1;
}

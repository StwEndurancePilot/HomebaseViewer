import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Placement } from '../core/save';
import { meshStem } from '../core/mesh-identity';
import { sceneMatrix } from '../core/transforms';
import { isMapBuilding } from '../core/support';

export function worldSupportAt(
  name: string,
  matrix: Matrix4,
  records: Placement[],
  zoneId?: string | null,
): Placement | null {
  const matches = records.filter(
    (p) =>
      p.captureRole === 'existing-world' &&
      p.kind === 'structure' &&
      meshStem(p.meshPath) === name.toLowerCase() &&
      sceneMatrix(p.meshTransform).elements.every(
        (value, i) => Math.abs(value - matrix.elements[i]) < 1e-4,
      ),
  );
  if (matches.length) return matches.length === 1 ? matches[0] : null;
  if (
    !zoneId ||
    !/^pve_0[1-4]$/.test(zoneId) ||
    !isMapBuilding(name) ||
    !matrix.elements.every(Number.isFinite) ||
    Math.abs(matrix.determinant()) < 1e-12
  )
    return null;
  const position = new Vector3(),
    rotation = new Quaternion(),
    scale = new Vector3();
  matrix.decompose(position, rotation, scale);
  const pose: Placement['transform'] = {
    translation: [-position.z * 512, position.x * 512, position.y * 512],
    rotation: [rotation.z, -rotation.x, -rotation.y, rotation.w],
    scale: [scale.z, scale.x, scale.y],
  };
  return {
    actorPath: `/HomebaseEditor/MapSurface/${zoneId}/${encodeURIComponent(name.toLowerCase())}/${matrix.elements.join(',')}`,
    kind: 'structure',
    captureRole: 'existing-world',
    classPath: '',
    meshPath: name,
    transform: pose,
    meshTransform: structuredClone(pose),
    editorMapSupport: { source: 'bundled-map', zoneId, meshName: name },
  };
}

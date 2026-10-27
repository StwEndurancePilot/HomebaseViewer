import * as THREE from 'three';
import { loadOutpostModels } from './build-library';
import { OUTPOST_ZONE_TERRAIN } from './zones';
import { WALKABLE } from './walk';

export async function addZoneObjectives(
  zoneId: string,
  group: THREE.Group,
  isDisposed: () => boolean,
) {
  const terrain = OUTPOST_ZONE_TERRAIN[zoneId];
  if (!terrain) return;
  const library = await loadOutpostModels();
  if (isDisposed()) return;
  const placements = new Map<string, number[][]>([
    ['stormshield', terrain.stormShield ? [terrain.stormShield] : []],
    ['stormshieldtop', terrain.stormShield ? [terrain.stormShield] : []],
    ['amplifier', terrain.amplifiers ?? []],
    ['amplifierfloor', terrain.amplifiers ?? []],
  ]);
  for (const [name, positions] of placements) {
    if (!positions.length) continue;
    const parts = library.get(name);
    if (!parts?.length) throw new Error(`Missing outpost model: ${name}`);
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, positions.length);
      mesh.name = name;
      positions.forEach(([x, y, z, yaw = 0], index) => {
        const matrix = new THREE.Matrix4().makeRotationY(-THREE.MathUtils.degToRad(yaw));
        matrix.setPosition(y, z, -x);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData[WALKABLE] = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
}

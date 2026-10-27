import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { pennyTrapPivotOffset } from '../src/core/trap-pivots';
const bytes = readFileSync(
  new URL('../assets/outpost-game/recovered-traps/traps.glb', import.meta.url),
);
const model = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
function inspect(
  index: number,
  parent = new Matrix4(),
): {
  bounds: Box3;
  meshes: string[];
} {
  const n = model.nodes[index],
    matrix = parent
      .clone()
      .multiply(
        new Matrix4().compose(
          new Vector3(...(n.translation ?? [0, 0, 0])),
          new Quaternion(...(n.rotation ?? [0, 0, 0, 1])),
          new Vector3(...(n.scale ?? [1, 1, 1])),
        ),
      );
  const bounds = new Box3(),
    meshes: string[] = [];
  if (n.mesh !== undefined) {
    const mesh = model.meshes[n.mesh];
    meshes.push(mesh.name);
    for (const p of mesh.primitives) {
      const a = model.accessors[p.attributes.POSITION];
      bounds.union(new Box3(new Vector3(...a.min), new Vector3(...a.max)).applyMatrix4(matrix));
    }
  }
  for (const child of n.children ?? []) {
    const r = inspect(child, matrix);
    bounds.union(r.bounds);
    meshes.push(...r.meshes);
  }
  return { bounds, meshes };
}
const group = (name: string) =>
  inspect(model.nodes.findIndex((n: { name: string }) => n.name === name));
it('keeps recovered floor meshes on the native tile-edge pivot without a Penny offset', () => {
  for (const name of ['s_floor_healthsquare', 'sm_flame_grill_trap']) {
    const { bounds, meshes } = group(name),
      center = bounds.getCenter(new Vector3()),
      size = bounds.getSize(new Vector3());
    expect(meshes).toHaveLength(1);
    expect(center.x).toBeCloseTo(0.5, 3);
    expect(center.z).toBeCloseTo(0, 3);
    expect(size.x).toBeCloseTo(1, 2);
    expect(size.z).toBeCloseTo(1, 2);
    expect(pennyTrapPivotOffset(name)).toEqual([0, 0, 0]);
  }
});
it('includes the anti-air body, elevated head and attached ammo display at the native centre pivot', () => {
  const { bounds, meshes } = group('patrol_ward_trap_base');
  expect(meshes).toEqual([
    'Patrol_Ward_Trap_base',
    'Patrol_Ward_Trap_core',
    'Patrol_Ward_Trap_turrethead',
    'SM_Turret_Gun_Ammo',
  ]);
  expect(bounds.max.y).toBeGreaterThan(0.2);
  expect(bounds.max.y).toBeLessThan(0.3);
  expect(bounds.min.x).toBeCloseTo(-0.112, 2);
  expect(bounds.max.x).toBeCloseTo(0.112, 2);
  expect(pennyTrapPivotOffset('patrol_ward_trap_base')).toEqual([0, 0, 0]);
});
it('embeds original textures and high-detail geometry without external asset URLs', () => {
  expect(model.images.length).toBe(11);
  for (const image of model.images) {
    expect(image.uri).toBeUndefined();
    expect(image.mimeType).toBe('image/png');
    expect(model.bufferViews[image.bufferView].byteLength).toBeGreaterThan(0);
  }
  for (const stem of [
    'S_Floor_HealthSquare',
    'Patrol_Ward_Trap_core',
    'Patrol_Ward_Trap_turrethead',
  ]) {
    const m = model.meshes.find((m: { name: string }) => m.name === stem);
    expect(model.accessors[m.primitives[0].attributes.POSITION].count).toBeGreaterThan(2500);
    expect(m.primitives[0].attributes.COLOR_0).toBeUndefined();
    expect(m.primitives[0].attributes._UE_COLOR_0).toBeDefined();
    expect(
      model.materials[m.primitives[0].material].pbrMetallicRoughness.baseColorTexture,
    ).toBeDefined();
  }
});

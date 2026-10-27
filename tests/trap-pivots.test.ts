import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { pennyTrapPivotOffset, PENNY_EDGE_PIVOT_TRAPS } from '../src/core/trap-pivots';
import { sceneMatrix, scenePoint } from '../src/core/transforms';
import type { Pose } from '../src/core/save';
function bounds(file: string, stem: string): Box3 {
  const bytes = readFileSync(new URL(`../assets/outpost-game/${file}`, import.meta.url));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const meshIndex = json.meshes.findIndex((m: { name: string }) => m.name.toLowerCase() === stem);
  expect(meshIndex, `Missing source mesh ${stem}`).toBeGreaterThanOrEqual(0);
  const node = json.nodes.find((n: { mesh?: number }) => n.mesh === meshIndex);
  const matrix = node.matrix
    ? new Matrix4().fromArray(node.matrix)
    : new Matrix4().compose(
        new Vector3(...(node.translation ?? [0, 0, 0])),
        new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
        new Vector3(...(node.scale ?? [1, 1, 1])),
      );
  const result = new Box3();
  for (const primitive of json.meshes[meshIndex].primitives) {
    const a = json.accessors[primitive.attributes.POSITION];
    const factor = a.normalized
      ? ({ 5122: 32767, 5123: 65535, 5120: 127, 5121: 255 } as Record<number, number>)[
          a.componentType
        ]
      : 1;
    expect(factor).toBeTruthy();
    result.union(
      new Box3(
        new Vector3(...a.min).divideScalar(factor),
        new Vector3(...a.max).divideScalar(factor),
      ).applyMatrix4(matrix),
    );
  }
  return result;
}
describe('Penny horizontal trap centering correction', () => {
  it('aligns shipped full-tile trap footprints with the shipped floor footprint', () => {
    const floor = bounds('builds/builds.glb', 'pbw_m3_floor').getCenter(new Vector3());
    expect(floor.x).toBeCloseTo(0.5, 2);
    for (const stem of [
      's_floor_freeze',
      'spike_trap_floor_base',
      's_wood_floor_spike',
      's_speedboost_straight',
      's_floor_jump_trap_base',
      'sm_tar_pit_trap',
      'electric_ceiling_trap',
      's_ceiling_electric_weak_trap',
      's_cieling_drop_trap',
      'ceiling_gas_trap',
    ]) {
      const old = bounds('traps/traps.glb', stem).getCenter(new Vector3());
      expect(Math.abs(old.x - floor.x), stem).toBeGreaterThan(0.48);
      const corrected = old.clone().add(new Vector3(...pennyTrapPivotOffset(stem)));
      expect(Math.abs(corrected.x - floor.x), stem).toBeLessThan(0.012);
    }
  });
  it('only targets source meshes present in the audited bundle', () => {
    for (const stem of PENNY_EDGE_PIVOT_TRAPS)
      expect(bounds('traps/traps.glb', stem).isEmpty()).toBe(false);
  });
  it('does not displace walls, native centre-origin anti-air, half-size jump pads, builds or unknown meshes', () => {
    for (const stem of [
      's_solid_wall_trap_test',
      'electric_trap_wall',
      'wall_speakertrap',
      'trap_cannon_wall',
      'sm_wall_launcher_trap_base',
      'patrol_ward_trap_base',
      'patrol_ward_trap_core',
      'jumppadup_floor',
      'jumppadd_floor',
      'pbw_m3_floor',
      'unknown',
    ])
      expect(pennyTrapPivotOffset(stem), stem).toEqual([0, 0, 0]);
    expect(
      bounds('traps/traps.glb', 'patrol_ward_trap_base').getCenter(new Vector3()).x,
    ).toBeCloseTo(0, 6);
    expect(bounds('traps/traps.glb', 'jumppadup_floor').getCenter(new Vector3()).x).toBeCloseTo(
      0.25,
      6,
    );
  });
  it('rotates the local half-tile with all four orientations instead of nudging world X/Y', () => {
    const expected = [
      [0, 256, 0],
      [-256, 0, 0],
      [0, -256, 0],
      [256, 0, 0],
    ];
    for (let quadrant = 0; quadrant < 4; quadrant++) {
      const pose: Pose = {
        translation: [111.123456789, -987.00000001, 34.5],
        rotation: [0, 0, Math.sin((quadrant * Math.PI) / 4), Math.cos((quadrant * Math.PI) / 4)],
        scale: [1, 1, 1],
      };
      const untouched = structuredClone(pose);
      const world = new Vector3(...pennyTrapPivotOffset('s_floor_freeze')).applyMatrix4(
        sceneMatrix(pose),
      );
      const want = scenePoint(pose.translation.map((v, i) => v + expected[quadrant][i]));
      expect(world.distanceTo(want)).toBeLessThan(1e-14);
      expect(pose).toEqual(untouched);
    }
  });
  it('handles upside-down, combined rotations, nonuniform scale and mirrors in geometry-local space', () => {
    for (const q of [
      new Quaternion(1, 0, 0, 0),
      new Quaternion().setFromAxisAngle(new Vector3(1, 2, -3).normalize(), 1.237),
    ]) {
      const pose: Pose = {
        translation: [17.03, 28.07, -39.13],
        rotation: q.toArray() as Pose['rotation'],
        scale: [-2, -3, 0.7],
      };
      const expectedUE = new Vector3(0, 256, 0)
        .multiply(new Vector3(...pose.scale))
        .applyQuaternion(q)
        .add(new Vector3(...pose.translation));
      const actual = new Vector3(...pennyTrapPivotOffset('electric_ceiling_trap')).applyMatrix4(
        sceneMatrix(pose),
      );
      expect(actual.distanceTo(scenePoint(expectedUE.toArray()))).toBeLessThan(1e-14);
      const signed = new Vector3(...pennyTrapPivotOffset('electric_ceiling_trap')).multiply(
        new Vector3(-1, 1, -1),
      );
      const absolute = { ...pose, scale: [2, 3, 0.7] as Pose['scale'] };
      expect(signed.applyMatrix4(sceneMatrix(absolute)).distanceTo(actual)).toBeLessThan(1e-14);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { buildingRecord, placeStructure, unrealRotator, type Vec3 } from '../src/core/editor';
import { directionAt, wallFaceAt } from '../src/core/placement-target';
const floor = (yaw = 0) =>
  buildingRecord('floor', 2, 3, {
    translation: [1024.125, -2048.75, 384],
    rotation: unrealRotator(0, yaw, 0),
    scale: [1, 1, 1],
  });
function world(p: ReturnType<typeof floor>, at: Vec3): Vec3 {
  return new Vector3(...at)
    .applyQuaternion(new Quaternion(...p.transform.rotation))
    .add(new Vector3(...p.transform.translation))
    .toArray() as Vec3;
}
describe('pointer placement', () => {
  for (const yaw of [0, 90, 180, 270])
    it(`finds the nearest floor edge in support-local space at ${yaw} degrees`, () => {
      const p = floor(yaw),
        before = JSON.stringify(p);
      for (const [point, direction] of [
        [[250, 256, 0], 'east'],
        [[-250, 256, 0], 'west'],
        [[0, 500, 0], 'north'],
        [[0, 12, 0], 'south'],
      ] as [Vec3, string][]) {
        expect(directionAt(p, world(p, point), 'wall')).toBe(direction);
        expect(directionAt(p, world(p, point), 'floor')).toBe(direction);
      }
      expect(JSON.stringify(p)).toBe(before);
    });
  it('cycles floor edges consistently without rounding the support', () => {
    const p = floor(90),
      point = world(p, [0, 500, 0]);
    expect([0, 1, 2, 3, 4].map((i) => directionAt(p, point, 'wall', i))).toEqual([
      'north',
      'east',
      'south',
      'west',
      'north',
    ]);
    const piece = placeStructure(p, 'wall', directionAt(p, point, 'wall'), 2, 3);
    expect(piece.transform.translation[0]).toBeCloseTo(512.125, 8);
  });
  it('targets the top, sides and base of a wall', () => {
    const f = floor(90),
      p = placeStructure(f, 'wall', 'south', 2, 3);
    expect(directionAt(p, world(p, [100, 0, 350]), 'wall')).toBe('above');
    expect(directionAt(p, world(p, [200, 0, 100]), 'wall')).toBe('east');
    expect(directionAt(p, world(p, [-200, 0, 100]), 'wall')).toBe('west');
    expect(directionAt(p, world(p, [-200, 0, 100]), 'floor')).toBe('below');
    expect(directionAt(p, world(p, [-200, 0, 350]), 'floor')).toBe('above');
    expect(directionAt(p, world(p, [0, 0, 10]), 'wall')).toBe('below');
  });
  it('uses camera-facing wall sides and an explicit flip at every yaw', () => {
    for (const yaw of [0, 90, 180, 270]) {
      const p = placeStructure(floor(yaw), 'wall', 'south', 2, 3);
      const front = world(p, [0, 1000, 200]),
        back = world(p, [0, -1000, 200]);
      expect(wallFaceAt(p, front)).toBe(0);
      expect(wallFaceAt(p, back)).toBe(1);
      expect(wallFaceAt(p, front, true)).toBe(1);
      expect(wallFaceAt(p, back, true)).toBe(0);
    }
  });
});

import { expect, it } from 'vitest';
import { tileKeyDelta, moveTiles } from '../src/core/tile-movement';
import { attachment, buildingRecord, placeTrap, ZERO_OFFSETS } from '../src/core/editor';
import { EditorDocument } from '../src/core/editor-document';
import type { Capture, Placement } from '../src/core/save';

const floor = (x = 0) =>
  buildingRecord('floor', 2, 3, {
    translation: [x, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  });
const documentFor = (placements: Placement[]) =>
  new EditorDocument(
    'test',
    {
      schemaVersion: 6,
      format: 'stw-homebase-capture',
      coordinateUnit: 'unreal-world-units',
      rotationEncoding: 'quaternion-xyzw',
      worldPath: 'test',
      completeHomebase: false,
      capturedCount: placements.length,
      placements,
    } as Capture,
    null,
  );

it('moves one horizontal tile in camera-relative cardinal directions', () => {
  expect(tileKeyDelta('ArrowUp', [1, 0, 0])).toEqual([512, 0, 0]);
  expect(tileKeyDelta('ArrowDown', [1, 0, 0])).toEqual([-512, 0, 0]);
  expect(tileKeyDelta('ArrowRight', [1, 0, 0])).toEqual([0, 512, 0]);
  expect(tileKeyDelta('ArrowLeft', [1, 0, 0])).toEqual([0, -512, 0]);
  expect(tileKeyDelta('ArrowUp', [0, 0, -1])).toEqual([0, -512, 0]);
  expect(tileKeyDelta('ArrowRight', [0.4, 0, 0.9])).toEqual([-512, 0, 0]);
  expect(tileKeyDelta('w', [1, 0, 0])).toBeNull();
  expect(tileKeyDelta('PageUp', [1, 0, 0])).toEqual([0, 0, 384]);
  expect(tileKeyDelta('PageDown', [0, 0, -1])).toEqual([0, 0, -384]);
});

it.each([
  [512, 0, 0],
  [0, 0, 384],
  [0, 0, -384],
] as const)(
  'moves structures and traps by [%i, %i, %i], preserving offsets and undo/redo',
  (x, y, z) => {
    const f = floor(0.125);
    const trap = placeTrap(
      {
        ...floor(),
        kind: 'trap',
        classPath: '/Trap_Floor_Launcher',
        itemPath: '/TID_Floor_Launcher',
      },
      f,
      0,
      0,
      ZERO_OFFSETS,
      'standard',
    );
    trap.meshTransform.translation[0] += 12;
    const doc = documentFor([f, trap]);
    doc.selected.add(f.actorPath);
    doc.moveSelected([x, y, z]);
    const [movedFloor, movedTrap] = doc.data.placements;
    expect(movedFloor.transform.translation).toEqual([0.125 + x, y, z]);
    for (const [axis, delta] of [x, y, z].entries()) {
      expect(movedTrap.transform.translation[axis]).toBe(trap.transform.translation[axis] + delta);
      expect(movedTrap.meshTransform.translation[axis]).toBe(
        trap.meshTransform.translation[axis] + delta,
      );
    }
    expect(attachment(movedTrap)?.supportTransform).toEqual(movedFloor.transform);
    expect(attachment(movedTrap)?.relativeTransform).toEqual(attachment(trap)?.relativeTransform);
    expect(movedTrap.actorPath).toBe(trap.actorPath);
    expect(doc.selected).toEqual(new Set([f.actorPath]));
    doc.undo();
    expect(doc.data.placements).toEqual([f, trap]);
    doc.redo();
    expect(doc.data.placements).toEqual([movedFloor, movedTrap]);
  },
);

it('moves an adjacent selection atomically and rejects collisions without changing history', () => {
  const a = floor(),
    b = floor(512),
    obstacle = floor(1536);
  const doc = documentFor([a, b, obstacle]);
  doc.selected = new Set([a.actorPath, b.actorPath]);
  doc.moveSelected([512, 0, 0]);
  expect(doc.data.placements.map((p) => p.transform.translation[0])).toEqual([512, 1024, 1536]);
  const before = doc.data;
  expect(() => doc.moveSelected([512, 0, 0])).toThrow(/occupies/);
  expect(doc.data).toBe(before);
  expect(doc.revision).toBe(1);
});

it('keeps the support fixed when only a trap is selected', () => {
  const f = floor();
  const trap = placeTrap(
    {
      ...floor(),
      kind: 'trap',
      classPath: '/Trap_Floor_Launcher',
      itemPath: '/TID_Floor_Launcher',
    },
    f,
    0,
    0,
    ZERO_OFFSETS,
    'standard',
  );
  const moved = moveTiles([f, trap], new Set([trap.actorPath]), [0, 512, 0]);
  expect(moved[0]).toBe(f);
  expect(moved[1].editorPlacementMode).toBe('menu-offset');
  expect(attachment(moved[1])?.supportTransform).toEqual(f.transform);
  expect(attachment(moved[1])?.relativeTransform?.translation[1]).toBe(
    attachment(trap)?.relativeTransform!.translation[1]! + 512,
  );
});

it('rejects fixed scenery and orphan traps', () => {
  const f = floor();
  expect(() =>
    moveTiles(
      [{ ...f, captureRole: 'existing-world' } as Placement],
      new Set([f.actorPath]),
      [512, 0, 0],
    ),
  ).toThrow(/player-built/);
  expect(() => moveTiles([{ ...f, kind: 'trap' }], new Set([f.actorPath]), [512, 0, 0])).toThrow(
    /supports/,
  );
});

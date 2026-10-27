import { it, expect } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import {
  EDIT_PATTERNS,
  patternOf,
  editStructure,
  matchEdit,
  mirrorCells,
  rotateCells,
} from '../src/core/build-pieces';
import {
  buildingRecord,
  placeStructure,
  placementConflict,
  unrealRotator,
} from '../src/core/editor';
import { EditorDocument } from '../src/core/editor-document';
import { directionAt } from '../src/core/placement-target';
import { exportCapture, exportSave } from '../src/core/export';
import { menuContainer } from '../src/cloud/convert';
import type { Capture, Placement, Pose } from '../src/core/save';
import catalog from '../src/data/build-edits.json';
const pose: Pose = {
  translation: [128.125, -512.75, 768],
  rotation: unrealRotator(0, 90, 0),
  scale: [1, 1, 1],
};
const piece = (kind: 'wall' | 'floor' | 'stair' | 'roof' = 'wall') =>
  buildingRecord(kind, 2, 3, pose);
const pattern = (id: string) => EDIT_PATTERNS.find((p) => p.id === id)!;
const capture = (placements: Placement[]): Capture => ({
  format: 'stw-homebase-capture',
  schemaVersion: 6,
  coordinateUnit: 'unreal-world-units',
  rotationEncoding: 'quaternion-xyzw',
  worldPath: 'Building edit fixture',
  completeHomebase: false,
  placements,
  capturedCount: placements.length,
});
const center = (p: Placement) =>
  new Vector3(0, 256, 0)
    .applyQuaternion(new Quaternion(...p.transform.rotation))
    .add(new Vector3(...p.transform.translation));
it('resolves all 296 native class/mesh definitions to real bundled geometry', () => {
  const bytes = readFileSync('assets/outpost-game/builds/builds.glb'),
    model = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const names = new Set(model.meshes.map((m: { name: string }) => m.name.toLowerCase()));
  expect(catalog.definitions.length).toBe(296);
  for (const def of catalog.definitions) {
    expect(names.has(def.meshPath.split('.').at(-1)!.toLowerCase())).toBe(true);
    expect(patternOf({ ...piece(), classPath: def.classPath })?.id).toBe(def.shape);
  }
  expect(
    catalog.definitions
      .filter((d) => d.classPath.includes('WindowsC'))
      .every((d) => d.shape === 'WindowC'),
  ).toBe(true);
});
it('recognizes native wall patterns, reflected doors and invalid masks', () => {
  expect(matchEdit('wall', [1, 1, 1, 1, 0, 1, 1, 1, 1])?.pattern.id).toBe('WindowC');
  expect(matchEdit('wall', [1, 1, 1, 1, 0, 1, 1, 0, 1])?.pattern.id).toBe('DoorC');
  const match = matchEdit('wall', mirrorCells(pattern('DoorSide').cells, 3));
  expect(match?.mirror).toBe(true);
  expect(match?.pattern.id).toBe('DoorSide');
  expect(matchEdit('wall', [0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
});
it('keeps actor identity, fractional origin, tier and quaternion unchanged for a wall edit', () => {
  const p = piece(),
    before = structuredClone(p),
    edited = editStructure(p, pattern('WindowC'));
  expect(edited.actorPath).toBe(p.actorPath);
  expect(edited.transform).toEqual(p.transform);
  expect(edited.resourceType).toBe(p.resourceType);
  expect(edited.level).toBe(p.level);
  expect(edited.classPath).toContain('M3_WindowC');
  expect(p).toEqual(before);
});
it('rotates floor, ramp and roof edits about their native tile centre at every quarter turn', () => {
  for (const [kind, id] of [
    ['floor', 'BalconyO'],
    ['stair', 'StairT'],
    ['roof', 'RoofO'],
  ] as const)
    for (const turn of [0, 90, 180, 270]) {
      const p = piece(kind),
        edited = editStructure(p, pattern(id), turn, true);
      expect(center(edited).distanceTo(center(p))).toBeLessThan(1e-9);
      expect(edited.transform.scale).toEqual([-1, 1, 1]);
      expect(edited.meshTransform.scale).toEqual([-1, 1, 1]);
      expect(edited.mirrored).toBe(true);
      let cells = mirrorCells(pattern(id).cells, 2);
      for (let i = 0; i < turn / 90; i++) cells = rotateCells(cells);
      expect(matchEdit(kind, cells)).not.toBeNull();
    }
});
it('keeps edited tile occupancy and permits a floor and ramp on the same tile', () => {
  expect(
    placementConflict(editStructure(piece('floor'), pattern('BalconyO')), [
      { ...piece('floor'), actorPath: 'other' },
    ]),
  ).toMatch(/already/);
  expect(placementConflict(piece('stair'), [piece('floor')])).toBeNull();
  expect(placementConflict(piece('stair'), [{ ...piece('stair'), actorPath: 'other' }])).toMatch(
    /already/,
  );
});
it('blocks editing trapped supports and supports exact undo/redo and menu export', () => {
  const p = piece(),
    doc = new EditorDocument('edit', capture([p]), null),
    before = structuredClone(doc.data);
  doc.editBuilding(p.actorPath, pattern('DoorSide'), 0, true);
  const edited = structuredClone(doc.data);
  expect(exportCapture(doc.data).placements[0].mirrored).toBe(true);
  doc.undo();
  expect(doc.data).toEqual(before);
  doc.redo();
  expect(doc.data).toEqual(edited);
  const trap = {
    ...piece(),
    actorPath: 'trap',
    kind: 'trap' as const,
    attachment: { supportActorPath: p.actorPath },
  };
  doc.data.placements.push(trap);
  expect(() => doc.editBuilding(p.actorPath, pattern('Solid'))).toThrow(/attached traps/);
});
it('targets underneath floors and both wall faces without rounding coordinates', () => {
  const f = piece('floor'),
    q = new Quaternion(...f.transform.rotation),
    world = (v: number[]) =>
      new Vector3(...v)
        .applyQuaternion(q)
        .add(new Vector3(...f.transform.translation))
        .toArray() as Pose['translation'];
  const direction = directionAt(f, world([250, 256, 0]), 'wall', 0, 'auto', world([0, 256, -500]));
  expect(direction).toBe('east-below');
  const wall = placeStructure(f, 'wall', direction, 2, 3);
  expect(wall.transform.translation[2]).toBe(384);
  expect(placeStructure(f, 'floor', 'below', 2, 3).transform.translation).toEqual([
    128.125, -512.75, 384,
  ]);
  const base = placeStructure(wall, 'floor', 'below-back', 2, 3);
  expect(base.transform.translation[2]).toBe(wall.transform.translation[2]);
  expect(placeStructure(wall, 'wall', 'below', 2, 3).transform.translation[2]).toBe(0);
});
it('writes small fixtures for native editing and below-placement UI checks', () => {
  mkdirSync('artifacts/validation', { recursive: true });
  for (const kind of ['wall', 'floor', 'stair', 'roof'] as const) {
    const p = piece(kind);
    p.transform = { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
    p.meshTransform = structuredClone(p.transform);
    p.actorPath = 'fixture-' + kind;
    writeFileSync(`artifacts/validation/build-${kind}.json`, JSON.stringify(capture([p])));
    writeFileSync(
      `artifacts/validation/build-${kind}.sav`,
      exportSave(menuContainer(), capture([p])),
    );
  }
  const mirrored = piece();
  mirrored.mirrored = true;
  mirrored.transform.scale = [-1, 1, 1];
  mirrored.meshTransform.scale = [-1, 1, 1];
  writeFileSync(
    'artifacts/validation/build-mirrored-wall.sav',
    exportSave(menuContainer(), capture([mirrored])),
  );
});

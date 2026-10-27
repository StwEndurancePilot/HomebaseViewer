import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseCapture, type Capture } from '../../src/core/save';
import { buildingRecord, placeTrap, placeStructure, ZERO_OFFSETS } from '../../src/core/editor';
const dir = path.join(process.env.LOCALAPPDATA!, 'FortniteGame/Saved/SaveGames');
const filename = readdirSync(dir).find(
  (f) =>
    f.startsWith('STW_Homebase_NightcoreASAP') && f.includes('Stonewood') && f.endsWith('.sav'),
)!;
const original = parseCapture(readFileSync(path.join(dir, filename)));
const floor = buildingRecord('floor', 2, 3, {
  translation: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
});
const choose = (key: string) =>
  original.placements.find((p) => p.kind === 'trap' && p.classPath.includes(key))!;
const floorTrap = placeTrap(choose('Trap_Floor_Launcher'), floor, 0, 0, ZERO_OFFSETS, 'standard');
const fixture = (rows: Capture['placements']): Capture => ({
  ...original,
  worldPath: 'Editor-test-scene',
  placements: rows,
  capturedCount: rows.length,
  completeHomebase: false,
});
const secondFloor = buildingRecord('floor', 2, 3, {
  translation: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
});
const ceiling = placeTrap(choose('Trap_Ceiling_Gas'), secondFloor, 0, 0, ZERO_OFFSETS, 'standard');
const wall = placeStructure(secondFloor, 'wall', 'south', 2, 3),
  wallTrap = placeTrap(choose('Trap_Wall_Launcher'), wall, 0, 0, ZERO_OFFSETS, 'standard');
mkdirSync('artifacts/validation', { recursive: true });
writeFileSync(
  'artifacts/validation/editor-source-a.json',
  JSON.stringify(fixture([floor, floorTrap])),
);
writeFileSync(
  'artifacts/validation/editor-source-b.json',
  JSON.stringify(fixture([secondFloor, ceiling, wall, wallTrap])),
);

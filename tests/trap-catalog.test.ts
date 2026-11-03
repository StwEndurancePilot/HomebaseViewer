import { expect, it } from 'vitest';
import { trapCatalog, trapTemplate } from '../src/core/trap-catalog';
import { trapPerks } from '../src/core/requirements';
import { trapPerkOptions } from '../src/core/trap-perks';
import { newBase } from '../src/core/new-base';
import { EditorDocument } from '../src/core/editor-document';
import {
  buildingRecord,
  placeTrap,
  trapCategory,
  ZERO_OFFSETS,
  exportIssues,
  attachment,
  unrealRotator,
} from '../src/core/editor';
import { EDIT_PATTERNS, editStructure } from '../src/core/build-pieces';
import { menuContainer } from '../src/cloud/convert';
import { exportSave, exportJson } from '../src/core/export';
import { parseCapture, type Pose } from '../src/core/save';

const pose: Pose = { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
const support = (kind: 'wall' | 'floor') => buildingRecord(kind, 2, 3, structuredClone(pose));

it('places every built-in trap and rarity without a source save and exports editable starter perks', () => {
  expect(trapCatalog).toHaveLength(23);
  for (const trap of trapCatalog) {
    expect(new Set(trap.variants.map((v) => v.rarity)).size).toBe(trap.variants.length);
    for (const variant of trap.variants) {
      const template = trapTemplate(trap.id, variant.rarity),
        parent = support(trapCategory(template) === 'wall' ? 'wall' : 'floor'),
        placed = placeTrap(template, parent, 0, 0, ZERO_OFFSETS, 'standard'),
        data = { ...newBase('blank'), placements: [parent, placed] };
      expect(exportIssues(data)).toEqual([]);
      expect(trapPerks(placed).perks.every((p) => p.known)).toBe(true);
      expect(trapPerks(placed).perks.length).toBeLessThanOrEqual(6);
      for (const restored of [
        parseCapture(exportSave(menuContainer(), data)),
        parseCapture(new TextEncoder().encode(exportJson(data))),
      ]) {
        expect(restored.placements[1].itemPath).toBe(variant.itemPath);
        expect(restored.placements[1].trapPerks).toBe(placed.trapPerks);
      }
    }
  }
  expect(trapTemplate('wall_darts', 'Uncommon').itemPath).toContain('_UC_T03');
  expect(() => trapTemplate('floor_tar', 'Common')).toThrow(/available/);
});

it('keeps new placements independent of imported or edited perk rolls', () => {
  const parent = support('wall'),
    template = trapTemplate('wall_darts', 'Legendary'),
    placed = placeTrap(template, parent, 0, 0, ZERO_OFFSETS, 'standard'),
    doc = new EditorDocument('test', { ...newBase('blank'), placements: [parent, placed] }, null),
    replacement = trapPerkOptions[0].perks.at(-1)!.path;
  doc.editTrapPerks(placed.actorPath, [replacement]);
  expect(doc.data.placements[1].trapPerks).toBe(`perks1;${replacement}`);
  expect(trapTemplate('wall_darts', 'Legendary').trapPerks).toBe(template.trapPerks);
  doc.undo();
  expect(doc.data.placements[1]).toEqual(placed);
  doc.redo();
  expect(doc.data.placements[1].trapPerks).toBe(`perks1;${replacement}`);
});

it('attaches wall traps to all window edits on both faces, including rotated and mirrored supports', () => {
  for (const id of ['WindowC', 'WindowSide', 'Windows'])
    for (const yaw of [0, 90, 180, 270])
      for (const mirror of [false, true])
        for (const side of [0, 1] as const) {
          const wall = support('wall');
          wall.transform.rotation = unrealRotator(0, yaw, 0);
          wall.meshTransform = structuredClone(wall.transform);
          const parent = editStructure(wall, EDIT_PATTERNS.find((p) => p.id === id)!, 0, mirror);
          for (const entry of trapCatalog.filter((t) => t.id.startsWith('wall_'))) {
            const placed = placeTrap(
              trapTemplate(entry.id, entry.variants[0].rarity),
              parent,
              0,
              side,
              ZERO_OFFSETS,
              'standard',
            );
            expect(attachment(placed)?.supportActorPath).toBe(parent.actorPath);
            expect(attachment(placed)?.side).toBe(side);
            expect(placed.transform.translation).toEqual(parent.transform.translation);
            expect(placed.transform.scale).toEqual([1, 1, 1]);
          }
        }
});

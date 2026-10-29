import { expect, it } from 'vitest';
import { EditorDocument } from '../src/core/editor-document';
import { trapPerkOptions, withTrapPerks } from '../src/core/trap-perks';
import { trapPerks, requirements } from '../src/core/requirements';
import { buildingRecord, placeTrap, ZERO_OFFSETS } from '../src/core/editor';
import { exportSave, exportJson } from '../src/core/export';
import { menuContainer } from '../src/cloud/convert';
import { parseCapture, readSaveText, type Capture, type Placement } from '../src/core/save';

const damage = trapPerkOptions.find((g) => g.label === 'Damage')!.perks.at(-1)!.path;
const reload = trapPerkOptions.find((g) => g.label === 'Reload speed')!.perks.at(-1)!.path;
const unknown = '/Game/UnknownPerk.UnknownPerk';
function fixture() {
  const floor = buildingRecord('floor', 2, 3, {
    translation: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  });
  const trap = placeTrap(
    {
      ...floor,
      kind: 'trap',
      classPath: '/Trap_Floor_Launcher.Trap_Floor_Launcher_C',
      itemPath: '/TID_Floor_Launcher_SR_T05.TID_Floor_Launcher_SR_T05',
      meshPath: '/SM_Floor_Launcher_Trap.SM_Floor_Launcher_Trap',
      attachmentType: 0,
      trapLevel: 50,
      trapPerks: `perks1;${unknown};${damage}`,
      trapPerksStatus: 'observed-effects',
      trapPerksSource: 'active-effect-source-v1',
      trapEffectSources: { complete: false },
    },
    floor,
    0,
    0,
    ZERO_OFFSETS,
    'standard',
  );
  const data: Capture = {
    schemaVersion: 6,
    format: 'stw-homebase-capture',
    coordinateUnit: 'unreal-world-units',
    rotationEncoding: 'quaternion-xyzw',
    worldPath: 'Zone_Outpost_Stonewood',
    completeHomebase: false,
    placements: [floor, trap],
  };
  const doc = new EditorDocument('Perks', data, menuContainer());
  doc.selected.add(trap.actorPath);
  return { doc, trap, floor };
}

it('provides known, ranked choices with full asset paths', () => {
  for (const group of trapPerkOptions) {
    expect(group.perks.length).toBeGreaterThan(0);
    for (const perk of group.perks) {
      expect(perk.known).toBe(true);
      expect(perk.rarity).toBeTruthy();
      expect(perk.path).toMatch(/^\/SaveTheWorld\/Items\/Alteration_v2\//);
    }
  }
});

it('edits one trap without changing placement data, retains duplicates and unknown perks, and supports undo/redo', () => {
  const { doc, trap, floor } = fixture(),
    before = structuredClone(trap);
  doc.editTrapPerks(trap.actorPath, [reload, unknown, reload]);
  const edited = doc.data.placements[1];
  expect(edited).toMatchObject({
    transform: trap.transform,
    meshTransform: trap.meshTransform,
    attachment: trap.attachment,
    trapLevel: 50,
    trapPerks: `perks1;${reload};${unknown};${reload}`,
    trapPerksStatus: 'captured',
    trapPerksSource: 'editor',
  });
  expect(edited.trapEffectSources).toBeUndefined();
  expect(doc.data.placements[0]).toBe(floor);
  expect(trap).toEqual(before);
  expect(doc.dirty).toBe(true);
  expect(doc.selected).toEqual(new Set([trap.actorPath]));
  expect(trapPerks(edited).state).toBe('recorded');
  expect(requirements(doc.data).types[0].variants[0].sample).toBe(edited);
  doc.undo();
  expect(doc.data.placements[1]).toEqual(before);
  doc.redo();
  expect(doc.data.placements[1]).toEqual(edited);
});

it('does not commit an unchanged observed list or discard its provenance', () => {
  const { doc, trap } = fixture();
  doc.editTrapPerks(trap.actorPath, [unknown, damage]);
  expect(doc.canUndo).toBe(false);
  expect(doc.dirty).toBe(false);
  expect(doc.data.placements[1]).toBe(trap);
});

it('rejects invalid targets, untrusted paths and extra slots atomically', () => {
  const { doc, trap, floor } = fixture();
  for (const [actor, paths] of [
    ['missing', [damage]],
    [floor.actorPath, [damage]],
    [trap.actorPath, ['']],
    [trap.actorPath, ['/Game/Injected.Injected']],
    [trap.actorPath, Array(7).fill(damage)],
  ] as [string, string[]][])
    expect(() => doc.editTrapPerks(actor, paths)).toThrow();
  expect(() => withTrapPerks({ ...trap, captureRole: 'existing-world' }, [damage])).toThrow();
  expect(doc.canUndo).toBe(false);
  expect(doc.data.placements[1]).toBe(trap);
});

it('can explicitly clear unreadable or recorded perks and preserves oversized imports', () => {
  const { trap } = fixture();
  for (const raw of ['broken', trap.trapPerks]) {
    const cleared = withTrapPerks({ ...trap, trapPerks: raw }, []);
    expect(trapPerks(cleared)).toEqual({ state: 'empty', perks: [] });
  }
  const oversized = { ...trap, trapPerks: `perks1;${Array(8).fill(damage).join(';')}` };
  expect(trapPerks(withTrapPerks(oversized, Array(8).fill(reload))).perks).toHaveLength(8);
});

it('round-trips edited perks in JSON, GVAS and menu replay rows', () => {
  const { doc, trap } = fixture();
  doc.editTrapPerks(trap.actorPath, [reload, damage, damage]);
  const expected = doc.data.placements[1];
  const bytes = exportSave(menuContainer(), doc.data);
  for (const data of [
    parseCapture(bytes),
    parseCapture(new TextEncoder().encode(exportJson(doc.data))),
  ]) {
    const saved = data.placements.find((p) => p.kind === 'trap')!;
    expect(saved.trapPerks).toBe(expected.trapPerks);
    expect(saved.trapPerksSource).toBe('editor');
    expect(saved.trapEffectSources).toBeUndefined();
  }
  const row = readSaveText(bytes)
    .split('\n')
    .find((line) => line.split('|')[1] === 'trap')!;
  const replay = JSON.parse(decodeURIComponent(row.split('|')[16])) as Placement;
  expect(replay.trapPerks).toBe(expected.trapPerks);
  doc.editTrapPerks(trap.actorPath, []);
  const cleared = parseCapture(exportSave(menuContainer(), doc.data)).placements[1];
  expect(trapPerks(cleared).state).toBe('empty');
});

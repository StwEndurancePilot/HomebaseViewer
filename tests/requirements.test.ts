import { expect, it } from 'vitest';
import { requirements, trapPerks, trapName, trapTypeKey } from '../src/core/requirements';
import { buildingRecord } from '../src/core/editor';
import { parseCapture, type Capture, type Placement } from '../src/core/save';
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const pose = {
  translation: [0, 0, 0] as [number, number, number],
  rotation: [0, 0, 0, 1] as [number, number, number, number],
  scale: [1, 1, 1] as [number, number, number],
};
const capture = (placements: Placement[]): Capture => ({
  format: 'stw-homebase-capture',
  schemaVersion: 6,
  coordinateUnit: 'unreal-world-units',
  rotationEncoding: 'quaternion-xyzw',
  worldPath: 'Requirements fixture',
  completeHomebase: false,
  capturedCount: placements.length,
  placements,
});
const trap = (
  id: string,
  type = 'Floor_Freeze',
  perks = 'perks1;/SaveTheWorld/Items/Alteration/AID_Att_ReloadSpeed_T05.AID_Att_ReloadSpeed_T05',
): Placement => ({
  actorPath: id,
  kind: 'trap',
  captureRole: 'placement',
  classPath: `/SaveTheWorld/Items/Traps/Blueprints/Trap_${type}.Trap_${type}_C`,
  meshPath: type === 'Floor_Freeze' ? 'S_Floor_Freeze' : 'Patrol_Ward_Trap_base',
  itemPath: '/SaveTheWorld/Items/Traps/TID_Floor_Freeze_SR_T05.TID_Floor_Freeze_SR_T05',
  trapLevel: 50,
  trapPerks: perks,
  trapPerksStatus: 'captured',
  transform: structuredClone(pose),
  meshTransform: structuredClone(pose),
});
it('counts full rebuild cost by saved material and tier and excludes scenery', () => {
  const pieces = [
    buildingRecord('floor', 0, 1, pose),
    buildingRecord('wall', 0, 3, pose),
    buildingRecord('floor', 1, 2, pose),
    buildingRecord('floor', 2, 3, pose),
  ];
  const scenery = { ...buildingRecord('wall', 2, 3, pose), captureRole: 'existing-world' as const },
    bad = { ...buildingRecord('floor', 2, 1, pose), resourceType: 6 };
  const result = requirements(capture([...pieces, scenery, bad, trap('t')]));
  expect(result.materials).toEqual([70, 30, 60]);
  expect(result.materialPieces).toEqual([2, 1, 1]);
  expect(result.unknownStructures).toBe(1);
  expect(result.structures).toBe(5);
  expect(result.traps).toBe(1);
});
it('keeps perk order, duplicate rolls, unknown and empty perks distinct', () => {
  const p = trap(
    't',
    'Floor_Freeze',
    'perks1;/Game/AID_Att_MaxDurability_Trap_T05.AID_Att_MaxDurability_Trap_T05;/Game/AID_Att_MaxDurability_Trap_T05.AID_Att_MaxDurability_Trap_T05;/Game/AID_NEW_UNKNOWN.AID_NEW_UNKNOWN',
  );
  const data = trapPerks(p);
  expect(data.perks.map((p) => p.label)).toEqual([
    '+42% Durability',
    '+42% Durability',
    'AID_NEW_UNKNOWN',
  ]);
  expect(data.perks[2].known).toBe(false);
  expect(trapPerks({ ...p, trapPerks: '', trapPerksStatus: 'not-recorded' }).state).toBe('unknown');
  expect(trapPerks({ ...p, trapPerks: '', trapPerksStatus: 'empty' }).state).toBe('empty');
  expect(trapPerks({ ...p, trapPerks: 'broken' }).state).toBe('unreadable');
});
it('groups each trap type and separates level, item and perk variants without mutation', () => {
  const a = trap('a'),
    b = trap('b'),
    c = { ...trap('c'), trapLevel: 40 },
    d = trap(
      'd',
      'Floor_Freeze',
      'perks1;/Game/AID_Att_MaxDurability_Trap_T05.AID_Att_MaxDurability_Trap_T05',
    ),
    e = trap('e', 'Floor_Ward_AntiAir');
  const source = capture([a, b, c, d, e]),
    before = structuredClone(source),
    result = requirements(source);
  expect(result.traps).toBe(5);
  expect(result.types).toHaveLength(2);
  const freeze = result.types.find((t) => t.key === trapTypeKey(a))!;
  expect(freeze.records).toHaveLength(4);
  expect(freeze.variants.map((v) => v.records.length)).toEqual([2, 1, 1]);
  expect(source).toEqual(before);
  expect(trapName(trap('h', 'Floor_Health_First_Aid_MegaBacon'))).toBe('Healing Pad');
});
it('writes a deterministic UI fixture with different perks and tiers', () => {
  const floors = [
    buildingRecord('floor', 0, 1, pose),
    buildingRecord('floor', 1, 2, { ...pose, translation: [1024, 0, 0] }),
    buildingRecord('floor', 2, 3, { ...pose, translation: [2048, 0, 0] }),
  ];
  floors.forEach((p, i) => (p.actorPath = 'floor-' + i));
  const a = trap(
    'trap-a',
    'Floor_Freeze',
    'perks1;/Game/AID_Att_MaxDurability_Trap_T05.AID_Att_MaxDurability_Trap_T05;/Game/AID_Att_MaxDurability_Trap_T05.AID_Att_MaxDurability_Trap_T05',
  );
  const b = trap(
    'trap-b',
    'Floor_Freeze',
    'perks1;/Game/AID_Att_CritDamage_T05.AID_Att_CritDamage_T05',
  );
  b.transform = structuredClone(floors[1].transform);
  b.meshTransform = structuredClone(b.transform);
  const c = trap('trap-c', 'Floor_Ward_AntiAir', '');
  c.trapPerksStatus = 'not-recorded';
  c.itemPath =
    '/SaveTheWorld/Items/Traps/TID_Floor_Ward_AntiAir_SR_T05.TID_Floor_Ward_AntiAir_SR_T05';
  c.transform = { ...structuredClone(pose), translation: [2048, 256, 0] };
  c.meshTransform = structuredClone(c.transform);
  const data = capture([...floors, a, b, c]);
  mkdirSync('artifacts/validation', { recursive: true });
  writeFileSync('artifacts/validation/requirements-fixture.json', JSON.stringify(data));
  expect(requirements(data).materials).toEqual([10, 30, 60]);
});
const dir = path.join(process.env.LOCALAPPDATA ?? '', 'FortniteGame/Saved/SaveGames');
it.skipIf(!existsSync(dir))(
  'audits captured perk descriptions and real blueprint counts read-only',
  () => {
    let perks = 0,
      known = 0;
    for (const name of readdirSync(dir).filter(
      (f) =>
        f.startsWith('STW_Homebase_') && f.endsWith('.sav') && !/Library|Recovery|Request/.test(f),
    )) {
      const data = parseCapture(readFileSync(path.join(dir, name))),
        r = requirements(data);
      expect(r.types.reduce((n, t) => n + t.records.length, 0)).toBe(
        data.placements.filter((p) => p.kind === 'trap' && p.captureRole === 'placement').length,
      );
      for (const p of data.placements.filter((p) => p.kind === 'trap'))
        for (const perk of trapPerks(p).perks) {
          perks++;
          if (perk.known) known++;
        }
    }
    console.log(
      `Readable descriptions for ${known}/${perks} captured perk slots; unmapped IDs remain visible.`,
    );
  },
);

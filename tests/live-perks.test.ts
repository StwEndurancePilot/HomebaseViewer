import { expect, it } from 'vitest';
import evidence from './fixtures/live-perks.json';
import { trapPerks, trapVariantKey } from '../src/core/requirements';
import { buildingRecord, placeTrap, ZERO_OFFSETS, copyGroup, planPaste } from '../src/core/editor';
import { exportSave } from '../src/core/export';
import { menuContainer } from '../src/cloud/convert';
import { parseCapture, readSaveText, type Capture, type Placement } from '../src/core/save';

const observed = evidence.find((e) => e.trapPerksStatus === 'observed-effects')!;
const unknown = evidence.find((e) => e.trapPerksStatus === 'unknown')!;
function fixture(): Capture {
  const floor = buildingRecord('floor', 2, 3, {
    translation: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  });
  const template: Placement = {
    ...floor,
    kind: 'trap',
    classPath: '/Trap_Floor_Launcher.Trap_Floor_Launcher_C',
    itemPath: '/TID_Floor_Launcher_SR_T05.TID_Floor_Launcher_SR_T05',
    meshPath: '/SM_Floor_Launcher_Trap.SM_Floor_Launcher_Trap',
    attachmentType: 0,
    trapLevel: 50,
    ...structuredClone(observed),
  };
  const trap = placeTrap(template, floor, 0, 0, ZERO_OFFSETS, 'standard');
  return {
    schemaVersion: 6,
    format: 'stw-homebase-capture',
    coordinateUnit: 'unreal-world-units',
    rotationEncoding: 'quaternion-xyzw',
    worldPath: 'Zone_Outpost_Stonewood',
    completeHomebase: false,
    placements: [floor, trap],
  };
}

it('reads the menu VM output as six exact known perks while retaining uncertainty', () => {
  const p = fixture().placements[1],
    result = trapPerks(p);
  expect(result.state).toBe('observed');
  expect(result.perks).toHaveLength(6);
  expect(result.perks.every((p) => p.known && p.rarity === 'Legendary')).toBe(true);
  expect(result.perks.map((p) => p.path.split('.').at(-1))).toEqual([
    'AID_Att_Damage_Physical_T05',
    'AID_Att_CritChance_T05',
    'AID_Att_CritDamage_T05',
    'AID_Att_Damage_T05',
    'AID_Att_ReloadSpeed_Trap_T05',
    'AID_Att_MaxDurability_Trap_T05',
  ]);
  expect(trapPerks({ ...p, ...unknown }).state).toBe('unknown');
  expect(trapPerks({ ...p, trapPerks: '', trapPerksStatus: 'observed-effects' }).state).toBe(
    'unknown',
  );
  expect(trapVariantKey(p)).not.toBe(
    trapVariantKey({ ...p, trapPerksStatus: 'captured', trapPerksSource: 'cloud-save' }),
  );
});

it('preserves live perk paths and evidence through editing, GVAS export and menu replay rows', () => {
  const data = fixture();
  const group = copyGroup(data, new Set([data.placements[0].actorPath]));
  const pasted = planPaste({ ...data, placements: [] }, group, [4096, 4096, 768], 90, false);
  const edited = { ...data, placements: pasted.records };
  const bytes = exportSave(menuContainer(), edited),
    parsed = parseCapture(bytes);
  const trap = parsed.placements.find((p) => p.kind === 'trap')!;
  for (const key of [
    'trapPerks',
    'trapPerksStatus',
    'trapPerksSource',
    'trapEffectSources',
  ] as const)
    expect(trap[key]).toEqual(observed[key]);
  const rows = readSaveText(bytes).split('\n').slice(2);
  const row = rows.find((r) => r.split('|')[1] === 'trap')!;
  expect(row.split('|')).toHaveLength(17);
  const saved = JSON.parse(
    row
      .split('|')[16]
      .replaceAll('%0D', '\r')
      .replaceAll('%0A', '\n')
      .replaceAll('%7C', '|')
      .replaceAll('%25', '%'),
  );
  expect(saved.trapPerks).toBe(observed.trapPerks);
  expect(saved.trapEffectSources).toEqual(observed.trapEffectSources);
  expect(trapPerks(trap).state).toBe('observed');
});

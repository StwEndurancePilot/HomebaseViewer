import { expect, it } from 'vitest';
import { newBase, BASE_ZONES } from '../src/core/new-base';
import { EditorDocument } from '../src/core/editor-document';
import { parseCapture, zoneForCapture, type Placement } from '../src/core/save';
import { exportSave } from '../src/core/export';
import { menuContainer } from '../src/cloud/convert';
import { EDIT_PATTERNS, editStructure } from '../src/core/build-pieces';
import {
  attachment,
  buildingRecord,
  placeTrap,
  planPaste,
  ZERO_OFFSETS,
  unrealRotator,
} from '../src/core/editor';
import catalog from '../src/cloud/catalog.json';

const wall = () =>
  buildingRecord('wall', 2, 3, {
    translation: [128.25, -512.75, 384],
    rotation: unrealRotator(0, 90, 0),
    scale: [1, 1, 1],
  });
const electric = (): Placement => {
  const definition = Object.values(catalog.classes).find((c) =>
    c.classPath.includes('Trap_Wall_Electric'),
  )!;
  return {
    ...wall(),
    ...definition,
    kind: 'trap',
    itemPath: catalog.items.tid_wall_electric_sr_t05,
    trapLevel: 50,
    trapPerks: '',
  };
};

it('creates independent, exportable empty bases without a previously opened save', () => {
  for (const zone of Object.keys(BASE_ZONES)) {
    const data = newBase(zone);
    expect(zoneForCapture(data)).toBe(zone === 'blank' ? null : zone);
    expect(parseCapture(new TextEncoder().encode(JSON.stringify(data))).placements).toEqual([]);
    data.placements.push(wall());
    data.capturedCount = 1;
    const restored = parseCapture(exportSave(menuContainer(), data));
    expect(restored.placements).toHaveLength(1);
    expect(restored.worldPath).toBe(data.worldPath);
  }
  const source = newBase('pve_04');
  source.cloudImport = { zoneId: 'pve_04' };
  source.cloudIssues = ['old import issue'];
  source.placements.push(wall());
  const fresh = newBase('current', source);
  expect(fresh.worldPath).toBe(source.worldPath);
  expect(fresh.placements).toEqual([]);
  expect(fresh.cloudImport).toBeUndefined();
  expect(fresh.cloudIssues).toBeUndefined();
  expect(() => newBase('current')).toThrow();
  expect(() => newBase('unknown')).toThrow();
});

it('places electric traps on both faces of low and half walls and preserves attachment on export', () => {
  for (const id of ['QuarterWallS', 'HalfWall'])
    for (const material of [0, 1, 2] as const)
      for (const tier of [1, 2, 3] as const)
        for (const side of [0, 1] as const) {
          const parent = editStructure(
            buildingRecord('wall', material, tier, wall().transform),
            EDIT_PATTERNS.find((p) => p.id === id)!,
          );
          const trap = placeTrap(electric(), parent, 0, side, ZERO_OFFSETS, 'standard');
          expect(attachment(trap)?.supportActorPath).toBe(parent.actorPath);
          expect(attachment(trap)?.side).toBe(side);
          expect(trap.transform.translation).toEqual(parent.transform.translation);
          const data = newBase('pve_01');
          data.placements = [parent, trap];
          data.capturedCount = 2;
          const restored = parseCapture(exportSave(menuContainer(), data));
          expect(restored.placements).toHaveLength(2);
          expect(attachment(restored.placements[1])?.supportActorPath).toBe(
            restored.placements[0].actorPath,
          );
        }
});

it('still rejects incompatible traps and wall edits', () => {
  for (const id of ['DoorC', 'QuarterWallHalf', 'Pillar']) {
    const parent = editStructure(wall(), EDIT_PATTERNS.find((p) => p.id === id)!);
    expect(() => placeTrap(electric(), parent, 0, 0, ZERO_OFFSETS, 'standard')).toThrow(
      /solid or windowed wall/,
    );
  }
  const parent = editStructure(wall(), EDIT_PATTERNS.find((p) => p.id === 'QuarterWallS')!);
  const launcher = {
    ...electric(),
    classPath: '/Trap_Wall_Launcher.Trap_Wall_Launcher_C',
    itemPath: '/TID_Wall_Launcher_SR_T05',
  };
  expect(() => placeTrap(launcher, parent, 0, 0, ZERO_OFFSETS, 'standard')).toThrow(
    /solid or windowed wall/,
  );
});

it('cuts attached groups across documents with independent undo and a durable clipboard snapshot', () => {
  const parent = wall();
  const trap = placeTrap(electric(), parent, 0, 0, ZERO_OFFSETS, 'standard');
  const data = { ...newBase('pve_01'), placements: [parent, trap], capturedCount: 2 };
  const source = new EditorDocument('Source.sav', structuredClone(data), menuContainer());
  const destination = new EditorDocument('Target.sav', newBase('pve_04'), menuContainer());
  source.selected.add(parent.actorPath);
  const clipboard = source.cutSelected();
  expect(source.data.placements).toHaveLength(0);
  const plan = planPaste(destination.data, clipboard, [2048, 0, 384], 90, true);
  expect(plan.errors).toEqual([]);
  destination.paste(plan);
  const [pastedWall, pastedTrap] = destination.data.placements;
  expect(pastedWall.actorPath).not.toBe(parent.actorPath);
  expect(attachment(pastedTrap)?.supportActorPath).toBe(pastedWall.actorPath);
  expect(pastedTrap.trapLevel).toBe(trap.trapLevel);
  source.undo();
  expect(source.data.placements).toEqual(data.placements);
  expect(destination.data.placements).toHaveLength(2);
  destination.undo();
  expect(destination.data.placements).toHaveLength(0);
  destination.redo();
  expect(destination.data.placements).toHaveLength(2);
  expect(clipboard.records).toEqual(data.placements);
});

it('cuts a trap without deleting its source support, and leaves invalid cuts untouched', () => {
  const parent = wall();
  const trap = placeTrap(electric(), parent, 0, 0, ZERO_OFFSETS, 'standard');
  const doc = new EditorDocument(
    'Source',
    { ...newBase('blank'), placements: [parent, trap] },
    null,
  );
  doc.selected.add(trap.actorPath);
  expect(doc.cutSelected().records).toHaveLength(2);
  expect(doc.data.placements).toEqual([parent]);
  parent.captureRole = 'existing-world';
  doc.selected.add(parent.actorPath);
  const revision = doc.revision;
  expect(() => doc.cutSelected()).toThrow(/cannot be copied/);
  expect(doc.revision).toBe(revision);
  expect(doc.data.placements).toEqual([parent]);
});

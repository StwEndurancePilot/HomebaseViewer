import { describe, it, expect } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  parseCapture,
  readSaveText,
  type Placement,
  type Capture,
  type Pose,
} from '../src/core/save';
import {
  attachment,
  buildingRecord,
  placeStructure,
  placeTrap,
  unrealRotator,
  ZERO_OFFSETS,
  withOffsets,
  copyGroup,
  planPaste,
  placementConflict,
  relativePose,
  exportIssues,
} from '../src/core/editor';
import { EditorDocument } from '../src/core/editor-document';
import { exportSave, exportCapture, replayRow } from '../src/core/export';
const pose = (translation: Pose['translation'] = [0, 0, 0], yaw = 0): Pose => ({
  translation,
  rotation: unrealRotator(0, yaw, 0),
  scale: [1, 1, 1],
});
const floor = (at: Pose['translation'] = [0, 0, 0], yaw = 0) =>
  buildingRecord('floor', 2, 3, pose(at, yaw));
const capture = (placements: Placement[]): Capture => ({
  schemaVersion: 6,
  format: 'stw-homebase-capture',
  coordinateUnit: 'unreal-world-units',
  rotationEncoding: 'quaternion-xyzw',
  worldPath: 'Zone_Outpost_Stonewood',
  completeHomebase: false,
  capturedCount: placements.length,
  placements,
});
function template(kind = 'Floor'): Placement {
  return {
    ...floor(),
    kind: 'trap',
    classPath: `/Trap_${kind}_Launcher.Trap_${kind}_Launcher_C`,
    itemPath: `/TID_${kind}_Launcher_SR_T05.TID_${kind}_Launcher_SR_T05`,
    meshPath: '/SM_Floor_Launcher_Trap.SM_Floor_Launcher_Trap',
    attachmentType: kind === 'Ceiling' ? 2 : kind === 'Wall' ? 1 : 0,
    trapLevel: 50,
    trapPerks: 'perk|one%\n二',
    mirrored: false,
  };
}
const trap = (support: Placement, kind = 'Floor', side: 0 | 1 = 0) =>
  placeTrap(template(kind), support, 0, side, ZERO_OFFSETS, 'standard');
const near = (actual: number[], expected: number[]) =>
  actual.forEach((n, i) => expect(n).toBeCloseTo(expected[i], 8));
describe('Fortnite support placement', () => {
  it('creates wall edges on a rotated floor without snapping its captured origin', () => {
    const support = floor([123.125, -888.75, 768], 90);
    near(
      placeStructure(support, 'wall', 'east', 1, 2).transform.translation,
      [-132.875, -632.75, 768],
    );
    near(
      placeStructure(support, 'floor', 'north', 0, 1).transform.translation,
      [-388.875, -888.75, 768],
    );
    const wall = placeStructure(support, 'wall', 'south', 2, 3);
    near(
      placeStructure(wall, 'wall', 'above', 2, 3).transform.translation,
      [123.125, -888.75, 1152],
    );
    expect(wall.classPath).toContain('Metal/L3/PBWA_M3_Solid');
    expect(floor().classPath).toContain('PBWA_M3_Floor_2');
  });
  it('rejects invalid supports and mismatched trap categories', () => {
    const f = floor(),
      wall = placeStructure(f, 'wall', 'south', 2, 3);
    expect(() => trap(f, 'Wall')).toThrow(/wall support/);
    expect(() => trap(wall)).toThrow(/floor support/);
    const tilted = { ...f, transform: { ...f.transform, rotation: unrealRotator(45, 0, 0) } };
    expect(() => placeStructure(tilted, 'wall', 'north', 0, 1)).toThrow(/upright/);
    expect(() =>
      placeStructure({ ...f, captureRole: 'existing-world' }, 'wall', 'north', 0, 1),
    ).toThrow(/player-built/);
  });
  it('centres each rotated floor trap on its support and supports opposite faces', () => {
    const f = floor(),
      ceiling = trap(f, 'Ceiling'),
      floorTrap = trap(f);
    for (const turn of [0, 90, 180, 270]) {
      const p = placeTrap(template(), f, turn, 0, ZERO_OFFSETS, 'standard');
      near(
        new Vector3(0, 256, 0)
          .applyQuaternion(new Quaternion(...p.transform.rotation))
          .add(new Vector3(...p.transform.translation))
          .toArray(),
        [0, 256, 0],
      );
    }
    expect(placementConflict(ceiling, [floorTrap])).toBeNull();
    expect(placementConflict(trap(f), [floorTrap])).toMatch(/occupies|already/);
    const wall = placeStructure(f, 'wall', 'south', 2, 3),
      front = trap(wall, 'Wall'),
      back = trap(wall, 'Wall', 1);
    expect(placementConflict(back, [front])).toBeNull();
    const anti = template();
    anti.meshPath = '/patrol_ward_trap.patrol_ward_trap';
    near(placeTrap(anti, f, 90, 0, ZERO_OFFSETS, 'standard').transform.translation, [0, 256, 0]);
  });
  it('rejects alternate material overlap and opposite-orientation duplicate floors', () => {
    const f = floor(),
      same = floor([0, 512, 0], 180);
    expect(placementConflict(same, [f])).toMatch(/occupies/);
    expect(placementConflict(buildingRecord('floor', 0, 1, f.transform), [f])).toMatch(/occupies/);
  });
  it('retains a captured primary component transform when creating a new trap', () => {
    const t = template();
    t.transform = pose([30, 40, 50], 90);
    t.meshTransform = {
      translation: [25, 40, 60],
      rotation: unrealRotator(0, 90, 0),
      scale: [2, 1, 0.5],
    };
    const p = placeTrap(t, floor(), 0, 0, ZERO_OFFSETS, 'standard');
    near(p.meshTransform.translation, [0, 5, 10]);
    expect(p.meshTransform.scale).toEqual([2, 1, 0.5]);
  });
  it('uses world offsets and preserves mesh-relative offsets and signed scales', () => {
    const f = floor([30, 20, 10], 90),
      p = trap(f);
    p.meshTransform.translation[0] += 5;
    p.meshTransform.scale = [-1, 2, 0.5];
    const changed = withOffsets(p, { position: [256, 0.125, -4], angles: [0, 90, 0] }, f);
    near(changed.transform.translation, [286, 20.125, 6]);
    near(changed.meshTransform.translation, [286, 25.125, 6]);
    expect(changed.meshTransform.scale).toEqual([-1, 2, 0.5]);
    expect(attachment(changed)?.supportActorPath).toBe(f.actorPath);
    expect(attachment(changed)?.supportTransform).toEqual(f.transform);
    expect(() => withOffsets(p, { position: [2001, 0, 0], angles: [0, 0, 0] }, f)).toThrow(/2000/);
    expect(withOffsets(p, ZERO_OFFSETS, f).meshTransform).toEqual(p.meshTransform);
  });
});
describe('bulk groups and history', () => {
  it('adds attachment closure without mutating source records', () => {
    const f = floor(),
      p = trap(f),
      data = capture([f, p]),
      before = JSON.stringify(data);
    expect(copyGroup(data, new Set([f.actorPath])).records).toHaveLength(2);
    expect(copyGroup(data, new Set([p.actorPath])).records).toHaveLength(2);
    expect(JSON.stringify(data)).toBe(before);
  });
  it('remaps cross-file identities, preserves perks, and rotates actors and primary meshes together', () => {
    const f = floor([0.125, -0.75, 10]),
      p = trap(f);
    p.transform.rotation = unrealRotator(12, 23, 34);
    p.meshTransform = {
      translation: [42.125, 67.75, 89.5],
      rotation: unrealRotator(21, 32, 43),
      scale: [-1, 0.5, 2],
    };
    const group = copyGroup(capture([f, p]), new Set([f.actorPath])),
      plan = planPaste(capture([]), group, [1024, 2048, 30], 90, false);
    expect(plan.errors).toEqual([]);
    expect(plan.records).toHaveLength(2);
    const [a, b] = plan.records;
    expect(a.actorPath).not.toBe(f.actorPath);
    expect(attachment(b)?.supportActorPath).toBe(a.actorPath);
    expect(b.trapPerks).toBe(p.trapPerks);
    expect(b.meshTransform.scale).toEqual(p.meshTransform.scale);
    near(b.meshTransform.translation, [955.5, 2090, 109.5]);
    const originalLocal = new Vector3(...p.meshTransform.translation)
      .sub(new Vector3(...p.transform.translation))
      .applyQuaternion(new Quaternion(...p.transform.rotation).invert());
    const newLocal = new Vector3(...b.meshTransform.translation)
      .sub(new Vector3(...b.transform.translation))
      .applyQuaternion(new Quaternion(...b.transform.rotation).invert());
    near(newLocal.toArray(), originalLocal.toArray());
  });
  it('reuses exact supports and traps, but blocks conflicting variants atomically', () => {
    const f = floor(),
      p = trap(f),
      data = capture([f, p]),
      group = copyGroup(data, new Set([f.actorPath]));
    const same = planPaste(data, group, group.anchor, 0, false);
    expect(same.skipped).toBe(2);
    expect(same.records).toEqual([]);
    const onlySupport = capture([f]),
      newTrap = planPaste(onlySupport, group, group.anchor, 0, false);
    expect(newTrap.skipped).toBe(1);
    expect(attachment(newTrap.records[0])?.supportActorPath).toBe(f.actorPath);
    const alternate = structuredClone(data);
    alternate.placements[1].trapPerks = 'different';
    const conflict = planPaste(alternate, group, group.anchor, 0, false);
    expect(conflict.errors.length).toBeGreaterThan(0);
    const doc = new EditorDocument('test', alternate, null);
    expect(() => doc.paste(conflict)).toThrow();
    expect(doc.data).toBe(alternate);
  });
  it('does not quantize existing precision on an unchanged paste', () => {
    const f = floor([10000, 20000, 30000]),
      p = trap(f);
    p.transform.translation = [0.000000000001, 1.0000000000000002, Number.MIN_VALUE];
    p.meshTransform = structuredClone(p.transform);
    const group = copyGroup(capture([f, p]), new Set([f.actorPath]));
    const plan = planPaste(capture([]), group, group.anchor, 0, false);
    expect(plan.records[1].transform).toEqual(p.transform);
  });
  it('snaps only group displacement and maintains offset spacing', () => {
    const f = floor([0.25, 0.125, 1]),
      p = trap(f);
    p.transform.translation[0] += 13.7;
    const group = copyGroup(capture([f, p]), new Set([f.actorPath])),
      plan = planPaste(capture([]), group, [600, 0, 402], 0, true);
    near(plan.records[0].transform.translation, [512.25, 0.125, 385]);
    near(plan.records[1].transform.translation, [525.95, 0.125, 385]);
  });
  it('deletes supports with traps and restores complete groups through undo/redo', () => {
    const f = floor(),
      p = trap(f),
      doc = new EditorDocument('test', capture([f, p]), null);
    doc.selected.add(f.actorPath);
    doc.deleteSelected();
    expect(doc.data.placements).toHaveLength(0);
    doc.undo();
    expect(doc.data.placements).toEqual([f, p]);
    doc.redo();
    expect(doc.data.placements).toHaveLength(0);
    doc.undo();
    doc.selected = new Set([p.actorPath]);
    doc.offsetSelected({ position: [1, 0, 0], angles: [0, 0, 0] });
    expect(doc.canRedo).toBe(false);
    doc.undo();
    expect(doc.data.placements[1]).toEqual(p);
  });
  it('blocks unresolved traps and fixed map actors from becoming copied buildings', () => {
    const f = floor(),
      p = trap(f);
    expect(() => copyGroup(capture([p]), new Set([p.actorPath]))).toThrow(/support/);
    f.captureRole = 'existing-world';
    expect(() => copyGroup(capture([f]), new Set([f.actorPath]))).toThrow(/scenery/);
    expect(exportIssues(capture([f, p])).length).toBeGreaterThan(0);
  });
});
const directory = path.join(process.env.LOCALAPPDATA ?? '', 'FortniteGame/Saved/SaveGames');
const files = existsSync(directory)
  ? readdirSync(directory).filter(
      (f) => f.startsWith('STW_Homebase_') && f.endsWith('.sav') && !/Library|Recovery/.test(f),
    )
  : [];
it.skipIf(!files.length)(
  'roundtrips a real menu save with merged groups, exact replay fields and refreshed attachments',
  () => {
    const bytes = readFileSync(
        path.join(
          directory,
          files.find((f) => f.includes('NightcoreASAP') && f.includes('Stonewood')) ?? files[0],
        ),
      ),
      original = parseCapture(bytes);
    const f = original.placements.find(
      (p) =>
        p.kind === 'structure' &&
        original.placements.some(
          (t) => t.kind === 'trap' && attachment(t)?.supportActorPath === p.actorPath,
        ),
    )!;
    const group = copyGroup(original, new Set([f.actorPath])),
      plan = planPaste(capture([]), group, [10000, 20000, 768], 90, false);
    const merged = capture(plan.records);
    merged.editorName = 'Custom 二 | 100%\nblueprint';
    const result = exportSave(bytes, merged),
      parsed = parseCapture(result),
      lines = readSaveText(result).split('\n');
    expect(parsed.placements).toHaveLength(plan.records.length);
    expect(parsed.editorName).toBe(merged.editorName);
    expect(lines.length).toBe(parsed.placements.length + 2);
    const decode = (s: string) =>
      s
        .replaceAll('%0D', '\r')
        .replaceAll('%0A', '\n')
        .replaceAll('%7C', '|')
        .replaceAll('%25', '%');
    for (let i = 2; i < lines.length; i++) {
      const fields = lines[i].split('|').map(decode);
      expect(fields).toHaveLength(17);
      const p = parsed.placements[i - 2];
      expect(JSON.parse(fields[16])).toEqual(p);
      expect(JSON.parse(fields[11])).toEqual(p.transform);
      expect(JSON.parse(fields[12])).toEqual(p.meshTransform);
      expect(fields[0]).toBe('placement');
      if (p.kind === 'trap') {
        const a = attachment(p)!,
          parent = parsed.placements.find((t) => t.actorPath === a.supportActorPath)!;
        expect(a.supportTransform).toEqual(parent.transform);
        expect(a.relativeTransform).toEqual(relativePose(p.transform, parent.transform));
      }
    }
    mkdirSync('artifacts/validation', { recursive: true });
    writeFileSync('artifacts/validation/editor-export.sav', result);
    writeFileSync('artifacts/validation/editor-export.json', JSON.stringify(parsed));
    expect(readSaveText(bytes)).toBe(
      readSaveText(
        readFileSync(
          path.join(
            directory,
            files.find((f) => f.includes('NightcoreASAP') && f.includes('Stonewood')) ?? files[0],
          ),
        ),
      ),
    );
  },
);
it('escapes 17 replay fields and refreshes stale attachment snapshots', () => {
  const f = floor(),
    p = trap(f);
  p.actorPath = 'Actor%7C|二\nline';
  const data = exportCapture(capture([f, p]));
  const row = replayRow(data.placements[1]);
  expect(row.split('|')).toHaveLength(17);
  expect(row).toContain('Actor%257C%7C二%0Aline');
});

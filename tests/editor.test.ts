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
  type Vec3,
  withOffsets,
  copyGroup,
  planPaste,
  placementConflict,
  relativePose,
  rotationYaw,
  exportIssues,
} from '../src/core/editor';
import { EDIT_PATTERNS, editStructure } from '../src/core/build-pieces';
import { menuContainer } from '../src/cloud/convert';
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
      placeStructure({ ...f, captureRole: 'unavailable' }, 'wall', 'north', 0, 1),
    ).toThrow(/supported building/);
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
  it('reuses exact supports, and never blocks a paste for an occupied trap pose', () => {
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
    alternate.placements[1].trapLevel = 9;
    const perks = planPaste(alternate, group, group.anchor, 0, false);
    expect(perks.errors).toEqual([]);
    expect(perks.skipped).toBe(2);
    expect(perks.records).toEqual([]);
    const otherTrap = structuredClone(data);
    otherTrap.placements[1].itemPath = 'TID_Floor_Freeze_R_T04.TID_Floor_Freeze_R_T04';
    otherTrap.placements[1].meshPath = '/Game/Weapons/FORT_TRAPS/Floor/Freeze/SM_Freeze_Trap_R_T04';
    const occupied = planPaste(otherTrap, group, group.anchor, 0, false);
    expect(occupied.errors).toEqual([]);
    expect(occupied.skipped).toBe(2);
    expect(occupied.records).toEqual([]);
  });
  it('pastes the rest of a bulk group when one destination trap is already there', () => {
    const base = floor([0, 256, 384]),
      second = floor([1024, 256, 384]),
      first = trap(base),
      other = trap(second);
    const source = capture([base, first, second, other]),
      group = copyGroup(source, new Set([base.actorPath, second.actorPath]));
    const destination = structuredClone(source);
    destination.placements[1].trapPerks = 'upgraded|perk';
    destination.placements[1].trapLevel = 50;
    const plan = planPaste(destination, group, group.anchor, 0, false);
    expect(plan.errors).toEqual([]);
    expect(plan.skipped).toBe(4);
    const moved = planPaste(destination, group, [4096, 256, 384], 0, false);
    expect(moved.errors).toEqual([]);
    expect(moved.records).toHaveLength(4);
    destination.placements[1].itemPath = 'TID_Floor_Freeze_R_T04.TID_Floor_Freeze_R_T04';
    const swapped = planPaste(destination, group, group.anchor, 0, false);
    expect(swapped.errors).toEqual([]);
    expect(swapped.skipped).toBe(4);
  });
  it('reuses an occupied tile instead of aborting the paste when the variant differs', () => {
    const f = floor([0, 256, 384]),
      mounted = trap(f),
      group = copyGroup(capture([f, mounted]), new Set([f.actorPath]));
    const edited = structuredClone(capture([f])),
      plan = planPaste(edited, group, group.anchor, 0, false);
    expect(plan.errors).toEqual([]);
    expect(plan.skipped).toBe(1);
    expect(plan.records).toHaveLength(1);
    expect(attachment(plan.records[0])?.supportActorPath).toBe(f.actorPath);
    const variant = structuredClone(capture([f]));
    variant.placements[0].mirrored = true;
    variant.placements[0].meshTransform.translation = [0, 256, 384];
    const merged = planPaste(variant, group, group.anchor, 0, false);
    expect(merged.errors).toEqual([]);
    expect(merged.skipped).toBe(1);
    expect(merged.records).toHaveLength(1);
    expect(attachment(merged.records[0])?.supportActorPath).toBe(f.actorPath);
    const wall = buildingRecord('wall', 2, 3, pose()),
      wallGroup = copyGroup(capture([wall]), new Set([wall.actorPath])),
      bricked = structuredClone(capture([wall]));
    bricked.placements[0].classPath = '/Game/Building/Brick/Brick_Wall.Brick_Wall_C';
    const occupied = planPaste(bricked, wallGroup, wallGroup.anchor, 0, false);
    expect(occupied.errors).toEqual([]);
    expect(occupied.skipped).toBe(1);
    expect(occupied.records).toEqual([]);
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
  it('snaps the pasted anchor onto the real lattice while preserving offset spacing', () => {
    const f = floor([0.25, 0.125, 1]),
      p = trap(f);
    p.transform.translation[0] += 13.7;
    const group = copyGroup(capture([f, p]), new Set([f.actorPath])),
      plan = planPaste(capture([]), group, [600, 0, 402], 0, true);
    near(plan.records[0].transform.translation, [512, 256, 384]);
    near(plan.records[1].transform.translation, [525.7, 256, 384]);
  });
  it('keeps pasted structures and their traps on the real lattice for every quarter turn', () => {
    const lattice = (yaw: number): [number, number] => (yaw % 180 === 0 ? [0, 256] : [256, 0]);
    const mod = (n: number, m: number) => ((n % m) + m) % m;
    const yawOf = (rotation: number[]) =>
      ((Math.round(
        (Math.atan2(
          2 * (rotation[3] * rotation[2] + rotation[0] * rotation[1]),
          1 - 2 * (rotation[1] * rotation[1] + rotation[2] * rotation[2]),
        ) *
          180) /
          Math.PI,
      ) %
        360) +
        360) %
      360;
    const onLattice = (piece: Placement) => {
      const [ex, ey] = lattice(yawOf(piece.transform.rotation));
      expect(mod(piece.transform.translation[0], 512)).toBe(ex);
      expect(mod(piece.transform.translation[1], 512)).toBe(ey);
      expect(mod(piece.transform.translation[2], 384)).toBe(0);
    };
    const wall = (at: Pose['translation'], yaw = 0) => buildingRecord('wall', 2, 3, pose(at, yaw));
    for (const sourceYaw of [0, 90, 180, 270]) {
      const [px, py] = lattice(sourceYaw),
        support = floor([px + 1536, py + 2560, 768], sourceYaw),
        edge = wall([px + 1536, py + 2560, 0], sourceYaw),
        attached = trap(support),
        group = copyGroup(
          capture([support, edge, attached]),
          new Set([support.actorPath, edge.actorPath]),
        );
      for (const turn of [0, 90, 180, 270]) {
        const plan = planPaste(capture([]), group, [12048.5, 20000.5, 700], turn, true);
        expect(plan.errors).toEqual([]);
        expect(plan.records).toHaveLength(3);
        for (const piece of plan.records) onLattice(piece);
      }
    }
  });
  it('keeps group heights when the copied anchor is an off-lattice trap', () => {
    const f = floor([0, 256, 384]),
      wall = placeStructure(f, 'wall', 'south', 2, 3),
      mounted = trap(wall, 'Wall');
    mounted.transform.translation = [0, 256, 1448];
    mounted.meshTransform.translation = [0, 256, 1448];
    mounted.attachment = {
      ...attachment(mounted)!,
      status: 'resolved',
      supportActorPath: wall.actorPath,
      supportTransform: structuredClone(wall.transform),
      relativeTransform: relativePose(mounted.transform, wall.transform),
      side: 0,
    };
    const group = copyGroup(
      capture([f, wall, mounted]),
      new Set([mounted.actorPath, f.actorPath, wall.actorPath]),
    );
    expect(rotationYaw(group.anchorRotation)).toBe(0);
    const plan = planPaste(capture([]), group, group.anchor, 0, true);
    const floorPasted = plan.records.find(
        (p) => p.kind === 'structure' && p.meshPath.includes('Floor'),
      )!,
      wallPasted = plan.records.find(
        (p) => p.kind === 'structure' && p.meshPath.includes('Solid'),
      )!,
      trapPasted = plan.records.find((p) => p.kind === 'trap')!;
    expect(floorPasted.transform.translation[2]).toBe(384);
    expect(wallPasted.transform.translation[2]).toBe(384);
    expect(trapPasted.transform.translation[2]).toBe(1448);
    const lowered = planPaste(capture([]), group, [0, 256, 1152], 0, true);
    for (const piece of lowered.records.filter((p) => p.kind === 'structure'))
      expect(((piece.transform.translation[2] % 384) + 384) % 384).toBe(0);
    expect(lowered.records.find((p) => p.kind === 'trap')!.transform.translation[2]).toBe(1064);
  });
  it('keeps the support on the lattice when a turned trap is the copied anchor', () => {
    const mod = (n: number, m: number) => ((n % m) + m) % m;
    const lattice = (yaw: number): [number, number] => (yaw % 180 === 0 ? [0, 256] : [256, 0]);
    const support = floor([0, 256, 0], 0),
      attached = placeTrap(template(), support, 90, 0, ZERO_OFFSETS, 'standard'),
      group = copyGroup(capture([support, attached]), new Set([attached.actorPath]));
    for (const turn of [0, 90, 180, 270]) {
      const plan = planPaste(capture([]), group, [5000, 7000, 768], turn, true);
      expect(plan.errors).toEqual([]);
      expect(plan.records).toHaveLength(2);
      const pastedTrap = plan.records.find((p) => p.kind === 'trap')!,
        pastedSupport = plan.records.find((p) => p.kind === 'structure')!,
        [tx, ty] = lattice((90 + turn) % 360),
        [sx, sy] = lattice(turn);
      expect(mod(pastedTrap.transform.translation[0], 512)).toBe(tx);
      expect(mod(pastedTrap.transform.translation[1], 512)).toBe(ty);
      expect(mod(pastedSupport.transform.translation[0], 512)).toBe(sx);
      expect(mod(pastedSupport.transform.translation[1], 512)).toBe(sy);
    }
  });
  it('re-seats an off-lattice legacy piece onto the real lattice when snapped', () => {
    const mod = (n: number, m: number) => ((n % m) + m) % m;
    const legacy = floor([3072, -4096, -384], 0),
      group = copyGroup(capture([legacy]), new Set([legacy.actorPath]));
    const flat = planPaste(capture([]), group, [3072, -4096, -384], 0, true);
    expect(mod(flat.records[0].transform.translation[1], 512)).toBe(256);
    const turned = planPaste(capture([]), group, [3072, -4096, -384], 90, true);
    expect(mod(turned.records[0].transform.translation[0], 512)).toBe(256);
    expect(mod(turned.records[0].transform.translation[1], 512)).toBe(0);
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
    expect(exportIssues(capture([f, p]))).toEqual([]);
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

describe('cone trap supports', () => {
  for (const pattern of EDIT_PATTERNS.filter((p) => p.id === 'RoofS')) {
    it(`uses the floor base and pivot for ${pattern.id} at all quarter turns`, () => {
      for (const material of [0, 1, 2] as const)
        for (const yaw of [0, 90, 180, 270])
          for (const mirror of [false, true]) {
            const cone = editStructure(
              buildingRecord('roof', material, 3, pose([128, 256, 768])),
              pattern,
              yaw,
              mirror,
            );
            const base = buildingRecord('floor', material, 3, {
              ...cone.transform,
              scale: [1, 1, 1],
            });
            for (const kind of ['Floor', 'Ceiling']) {
              const a = placeTrap(
                  template(kind),
                  cone,
                  0,
                  0,
                  ZERO_OFFSETS,
                  'standard',
                  false,
                  false,
                ),
                b = trap(base, kind);
              expect(a.transform).toEqual(b.transform);
              expect(a.meshTransform).toEqual(b.meshTransform);
              expect(a.transform.translation[2]).toBe(768);
              expect(attachment(a)?.supportActorPath).toBe(cone.actorPath);
              const automatic = trap(cone, kind);
              const forwardOffset = new Vector3(0, -512, 0)
                .applyQuaternion(new Quaternion(...cone.transform.rotation))
                .setZ(-91)
                .toArray() as Vec3;
              const expected = withOffsets(
                b,
                { position: forwardOffset, angles: [0, 180, 180] },
                base,
              );
              expect(automatic.transform).toEqual(expected.transform);
              expect(automatic.meshTransform).toEqual(expected.meshTransform);
              expect(automatic.editorPlacementMode).toBe('menu-offset');
              expect(attachment(automatic)?.supportActorPath).toBe(cone.actorPath);
              expect(placementConflict(trap(cone, kind), [automatic])).toMatch(/exact position/);

              for (const z of [0, -91, -256, -472]) {
                for (const angles of [
                  [0, 180, 0],
                  [0, 180, 180],
                  [180, 180, 0],
                ] as Vec3[]) {
                  const offsets = { position: [0, 0, z] as Vec3, angles, constrainZ: true };
                  const moved = placeTrap(
                    template(kind),
                    cone,
                    0,
                    0,
                    offsets,
                    'menu-offset',
                    false,
                    false,
                  );
                  expect(moved.transform).toEqual(
                    placeTrap(template(kind), base, 0, 0, offsets, 'menu-offset').transform,
                  );
                  expect(moved.transform.translation[2]).toBe(768 + z);
                  expect(attachment(moved)?.relativeTransform).toEqual(
                    relativePose(moved.transform, cone.transform),
                  );
                }
              }
              const center = (p: Placement) =>
                new Vector3(0, 256, 0)
                  .applyQuaternion(new Quaternion(...p.meshTransform.rotation))
                  .add(new Vector3(...p.meshTransform.translation));
              const yawed = withOffsets(a, { position: [0, 0, 0], angles: [0, 180, 0] }, cone);
              const displacement = center(yawed).sub(center(a));
              const forward = new Vector3(0, -512, 0).applyQuaternion(
                new Quaternion(...cone.transform.rotation),
              );
              near(displacement.toArray(), forward.toArray());
              near(
                center(withOffsets(a, { position: [-500, 0, 0], angles: [0, 0, 0] }, cone))
                  .sub(center(a))
                  .toArray(),
                [-500, 0, 0],
              );
            }
            expect(() => trap(cone, 'Wall')).toThrow(/wall support/);
          }
    });
  }
  it('places the trap one tile in front of the cone at the same lowered height regardless of trap rotation', () => {
    const directions: Vec3[] = [
      [0, -512, -91],
      [512, 0, -91],
      [0, 512, -91],
      [-512, 0, -91],
    ];
    for (const [index, yaw] of [0, 90, 180, 270].entries())
      for (const turn of [0, 90, 180, 270])
        for (const kind of ['Floor', 'Ceiling'])
          for (const centrePivot of [false, true]) {
            const cone = editStructure(
              buildingRecord('roof', 2, 3, pose([123.125, -456.75, 768])),
              EDIT_PATTERNS.find((p) => p.id === 'RoofS')!,
              yaw,
            );
            const source = template(kind);
            if (centrePivot) source.meshPath = '/patrol_ward_trap.patrol_ward_trap';
            const placed = placeTrap(source, cone, turn, 0, ZERO_OFFSETS, 'standard');
            const supportCenter = new Vector3(0, 256, 0)
              .applyQuaternion(new Quaternion(...cone.transform.rotation))
              .add(new Vector3(...cone.transform.translation));
            const trapCenter = new Vector3(0, centrePivot ? 0 : 256, 0)
              .applyQuaternion(new Quaternion(...placed.meshTransform.rotation))
              .add(new Vector3(...placed.meshTransform.translation));
            near(trapCenter.sub(supportCenter).toArray(), directions[index]);
            expect(placed.transform.translation[2]).toBe(677);
            expect(attachment(placed)?.relativeTransform).toEqual(
              relativePose(placed.transform, cone.transform),
            );
          }
  });
  it('adds adjustments after auto-fit and lets placed traps be edited without reapplying it', () => {
    const cone = editStructure(
      buildingRecord('roof', 2, 3, pose()),
      EDIT_PATTERNS.find((p) => p.id === 'RoofS')!,
      270,
    );
    const automatic = trap(cone, 'Ceiling');
    const offsets = {
      position: [17, -8, -381] as Vec3,
      angles: [0, 90, 0] as Vec3,
      constrainZ: true,
    };
    const adjusted = placeTrap(template('Ceiling'), cone, 0, 0, offsets, 'menu-offset');
    expect(adjusted.transform).toEqual(withOffsets(automatic, offsets, cone).transform);
    expect(adjusted.transform.translation[2]).toBe(-472);
    expect(() =>
      placeTrap(
        template('Ceiling'),
        cone,
        0,
        0,
        { ...offsets, position: [0, 0, -382] },
        'menu-offset',
      ),
    ).toThrow(/Z limit/);
    const doc = new EditorDocument('auto cone', capture([cone]), null);
    doc.add(automatic);
    doc.offsetSelected({ position: [0, 0, -20], angles: [0, 0, 0], constrainZ: true });
    expect(doc.data.placements[1].transform.translation[2]).toBe(-111);
    const loaded = parseCapture(exportSave(menuContainer(), doc.data));
    expect(loaded.placements[1].transform).toEqual(doc.data.placements[1].transform);
    expect(attachment(loaded.placements[1])?.relativeTransform).toEqual(
      relativePose(doc.data.placements[1].transform, cone.transform),
    );
    doc.undo();
    expect(doc.data.placements[1].transform).toEqual(automatic.transform);
    doc.redo();
    expect(doc.data.placements[1].transform.translation[2]).toBe(-111);
  });
  it('requires the ramp edit and rejects other cone shapes and ordinary ramps', () => {
    for (const pattern of EDIT_PATTERNS.filter((p) => p.kind === 'roof' && p.id !== 'RoofS'))
      for (const turn of [0, 90, 180, 270]) {
        const cone = editStructure(buildingRecord('roof', 2, 3, pose()), pattern, turn);
        for (const kind of ['Floor', 'Ceiling'])
          expect(() => trap(cone, kind)).toThrow(/Edit the cone into a ramp/);
      }
    for (const kind of ['Floor', 'Ceiling'])
      expect(() => trap(buildingRecord('stair', 2, 3, pose()), kind)).toThrow(
        /supported building piece/,
      );
  });
  it('exports offset ceiling traps with their edited cone attachment and supports undo', () => {
    const cone = editStructure(
      buildingRecord('roof', 2, 3, pose()),
      EDIT_PATTERNS.find((p) => p.id === 'RoofS')!,
      90,
    );
    const t = placeTrap(
      template('Ceiling'),
      cone,
      0,
      0,
      { position: [0, 0, -472], angles: [0, 180, 180], constrainZ: true },
      'menu-offset',
      false,
      false,
    );
    mkdirSync('artifacts/validation', { recursive: true });
    writeFileSync(
      'artifacts/validation/build-cone-trap.sav',
      exportSave(menuContainer(), { ...capture([cone, t]), worldPath: 'Building edit fixture' }),
    );
    const doc = new EditorDocument('cone', capture([cone]), null);
    doc.add(t);
    const loaded = parseCapture(exportSave(menuContainer(), doc.data));
    expect(exportIssues(loaded)).toEqual([]);
    expect(loaded.placements[1].transform).toEqual(t.transform);
    expect(attachment(loaded.placements[1])?.supportActorPath).toBe(cone.actorPath);
    doc.undo();
    expect(doc.data.placements).toEqual([cone]);
    doc.redo();
    expect(doc.data.placements).toEqual([cone, t]);
  });
});

const trapSave = path.join(directory, 'STW_Homebase_99_Imported_491e452a.sav');
it.skipIf(!existsSync(trapSave))(
  'reuses a real build whose destination traps were retuned instead of blocking the paste',
  () => {
    const src = parseCapture(new Uint8Array(readFileSync(trapSave)));
    const group = copyGroup(src, new Set(src.placements.map((p) => p.actorPath)));
    const destination = structuredClone(src);
    for (const p of destination.placements)
      if (p.kind === 'trap') {
        p.trapPerks = 'retuned|perk';
        p.trapLevel = 1;
      }
    const plan = planPaste(destination, group, group.anchor, 0, true);
    expect(plan.errors).toEqual([]);
    expect(plan.records).toEqual([]);
    expect(plan.skipped).toBe(group.records.length);
    const moved = planPaste(destination, group, [8192, 4096, group.anchor[2]], 90, true);
    expect(moved.errors).toEqual([]);
    expect(moved.records).toHaveLength(group.records.length);
    const retiled = structuredClone(src),
      changed = retiled.placements.find((p) => p.kind === 'structure')!;
    changed.meshTransform.translation = [changed.meshTransform.translation[0], 1, 2];
    const merged = planPaste(retiled, group, group.anchor, 0, true);
    expect(merged.errors).toEqual([]);
    expect(merged.records).toEqual([]);
    expect(merged.skipped).toBe(group.records.length);
  },
);

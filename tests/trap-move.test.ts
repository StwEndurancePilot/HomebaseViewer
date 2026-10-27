import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { dragOffset } from '../src/scene/trap-mover';
import { scenePoint } from '../src/core/transforms';
import { parseCapture, type Placement, type Capture } from '../src/core/save';
import {
  attachment,
  trapZDeltaRange,
  selectionZDeltaRange,
  buildingRecord,
  placeTrap,
  flipCeilingTrap,
  unrealRotator,
  relativePose,
  withOffsets,
  ZERO_OFFSETS,
} from '../src/core/editor';
import { EditorDocument } from '../src/core/editor-document';
const support = () =>
  buildingRecord('floor', 2, 3, {
    translation: [123.125, -456.75, 789.5],
    rotation: unrealRotator(0, 90, 0),
    scale: [1, 1, 1],
  });
const template = (f: Placement): Placement => ({
  ...structuredClone(f),
  kind: 'trap',
  classPath: '/Trap_Ceiling_Electric.Trap_Ceiling_Electric_C',
  itemPath: '/TID_Ceiling_Electric',
  attachmentType: 2,
  trapPerks: 'captured-perks',
  trapLevel: 50,
});
const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 8));
describe('world XYZ drag', () => {
  it('maps each positive Unreal axis correctly through the reflected scene basis', () => {
    const start = scenePoint([123.125, -56.75, 789.5]);
    for (const delta of [
      [128, 0, 0],
      [0, 128, 0],
      [0, 0, 128],
    ] as [number, number, number][])
      near(dragOffset(start, start.clone().add(scenePoint(delta)), 0, 2000), delta);
  });
  it('snaps only delta and bounds each axis independently', () => {
    const start = scenePoint([0.125, 0.75, 100.0625]),
      end = start.clone().add(scenePoint([9999, -31, 129]));
    near(dragOffset(start, end, 16, 1000), [1000, -32, 128]);
    near(dragOffset(start, end, 0, Infinity), [9999, -31, 129]);
  });
  it('offers the two actual menu UI limits without clamping loaded positions', () => {
    const f = support(),
      p = placeTrap(template(f), f, 0, 0, ZERO_OFFSETS, 'standard');
    p.transform.translation[0] += 16640;
    expect(() =>
      withOffsets(p, { position: [1001, 0, 0], angles: [0, 0, 0], limit: 'placement' }, f),
    ).toThrow(/1000/);
    expect(() =>
      withOffsets(p, { position: [0, 0, 0], angles: [181, 0, 0], limit: 'placement' }, f),
    ).toThrow(/180/);
    const moved = withOffsets(p, { position: [2000, 0, 0], angles: [0, 0, 0], limit: 'free' }, f);
    expect(moved.transform.translation[0]).toBe(p.transform.translation[0] + 2000);
    expect(
      withOffsets(p, { position: [16640, 0, 0], angles: [0, 0, 0], limit: 'unrestricted' }, f)
        .transform.translation[0],
    ).toBe(p.transform.translation[0] + 16640);
    expect(() =>
      withOffsets(p, { position: [Infinity, 0, 0], angles: [0, 0, 0], limit: 'unrestricted' }, f),
    ).toThrow(/finite/);
  });
});
describe('upside-down ceiling traps', () => {
  it('inverts around local pitch, centres all four turns, and retains ceiling attachment', () => {
    const f = support();
    for (const turn of [0, 90, 180, 270]) {
      const p = placeTrap(template(f), f, turn, 0, ZERO_OFFSETS, 'standard', true);
      near(
        new Vector3(0, 0, 1).applyQuaternion(new Quaternion(...p.transform.rotation)).toArray(),
        [0, 0, -1],
      );
      near(
        new Vector3(0, 256, 0)
          .applyQuaternion(new Quaternion(...p.transform.rotation))
          .add(new Vector3(...p.transform.translation))
          .toArray(),
        new Vector3(0, 256, 0)
          .applyQuaternion(new Quaternion(...f.transform.rotation))
          .add(new Vector3(...f.transform.translation))
          .toArray(),
      );
      expect(p.attachmentType).toBe(2);
      expect(attachment(p)?.side).toBe(1);
      expect(attachment(p)?.supportActorPath).toBe(f.actorPath);
      expect(p.trapPerks).toBe('captured-perks');
    }
  });
  it('preserves existing arbitrary offsets and primary component transforms, with one undo step', () => {
    const f = support(),
      p = placeTrap(
        template(f),
        f,
        90,
        0,
        { position: [512, 755, 380], angles: [0, 0, 0] },
        'menu-offset',
      );
    p.meshTransform.translation[0] += 12;
    p.meshTransform.scale = [-1, 2, 0.5];
    const before = structuredClone(p),
      local = relativePose(p.meshTransform, p.transform),
      flipped = flipCeilingTrap(p, f);
    expect(flipped.transform.translation).toEqual(before.transform.translation);
    expect(flipped.meshTransform.scale).toEqual(before.meshTransform.scale);
    near(relativePose(flipped.meshTransform, flipped.transform).translation, local.translation);
    const twice = flipCeilingTrap(flipped, f);
    near(twice.meshTransform.translation, p.meshTransform.translation);
    expect(
      Math.abs(
        new Quaternion(...twice.transform.rotation).dot(new Quaternion(...p.transform.rotation)),
      ),
    ).toBeCloseTo(1, 12);
    const doc = new EditorDocument(
      'test',
      {
        schemaVersion: 6,
        format: 'stw-homebase-capture',
        worldPath: 'custom',
        placements: [f, p],
        completeHomebase: false,
      } as Capture,
      null,
    );
    doc.selected = new Set([p.actorPath]);
    doc.flipSelectedCeilings();
    expect(doc.revision).toBe(1);
    doc.undo();
    expect(doc.data.placements[1]).toEqual(before);
  });
  it('reproduces actual captured upside-down ceiling placements with zero relative offset', () => {
    const dir = path.join(process.env.LOCALAPPDATA ?? '', 'FortniteGame/Saved/SaveGames');
    if (!existsSync(dir)) return;
    let matched = 0;
    for (const name of readdirSync(dir).filter(
      (n) => n.startsWith('STW_Homebase_') && n.endsWith('.sav') && !/Library|Recovery/.test(n),
    )) {
      const data = parseCapture(new Uint8Array(readFileSync(path.join(dir, name)))),
        byId = new Map(data.placements.map((p) => [p.actorPath, p]));
      for (const p of data.placements) {
        if (p.kind !== 'trap' || !p.classPath.includes('Trap_Ceiling_')) continue;
        const f = byId.get(attachment(p)?.supportActorPath ?? '');
        if (!f) continue;
        const local = relativePose(p.transform, f.transform);
        if (
          new Vector3(...local.translation).length() > 1e-6 ||
          Math.abs(local.rotation[1]) < 1 - 1e-6
        )
          continue;
        const generated = placeTrap(p, f, 0, 0, ZERO_OFFSETS, 'standard', true);
        near(generated.transform.translation, p.transform.translation);
        near(generated.meshTransform.translation, p.meshTransform.translation);
        expect(
          Math.abs(
            new Quaternion(...generated.transform.rotation).dot(
              new Quaternion(...p.transform.rotation),
            ),
          ),
        ).toBeCloseTo(1, 10);
        expect(attachment(generated)?.side).toBe(attachment(p)?.side);
        expect(generated.attachmentType).toBe(p.attachmentType);
        matched++;
      }
    }
    expect(matched).toBeGreaterThan(1000);
  });
});
describe('estimated support-relative Z limits', () => {
  const edit = (z: number) => ({
    position: [0, 0, z] as [number, number, number],
    angles: [0, 0, 0] as [number, number, number],
    constrainZ: true,
  });
  it('checks total offset, with exact boundaries and no repeated-edit bypass', () => {
    for (const category of ['Floor', 'Ceiling', 'Wall']) {
      const f = support(),
        p = placeTrap(template(f), f, 0, 0, ZERO_OFFSETS, 'standard');
      p.classPath = `/Trap_${category}_Electric`;
      p.itemPath = `/TID_${category}_Electric`;
      const [min, max] = category === 'Wall' ? [-345, 720] : [-472, 472];
      expect(trapZDeltaRange(p, f)).toEqual([min, max]);
      const top = withOffsets(p, edit(max), f),
        bottom = withOffsets(p, edit(min), f);
      expect(top.transform.translation[2] - f.transform.translation[2]).toBe(max);
      expect(bottom.transform.translation[2] - f.transform.translation[2]).toBe(min);
      expect(() => withOffsets(top, edit(0.125), f)).toThrow(/Estimated/);
      expect(() => withOffsets(bottom, edit(-0.125), f)).toThrow(/Estimated/);
      expect(() => withOffsets(withOffsets(p, edit(max - 10), f), edit(11), f)).toThrow(
        /Estimated/,
      );
    }
  });
  it('keeps the same ceiling range when inverted and supports opt-out', () => {
    const f = support(),
      p = placeTrap(template(f), f, 0, 0, ZERO_OFFSETS, 'standard', true);
    expect(trapZDeltaRange(p, f)).toEqual([-472, 472]);
    expect(() => withOffsets(p, edit(473), f)).toThrow(/Estimated/);
    expect(withOffsets(p, { ...edit(1000), constrainZ: false }, f).transform.translation[2]).toBe(
      p.transform.translation[2] + 1000,
    );
  });
  it('preserves imported exceptions and allows gradual movement toward the range', () => {
    const f = support(),
      p = placeTrap(
        template(f),
        f,
        0,
        0,
        { position: [0, 0, 1000], angles: [0, 0, 0] },
        'menu-offset',
      );
    expect(trapZDeltaRange(p, f)).toEqual([-1472, 0]);
    expect(withOffsets(p, edit(0), f).transform).toEqual(p.transform);
    expect(() => withOffsets(p, edit(1), f)).toThrow(/Estimated/);
    const nearer = withOffsets(p, edit(-100), f);
    expect(nearer.transform.translation[2] - f.transform.translation[2]).toBe(900);
    const below = withOffsets(p, { position: [0, 0, -2000], angles: [0, 0, 0] }, f);
    expect(trapZDeltaRange(below, f)).toEqual([0, 1472]);
    expect(() => withOffsets(below, edit(-1), f)).toThrow(/Estimated/);
  });
  it('intersects bulk ranges and clamps snapped drag to the exact remaining boundary', () => {
    const f = support(),
      p = placeTrap(
        template(f),
        f,
        0,
        0,
        { position: [0, 0, 400], angles: [0, 0, 0] },
        'menu-offset',
      ),
      g = support(),
      w = placeTrap(
        template(g),
        g,
        0,
        0,
        { position: [0, 0, -300], angles: [0, 0, 0] },
        'menu-offset',
      );
    w.classPath = '/Trap_Wall_Electric';
    w.itemPath = '/TID_Wall_Electric';
    const range = selectionZDeltaRange([p, w], [f, p, g, w]);
    expect(range).toEqual([-45, 72]);
    expect(dragOffset(new Vector3(), scenePoint([16, 32, 256]), 128, 2000, range)[2]).toBe(72);
    expect(dragOffset(new Vector3(), scenePoint([16, 32, -256]), 128, 2000, range)[2]).toBe(-45);
    const rows = [f, p, g, w],
      doc = new EditorDocument(
        'bulk',
        {
          schemaVersion: 6,
          format: 'stw-homebase-capture',
          worldPath: 'test',
          placements: rows,
          completeHomebase: false,
        } as Capture,
        null,
      );
    doc.selected = new Set([p.actorPath, w.actorPath]);
    expect(() => doc.offsetSelected(edit(73))).toThrow(/Estimated/);
    expect(doc.revision).toBe(0);
    expect(doc.data.placements).toEqual(rows);
    doc.offsetSelected(edit(72));
    expect(doc.revision).toBe(1);
    doc.undo();
    expect(doc.data.placements).toEqual(rows);
  });
});

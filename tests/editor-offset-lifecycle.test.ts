import { describe, expect, it } from 'vitest';
import { Quaternion } from 'three';
import {
  attachment,
  buildingRecord,
  copyGroup,
  offsetOf,
  placeTrap,
  planPaste,
  rotatedTrap,
  unrealRotator,
  ZERO_OFFSETS,
} from '../src/core/editor';
import { EditorDocument } from '../src/core/editor-document';
import { exportCapture } from '../src/core/export';
import type { Capture, Placement, Pose } from '../src/core/save';

const capture = (placements: Placement[]): Capture => ({
  schemaVersion: 6,
  format: 'stw-homebase-capture',
  worldPath: 'Zone_Outpost_Stonewood',
  completeHomebase: false,
  placements,
});
const near = (actual: number[], expected: number[]) =>
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 6));
const sameRotation = (actual: Pose, expected: Pose) =>
  expect(
    new Quaternion(...actual.rotation).angleTo(new Quaternion(...expected.rotation)),
  ).toBeCloseTo(0, 6);

function setup() {
  const floor = buildingRecord('floor', 2, 3, {
    translation: [0, 256, 384],
    rotation: unrealRotator(0, 0, 0),
    scale: [1, 1, 1],
  });
  const template: Placement = {
    ...structuredClone(floor),
    kind: 'trap',
    classPath: '/Trap_Ceiling_Electric.Trap_Ceiling_Electric_C',
    itemPath: '/TID_Ceiling_Electric',
    attachmentType: 2,
  };
  template.meshTransform.translation = [23, 241, 395];
  const trap = placeTrap(template, floor, 0, 0, ZERO_OFFSETS, 'standard');
  const doc = new EditorDocument('lifecycle', capture([floor, trap]), null);
  doc.selected = new Set([trap.actorPath]);
  const row = () => doc.data.placements.find((p) => p.actorPath === trap.actorPath)!;
  return { doc, floor, trap, row };
}

describe('offset baselines after other editor operations', () => {
  it.each([0, 90, 180, 270])('preserves a %i-degree paste on subsequent edits', (yaw) => {
    const { doc, floor } = setup();
    doc.offsetSelected({ position: [64, -32, 12], angles: [15, 5, -20] });
    const group = copyGroup(doc.data, new Set([floor.actorPath]));
    const plan = planPaste(capture([]), group, [2048, 256, 768], yaw, false);
    expect(plan.errors).toEqual([]);
    const pasted = plan.records.find((p) => p.kind === 'trap')!;
    const dest = new EditorDocument('paste', capture(plan.records), null);
    dest.selected = new Set([pasted.actorPath]);
    const row = () => dest.data.placements.find((p) => p.actorPath === pasted.actorPath)!;
    near(offsetOf(row()).position, [0, 0, 0]);
    near(offsetOf(row()).angles, [0, 0, 0]);
    dest.offsetSelected({ position: [1, 0, 0], angles: [0, 0, 0] });
    sameRotation(row().transform, pasted.transform);
    sameRotation(row().meshTransform, pasted.meshTransform);
    near(
      row().meshTransform.translation,
      pasted.meshTransform.translation.map((v, i) => v + (i === 0 ? 1 : 0)),
    );
    const preview = rotatedTrap(row(), [10, 5, 0]);
    dest.offsetSelected({ position: [0, 0, 0], angles: [10, 5, 0] });
    sameRotation(row().transform, preview.transform);
    sameRotation(row().meshTransform, preview.meshTransform);
    near(row().meshTransform.translation, preview.meshTransform.translation);
    dest.setOffsets(ZERO_OFFSETS);
    near(row().transform.translation, pasted.transform.translation);
    near(row().meshTransform.translation, pasted.meshTransform.translation);
    sameRotation(row().transform, pasted.transform);
    expect(attachment(row())?.supportActorPath).toBe(attachment(pasted)?.supportActorPath);
    const exported = exportCapture(dest.data).placements.find(
      (p) => p.actorPath === pasted.actorPath,
    )!;
    expect(exported.editorBaseTransform).toBeUndefined();
    expect(exported.editorBaseMeshTransform).toBeUndefined();
    expect(exported.editorOffsets).toBeUndefined();
  });

  it('preserves a ceiling flip through movement, absolute Apply and undo/redo', () => {
    const { doc, row } = setup();
    doc.offsetSelected({ position: [64, 0, 0], angles: [15, 30, 10] });
    const before = structuredClone(row());
    doc.flipSelectedCeilings();
    const flipped = structuredClone(row());
    near(offsetOf(row()).angles, [0, 0, 0]);
    doc.offsetSelected({ position: [1, 0, 0], angles: [0, 0, 0] });
    sameRotation(row().transform, flipped.transform);
    sameRotation(row().meshTransform, flipped.meshTransform);
    doc.setOffsets(ZERO_OFFSETS);
    near(row().meshTransform.translation, flipped.meshTransform.translation);
    sameRotation(row().transform, flipped.transform);
    doc.undo();
    doc.undo();
    expect(row()).toEqual(flipped);
    doc.undo();
    expect(row()).toEqual(before);
    doc.redo();
    expect(row()).toEqual(flipped);
  });

  it('does not inherit the template offset baseline when placing a new trap', () => {
    const { doc, row } = setup();
    doc.offsetSelected({ position: [64, 0, 0], angles: [0, 30, 0] });
    const floor = buildingRecord('floor', 2, 3, {
      translation: [4096, 256, 384],
      rotation: unrealRotator(0, 90, 0),
      scale: [1, 1, 1],
    });
    const placed = placeTrap(row(), floor, 90, 0, ZERO_OFFSETS, 'standard');
    const dest = new EditorDocument('new trap', capture([floor, placed]), null);
    dest.selected = new Set([placed.actorPath]);
    dest.offsetSelected({ position: [1, 0, 0], angles: [0, 0, 0] });
    sameRotation(dest.data.placements[1].transform, placed.transform);
    dest.setOffsets(ZERO_OFFSETS);
    near(dest.data.placements[1].transform.translation, placed.transform.translation);
  });
});

describe('paste snapping from a trap anchor', () => {
  it.each([0, 90, 180, 270])('snaps the support after a %i-degree turn', (yaw) => {
    const { doc, trap, floor } = setup();
    doc.offsetSelected({ position: [64, -37, 1064], angles: [10, 35, 20] });
    const group = copyGroup(doc.data, new Set([trap.actorPath]));
    const original = structuredClone(group);
    for (const destination of [
      [1024, 256, 1448],
      [-1400, -1700, 680],
    ] as Pose['translation'][]) {
      const plan = planPaste(capture([]), group, destination, yaw, true);
      expect(plan.errors).toEqual([]);
      const support = plan.records.find((p) => p.kind === 'structure')!;
      const mounted = plan.records.find((p) => p.kind === 'trap')!;
      const mod = (n: number, divisor: number) => ((n % divisor) + divisor) % divisor;
      near(
        support.transform.translation.map((v, i) => mod(v, i === 2 ? 384 : 512)),
        yaw % 180 === 0 ? [0, 256, 0] : [256, 0, 0],
      );
      near(
        attachment(mounted)!.relativeTransform!.translation,
        attachment(group.records.find((p) => p.kind === 'trap')!)!.relativeTransform!.translation,
      );
      expect(attachment(mounted)!.supportActorPath).toBe(support.actorPath);
    }
    expect(group).toEqual(original);
    const unchanged = planPaste(capture([]), group, group.anchor, 0, true);
    near(
      unchanged.records.find((p) => p.kind === 'structure')!.transform.translation,
      floor.transform.translation,
    );
  });
});

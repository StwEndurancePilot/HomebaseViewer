import { it, expect } from 'vitest';
import { replayNumber, replayPose, exportSave, exportCapture } from '../src/core/export';
import { menuContainer } from '../src/cloud/convert';
import { buildingRecord } from '../src/core/editor';
import { readSaveText, parseCapture, type Capture } from '../src/core/save';
import { validateReplayRows } from '../src/core/replay-validation';
import { readFileSync, existsSync } from 'node:fs';
it('writes runtime-safe decimals without changing binary64 values', () => {
  for (const n of [
    0,
    -0,
    1,
    -1,
    0.1,
    Math.PI,
    6.123233995736766e-17,
    -1e-7,
    1e21,
    1.23456789e30,
    Number.MIN_VALUE,
    Number.MAX_VALUE,
  ]) {
    const text = replayNumber(n);
    expect(text).toMatch(/^-?\d+(\.\d+)?$/);
    expect(Number(text)).toBe(n === 0 ? 0 : n);
  }
  expect(() => replayNumber(Infinity)).toThrow(/finite/);
});
it.skipIf(!existsSync('D:/Downloads/sota test 3.sav'))(
  'catches the reported file and re-exports it without changing its transforms',
  () => {
    const original = readFileSync('D:/Downloads/sota test 3.sav'),
      before = parseCapture(original);
    expect(() => validateReplayRows(readSaveText(original).split('\n').slice(2))).toThrow(
      /Replay row 7.*6.123233995736766e-17/,
    );
    const bytes = exportSave(original, before),
      after = parseCapture(bytes);
    expect(() => validateReplayRows(readSaveText(bytes).split('\n').slice(2))).not.toThrow();
    expect(after.placements.map((p) => [p.transform, p.meshTransform])).toEqual(
      before.placements.map((p) => [p.transform, p.meshTransform]),
    );
  },
);
it('emits ordered replay poses even when input properties have a different order', () => {
  const pose = {
    scale: [1, 1, 1] as [number, number, number],
    rotation: [0, 0, 1, 6.123233995736766e-17] as [number, number, number, number],
    translation: [1e-8, 2, 3] as [number, number, number],
  };
  const raw = replayPose(pose);
  expect(raw.indexOf('translation')).toBeLessThan(raw.indexOf('rotation'));
  expect(raw.indexOf('rotation')).toBeLessThan(raw.indexOf('scale'));
  expect(raw).not.toMatch(/\de[+-]?\d/i);
  expect(JSON.parse(raw)).toEqual(pose);
  const p = buildingRecord('wall', 2, 3, pose),
    data: Capture = {
      schemaVersion: 6,
      format: 'stw-homebase-capture',
      coordinateUnit: 'unreal-world-units',
      rotationEncoding: 'quaternion-xyzw',
      worldPath: 'test',
      completeHomebase: false,
      placements: [p],
    };
  const bytes = exportSave(menuContainer(), data),
    fields = readSaveText(bytes).split('\n')[2].split('|');
  expect(fields[11]).toBe(raw);
  expect(fields[12]).toBe(raw);
  expect(parseCapture(bytes).placements[0].transform).toEqual(pose);
});
it('recalculates export precision and satisfies the menu build-queue gate', () => {
  const pose = {
    translation: [-12345.625, 98765.125, 768] as [number, number, number],
    rotation: [0, 0, 1, 6.123233995736766e-17] as [number, number, number, number],
    scale: [1, 1, 1] as [number, number, number],
  };
  const data: Capture = {
    schemaVersion: 6,
    format: 'stw-homebase-capture',
    coordinateUnit: 'unreal-world-units',
    rotationEncoding: 'quaternion-xyzw',
    worldPath: 'test',
    completeHomebase: false,
    numericRoundTripFailures: 42,
    placements: [buildingRecord('floor', 2, 3, pose)],
  };
  const bytes = exportSave(menuContainer(), data),
    document = readSaveText(bytes).split('\n')[1];
  expect(document).toContain('"numericRoundTripFailures":0,');
  expect(exportCapture(data).numericRoundTripFailures).toBe(0);
  expect(parseCapture(bytes).placements[0].transform).toEqual(pose);
  expect(data.numericRoundTripFailures).toBe(42);
  expect(
    exportCapture({ ...data, numericRoundTripFailures: undefined }).numericRoundTripFailures,
  ).toBe(0);
});

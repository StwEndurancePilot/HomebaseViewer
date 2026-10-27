import { it, expect } from 'vitest';
import { exportSave, exportJson, exportCapture } from '../src/core/export';
import { menuContainer } from '../src/cloud/convert';
import { buildingRecord } from '../src/core/editor';
import { readSaveText, parseCapture, type Capture } from '../src/core/save';
import { writeFileSync, mkdirSync } from 'node:fs';
const source: Capture = {
  coordinateUnit: 'unreal-world-units',
  rotationEncoding: 'quaternion-xyzw',
  schemaVersion: 6,
  format: 'stw-homebase-capture',
  worldPath: 'Twine — 城 🏠',
  completeHomebase: false,
  placements: [
    buildingRecord('floor', 2, 3, {
      translation: [1.125, 2.25, 384],
      rotation: [0, 0, 1, 6.123233995736766e-17],
      scale: [1, 1, 1],
    }),
  ],
};
function layout(bytes: Uint8Array) {
  const marker = new TextEncoder().encode('\x11\0\0\0ExternalDataJson\0\x0c\0\0\0StrProperty\0');
  let at = -1;
  for (let i = 0; i < bytes.length - marker.length; i++)
    if (marker.every((v, j) => bytes[i + j] === v)) {
      at = i;
      break;
    }
  const size = at + marker.length + 4,
    text = size + 5;
  return { size, text, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
}
it('writes a byte-counted UTF-8 FString without interleaved nulls and retains Unicode', () => {
  const before = structuredClone(source),
    bytes = exportSave(menuContainer(), source),
    { size, text, view } = layout(bytes),
    count = view.getInt32(text, true),
    payload = bytes.subarray(text + 4, text + 4 + count - 1);
  expect(count).toBeGreaterThan(0);
  expect(view.getInt32(size, true)).toBe(count + 4);
  expect(payload.includes(0)).toBe(false);
  expect(bytes[text + 4 + count - 1]).toBe(0);
  expect(new TextDecoder('utf-8', { fatal: true }).decode(payload)).toBe(readSaveText(bytes));
  expect(readSaveText(bytes)).toContain('Twine — 城 🏠');
  expect(parseCapture(bytes).placements[0].transform).toEqual(source.placements[0].transform);
  expect(source).toEqual(before);
  expect(readSaveText(exportSave(bytes, source))).toBe(readSaveText(bytes));
  mkdirSync('artifacts/validation', { recursive: true });
  writeFileSync('artifacts/validation/utf8-unicode-export.sav', bytes);
});
it('still reads old UTF-16 saves and re-exports the same text in UTF-8', () => {
  const bytes = exportSave(menuContainer(), source),
    payload = readSaveText(bytes),
    { size, text, view } = layout(bytes),
    end = text + 4 + view.getInt32(text, true),
    wide = Buffer.from(payload + '\0', 'utf16le'),
    old = new Uint8Array(text + 4 + wide.length + bytes.length - end);
  old.set(bytes.subarray(0, text));
  const dv = new DataView(old.buffer);
  dv.setInt32(size, wide.length + 4, true);
  dv.setInt32(text, -(payload.length + 1), true);
  old.set(wide, text + 4);
  old.set(bytes.subarray(end), text + 4 + wide.length);
  expect(readSaveText(old)).toBe(payload);
  expect(readSaveText(exportSave(old, source))).toBe(payload);
});
it('exports indented round-tripping JSON with a trailing newline and unchanged precision', () => {
  const text = exportJson(source);
  expect(text).toContain('\n  "numericRoundTripFailures": 0,\n');
  expect(text.endsWith('\n')).toBe(true);
  expect(JSON.parse(text)).toEqual(exportCapture(source));
  expect(parseCapture(new TextEncoder().encode(text)).placements[0].transform).toEqual(
    source.placements[0].transform,
  );
});

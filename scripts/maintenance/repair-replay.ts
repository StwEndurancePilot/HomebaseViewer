import { readFileSync, writeFileSync } from 'node:fs';
import { parseCapture, readSaveText } from '../../src/core/save';
import { exportSave } from '../../src/core/export';
const [input, output] = process.argv.slice(2);
if (!input || !output || input === output)
  throw new Error('Provide separate input and output paths.');
const original = readFileSync(input),
  capture = parseCapture(original),
  fixed = exportSave(original, capture),
  roundTrip = parseCapture(fixed);
for (let i = 0; i < capture.placements.length; i++) {
  const p = capture.placements[i],
    q = roundTrip.placements.find((q) => q.actorPath === p.actorPath);
  if (
    !q ||
    JSON.stringify(p.transform) !== JSON.stringify(q.transform) ||
    JSON.stringify(p.meshTransform) !== JSON.stringify(q.meshTransform)
  )
    throw new Error('Transform changed during repair');
}
const rows = readSaveText(fixed).split('\n').slice(2);
for (const row of rows)
  for (const field of row.split('|').slice(11, 13))
    if (/\de[+-]?\d/i.test(field)) throw new Error('Exponent remains');
writeFileSync(output, fixed, { flag: 'wx' });
console.log(
  `Repaired ${capture.placements.length} placements; actor and mesh transforms unchanged.`,
);

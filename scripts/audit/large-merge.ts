import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseCapture } from '../../src/core/save';
import { copyGroup, planPaste } from '../../src/core/editor';
import { exportSave } from '../../src/core/export';
const dir = path.join(process.env.LOCALAPPDATA!, 'FortniteGame/Saved/SaveGames');
const files = readdirSync(dir)
  .filter(
    (f) =>
      f.startsWith('STW_Homebase_') &&
      f.includes('Twine') &&
      f.endsWith('.sav') &&
      !/Library|Recovery/.test(f),
  )
  .slice(0, 2);
if (files.length < 2)
  throw new Error('Two local Twine saves are required for the large merge check.');
const bytes = files.map((f) => readFileSync(path.join(dir, f))),
  data = bytes.map((b) => parseCapture(b));
const target = {
  ...data[0],
  placements: [] as (typeof data)[0]['placements'],
  capturedCount: 0,
  completeHomebase: false,
};
let copied = 0;
for (const [i, source] of data.entries()) {
  const selection = new Set(
    source.placements
      .filter((p) => p.kind === 'structure' && p.captureRole === 'placement')
      .slice(0, 200)
      .map((p) => p.actorPath),
  );
  const group = copyGroup(source, selection),
    anchor = group.anchor.map((v, j) => (j === 0 ? v + i * 100000 : v)) as [number, number, number];
  const plan = planPaste(target, group, anchor, i * 90, false);
  if (plan.errors.length) throw new Error(plan.errors.join('\n'));
  target.placements.push(...plan.records);
  copied += plan.records.length;
}
target.capturedCount = copied;
const output = exportSave(bytes[0], target);
writeFileSync('artifacts/validation/large-merge.sav', output);
console.log(
  `Merged ${copied} pieces from two actual Twine saves; ${output.length} bytes. Original save files unchanged.`,
);

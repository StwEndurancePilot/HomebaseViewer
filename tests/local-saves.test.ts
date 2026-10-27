import { it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseCapture } from '../src/core/save';
import { sceneMatrix, scenePoint } from '../src/core/transforms';
const directory = path.join(process.env.LOCALAPPDATA ?? '', 'FortniteGame/Saved/SaveGames');
const files = existsSync(directory)
  ? readdirSync(directory).filter(
      (f) =>
        f.startsWith('STW_Homebase_') &&
        f.endsWith('.sav') &&
        !f.includes('Library') &&
        !f.includes('Recovery'),
    )
  : [];
it.skipIf(!files.length)('read-only validation of installed menu homebase saves', () => {
  let records = 0;
  for (const file of files) {
    const data = parseCapture(readFileSync(path.join(directory, file)));
    for (const record of data.placements) {
      expect(sceneMatrix(record.meshTransform).elements.slice(12, 15)).toEqual(
        scenePoint(record.meshTransform.translation).toArray(),
      );
      records++;
    }
  }
  console.log(
    `Validated ${files.length} local saves and ${records} complete mesh transforms without writing any save.`,
  );
});

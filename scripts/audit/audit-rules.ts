import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Quaternion, Vector3 } from 'three';
import { parseCapture } from '../../src/core/save';
import { attachment, relativePose, trapCategory } from '../../src/core/editor';
const dir = path.join(process.env.LOCALAPPDATA!, 'FortniteGame/Saved/SaveGames');
const files = readdirSync(dir).filter(
  (f) => f.startsWith('STW_Homebase_') && f.endsWith('.sav') && !/Library|Recovery/.test(f),
);
const stats = new Map<
  string,
  {
    n: number;
    samples: unknown[];
  }
>();
const classes = new Set<string>();
for (const f of files) {
  const data = parseCapture(readFileSync(path.join(dir, f)));
  const byId = new Map(data.placements.map((p) => [p.actorPath, p]));
  for (const p of data.placements) {
    if (p.kind === 'structure') {
      if (/PBW_[WBM][123]_(Floor|Solid)\./i.test(p.meshPath))
        classes.add(p.classPath + ' | ' + p.meshPath);
      continue;
    }
    const support = byId.get(attachment(p)?.supportActorPath ?? '');
    if (!support) continue;
    const relative = relativePose(p.transform, support.transform),
      mesh = relativePose(p.meshTransform, p.transform);
    const key =
      p.classPath.split('/').at(-1) + ' type=' + p.attachmentType + ' side=' + attachment(p)?.side;
    const row = stats.get(key) ?? { n: 0, samples: [] };
    row.n++;
    if (row.samples.length < 3)
      row.samples.push({
        file: f,
        relative,
        mesh,
        support: support.classPath.split('/').at(-1),
        item: p.itemPath,
      });
    stats.set(key, row);
  }
}
writeFileSync(
  'artifacts/validation/trap-rules-audit.json',
  JSON.stringify({ classes: [...classes], traps: [...stats] }, null, 2),
);
console.log([...stats].map(([key, v]) => ({ key, n: v.n, sample: v.samples[0] })));

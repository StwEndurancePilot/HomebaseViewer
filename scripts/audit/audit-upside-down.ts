import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Quaternion, Vector3 } from 'three';
import { parseCapture } from '../../src/core/save';
import { attachment, relativePose, trapCategory, shapeOf } from '../../src/core/editor';
const dir = path.join(process.env.LOCALAPPDATA!, 'FortniteGame/Saved/SaveGames');
const files = readdirSync(dir).filter(
  (f) => f.startsWith('STW_Homebase_') && f.endsWith('.sav') && !/Library|Recovery/.test(f),
);
const flipped = new Map<
  string,
  {
    count: number;
    poses: Map<string, number>;
    sample: unknown;
  }
>();
let count = 0,
  over = 0,
  max = 0,
  maxExample: unknown;
for (const file of files) {
  const data = parseCapture(readFileSync(path.join(dir, file)));
  const byId = new Map(data.placements.map((p) => [p.actorPath, p]));
  for (const p of data.placements) {
    if (p.kind !== 'trap') continue;
    const parent = byId.get(attachment(p)?.supportActorPath ?? '');
    if (!parent) continue;
    count++;
    const relative = relativePose(p.transform, parent.transform),
      delta = p.transform.translation.map((v, i) => v - parent.transform.translation[i]);
    const largest = Math.max(...delta.map(Math.abs));
    if (largest > 2000) over++;
    if (largest > max) {
      max = largest;
      maxExample = { file, class: p.classPath, delta };
    }
    const up = new Vector3(0, 0, 1).applyQuaternion(new Quaternion(...relative.rotation));
    if (trapCategory(p) === 'ceiling' && up.z < -0.99 && shapeOf(parent) === 'floor') {
      const key = p.classPath.split('/').at(-1)!;
      const row = flipped.get(key) ?? {
        count: 0,
        poses: new Map(),
        sample: {
          file,
          actor: p.transform,
          mesh: p.meshTransform,
          support: parent.transform,
          attachment: p.attachment,
          attachmentType: p.attachmentType,
          relative,
        },
      };
      row.count++;
      const pose = JSON.stringify({
        translation: relative.translation.map((n) => Math.round(n * 1e6) / 1e6),
        rotation: relative.rotation.map((n) => Math.round(n * 1e6) / 1e6),
        side: attachment(p)?.side,
        type: p.attachmentType,
      });
      row.poses.set(pose, (row.poses.get(pose) ?? 0) + 1);
      flipped.set(key, row);
    }
  }
}
const report = {
  files: files.length,
  count,
  over2000: over,
  maxAxisSeparation: max,
  maxExample,
  flipped: [...flipped].map(([name, r]) => ({
    name,
    count: r.count,
    poses: [...r.poses].sort((a, b) => b[1] - a[1]).slice(0, 12),
    sample: r.sample,
  })),
};
writeFileSync('artifacts/validation/upside-down-audit.json', JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({ ...report, flipped: report.flipped.map(({ sample, ...r }) => r) }, null, 2),
);

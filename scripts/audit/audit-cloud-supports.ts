import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Quaternion, Vector3 } from 'three';
import { parseCapture } from '../../src/core/save';
import { attachment, trapCategory, exportDiagnostics } from '../../src/core/editor';
import { convertCloudSave, menuContainer } from '../../src/cloud/convert';
import { exportSave } from '../../src/core/export';
const root = path.join(process.env.LOCALAPPDATA ?? '', 'FortniteGame/Saved/SaveGames');
let matched = 0,
  mismatched = 0,
  ambiguous = 0;
const combos: Record<string, number> = {};
for (const file of readdirSync(root).filter(
  (f) => f.startsWith('STW_Homebase_') && f.endsWith('.sav') && !/Library|Recovery/.test(f),
)) {
  const data = parseCapture(readFileSync(path.join(root, file))),
    byId = new Map(data.placements.map((p) => [p.actorPath, p]));
  for (const p of data.placements) {
    if (p.kind !== 'trap' || trapCategory(p) !== 'wall') continue;
    const a = attachment(p),
      parent = byId.get(a?.supportActorPath ?? '');
    if (!parent || !a || ![0, 1].includes(a.side)) continue;
    const dot = new Vector3(0, 1, 0)
      .applyQuaternion(new Quaternion(...p.transform.rotation))
      .dot(new Vector3(0, 1, 0).applyQuaternion(new Quaternion(...parent.transform.rotation)));
    if (Math.abs(Math.abs(dot) - 1) >= 1e-5) {
      ambiguous++;
      const key = `${dot.toFixed(3)}:${a.side}`;
      combos[key] = (combos[key] ?? 0) + 1;
      continue;
    }
    if ((dot < 0 ? 1 : 0) === a.side) matched++;
    else mismatched++;
  }
}
console.log(
  JSON.stringify({ menuWallFacing: { matched, mismatched, ambiguous, ambiguousCombos: combos } }),
);
for (const suffix of ['', '-1']) {
  const file = `artifacts/validation/live-cloud-supports${suffix}.bin`,
    meta = JSON.parse(readFileSync(file + '.json', 'utf8')),
    data = convertCloudSave(readFileSync(file), meta.zoneId, 'live-validation.sav');
  const traps = data.placements.filter((p) => p.kind === 'trap'),
    issues = exportDiagnostics(data);
  console.log(
    JSON.stringify({
      cloud: meta.zoneId,
      pieces: data.placements.length,
      traps: traps.length,
      resolved: traps.filter((p) => attachment(p)?.status === 'resolved').length,
      offsets: traps.filter((p) =>
        attachment(p)?.relativeTransform?.translation.some((v) => Math.abs(v) > 1),
      ).length,
      issues: issues.reduce(
        (a, i) => {
          a[i.message] = (a[i.message] ?? 0) + 1;
          return a;
        },
        {} as Record<string, number>,
      ),
      ambiguousFacing: traps
        .filter((p) => (p.cloudIssues as string[]).some((v) => v.includes('facing')))
        .map((p) => ({
          rotation: attachment(p)?.relativeTransform?.rotation,
          delta: attachment(p)?.relativeTransform?.translation,
        }))
        .slice(0, 8),
    }),
  );
  if (!issues.length)
    writeFileSync(
      `artifacts/validation/live-cloud-native${suffix}.sav`,
      exportSave(menuContainer(), data),
    );
}

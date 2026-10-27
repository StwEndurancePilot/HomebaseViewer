import { it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { convertCloudSave } from '../src/cloud/convert';
import { attachment, exportDiagnostics } from '../src/core/editor';
for (const suffix of ['', '-1']) {
  const file = `artifacts/validation/live-cloud-supports${suffix}.bin`;
  it.skipIf(!existsSync(file))(
    `links every trap in local read-only Epic fixture ${suffix || '0'} without altering poses`,
    () => {
      const meta = JSON.parse(readFileSync(file + '.json', 'utf8')),
        data = convertCloudSave(readFileSync(file), meta.zoneId, 'local-validation.sav'),
        byId = new Map(data.placements.map((p) => [p.actorPath, p]));
      const traps = data.placements.filter((p) => p.kind === 'trap');
      expect(traps.length).toBeGreaterThan(0);
      for (const trap of traps) {
        const a = attachment(trap)!,
          source = trap.cloudImport as {
            supportGuid: string;
            rawTransform: unknown;
          };
        expect(a.status).toBe('resolved');
        expect(byId.get(a.supportActorPath)?.savedActorGuid).toBe(source.supportGuid);
        expect(trap.transform).toEqual(source.rawTransform);
      }
      expect(exportDiagnostics(data)).toEqual([]);
    },
  );
}

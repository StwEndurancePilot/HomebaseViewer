import { it, expect } from 'vitest';
import { deflateSync, gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { convertCloudSave, menuContainer, applyCloudTrapLevelFallback } from '../src/cloud/convert';
import { exportSave } from '../src/core/export';
import { exportDiagnostics } from '../src/core/editor';
import { parseCapture, readSaveText } from '../src/core/save';
const { decodeCloudBytes } = createRequire(import.meta.url)(
  '../electron/accounts/epic-account.cjs',
);
const cat = (...parts: Uint8Array[]) => Buffer.concat(parts.map((b) => Buffer.from(b)));
const i32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeInt32LE(n);
  return b;
};
const string = (s: string) => cat(i32(Buffer.byteLength(s) + 1), Buffer.from(s + '\0'));
const guid = (n: number) => cat(i32(n), Buffer.alloc(12));
const property = (name: string, type: string, body: Uint8Array, metadata = Buffer.alloc(0)) =>
  cat(string(name), string(type), i32(body.length), i32(0), metadata, Buffer.from([0]), body);
const typeName = (name: string, ...children: Uint8Array[]) =>
  cat(string(name), i32(children.length), ...children);
const currentProperty = (name: string, type: Uint8Array, body: Uint8Array, flags = 0) =>
  cat(
    string(name),
    type,
    i32(body.length),
    Buffer.from([flags]),
    ...(flags & 2 ? [Buffer.alloc(16)] : []),
    body,
  );
const floor = '/Game/Building/ActorBlueprints/Player/Metal/L3/PBWA_M3_Floor_2.PBWA_M3_Floor_2_C';
const ceiling =
  '/SaveTheWorld/Items/Traps/Blueprints/Trap_Ceiling_Electric.Trap_Ceiling_Electric_C';
const item =
  '/SaveTheWorld/Items/Traps/Ceiling/TID_Ceiling_Electric_SR_T05.TID_Ceiling_Electric_SR_T05';
function actor({
  id = 1,
  path = floor,
  at = [123.125, 456.75, 789.5],
  rotation = [0, 0, 0, 1],
  scale = [1, 1, 1],
  width = 8,
  body = string('None'),
  spawned = 1,
  state = 2,
}: {
  id?: number;
  path?: string;
  at?: number[];
  rotation?: number[];
  scale?: number[];
  width?: number;
  body?: Uint8Array;
  spawned?: number;
  state?: number;
} = {}) {
  const values = [...rotation, ...at, ...scale],
    pose = Buffer.alloc(values.length * width);
  values.forEach((v, i) =>
    width === 8 ? pose.writeDoubleLE(v, i * width) : pose.writeFloatLE(v, i * width),
  );
  return cat(
    guid(id),
    Buffer.from([state]),
    string(path),
    pose,
    i32(spawned),
    i32(body.length),
    body,
  );
}
function cloud({ legacy = false, missingSupport = false } = {}) {
  const perk = '/Game/Items/Alterations/Generic/AID_Att_Damage_T05.AID_Att_Damage_T05';
  const body = cat(
    property('TrapData', 'ObjectProperty', string(item)),
    property('OriginalTrapLevel', 'IntProperty', i32(50)),
    property(
      'AppliedAlterations',
      'ArrayProperty',
      cat(i32(2), string(perk), string(perk)),
      string('ObjectProperty'),
    ),
    property(
      'AttachedTo',
      'StructProperty',
      guid(missingSupport ? 999 : 1),
      cat(string('Guid'), Buffer.alloc(16)),
    ),
    property('AttachedToSide', 'ByteProperty', Buffer.from([1]), string('None')),
    string('None'),
  );
  return cat(
    Buffer.from('SavedActors'),
    actor({
      rotation: legacy ? [0, Math.sin(0.123), Math.cos(0.123)] : [0, 0, 0, 1],
      width: legacy ? 4 : 8,
    }),
    actor({
      id: 2,
      path: ceiling,
      at: [123.125, 456.75, 1169.5],
      rotation: [0, -1, 0, 0],
      scale: [-1, 2, 0.5],
      body,
    }),
  );
}
it('converts full poses, upside-down signed scales, support GUIDs and ordered perks to menu schema', () => {
  const data = convertCloudSave(cloud(), 'pve_04', 'test.sav');
  expect(data.placements).toHaveLength(2);
  const [f, t] = data.placements;
  expect(f.transform.translation).toEqual([123.125, 456.75, 789.5]);
  expect(t.transform.rotation).toEqual([0, -1, 0, 0]);
  expect(t.transform.scale).toEqual([-1, 2, 0.5]);
  expect(t.meshTransform).toEqual(t.transform);
  expect(t.attachment).toMatchObject({
    status: 'resolved',
    supportActorPath: f.actorPath,
    side: 1,
    relativeTransform: { translation: [0, 0, 380] },
  });
  expect(t.attachmentType).toBe(2);
  expect(t.trapLevel).toBe(50);
  expect(t.trapPerks).toBe(
    'perks1;/Game/Items/Alterations/Generic/AID_Att_Damage_T05.AID_Att_Damage_T05;/Game/Items/Alterations/Generic/AID_Att_Damage_T05.AID_Att_Damage_T05',
  );
  expect(exportDiagnostics(data)).toEqual([]);
  const bytes = exportSave(menuContainer(), data),
    roundTrip = parseCapture(bytes);
  expect(readSaveText(bytes)).toMatch(/^STW_HOMEBASE_1\n/);
  expect(roundTrip.placements.map((p) => p.transform)).toEqual(
    data.placements.map((p) => p.transform),
  );
  mkdirSync('artifacts/validation', { recursive: true });
  writeFileSync('artifacts/validation/cloud-converted.sav', bytes);
  writeFileSync('artifacts/validation/cloud-raw.sav', cloud());
});
it('retains fractional coordinates and unrounded legacy yaw components', () => {
  const data = convertCloudSave(cloud({ legacy: true }), 'pve_01', 'legacy.sav'),
    p = data.placements[0];
  expect(p.transform.translation).toEqual([123.125, 456.75, 789.5]);
  expect(p.transform.rotation[2]).toBe(Math.fround(Math.sin(0.123)));
  expect(p.transform.rotation[3]).toBe(Math.fround(Math.cos(0.123)));
  expect(exportDiagnostics(data)).toEqual([]);
});
it('does not guess nearby supports, tilt, or unsupported classes', () => {
  const data = convertCloudSave(cloud({ missingSupport: true }), 'pve_01', 'missing.sav');
  expect(exportDiagnostics(data).some((i) => i.code === 'missing-support')).toBe(true);
  expect(() => exportSave(menuContainer(), data)).toThrow(/support/);
  const tilted = convertCloudSave(
    cat(Buffer.from('SavedActors'), actor({ rotation: [0.6, 0, 0.8], width: 4 })),
    'pve_01',
    'tilt.sav',
  );
  expect(exportDiagnostics(tilted).some((i) => i.message.includes('tilt'))).toBe(true);
  const unknown = convertCloudSave(
    cat(Buffer.from('SavedActors'), actor({ path: floor.replaceAll('Floor_2', 'NeverObserved') })),
    'pve_01',
    'unknown.sav',
  );
  expect(exportDiagnostics(unknown).some((i) => i.message.includes('mesh'))).toBe(true);
});
it('skips destroyed/map actors and refuses unreadable archives without producing an empty base', () => {
  const data = convertCloudSave(
    cat(
      Buffer.from('SavedActors'),
      actor(),
      actor({ id: 2, state: 3 }),
      actor({ id: 3, spawned: 0 }),
    ),
    'pve_01',
    'roles.sav',
  );
  expect(data.placements).toHaveLength(1);
  expect(() => convertCloudSave(new Uint8Array([1, 2, 3]), 'pve_01', 'bad.sav')).toThrow(
    /actor stream/,
  );
  expect(() => convertCloudSave(Buffer.from('SavedActors'), 'pve_01', 'empty.sav')).toThrow(
    /No active/,
  );
  const raw = cat(cloud(), actor().subarray(0, 100));
  const partial = convertCloudSave(raw, 'pve_01', 'partial.sav');
  expect(
    exportDiagnostics(partial).some(
      (i) => !i.actorPaths.length && i.message.includes('could not be decoded'),
    ),
  ).toBe(true);
});
it('decodes ECFD and gzip while keeping malformed archives distinct from empty saves', () => {
  const raw = cloud(),
    ecfd = cat(Buffer.from('ECFD'), Buffer.alloc(12), deflateSync(raw));
  expect(Buffer.from(decodeCloudBytes(ecfd))).toEqual(raw);
  expect(Buffer.from(decodeCloudBytes(gzipSync(ecfd)))).toEqual(raw);
  expect(() => decodeCloudBytes(Buffer.from('ECFDinvalid'))).toThrow(/damaged/);
});
it('defaults missing and invalid cloud trap levels to tier 5 without changing readable levels', () => {
  const knownItem = item.replaceAll('TID_Ceiling_Electric_', 'TID_Ceiling_Electric_Single_');
  for (const level of [null, -1, 1000, 25]) {
    const body = cat(
      property('TrapData', 'ObjectProperty', string(knownItem.replaceAll('T05', 'T01'))),
      ...(level === null ? [] : [property('OriginalTrapLevel', 'IntProperty', i32(level))]),
      property('AttachedTo', 'StructProperty', guid(1), cat(string('Guid'), Buffer.alloc(16))),
      property('AttachedToSide', 'ByteProperty', Buffer.from([1]), string('None')),
      string('None'),
    );
    const data = convertCloudSave(
        cat(Buffer.from('SavedActors'), actor(), actor({ id: 2, path: ceiling, body })),
        'pve_04',
        'fallback.sav',
      ),
      trap = data.placements[1];
    expect(trap.trapLevel).toBe(level === 25 ? 25 : 50);
    expect(trap.itemPath).toBe(level === 25 ? knownItem.replaceAll('T05', 'T01') : knownItem);
    expect(exportDiagnostics(data)).toEqual([]);
    const bytes = exportSave(menuContainer(), data);
    expect(parseCapture(bytes).placements[1].trapLevel).toBe(trap.trapLevel);
    if (level === null) writeFileSync('artifacts/validation/cloud-tier5-export.sav', bytes);
  }
});
it('upgrades old cloud drafts while retaining other conversion problems', () => {
  const data = convertCloudSave(cloud(), 'pve_04', 'old.sav'),
    trap = data.placements[1];
  trap.trapLevel = 0;
  trap.cloudIssues = [
    'Cloud trap level could not be read. Import this trap from a menu capture.',
    'Other conversion problem',
  ];
  expect(applyCloudTrapLevelFallback(data)).toBe(1);
  expect(trap.trapLevel).toBe(50);
  expect(trap.cloudIssues).toEqual(['Other conversion problem']);
});
it('reads current Epic type headers and links offset wall traps by exact saved GUID, never proximity', () => {
  const wall = floor.replaceAll('Floor_2', 'Solid'),
    wallTrap = '/SaveTheWorld/Items/Traps/Blueprints/Trap_Wall_Darts.Trap_Wall_Darts_C';
  const position = [4096.125, -512.75, 720],
    rotation = [Math.sin(0.12), 0, 0, Math.cos(0.12)];
  const perk = '/Game/Items/Alterations/Generic/AID_Att_Damage_T05.AID_Att_Damage_T05';
  const body = cat(
    Buffer.from([0]),
    currentProperty(
      'TrapData',
      typeName('ObjectProperty'),
      string('/SaveTheWorld/Items/Traps/Wall/TID_Wall_Darts_SR_T05.TID_Wall_Darts_SR_T05'),
    ),
    currentProperty(
      'AttachedTo',
      typeName('ObjectProperty'),
      string('00000001000000000000000000000000'),
      2,
    ),
    currentProperty('OriginalTrapLevel', typeName('IntProperty'), i32(60)),
    currentProperty(
      'AppliedAlterations',
      typeName('ArrayProperty', typeName('ObjectProperty')),
      cat(i32(2), string(perk), string(perk)),
    ),
    currentProperty('bPlayerPlaced', typeName('BoolProperty'), Buffer.alloc(0), 16),
    string('None'),
  );
  const data = convertCloudSave(
      cat(
        Buffer.from('SavedActors'),
        actor({ path: wall }),
        actor({ id: 3, path: wall, at: position }),
        actor({ id: 2, path: wallTrap, at: position, rotation, body }),
      ),
      'pve_04',
      'modern.sav',
    ),
    trap = data.placements[2];
  expect(trap.attachment).toMatchObject({
    status: 'resolved',
    supportActorPath: data.placements[0].actorPath,
    side: 255,
  });
  expect(trap.transform.translation).toEqual(position);
  expect(trap.transform.rotation).toEqual(rotation);
  expect(trap.trapLevel).toBe(60);
  expect(String(trap.trapPerks).split(';')).toHaveLength(3);
  expect(exportDiagnostics(data)).toEqual([]);
  const bytes = exportSave(menuContainer(), data);
  expect(parseCapture(bytes).placements[2].attachment).toEqual(trap.attachment);
  writeFileSync('artifacts/validation/cloud-current-supports.sav', bytes);
  writeFileSync(
    'artifacts/validation/cloud-current-raw.sav',
    cat(
      Buffer.from('SavedActors'),
      actor({ path: wall }),
      actor({ id: 3, path: wall, at: position }),
      actor({ id: 2, path: wallTrap, at: position, rotation, body }),
    ),
  );
});
it('reads current nested GUID struct types and mirrored flags without changing upside-down trap poses', () => {
  const body = cat(
    currentProperty('TrapData', typeName('ObjectProperty'), string(item)),
    currentProperty(
      'AttachedTo',
      typeName('StructProperty', typeName('Guid', typeName('/Script/CoreUObject'))),
      guid(1),
      8,
    ),
    currentProperty('OriginalTrapLevel', typeName('IntProperty'), i32(50)),
    currentProperty('AttachedToSide', typeName('ByteProperty', typeName('None')), Buffer.from([1])),
    currentProperty('bMirrored', typeName('BoolProperty'), Buffer.alloc(0), 16),
    string('None'),
  );
  const data = convertCloudSave(
      cat(
        Buffer.from('SavedActors'),
        actor(),
        actor({ id: 2, path: ceiling, at: [2048.5, 0, -472], rotation: [0, -1, 0, 0], body }),
      ),
      'pve_04',
      'upside-down.sav',
    ),
    trap = data.placements[1];
  expect(trap.mirrored).toBe(true);
  expect(trap.attachment).toMatchObject({
    status: 'resolved',
    supportActorPath: data.placements[0].actorPath,
    side: 1,
  });
  expect(trap.transform.rotation).toEqual([0, -1, 0, 0]);
  expect(trap.transform.translation).toEqual([2048.5, 0, -472]);
});
it('matches verified legacy /Game trap classes with current /SaveTheWorld aliases', () => {
  const spike = '/SaveTheWorld/Items/Traps/Blueprints/Trap_Floor_Spikes.Trap_Floor_Spikes_C';
  const data = convertCloudSave(
    cat(Buffer.from('SavedActors'), actor(), actor({ id: 2, path: spike })),
    'pve_04',
    'aliases.sav',
  );
  expect(data.placements[1].meshPath).not.toBe('');
  expect(data.placements[1].cloudIssues).toEqual([]);
});

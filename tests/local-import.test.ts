import { expect, it } from 'vitest';
import { importLocalFile, inferZone } from '../src/cloud/local-import';
import { parseCapture, type Capture } from '../src/core/save';
import { classInfo } from '../src/cloud/convert';
import { exportDiagnostics } from '../src/core/editor';
import { exportSave } from '../src/core/export';
import { menuContainer } from '../src/cloud/convert';
import { newBase } from '../src/core/new-base';

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const structure = () => ({
  kind: 'structure',
  assetPath: '/Game/Building/ActorBlueprints/Player/Wood/L1/PBWA_W1_Solid.PBWA_W1_Solid_C',
  position: { x: -14336, y: 14080, z: -384 },
  rotationQuaternion: { x: 0, y: 0, z: 1, w: 6.123233995736766e-17 },
  scale: { x: 1, y: 1, z: 1 },
});
const trap = () => ({
  kind: 'trap',
  assetPath:
    '/SaveTheWorld/Items/Traps/Blueprints/Trap_Floor_Ward_AntiAir.Trap_Floor_Ward_AntiAir_C',
  position: { x: -13849, y: 6656, z: 1152 },
  rotationQuaternion: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
  scale: { x: -1, y: 2, z: 0.5 },
});

it('opens headerless placement JSON and maps meshes while retaining every actor pose', async () => {
  const source = { placements: [structure(), trap(), structure()] };
  const data = (await importLocalFile(bytes(source), 'TwinePeaks-StormShield.json'))!;
  expect(data.placements).toHaveLength(3);
  expect(data.worldPath).toContain('TwinePeaks');
  expect(new Set(data.placements.map((p) => p.actorPath)).size).toBe(3);
  source.placements.forEach((row, i) => {
    const p = data.placements[i];
    expect(p.transform).toEqual({
      translation: Object.values(row.position),
      rotation: Object.values(row.rotationQuaternion),
      scale: Object.values(row.scale),
    });
    expect(p.meshPath).toBe(classInfo(row.assetPath, false)!.meshPath);
    expect(p.meshPath).not.toBe('');
  });
  expect(data.placements[0].resourceType).toBe(0);
  expect(data.placements[0].level).toBe(0);
  expect(parseCapture(bytes(data)).placements).toEqual(data.placements);
  const issues = exportDiagnostics(data);
  expect(issues.some((p) => p.code === 'missing-item')).toBe(true);
  expect(issues.some((p) => p.code === 'missing-support')).toBe(true);
  expect(data.placements[1].trapPerksStatus).toBe('not-recorded');
});

it('asks for a zone when absent or conflicting, and accepts an explicit choice', async () => {
  expect(await importLocalFile(bytes([structure()]), 'download.json')).toBeNull();
  expect(inferZone('TwinePeaks', 'Stonewood')).toBeNull();
  const source = { zoneId: 'pve_04', placements: [structure()] };
  expect(await importLocalFile(bytes(source), 'Stonewood.json')).toBeNull();
  const data = await importLocalFile(bytes(source), 'Stonewood.json', { zoneId: 'pve_03' });
  expect(data?.worldPath).toContain('CannyValley');
});

it('accepts the headers in the reported file without requiring them', async () => {
  const source = {
    format: 'stw-homebase-capture',
    schemaVersion: 6,
    coordinateUnit: 'unreal-world-units',
    rotationEncoding: 'quaternion-xyzw',
    worldPath: 'TwinePeaks',
    capturedCount: 1,
    placements: [structure()],
  };
  expect((await importLocalFile(bytes(source), 'download.json'))?.placements).toHaveLength(1);
  source.capturedCount = 2;
  await expect(importLocalFile(bytes(source), 'download.json')).rejects.toThrow(/count/);
});

it('explains that cloud listings contain no homebase data', async () => {
  for (const listing of [
    [],
    [{ filename: 'home_r0_a1.sav', length: 123 }],
    [{ uniqueFilename: 'home.asv' }],
  ]) {
    await expect(importLocalFile(bytes(listing), 'response.json')).rejects.toThrow(
      /file list.*second API call/,
    );
  }
});

it('distinguishes API failures, malformed JSON, and text damage from a valid homebase', async () => {
  await expect(
    importLocalFile(
      bytes({ errorCode: 'errors.com.epicgames.common.authentication.authentication_failed' }),
      'response.json',
    ),
  ).rejects.toThrow(/API error/);
  await expect(
    importLocalFile(new TextEncoder().encode('{"placements": ['), 'response.json'),
  ).rejects.toThrow(/incomplete or invalid/);
  await expect(
    importLocalFile(new TextEncoder().encode('binary saved as text'), 'response.json'),
  ).rejects.toThrow(/binary/);
});

it('rejects bad coordinates, non-unit rotations, kind mismatches and conflicting units', async () => {
  const bad = structure();
  bad.rotationQuaternion.w = 2;
  await expect(importLocalFile(bytes([bad]), 'TwinePeaks.json')).rejects.toThrow(/quaternion/);
  await expect(
    importLocalFile(
      bytes([{ ...structure(), position: { x: '1', y: 0, z: 0 } }]),
      'TwinePeaks.json',
    ),
  ).rejects.toThrow(/position.x/);
  await expect(
    importLocalFile(bytes([{ ...structure(), kind: 'trap' }]), 'TwinePeaks.json'),
  ).rejects.toThrow(/kind/);
  await expect(
    importLocalFile(
      bytes({ coordinateUnit: 'meters', placements: [structure()] }),
      'TwinePeaks.json',
    ),
  ).rejects.toThrow(/unreal-world-units/);
});

it('retains unknown mesh classes with issues and never silently discards a row', async () => {
  const source = [
    structure(),
    { ...structure(), assetPath: '/Game/Building/ActorBlueprints/Player/Unknown.Unknown_C' },
  ];
  const data = (await importLocalFile(bytes(source), 'TwinePeaks.json'))!;
  expect(data.placements).toHaveLength(2);
  expect(data.placements[1].meshPath).toBe('');
  expect(exportDiagnostics(data).some((issue) => issue.code === 'cloud-conversion')).toBe(true);
  await expect(importLocalFile(bytes([structure(), null]), 'TwinePeaks.json')).rejects.toThrow(
    /placement 2/,
  );
});

it('preserves capture JSON and menu saves and does not reinterpret damaged full captures', async () => {
  const data = newBase('pve_04');
  expect(await importLocalFile(bytes(data), 'capture.json')).toEqual(data);
  const menu = exportSave(
    menuContainer(),
    (await importLocalFile(bytes([structure()]), 'TwinePeaks.json')) as Capture,
  );
  expect(await importLocalFile(menu, 'home.sav')).toEqual(parseCapture(menu));
  const bad = { ...data, placements: [{ ...structure(), transform: {} }] };
  await expect(importLocalFile(bytes(bad), 'TwinePeaks.json')).rejects.toThrow(
    /count|Invalid placement/,
  );
});

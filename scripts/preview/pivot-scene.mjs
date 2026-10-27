import { _electron as electron } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
await mkdir('artifacts/validation', { recursive: true });
const placements = [];
const make = (kind, name, mesh, pose) => ({
  kind,
  actorPath: name,
  classPath: name,
  meshPath: mesh,
  captureRole: 'placement',
  transform: structuredClone(pose),
  meshTransform: structuredClone(pose),
  mirrored: false,
});
for (let i = 0; i < 4; i++) {
  const pose = {
    translation: [(i % 2) * 1536, Math.floor(i / 2) * 1536, 0],
    rotation: [0, 0, Math.sin((i * Math.PI) / 4), Math.cos((i * Math.PI) / 4)],
    scale: [1, 1, 1],
  };
  placements.push(make('structure', `Floor${i}`, 'PBW_M3_Floor', pose));
  placements.push(make('trap', `Freeze${i}`, 'S_Floor_Freeze', pose));
}
placements.push(
  make('structure', 'AntiAirFloor', 'PBW_M3_Floor', {
    translation: [3072, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  }),
);
placements.push(
  make('trap', 'AntiAir', 'Patrol_Ward_Trap_base', {
    translation: [3072, 256, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  }),
);
const wall = { translation: [3072, 1536, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
placements.push(make('structure', 'Wall', 'PBW_M3_Solid', wall));
placements.push(make('trap', 'Darts', 'S_Solid_Wall_Trap_test', wall));
const data = {
  format: 'stw-homebase-capture',
  schemaVersion: 6,
  coordinateUnit: 'unreal-world-units',
  rotationEncoding: 'quaternion-xyzw',
  worldPath: 'Synthetic placement regression',
  completeHomebase: false,
  capturedCount: placements.length,
  placements,
};
const file = path.resolve('artifacts/validation/pivot-fixture.json');
await writeFile(file, JSON.stringify(data));
const app = await electron.launch({
  executablePath: process.env.VIEWER_EXE,
  args: ['--smoke-test'],
});
try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await page.locator('#file').setInputFiles(file);
  await page.waitForFunction(
    () => !document.querySelector('#open').disabled,
    {},
    { timeout: 60000 },
  );
  assert.match(await page.locator('#fidelity').textContent(), /4 traps have Penny's half-tile/);
  await page.screenshot({ path: 'artifacts/validation/pivot-cases.png' });
  console.log(
    'Native regression scene: four rotated floor/freeze pairs, anti-air and wall traps rendered.',
  );
} finally {
  await app.close();
}

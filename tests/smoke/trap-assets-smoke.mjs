import { _electron as electron } from 'playwright';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
await mkdir('artifacts/validation', { recursive: true });
const app = await electron.launch(
  process.env.VIEWER_EXE
    ? { executablePath: process.env.VIEWER_EXE, args: ['--smoke-test'] }
    : { args: ['.', '--smoke-test'] },
);
const page = await app.firstWindow(),
  errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.show();
  w.focus();
});
const pose = (translation = [0, 0, 0], rotation = [0, 0, 0, 1]) => ({
  translation,
  rotation,
  scale: [1, 1, 1],
});
const piece = (kind, mesh, p) => ({
  actorPath: kind,
  classPath: mesh,
  meshPath: mesh,
  kind,
  captureRole: 'placement',
  transform: p,
  meshTransform: structuredClone(p),
});
try {
  for (const [label, mesh, offset, zoom] of [
    ['healing-pad', 'S_Floor_HealthSquare', [0, 0, 0], 12],
    ['flame-grill', 'SM_Flame_Grill_Trap', [0, 0, 0], 12],
    ['anti-air', 'Patrol_Ward_Trap_base', [0, 256, 0], 27],
  ]) {
    const name = `trap-${label}.json`,
      file = path.resolve('artifacts/validation', name);
    await writeFile(
      file,
      JSON.stringify({
        format: 'stw-homebase-capture',
        schemaVersion: 6,
        coordinateUnit: 'unreal-world-units',
        rotationEncoding: 'quaternion-xyzw',
        worldPath: 'Mesh validation',
        completeHomebase: false,
        placements: [piece('structure', 'PBW_M3_Floor', pose()), piece('trap', mesh, pose(offset))],
      }),
    );
    await page.locator('#file').setInputFiles(file);
    await page.waitForFunction(
      (name) =>
        document.querySelector('#filename').textContent === name &&
        !document.querySelector('#open').disabled,
      name,
    );
    assert.match(await page.locator('#fidelity').textContent(), /2 meshes · 0 missing/);
    const box = await page.locator('#viewport>canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < zoom; i++) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(450);
    await page.screenshot({ path: `artifacts/validation/trap-${label}.png` });
  }
  const dir = path.join(process.env.LOCALAPPDATA, 'FortniteGame/Saved/SaveGames');
  const real = (await readdir(dir)).find(
    (f) =>
      f.startsWith('STW_Homebase_NightcoreASAP') &&
      f.includes('Stonewood') &&
      f.endsWith('.sav') &&
      !f.includes('Recovery'),
  );
  assert.ok(real, 'Real capture fixture missing');
  await page.locator('#file').setInputFiles(path.join(dir, real));
  await page.waitForFunction(
    (name) =>
      document.querySelector('#filename').textContent === name &&
      !document.querySelector('#open').disabled,
    real,
  );
  assert.match(await page.locator('#fidelity').textContent(), /937 meshes · 0 missing/);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: original healing pad, flame grill, complete anti-air render; real Stonewood capture has 937/937 meshes and zero missing markers.',
  );
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

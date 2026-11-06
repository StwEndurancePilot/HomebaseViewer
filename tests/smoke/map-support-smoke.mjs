import { completeDiscordOnboarding } from './discord-onboarding.mjs';
import { _electron as electron } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';

const folder = path.resolve('artifacts/validation');
await mkdir(folder, { recursive: true });
const scenery = JSON.parse(await readFile('assets/outpost-game/zones/pve_03/scenery.json', 'utf8'));
const glb = await readFile('assets/outpost-game/zones/pve_03/scenery.glb');
const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
const roofName = 'FORT_LogCabin_Roof2';
const node = gltf.nodes.find((n) => n.name === roofName);
const instance = scenery.placements.find((p) => p[0] === roofName);
const centre = new Vector3(...node.translation).applyMatrix4(
  new Matrix4().fromArray(instance.slice(1)),
);
const catalog = JSON.parse(await readFile('src/cloud/catalog.json', 'utf8'));
const info = Object.values(catalog.classes).find((p) =>
  p.classPath.endsWith('/Trap_Ceiling_Electric.Trap_Ceiling_Electric_C'),
);
assert.ok(info);
const pose = {
  translation: [-centre.z * 512, centre.x * 512 - 256, (centre.y + 1) * 512],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
};
const fixture = path.join(folder, 'map-support-smoke.json');
await writeFile(
  fixture,
  JSON.stringify({
    schemaVersion: 6,
    format: 'stw-homebase-capture',
    coordinateUnit: 'unreal-world-units',
    rotationEncoding: 'quaternion-xyzw',
    worldPath: 'Zone_Outpost_CannyValley',
    completeHomebase: false,
    placements: [
      {
        ...info,
        actorPath: 'template-trap',
        kind: 'trap',
        captureRole: 'placement',
        transform: pose,
        meshTransform: pose,
        itemPath:
          '/SaveTheWorld/Items/Traps/Ceiling/TID_Ceiling_Electric_SR_T05.TID_Ceiling_Electric_SR_T05',
        trapLevel: 50,
        attachment: {
          status: 'unresolved',
          supportActorPath: '',
          side: 1,
          supportTransform: null,
          relativeTransform: null,
        },
      },
    ],
  }),
);
const app = await electron.launch(
  process.env.VIEWER_EXE
    ? { executablePath: process.env.VIEWER_EXE, args: ['--smoke-test'] }
    : { args: ['.', '--smoke-test'] },
);
const page = await app.firstWindow();
const errors = [];
await completeDiscordOnboarding(app, page);
page.on('pageerror', (error) => errors.push(String(error)));
const settle = () => page.waitForFunction(() => !document.querySelector('#open').disabled);
try {
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(1280, 900);
    window.show();
    window.focus();
  });
  await page.locator('#file').setInputFiles(fixture);
  await settle();
  await page.locator('#showScenery').evaluate((input) => {
    input.checked = true;
    input.dispatchEvent(new Event('change'));
  });
  await page.keyboard.press('Control+a');
  await page.locator('#frameSelection').click();
  await page.locator('#cameraView').selectOption('top');
  await page.locator('#buildTool').click();
  await page.keyboard.press('5');
  const bounds = await page.locator('#viewport>canvas').boundingBox();
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(() => !document.querySelector('#place').disabled);
  await page.mouse.click(point.x, point.y);
  await settle();
  const selected = JSON.parse(await page.locator('#selection').textContent());
  assert.match(
    selected.attachment.supportActorPath,
    /^\/HomebaseEditor\/MapSurface\/pve_03\/fort_logcabin_roof2\//,
  );
  assert.equal(await page.locator('#traps').textContent(), '2');
  await page.keyboard.press('Escape');
  const savedPath = path.join(folder, 'map-support-smoke-draft.json');
  await app.evaluate(({ session }, destination) => {
    globalThis.mapSupportDownload = null;
    session.defaultSession.once('will-download', (_event, item) => {
      item.setSavePath(destination);
      item.once('done', (_event, state) => {
        globalThis.mapSupportDownload = state;
      });
    });
  }, savedPath);
  await page.locator('#saveDraft').click();
  for (let i = 0; i < 100 && !(await app.evaluate(() => globalThis.mapSupportDownload)); i++)
    await page.waitForTimeout(100);
  assert.equal(await app.evaluate(() => globalThis.mapSupportDownload), 'completed');
  const saved = JSON.parse(await readFile(savedPath, 'utf8'));
  assert.equal(saved.placements.filter((p) => p.editorMapSupport).length, 1);
  assert.equal(saved.placements.find((p) => p.editorMapSupport).captureRole, 'existing-world');
  await page.locator('#undo').click();
  await settle();
  assert.equal(await page.locator('#traps').textContent(), '1');
  await page.locator('#redo').click();
  await settle();
  assert.equal(await page.locator('#traps').textContent(), '2');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: direct trap placement on bundled Canny Valley building geometry, persistent map reference, draft save, and atomic undo/redo.',
  );
} catch (error) {
  await page
    .screenshot({ path: path.join(folder, 'map-support-smoke-failure.png') })
    .catch(() => {});
  console.error(await page.locator('#placementFeedback').textContent());
  throw error;
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
  );
  await app.close();
}

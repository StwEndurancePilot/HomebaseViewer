import { _electron as electron } from 'playwright';
import { PerspectiveCamera, Vector3 } from 'three';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const app = await electron.launch(
  process.env.VIEWER_EXE
    ? { executablePath: process.env.VIEWER_EXE, args: ['--smoke-test'] }
    : { args: ['.', '--smoke-test'] },
);
const page = await app.firstWindow(),
  errors = [],
  requests = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('request', (r) => {
  if (/^https?:/.test(r.url())) requests.push(r.url());
});
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.show();
  w.focus();
});
const click = async (id) => page.locator('#' + id).click();
const settle = async () => page.waitForFunction(() => !document.querySelector('#open').disabled);
const count = async (id, n) =>
  assert.equal(
    Number((await page.locator('#' + id).textContent()).replaceAll(',', '')),
    n,
    await page.locator('#placementFeedback').textContent(),
  );
async function aim([x, y, z]) {
  const r = await page.locator('#viewport>canvas').boundingBox(),
    camera = new PerspectiveCamera(60, r.width / r.height, 0.02, 4000);
  camera.position.set(3, 3.6, 4);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const p = new Vector3(y / 512, z / 512, -x / 512).project(camera);
  const point = { x: r.x + ((p.x + 1) * r.width) / 2, y: r.y + ((1 - p.y) * r.height) / 2 };
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(80);
  return point;
}
async function placeAt(p) {
  const at = await aim(p);
  assert.match(await page.locator('#placementFeedback').textContent(), /^Click to place/);
  await page.mouse.click(at.x, at.y);
  await settle();
}
async function save(id, name) {
  const dest = path.resolve('artifacts/validation/' + name);
  await app.evaluate(({ session }, dest) => {
    globalThis.redesignDownload = null;
    session.defaultSession.once('will-download', (_e, item) => {
      item.setSavePath(dest);
      item.once('done', (_e, s) => (globalThis.redesignDownload = s));
    });
  }, dest);
  await click(id);
  for (let i = 0; i < 100; i++) {
    const state = await app.evaluate(() => globalThis.redesignDownload);
    if (state) {
      assert.equal(state, 'completed');
      return dest;
    }
    await page.waitForTimeout(100);
  }
  throw new Error('Download failed: ' + (await page.locator('#status').textContent()));
}
try {
  await page.waitForFunction(() => document.querySelector('#welcomeModel').naturalWidth > 0);
  await page.waitForTimeout(180);
  await page.screenshot({ path: 'artifacts/validation/blue-welcome.png' });
  await page
    .locator('#file')
    .setInputFiles(path.resolve('artifacts/validation/editor-source-a.json'));
  await settle();
  await click('buildTool');
  await click('chooseFloor');
  await placeAt([230, 256, 0]);
  await count('structures', 2);
  assert.equal(
    await page.locator('#placePanel').isVisible(),
    true,
    'Build stays active after placing',
  );
  await click('chooseWall');
  await aim([0, 490, 0]);
  assert.match(await page.locator('#placementFeedback').textContent(), /^Click to place/);
  await page.screenshot({ path: 'artifacts/validation/blue-hover-preview.png' });
  await placeAt([0, 490, 0]);
  await count('structures', 3);
  await click('chooseTrap');
  await page.locator('#trapSearch').fill('floor launcher');
  await page.locator('#trapTemplate').selectOption({ index: 0 });
  const floorOption = await page
    .locator('#trapTemplate option')
    .evaluateAll(
      (os) => os.find((o) => !o.hidden && o.textContent.includes('Floor Launcher'))?.value,
    );
  await page.locator('#trapTemplate').selectOption(floorOption);
  await click('rotatePiece');
  assert.match(await page.locator('#rotationLabel').textContent(), /90/);
  await placeAt([700, 450, 0]);
  await count('traps', 2);
  const occupied = await aim([700, 450, 0]);
  assert.equal(await page.locator('#placementFeedback').getAttribute('data-invalid'), 'true');
  await page.mouse.click(occupied.x, occupied.y);
  await count('traps', 2);
  await page.keyboard.press('r');
  assert.match(await page.locator('#rotationLabel').textContent(), /180/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#placePanel').isVisible(), false);
  await click('undo');
  await settle();
  await count('traps', 1);
  await click('redo');
  await settle();
  await count('traps', 2);
  await page.keyboard.press('Control+a');
  await click('selectionChip');
  assert.equal(await page.locator('#selectionPanel').isVisible(), true);
  await count('selectedCount', 5);
  await click('trapsOnly');
  await count('selectedCount', 2);
  await click('selectionOffsets');
  await page.locator('#offsetX').fill('16');
  await click('applyOffsets');
  await settle();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+a');
  await click('copy');
  await click('newBlueprint');
  await settle();
  await click('paste');
  await click('commitPaste');
  await settle();
  await count('structures', 3);
  await count('traps', 2);
  const draft = await save('saveDraft', 'blue-ui-draft.json');
  assert.equal(JSON.parse(await readFile(draft, 'utf8')).placements.length, 5);
  const dir = path.join(process.env.LOCALAPPDATA, 'FortniteGame/Saved/SaveGames');
  const file = (await readdir(dir)).find(
    (f) =>
      f.startsWith('STW_Homebase_NightcoreASAP') && f.includes('Stonewood') && f.endsWith('.sav'),
  );
  await page.locator('#file').setInputFiles(path.join(dir, file));
  await settle();
  await click('buildTool');
  await page.waitForTimeout(220);
  await page.screenshot({ path: 'artifacts/validation/blue-stonewood-light.png' });
  for (let i = 0; i < 3 && (await page.locator('html').getAttribute('data-theme')) !== 'dark'; i++)
    await click('theme');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.waitForTimeout(220);
  await page.screenshot({ path: 'artifacts/validation/blue-stonewood-dark.png' });
  await click('chooseTrap');
  await page.locator('#trapSearch').fill('no such trap');
  assert.equal(await page.locator('#trapEmpty').isVisible(), true);
  await page.locator('#trapSearch').fill('');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 640));
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'artifacts/validation/blue-compact.png' });
  await click('sceneToggle');
  await page.locator('#showScenery').check();
  await page.locator('#showScenery').uncheck();
  assert.equal(await page.locator('#placePanel').isVisible(), false);
  await page.keyboard.press('Escape');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 920));
  await page.locator('#documents button').filter({ hasText: 'Custom-blueprint-1' }).click();
  await settle();
  const exported = await save('exportSave', 'blue-ui-export.sav');
  await page.locator('#file').setInputFiles(exported);
  await settle();
  await count('structures', 3);
  await count('traps', 2);
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  const report = {
    passed: true,
    pieces: 5,
    checks: [
      'pointer placement',
      'repeated build mode',
      'hover ghost',
      'occupied face rejection',
      'rotation button and shortcut',
      'Escape/select',
      'undo redo',
      'bulk offsets',
      'copy paste',
      'draft and sav roundtrip',
      'light and dark themes',
      '960x640 layout',
      'search empty state',
    ],
    errors,
    externalRequests: requests,
  };
  await writeFile('artifacts/validation/blue-smoke.json', JSON.stringify(report, null, 2));
  console.log(report);
} catch (error) {
  console.error({
    error: String(error),
    status: await page.locator('#status').textContent(),
    feedback: await page.locator('#placementFeedback').textContent(),
    errors,
  });
  await page.screenshot({ path: 'artifacts/validation/blue-failure.png' });
  throw error;
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

import { _electron as electron } from 'playwright';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = JSON.parse(await readFile('artifacts/validation/editor-source-b.json', 'utf8'));
const fixture = {
  schemaVersion: 6,
  format: base.format,
  coordinateUnit: base.coordinateUnit,
  rotationEncoding: base.rotationEncoding,
  worldPath: 'Editor-test-scene',
  completeHomebase: false,
  placements: base.placements.slice(0, 2),
};
await writeFile('artifacts/validation/gizmo-ceiling.json', JSON.stringify(fixture));
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
const click = async (id) => page.locator('#' + id).click();
const settle = async () => {
  await page.waitForFunction(() => !document.querySelector('#open').disabled);
  await page.waitForTimeout(120);
};
const inspector = async () => JSON.parse(await page.locator('#selection').textContent());
const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-7, `${a} != ${b}`));
async function prepare() {
  if (!(await page.locator('#selectionPanel').isVisible())) await click('selectionChip');
  await click('frameSelection');
  await page.waitForTimeout(250);
  await click('moveTraps');
  await page.waitForTimeout(150);
}
async function drag(axis, { cancel = false, multiplier = 1 } = {}) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const canvas = await page.locator('#viewport>canvas').boundingBox(),
    label = await page.locator('.axis-' + axis).boundingBox();
  const center = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 },
    dx = label.x + label.width / 2 - center.x,
    dy = label.y + label.height / 2 - center.y;
  const x = center.x + (dx * 0.5) / 0.73,
    y = center.y + (dy * 0.5) / 0.73;
  await page.mouse.move(x, y);
  await page.waitForTimeout(80);
  await page.mouse.down();
  await page.mouse.move(x + dx * multiplier, y + dy * multiplier, { steps: 12 });
  const readout = await page.locator('#moveReadout').textContent();
  assert.match(readout, /X [-\d]/, 'Actual handle was grabbed: ' + readout);
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
  await settle();
}
try {
  await page
    .locator('#file')
    .setInputFiles(path.resolve('artifacts/validation/editor-source-a.json'));
  await settle();
  await page.keyboard.press('Control+a');
  await click('selectionChip');
  await click('trapsOnly');
  const original = await inspector();
  for (const [index, axis] of ['x', 'y', 'z'].entries()) {
    await prepare();
    await drag(axis);
    const moved = await inspector();
    moved.actorTransform.translation.forEach((v, i) =>
      i === index
        ? assert.ok(
            v > original.actorTransform.translation[i] + 1,
            `${axis}: ${JSON.stringify(moved.actorTransform.translation)} vs ${JSON.stringify(original.actorTransform.translation)}`,
          )
        : assert.ok(Math.abs(v - original.actorTransform.translation[i]) < 1e-7),
    );
    near(
      moved.meshTransform.translation.map((v, i) => v - original.meshTransform.translation[i]),
      moved.actorTransform.translation.map((v, i) => v - original.actorTransform.translation[i]),
    );
    assert.equal(moved.attachment.supportActorPath, original.attachment.supportActorPath);
    await click('undo');
    await settle();
    assert.deepEqual((await inspector()).actorTransform, original.actorTransform);
    await click('redo');
    await settle();
    near((await inspector()).actorTransform.translation, moved.actorTransform.translation);
    await click('undo');
    await settle();
  }
  await prepare();
  await drag('z', { multiplier: 6 });
  near((await inspector()).actorTransform.translation, [0, 0, 472]);
  await prepare();
  await drag('z');
  near((await inspector()).actorTransform.translation, [0, 0, 472]);
  await click('undo');
  await settle();
  near((await inspector()).actorTransform.translation, [0, 0, 0]);
  await prepare();
  await page.locator('#offsetZ').fill('473');
  await click('applyOffsets');
  assert.match(await page.locator('#status').textContent(), /Estimated/);
  near((await inspector()).actorTransform.translation, [0, 0, 0]);
  await page.locator('#offsetZ').fill('0');
  await page.locator('#constrainZ').uncheck();
  await prepare();
  await drag('z', { multiplier: 6 });
  assert.ok((await inspector()).actorTransform.translation[2] > 472);
  await click('undo');
  await settle();
  await page.locator('#constrainZ').check();
  await prepare();
  await page.locator('#moveSnap').selectOption('128');
  await drag('x');
  const snapped = await inspector();
  assert.ok(
    Math.abs(
      snapped.actorTransform.translation[0] / 128 -
        Math.round(snapped.actorTransform.translation[0] / 128),
    ) < 1e-7,
  );
  await click('undo');
  await settle();
  await prepare();
  await drag('z', { cancel: true });
  assert.deepEqual((await inspector()).actorTransform, original.actorTransform);
  await prepare();
  await drag('y');
  await page.screenshot({ path: 'artifacts/validation/gizmo-move.png' });
  await click('undo');
  await settle();
  await page
    .locator('#file')
    .setInputFiles(path.resolve('artifacts/validation/gizmo-ceiling.json'));
  await settle();
  assert.equal(await page.locator('#filename').textContent(), 'gizmo-ceiling.json');
  await page.keyboard.press('Control+a');
  await click('selectionChip');
  await click('trapsOnly');
  const ceiling = await inspector();
  await click('selectionOffsets');
  await click('flipSelected');
  await settle();
  const flipped = await inspector();
  near(flipped.actorTransform.translation, ceiling.actorTransform.translation);
  assert.ok(Math.abs(flipped.actorTransform.rotation[1]) > 0.999999);
  assert.equal(flipped.attachment.side, 1);
  assert.equal(flipped.attachment.supportActorPath, ceiling.attachment.supportActorPath);
  await click('selectionChip');
  await click('frameSelection');
  await page.screenshot({ path: 'artifacts/validation/gizmo-upside-down.png' });
  await prepare();
  await page.locator('#offsetLimit').selectOption('placement');
  await page.locator('#moveSnap').selectOption('0');
  await drag('x', { multiplier: 6 });
  assert.ok(Math.abs((await inspector()).actorTransform.translation[0]) <= 1000);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+a');
  await click('selectionChip');
  await click('structuresOnly');
  await click('buildTool');
  await click('chooseTrap');
  const ceilingOption = await page
    .locator('#trapTemplate option')
    .evaluateAll((os) => os.find((o) => o.textContent.includes('Ceiling Gas')).value);
  await page.locator('#trapTemplate').selectOption(ceilingOption);
  await page.locator('#ceilingFlip').check();
  await page.locator('#exactPlacement').evaluate((e) => (e.open = true));
  await click('previewPlace');
  await click('place');
  await settle();
  const placed = await inspector();
  assert.ok(Math.abs(placed.actorTransform.rotation[1]) > 0.999999);
  near(placed.actorTransform.translation, [0, 0, 0]);
  const dir = path.join(process.env.LOCALAPPDATA, 'FortniteGame/Saved/SaveGames');
  const file = (await readdir(dir)).find(
    (f) =>
      f.startsWith('STW_Homebase_NightcoreASAP') && f.includes('Stonewood') && f.endsWith('.sav'),
  );
  await page.locator('#file').setInputFiles(path.join(dir, file));
  await settle();
  await page.locator('#documents button').filter({ hasText: 'gizmo-ceiling' }).click();
  await settle();
  const dest = path.resolve('artifacts/validation/gizmo-export.sav');
  await app.evaluate(({ session }, dest) => {
    globalThis.gizmoDownload = null;
    session.defaultSession.once('will-download', (_e, item) => {
      item.setSavePath(dest);
      item.once('done', (_e, state) => (globalThis.gizmoDownload = state));
    });
  }, dest);
  await click('exportSave');
  for (let i = 0; i < 100 && !(await app.evaluate(() => globalThis.gizmoDownload)); i++)
    await page.waitForTimeout(100);
  assert.equal(await app.evaluate(() => globalThis.gizmoDownload), 'completed');
  await page.locator('#file').setInputFiles(dest);
  await settle();
  assert.equal(await page.locator('#traps').textContent(), '2');
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    checks: [
      'estimated total Z clamp at 472',
      'repeated drag cannot bypass Z bound',
      'numeric Z rejection',
      'Z constraint opt-out',
      'real pointer XYZ drag with correct Unreal axes',
      'actor and mesh move together',
      'support retained',
      'single-step undo redo',
      'delta snap',
      'Escape cancellation and next drag',
      'captured ceiling flip',
      'new inverted ceiling placement',
      'bounded drag',
      'native sav export and reimport',
    ],
    errors,
  };
  await writeFile('artifacts/validation/gizmo-smoke.json', JSON.stringify(report, null, 2));
  console.log(report);
} catch (error) {
  console.error(
    String(error),
    await page.locator('#status').textContent(),
    await page.locator('#moveReadout').textContent(),
    errors,
  );
  await page.screenshot({ path: 'artifacts/validation/gizmo-failure.png' });
  throw error;
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

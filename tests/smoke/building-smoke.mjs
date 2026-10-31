import { _electron as electron } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const app = await electron.launch(
  process.env.VIEWER_EXE
    ? { executablePath: process.env.VIEWER_EXE, args: ['--smoke-test'] }
    : { args: ['.', '--smoke-test'] },
);
const page = await app.firstWindow(),
  errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.show();
  w.focus();
});
const click = (id) => page.locator('#' + id).click();
const settle = () => page.waitForFunction(() => !document.querySelector('#open').disabled);
const open = async (kind) => {
  await page.locator('#file').setInputFiles(path.resolve(`artifacts/validation/build-${kind}.sav`));
  await settle();
};
const inspect = async () => JSON.parse(await page.locator('#selection').textContent());
async function download(id, name) {
  const destination = path.resolve('artifacts/validation/' + name);
  await app.evaluate(({ session }, destination) => {
    globalThis.buildDownload = null;
    session.defaultSession.once('will-download', (_event, item) => {
      item.setSavePath(destination);
      item.once('done', (_e, state) => (globalThis.buildDownload = state));
    });
  }, destination);
  await click(id);
  for (let i = 0; i < 100 && !(await app.evaluate(() => globalThis.buildDownload)); i++)
    await page.waitForTimeout(100);
  assert.equal(await app.evaluate(() => globalThis.buildDownload), 'completed');
  return destination;
}
try {
  await open('wall');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('e');
  assert.equal(await page.locator('#pieceEditGrid button').count(), 9);
  await page.locator('[data-cell="4"]').click();
  assert.equal(await page.locator('#pieceEditResult').textContent(), 'Window');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'artifacts/validation/build-wall-window.png' });
  await page.keyboard.press('Enter');
  await settle();
  assert.match((await inspect()).mesh, /WindowC/);
  const afterWindow = await download('saveDraft', 'build-window-draft.json');
  const windowData = JSON.parse(await readFile(afterWindow, 'utf8'));
  assert.equal(windowData.placements[0].actorPath, 'fixture-wall');
  await click('undo');
  await settle();
  assert.match((await inspect()).mesh, /Solid/);
  await click('redo');
  await settle();
  assert.match((await inspect()).mesh, /WindowC/);
  await page.keyboard.press('e');
  await page.locator('[data-cell="7"]').click();
  assert.equal(await page.locator('#pieceEditResult').textContent(), 'Door');
  await click('confirmPieceEdit');
  await settle();
  assert.match((await inspect()).mesh, /DoorC/);
  await page.keyboard.press('e');
  await click('resetPieceEdit');
  for (let i = 0; i < 9; i++) await page.locator(`[data-cell="${i}"]`).click();
  assert.equal(
    await page.locator('#confirmPieceEdit').evaluate((e) => e.disabled === false),
    false,
  );
  await page.keyboard.press('Escape');
  assert.match((await inspect()).mesh, /DoorC/);
  await page.keyboard.press('e');
  if (!(await page.locator('#pieceEditPanel details').evaluate((e) => e.open)))
    await page.locator('#pieceEditPanel details summary').click();
  await page.locator('[data-pattern="DoorSide"]').click();
  await click('mirrorPieceEdit');
  await click('confirmPieceEdit');
  await settle();
  assert.deepEqual((await inspect()).actorTransform.scale, [-1, 1, 1]);
  await download('exportSave', 'building-edited-export.sav');
  await open('floor');
  await page.keyboard.press('Control+a');
  await click('frameSelection');
  await click('buildTool');
  await page.locator('#cameraView').selectOption('bottom');
  const box = await page.locator('#viewport>canvas').boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(200);
  assert.equal(
    await page.locator('#placementFeedback').getAttribute('data-invalid'),
    'false',
    await page.locator('#placementFeedback').textContent(),
  );
  await page.screenshot({ path: 'artifacts/validation/build-underneath-preview.png' });
  await page.mouse.click(point.x, point.y);
  await settle();
  assert.equal(await page.locator('#structures').textContent(), '2');
  assert.equal((await inspect()).actorTransform.translation[2], -384);
  await page.keyboard.press('Escape');
  await click('undo');
  await settle();
  assert.equal(await page.locator('#structures').textContent(), '1');
  await click('buildTool');
  await page.keyboard.press('2');
  await page.locator('#cameraView').selectOption('top');
  await page.keyboard.press('PageDown');
  assert.equal(await page.locator('#buildHeight').inputValue(), 'below');
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(150);
  await page.mouse.click(point.x, point.y);
  await settle();
  assert.equal(await page.locator('#structures').textContent(), '2');
  assert.equal((await inspect()).actorTransform.translation[2], -384);
  await page.keyboard.press('Escape');
  await download('exportSave', 'building-below-export.sav');
  await open('floor');
  await page.keyboard.press('3');
  await page.keyboard.press('Home');
  await page.keyboard.press('r');
  await page.locator('#cameraView').selectOption('top');
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(200);
  await page.mouse.click(point.x, point.y);
  await settle();
  assert.equal(await page.locator('#structures').textContent(), '2');
  assert.match((await inspect()).mesh, /StairW/);
  await page.keyboard.press('4');
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(150);
  await page.mouse.click(point.x, point.y);
  await settle();
  assert.equal(await page.locator('#structures').textContent(), '3');
  assert.match((await inspect()).mesh, /RoofC/);
  await page.keyboard.press('Escape');
  for (const [kind, shape] of [
    ['floor', 'BalconyO'],
    ['stair', 'StairT'],
    ['roof', 'RoofO'],
  ]) {
    await open(kind);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('e');
    if (!(await page.locator('#pieceEditPanel details').evaluate((e) => e.open)))
      await page.locator('#pieceEditPanel details summary').click();
    await page.locator(`[data-pattern="${shape}"]`).click();
    await click('rotatePieceEdit');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `artifacts/validation/build-${kind}-edit.png` });
    await click('confirmPieceEdit');
    await settle();
    assert.match((await inspect()).mesh, new RegExp(shape));
  }
  await open('cone-trap');
  await page.keyboard.press('Control+a');
  await click('selectionChip');
  await click('structuresOnly');
  await click('frameSelection');
  await click('buildTool');
  await page.keyboard.press('5');
  assert.equal(await page.locator('#useOffsets').isChecked(), false);
  assert.equal(await page.locator('#autoFitCone').isChecked(), true);
  await page.locator('#cameraView').selectOption('top');
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(() => document.querySelector('#place').disabled === false);
  await page.mouse.click(point.x, point.y);
  await settle();
  assert.equal(await page.locator('#traps').textContent(), '2');
  assert.equal((await inspect()).actorTransform.translation[2], -91);
  assert.ok(Math.abs((await inspect()).attachment.relativeTransform.translation[0]) < 1e-8);
  assert.ok(Math.abs((await inspect()).attachment.relativeTransform.translation[1] + 512) < 1e-8);
  await page.keyboard.press('Escape');
  await click('selectionChip');
  await click('selectionOffsets');
  await page.locator('#offsetZ').fill('-20');
  await click('applyOffsets');
  await settle();
  assert.equal((await inspect()).actorTransform.translation[2], -111);
  await click('undo');
  await settle();
  assert.equal((await inspect()).actorTransform.translation[2], -91);
  assert.ok(Math.abs((await inspect()).attachment.relativeTransform.translation[0]) < 1e-8);
  assert.ok(Math.abs((await inspect()).attachment.relativeTransform.translation[1] + 512) < 1e-8);
  await page.keyboard.press('Escape');

  await open('floor');
  await page.keyboard.press('Control+a');
  await click('frameSelection');
  await page.locator('#cameraView').selectOption('top');
  await click('fly');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus());
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => Boolean(document.pointerLockElement));
  await page.keyboard.press('2');
  await page.keyboard.press('PageDown');
  await page.waitForFunction(() => document.querySelector('#place').disabled === false);
  assert.equal(await page.locator('#fly').evaluate((e) => e.classList.contains('active')), true);
  await page.mouse.click(point.x, point.y);
  await settle();
  assert.equal(await page.locator('#structures').textContent(), '2');
  assert.equal((await inspect()).actorTransform.translation[2], -384);
  assert.equal(await page.evaluate(() => Boolean(document.pointerLockElement)), true);
  assert.equal(await page.locator('#fly').evaluate((e) => e.classList.contains('active')), true);
  await page.keyboard.press('4');
  await page.keyboard.press('Home');
  await page.keyboard.press('r');
  await page.waitForFunction(() => document.querySelector('#place').disabled === false);
  await page.mouse.click(point.x, point.y);
  await settle();
  assert.equal(await page.locator('#structures').textContent(), '3');
  assert.match((await inspect()).mesh, /RoofC/);
  assert.equal(await page.locator('#fly').evaluate((e) => e.classList.contains('active')), true);
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => !document.pointerLockElement);
  await click('closeBuild');
  assert.equal(await page.locator('#fly').evaluate((e) => e.classList.contains('active')), true);
  await click('buildTool');
  assert.equal(await page.locator('#fly').evaluate((e) => e.classList.contains('active')), true);
  await click('orbit');
  assert.equal(await page.locator('#placePanel').isVisible(), true);
  await click('fly');
  assert.equal(await page.locator('#placePanel').isVisible(), true);
  await click('closeBuild');
  await click('orbit');
  await open('roof');
  await page.keyboard.press('Control+a');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 640));
  await page.keyboard.press('e');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'artifacts/validation/build-edit-compact.png' });
  await click('cancelPieceEdit');
  await open('mirrored-wall');
  await page.keyboard.press('Control+a');
  const before = await inspect();
  await page.keyboard.press('e');
  await page.keyboard.press('Enter');
  assert.deepEqual(await inspect(), before);
  assert.equal(await page.locator('#undo').evaluate((e) => e.disabled), true);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: grid edits, invalid masks, reset/cancel, mirror, undo/redo, native export, pointer placement underneath, explicit below from above, floor/ramp/cone edits, ceiling traps on ramp-shaped cones, repeated crosshair building in fly mode and compact layout.',
  );
} catch (e) {
  await page.screenshot({ path: 'artifacts/validation/building-failure.png' });
  console.error(
    await page.locator('#status').textContent(),
    await page.locator('#placementFeedback').textContent(),
  );
  throw e;
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

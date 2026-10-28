import { _electron as electron } from 'playwright';
import path from 'node:path';
import assert from 'node:assert/strict';

const app = await electron.launch({ args: ['.', '--smoke-test'] });
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const settle = () => page.waitForFunction(() => !document.querySelector('#open').disabled);
const inspect = async () => JSON.parse(await page.locator('#selection').textContent());
const click = (id) => page.locator('#' + id).click();
try {
  await page.locator('#file').setInputFiles(path.resolve('artifacts/validation/build-floor.sav'));
  await settle();
  await page.locator('#cameraView').selectOption('top');
  await page.locator('#cameraView').evaluate((e) => e.blur());
  await page.keyboard.press('Control+a');
  const original = (await inspect()).actorTransform.translation;
  await page.locator('#cameraView').focus();
  await page.keyboard.press('ArrowDown');
  assert.deepEqual((await inspect()).actorTransform.translation, original);
  await page.locator('#cameraView').selectOption('top');
  await page.locator('#cameraView').evaluate((e) => e.blur());
  for (const key of ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft']) {
    const before = (await inspect()).actorTransform.translation;
    await page.keyboard.press(key);
    await settle();
    const after = (await inspect()).actorTransform.translation;
    assert.equal(Math.hypot(after[0] - before[0], after[1] - before[1]), 512);
    assert.equal(after[2], before[2]);
  }
  assert.deepEqual((await inspect()).actorTransform.translation, original);
  await page.keyboard.press('Control+z');
  await settle();
  assert.notDeepEqual((await inspect()).actorTransform.translation, original);
  await page.keyboard.press('Control+y');
  await settle();
  assert.deepEqual((await inspect()).actorTransform.translation, original);
  await page.keyboard.press('e');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  assert.deepEqual((await inspect()).actorTransform.translation, original);

  await click('newBlueprint');
  await settle();
  assert.equal(await page.locator('#structures').textContent(), '0');
  await page.keyboard.press('2');
  const box = await page.locator('#viewport>canvas').boundingBox();
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(centre.x, centre.y);
  await page.waitForFunction(
    () =>
      document.querySelector('#placementFeedback').textContent === 'Click to place a floor here.',
  );
  await page.mouse.click(centre.x, centre.y);
  await settle();
  assert.equal(await page.locator('#structures').textContent(), '1');
  assert.equal((await inspect()).actorTransform.translation[2], 0);

  for (const [key, name, dx, dy] of [
    ['1', 'wall', -200, 0],
    ['3', 'ramp', -200, -150],
    ['4', 'cone', -200, 150],
  ]) {
    await page.keyboard.press(key);
    await page.mouse.move(centre.x + dx, centre.y + dy);
    await page.waitForFunction(
      (name) =>
        document.querySelector('#placementFeedback').textContent ===
        `Click to place a ${name} here.`,
      name,
    );
    await page.mouse.click(centre.x + dx, centre.y + dy);
    await settle();
  }
  assert.equal(await page.locator('#structures').textContent(), '4');
  await page.keyboard.press('Escape');
  await click('newBlueprint');
  await settle();
  await page.keyboard.press('5');
  await page.mouse.move(centre.x, centre.y);
  await page.waitForFunction(
    () =>
      document.querySelector('#placementFeedback').textContent ===
      'Place a floor or wall first to support a trap.',
  );
  assert.equal(await page.locator('#place').evaluate((e) => e.disabled), true);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: four arrow directions, undo/redo, edit-mode isolation, empty-ground floor/wall/ramp/cone placement, and trap support requirement.',
  );
} catch (error) {
  console.error(
    await page.locator('#status').textContent(),
    await page.locator('#placementFeedback').textContent(),
  );
  throw error;
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

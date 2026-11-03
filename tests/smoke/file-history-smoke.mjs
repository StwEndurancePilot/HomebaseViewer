import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';

const app = await electron.launch(
  process.env.VIEWER_EXE
    ? { executablePath: process.env.VIEWER_EXE, args: ['--smoke-test'] }
    : { args: ['.', '--smoke-test'] },
);
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const click = (id) => page.locator(`#${id}`).click();
const settle = () => page.waitForFunction(() => !document.querySelector('#open').disabled);
const count = async (n) => {
  await page.waitForFunction(
    (n) => document.querySelector('#structures').textContent === String(n),
    n,
  );
  await settle();
};
const entries = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('homebase-drafts', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('drafts').objectStore('drafts').getAll();
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );
try {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].show();
    BrowserWindow.getAllWindows()[0].focus();
  });
  await click('welcomeNew');
  await page.locator('#baseName').fill('Fresh base');
  await page.locator('#baseZone').selectOption('blank');
  await click('createBase');
  await count(0);
  assert.equal((await entries())[0].name, 'Fresh base.sav');
  assert.ok((await entries())[0].template.length > 0);
  await click('chooseFloor');
  const canvas = await page.locator('canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.waitForFunction(
    () =>
      document.querySelector('#placementFeedback').textContent === 'Click to place a floor here.',
  );
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await count(1);
  await page.keyboard.press('Escape');
  assert.equal((await entries())[0].data.placements.length, 1);

  const file = path.resolve('artifacts/validation/build-floor.sav');
  await page.locator('#file').setInputFiles(file);
  await settle();
  assert.equal(await page.locator('.document-name').count(), 2);
  assert.equal((await entries()).length, 2);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+x');
  await count(0);
  await page.locator('.document-name').filter({ hasText: 'Fresh base' }).click();
  await settle();
  await page.keyboard.press('Control+v');
  await page.locator('#pasteX').fill('2048');
  await click('previewPaste');
  await click('commitPaste');
  await count(2);
  await page.locator('.document-name').filter({ hasText: 'build-floor' }).click();
  await settle();
  await page.keyboard.press('Control+z');
  await count(1);
  await page
    .locator('.document-tab')
    .filter({ hasText: 'Fresh base' })
    .locator('.document-close')
    .click();
  assert.equal(await page.locator('.document-name').count(), 1);
  await page.keyboard.press('Control+w');
  await page.waitForFunction(() => document.querySelectorAll('.document-name').length === 0);
  assert.equal(await page.locator('#welcome').isVisible(), true);

  await page.reload();
  await click('historyOpen');
  await page.waitForFunction(() => document.querySelectorAll('.history-entry').length === 2);
  await page.locator('.history-entry').filter({ hasText: 'Fresh base' }).click();
  await count(2);
  assert.equal(await page.locator('.document-name').count(), 1);
  await click('historyOpen');
  await page.locator('.history-entry').filter({ hasText: 'Fresh base' }).click();
  await settle();
  assert.equal(await page.locator('.document-name').count(), 1);
  await app.evaluate(
    ({ app }, file) => app.emit('second-instance', {}, [app.getPath('exe'), file]),
    file,
  );
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.document-name').length === 2 &&
      !document.querySelector('#open').disabled,
  );
  await count(1);
  assert.equal((await entries()).length, 3);
  await page.locator('#file').setInputFiles(file);
  await settle();
  assert.equal(await page.locator('.document-name').count(), 3);
  assert.equal((await entries()).length, 4);

  await page.evaluate(() => {
    globalThis.originalTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      if (args[1] === 'readwrite') throw new DOMException('Disk full', 'QuotaExceededError');
      return globalThis.originalTransaction.apply(this, args);
    };
  });
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await count(0);
  assert.equal(await page.locator('#draftState').textContent(), 'Draft not saved');
  await page.keyboard.press('Control+w');
  await page.waitForFunction(() =>
    document.querySelector('#status').textContent.includes('Tab kept open'),
  );
  assert.equal(await page.locator('.document-name').count(), 3);
  await page.evaluate(() => {
    IDBDatabase.prototype.transaction = globalThis.originalTransaction;
  });
  await page.keyboard.press('Control+w');
  await page.waitForFunction(() => document.querySelectorAll('.document-name').length === 2);
  await settle();
  await page.setViewportSize({ width: 960, height: 640 });
  assert.ok(await page.locator('#historyOpen').isVisible());
  await click('historyOpen');
  await page.screenshot({ path: 'artifacts/validation/file-history.png' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: new base, automatic drafts, history after reload, cut/paste, independent undo, close tabs, duplicate opens, shell handoff and failed-save recovery.',
  );
} catch (error) {
  console.error(await page.locator('#status').textContent());
  await page.screenshot({ path: 'artifacts/validation/file-history-failure.png' });
  throw error;
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

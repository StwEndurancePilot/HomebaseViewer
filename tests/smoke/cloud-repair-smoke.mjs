import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const file = path.resolve(process.argv[2] || 'artifacts/validation/cloud-special-draft.json');
const source = JSON.parse(await readFile(file, 'utf8'));
const app = await electron.launch({ args: ['.', '--smoke-test'] });
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const settle = () => page.waitForFunction(() => !document.querySelector('#open').disabled);
const draft = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('homebase-drafts', 1);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('drafts').objectStore('drafts').getAll();
          read.onsuccess = () => {
            db.close();
            resolve(read.result[0]);
          };
          read.onerror = () => reject(read.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
function verify(data) {
  assert.equal(data.placements.length, source.placements.length);
  assert.deepEqual(
    data.placements.map((p) => [p.actorPath, p.classPath, p.transform, p.attachment]),
    source.placements.map((p) => [p.actorPath, p.classPath, p.transform, p.attachment]),
  );
  assert.ok(data.placements.every((p) => p.meshPath && !p.cloudIssues?.length));
  assert.ok(
    data.placements
      .filter((p) => p.kind === 'structure')
      .every((p) => [0, 1, 2].includes(p.resourceType)),
  );
}
try {
  await page.locator('#file').setInputFiles(file);
  await settle();
  verify((await draft()).data);
  await page.locator('#exportSave').click();
  await page.locator('#exportNameDialog').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+w');
  await page.waitForFunction(() => document.querySelectorAll('.document-name').length === 0);
  await page.evaluate(
    (source) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('homebase-drafts', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('drafts', 'readwrite');
          const store = tx.objectStore('drafts');
          const read = store.getAll();
          read.onsuccess = () => {
            const old = read.result[0];
            store.put({ ...old, data: source, revision: 7, savedRevision: 7 });
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
    source,
  );
  await page.reload();
  await page.locator('.home-history-entry').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.document-name').length === 1);
  await settle();
  const restored = await draft();
  verify(restored.data);
  assert.equal(restored.revision, 8);
  assert.equal(restored.savedRevision, 7);
  assert.equal(restored.dirty, true);
  const dest = path.resolve('artifacts/validation/cloud-repair-ui.sav');
  await app.evaluate(({ session }, dest) => {
    globalThis.repairDownload = null;
    session.defaultSession.once('will-download', (_event, item) => {
      item.setSavePath(dest);
      item.once('done', (_event, state) => (globalThis.repairDownload = state));
    });
  }, dest);
  await page.locator('#exportSave').click();
  await page.locator('#confirmExportName').click();
  for (let i = 0; i < 100 && !(await app.evaluate(() => globalThis.repairDownload)); i++)
    await page.waitForTimeout(100);
  assert.equal(await app.evaluate(() => globalThis.repairDownload), 'completed');
  assert.deepEqual(errors, []);
  console.log(
    `PASS: repaired file import and History restore, preserved ${source.placements.length} pieces, SAV download completed.`,
  );
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

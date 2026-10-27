import { _electron as electron } from 'playwright';
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
try {
  await page.locator('#file').setInputFiles('D:/Downloads/sota test 3.sav');
  await page.waitForFunction(
    () =>
      document.querySelector('#filename').textContent === 'sota test 3.sav' &&
      !document.querySelector('#open').disabled,
  );
  const destination = path.resolve('artifacts/validation/sota-packaged-export.sav');
  await app.evaluate(({ session }, destination) => {
    globalThis.replayDownload = null;
    session.defaultSession.once('will-download', (_e, item) => {
      item.setSavePath(destination);
      item.once('done', (_e, state) => (globalThis.replayDownload = state));
    });
  }, destination);
  await page.locator('#exportSave').click();
  for (let i = 0; i < 100 && !(await app.evaluate(() => globalThis.replayDownload)); i++)
    await page.waitForTimeout(100);
  assert.equal(await app.evaluate(() => globalThis.replayDownload), 'completed');
  assert.deepEqual(errors, []);
  console.log('PASS: packaged app imported the reported save and exported it successfully.');
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

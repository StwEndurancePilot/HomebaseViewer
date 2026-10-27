import { _electron as electron } from 'playwright';
import { readFile } from 'node:fs/promises';
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
async function download(id, name) {
  const dest = path.resolve('artifacts/validation/' + name);
  await app.evaluate(({ session }, dest) => {
    globalThis.exportDone = null;
    session.defaultSession.once('will-download', (_e, item) => {
      item.setSavePath(dest);
      item.once('done', (_e, s) => (globalThis.exportDone = s));
    });
  }, dest);
  await page.locator('#' + id).click();
  for (let i = 0; i < 100 && !(await app.evaluate(() => globalThis.exportDone)); i++)
    await page.waitForTimeout(100);
  assert.equal(await app.evaluate(() => globalThis.exportDone), 'completed');
  return readFile(dest);
}
try {
  await page.locator('#file').setInputFiles(path.resolve('artifacts/validation/build-wall.json'));
  await page.waitForFunction(() => !document.querySelector('#open').disabled);
  await page.locator('#exportOptions').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#exportMenu').open &&
      document.querySelector('#exportOptions').getAttribute('aria-expanded') === 'true',
  );
  await page.locator('#exportMenuJson').hover();
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'artifacts/validation/export-formats-menu.png' });
  const json = (await download('exportMenuJson', 'formatted-blueprint.json')).toString('utf8');
  assert.ok(json.startsWith('{\n  '));
  assert.ok(json.endsWith('\n'));
  const data = JSON.parse(json);
  assert.equal(data.placements.length, 1);
  await page
    .locator('#file')
    .setInputFiles(path.resolve('artifacts/validation/formatted-blueprint.json'));
  await page.waitForFunction(() => !document.querySelector('#open').disabled);
  assert.equal(await page.locator('#structures').textContent(), '1');
  await page
    .locator('#file')
    .setInputFiles(path.resolve('artifacts/validation/utf8-unicode-export.sav'));
  await page.waitForFunction(() => !document.querySelector('#open').disabled);
  await page.locator('#exportOptions').click();
  const bytes = await download('exportMenuSav', 'utf8-packaged-export.sav');
  const start = bytes.indexOf(Buffer.from('STW_HOMEBASE_1\n'));
  assert.ok(start > 0);
  const count = bytes.readInt32LE(start - 4);
  assert.ok(count > 0);
  assert.equal(bytes.subarray(start, start + count - 1).includes(0), false);
  assert.ok(
    bytes
      .subarray(start, start + count - 1)
      .toString('utf8')
      .includes('Twine — 城 🏠'),
  );
  await page.waitForFunction(
    () =>
      !document.querySelector('#exportMenu').open &&
      document.querySelector('#exportOptions').getAttribute('aria-expanded') === 'false',
  );
  await page.locator('#exportOptions').click();
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () =>
      !document.querySelector('#exportMenu').open &&
      document.querySelector('#exportOptions').getAttribute('aria-expanded') === 'false',
  );
  await page.locator('#exportOptions').focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(
    () =>
      document.querySelector('#exportMenu').open &&
      document.querySelector('#exportOptions').getAttribute('aria-expanded') === 'true',
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () =>
      !document.querySelector('#exportMenu').open &&
      document.querySelector('#exportOptions').getAttribute('aria-expanded') === 'false',
  );
  const geometry = await page.evaluate(() => {
    const a = document.querySelector('#exportSave').getBoundingClientRect(),
      b = document.querySelector('#exportOptions').getBoundingClientRect();
    return { gap: b.left - a.right, arrow: b.width, height: b.height };
  });
  assert.equal(geometry.gap, 0);
  assert.equal(geometry.arrow, 40);
  assert.equal(geometry.height, 40);
  for (let i = 0; i < 3 && (await page.locator('html').getAttribute('data-theme')) !== 'light'; i++)
    await page.locator('#theme').click();
  await page.locator('#exportOptions').click();
  await page.waitForFunction(
    () => document.querySelector('#exportOptions').getAttribute('aria-expanded') === 'true',
  );
  await page.locator('#exportMenuJson').hover();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/validation/export-formats-light.png' });
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () =>
      !document.querySelector('#exportMenu').open &&
      document.querySelector('#exportOptions').getAttribute('aria-expanded') === 'false',
  );
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 640));
  await page.locator('#exportOptions').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#exportMenu').open &&
      document.querySelector('#exportOptions').getAttribute('aria-expanded') === 'true',
  );
  await page.locator('#exportMenuJson').hover();
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'artifacts/validation/export-formats-compact.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: Material export menu, JSON-only export/reimport, indented UTF-8 JSON, UTF-8 SAV with Unicode and no interleaved nulls, Escape and compact layout.',
  );
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

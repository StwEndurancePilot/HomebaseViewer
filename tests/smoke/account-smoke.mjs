import { _electron as electron } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const raw = Array.from(await readFile('artifacts/validation/cloud-current-raw.sav'));
const app = await electron.launch(
  process.env.VIEWER_EXE
    ? { executablePath: process.env.VIEWER_EXE, args: ['--smoke-test'] }
    : { args: ['.', '--smoke-test'] },
);
const page = await app.firstWindow(),
  errors = [],
  requests = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('request', (r) => {
  if (/^https?:/.test(r.url())) requests.push(r.url());
});
const click = (id) => page.locator('#' + id).click();
const settle = async () => {
  await page.waitForFunction(() => !document.querySelector('#open').disabled);
  await page.waitForTimeout(200);
};
try {
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.show();
    w.focus();
  });
  await click('welcomeAccount');
  assert.equal(await page.locator('#accountStatus').isVisible(), false);
  assert.equal(await page.locator('#accountError').isVisible(), false);
  await click('accountClose');
  await page.locator('#file').setInputFiles(path.resolve('artifacts/validation/cloud-raw.sav'));
  await page.locator('#localCloudImport').waitFor({ state: 'visible' });
  await click('importLocalCloud');
  assert.match(await page.locator('#accountError').textContent(), /Choose the zone/);
  await page.locator('#localCloudZone').selectOption('pve_04');
  await click('importLocalCloud');
  await settle();
  assert.equal(await page.locator('#accountPanel').isVisible(), false);
  assert.equal(await page.locator('#exportIssuesPanel').isVisible(), false);
  await app.evaluate(({ ipcMain, BrowserWindow }, raw) => {
    const w = BrowserWindow.getAllWindows()[0],
      zones = ['Stonewood', 'Plankerton', 'Canny Valley', 'Twine Peaks'].map((name, i) => ({
        id: `pve_0${i + 1}`,
        name,
        file: `home${i}.sav`,
        available: i === 3,
        level: 10,
        updated: '2026-10-26T12:00:00Z',
      }));
    const emit = (s) => {
      globalThis.mockAccount = s;
      w.webContents.send('epic-state', s);
    };
    globalThis.mockAccount = { status: 'signed-out', zones: [] };
    globalThis.mockDownloads = [];
    for (const channel of [
      'epic-state',
      'epic-login',
      'epic-cancel',
      'epic-list',
      'epic-download',
      'epic-reopen',
    ])
      ipcMain.removeHandler(channel);
    ipcMain.handle('epic-state', () => ({ ok: true, value: globalThis.mockAccount }));
    ipcMain.handle('epic-login', () => {
      emit({ status: 'waiting', userCode: 'TEST-CODE', zones: [] });
      return { ok: true };
    });
    ipcMain.handle('epic-reopen', () => ({ ok: true }));
    ipcMain.handle('epic-list', () => {
      emit({ status: 'signed-in', displayName: 'Import test', zones });
      return { ok: true, value: zones };
    });
    ipcMain.handle('epic-cancel', () => {
      emit({ status: 'signed-out', zones: [] });
      return { ok: true };
    });
    ipcMain.handle('epic-download', (_event, id) => {
      globalThis.mockDownloads.push(id);
      return {
        ok: true,
        value: {
          zone: zones.find((z) => z.id === id),
          bytes: Uint8Array.from(raw),
          sourceBytes: raw.length,
        },
      };
    });
    globalThis.finishMockLogin = () =>
      emit({ status: 'signed-in', displayName: 'Import test', zones });
  }, raw);
  await click('accountOpen');
  await click('epicLogin');
  await page.waitForFunction(() =>
    document.querySelector('#epicCode').textContent.includes('TEST-CODE'),
  );
  assert.equal(await page.locator('#epicReopen').isVisible(), true);
  await click('epicCancel');
  assert.equal(await page.locator('#epicCode').isVisible(), false);
  await click('epicLogin');
  await app.evaluate(() => globalThis.finishMockLogin());
  await page.waitForFunction(() => document.querySelectorAll('#cloudZones button').length === 4);
  assert.equal(await page.locator('#cloudZones button:disabled').count(), 3);
  await page.screenshot({ path: 'artifacts/validation/account-zones.png' });
  await page.locator('[data-zone=pve_04]').click();
  await settle();
  assert.deepEqual(await app.evaluate(() => globalThis.mockDownloads), ['pve_04']);
  assert.equal(await page.locator('#accountPanel').isVisible(), false);
  assert.match(await page.locator('#status').textContent(), /Imported 3 pieces/);
  const dest = path.resolve('artifacts/validation/account-ui-export.sav');
  await app.evaluate(({ session }, dest) => {
    globalThis.accountDownload = null;
    session.defaultSession.once('will-download', (_e, item) => {
      item.setSavePath(dest);
      item.once('done', (_e, state) => (globalThis.accountDownload = state));
    });
  }, dest);
  await click('exportSave');
  for (let i = 0; i < 100 && !(await app.evaluate(() => globalThis.accountDownload)); i++)
    await page.waitForTimeout(100);
  assert.equal(await app.evaluate(() => globalThis.accountDownload), 'completed');
  await click('accountOpen');
  await click('epicCancel');
  assert.equal(await page.locator('#cloudZones button').count(), 0);
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('penny-list');
    ipcMain.removeHandler('penny-login');
    ipcMain.handle('penny-list', () => ({
      ok: true,
      value: { accounts: [{ id: 'mock-penny', displayName: 'Saved Penny test' }], message: '' },
    }));
    ipcMain.handle('penny-login', (_e, id) => {
      if (id !== 'mock-penny') throw new Error('Wrong account');
      globalThis.finishMockLogin();
      return { ok: true };
    });
  });
  await click('pennyRefresh');
  await page
    .locator('#pennyAccountList button')
    .filter({ hasText: 'Saved Penny test' })
    .waitFor({ state: 'visible' });
  await page.screenshot({ path: 'artifacts/validation/penny-accounts.png' });
  await page.locator('#pennyAccountList button').filter({ hasText: 'Saved Penny test' }).click();
  await page.waitForFunction(
    () => document.querySelector('#accountStatus').textContent === 'Import test',
  );
  assert.equal(await page.locator('#cloudZones button').count(), 4);
  await click('epicCancel');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 640));
  await page.waitForTimeout(200);
  const panel = await page.locator('#accountPanel').boundingBox();
  const viewport = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  assert.ok(
    panel.x >= 0 &&
      panel.y >= 0 &&
      panel.x + panel.width <= viewport.w &&
      panel.y + panel.height <= viewport.h,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  const result = {
    passed: true,
    checks: [
      'real sandboxed IPC state and archive decoder',
      'local cloud zone picker and required choice',
      'mocked Epic device login/cancel/reopen',
      'available-zone listing',
      'download and conversion',
      'menu save export without local template',
      'Penny account discovery/selection and login UI (mock authentication)',
      'sign out',
      '960x640 panel bounds',
    ],
    errors,
    requests,
  };
  await writeFile('artifacts/validation/account-smoke.json', JSON.stringify(result, null, 2));
  console.log(result);
} catch (e) {
  await page.screenshot({ path: 'artifacts/validation/account-failure.png' });
  console.error(
    await page.locator('#accountError').textContent(),
    await page.locator('#status').textContent(),
    errors,
  );
  throw e;
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

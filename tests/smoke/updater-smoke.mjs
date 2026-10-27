import { _electron as electron } from 'playwright';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('artifacts/validation/updater');
await mkdir(root, { recursive: true });
const bytes = Buffer.from('MZHomebaseUpdaterDownloadFixture'.repeat(100));
const sha512 = createHash('sha512').update(bytes).digest('base64');
const server = createServer((request, response) => {
  const broken = request.url.startsWith('/broken/');
  if (request.url.split('?')[0].endsWith('/latest.yml')) {
    response.setHeader('Content-Type', 'application/yaml');
    response.end(
      JSON.stringify({
        version: '99.0.0',
        path: 'fixture.exe',
        sha512,
        files: [{ url: 'fixture.exe', size: bytes.length, sha512 }],
        releaseDate: new Date().toISOString(),
      }),
    );
  } else if (request.url.split('?')[0].endsWith('/fixture.exe')) {
    response.end(broken ? Buffer.from('MZCorruptFixture') : bytes);
  } else {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const app = await electron.launch(
  process.env.VIEWER_EXE
    ? { executablePath: process.env.VIEWER_EXE, args: ['--smoke-test'] }
    : { args: ['.', '--smoke-test'] },
);
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
try {
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.show();
    w.focus();
  });
  for (const broken of [false, true]) {
    const name = broken ? 'broken' : 'valid';
    const config = path.join(root, `${name}.yml`);
    await writeFile(
      config,
      JSON.stringify({
        provider: 'generic',
        url: `http://127.0.0.1:${port}/${name}/`,
        updaterCacheDirName: name,
      }),
    );
    const state = await app.evaluate(
      async ({ app }, { url, config, root }) => {
        const require = process.mainModule
          .require('node:module')
          .createRequire(app.getAppPath() + '/package.json');
        const { NsisUpdater } = require('electron-updater');
        const { AppUpdater } = require(app.getAppPath() + '/electron/updates/app-updater.cjs');
        const updater = new NsisUpdater({ provider: 'generic', url });
        updater.updateConfigPath = config;
        updater.forceDevUpdateConfig = true;
        updater.disableDifferentialDownload = true;
        Object.defineProperty(updater.app, 'baseCachePath', { get: () => root });
        let failure = '';
        updater.on('error', (error) => {
          failure = error.message;
        });
        const controller = new AppUpdater({ updater, version: app.getVersion() });
        return { ...(await controller.check()), failure };
      },
      { url: `http://127.0.0.1:${port}/${name}/`, config, root },
    );
    assert.equal(state.status, broken ? 'error' : 'ready', state.failure);
  }
  await app.evaluate(({ app, ipcMain, BrowserWindow, dialog }) => {
    const w = BrowserWindow.getAllWindows()[0];
    const state = {
      status: 'ready',
      currentVersion: app.getVersion(),
      version: '99.0.0',
      percent: 100,
    };
    ipcMain.removeHandler('update-state');
    ipcMain.removeHandler('update-restart');
    ipcMain.handle('update-state', () => ({ ok: true, value: state }));
    ipcMain.handle('update-restart', () => {
      w.close();
      return { ok: true };
    });
    globalThis.unsavedPromptCount = 0;
    dialog.showMessageBoxSync = () => {
      globalThis.unsavedPromptCount++;
      return 0;
    };
    w.webContents.send('update-state', state);
  });
  await page.locator('#file').setInputFiles(path.resolve('artifacts/validation/build-wall.sav'));
  await page.waitForFunction(() => !document.querySelector('#open').disabled);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.waitForFunction(() => document.querySelector('#structures').textContent === '0');
  await page.locator('#updatesOpen').click();
  await page.locator('#updatesRestart').click();
  await page.waitForTimeout(300);
  assert.equal(await app.evaluate(() => globalThis.unsavedPromptCount), 1);
  assert.equal(await page.locator('#updatesPanel').isVisible(), true);
  await page.screenshot({ path: 'artifacts/validation/updater-ready.png' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: real updater download, SHA-512 rejection, update UI and unsaved-edit restart guard; no installer executed.',
  );
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
  server.close();
}

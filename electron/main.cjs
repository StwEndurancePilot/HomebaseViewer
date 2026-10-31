const { app, BrowserWindow, session, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const { existsSync } = require('node:fs');
const { AppUpdater } = require('./updates/app-updater.cjs');
let mainWindow;
let updates;
const { HomebaseRequests } = require('./homebase-requests.cjs');
const homebaseRequests = new HomebaseRequests(() => {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send('homebase-open-available');
});
homebaseRequests.enqueue(process.argv);
const smokeTest = process.argv.includes('--smoke-test');
app.setPath('userData', path.join(app.getPath('appData'), 'Homebase Viewer'));
if (smokeTest)
  app.setPath('userData', path.join(app.getPath('temp'), `homebase-handoff-${process.pid}`));
const ownsInstance = smokeTest || app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
app.on('second-instance', (_event, argv) => {
  homebaseRequests.enqueue(argv);
  if (!smokeTest && mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});
const { EpicAccount, decodeCloudBytes } = require('./accounts/epic-account.cjs');
const { PennyAccounts } = require('./accounts/penny-accounts.cjs');
app.setName('Homebase Designer');
if (ownsInstance)
  app.whenReady().then(() => {
    app.setAppUserModelId('io.homebaseviewer.desktop');
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !/^(file|devtools|data|blob):/.test(details.url) });
    });
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) =>
      callback(permission === 'pointerLock'),
    );
    const window = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 960,
      minHeight: 640,
      show: !process.argv.includes('--smoke-test'),
      title: 'Homebase Designer',
      backgroundColor: '#121418',
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'preload.cjs'),
      },
    });
    mainWindow = window;
    let nativeUpdater = null;
    if (
      app.isPackaged &&
      process.platform === 'win32' &&
      !smokeTest &&
      existsSync(path.join(process.resourcesPath, 'app-update.yml'))
    ) {
      const { NsisUpdater } = require('electron-updater');
      nativeUpdater = new NsisUpdater();
    }
    updates = new AppUpdater({
      updater: nativeUpdater,
      version: app.getVersion(),
      onState: (state) => {
        if (!window.isDestroyed()) window.webContents.send('update-state', state);
      },
      onRestart: () => window.close(),
      onInstallError: () => app.quit(),
    });
    window.on('query-session-end', () => updates.endSession());
    window.on('session-end', () => updates.endSession());
    const updateTimer = setTimeout(() => {
      void updates.check();
    }, 3000);
    updateTimer.unref();
    window.on('closed', () => clearTimeout(updateTimer));
    const account = new EpicAccount({
      openExternal: (url) => shell.openExternal(url),
      onState: (state) => {
        if (!window.isDestroyed()) window.webContents.send('epic-state', state);
      },
    });
    const penny = new PennyAccounts({ appData: app.getPath('appData') });
    const handle = (name, action) =>
      ipcMain.handle(name, async (event, ...args) => {
        if (
          event.sender !== window.webContents ||
          event.senderFrame !== window.webContents.mainFrame
        )
          throw new Error('Unsupported account caller.');
        try {
          return { ok: true, value: await action(...args) };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'Account request failed.',
          };
        }
      });
    handle('update-state', () => updates.getState());
    handle('homebase-open-next', () => homebaseRequests.take());
    handle('update-check', () => updates.check());
    handle('update-restart', () => updates.requestRestart());
    handle('epic-state', () => account.getState());
    handle('penny-list', () => penny.scan());
    handle('penny-login', (id) => {
      if (typeof id !== 'string' || id.length > 64) throw new Error('Choose a Penny account.');
      void account.loginPenny(() => penny.credentials(id));
      return null;
    });
    handle('epic-login', () => {
      void account.login();
      return null;
    });
    handle('epic-cancel', () => {
      account.cancel();
      return null;
    });
    handle('epic-reopen', () => account.reopen());
    handle('epic-list', () => account.list());
    handle('epic-download', (zone) => {
      if (typeof zone !== 'string' || !/^pve_0[1-4]$/.test(zone))
        throw new Error('Choose a homebase zone.');
      return account.download(zone);
    });
    handle('cloud-decode', (bytes) => {
      if (!(bytes instanceof Uint8Array) || bytes.length > 128 * 1024 * 1024)
        throw new Error('Invalid cloud archive.');
      return decodeCloudBytes(bytes);
    });
    window.on('closed', () => {
      account.cancel();
      penny.clear();
    });
    session.defaultSession.on('will-download', (_event, item, contents) => {
      const url = item.getURL();
      item.once('done', (_event, state) => {
        if (!contents.isDestroyed())
          contents.send('download-finished', { url, completed: state === 'completed' });
      });
    });
    window.webContents.on('will-prevent-unload', (event) => {
      const choice = dialog.showMessageBoxSync(window, {
        type: 'question',
        buttons: ['Keep editing', 'Close without saving'],
        defaultId: 0,
        cancelId: 0,
        title: 'Unsaved blueprint edits',
        message: 'Some homebases have edits that have not been saved.',
        detail: 'Use Save draft or Export .sav to keep your work.',
      });
      if (choice === 1) event.preventDefault();
      else updates.cancelRestart();
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.loadFile(path.join(__dirname, '../dist/index.html'));
  });
app.on('window-all-closed', () => {
  if (!updates?.installOnExit()) app.quit();
});

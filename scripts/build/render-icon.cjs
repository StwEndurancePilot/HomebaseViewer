const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

app
  .whenReady()
  .then(async () => {
    const window = new BrowserWindow({
      width: 256,
      height: 256,
      useContentSize: true,
      frame: false,
      show: false,
      transparent: true,
      webPreferences: { offscreen: true, sandbox: true },
    });
    const svg = readFileSync(path.resolve('assets/branding/icon.svg'), 'utf8');
    await window.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          `<style>html,body{margin:0;width:256px;height:256px;background:transparent}svg{width:256px;height:256px}</style>${svg}`,
        ),
    );
    const image = await window.webContents.capturePage();
    writeFileSync(
      path.resolve('assets/branding/icon.png'),
      image.resize({ width: 256, height: 256 }).toPNG(),
    );
    window.destroy();
    app.quit();
  })
  .catch(() => app.exit(1));

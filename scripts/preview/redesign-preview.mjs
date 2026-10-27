import { _electron as electron } from 'playwright';
import path from 'node:path';
const app = await electron.launch({ args: ['.', '--smoke-test'] });
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.show();
  w.focus();
});
try {
  await page.waitForFunction(() =>
    document.querySelector('#welcomeModel')?.getAttribute('src')?.startsWith('data:'),
  );
  await page.screenshot({ path: 'artifacts/validation/redesign-welcome.png' });
  await page
    .locator('#file')
    .setInputFiles(path.resolve('artifacts/validation/editor-source-a.json'));
  await page.waitForFunction(() => !document.querySelector('#open').disabled);
  await page.locator('#buildTool').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#pieceImage').complete &&
      document.querySelector('#pieceImage').naturalWidth > 0,
  );
  await page.screenshot({ path: 'artifacts/validation/redesign-build.png' });
  console.log({
    errors,
    theme: await page.locator('html').getAttribute('data-theme'),
    text: await page.locator('#placementFeedback').textContent(),
  });
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

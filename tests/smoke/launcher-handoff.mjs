import { _electron as electron } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const file = process.env.HOMEBASE_HANDOFF_FILE;
if (!file) throw Error('Set HOMEBASE_HANDOFF_FILE to a test .sav');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({
  ...(process.env.VIEWER_EXE ? { executablePath: process.env.VIEWER_EXE } : {}),
  args: [...(process.env.VIEWER_EXE ? [] : ['.']), '--smoke-test', '--open-homebase', file],
  env,
});
try {
  const page = await application.firstWindow();
  assert.equal(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((w) => w.isVisible()),
    ),
    false,
  );
  await page.waitForFunction(
    () => document.querySelectorAll('#documents button').length === 1,
    {},
    { timeout: 60000 },
  );
  assert.equal(
    await page.locator('#documents button').first().getAttribute('title'),
    path.basename(file),
  );
  await application.evaluate(
    ({ app }, file) =>
      app.emit('second-instance', {}, [app.getPath('exe'), '--open-homebase', file]),
    file,
  );
  await page.waitForFunction(
    () => document.querySelectorAll('#documents button').length === 2,
    {},
    { timeout: 60000 },
  );
  assert.equal(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((w) => w.isVisible()),
    ),
    false,
  );
  await mkdir('artifacts/validation', { recursive: true });
  await page.screenshot({ path: 'artifacts/validation/launcher-handoff.png' });
  console.log(
    'PASS: packaged viewer loads startup .sav and adds a second-instance document without replacing the first.',
  );
} finally {
  await application.close();
}

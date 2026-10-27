import { _electron as electron } from 'playwright';
import { readdir, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const directory = path.join(process.env.LOCALAPPDATA, 'FortniteGame/Saved/SaveGames');
const files = (await readdir(directory)).filter(
  (f) => f.startsWith('STW_Homebase_') && f.endsWith('.sav') && !/Library|Recovery/.test(f),
);
const wanted = [
  files.find((f) => f.includes('NightcoreASAP') && f.includes('Stonewood')),
  files.find((f) => f.includes('NotStwAccount') && f.includes('Twine')) ??
    files.find((f) => f.includes('Twine')),
].filter(Boolean);
await mkdir('artifacts/validation', { recursive: true });
const app = await electron.launch(
  process.env.VIEWER_EXE
    ? { executablePath: process.env.VIEWER_EXE, args: ['--smoke-test'] }
    : { args: ['.', '--smoke-test'] },
);
const page = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => {
  const window = BrowserWindow.getAllWindows()[0];
  window.show();
  window.focus();
});
const errors = [],
  external = [],
  results = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('request', (r) => {
  if (/^https?:/.test(r.url())) external.push(r.url());
});
try {
  await page.waitForSelector('#choose');
  await page.screenshot({ path: 'artifacts/validation/welcome.png' });
  for (const [index, file] of wanted.entries()) {
    await page.locator('#file').setInputFiles(path.join(directory, file));
    await page.waitForFunction(
      () => !document.querySelector('#open').disabled,
      {},
      { timeout: 120000 },
    );
    assert.equal(
      await page.locator('#filename').textContent(),
      file,
      await page.locator('#status').textContent(),
    );
    assert.match(await page.locator('#fidelity').textContent(), /primary meshes matched/);
    await page.screenshot({ path: `artifacts/validation/base-${index}.png` });
    await app.evaluate(
      ({ session }, destination) => {
        globalThis.reportDownload = null;
        session.defaultSession.once('will-download', (_event, item) => {
          item.setSavePath(destination);
          item.once('done', (_e, state) => {
            globalThis.reportDownload = state;
          });
        });
      },
      path.resolve(`artifacts/validation/fidelity-${index}.json`),
    );
    await page.locator('#report').click();
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = await app.evaluate(() => globalThis.reportDownload);
      if (state) {
        assert.equal(state, 'completed');
        break;
      }
      if (attempt === 99) throw new Error('Fidelity report did not save');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const report = JSON.parse(
      await readFile(`artifacts/validation/fidelity-${index}.json`, 'utf8'),
    );
    assert.equal(report.rendered + report.unmatched.length + report.unavailable, report.records);
    assert.ok(
      report.rendered >
        Number((await page.locator('#structures').textContent()).replaceAll(',', '')),
    );
    assert.ok(
      report.trapPivotCorrections.records > 0,
      'The trap-pivot correction must be active in the actual packaged renderer',
    );
    assert.deepEqual(report.trapPivotCorrections.localUnrealOffset, [0, 256, 0]);
    results.push({
      file,
      structures: await page.locator('#structures').textContent(),
      traps: await page.locator('#traps').textContent(),
      correctedTrapPivots: report.trapPivotCorrections.records,
      fidelity: await page.locator('#fidelity').textContent(),
    });
    await page.locator('#showScenery').check();
    await page.locator('#showScenery').uncheck();
    await page.locator('#fly').click();
    assert.match(await page.locator('#hint').textContent(), /WASD fly/);
    await page.locator('#respawn').click();
    await page.waitForFunction(
      () => document.querySelector('#hint').textContent.includes('WASD move'),
      {},
      { timeout: 60000 },
    );
    await page.screenshot({ path: `artifacts/validation/walk-${index}.png` });
    await page.locator('#reset').click();
    assert.equal(await page.locator('#orbit').getAttribute('class'), 'active');
  }
  await page.locator('#file').setInputFiles({
    name: 'invalid.sav',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('not a save'),
  });
  await page.waitForFunction(() => !document.querySelector('#open').disabled);
  assert.notEqual(await page.locator('#status').textContent(), '');
  assert.equal(await page.locator('#welcome').isVisible(), false);
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  await writeFile(
    'artifacts/validation/smoke.json',
    JSON.stringify({ results, errors, external, passed: true }, null, 2),
  );
  console.log(JSON.stringify({ results, errors, external, passed: true }, null, 2));
} catch (error) {
  console.error({ errors, external, status: await page.locator('#status').textContent() });
  throw error;
} finally {
  await app.close();
}

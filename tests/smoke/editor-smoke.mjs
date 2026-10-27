import { build } from 'esbuild';
import { _electron as electron } from 'playwright';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
await build({
  entryPoints: ['tests/fixtures/editor-fixtures.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'artifacts/validation/editor-fixtures.mjs',
});
await import(pathToFileURL(path.resolve('artifacts/validation/editor-fixtures.mjs')).href);
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
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.show();
  w.focus();
});
const click = async (id) => page.locator('#' + id).click();
const settle = async () => page.waitForFunction(() => !document.querySelector('#open').disabled);
const count = async (id, n) =>
  assert.equal(
    (await page.locator('#' + id).textContent()).replaceAll(',', ''),
    String(n),
    await page.locator('#status').textContent(),
  );
const open = async (file) => {
  await page.locator('#file').setInputFiles(file);
  await settle();
};
async function download(id, name) {
  const destination = path.resolve('artifacts/validation/' + name);
  await app.evaluate(({ session }, destination) => {
    globalThis.editorDownload = null;
    session.defaultSession.once('will-download', (_event, item) => {
      item.setSavePath(destination);
      item.once('done', (_e, state) => {
        globalThis.editorDownload = state;
      });
    });
  }, destination);
  await click(id);
  for (let i = 0; i < 100; i++) {
    const state = await app.evaluate(() => globalThis.editorDownload);
    if (state) {
      assert.equal(state, 'completed');
      return destination;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Download did not complete: ' + (await page.locator('#status').textContent()));
}
try {
  await open(path.resolve('artifacts/validation/editor-source-a.json'));
  await count('structures', 1);
  await count('traps', 1);
  await click('boxSelect');
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + 5, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + box.height - 60, { steps: 8 });
  await page.mouse.up();
  await count('selectedCount', 2);
  await click('boxSelect');
  await click('copy');
  await click('newBlueprint');
  await settle();
  await click('paste');
  await click('commitPaste');
  await settle();
  await count('structures', 1);
  await count('traps', 1);
  await open(path.resolve('artifacts/validation/editor-source-b.json'));
  await click('selectAll');
  await click('copy');
  await page.locator('#documents button').filter({ hasText: 'Custom-blueprint-1' }).click();
  await settle();
  await click('paste');
  await page.locator('#pasteX').fill('1536');
  await page.locator('#pasteYaw').selectOption('90');
  await click('previewPaste');
  assert.equal(
    await page.locator('#commitPaste').isEnabled(),
    true,
    await page.locator('#status').textContent(),
  );
  await page.screenshot({ path: 'artifacts/validation/editor-group-preview.png' });
  await click('commitPaste');
  await settle();
  await count('structures', 3);
  await count('traps', 3);
  await click('undo');
  await settle();
  await count('structures', 1);
  await click('redo');
  await settle();
  await count('structures', 3);
  await page.locator('#documents button').filter({ hasText: 'editor-source-a.json' }).click();
  await settle();
  await click('selectAll');
  await click('structuresOnly');
  await count('selectedCount', 1);
  await page.locator('#pieceKind').selectOption('wall');
  await page.locator('#direction').selectOption('north');
  await click('previewPlace');
  assert.equal(
    await page.locator('#place').isEnabled(),
    true,
    await page.locator('#status').textContent(),
  );
  await click('place');
  await settle();
  await count('structures', 2);
  await page.locator('#pieceKind').selectOption('trap');
  const options = await page
    .locator('#trapTemplate option')
    .evaluateAll((nodes) => nodes.map((o) => ({ value: o.value, text: o.textContent })));
  await page
    .locator('#trapTemplate')
    .selectOption(options.find((o) => o.text.includes('tid_floor_launcher')).value);
  await click('previewPlace');
  assert.equal(await page.locator('#place').isEnabled(), false);
  assert.match(await page.locator('#status').textContent(), /floor support/);
  await page
    .locator('#trapTemplate')
    .selectOption(options.find((o) => o.text.includes('tid_wall_launcher')).value);
  await click('previewPlace');
  await click('place');
  await settle();
  await count('traps', 2);
  await page.locator('#offsetPanel summary').click();
  await page.locator('#offsetX').fill('256');
  await page.locator('#offsetPitch').fill('12.5');
  await click('applyOffsets');
  await settle();
  const inspection = JSON.parse(await page.locator('#selection').textContent());
  assert.equal(inspection.actorTransform.translation[0], 256);
  assert.ok(Math.hypot(...inspection.actorTransform.rotation.slice(0, 2)) > 0.05);
  await page.screenshot({ path: 'artifacts/validation/editor-offset.png' });
  await click('selectAll');
  await click('copy');
  await page.locator('#documents button').filter({ hasText: 'Custom-blueprint-1' }).click();
  await settle();
  await click('paste');
  await page.locator('#pasteX').fill('-1536');
  await page.locator('#pasteYaw').selectOption('0');
  await click('previewPaste');
  await click('commitPaste');
  await settle();
  await count('structures', 5);
  await count('traps', 5);
  const draft = await download('saveDraft', 'editor-ui-draft.json');
  const draftData = JSON.parse(await readFile(draft, 'utf8'));
  assert.equal(draftData.placements.length, 10);
  const saveDir = path.join(process.env.LOCALAPPDATA, 'FortniteGame/Saved/SaveGames');
  const files = await readdir(saveDir);
  await open(
    path.join(
      saveDir,
      files.find(
        (f) =>
          f.startsWith('STW_Homebase_NightcoreASAP') &&
          f.includes('Stonewood') &&
          f.endsWith('.sav'),
      ),
    ),
  );
  await page.locator('#documents button').filter({ hasText: 'Custom-blueprint-1' }).click();
  await settle();
  const exported = await download('exportSave', 'editor-ui-export.sav');
  await open(exported);
  await count('structures', 5);
  await count('traps', 5);
  await click('selectAll');
  await click('delete');
  await settle();
  await count('structures', 0);
  await count('traps', 0);
  await click('undo');
  await settle();
  await count('structures', 5);
  await count('traps', 5);
  await click('reset');
  await page.screenshot({ path: 'artifacts/validation/editor-merged.png' });
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  const report = {
    passed: true,
    checks: [
      'rectangle selection',
      'multi-file group merge',
      'rigid 90 degree rotation',
      'placement preview',
      'incompatible support rejection',
      'world trap offsets',
      'undo/redo',
      'cascade delete',
      'draft save',
      'native save export and reimport',
    ],
    pieces: 10,
    errors,
    externalRequests: requests,
  };
  await writeFile('artifacts/validation/editor-smoke.json', JSON.stringify(report, null, 2));
  console.log(report);
} catch (e) {
  console.error(await page.locator('#status').textContent());
  await page.screenshot({ path: 'artifacts/validation/editor-failure.png' });
  throw e;
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

import { build } from 'esbuild';
import { _electron as electron } from 'playwright';
import { Quaternion } from 'three';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

await mkdir('artifacts/validation', { recursive: true });
await build({
  stdin: {
    contents: `
      import { buildingRecord, placeTrap, ZERO_OFFSETS } from './src/core/editor';
      import { trapTemplate, trapCatalog } from './src/core/trap-catalog';
      const floor = buildingRecord('floor', 2, 3, {
        translation: [0, 256, 384], rotation: [0, 0, 0, 1], scale: [1, 1, 1]
      });
      const gas = trapCatalog.find(t => t.id === 'ceiling_gas');
      const trap = placeTrap(trapTemplate(gas.id, gas.variants[0].rarity), floor, 0, 0, ZERO_OFFSETS, 'standard');
      export default {
        schemaVersion: 6, format: 'stw-homebase-capture', worldPath: 'Editor-test-scene',
        coordinateUnit: 'unreal-world-units', rotationEncoding: 'quaternion-xyzw',
        completeHomebase: false, placements: [floor, trap]
      };
    `,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'artifacts/validation/offset-lifecycle-fixture.mjs',
});
const fixture = (
  await import(
    pathToFileURL(path.resolve('artifacts/validation/offset-lifecycle-fixture.mjs')).href
  )
).default;
const input = path.resolve('artifacts/validation/offset-lifecycle-input.json');
await writeFile(input, JSON.stringify(fixture));
const app = await electron.launch({ args: ['.', '--smoke-test'] });
const page = await app.firstWindow();
page.setDefaultTimeout(15000);
await page.waitForLoadState('load');
await app.evaluate(({ BrowserWindow }) => {
  const window = BrowserWindow.getAllWindows()[0];
  window.show();
  window.focus();
});
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const click = (id) => page.locator('#' + id).click();
const settle = () => page.waitForFunction(() => !document.querySelector('#open').disabled);
const inspector = async () => JSON.parse(await page.locator('#selection').textContent());
const selectionPanel = async () => {
  if (!(await page.locator('#selectionPanel').isVisible())) await click('selectionChip');
};
const offsetsPanel = async () => {
  if (!(await page.locator('#offsetPanel').isVisible())) {
    await selectionPanel();
    await click('selectionOffsets');
  }
};
const sameRotation = (a, b) => assert.ok(new Quaternion(...a).angleTo(new Quaternion(...b)) < 1e-6);
try {
  await app.evaluate(({ shell }) => {
    shell.openExternal = async () => {};
  });
  await page.locator('#discordDialog').waitFor({ state: 'visible' });
  await click('discordJoin');
  await page.locator('#discordDialog').waitFor({ state: 'hidden' });
  await page.locator('#file').setInputFiles(input);
  await page.waitForFunction(
    () => document.querySelector('#filename').textContent === 'offset-lifecycle-input.json',
  );
  await settle();
  await page.locator('#viewport>canvas').focus();
  await page.keyboard.press('Control+a');
  await selectionPanel();
  await click('trapsOnly');
  await offsetsPanel();
  await page.locator('#offsetX').fill('64');
  await page.locator('#offsetYaw').fill('5');
  await click('applyOffsets');
  await settle();
  const original = await inspector();
  assert.equal(original.actorTransform.translation[0], 64);
  await click('copy');
  await click('paste');
  await page.locator('#pasteX').fill('1024');
  await page.locator('#pasteY').fill('256');
  await page.locator('#pasteZ').fill('384');
  await click('pasteRotate90');
  await click('commitPaste');
  await settle();
  await selectionPanel();
  await click('trapsOnly');
  const pasted = await inspector();
  assert.notEqual(pasted.actorPath, original.actorPath);
  await offsetsPanel();
  assert.equal(await page.locator('#offsetX').inputValue(), '0');
  assert.equal(await page.locator('#offsetYaw').inputValue(), '0');
  await page.locator('#offsetX').fill('1');
  await click('applyOffsets');
  await settle();
  sameRotation((await inspector()).actorTransform.rotation, pasted.actorTransform.rotation);
  await click('flipSelected');
  await settle();
  const flipped = await inspector();
  assert.ok(
    new Quaternion(...flipped.actorTransform.rotation).angleTo(
      new Quaternion(...pasted.actorTransform.rotation),
    ) > 3,
  );
  await page.locator('#offsetX').fill('1');
  await click('applyOffsets');
  await settle();
  sameRotation((await inspector()).actorTransform.rotation, flipped.actorTransform.rotation);
  await click('undo');
  await settle();
  sameRotation((await inspector()).actorTransform.rotation, flipped.actorTransform.rotation);
  await click('redo');
  await settle();
  sameRotation((await inspector()).actorTransform.rotation, flipped.actorTransform.rotation);
  const draft = path.resolve('artifacts/validation/offset-lifecycle-draft.json');
  await app.evaluate(({ session }, destination) => {
    globalThis.offsetDraftDownload = null;
    session.defaultSession.once('will-download', (_event, item) => {
      item.setSavePath(destination);
      item.once('done', (_event, state) => (globalThis.offsetDraftDownload = state));
    });
  }, draft);
  await page.locator('#saveDraft').evaluate((button) => button.click());
  for (let i = 0; i < 100 && !(await app.evaluate(() => globalThis.offsetDraftDownload)); i++)
    await page.waitForTimeout(100);
  assert.equal(await app.evaluate(() => globalThis.offsetDraftDownload), 'completed');
  const saved = JSON.parse(await readFile(draft, 'utf8'));
  const support = saved.placements.find((p) => p.actorPath === pasted.attachment.supportActorPath);
  const mod = (n, d) => ((n % d) + d) % d;
  assert.deepEqual(
    support.transform.translation.map((n, i) => mod(n, i === 2 ? 384 : 512)),
    [256, 0, 0],
  );
  await page.screenshot({ path: 'artifacts/validation/offset-lifecycle.png' });
  assert.deepEqual(errors, []);
  console.log(
    'Desktop offset lifecycle passed: offset, rotated paste, support grid, move, flip, undo/redo and draft save.',
  );
} catch (error) {
  console.error(error, await page.locator('#status').textContent());
  throw error;
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

import { completeDiscordOnboarding } from './discord-onboarding.mjs';
import { _electron as electron } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

await mkdir('artifacts/validation', { recursive: true });
const builds = JSON.parse(await readFile('src/data/build-edits.json', 'utf8'));
const traps = JSON.parse(await readFile('src/data/trap-catalog.json', 'utf8'));
const definition = builds.definitions.find(
  (d) => d.shape === 'WindowC' && d.material === 2 && d.tier === 3,
);
const pose = { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
const fixture = path.resolve('artifacts/validation/trap-selector-window.json');
await writeFile(
  fixture,
  JSON.stringify({
    format: 'stw-homebase-capture',
    schemaVersion: 6,
    coordinateUnit: 'unreal-world-units',
    rotationEncoding: 'quaternion-xyzw',
    worldPath: 'custom',
    completeHomebase: false,
    placements: [
      {
        actorPath: 'window',
        kind: 'structure',
        captureRole: 'placement',
        classPath: definition.classPath,
        meshPath: definition.meshPath,
        transform: pose,
        meshTransform: pose,
        resourceType: 2,
        level: 2,
        attachmentType: 9,
      },
    ],
  }),
);
const app = await electron.launch(
  process.env.VIEWER_EXE
    ? { executablePath: process.env.VIEWER_EXE, args: ['--smoke-test'] }
    : { args: ['.', '--smoke-test'] },
);
const page = await app.firstWindow(),
  errors = [];
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false),
);
await completeDiscordOnboarding(app, page);
page.on('pageerror', (error) => errors.push(String(error)));
const settle = () => page.waitForFunction(() => !document.querySelector('#open').disabled);
const click = (id) => page.locator('#' + id).click();
async function save(name) {
  const destination = path.resolve('artifacts/validation/' + name);
  await app.evaluate(({ session }, destination) => {
    globalThis.selectorDownload = null;
    session.defaultSession.once('will-download', (_event, item) => {
      item.setSavePath(destination);
      item.once('done', (_event, state) => (globalThis.selectorDownload = state));
    });
  }, destination);
  await click('saveDraft');
  for (let i = 0; i < 100 && !(await app.evaluate(() => globalThis.selectorDownload)); i++)
    await page.waitForTimeout(100);
  assert.equal(await app.evaluate(() => globalThis.selectorDownload), 'completed');
  return JSON.parse(await readFile(destination, 'utf8'));
}
try {
  await page.locator('#file').setInputFiles(fixture);
  await settle();
  await page.keyboard.press('Control+a');
  await click('buildTool');
  await click('chooseTrap');
  assert.equal(await page.locator('#trapTemplate option').count(), traps.traps.length);
  await page.locator('#trapSearch').fill('no such trap');
  assert.equal(await page.locator('#trapTemplate').isDisabled(), true);
  assert.equal(await page.locator('#trapRarity').isDisabled(), true);
  await page.locator('#trapSearch').fill('Wall Darts');
  assert.equal(await page.locator('#trapTemplate').inputValue(), 'wall_darts');
  await page.locator('#trapRarity').selectOption('Epic');
  await page.locator('#trapSearch').fill('');
  assert.equal(await page.locator('#trapRarity').inputValue(), 'Epic');
  await page.locator('#trapTemplate').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/validation/trap-selector.png' });
  await page.getByText('Exact placement', { exact: true }).click();
  await click('previewPlace');
  assert.equal(
    await page.locator('#place').isDisabled(),
    false,
    await page.locator('#status').textContent(),
  );
  await page.screenshot({ path: 'artifacts/validation/trap-selector-window-preview.png' });
  await click('place');
  await settle();
  const saved = await save('trap-selector-placed.json');
  const placed = saved.placements.find((p) => p.kind === 'trap');
  const expected = traps.traps
    .find((t) => t.id === 'wall_darts')
    .variants.find((v) => v.rarity === 'Epic');
  assert.equal(placed.itemPath, expected.itemPath);
  assert.equal(placed.trapPerks, 'perks1;' + expected.perks.join(';'));
  assert.equal(placed.attachment.supportActorPath, 'window');
  await click('selectTool');
  await click('selectionChip');
  await page.getByRole('button', { name: 'Edit perks', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Wall Darts perks' });
  assert.equal(await dialog.locator('select').count(), expected.perks.length);
  await dialog.getByLabel('Remove slot 1', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply perks', exact: true }).click();
  await settle();
  const edited = await save('trap-selector-edited.json');
  assert.equal(
    edited.placements.find((p) => p.kind === 'trap').trapPerks,
    'perks1;' + expected.perks.slice(1).join(';'),
  );
  await click('buildTool');
  assert.equal(await page.locator('#trapTemplate').inputValue(), 'wall_darts');
  assert.equal(await page.locator('#trapRarity').inputValue(), 'Epic');
  assert.deepEqual(errors, []);
  console.log('Trap picker, rarity, window placement, export and later perk editing passed.');
} finally {
  await app.close();
}

import { _electron as electron } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const catalog = JSON.parse(await readFile('src/data/trap-perk-options.json', 'utf8'));
const damage = catalog.groups.find((g) => g.label === 'Damage').paths.at(-1);
const reload = catalog.groups.find((g) => g.label === 'Reload speed').paths.at(-1);
const source = JSON.parse(await readFile('artifacts/validation/requirements-fixture.json', 'utf8'));
const sample = source.placements.find((p) => p.actorPath === 'trap-c');
sample.trapPerks = `perks1;${damage};${damage}`;
sample.trapPerksStatus = 'captured';
for (const [id, perks, x] of [
  ['air-matching', sample.trapPerks, 3072],
  ['air-other', `perks1;${reload}`, 4096],
]) {
  const copy = structuredClone(sample);
  copy.actorPath = id;
  copy.trapPerks = perks;
  copy.transform.translation[0] = x;
  copy.meshTransform.translation[0] = x;
  source.placements.push(copy);
}
source.capturedCount = source.placements.length;
await mkdir('artifacts/validation', { recursive: true });
const fixture = path.resolve('artifacts/validation/trap-perk-bundles-fixture.json');
await writeFile(fixture, JSON.stringify(source));
const app = await electron.launch(
  process.env.VIEWER_EXE
    ? { executablePath: process.env.VIEWER_EXE, args: ['--smoke-test'] }
    : { args: ['.', '--smoke-test'] },
);
const page = await app.firstWindow(),
  errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false);
  BrowserWindow.getAllWindows()[0].setSize(960, 640);
});
const click = (id) => page.locator('#' + id).click();
const settle = () => page.waitForFunction(() => !document.querySelector('#open').disabled);
const air = page.locator('[data-trap-type="trap_floor_ward_antiair"]');
const variants = air.locator('.requirement-variant');
const edit = () =>
  variants.first().getByRole('button', { name: 'Edit bundle perks', exact: true }).click();
const dialog = page.getByRole('dialog', { name: 'Edit Anti-Air Trap perks' });
async function saveDraft() {
  const destination = path.resolve('artifacts/validation/trap-perk-bundles-draft.json');
  await app.evaluate(({ session }, destination) => {
    globalThis.bundleDownload = null;
    session.defaultSession.once('will-download', (_e, item) => {
      item.setSavePath(destination);
      item.once('done', (_e, state) => (globalThis.bundleDownload = state));
    });
  }, destination);
  await click('saveDraft');
  for (let i = 0; i < 100 && !(await app.evaluate(() => globalThis.bundleDownload)); i++)
    await page.waitForTimeout(100);
  assert.equal(await app.evaluate(() => globalThis.bundleDownload), 'completed');
  return JSON.parse(await readFile(destination, 'utf8'));
}
try {
  await page.locator('#file').setInputFiles(fixture);
  await settle();
  await click('requirementsButton');
  await air.locator('summary').click();
  assert.equal(await variants.count(), 2);
  assert.equal(await air.locator('.trap-quantity').textContent(), '3');
  await air.getByRole('checkbox').uncheck();
  for (const cancel of ['Cancel', 'Escape']) {
    await edit();
    assert.match(await dialog.textContent(), /Editing all 2 traps/);
    await dialog.getByLabel('Perk slot 1', { exact: true }).selectOption(reload);
    if (cancel === 'Cancel')
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    else await page.keyboard.press('Escape');
    assert.equal(await page.locator('#undo').evaluate((e) => e.disabled), true);
  }
  assert.deepEqual(await saveDraft(), source);
  await edit();
  await dialog.getByRole('button', { name: 'Apply to 2 traps', exact: true }).click();
  assert.equal(await page.locator('#undo').evaluate((e) => e.disabled), true);
  await edit();
  for (const slot of [1, 2])
    await dialog.getByLabel(`Perk slot ${slot}`, { exact: true }).selectOption(reload);
  assert.equal(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth), true);
  await page.screenshot({ path: 'artifacts/validation/trap-perk-bundles-editor.png' });
  await dialog.getByRole('button', { name: 'Apply to 2 traps', exact: true }).click();
  await settle();
  assert.equal(await variants.count(), 2);
  assert.equal(await air.getByRole('checkbox').isChecked(), false);
  const expected = structuredClone(source);
  for (const row of expected.placements.filter((p) =>
    ['trap-c', 'air-matching'].includes(p.actorPath),
  )) {
    row.trapPerks = `perks1;${reload};${reload}`;
    row.trapPerksSource = 'editor';
  }
  assert.deepEqual(await saveDraft(), expected, 'Only the chosen bundle should change');
  await click('undo');
  await settle();
  assert.deepEqual(await saveDraft(), source, 'One undo must restore the whole bundle');
  assert.equal(await page.locator('#undo').evaluate((e) => e.disabled), true);
  await click('redo');
  await settle();
  assert.deepEqual(await saveDraft(), expected);
  await edit();
  await dialog.getByRole('button', { name: 'Remove slot 2', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply to 2 traps', exact: true }).click();
  await settle();
  assert.equal(await variants.count(), 1, 'Equivalent setups should merge');
  assert.equal(await air.locator('.trap-quantity').textContent(), '3');
  const merged = await saveDraft();
  assert.deepEqual(
    merged.placements.find((p) => p.actorPath === 'air-other'),
    source.placements.find((p) => p.actorPath === 'air-other'),
  );
  await click('undo');
  await settle();
  assert.equal(await variants.count(), 2);
  assert.deepEqual(await saveDraft(), expected);
  assert.equal(
    await page.locator('#requirementsPanel').evaluate((e) => e.scrollWidth <= e.clientWidth),
    true,
  );
  await page.screenshot({ path: 'artifacts/validation/trap-perk-bundles-requirements.png' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: bundle scope, cancel/Escape, no-op, hidden bundles, save persistence, atomic undo/redo, merge and compact layout.',
  );
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

import { _electron as electron } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const catalog = JSON.parse(await readFile('src/data/trap-perk-options.json', 'utf8'));
const damage = catalog.groups.find((g) => g.label === 'Damage').paths.at(-1);
const reload = catalog.groups.find((g) => g.label === 'Reload speed').paths.at(-1);
const unknown = '/Game/UnknownPerk.UnknownPerk';
const source = JSON.parse(await readFile('artifacts/validation/requirements-fixture.json', 'utf8'));
source.placements.find((p) => p.actorPath === 'trap-a').trapPerks = `perks1;${unknown};${damage}`;
const fixture = path.resolve('artifacts/validation/trap-perks-fixture.json');
await writeFile(fixture, JSON.stringify(source));
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
page.on('pageerror', (e) => errors.push(String(e)));
const click = (id) => page.locator('#' + id).click();
const settle = () => page.waitForFunction(() => !document.querySelector('#open').disabled);
const dialog = page.getByRole('dialog', { name: 'Edit Floor Freeze perks' });
const edit = () => page.getByRole('button', { name: 'Edit perks', exact: true }).click();
const perks = page.locator('#selectedTrapPerks .perk-description');
const labels = () => perks.allTextContents();

try {
  await page.locator('#file').setInputFiles(fixture);
  await settle();
  await click('requirementsButton');
  const freeze = page.locator('[data-trap-type="trap_floor_freeze"]');
  await freeze.locator('summary').click();
  await freeze
    .locator('.requirement-variant')
    .first()
    .getByRole('button', { name: 'Locate' })
    .click();
  assert.deepEqual(await labels(), ['UnknownPerk', '+30% Damage']);
  await edit();
  assert.equal(await dialog.getByLabel('Perk slot 1', { exact: true }).inputValue(), unknown);
  await dialog.getByLabel('Perk slot 2', { exact: true }).selectOption(reload);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(await labels(), ['UnknownPerk', '+30% Damage']);
  assert.equal(await page.locator('#undo').evaluate((e) => e.disabled), true);
  await edit();
  await dialog.getByLabel('Perk slot 2', { exact: true }).selectOption(reload);
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(), 0);
  assert.equal(await page.locator('#undo').evaluate((e) => e.disabled), true);

  await edit();
  await dialog.getByRole('button', { name: 'Apply perks', exact: true }).click();
  assert.equal(await page.locator('#undo').evaluate((e) => e.disabled), true);
  await edit();
  await dialog.getByRole('button', { name: 'Add perk', exact: true }).click();
  assert.equal(
    await dialog.getByRole('button', { name: 'Apply perks', exact: true }).isDisabled(),
    true,
  );
  await dialog.getByLabel('Perk slot 3', { exact: true }).selectOption(reload);
  await dialog.getByLabel('Move slot 3 up', { exact: true }).click();
  assert.equal(await dialog.getByLabel('Perk slot 2', { exact: true }).inputValue(), reload);
  await dialog.getByLabel('Perk slot 3', { exact: true }).selectOption(reload);
  await page.keyboard.press('Delete');
  assert.equal(await dialog.locator('select').count(), 3);
  assert.equal(await page.locator('#selectedCount').textContent(), '1');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 640));
  assert.equal(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth), true);
  await page.screenshot({ path: 'artifacts/validation/trap-perk-editor.png' });
  await dialog.getByRole('button', { name: 'Apply perks', exact: true }).click();
  await settle();
  assert.deepEqual(await labels(), ['UnknownPerk', '+42% Reload Speed', '+42% Reload Speed']);
  assert.match(
    await freeze.locator('.requirement-variant').first().textContent(),
    /42% Reload Speed/,
  );
  await click('undo');
  await settle();
  assert.deepEqual(await labels(), ['UnknownPerk', '+30% Damage']);
  await click('redo');
  await settle();
  assert.deepEqual(await labels(), ['UnknownPerk', '+42% Reload Speed', '+42% Reload Speed']);

  const dest = path.resolve('artifacts/validation/trap-perks-draft.json');
  await app.evaluate(({ session }, dest) => {
    globalThis.perkDownload = null;
    session.defaultSession.once('will-download', (_e, item) => {
      item.setSavePath(dest);
      item.once('done', (_e, state) => (globalThis.perkDownload = state));
    });
  }, dest);
  await click('saveDraft');
  for (let i = 0; i < 100 && !(await app.evaluate(() => globalThis.perkDownload)); i++)
    await page.waitForTimeout(100);
  assert.equal(await app.evaluate(() => globalThis.perkDownload), 'completed');
  const saved = JSON.parse(await readFile(dest, 'utf8'));
  assert.equal(
    saved.placements.find((p) => p.actorPath === 'trap-a').trapPerks,
    `perks1;${unknown};${reload};${reload}`,
  );
  assert.deepEqual(
    saved.placements.filter((p) => p.actorPath !== 'trap-a'),
    source.placements.filter((p) => p.actorPath !== 'trap-a'),
  );

  await edit();
  while (await dialog.locator('select').count())
    await dialog.getByLabel('Remove slot 1', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply perks', exact: true }).click();
  await settle();
  assert.match(await page.locator('#selectedTrapPerks').textContent(), /No perks/);
  await click('undo');
  await settle();
  assert.deepEqual(await labels(), ['UnknownPerk', '+42% Reload Speed', '+42% Reload Speed']);

  await edit();
  for (let i = 4; i <= 6; i++) {
    await dialog.getByRole('button', { name: 'Add perk', exact: true }).click();
    await dialog.getByLabel(`Perk slot ${i}`, { exact: true }).selectOption(damage);
  }
  assert.equal(
    await dialog.getByRole('button', { name: 'Add perk', exact: true }).isDisabled(),
    true,
  );
  await dialog.evaluate((e) => (e.scrollTop = 0));
  const applyBox = await dialog
    .getByRole('button', { name: 'Apply perks', exact: true })
    .boundingBox();
  const bounds = await dialog.boundingBox();
  assert.ok(applyBox.y >= bounds.y && applyBox.y + applyBox.height <= bounds.y + bounds.height);
  await page.screenshot({ path: 'artifacts/validation/trap-perk-editor-six-slots.png' });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  while ((await page.locator('html').getAttribute('data-theme')) !== 'dark') await click('theme');
  await edit();
  await page.screenshot({ path: 'artifacts/validation/trap-perk-editor-dark.png' });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: perk choices, unknown paths, cancel/Escape, slot ordering, duplicate rolls, undo/redo, draft persistence, clearing and compact layout.',
  );
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

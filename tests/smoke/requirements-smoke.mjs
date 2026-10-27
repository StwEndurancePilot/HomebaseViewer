import { _electron as electron } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const app = await electron.launch(
  process.env.VIEWER_EXE
    ? { executablePath: process.env.VIEWER_EXE, args: ['--smoke-test'] }
    : { args: ['.', '--smoke-test'] },
);
const page = await app.firstWindow(),
  errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const external = [];
page.on('request', (r) => {
  if (/^https?:/.test(r.url())) external.push(r.url());
});
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.show();
  w.focus();
});
const click = async (id) => page.locator('#' + id).click();
const settle = async () => {
  await page.waitForFunction(() => !document.querySelector('#open').disabled);
  await page.waitForTimeout(150);
};
const freeze = page.locator('[data-trap-type="trap_floor_freeze"]'),
  anti = page.locator('[data-trap-type="trap_floor_ward_antiair"]');
async function saveDraft() {
  const dest = path.resolve('artifacts/validation/requirements-filtered-draft.json');
  await app.evaluate(({ session }, dest) => {
    globalThis.requirementsDownload = null;
    session.defaultSession.once('will-download', (_e, item) => {
      item.setSavePath(dest);
      item.once('done', (_e, state) => (globalThis.requirementsDownload = state));
    });
  }, dest);
  await click('saveDraft');
  for (let i = 0; i < 100 && !(await app.evaluate(() => globalThis.requirementsDownload)); i++)
    await page.waitForTimeout(100);
  assert.equal(await app.evaluate(() => globalThis.requirementsDownload), 'completed');
  return JSON.parse(await readFile(dest, 'utf8'));
}
try {
  const source = JSON.parse(
    await readFile('artifacts/validation/requirements-fixture.json', 'utf8'),
  );
  await page
    .locator('#file')
    .setInputFiles(path.resolve('artifacts/validation/requirements-fixture.json'));
  await settle();
  await click('requirementsButton');
  for (const [id, value] of [
    ['requiredWood', '10'],
    ['requiredStone', '30'],
    ['requiredMetal', '60'],
  ])
    assert.equal(await page.locator('#' + id).textContent(), value);
  assert.equal(await freeze.locator('.trap-quantity').textContent(), '2');
  assert.equal(await anti.locator('.trap-quantity').textContent(), '1');
  await freeze.locator('summary').click();
  assert.equal(await freeze.locator('.requirement-variant').count(), 2);
  assert.equal(
    await freeze.locator('.requirement-variant').first().locator('.perk-list li').count(),
    2,
  );
  assert.match(await freeze.textContent(), /42% Durability/);
  await freeze
    .locator('.requirement-variant')
    .first()
    .getByRole('button', { name: 'Locate' })
    .click();
  assert.equal(await page.locator('#requirementsPanel').isVisible(), true);
  assert.equal(await page.locator('#selectionPanel').isVisible(), true);
  assert.equal(await page.locator('#selectedCount').textContent(), '1');
  assert.equal(await page.locator('#selectedTrapPerks .perk-list li').count(), 2);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#requirementsPanel img,#selectedTrapPerks img')].every(
      (i) => i.complete && i.naturalWidth > 0,
    ),
  );
  assert.equal(await page.locator('#requirementsPanel .material-totals img').count(), 3);
  assert.equal(await page.locator('#requiredTrapList .trap-art img').count(), 2);
  assert.equal(
    await page.locator('#selectedTrapPerks [data-rarity="legendary"] .perk-rank-bars .lit').count(),
    10,
  );
  const viewportWidth = await page.evaluate(() => innerWidth);
  assert.equal(
    (await page.locator('#requirementsPanel').boundingBox()).width,
    viewportWidth <= 1100 ? 350 : 410,
    `Requirements panel must fit the ${viewportWidth}px viewport`,
  );
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'artifacts/validation/requirements-perks.png' });
  while ((await page.locator('html').getAttribute('data-theme')) !== 'light') await click('theme');
  await page.screenshot({ path: 'artifacts/validation/requirements-light.png' });
  while ((await page.locator('html').getAttribute('data-theme')) !== 'dark') await click('theme');
  await page.keyboard.press('Delete');
  await settle();
  assert.equal(await freeze.locator('.trap-quantity').textContent(), '1');
  await click('undo');
  await settle();
  assert.equal(await freeze.locator('.trap-quantity').textContent(), '2');
  await anti.getByRole('button', { name: 'Show only Anti-Air Trap' }).click();
  assert.equal(await page.locator('#requirementsVisible').textContent(), '1 / 3 traps shown');
  assert.equal(await freeze.locator('input').isChecked(), false);
  await page.keyboard.press('Control+a');
  assert.equal(await page.locator('#selectedCount').textContent(), '4');
  assert.deepEqual(
    await saveDraft(),
    source,
    'View filters must not change or remove saved placements',
  );
  await click('requirementsShowAll');
  await page.keyboard.press('Control+a');
  assert.equal(await page.locator('#selectedCount').textContent(), '6');
  await anti.locator('summary').click();
  assert.match(await anti.textContent(), /Perks not recorded/);
  await anti.locator('.requirement-variant').getByRole('button', { name: 'Locate' }).click();
  assert.match(await page.locator('#selectedTrapPerks').textContent(), /Perks not recorded/);
  await page.getByRole('button', { name: 'Close selection', exact: true }).click();
  await page.getByRole('button', { name: 'Close requirements', exact: true }).click();
  const box = await page.locator('#viewport>canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  assert.equal(await page.locator('#selectedTrapPerks').isVisible(), true);
  assert.match(await page.locator('#selectedTrapPerks').textContent(), /Anti-Air/);
  await page.getByRole('button', { name: 'Close selection', exact: true }).click();
  await click('requirementsButton');
  await page.locator('#requirementsSearch').fill('135%');
  assert.equal(await freeze.isVisible(), true);
  assert.equal(await anti.isVisible(), false);
  await page.locator('#requirementsSearch').fill('');
  await anti.getByRole('button', { name: 'Show only Anti-Air Trap' }).click();
  await writeFile('artifacts/validation/requirements-second.json', JSON.stringify(source));
  await page
    .locator('#file')
    .setInputFiles(path.resolve('artifacts/validation/requirements-second.json'));
  await settle();
  await click('requirementsButton');
  assert.equal(await page.locator('#requirementsVisible').textContent(), '3 / 3 traps shown');
  await page.locator('#documents button').first().click();
  await settle();
  await click('requirementsButton');
  assert.equal(await page.locator('#requirementsVisible').textContent(), '1 / 3 traps shown');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 640));
  await page.waitForTimeout(200);
  assert.equal((await page.locator('#requirementsPanel').boundingBox()).width, 350);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'artifacts/validation/requirements-compact.png' });
  const gallery = structuredClone(source),
    sample = gallery.placements.find((p) => p.actorPath === 'trap-a');
  sample.trapPerks =
    'perks1;' +
    [
      'AID_Att_MaxDurability_Trap_T01',
      'AID_Att_MaxDurability_Trap_T02',
      'AID_Att_MaxDurability_Trap_T03',
      'AID_Att_MaxDurability_Trap_T04',
      'AID_Att_MaxDurability_Trap_T05',
      'AID_Att_BuildingHeal_T05',
    ]
      .map((id) => `/Game/${id}.${id}`)
      .join(';');
  await writeFile('artifacts/validation/requirements-rarity-gallery.json', JSON.stringify(gallery));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1040));
  await page
    .locator('#file')
    .setInputFiles(path.resolve('artifacts/validation/requirements-rarity-gallery.json'));
  await settle();
  await click('requirementsButton');
  await freeze.locator('summary').click();
  await freeze
    .locator('.requirement-variant')
    .first()
    .getByRole('button', { name: 'Locate' })
    .click();
  for (const [i, rarity] of ['common', 'uncommon', 'rare', 'epic', 'legendary'].entries())
    assert.equal(
      await page
        .locator(`#selectedTrapPerks li[data-rarity="${rarity}"]`)
        .first()
        .locator('.lit')
        .count(),
      i + 1,
    );
  assert.equal(await page.locator('#selectedTrapPerks li').count(), 6);
  assert.equal(
    await page.locator('#requirementsPanel').evaluate((e) => e.scrollWidth <= e.clientWidth),
    true,
  );
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'artifacts/validation/requirements-rarities.png' });
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: material/trap artwork, five perk ranks, themes, totals, locate, filters, undo, unchanged draft, document filters and compact window.',
  );
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

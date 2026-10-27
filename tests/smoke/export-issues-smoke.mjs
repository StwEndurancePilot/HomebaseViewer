import { _electron as electron } from 'playwright';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const source = JSON.parse(await readFile('artifacts/validation/editor-source-a.json', 'utf8'));
const healthy = structuredClone(source.placements[0]);
healthy.actorPath = '/IssueTest/healthy';
const bad = Array.from({ length: 5 }, (_, i) => {
  const p = structuredClone(healthy);
  p.actorPath = `/IssueTest/bad-${i}`;
  p.transform.translation = [2048 * (i + 1), 0, 0];
  p.meshTransform = structuredClone(p.transform);
  if (i === 4) p.meshPath = '';
  else p.classPath = '';
  return p;
});
const trap = structuredClone(source.placements[1]);
trap.actorPath = '/IssueTest/trap';
trap.itemPath = '';
trap.attachmentType = 300;
trap.attachment.status = 'unresolved';
trap.attachment.supportActorPath = '/not-captured';
trap.transform.translation = [12288, 0, 0];
trap.meshTransform = structuredClone(trap.transform);
const fixture = {
  schemaVersion: 6,
  format: source.format,
  coordinateUnit: source.coordinateUnit,
  rotationEncoding: source.rotationEncoding,
  worldPath: 'Issue-test',
  completeHomebase: false,
  placements: [healthy, ...bad, trap],
};
await writeFile('artifacts/validation/export-issues-fixture.json', JSON.stringify(fixture));
const app = await electron.launch(
  process.env.VIEWER_EXE
    ? { executablePath: process.env.VIEWER_EXE, args: ['--smoke-test'] }
    : { args: ['.', '--smoke-test'] },
);
const page = await app.firstWindow(),
  errors = [],
  requests = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('request', (r) => {
  if (/^https?:/.test(r.url())) requests.push(r.url());
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
const list = page.locator('#exportIssueList button');
async function centralRedPixels() {
  const rect = await page.locator('#viewport>canvas').boundingBox();
  const screenshot = await page.screenshot({
    clip: {
      x: rect.x + rect.width / 2 - 180,
      y: rect.y + rect.height / 2 - 130,
      width: 360,
      height: 260,
    },
  });
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + base64;
    await image.decode();
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let red = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i] > 170 && data[i + 1] < 105 && data[i + 2] < 120) red++;
    return red;
  }, screenshot.toString('base64'));
}
try {
  await page
    .locator('#file')
    .setInputFiles(path.resolve('artifacts/validation/export-issues-fixture.json'));
  await settle();
  await click('exportSave');
  assert.equal(await page.locator('#exportIssuesPanel').isVisible(), true);
  assert.equal(await list.count(), 6);
  assert.match(await page.locator('#exportIssueSummary').textContent(), /9 issues across 6 pieces/);
  assert.match(await page.locator('#exportGeneralIssues').textContent(), /native save container/);
  assert.equal(await page.locator('#status').textContent(), '');
  const paths = await list.evaluateAll((buttons) => buttons.map((b) => b.dataset.actorPath));
  assert.deepEqual(paths, [...bad.map((p) => p.actorPath), trap.actorPath]);
  for (const id of paths) {
    await list
      .filter({
        hasText:
          id === trap.actorPath
            ? 'Floor Launcher'
            : `#${fixture.placements.findIndex((p) => p.actorPath === id) + 1}`,
      })
      .click();
    await page.waitForTimeout(180);
    const selected = JSON.parse(await page.locator('#selection').textContent());
    assert.equal(selected.actorPath, id);
    assert.equal(await page.locator('#selectedCount').textContent(), '1');
    assert.equal(await page.locator('#exportIssueList button[aria-pressed=true]').count(), 1);
    assert.ok((await centralRedPixels()) > 5, `No framed red highlight for ${id}`);
  }
  assert.match(
    await list.last().textContent(),
    /Missing trap item definition.*attachment type.*support/s,
  );
  await list.first().click();
  await page.screenshot({ path: 'artifacts/validation/export-issues-red.png' });
  await page.locator('[aria-label="Close export issues"]').click();
  assert.equal(await page.locator('#exportIssuesPanel').isVisible(), false);
  assert.ok((await centralRedPixels()) > 5);
  await click('sceneToggle');
  await page.locator('#showBuilds').uncheck();
  await page.locator('#showMissing').uncheck();
  await click('exportIssuesButton');
  await list.first().click();
  assert.equal(await page.locator('#showBuilds').isChecked(), true);
  assert.equal(await page.locator('#showMissing').isChecked(), true);
  await page.keyboard.press('Delete');
  await settle();
  assert.equal(await list.count(), 5);
  await click('undo');
  await settle();
  assert.equal(await list.count(), 6);
  await click('issueSelectionTools');
  assert.equal(await page.locator('#selectionPanel').isVisible(), true);
  await click('exportIssuesButton');
  await page
    .locator('#file')
    .setInputFiles(path.resolve('artifacts/validation/editor-source-a.json'));
  await settle();
  assert.equal(await page.locator('#exportIssuesButton').isVisible(), false);
  await page.locator('#documents button').filter({ hasText: 'export-issues-fixture' }).click();
  await settle();
  assert.equal(await page.locator('#exportIssuesButton').isVisible(), true);
  await click('exportIssuesButton');
  assert.equal(await list.count(), 6);
  await click('clearExportIssues');
  assert.equal(await page.locator('#exportIssuesButton').isVisible(), false);
  assert.equal(await page.locator('#exportIssuesPanel').isVisible(), false);
  await click('exportSave');
  assert.equal(await list.count(), 6);
  const dir = path.join(process.env.LOCALAPPDATA, 'FortniteGame/Saved/SaveGames'),
    file = (await readdir(dir)).find(
      (f) =>
        f.startsWith('STW_Homebase_NightcoreASAP') && f.includes('Stonewood') && f.endsWith('.sav'),
    );
  await page.locator('#file').setInputFiles(path.join(dir, file));
  await settle();
  await page.locator('#documents button').filter({ hasText: 'export-issues-fixture' }).click();
  await settle();
  await click('exportIssuesButton');
  assert.equal(await page.locator('#exportGeneralIssues').isVisible(), false);
  assert.match(await page.locator('#exportIssueSummary').textContent(), /8 issues across 6 pieces/);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 640));
  await page.waitForTimeout(200);
  await list.last().focus();
  await page.keyboard.press('Enter');
  assert.equal(
    JSON.parse(await page.locator('#selection').textContent()).actorPath,
    trap.actorPath,
  );
  await page.screenshot({ path: 'artifacts/validation/export-issues-compact.png' });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 920));
  await page.waitForTimeout(100);
  for (let i = 6; i > 0; i--) {
    await list.first().click();
    await page.keyboard.press('Delete');
    await settle();
    assert.equal(await list.count(), i - 1);
  }
  assert.match(await page.locator('#exportIssueSummary').textContent(), /All checks passed/);
  await click('undo');
  await settle();
  assert.equal(await list.count(), 1);
  await click('redo');
  await settle();
  assert.equal(await list.count(), 0);
  const dest = path.resolve('artifacts/validation/issues-fixed-export.sav');
  await app.evaluate(({ session }, dest) => {
    globalThis.issueDownload = null;
    session.defaultSession.once('will-download', (_e, item) => {
      item.setSavePath(dest);
      item.once('done', (_e, state) => (globalThis.issueDownload = state));
    });
  }, dest);
  await click('retryExport');
  for (let i = 0; i < 100 && !(await app.evaluate(() => globalThis.issueDownload)); i++)
    await page.waitForTimeout(100);
  assert.equal(await app.evaluate(() => globalThis.issueDownload), 'completed');
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  const result = {
    passed: true,
    checks: [
      'all errors listed without truncation',
      'red scene highlights and camera framing for every affected actor',
      'auto-selection',
      'multiple reasons per piece',
      'missing-mesh markers',
      'non-spatial error panel',
      'persistent review after close and tab switch',
      'hidden category reveal',
      'live revalidation after delete undo redo',
      'clear highlights',
      'selection tools',
      'keyboard navigation',
      '960x640 layout',
      'successful retry and native export',
    ],
    errors,
    requests,
  };
  await writeFile('artifacts/validation/export-issues-smoke.json', JSON.stringify(result, null, 2));
  console.log(result);
} catch (e) {
  console.error(String(e), await page.locator('#status').textContent(), errors);
  await page.screenshot({ path: 'artifacts/validation/export-issues-failure.png' });
  throw e;
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

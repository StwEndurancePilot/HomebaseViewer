import { _electron as electron } from 'playwright';
import { completeDiscordOnboarding } from './discord-onboarding.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import path from 'node:path';

await mkdir('artifacts/validation', { recursive: true });
const app = await electron.launch(
  process.env.VIEWER_EXE
    ? { executablePath: process.env.VIEWER_EXE, args: ['--smoke-test'] }
    : { args: ['.', '--smoke-test'] },
);
const page = await app.firstWindow();
page.setDefaultTimeout(60000);
const errors = [],
  requests = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('request', (request) => {
  if (/^https?:/.test(request.url())) requests.push(request.url());
});
const file = (name, source) => ({
  name,
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(source)),
});
const floor = {
  kind: 'structure',
  assetPath: '/Game/Building/ActorBlueprints/Player/Wood/L1/PBWA_W1_Floor.PBWA_W1_Floor_C',
  position: { x: 0, y: 0, z: 0 },
  rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
};
const settle = () => page.waitForFunction(() => !document.querySelector('#open').disabled);
const entries = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('homebase-drafts', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('drafts').objectStore('drafts').getAll();
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );

try {
  await completeDiscordOnboarding(app, page);
  assert.equal(
    await page.evaluate(async () => (await window.homebaseAccount.state()).status),
    'signed-out',
  );
  await page
    .locator('#file')
    .setInputFiles(file('listing.json', [{ filename: 'home_r0_a1.sav', length: 500 }]));
  await page.waitForFunction(() =>
    document.querySelector('#status').textContent.includes('file list'),
  );
  assert.equal(await page.locator('.document-name').count(), 0);

  await page
    .locator('#file')
    .setInputFiles(file('TwinePeaks-placements.json', { placements: [floor] }));
  await page.waitForFunction(() => document.querySelector('#structures').textContent === '1');
  await settle();
  assert.equal(await page.locator('#accountPanel').isVisible(), false);
  assert.equal((await entries())[0].data.placements.length, 1);

  await page
    .locator('#file')
    .setInputFiles([file('unknown-zone.json', [floor]), file('another-zone.json', [floor])]);
  await page.locator('#localCloudImport').waitFor({ state: 'visible' });
  await page.locator('#localCloudZone').selectOption('pve_03');
  await page.locator('#importLocalCloud').click();
  await page.waitForFunction(
    () => document.querySelector('#localCloudName').textContent === 'another-zone.json',
  );
  assert.equal(await page.locator('#localCloudZone').inputValue(), '');
  await page.locator('#importLocalCloud').click();
  await page.waitForFunction(() =>
    document.querySelector('#accountError').textContent.includes('Choose the zone'),
  );
  await page.locator('#localCloudZone').selectOption('pve_01');
  await page.locator('#importLocalCloud').click();
  await page.locator('#accountPanel').waitFor({ state: 'hidden' });
  await settle();
  assert.equal(
    (await entries()).find((d) => d.name === 'unknown-zone_Menu.sav').data.cloudImport.zoneId,
    'pve_03',
  );

  const raw = await readFile('artifacts/validation/cloud-raw.sav');
  await page.locator('#file').setInputFiles({
    name: 'TwinePeaks-api.bin',
    mimeType: 'application/octet-stream',
    buffer: gzipSync(raw),
  });
  await page.waitForFunction(() => document.querySelectorAll('.document-name').length === 4);
  await settle();
  const binary = (await entries()).find((d) => d.name === 'TwinePeaks-api.bin');
  assert.equal(binary.data.placements.length, 2);
  assert.equal(binary.data.placements[1].attachment.status, 'resolved');
  assert.ok(binary.data.placements[1].trapPerks.startsWith('perks1;'));
  await page.locator('#exportSave').click();
  await page.locator('#exportNameDialog').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');

  let actual = null;
  if (process.argv[2]) {
    const source = JSON.parse(await readFile(process.argv[2], 'utf8'));
    await page.locator('#file').setInputFiles(path.resolve(process.argv[2]));
    await page.waitForFunction(() => document.querySelectorAll('.document-name').length === 5);
    await settle();
    const imported = (await entries()).find((d) => d.name === path.basename(process.argv[2]));
    assert.equal(imported.data.placements.length, source.placements.length);
    source.placements.forEach((row, i) => {
      assert.deepEqual(imported.data.placements[i].transform, {
        translation: [row.position.x, row.position.y, row.position.z],
        rotation: [
          row.rotationQuaternion.x,
          row.rotationQuaternion.y,
          row.rotationQuaternion.z,
          row.rotationQuaternion.w,
        ],
        scale: [row.scale.x, row.scale.y, row.scale.z],
      });
    });
    actual = {
      placements: imported.data.placements.length,
      mappedMeshes: imported.data.placements.filter((p) => p.meshPath).length,
      fidelity: await page.locator('#fidelity').textContent(),
    };
    await page.screenshot({ path: 'artifacts/validation/local-api-import.png' });
  }
  assert.equal(
    await page.evaluate(async () => (await window.homebaseAccount.state()).status),
    'signed-out',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  const result = { passed: true, actual, errors, requests };
  await writeFile(
    'artifacts/validation/local-api-import-smoke.json',
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  );
  await app.close();
}

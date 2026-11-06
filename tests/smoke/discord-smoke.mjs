import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const app = await electron.launch(
  process.env.VIEWER_EXE
    ? { executablePath: process.env.VIEWER_EXE, args: ['--smoke-test'] }
    : { args: ['.', '--smoke-test'] },
);
try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].show();
  });
  await app.evaluate(({ shell }) => {
    globalThis.discordUrls = [];
    shell.openExternal = async (url) => {
      globalThis.discordUrls.push(url);
      if (globalThis.discordUrls.length === 1) throw new Error('Browser unavailable');
    };
  });
  const dialog = page.locator('#discordDialog');
  await dialog.waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  assert.equal(await dialog.isVisible(), true);
  assert.equal(await page.locator('#discordClose').isVisible(), false);
  await page.locator('#discordJoin').click();
  await page.locator('#discordError').waitFor({ state: 'visible' });
  assert.equal(await dialog.isVisible(), true);
  assert.equal(
    await page.evaluate(async () => (await window.homebaseDiscord.state()).inviteOpened),
    false,
  );
  await mkdir('artifacts/validation/discord', { recursive: true });
  await page.screenshot({ path: 'artifacts/validation/discord/prompt.png' });
  await page.locator('#discordJoin').click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(
    await app.evaluate(({ app }) => {
      const { DiscordCommunity } = process.mainModule.require(
        app.getAppPath() + '/electron/discord-community.cjs',
      );
      return new DiscordCommunity(app.getPath('userData'), async () => {}).state.inviteOpened;
    }),
    true,
  );
  await page.reload();
  await page.waitForFunction(() => window.homebaseDiscord !== undefined);
  assert.equal(
    await page.evaluate(async () => (await window.homebaseDiscord.state()).inviteOpened),
    true,
  );
  assert.equal(await dialog.isVisible(), false);
  await page.locator('#discordOpen').click();
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await page.locator('#discordClose').isVisible(), true);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('#discordOpen').click();
  await page.locator('#discordJoin').click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(
    await app.evaluate(() => globalThis.discordUrls),
    Array(3).fill('https://discord.gg/j3U6mp7p6'),
  );
  console.log(
    'Discord smoke passed: required prompt, failure/retry, saved preference, reload and header entry.',
  );
} finally {
  await app.close();
}

import assert from 'node:assert/strict';

export async function completeDiscordOnboarding(app, page) {
  await app.evaluate(({ shell }) => {
    globalThis.originalOpenExternal = shell.openExternal;
    globalThis.onboardingInvites = [];
    shell.openExternal = async (url) => {
      globalThis.onboardingInvites.push(url);
    };
  });
  try {
    await page.locator('#discordDialog').waitFor({ state: 'visible' });
    await page.locator('#discordJoin').click();
    await page.locator('#discordDialog').waitFor({ state: 'hidden' });
    assert.deepEqual(await app.evaluate(() => globalThis.onboardingInvites), [
      'https://discord.gg/j3U6mp7p6',
    ]);
    assert.equal(
      await page.evaluate(async () => (await window.homebaseDiscord.state()).inviteOpened),
      true,
    );
  } finally {
    await app.evaluate(({ shell }) => {
      shell.openExternal = globalThis.originalOpenExternal;
      delete globalThis.originalOpenExternal;
      delete globalThis.onboardingInvites;
    });
  }
}

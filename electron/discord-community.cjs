const { readFileSync, writeFileSync, mkdirSync, renameSync } = require('node:fs');
const { join } = require('node:path');

const invite = 'https://discord.gg/j3U6mp7p6';
class DiscordCommunity {
  constructor(directory, openExternal) {
    this.directory = directory;
    this.file = join(directory, 'discord-community.json');
    this.openExternal = openExternal;
    this.opening = null;
    try {
      this.inviteOpened = JSON.parse(readFileSync(this.file, 'utf8')).inviteOpened === true;
    } catch {
      this.inviteOpened = false;
    }
  }
  get state() {
    return { inviteOpened: this.inviteOpened };
  }
  async open() {
    if (this.opening) return this.opening;
    this.opening = (async () => {
      try {
        await this.openExternal(invite);
      } catch {
        throw new Error('Discord could not be opened. Check your default browser and try again.');
      }
      try {
        mkdirSync(this.directory, { recursive: true });
        writeFileSync(this.file + '.tmp', JSON.stringify({ inviteOpened: true }));
        renameSync(this.file + '.tmp', this.file);
      } catch {
        throw new Error(
          'Discord opened, but your preference could not be saved. Try again to keep this prompt dismissed.',
        );
      }
      this.inviteOpened = true;
      return this.state;
    })();
    try {
      return await this.opening;
    } finally {
      this.opening = null;
    }
  }
}
module.exports = { DiscordCommunity };

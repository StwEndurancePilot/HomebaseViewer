class AppUpdater {
  constructor({
    updater,
    version,
    onState = () => {},
    onRestart = () => {},
    onInstallError = () => {},
  }) {
    this.updater = updater;
    this.onState = onState;
    this.onRestart = onRestart;
    this.onInstallError = onInstallError;
    this.pending = null;
    this.restartRequested = false;
    this.sessionEnding = false;
    this.state = { status: updater ? 'idle' : 'unavailable', currentVersion: version };
    if (!updater) return;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.disableWebInstaller = true;
    updater.logger = null;
    updater.on('checking-for-update', () => this.publish({ status: 'checking' }));
    updater.on('update-not-available', () => this.publish({ status: 'current' }));
    updater.on('update-available', (info) =>
      this.publish({ status: 'available', version: info.version }),
    );
    updater.on('download-progress', (progress) =>
      this.publish({
        status: 'downloading',
        percent: Math.max(0, Math.min(100, Math.round(Number(progress.percent) || 0))),
      }),
    );
    updater.on('update-downloaded', (info) =>
      this.publish({ status: 'ready', version: info.version, percent: 100 }),
    );
    updater.on('error', () => this.fail());
  }

  getState() {
    return { ...this.state };
  }

  publish(state) {
    this.state = { ...this.state, ...state };
    this.onState(this.getState());
  }

  fail() {
    const installing = this.state.status === 'installing';
    this.publish({ status: 'error' });
    if (installing) this.onInstallError();
  }

  async check() {
    if (!this.updater || this.sessionEnding || ['ready', 'installing'].includes(this.state.status))
      return this.getState();
    if (this.pending) return this.pending;
    this.pending = this.runCheck();
    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }

  async runCheck() {
    try {
      this.publish({ status: 'checking', percent: undefined, version: undefined });
      await this.updater.checkForUpdates();
      if (this.state.status === 'available') {
        this.publish({ status: 'downloading', percent: 0 });
        await this.updater.downloadUpdate();
      }
    } catch {
      this.fail();
    }
    return this.getState();
  }

  requestRestart() {
    if (this.state.status !== 'ready' || this.sessionEnding) return;
    this.restartRequested = true;
    this.onRestart();
  }

  cancelRestart() {
    this.restartRequested = false;
  }

  endSession() {
    this.sessionEnding = true;
  }

  installOnExit() {
    if (!this.updater || this.state.status !== 'ready' || this.sessionEnding) return false;
    this.publish({ status: 'installing' });
    try {
      this.updater.quitAndInstall(true, this.restartRequested);
      return this.state.status === 'installing';
    } catch {
      this.fail();
      return false;
    }
  }
}

module.exports = { AppUpdater };

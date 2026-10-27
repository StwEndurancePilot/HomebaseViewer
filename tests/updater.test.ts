import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const { AppUpdater } = createRequire(import.meta.url)('../electron/updates/app-updater.cjs');

function fixture({ available = true, broken = false } = {}) {
  const native = Object.assign(new EventEmitter(), {
    checkForUpdates: vi.fn(async () => {
      native.emit('checking-for-update');
      if (broken) throw new Error('offline');
      native.emit(available ? 'update-available' : 'update-not-available', { version: '1.7.1' });
    }),
    downloadUpdate: vi.fn(async () => {
      native.emit('download-progress', { percent: 42.3 });
      native.emit('update-downloaded', { version: '1.7.1' });
    }),
    quitAndInstall: vi.fn(),
  });
  const onState = vi.fn(),
    onRestart = vi.fn(),
    onInstallError = vi.fn();
  const controller = new AppUpdater({
    updater: native,
    version: '1.7.0',
    onState,
    onRestart,
    onInstallError,
  });
  return { native, controller, onState, onRestart, onInstallError };
}

describe('application updates', () => {
  it('downloads once and waits for a normal window close before installing', async () => {
    const { native, controller, onState } = fixture();
    await Promise.all([controller.check(), controller.check()]);
    expect(native.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(native.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(native.quitAndInstall).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe('ready');
    expect(onState.mock.calls.some(([s]) => s.status === 'downloading' && s.percent === 42)).toBe(
      true,
    );
    expect(controller.installOnExit()).toBe(true);
    expect(native.quitAndInstall).toHaveBeenCalledWith(true, false);
    expect(controller.installOnExit()).toBe(false);
  });

  it('routes restart through the window close guard and allows cancellation', async () => {
    const { native, controller, onRestart } = fixture();
    controller.requestRestart();
    expect(onRestart).not.toHaveBeenCalled();
    await controller.check();
    controller.requestRestart();
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(native.quitAndInstall).not.toHaveBeenCalled();
    controller.cancelRestart();
    controller.installOnExit();
    expect(native.quitAndInstall).toHaveBeenCalledWith(true, false);
  });

  it('relaunches only after an accepted restart and skips OS shutdown installs', async () => {
    const a = fixture();
    await a.controller.check();
    a.controller.requestRestart();
    a.controller.installOnExit();
    expect(a.native.quitAndInstall).toHaveBeenCalledWith(true, true);
    const b = fixture();
    await b.controller.check();
    b.controller.endSession();
    expect(b.controller.installOnExit()).toBe(false);
    expect(b.native.quitAndInstall).not.toHaveBeenCalled();
  });

  it('keeps offline and failed downloads usable and retryable', async () => {
    const { native, controller } = fixture({ broken: true });
    expect((await controller.check()).status).toBe('error');
    expect(controller.installOnExit()).toBe(false);
    native.checkForUpdates.mockImplementationOnce(async () => {
      native.emit('update-available', { version: '1.7.1' });
    });
    native.downloadUpdate.mockImplementationOnce(async () => {
      throw new Error('checksum mismatch');
    });
    expect((await controller.check()).status).toBe('error');
    expect(native.quitAndInstall).not.toHaveBeenCalled();
  });

  it('keeps development builds offline and ignores unchanged releases', async () => {
    const local = new AppUpdater({ updater: null, version: '1.7.0' });
    expect((await local.check()).status).toBe('unavailable');
    expect(local.installOnExit()).toBe(false);
    const { native, controller } = fixture({ available: false });
    expect((await controller.check()).status).toBe('current');
    expect(native.downloadUpdate).not.toHaveBeenCalled();
  });

  it('handles installer failures without leaving a windowless process', async () => {
    const { native, controller, onInstallError } = fixture();
    await controller.check();
    native.quitAndInstall.mockImplementation(() => {
      throw new Error('file missing');
    });
    expect(controller.installOnExit()).toBe(false);
    expect(onInstallError).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe('error');
  });
});

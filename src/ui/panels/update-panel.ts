import { el } from '../dom';
import type { UpdateState } from '../../types/update';

export function setupUpdatePanel() {
  const bridge = window.homebaseUpdates;
  const toggle = el('updatesOpen');
  const panel = el('updatesPanel');
  if (!bridge) {
    toggle.hidden = true;
    return;
  }
  const check = el<HTMLButtonElement>('updatesCheck');
  const restart = el<HTMLButtonElement>('updatesRestart');
  const progress = el<HTMLProgressElement>('updatesProgress');
  function render(state: UpdateState) {
    const busy = ['checking', 'available', 'downloading', 'installing'].includes(state.status);
    el('updatesVersion').textContent = `Homebase Designer ${state.currentVersion}`;
    el('updatesStatus').textContent = {
      unavailable: 'Updates are available in the installed version.',
      idle: 'Check for a newer version.',
      checking: 'Checking GitHub…',
      available: `Downloading ${state.version}…`,
      downloading: `Downloading ${state.version} · ${state.percent ?? 0}%`,
      current: 'You’re up to date.',
      ready: `${state.version} is ready. It installs when you close the viewer.`,
      installing: 'Installing update…',
      error: 'Couldn’t update. Try again later.',
    }[state.status];
    check.hidden = state.status === 'unavailable' || state.status === 'ready';
    check.disabled = busy;
    restart.hidden = state.status !== 'ready';
    progress.hidden = state.status !== 'downloading';
    progress.value = state.percent ?? 0;
    toggle.classList.toggle('update-ready', state.status === 'ready');
    toggle.title = state.status === 'ready' ? `Update ${state.version} ready` : 'App updates';
    toggle.setAttribute('aria-label', toggle.title);
  }
  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  };
  el('updatesClose').onclick = () => {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  };
  check.onclick = () => {
    void bridge
      .check()
      .then(render)
      .catch(() => {
        el('updatesStatus').textContent = 'Couldn’t update. Try again later.';
      });
  };
  restart.onclick = () => {
    void bridge.restart().catch(() => {
      el('updatesStatus').textContent = 'Couldn’t restart. Try again.';
    });
  };
  bridge.onState(render);
  void bridge
    .state()
    .then(render)
    .catch(() => {
      toggle.hidden = true;
    });
}

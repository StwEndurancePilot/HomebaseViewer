import { el } from '../dom';
import type { State, PennyAccount } from '../../types/account';
import { convertCloudSave } from '../../cloud/convert';
import type { Capture } from '../../core/save';
export function setupAccountPanel(importCapture: (data: Capture, name: string) => Promise<void>) {
  let state: State = { status: 'signed-out', zones: [] },
    busy = false,
    taskError = '';
  const pending: {
    bytes: Uint8Array;
    name: string;
  }[] = [];
  const panel = el('accountPanel');
  let pennyAccounts: PennyAccount[] = [],
    pennyMessage = '',
    scanning = false;
  const pennySection = document.createElement('section'),
    pennyTitle = document.createElement('h3'),
    pennyList = document.createElement('div'),
    pennyInfo = document.createElement('p'),
    pennyRefresh = document.createElement('button');
  pennySection.id = 'pennyAccounts';
  pennyTitle.textContent = 'Penny accounts';
  pennyInfo.className = 'muted';
  pennyRefresh.id = 'pennyRefresh';
  pennyRefresh.textContent = 'Refresh';
  pennyRefresh.setAttribute('aria-label', 'Refresh Penny accounts');
  pennyRefresh.className = 'penny-refresh';
  pennyList.id = 'pennyAccountList';
  pennySection.append(pennyTitle, pennyInfo, pennyList, pennyRefresh);
  el('epicLogin').closest('.button-row')!.before(pennySection);
  const show = () => {
    panel.hidden = false;
  };
  function report(error: unknown) {
    taskError = error instanceof Error ? error.message : String(error);
    render();
  }
  const run = (action: () => Promise<void>) => async () => {
    if (busy) return;
    busy = true;
    taskError = '';
    render();
    try {
      await action();
    } catch (e) {
      report(e);
    } finally {
      busy = false;
      render();
    }
  };
  function render() {
    const bridge = window.homebaseAccount,
      connected = state.status === 'signed-in',
      waiting = ['starting', 'waiting', 'signing-in'].includes(state.status);
    pennySection.hidden = connected || !bridge;
    pennyInfo.textContent = scanning ? 'Finding accounts…' : pennyMessage;
    pennyInfo.hidden = !pennyInfo.textContent;
    pennyRefresh.disabled = scanning || waiting || busy;
    pennyList.replaceChildren();
    for (const account of pennyAccounts) {
      const button = document.createElement('button');
      button.className = 'penny-account';
      button.textContent = account.displayName;
      button.dataset.pennyId = account.id;
      button.disabled = scanning || waiting || busy;
      button.onclick = async () => {
        taskError = '';
        try {
          await window.homebaseAccount!.loginPenny(account.id);
        } catch (e) {
          report(e);
        }
      };
      pennyList.append(button);
    }
    el('accountStatus').textContent = !bridge
      ? 'Open the desktop app to sign in.'
      : connected
        ? (state.displayName ?? 'Epic account')
        : state.status === 'waiting'
          ? 'Continue in your browser.'
          : state.status === 'starting'
            ? 'Opening Epic…'
            : state.status === 'signing-in'
              ? 'Signing in…'
              : '';
    el('accountStatus').hidden = !el('accountStatus').textContent;
    el('accountError').textContent = taskError || state.error || '';
    el('accountError').hidden = !el('accountError').textContent;
    el<HTMLButtonElement>('epicLogin').disabled = !bridge || connected || waiting || busy;
    el('epicLogin').hidden = connected;
    el('epicCancel').hidden = !connected && !waiting;
    el('epicCancel').textContent = connected ? 'Sign out' : 'Cancel sign-in';
    el('epicReopen').hidden = state.status !== 'waiting';
    el('epicCode').hidden = !state.userCode || state.status !== 'waiting';
    el('epicCode').textContent = state.userCode ? `Code: ${state.userCode}` : '';
    el('epicRefresh').hidden = !connected;
    el<HTMLButtonElement>('epicRefresh').disabled = busy || !!state.loading;
    el('cloudActivity').textContent = state.loading
      ? 'Loading homebases…'
      : busy
        ? 'Opening homebase…'
        : '';
    el('cloudActivity').hidden = !el('cloudActivity').textContent;
    const list = el('cloudZones');
    list.replaceChildren();
    if (connected)
      for (const zone of state.zones) {
        const row = document.createElement('div'),
          heading = document.createElement('strong'),
          detail = document.createElement('span'),
          button = document.createElement('button');
        row.className = 'cloud-zone';
        heading.textContent = zone.name;
        const date = zone.updated ? new Date(zone.updated) : null;
        detail.textContent = zone.available
          ? `Storm Shield ${zone.level}${date && !Number.isNaN(date.getTime()) ? ' · ' + date.toLocaleString() : ''}`
          : 'No backup';
        button.textContent = 'Download & open';
        button.disabled = !zone.available || busy || !!state.loading;
        button.dataset.zone = zone.id;
        button.onclick = run(async () => {
          const result = await window.homebaseAccount!.download(zone.id);
          if (state.status !== 'signed-in') throw new Error('Sign-in ended before import.');
          const capture = convertCloudSave(new Uint8Array(result.bytes), zone.id, zone.file);
          await importCapture(capture, `Epic_${zone.name.replaceAll(' ', '_')}.sav`);
          panel.hidden = true;
        });
        row.append(heading, detail, button);
        list.append(row);
      }
    el('localCloudImport').hidden = !pending.length;
    el('localCloudName').textContent = pending.length
      ? `${pending[0].name}${pending.length > 1 ? ` (+${pending.length - 1} queued)` : ''}`
      : '';
    el<HTMLButtonElement>('importLocalCloud').disabled = busy || !bridge;
  }
  el('accountOpen').onclick = el('welcomeAccount').onclick = show;
  el('accountClose').onclick = () => {
    panel.hidden = true;
  };
  el('epicLogin').onclick = async () => {
    taskError = '';
    try {
      await window.homebaseAccount?.login();
    } catch (e) {
      report(e);
    }
  };
  el('epicCancel').onclick = async () => {
    try {
      await window.homebaseAccount?.cancel();
    } catch (e) {
      report(e);
    }
  };
  el('epicReopen').onclick = async () => {
    try {
      await window.homebaseAccount?.reopen();
    } catch (e) {
      report(e);
    }
  };
  el('epicRefresh').onclick = run(async () => {
    await window.homebaseAccount!.list();
  });
  el('importLocalCloud').onclick = run(async () => {
    const file = pending[0],
      zone = el<HTMLSelectElement>('localCloudZone').value;
    if (!zone) throw new Error('Choose the zone this cloud backup belongs to.');
    const bytes = await window.homebaseAccount!.decode(file.bytes);
    await importCapture(
      convertCloudSave(new Uint8Array(bytes), zone, file.name),
      file.name.replace(/\.(sav|asv)$/i, '') + '_Menu.sav',
    );
    pending.shift();
    if (!pending.length) panel.hidden = true;
  });
  el('discardLocalCloud').onclick = () => {
    pending.shift();
    render();
  };
  async function scanPenny() {
    if (scanning || !window.homebaseAccount) return;
    scanning = true;
    render();
    try {
      const result = await window.homebaseAccount.pennyAccounts();
      pennyAccounts = result.accounts;
      pennyMessage = result.message;
    } catch (e) {
      pennyAccounts = [];
      pennyMessage = e instanceof Error ? e.message : 'Penny accounts could not be read.';
    } finally {
      scanning = false;
      render();
    }
  }
  pennyRefresh.onclick = () => void scanPenny();
  void scanPenny();
  window.homebaseAccount?.onState((next) => {
    state = next;
    render();
  });
  void window.homebaseAccount
    ?.state()
    .then((next) => {
      state = next;
      render();
    })
    .catch(report);
  render();
  return {
    queueLocal(bytes: Uint8Array, name: string) {
      pending.push({ bytes, name });
      el<HTMLSelectElement>('localCloudZone').value = '';
      show();
      render();
    },
  };
}

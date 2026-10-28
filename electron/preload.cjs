const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('homebaseDownloads', {
  onFinished(callback) {
    ipcRenderer.on('download-finished', (_event, result) => callback(result));
  },
});
const invoke = async (channel, ...args) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
contextBridge.exposeInMainWorld('homebaseLauncher', {
  next: () => invoke('homebase-open-next'),
  onAvailable(callback) {
    const listener = () => callback();
    ipcRenderer.on('homebase-open-available', listener);
    return () => ipcRenderer.removeListener('homebase-open-available', listener);
  },
});
contextBridge.exposeInMainWorld('homebaseAccount', {
  pennyAccounts: () => invoke('penny-list'),
  loginPenny: (id) => invoke('penny-login', id),
  state: () => invoke('epic-state'),
  login: () => invoke('epic-login'),
  cancel: () => invoke('epic-cancel'),
  reopen: () => invoke('epic-reopen'),
  list: () => invoke('epic-list'),
  download: (zone) => invoke('epic-download', zone),
  decode: (bytes) => invoke('cloud-decode', bytes),
  onState(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('epic-state', listener);
    return () => ipcRenderer.removeListener('epic-state', listener);
  },
});

contextBridge.exposeInMainWorld('homebaseUpdates', {
  state: () => invoke('update-state'),
  check: () => invoke('update-check'),
  restart: () => invoke('update-restart'),
  onState(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('update-state', listener);
    return () => ipcRenderer.removeListener('update-state', listener);
  },
});

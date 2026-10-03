'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

function subscribe(channel, cb) {
  if (typeof cb !== 'function') return () => {};
  const listener = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('ECDesktop', {
  isDesktop: true,

  platform: 'win32',

  app: {
    info: () => invoke('app:info')
  },

  downloads: {
    chooseFolder: () => invoke('downloads:choose-folder'),
    getFolder: () => invoke('downloads:get-folder'),
    clearFolder: () => invoke('downloads:clear-folder'),
    reveal: (path) => invoke('downloads:reveal', path),
    open: (path) => invoke('downloads:open', path),
    onProgress: (cb) => subscribe('download:progress', cb),
    onCompleted: (cb) => subscribe('download:completed', cb),
    onFailed: (cb) => subscribe('download:failed', cb)
  },

  cameras: {
    // En Electron no hay facingMode como en movil: hay que pasar un deviceId
    // concreto de la lista real de dispositivos.
    list: async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camara ${i + 1}` }));
    }
  },

  notify: (options) => invoke('notify:show', options),

  shell: {
    showItemInFolder: (target) => invoke('shell:showItemInFolder', target),
    openPath: (target) => invoke('shell:openPath', target),
    openExternal: (url) => invoke('shell:openExternal', url)
  }
});
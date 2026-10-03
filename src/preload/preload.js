'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('ECDesktop', {
  isDesktop: true,

  platform: 'win32',

  app: {
    info: () => invoke('app:info')
  },

  shell: {
    showItemInFolder: (target) => invoke('shell:showItemInFolder', target),
    openPath: (target) => invoke('shell:openPath', target),
    openExternal: (url) => invoke('shell:openExternal', url)
  }
});
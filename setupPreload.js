const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('setupApi', {
  validateServer: (url) => ipcRenderer.invoke('validate-server', url),
  saveConfig: (url) => ipcRenderer.invoke('save-server-config', url),
  closeSetup: (autoStart) => ipcRenderer.send('close-setup', { autoStart: Boolean(autoStart) }),
  openExternal: (url) => shell.openExternal(url)
});

const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('setupApi', {
  validateServer: (url) => ipcRenderer.invoke('validate-server', url),
  saveConfig: (url) => ipcRenderer.invoke('save-server-config', url),
  closeSetup: () => ipcRenderer.send('close-setup'),
  openExternal: (url) => shell.openExternal(url)
});

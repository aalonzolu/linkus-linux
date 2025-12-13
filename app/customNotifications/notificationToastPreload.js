const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notificationToast', {
  onClick: () => {
    ipcRenderer.send('notification-toast-click');
  }
});

ipcRenderer.on('set-notification-data', (event, data) => {
  document.getElementById('title').textContent = data.title || 'Linkus Linux';
  document.getElementById('body').textContent = data.body || '';
  if (data.icon) {
    document.getElementById('icon').textContent = data.icon;
  }
});

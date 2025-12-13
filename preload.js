const { contextBridge, ipcRenderer } = require('electron');

// Expose Linkus-specific APIs
contextBridge.exposeInMainWorld('linkusLinux', {
  showNotification: (options) => ipcRenderer.invoke('show-notification', options),
  playSound: (options) => ipcRenderer.invoke('play-notification-sound', options),
  showToast: (data) => ipcRenderer.send('notification-show-toast', data),
  updateTray: (data) => ipcRenderer.send('tray-update', data),
  setBadgeCount: (count) => ipcRenderer.invoke('set-badge-count', count)
});

// Inject notification and tray handling after DOM loads
window.addEventListener('DOMContentLoaded', () => {
  console.log('[Linkus Preload] Initializing notification interceptors');

  // Monitor for unread messages/notifications in the page
  // This watches for title changes that might indicate new messages
  const titleObserver = new MutationObserver((mutations) => {
    const title = document.title;
    const match = title.match(/\((\d+)\)/); // Match "(5)" style counts
    
    if (match) {
      const count = parseInt(match[1], 10);
      window.linkusLinux.updateTray({ count });
      window.linkusLinux.setBadgeCount(count);
    } else {
      window.linkusLinux.updateTray({ count: 0 });
      window.linkusLinux.setBadgeCount(0);
    }
  });

  titleObserver.observe(
    document.querySelector('title') || document.head,
    { childList: true, characterData: true, subtree: true }
  );

  console.log('[Linkus Preload] Title observer initialized');
});


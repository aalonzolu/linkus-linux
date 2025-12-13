const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Positioner = require('electron-positioner');

class NotificationToast {
  #window = null;
  #positioner = null;
  #autoCloseTimer = null;

  constructor(data, toastDuration = 5000) {
    this.#window = new BrowserWindow({
      width: 350,
      height: 100,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      show: false,
      transparent: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, 'notificationToastPreload.js')
      }
    });

    this.#positioner = new Positioner(this.#window);
    this.#positioner.move('bottomRight');

    this.#window.loadFile(path.join(__dirname, 'notificationToast.html'));

    this.#window.webContents.on('did-finish-load', () => {
      this.#window.webContents.send('set-notification-data', data);
      this.#window.show();
    });

    if (toastDuration > 0) {
      this.#autoCloseTimer = setTimeout(() => this.close(), toastDuration);
    }

    this.#window.on('closed', () => {
      if (this.#autoCloseTimer) {
        clearTimeout(this.#autoCloseTimer);
      }
    });
  }

  close() {
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.close();
    }
  }

  getWindow() {
    return this.#window;
  }
}

class CustomNotificationManager {
  #mainWindow = null;
  #toastDuration = 5000;
  #activeToasts = new Set();

  constructor(config, mainWindow) {
    this.#mainWindow = mainWindow;
    this.#toastDuration = config.get('notifications.custom.toastDuration') || 5000;
  }

  initialize() {
    console.log('[CustomNotificationManager] Initializing custom notification handlers');
    
    ipcMain.on('notification-show-toast', this.#handleShowToast.bind(this));
    ipcMain.on('notification-toast-click', this.#handleToastClick.bind(this));
  }

  #handleShowToast(event, data) {
    const toast = new NotificationToast(data, this.#toastDuration);
    
    this.#activeToasts.add(toast);
    
    toast.getWindow().on('closed', () => {
      this.#activeToasts.delete(toast);
    });
  }

  #handleToastClick() {
    if (this.#mainWindow) {
      this.#mainWindow.show();
      this.#mainWindow.focus();
    }
    
    // Close all active toasts
    this.#activeToasts.forEach(toast => toast.close());
  }
}

module.exports = CustomNotificationManager;

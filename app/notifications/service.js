const { ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

// Allow-list of sound files shipped with the app. Protects the
// `get-sound-buffer` IPC handler from path-traversal abuse.
const SOUND_FILES = {
  message: 'message.wav',
  'incoming-call': 'incoming-call.wav',
  'call-ended': 'call-ended.wav'
};

class NotificationService {
  #config = null;
  #mainWindow = null;
  #getUserStatus = null;
  #soundsDir = path.join(__dirname, '../assets/sounds');

  constructor(config, mainWindow, getUserStatus) {
    this.#config = config;
    this.#mainWindow = mainWindow;
    this.#getUserStatus = getUserStatus || (() => 'available');
  }

  initialize() {
    console.log('[NotificationService] Initializing notification handlers');

    ipcMain.handle('show-notification', this.#handleShowNotification.bind(this));
    ipcMain.handle('play-notification-sound', this.#handlePlayNotificationSound.bind(this));
    ipcMain.handle('get-sound-buffer', this.#handleGetSoundBuffer.bind(this));
  }

  async #handleShowNotification(event, options) {
    const startTime = Date.now();

    try {
      if (!this.#config.get('notifications.enabled')) {
        console.debug('[NotificationService] Notifications disabled');
        return { success: false, reason: 'disabled' };
      }

      const notification = new Notification({
        title: options.title || 'Linkus Linux',
        body: options.body || '',
        icon: options.icon || path.join(__dirname, '../icon.png'),
        urgency: options.urgency || this.#config.get('notifications.urgency'),
        silent: !this.#config.get('notifications.sound.enabled')
      });

      notification.on('click', () => {
        if (this.#mainWindow) {
          this.#mainWindow.show();
          this.#mainWindow.focus();
        }
      });

      notification.show();

      // Flash window if enabled
      if (this.#config.get('notifications.windowFlash') && this.#mainWindow) {
        this.#mainWindow.flashFrame(true);
        setTimeout(() => this.#mainWindow.flashFrame(false), 2000);
      }

      const totalTime = Date.now() - startTime;
      console.debug('[NotificationService] Notification shown', {
        title: options.title,
        timeMs: totalTime
      });

      return { success: true };
    } catch (error) {
      console.error('[NotificationService] Error showing notification:', error);
      return { success: false, reason: error.message };
    }
  }

  async #handlePlayNotificationSound(event, options) {
    try {
      if (!this.#config.get('notifications.sound.enabled')) {
        return { success: false, reason: 'disabled' };
      }

      const userStatus = this.#getUserStatus();
      if (this.#config.get('notifications.sound.disableWhenBusy') &&
          userStatus !== 'available') {
        return { success: false, reason: 'user_busy' };
      }

      const type = (options && options.type) || 'message';
      if (!SOUND_FILES[type]) {
        return { success: false, reason: 'unknown_sound' };
      }

      // Delegate actual playback to the renderer (Web Audio API).
      // The renderer already loaded the buffer via `get-sound-buffer`.
      if (this.#mainWindow && !this.#mainWindow.isDestroyed()) {
        this.#mainWindow.webContents.send('linkus:play-sound', { type });
      }

      return { success: true };
    } catch (error) {
      console.error('[NotificationService] Error playing sound:', error);
      return { success: false, reason: error.message };
    }
  }

  async #handleGetSoundBuffer(event, type) {
    const fileName = SOUND_FILES[type];
    if (!fileName) return null;
    try {
      const filePath = path.join(this.#soundsDir, fileName);
      const buf = await fs.promises.readFile(filePath);
      // Return raw bytes; contextBridge will wrap as Uint8Array on the other side.
      return buf;
    } catch (err) {
      console.error('[NotificationService] Error reading sound file:', err.message);
      return null;
    }
  }
}

module.exports = NotificationService;

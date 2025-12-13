const { ipcMain, Notification } = require('electron');
const path = require('path');

class NotificationService {
  #soundPlayer = null;
  #config = null;
  #mainWindow = null;
  #getUserStatus = null;

  constructor(soundPlayer, config, mainWindow, getUserStatus) {
    this.#soundPlayer = soundPlayer;
    this.#config = config;
    this.#mainWindow = mainWindow;
    this.#getUserStatus = getUserStatus || (() => 'available');
  }

  initialize() {
    console.log('[NotificationService] Initializing notification handlers');
    
    ipcMain.handle('show-notification', this.#handleShowNotification.bind(this));
    ipcMain.handle('play-notification-sound', this.#handlePlayNotificationSound.bind(this));
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
        console.debug('[NotificationService] Sounds disabled');
        return { success: false, reason: 'disabled' };
      }

      const userStatus = this.#getUserStatus();
      if (this.#config.get('notifications.sound.disableWhenBusy') && 
          userStatus !== 'available') {
        console.debug('[NotificationService] Sounds disabled - user not available');
        return { success: false, reason: 'user_busy' };
      }

      if (!this.#soundPlayer) {
        console.warn('[NotificationService] No sound player available');
        return { success: false, reason: 'no_player' };
      }

      const soundType = options.type || 'message';
      const soundFile = path.join(__dirname, '../assets/sounds', `${soundType}.wav`);

      await this.#soundPlayer.play(soundFile);
      
      return { success: true };
    } catch (error) {
      console.error('[NotificationService] Error playing sound:', error);
      return { success: false, reason: error.message };
    }
  }
}

module.exports = NotificationService;

const { Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');

class TrayIconChooser {
  constructor(config) {
    this.config = config;
  }

  getFile() {
    // Custom icon path takes precedence
    if (this.config.get('tray.customIcon')?.trim()) {
      return this.config.get('tray.customIcon');
    }

    const iconTheme = this.config.get('tray.iconTheme') || 'default';
    const size = '96x96';
    const iconName = `icon-${iconTheme}-${size}.png`;

    return path.join(__dirname, '../build/icons', iconName);
  }

  getBaseIcon() {
    // Try system icons first (installed by .deb)
    const systemIcon = '/usr/share/icons/hicolor/96x96/apps/linkus-linux.png';
    const fs = require('fs');
    
    if (fs.existsSync(systemIcon)) {
      return systemIcon;
    }
    
    // Fallback to project icon
    const size = '96x96';
    const projectIcon = path.join(__dirname, '../../build/icons', `${size}.png`);
    
    if (fs.existsSync(projectIcon)) {
      return projectIcon;
    }
    
    // Last resort: root icon.png
    return path.join(__dirname, '../../icon.png');
  }
}

class ApplicationTray {
  #tray = null;
  #window = null;
  #config = null;
  #iconPath = null;
  #baseIcon = null;

  constructor(window, config) {
    this.#window = window;
    this.#config = config;

    const iconChooser = new TrayIconChooser(config);
    this.#iconPath = iconChooser.getBaseIcon();
    
    try {
      this.#tray = new Tray(this.#iconPath);
      this.#baseIcon = nativeImage.createFromPath(this.#iconPath);
    } catch (error) {
      console.error('[ApplicationTray] Error creating tray:', error);
      return;
    }

    this.#tray.setToolTip(config.get('appTitle'));
    this.#tray.on('click', () => this.showAndFocusWindow());

    this.updateContextMenu();
  }

  initialize() {
    console.log('[ApplicationTray] Initializing tray handlers');
    
    ipcMain.handle('set-badge-count', this.#handleSetBadgeCount.bind(this));
  }

  #updateTooltip(count) {
    if (!this.#tray) return;
    
    const tooltip = count > 0 
      ? `Linkus Linux (${count} notification${count > 1 ? 's' : ''})`
      : 'Linkus Linux';
    this.#tray.setToolTip(tooltip);
  }

  showAndFocusWindow() {
    if (this.#window) {
      this.#window.show();
      this.#window.focus();
    }
  }

  updateContextMenu() {
    const { app } = require('electron');
    const autoLauncher = this.getAutoLauncher();
    
    const menuTemplate = [
      {
        label: 'Show Linkus',
        click: () => this.showAndFocusWindow()
      },
      { type: 'separator' },
      {
        label: 'Notifications',
        type: 'checkbox',
        checked: this.#config.get('notifications.enabled'),
        click: (menuItem) => {
          this.#config.set('notifications.enabled', menuItem.checked);
        }
      },
      {
        label: 'Sound',
        type: 'checkbox',
        checked: this.#config.get('notifications.sound.enabled'),
        click: (menuItem) => {
          this.#config.set('notifications.sound.enabled', menuItem.checked);
        }
      },
      { type: 'separator' },
      {
        label: 'Start on Boot',
        type: 'checkbox',
        checked: this.#config.get('autoStart') || false,
        click: async (menuItem) => {
          try {
            if (menuItem.checked) {
              await autoLauncher.enable();
              this.#config.set('autoStart', true);
              console.log('[ApplicationTray] Auto-start enabled');
            } else {
              await autoLauncher.disable();
              this.#config.set('autoStart', false);
              console.log('[ApplicationTray] Auto-start disabled');
            }
          } catch (error) {
            console.error('[ApplicationTray] Error toggling auto-start:', error);
          }
        }
      },
      {
        label: 'Change Server...',
        click: () => {
          ipcMain.emit('show-setup-window');
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ];

    this.#tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
  }

  getAutoLauncher() {
    const { app } = require('electron');
    
    return {
      enable: () => {
        return new Promise((resolve, reject) => {
          if (app.isPackaged) {
            app.setLoginItemSettings({
              openAtLogin: true,
              openAsHidden: false
            });
            resolve();
          } else {
            // Development mode - set executable path manually
            app.setLoginItemSettings({
              openAtLogin: true,
              openAsHidden: false,
              path: process.execPath,
              args: [require('path').resolve(__dirname, '../../')]
            });
            resolve();
          }
        });
      },
      disable: () => {
        return new Promise((resolve, reject) => {
          app.setLoginItemSettings({
            openAtLogin: false
          });
          resolve();
        });
      },
      isEnabled: () => {
        return app.getLoginItemSettings().openAtLogin;
      }
    };
  }

  async #handleSetBadgeCount(event, count) {
    this.#updateTooltip(count || 0);
    console.debug('[ApplicationTray] Badge count updated:', count);
    return { success: true };
  }

  destroy() {
    if (this.#tray) {
      this.#tray.destroy();
      this.#tray = null;
    }
  }
}

module.exports = { ApplicationTray, TrayIconChooser };

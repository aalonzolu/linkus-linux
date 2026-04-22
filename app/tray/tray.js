const { Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const { AutostartManager } = require('../autostart/linux');

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
    this.#tray.on('click', () => this.toggleWindow());

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
    if (!this.#window) return;
    if (this.#window.isMinimized()) this.#window.restore();
    this.#window.show();
    this.#window.focus();
  }

  toggleWindow() {
    if (!this.#window) return;
    const visible = this.#window.isVisible() && !this.#window.isMinimized();
    const focused = this.#window.isFocused();
    if (visible && focused) {
      this.#window.hide();
    } else {
      this.showAndFocusWindow();
    }
  }

  updateContextMenu() {
    const { app } = require('electron');
    const autostart = new AutostartManager();

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
        label: 'Start at login',
        type: 'checkbox',
        checked: autostart.isEnabled(),
        click: (menuItem) => {
          const ok = menuItem.checked ? autostart.enable() : autostart.disable();
          if (ok) {
            this.#config.set('autoStart', menuItem.checked);
            // When the user first enables autostart, default to starting
            // minimized so Linkus doesn't steal focus on every login.
            if (menuItem.checked && this.#config.get('startMinimized') === false) {
              this.#config.set('startMinimized', true);
            }
            console.log('[ApplicationTray] Auto-start', menuItem.checked ? 'enabled' : 'disabled');
          } else {
            console.error('[ApplicationTray] Auto-start toggle failed');
          }
          // Rebuild the menu so the checkmark reflects the real file state.
          this.updateContextMenu();
        }
      },
      {
        label: 'Start minimized to tray',
        type: 'checkbox',
        checked: Boolean(this.#config.get('startMinimized')),
        click: (menuItem) => {
          this.#config.set('startMinimized', menuItem.checked);
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

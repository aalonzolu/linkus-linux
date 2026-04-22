// Linux XDG autostart manager.
//
// Electron's app.setLoginItemSettings() is a no-op on Linux, so we manage
// ~/.config/autostart/linkus-linux.desktop directly. The file is re-generated
// (self-healed) on every app start so it stays in sync with the current
// install (AppImage path changes, deb<->AppImage migration, manual deletion).

const fs = require('fs');
const path = require('path');
const os = require('os');
const electron = require('electron');
// `electron.app` is undefined when this file is required from a plain Node
// process (e.g. unit tests). Fall back to a stub so the module is still safe
// to load.
const app = (electron && electron.app) || { isPackaged: false };

const DESKTOP_FILENAME = 'linkus-linux.desktop';
const MANAGED_MARKER = '# Managed-By=linkus-linux';

function inSandbox() {
  return Boolean(process.env.FLATPAK_ID || process.env.SNAP);
}

class AutostartManager {
  getDesktopEntryPath() {
    return path.join(os.homedir(), '.config', 'autostart', DESKTOP_FILENAME);
  }

  getAutostartDir() {
    return path.join(os.homedir(), '.config', 'autostart');
  }

  // ---------------------------------------------------------------------------
  // Exec line
  // ---------------------------------------------------------------------------

  #readSystemDesktopExec() {
    try {
      const systemEntry = '/usr/share/applications/linkus-linux.desktop';
      if (!fs.existsSync(systemEntry)) return null;
      const contents = fs.readFileSync(systemEntry, 'utf8');
      const match = contents.match(/^Exec=(.+)$/m);
      if (!match) return null;
      // Strip trailing %U / %u / %F / %f field codes.
      return match[1].replace(/\s+%[UuFf]\s*$/, '').trim();
    } catch {
      return null;
    }
  }

  getExecLine() {
    // 1) AppImage
    if (process.env.APPIMAGE) {
      // Quote the env var so a re-downloaded AppImage with spaces still works.
      return '"$APPIMAGE"';
    }

    // 2) Packaged deb/rpm
    if (app.isPackaged) {
      const systemExec = this.#readSystemDesktopExec();
      if (systemExec) return systemExec;
      // Fallback to the default electron-builder install path.
      return '"/opt/Linkus Linux/linkus-linux"';
    }

    // 3) Development
    const projectDir = path.resolve(__dirname, '..', '..');
    const electronBin = path.join(projectDir, 'node_modules', '.bin', 'electron');
    if (fs.existsSync(electronBin)) {
      return `"${electronBin}" "${projectDir}"`;
    }
    const entry = process.argv[1] ? path.resolve(process.argv[1]) : projectDir;
    return `"${process.execPath}" "${entry}"`;
  }

  getIconValue() {
    if (app.isPackaged) return 'linkus-linux';
    // In dev, the named icon usually isn't in the hicolor theme — use a path.
    const devIcon = path.resolve(__dirname, '..', '..', 'icon.png');
    if (fs.existsSync(devIcon)) return devIcon;
    return 'linkus-linux';
  }

  buildDesktopEntry() {
    return [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Linkus Linux',
      'Comment=Auto-start Linkus Linux to receive PBX calls',
      `Exec=${this.getExecLine()}`,
      `Icon=${this.getIconValue()}`,
      'Terminal=false',
      'StartupWMClass=linkus-linux',
      'Categories=Network;Telephony;',
      'X-GNOME-Autostart-enabled=true',
      'Hidden=false',
      MANAGED_MARKER,
      ''
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  isEnabled() {
    try {
      return fs.existsSync(this.getDesktopEntryPath());
    } catch {
      return false;
    }
  }

  enable() {
    if (inSandbox()) {
      console.warn('[Autostart] Running inside Flatpak/Snap — skipping (use portal instead).');
      return false;
    }
    try {
      const dir = this.getAutostartDir();
      fs.mkdirSync(dir, { recursive: true });
      const filePath = this.getDesktopEntryPath();
      fs.writeFileSync(filePath, this.buildDesktopEntry(), 'utf8');
      try { fs.chmodSync(filePath, 0o644); } catch { /* ignored */ }
      console.log('[Autostart] Enabled:', filePath);
      return true;
    } catch (err) {
      console.error('[Autostart] Enable failed:', err.message);
      return false;
    }
  }

  disable() {
    try {
      const filePath = this.getDesktopEntryPath();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('[Autostart] Disabled (removed):', filePath);
      }
      return true;
    } catch (err) {
      console.error('[Autostart] Disable failed:', err.message);
      return false;
    }
  }

  // Keep the desktop entry in sync with config.autoStart on every startup.
  sync(config) {
    try {
      if (inSandbox()) return;

      const want = Boolean(config.get('autoStart'));
      const filePath = this.getDesktopEntryPath();
      const exists = fs.existsSync(filePath);

      if (want && !exists) {
        this.enable();
        console.log('[Autostart] Re-created missing entry');
      } else if (want && exists) {
        // Rewrite if content drifted (e.g. AppImage path changed, deb removed).
        const current = fs.readFileSync(filePath, 'utf8');
        const desired = this.buildDesktopEntry();
        if (current !== desired) {
          fs.writeFileSync(filePath, desired, 'utf8');
          console.log('[Autostart] Re-synced entry (content changed)');
        }
      } else if (!want && exists) {
        // Only remove entries we manage. Respect foreign files.
        const current = fs.readFileSync(filePath, 'utf8');
        if (current.includes(MANAGED_MARKER)) {
          this.disable();
        } else {
          console.warn('[Autostart] Leaving foreign desktop entry untouched:', filePath);
        }
      }

      if (want && config.get('tray.enabled') === false) {
        console.warn('[Autostart] Autostart enabled but tray is disabled — app will launch without tray icon.');
      }
    } catch (err) {
      console.error('[Autostart] sync failed:', err.message);
    }
  }
}

module.exports = { AutostartManager };

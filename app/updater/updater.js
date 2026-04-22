// Thin wrapper around electron-updater.
// Only active for packaged AppImage/deb installs; silently no-ops in dev.

const { app, dialog } = require('electron');

function initAutoUpdater(mainWindow) {
  if (!app.isPackaged) {
    console.log('[Updater] Skipped (not packaged)');
    return null;
  }

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    console.warn('[Updater] electron-updater not available:', err.message);
    return null;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err?.message || err);
  });

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info?.version);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] No update available');
  });

  autoUpdater.on('download-progress', (p) => {
    console.log(`[Updater] Downloading: ${Math.round(p.percent)}%`);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    console.log('[Updater] Update downloaded:', info?.version);
    try {
      const { response } = await dialog.showMessageBox(mainWindow ?? undefined, {
        type: 'info',
        buttons: ['Reiniciar ahora', 'Más tarde'],
        defaultId: 0,
        cancelId: 1,
        message: `Linkus Linux ${info?.version || ''} está listo para instalarse`,
        detail: 'La actualización se instalará al reiniciar la aplicación.',
        noLink: true
      });
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    } catch (e) {
      console.warn('[Updater] Could not prompt for restart:', e.message);
    }
  });

  // First check shortly after startup, then every 6 hours.
  const runCheck = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[Updater] checkForUpdates failed:', err?.message || err);
    });
  };

  setTimeout(runCheck, 10_000);
  setInterval(runCheck, 6 * 60 * 60 * 1000);

  return autoUpdater;
}

module.exports = { initAutoUpdater };

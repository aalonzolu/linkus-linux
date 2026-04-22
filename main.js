const { app, BrowserWindow, Menu, dialog, shell, ipcMain, session, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const os = require('os');
const https = require('https');

// Disable GPU acceleration to prevent crashes on some Linux systems
app.disableHardwareAcceleration();

// Ensure GNOME can match the running window to linkus-linux.desktop (taskbar/dock icon)
// This sets the X11 WM_CLASS to "linkus-linux".
app.commandLine.appendSwitch('class', 'linkus-linux');

// Import notification and tray systems
const config = require('./app/config');
const NotificationService = require('./app/notifications/service');
const CustomNotificationManager = require('./app/customNotifications/index');
const { ApplicationTray } = require('./app/tray/tray');
const { initAutoUpdater } = require('./app/updater/updater');
const { AutostartManager } = require('./app/autostart/linux');
const { maskTel, sanitizeArgv, sanitizeUrl } = require('./app/utils/sanitize');

// Set app name for proper window class matching
app.setName('linkus-linux');

// Resolve an icon path that exists in both dev and packaged installs
function getIconPath(size = '256x256') {
  const candidates = [];

  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'build', 'icons', `${size}.png`));
    candidates.push(path.join(process.resourcesPath, 'build', 'icons', `${size}.png`));
    candidates.push(`/usr/share/icons/hicolor/${size}/apps/linkus-linux.png`);
  } else {
    candidates.push(path.join(__dirname, 'build', 'icons', `${size}.png`));
  }

  candidates.push(path.join(__dirname, 'icon.png'));

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (e) {
      // ignore and try next
    }
  }

  return path.join(__dirname, 'icon.png');
}

function cleanupLegacyUserDesktopEntry() {
  if (process.platform !== 'linux') return;
  if (!app.isPackaged) return;

  const legacyPath = path.join(os.homedir(), '.local', 'share', 'applications', 'linkus-linux.desktop');

  try {
    if (!fs.existsSync(legacyPath)) return;
    const contents = fs.readFileSync(legacyPath, 'utf8');

    const looksLikeOurLegacy =
      contents.includes('Name=Linkus Linux') &&
      (contents.includes('Exec=/opt/Linkus Linux/linkus-linux') || contents.includes('Exec="/opt/Linkus Linux/linkus-linux"'));

    if (!looksLikeOurLegacy) return;

    // Point tel: handler to the system desktop entry, then delete the legacy user entry.
    exec('xdg-mime default linkus-linux.desktop x-scheme-handler/tel 2>/dev/null || true', () => {
      try {
        fs.unlinkSync(legacyPath);
        exec('update-desktop-database ~/.local/share/applications >/dev/null 2>&1 || true');
        console.log(`[Main] Removed legacy user desktop entry: ${legacyPath}`);
      } catch (e) {
        console.warn('[Main] Could not remove legacy user desktop entry:', e.message);
      }
    });
  } catch (e) {
    console.warn('[Main] Legacy desktop entry cleanup failed:', e.message);
  }
}

let mainWindow = null;
let setupWindow = null;
let pendingTel = null;
let telProtocolRegistered = false;
let protocolPromptShown = false;
let tray = null;
let notificationService = null;
let customNotificationManager = null;

// Persist session/cookies in a stable directory so Linkus stays logged in.
const userDataPath = path.join(app.getPath('home'), '.linkus-linux');
try {
  fs.mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
} catch (err) {
  console.error('No se pudo preparar el directorio de sesión', err);
}

function getTelFromArgv(argv) {
  for (const a of argv) {
    if (typeof a === 'string' && a.startsWith('tel:')) return a;
  }
  return null;
}

function validateServer(url) {
  return new Promise((resolve) => {
    // Extract host from URL
    let host;
    try {
      const urlObj = new URL(url);
      host = urlObj.hostname;
    } catch (e) {
      return resolve({ success: false, error: 'Invalid URL format' });
    }

    const apiUrl = `${url}/api/v1.0/pbx/getproduct?host=${host}`;
    
    https.get(apiUrl, { rejectUnauthorized: false }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          
          if (json.errcode === 0 && json.product) {
            resolve({ success: true, data: json });
          } else {
            resolve({ success: false, error: 'Server did not return valid P-Series data' });
          }
        } catch (err) {
          resolve({ success: false, error: 'Invalid response from server' });
        }
      });
    }).on('error', (err) => {
      resolve({ success: false, error: `Connection failed: ${err.message}` });
    });
  });
}

function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 600,
    height: 550,
    resizable: false,
    show: false,
    icon: getIconPath('256x256'),
    webPreferences: {
      preload: path.join(__dirname, 'setupPreload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  setupWindow.loadFile('setup.html');
  setupWindow.setMenuBarVisibility(false);
  
  // Show window when ready to prevent flickering
  setupWindow.once('ready-to-show', () => {
    setupWindow.show();
    console.log('[Main] Setup window shown');
  });

  // Open external links in system browser
  setupWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  setupWindow.on('closed', () => {
    setupWindow = null;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    show: false,
    icon: getIconPath('256x256'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const serverUrl = config.get('serverUrl');
  mainWindow.loadURL(serverUrl);

  // Apply WebRTC IP handling policy (helps on VPN / multi-NIC setups).
  try {
    const policy = config.get('webRTCIPHandlingPolicy');
    if (policy && typeof mainWindow.webContents.setWebRTCIPHandlingPolicy === 'function') {
      mainWindow.webContents.setWebRTCIPHandlingPolicy(policy);
      console.log('[Main] WebRTC IP handling policy:', policy);
    }
  } catch (e) {
    console.warn('[Main] Could not set WebRTC IP handling policy:', e.message);
  }

  // Show window when ready to prevent flickering
  mainWindow.once('ready-to-show', () => {
    // Only show if not configured to start minimized
    if (!config.get('startMinimized') || pendingTel) {
      mainWindow.show();
      console.log('[Main] Main window shown');
    } else {
      console.log('[Main] Main window created but hidden (startMinimized)');
    }
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Catch navigation to external links
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const serverUrl = config.get('serverUrl');
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // Allow navigation within the same domain
      if (!url.startsWith(serverUrl)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingTel) {
      injectNumberAndCall(pendingTel);
      pendingTel = null;
    }
  });

  // Reload only if the *main frame* failed. Sub-frame (iframe) errors must not
  // trigger a full reload or they can wipe auth state.
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // -3 = ABORTED (user navigated away); ignore.
    if (errorCode === -3) return;
    if (!isMainFrame) {
      console.warn('[Main] Sub-frame load failed, ignoring:', errorCode, errorDescription);
      return;
    }
    console.warn('[Main] Main frame load failed, reloading in 3s:', errorCode, errorDescription, sanitizeUrl(validatedURL));
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.reload();
      }
    }, 3000);
  });

  mainWindow.on('close', (event) => {
    // Don't close if tray is enabled - minimize to tray instead
    if (config.get('tray.enabled') && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      console.log('[Main] Window hidden to tray');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Initialize notification and tray systems
  initializeNotificationSystems();
}

function initializeNotificationSystems() {
  try {
    // Initialize notification service. Sound playback is now handled in the
    // renderer via Web Audio API (see preload.js), so no system audio player
    // is required here.
    notificationService = new NotificationService(
      config,
      mainWindow,
      () => 'available' // getUserStatus function - can be enhanced later
    );
    notificationService.initialize();

    // Initialize custom notification manager
    customNotificationManager = new CustomNotificationManager(config, mainWindow);
    customNotificationManager.initialize();

    // Initialize system tray (if enabled)
    if (config.get('tray.enabled')) {
      tray = new ApplicationTray(mainWindow, config);
      tray.initialize();
      console.log('[Main] System tray initialized');
    }

    console.log('[Main] Notification systems initialized successfully');
  } catch (error) {
    console.error('[Main] Error initializing notification systems:', error);
  }
}

// Setup IPC handlers
function initializeSetupHandlers() {
  ipcMain.handle('validate-server', async (event, url) => {
    return await validateServer(url);
  });

  ipcMain.handle('save-server-config', async (event, url) => {
    config.set('serverUrl', url);
    config.set('serverConfigured', true);
    return { success: true };
  });

  ipcMain.on('close-setup', (event, payload) => {
    console.log('[Main] Closing setup window and creating main window');

    // Apply autostart preference collected by the setup wizard.
    try {
      const wantsAutostart = Boolean(payload && payload.autoStart);
      if (wantsAutostart) {
        const autostart = new AutostartManager();
        const ok = autostart.enable();
        config.set('autoStart', Boolean(ok));
        config.set('startMinimized', true);
        config.set('autostartPromptShown', true);
        if (tray) tray.updateContextMenu();
        console.log('[Main] Autostart from setup wizard:', ok);
      }
    } catch (e) {
      console.warn('[Main] Could not apply autostart from setup:', e.message);
    }

    if (setupWindow) {
      setupWindow.close();
    }
    // Create main window after setup if it doesn't exist
    if (!mainWindow) {
      createWindow();
    } else {
      // Reload with new URL
      mainWindow.loadURL(config.get('serverUrl'));
      mainWindow.show();
    }
  });

  ipcMain.on('show-setup-window', () => {
    if (!setupWindow) {
      createSetupWindow();
    } else {
      setupWindow.show();
      setupWindow.focus();
    }
  });
}

function registerTelProtocolLinuxManual() {
  return new Promise((resolve) => {
    if (process.platform !== 'linux') return resolve(false);

    const home = os.homedir();
    const desktopDir = path.join(home, '.local', 'share', 'applications');
    const desktopFile = path.join(desktopDir, 'linkus-linux.desktop');

    // Packaged installs already ship a system desktop entry at:
    //   /usr/share/applications/linkus-linux.desktop
    // Creating a per-user .desktop here causes two problems:
    // 1) It overrides the system entry (icon/categories/etc)
    // 2) It persists after uninstall ("ghost" app)
    // So for packaged builds, only set the xdg-mime association.
    if (app.isPackaged) {
      exec(
        `xdg-mime default linkus-linux.desktop x-scheme-handler/tel 2>/dev/null || true`,
        (error) => resolve(!error)
      );
      return;
    }

    let execPath, execArgs;
    const electronBin = path.join(__dirname, 'node_modules', '.bin', 'electron');
    if (fs.existsSync(electronBin)) {
      execPath = electronBin;
      execArgs = `${__dirname} %u`;
    } else {
      execPath = process.execPath;
      execArgs = `${process.argv[1] || __dirname} %u`;
    }

    const quotedExecPath = execPath.includes(' ') ? `"${execPath}"` : execPath;

    const desktopContent = `[Desktop Entry]
  Name=Linkus Linux
  Icon=${path.join(__dirname, 'icon.png')}
  Exec=${quotedExecPath} ${execArgs}
  Terminal=false
  Type=Application
  StartupWMClass=linkus-linux
  Categories=Network;Telephony;
  MimeType=x-scheme-handler/tel;
  NoDisplay=false
  `;

    try {
      fs.mkdirSync(desktopDir, { recursive: true });
      fs.writeFileSync(desktopFile, desktopContent, 'utf8');
      console.log(`Escribió ${desktopFile}`);
    } catch (err) {
      console.error('No se pudo escribir .desktop:', err);
      return resolve(false);
    }

    exec(`update-desktop-database "${desktopDir}" 2>/dev/null || true`, () => {
      exec(
        `xdg-mime default linkus-linux.desktop x-scheme-handler/tel 2>/dev/null || true`,
        (error) => {
          if (error) {
            console.warn('xdg-mime falló, pero el .desktop está creado. Intenta manualmente.');
            return resolve(false);
          }
          console.log('Registrado tel: handler vía xdg-mime.');
          resolve(true);
        }
      );
    });
  });
}

async function registerTelProtocol(options = {}) {
  const { force = false, quiet = false } = options;

  if (!force && (telProtocolRegistered || app.isDefaultProtocolClient('tel'))) {
    telProtocolRegistered = true;
    return true;
  }

  let registered = false;

  try {
    registered = app.setAsDefaultProtocolClient('tel');
  } catch (err) {
    if (!quiet) console.error('Error registrando tel (paquete):', err);
  }

  if (!registered && !app.isPackaged && process.argv.length >= 2) {
    try {
      const secondArg = process.argv[1];
      registered = app.setAsDefaultProtocolClient(
        'tel',
        process.execPath,
        [path.resolve(secondArg)]
      );
    } catch (err) {
      if (!quiet) console.error('Error registrando tel (desarrollo):', err);
    }
  }

  if (!registered && app.isDefaultProtocolClient('tel')) {
    registered = true;
  }

  // Linux fallback: escribir .desktop manualmente si Electron falló
  if (!registered && process.platform === 'linux') {
    if (!quiet) console.log('Intentando registro manual en Linux...');
    registered = await registerTelProtocolLinuxManual();
  }

  telProtocolRegistered = registered;
  if (!registered && !quiet) {
    console.warn('No se pudo registrar automáticamente el handler tel.');
  }
  return registered;
}

function promptForTelHandler() {
  if (protocolPromptShown) return;
  if (process.env.LINKUS_LINUX_SKIP_TEL_PROMPT === '1') return;
  if (app.isDefaultProtocolClient('tel')) {
    telProtocolRegistered = true;
    return;
  }

  protocolPromptShown = true;
  const platformHint = 'Puedes aceptar este diálogo y, si falla, usar el script npm run register:tel o xdg-mime manualmente.';

  dialog
    .showMessageBox(mainWindow ?? undefined, {
      type: 'question',
      buttons: ['Configurar', 'Más tarde'],
      defaultId: 0,
      cancelId: 1,
      message: '¿Quieres que Linkus Linux abra los enlaces tel:?',
      detail:
        'Esto permitirá que cualquier enlace tel: (por ejemplo, en tu CRM) abra automáticamente tu servidor PBX en esta app. ' +
        platformHint,
      noLink: true
    })
    .then(({ response }) => {
      if (response !== 0) return;
      const ok = registerTelProtocol({ force: true, quiet: true });
      if (!ok) {
        dialog.showMessageBox(mainWindow ?? undefined, {
          type: 'info',
          buttons: ['Entendido'],
          message: 'No se pudo completar el registro automático.',
          detail: 'Sigue las instrucciones del README usando xdg-mime o ejecuta: npm run register:tel'
        });
      }
    });
}

function promptForAutostart() {
  if (config.get('autostartPromptShown')) return;
  if (config.get('autoStart')) return;

  const autostart = new AutostartManager();
  if (autostart.isEnabled()) {
    // Desktop entry already there — reconcile config and skip the dialog.
    config.set('autoStart', true);
    config.set('autostartPromptShown', true);
    return;
  }

  dialog
    .showMessageBox(mainWindow ?? undefined, {
      type: 'question',
      buttons: ['Activar', 'Ahora no'],
      defaultId: 0,
      cancelId: 1,
      message: '¿Iniciar Linkus Linux automáticamente al iniciar sesión?',
      detail:
        'Esto permite que Linkus esté listo para recibir llamadas apenas inicies sesión. ' +
        'La app se abrirá minimizada en la bandeja del sistema. Puedes cambiarlo después desde el menú del icono en la bandeja.',
      noLink: true
    })
    .then(({ response }) => {
      config.set('autostartPromptShown', true);
      if (response !== 0) return;
      const ok = autostart.enable();
      config.set('autoStart', Boolean(ok));
      if (ok) {
        config.set('startMinimized', true);
        // Refresh the tray menu so the "Start at login" checkbox reflects the
        // new state immediately (without requiring the user to click it).
        if (tray) tray.updateContextMenu();
      } else {
        dialog.showMessageBox(mainWindow ?? undefined, {
          type: 'info',
          buttons: ['Entendido'],
          message: 'No se pudo activar el inicio automático.',
          detail: 'Revisa los permisos de ~/.config/autostart o actívalo más tarde desde el menú de la bandeja.'
        });
      }
    })
    .catch((err) => {
      console.warn('[Main] Autostart prompt failed:', err.message);
    });
}

async function injectNumberAndCall(telUrl) {
  if (!mainWindow) return;
  const match = /^tel:(.*)$/.exec(telUrl);
  const number = match ? decodeURIComponent(match[1]) : '';
  if (!number) return;

  const script = `(function(number){
    const TOOLBAR_SELECTOR = '.toolbar, div.toolbar';
    const INPUT_SELECTOR = 'input.ant-input[placeholder*="Número"], .dial-wra input[type="text"]';
    const BUTTON_SELECTOR = 'button.ant-btn.item-call, button.item-call';
    const MAX_WAIT = 12000;
    const STEP = 200;

    function nativeSetValue(element, value) {
      const proto = Object.getPrototypeOf(element);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) {
        desc.set.call(element, value);
      } else {
        element.value = value;
      }
    }

    function dispatchInputEvents(element) {
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function clickCallButton() {
      const btn = document.querySelector(BUTTON_SELECTOR);
      if (!btn) return false;
      ['mousedown','mouseup','click'].forEach(type => {
        btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
      });
      return true;
    }

    function triggerEnter(element) {
      const eventInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }; 
      ['keydown','keypress','keyup'].forEach(type => {
        const ev = new KeyboardEvent(type, eventInit);
        Object.defineProperty(ev, 'keyCode', { get: () => 13 });
        Object.defineProperty(ev, 'which', { get: () => 13 });
        element.dispatchEvent(ev);
      });
    }

    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function run() {
      const deadline = Date.now() + MAX_WAIT;
      while (Date.now() < deadline) {
        const toolbar = document.querySelector(TOOLBAR_SELECTOR);
        if (!toolbar) {
          await sleep(STEP);
          continue;
        }
        const input = document.querySelector(INPUT_SELECTOR);
        if (input) {
          if (input.value !== number) {
            nativeSetValue(input, number);
            dispatchInputEvents(input);
          }
          input.focus();
          await sleep(150);
          if (clickCallButton()) return 'clicked-button';
          triggerEnter(input);
          return 'enter-pressed';
        }
        await sleep(STEP);
      }
      return 'input-not-found';
    }

    return run();
  })(${JSON.stringify(number)});`;

  try{
    const result = await mainWindow.webContents.executeJavaScript(script, true);
    console.log('Injection result:', result);
  }catch(e){
    console.error('Injection failed', e);
  }
}

// Minimal application menu so standard shortcuts still work when the tray
// hides the window. Based on the pattern used by teams-for-linux (#2195).
function buildApplicationMenu() {
  const template = [
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Configurar servidor...',
          click: () => { ipcMain.emit('show-setup-window'); }
        },
        { type: 'separator' },
        {
          label: 'Ocultar ventana',
          accelerator: 'CmdOrCtrl+W',
          click: () => { if (mainWindow) mainWindow.hide(); }
        },
        {
          label: 'Salir',
          accelerator: 'CmdOrCtrl+Q',
          click: () => { app.isQuitting = true; app.quit(); }
        }
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'forceReload', label: 'Forzar recarga' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollador' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom normal' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' }
      ]
    },
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        { role: 'close', label: 'Cerrar' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Make single instance and handle second-instance args (Linux passes tel: as argv)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    const tel = getTelFromArgv(argv);
    console.log('[Main] second-instance argv:', sanitizeArgv(argv));
    if (tel) {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        mainWindow.show();
        injectNumberAndCall(tel);
      } else {
        pendingTel = tel;
        createWindow();
      }
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show();
    }
  });

  app.on('ready', async () => {
    cleanupLegacyUserDesktopEntry();

    // Self-heal the XDG autostart entry so it matches config on every launch.
    try {
      new AutostartManager().sync(config);
    } catch (e) {
      console.warn('[Main] Autostart sync failed:', e.message);
    }

    // Install a minimal application menu so standard keyboard shortcuts
    // (reload, copy/paste, zoom, devtools, quit) keep working even when the
    // window is hidden to tray. Based on the teams-for-linux pattern.
    buildApplicationMenu();

    // Initialize setup handlers
    initializeSetupHandlers();

    // Auto-allow media permissions (microphone/camera) for the configured PBX host
    try {
      session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
        const mediaPerms = ['media', 'microphone', 'camera'];
        if (mediaPerms.includes(permission)) {
          const currentUrl = webContents.getURL() || '';
          const serverUrl = config.get('serverUrl') || '';
          // Allow if the request comes from the configured server (or allow when not configured)
          if (!serverUrl || currentUrl.startsWith(serverUrl)) {
            return callback(true);
          }
          return callback(false);
        }
        // Default deny for other permission types; notifications are handled separately
        return callback(false);
      });
      console.log('[Main] Permission handler for media configured');
    } catch (e) {
      console.warn('[Main] Could not set permission handler:', e.message);
    }
    
    // On Linux packaged app will receive tel: as argv; when developing electron may also receive it
    const tel = getTelFromArgv(process.argv);
    if (tel) pendingTel = tel;

    // Check if server is configured
    if (!config.get('serverConfigured')) {
      console.log('[Main] Server not configured, showing setup window');
      createSetupWindow();
    } else {
      console.log('[Main] Server configured, creating main window');
      createWindow();

      const registered = await registerTelProtocol({ quiet: true });
      if (!registered) {
        setTimeout(() => promptForTelHandler(), 1500);
      }

      // Offer autostart once for users who already completed setup before
      // this feature existed.
      setTimeout(() => promptForAutostart(), 2500);
    }

    // Recover from stale auth / dropped connection after the machine resumes
    // from sleep. Teams-for-linux #2311 / #2376 fix the same class of issue.
    try {
      powerMonitor.on('resume', () => {
        console.log('[Main] System resumed, reloading main window');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.reload();
        }
      });
    } catch (e) {
      console.warn('[Main] Could not register powerMonitor listener:', e.message);
    }

    // Auto-update (AppImage / deb). No-op in dev.
    if (config.get('autoUpdate.enabled') !== false) {
      try {
        initAutoUpdater(mainWindow);
      } catch (e) {
        console.warn('[Main] Auto-updater init failed:', e.message);
      }
    }
  });

  app.on('window-all-closed', () => {
    // Don't quit if tray is enabled (keep running in background)
    if (!config.get('tray.enabled')) {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    // Set flag to allow window to close
    app.isQuitting = true;
    
    // Cleanup tray before quitting
    if (tray) {
      tray.destroy();
    }
  });
}

const { app, BrowserWindow, dialog, shell, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execSync, spawn } = require('child_process');
const os = require('os');
const https = require('https');

// Import notification and tray systems
const config = require('./app/config');
const NotificationService = require('./app/notifications/service');
const CustomNotificationManager = require('./app/customNotifications/index');
const { ApplicationTray } = require('./app/tray/tray');

// Set app name for proper window class matching
app.setName('linkus-linux');

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
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'setupPreload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  setupWindow.loadFile('setup.html');
  setupWindow.setMenuBarVisibility(false);

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
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const serverUrl = config.get('serverUrl');
  mainWindow.loadURL(serverUrl);

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
    // Initialize sound player (optional - can work without it)
    let soundPlayer = null;
    // Try a simple local sound player using system utilities (paplay/aplay/ffplay/play)
    function createSoundPlayer() {
      try {
        const candidates = ['/usr/bin/paplay', '/usr/bin/aplay', '/usr/bin/play', '/usr/bin/ffplay'];
        let playerCmd = candidates.find(p => fs.existsSync(p));
        if (!playerCmd) {
          try {
            const which = execSync("command -v paplay || command -v aplay || command -v play || command -v ffplay", { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
            if (which) playerCmd = which.split('\n')[0];
          } catch (e) {
            // no-op
          }
        }

        if (!playerCmd) return null;

        return {
          play: (file) => {
            return new Promise((resolve, reject) => {
              const args = playerCmd.endsWith('ffplay') ? ['-nodisp', '-autoexit', '-loglevel', 'quiet', file] : [file];
              const p = spawn(playerCmd, args, { stdio: 'ignore' });
              p.on('error', (err) => reject(err));
              p.on('close', () => resolve(true));
            });
          }
        };
      } catch (e) {
        return null;
      }
    }

    soundPlayer = createSoundPlayer();
    if (soundPlayer) console.log('[Main] Sound player initialized (system)');
    else console.warn('[Main] No audio player found - notifications will be silent');

    // Initialize notification service
    notificationService = new NotificationService(
      soundPlayer,
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

  ipcMain.on('close-setup', () => {
    if (setupWindow) {
      setupWindow.close();
    }
    // Create main window after setup if it doesn't exist
    if (!mainWindow) {
      createWindow();
    } else {
      // Reload with new URL
      mainWindow.loadURL(config.get('serverUrl'));
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

    let execPath, execArgs;
    if (app.isPackaged) {
      execPath = process.execPath;
      execArgs = '%u';
    } else {
      const electronBin = path.join(__dirname, 'node_modules', '.bin', 'electron');
      if (fs.existsSync(electronBin)) {
        execPath = electronBin;
        execArgs = `${__dirname} %u`;
      } else {
        execPath = process.execPath;
        execArgs = `${process.argv[1] || __dirname} %u`;
      }
    }

    const desktopContent = `[Desktop Entry]
Name=Linkus Linux
Icon=${path.join(__dirname, 'icon.png')}
Exec=${execPath} ${execArgs}
Terminal=false
Type=Application
Categories=Network;
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

// Make single instance and handle second-instance args (Linux passes tel: as argv)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    const tel = getTelFromArgv(argv);
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
      createWindow();

      // If configured to start minimized (e.g., on boot), hide the window
      if (config.get('startMinimized') && !tel) {
        mainWindow.hide();
        console.log('[Main] Started minimized to tray');
      }

      const registered = await registerTelProtocol({ quiet: true });
      if (!registered) {
        setTimeout(() => promptForTelHandler(), 1500);
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

const path = require('path');
const os = require('os');
const fs = require('fs');

const CONFIG_FILE = path.join(os.homedir(), '.linkus-linux', 'config.json');

const DEFAULT_CONFIG = {
  notifications: {
    enabled: true,
    method: 'web', // web, electron, custom
    urgency: 'normal', // low, normal, critical
    sound: {
      enabled: true,
      disableInCall: false,
      disableWhenBusy: false
    },
    windowFlash: true,
    custom: {
      toastDuration: 5000,
      position: 'bottomRight'
    }
  },
  tray: {
    enabled: true,
    iconTheme: 'default', // default, light, dark
    customIcon: '',
    showBadgeCount: true,
    showCallState: false,
    animations: {
      enabled: true,
      blinkOnIncoming: false
    }
  },
  autoStart: false,
  autostartPromptShown: false,
  startMinimized: false,
  serverUrl: '', // Yeastar P-Series PBX URL
  serverConfigured: false,
  appTitle: 'Linkus Linux',
  appPath: __dirname,
  // WebRTC IP handling policy. One of:
  //   'default' | 'default_public_interface_only' |
  //   'default_public_and_private_interfaces' | 'disable_non_proxied_udp'
  // Use 'default_public_interface_only' when on VPNs / multi-NIC setups to
  // avoid leaking internal IPs and to fix NAT/audio issues.
  webRTCIPHandlingPolicy: 'default',
  autoUpdate: {
    enabled: true
  }
};

class Config {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const userConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        return { ...DEFAULT_CONFIG, ...userConfig };
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
    return { ...DEFAULT_CONFIG };
  }

  saveConfig() {
    try {
      const configDir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Error saving config:', error);
    }
  }

  get(key) {
    const keys = key.split('.');
    let value = this.config;
    for (const k of keys) {
      value = value?.[k];
    }
    return value;
  }

  set(key, value) {
    const keys = key.split('.');
    let obj = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this.saveConfig();
  }

  getAll() {
    return this.config;
  }
}

module.exports = new Config();

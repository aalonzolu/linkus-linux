const { contextBridge, ipcRenderer } = require('electron');

// ---------------------------------------------------------------------------
// Web Audio-based sound playback (replaces the old spawn paplay/aplay path).
// The renderer asks main for the raw WAV bytes, decodes them once via
// AudioContext, caches the AudioBuffer and plays it on demand.
// ---------------------------------------------------------------------------
let audioCtx = null;
const soundCache = new Map();

function getAudioContext() {
  if (audioCtx) return audioCtx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  } catch (err) {
    console.warn('[Linkus Preload] AudioContext unavailable:', err.message);
    return null;
  }
}

async function loadSoundBuffer(type) {
  if (soundCache.has(type)) return soundCache.get(type);

  const ctx = getAudioContext();
  if (!ctx) return null;

  const raw = await ipcRenderer.invoke('get-sound-buffer', type);
  if (!raw) return null;

  // `raw` arrives as a Uint8Array (contextBridge-cloned Buffer). Take a
  // detached copy because decodeAudioData transfers ownership of the buffer.
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    soundCache.set(type, decoded);
    return decoded;
  } catch (err) {
    console.warn('[Linkus Preload] decodeAudioData failed for', type, err.message);
    return null;
  }
}

async function playLocalSound(type) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch (_) { /* ignored */ }
    }
    const buffer = await loadSoundBuffer(type);
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
  } catch (err) {
    console.warn('[Linkus Preload] Error playing sound:', err.message);
  }
}

// Expose Linkus-specific APIs
contextBridge.exposeInMainWorld('linkusLinux', {
  showNotification: (options) => ipcRenderer.invoke('show-notification', options),
  playSound: (options) => ipcRenderer.invoke('play-notification-sound', options || {}),
  showToast: (data) => ipcRenderer.send('notification-show-toast', data),
  updateTray: (data) => ipcRenderer.send('tray-update', data),
  setBadgeCount: (count) => ipcRenderer.invoke('set-badge-count', count)
});

// Main tells us to play a specific sound.
ipcRenderer.on('linkus:play-sound', (_event, payload) => {
  const type = (payload && payload.type) || 'message';
  playLocalSound(type);
});

// Inject notification and tray handling after DOM loads
window.addEventListener('DOMContentLoaded', () => {
  console.log('[Linkus Preload] Initializing notification interceptors');

  // Monitor for unread messages/notifications in the page
  // This watches for title changes that might indicate new messages
  const titleObserver = new MutationObserver((mutations) => {
    const title = document.title;
    const match = title.match(/\((\d+)\)/); // Match "(5)" style counts

    if (match) {
      const count = parseInt(match[1], 10);
      window.linkusLinux.updateTray({ count });
      window.linkusLinux.setBadgeCount(count);
    } else {
      window.linkusLinux.updateTray({ count: 0 });
      window.linkusLinux.setBadgeCount(0);
    }
  });

  titleObserver.observe(
    document.querySelector('title') || document.head,
    { childList: true, characterData: true, subtree: true }
  );

  // Prime the AudioContext on the first user gesture (Chromium autoplay policy).
  const primeCtx = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => { /* ignored */ });
    }
  };
  window.addEventListener('click', primeCtx, { once: true, capture: true });
  window.addEventListener('keydown', primeCtx, { once: true, capture: true });

  console.log('[Linkus Preload] Title observer initialized');
});


const { nativeImage } = require('electron');
const path = require('path');

class TrayIconRenderer {
  #baseIcon = null;
  #config = null;
  #ipcRenderer = null;
  #currentCount = 0;

  init(config, ipcRenderer) {
    this.#config = config;
    this.#ipcRenderer = ipcRenderer;

    // Load base icon
    const iconSize = '96x96';
    const iconPath = path.join(__dirname, '../../build/icons', `${iconSize}.png`);
    this.#baseIcon = nativeImage.createFromPath(iconPath);

    console.log('[TrayIconRenderer] Initialized');
  }

  async updateActivityCount(count) {
    if (this.#currentCount === count) {
      return; // No change
    }

    this.#currentCount = count;
    const startTime = Date.now();

    try {
      const iconDataUrl = await this.render(count);
      const renderTime = Date.now() - startTime;

      if (this.#ipcRenderer) {
        this.#ipcRenderer.send('tray-update', { 
          iconDataUrl, 
          count 
        });
        
        this.#ipcRenderer.invoke('set-badge-count', count);
      }

      const totalTime = Date.now() - startTime;
      console.debug('[TrayIconRenderer] Activity count update', {
        newCount: count,
        renderTimeMs: renderTime,
        totalTimeMs: totalTime,
        performanceNote: renderTime > 100 ? 'Slow rendering detected' : 'Normal speed'
      });
    } catch (error) {
      console.error('[TrayIconRenderer] Error updating activity count:', error);
    }
  }

  async render(newActivityCount) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.height = 140;
      canvas.width = 140;

      const image = new Image();
      image.onload = () => {
        this._addBadgeNotification(canvas, image, newActivityCount, resolve);
      };
      image.onerror = () => {
        console.error('[TrayIconRenderer] Error loading base icon');
        resolve(this.#baseIcon.toDataURL('image/png'));
      };
      image.src = this.#baseIcon.toDataURL('image/png');
    });
  }

  _addBadgeNotification(canvas, image, count, resolve) {
    const ctx = canvas.getContext('2d');

    // Draw base icon
    ctx.drawImage(image, 0, 0, 140, 140);

    // Add badge if count > 0 and not disabled
    if (count > 0 && !this.#config?.get('tray.showBadgeCount') === false) {
      // Red circle background
      ctx.fillStyle = '#E74856'; // Linkus red
      ctx.beginPath();
      ctx.ellipse(100, 90, 40, 40, 40, 0, 2 * Math.PI);
      ctx.fill();

      // White text
      ctx.textAlign = 'center';
      ctx.fillStyle = 'white';
      ctx.font = 'bold 70px "Segoe UI","Helvetica Neue",Helvetica,Arial,sans-serif';

      // Display count or "+" for >9
      const displayText = count > 9 ? '+' : count.toString();
      ctx.fillText(displayText, 100, 110);
    }

    resolve(canvas.toDataURL('image/png'));
  }
}

module.exports = TrayIconRenderer;

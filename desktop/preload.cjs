// Bridge between the game page and the desktop shell. The game checks for window.ashenDesktop and
// otherwise runs exactly as it does in a browser.
const { contextBridge, ipcRenderer } = require('electron');

// saves are read once at start-up, then served from memory; every write goes straight to disk
const cache = ipcRenderer.sendSync('store:load') || {};
const info = ipcRenderer.sendSync('app:info') || {};
const fsListeners = new Set();
ipcRenderer.on('fullscreen', (_, on) => { info.fullscreen = on; for (const f of fsListeners) f(on); });

contextBridge.exposeInMainWorld('ashenDesktop', {
  version: info.version,
  platform: info.platform,
  steam: !!info.steam,
  store: {
    get: (key) => (key in cache ? cache[key] : null),
    set: (key, value) => { cache[key] = String(value); return ipcRenderer.sendSync('store:set', key, String(value)); },
    remove: (key) => { delete cache[key]; return ipcRenderer.sendSync('store:remove', key); },
  },
  isFullscreen: () => !!info.fullscreen,
  setFullscreen: (on) => ipcRenderer.send('app:fullscreen', !!on),
  onFullscreen: (fn) => { fsListeners.add(fn); },
  quit: () => ipcRenderer.send('app:quit'),
  achievement: (id) => ipcRenderer.send('steam:achievement', String(id)),
});

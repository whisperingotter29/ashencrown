// Ashen Crown desktop shell. Loads the built web game (desktop/game, copied from ../dist) through a
// private app:// origin, keeps saves as real files in the user's app-data folder (so Steam Cloud
// can sync them), remembers fullscreen/window size, and talks to Steam when an App ID is set.
const { app, BrowserWindow, protocol, net, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const steam = require('./steam.cjs');

const GAME_DIR = path.join(__dirname, 'game');
const DEV_URL = process.env.ASHEN_DEV_URL || '';          // e.g. http://localhost:5173 to run against the Vite dev server

app.setName('Ashen Crown');
// keep saves in a stable folder name regardless of the package name
app.setPath('userData', path.join(app.getPath('appData'), 'AshenCrown'));
const SAVE_DIR = path.join(app.getPath('userData'), 'saves');
const WINDOW_FILE = path.join(app.getPath('userData'), 'window.json');

if (!app.requestSingleInstanceLock()) app.exit(0);

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Steam must start before the app is ready (the overlay adds GPU switches)
steam.start();

// ------------------------------------------------------------------ saves
// One file per key ("ashencrown.save.0" -> saves/ashencrown.save.0.json). Written atomically so a
// crash mid-write never leaves a torn save.
const fileFor = (key) => path.join(SAVE_DIR, String(key).replace(/[^a-z0-9._-]/gi, '_') + '.json');
function loadStore() {
  const out = {};
  try {
    fs.mkdirSync(SAVE_DIR, { recursive: true });
    for (const f of fs.readdirSync(SAVE_DIR)) {
      if (!f.endsWith('.json')) continue;
      try { out[f.slice(0, -5)] = fs.readFileSync(path.join(SAVE_DIR, f), 'utf8'); } catch (e) { /* skip unreadable file */ }
    }
  } catch (e) { console.error('could not read saves', e); }
  return out;
}
function writeFileAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, file);
}
ipcMain.on('store:load', (e) => { e.returnValue = loadStore(); });
ipcMain.on('store:set', (e, key, value) => {
  try { writeFileAtomic(fileFor(key), String(value)); e.returnValue = true; } catch (err) { console.error('save failed', err); e.returnValue = false; }
});
ipcMain.on('store:remove', (e, key) => {
  try { fs.rmSync(fileFor(key), { force: true }); e.returnValue = true; } catch (err) { e.returnValue = false; }
});

// ------------------------------------------------------------------ window
function readWindowState() {
  try { return JSON.parse(fs.readFileSync(WINDOW_FILE, 'utf8')); } catch (e) { return { fullscreen: true, width: 1280, height: 720 }; }
}
function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const full = win.isFullScreen();
  const prev = readWindowState();
  const b = full ? prev : win.getNormalBounds();
  try { writeFileAtomic(WINDOW_FILE, JSON.stringify({ fullscreen: full, width: b.width, height: b.height, x: b.x, y: b.y })); } catch (e) { /* ignore */ }
}

let win = null;
function createWindow() {
  const st = readWindowState();
  win = new BrowserWindow({
    title: 'Ashen Crown',
    width: st.width || 1280, height: st.height || 720, x: st.x, y: st.y,
    minWidth: 960, minHeight: 540,
    fullscreen: st.fullscreen !== false,
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  // F11 / Alt+Enter toggle fullscreen; F12 opens devtools only in dev runs
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) { e.preventDefault(); setFullscreen(!win.isFullScreen()); }
    if (input.key === 'F12' && !app.isPackaged) win.webContents.toggleDevTools();
  });
  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false));
  win.on('close', () => saveWindowState(win));
  // the game never opens other pages: links go to the system browser, navigation stays put
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://') && !(DEV_URL && url.startsWith(DEV_URL))) e.preventDefault(); });
  win.loadURL(DEV_URL || 'app://game/index.html');
}
function setFullscreen(on) {
  if (!win) return;
  win.setFullScreen(!!on);
  saveWindowState(win);
}

ipcMain.on('app:info', (e) => { e.returnValue = { version: app.getVersion(), platform: process.platform, fullscreen: win ? win.isFullScreen() : true, steam: steam.available() }; });
ipcMain.on('app:fullscreen', (e, on) => setFullscreen(on));
ipcMain.on('app:quit', () => { saveWindowState(win); app.quit(); });
ipcMain.on('steam:achievement', (e, id) => steam.achievement(id));

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  // serve the built game from desktop/game under app://game/
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(GAME_DIR, p));
    if (!file.startsWith(GAME_DIR)) return new Response('forbidden', { status: 403 });
    if (!fs.existsSync(file)) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // no default menu (stops Ctrl+R reloads and the like); macOS keeps a minimal app menu for Cmd+Q
  if (process.platform === 'darwin') Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'windowMenu' }]));
  else Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => steam.shutdown());

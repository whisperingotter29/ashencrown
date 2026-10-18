// Steam integration through steamworks.js. Off until an App ID is set in steam.json (or the
// STEAM_APP_ID environment variable); with 0 the game runs as a plain desktop app (itch.io, testing).
// 480 is Valve's public test app ("Spacewar"), handy for checking the overlay before you have an ID.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

let sw = null, client = null;
const unlocked = new Set();

function appId() {
  if (process.argv.includes('--steam-test')) return 480;
  if (process.env.STEAM_APP_ID) return Number(process.env.STEAM_APP_ID) || 0;
  try { return Number(JSON.parse(fs.readFileSync(path.join(__dirname, 'steam.json'), 'utf8')).appId) || 0; } catch (e) { return 0; }
}

function start() {
  const id = appId();
  if (!id) return;
  try {
    sw = require('steamworks.js');
    // started outside Steam in a release build: let Steam relaunch it (so the overlay and playtime work)
    if (app.isPackaged && id !== 480 && sw.restartAppIfNecessary(id)) { app.exit(0); return; }
    client = sw.init(id);
    sw.electronEnableSteamOverlay();
    console.log('Steam ready for', client.localplayer.getName());
  } catch (e) {
    // Steam not running, or not owned: keep playing without it
    console.warn('Steam unavailable:', e.message);
    client = null;
  }
}

const available = () => !!client;

function achievement(id) {
  if (!client || typeof id !== 'string' || unlocked.has(id)) return;
  try {
    if (!client.achievement.isActivated(id)) client.achievement.activate(id);
    unlocked.add(id);
  } catch (e) { console.warn('achievement failed', id, e.message); }
}

function shutdown() { client = null; }

module.exports = { start, available, achievement, shutdown };

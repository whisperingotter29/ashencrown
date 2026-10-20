# Ashen Crown — desktop / Steam build

The game ships as an Electron app: Chromium bundled in, so it runs exactly like the web build,
plus saves on disk, fullscreen, and Steam (achievements, overlay, cloud saves).

```
desktop/
  main.cjs        window, app:// file server, save files, fullscreen, quit
  preload.cjs     window.ashenDesktop bridge the game talks to (src/core/desktop.js)
  steam.cjs       steamworks.js: init, overlay, achievements (off while appId is 0)
  steam.json      Steam App ID + depot IDs
  build/icon.png  app icon (1024px; converted per OS by electron-builder)
  scripts/        copy-game.cjs (puts ../dist into game/), steam-upload.cjs (SteamPipe)
```

## Run and build

Needs Node 20+.

```
cd desktop
npm install
npm start              # builds the web game, opens it in the desktop app
npm run dist:win       # release/win-unpacked + AshenCrown-<ver>-win-x64.zip
npm run dist:linux     # release/linux-unpacked + .AppImage + .tar.gz (Steam Deck / Linux)
npm run dist:mac       # release/mac-universal + .zip + .dmg (must be run on a Mac)
```

Windows and Linux builds can both be made on Windows or Linux. The `*-unpacked` folders are what
goes to Steam; the zip / AppImage / tar.gz files are for itch.io or direct download.

In the app: **F11** or **Alt+Enter** toggles fullscreen (also in Settings → Window). It starts
fullscreen the first time and remembers your choice. Title screen and pause menu have **Quit**.

Saves are plain JSON files:

| OS | Folder |
|---|---|
| Windows | `%APPDATA%\AshenCrown\saves` |
| macOS | `~/Library/Application Support/AshenCrown/saves` |
| Linux / Steam Deck | `~/.config/AshenCrown/saves` |

## Putting it on Steam

1. **Steamworks account.** Sign up at partner.steamgames.com, pay the Steam Direct fee, get an
   **App ID**.
2. **Depots.** In Steamworks → SteamPipe → Depots, make one depot per OS (Windows, Linux, macOS).
   Put the IDs in `steam.json`:
   ```json
   { "appId": 1234560, "depots": { "windows": 1234561, "linux": 1234562, "mac": 0 } }
   ```
   With an App ID set, the game connects to Steam on launch. Started outside Steam, a release build
   asks Steam to relaunch it. Without Steam running it just plays on.
3. **Launch options** (Installation → General):
   - Windows: `AshenCrown.exe`
   - Linux: `AshenCrown` with arguments `--no-sandbox` (Electron's sandbox helper loses its
     permissions inside Steam's runtime)
   - macOS: `Ashen Crown.app`
4. **Steam Cloud** (Steam Cloud → Auto-Cloud): byte quota 10 MB, 20 files.
   Root `WinAppDataRoaming`, subdirectory `AshenCrown/saves`, pattern `*.json`.
   Add root overrides: macOS → `MacAppSupport`, Linux → `LinuxXdgConfigHome` (same subdirectory).
5. **Achievements** (Stats & Achievements): create each one with exactly these API names, plus
   64×64 icons for locked and unlocked. They are defined in `src/systems/achievements.js`.

   | API name | Name | Description |
   |---|---|---|
| `ACH_FIRST_BLOOD` | First Blood | Slay your first foe. |
| `ACH_SLAYER` | Ash and Bone | Slay 1,000 foes. |
| `ACH_FATE_EPIC` | Touched by Fate | Roll an Epic or rarer race or class. |
| `ACH_FATE_SUPREME` | Chosen of the Dice | Roll a Supreme race or class. |
| `ACH_LEVEL_10` | Blooded | Reach level 10. |
| `ACH_LEVEL_25` | Veteran | Reach level 25. |
| `ACH_LEVEL_50` | Legend of the Waste | Reach level 50. |
| `ACH_LEVEL_100` | Crownworthy | Reach level 100. |
| `ACH_DUNGEON` | Delver | Clear a dungeon. |
| `ACH_DUNGEON_10` | Tomb Robber | Clear 10 dungeons. |
| `ACH_DUNGEON_ALL` | Nothing Left Buried | Clear every dungeon. |
| `ACH_BOSS` | Kingslayer | Slay a dungeon boss. |
| `ACH_WORLD_BOSS` | Titanfall | Slay a world boss. |
| `ACH_RIVAL` | Settled Score | Defeat your rival. |
| `ACH_SHARD` | A Piece of the Crown | Recover a Crown Shard. |
| `ACH_SHARDS_ALL` | The Crown Remembered | Recover all six Crown Shards. |
| `ACH_DEEP` | Into the Hollow | Descend into the Hollow Deep. |
| `ACH_STREAK_50` | Unstoppable | Reach a 50-kill streak. |
| `ACH_PARRY_25` | Steel Wall | Parry 25 attacks. |
| `ACH_LEGENDARY` | Fortune Favours | Find a Legendary or Mythic item. |
| `ACH_MOUNT` | Saddled | Ride a mount. |
| `ACH_WAYSTONES_5` | Pathfinder | Attune 5 waystones. |
| `ACH_CRAFT_10` | Forge-Hand | Craft 10 items. |
| `ACH_ENCHANT` | Runesmith | Enchant an item. |

6. **Test the overlay** before you have your own ID: with the Steam client running,
   `npm run start:steam-test` connects as Valve's test app (Spacewar, 480). Shift+Tab opens the overlay.
7. **Upload.** Install [SteamCMD](https://developer.valvesoftware.com/wiki/SteamCMD), then:
   ```
   npm run dist:win
   npm run dist:linux
   npm run steam:upload -- --user YOUR_STEAM_LOGIN --desc "v0.1.0"
   ```
   The build shows up in Steamworks → Builds, where you set it live on a branch.
   (`--live beta` sets it live on a beta branch straight away.)

## Notes

- **Steam Deck:** the Linux build runs natively, and the Windows build also works through Proton.
  The game supports controllers and runs at 1280×800.
- **macOS:** shipping to Mac users needs an Apple Developer account so the app can be signed and
  notarized. electron-builder does this when `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` are set.
- **Windows code signing** is optional on Steam. Unsigned builds downloaded from elsewhere show a
  SmartScreen warning.
- **itch.io:** upload the zip, AppImage or tar.gz, or push the unpacked folders with `butler`.
- **Version:** bump `version` in `desktop/package.json`. It shows up in file names and in the app.

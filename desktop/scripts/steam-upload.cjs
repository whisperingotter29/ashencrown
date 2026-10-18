// Uploads the built game to Steam with SteamPipe. Needs steamcmd installed and on PATH
// (https://developer.valvesoftware.com/wiki/SteamCMD) and the App ID + depot IDs in steam.json.
//   npm run steam:upload -- --user YOUR_STEAM_LOGIN [--desc "notes"] [--live beta]
// Builds that exist in release/ are uploaded: win-unpacked, linux-unpacked, mac-universal.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const arg = (name) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : null; };
const ROOT = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'steam.json'), 'utf8'));
const user = arg('user');
if (!cfg.appId) { console.error('Set "appId" (and the depot IDs) in desktop/steam.json first.'); process.exit(1); }
if (!user) { console.error('Usage: npm run steam:upload -- --user YOUR_STEAM_LOGIN'); process.exit(1); }

const builds = { windows: 'win-unpacked', linux: 'linux-unpacked', mac: 'mac-universal' };
const depots = [];
for (const [os, dir] of Object.entries(builds)) {
  const id = cfg.depots?.[os];
  if (!id || !fs.existsSync(path.join(ROOT, 'release', dir))) continue;
  depots.push(`\t\t"${id}"\n\t\t{\n\t\t\t"FileMapping"\n\t\t\t{\n\t\t\t\t"LocalPath" "${dir}/*"\n\t\t\t\t"DepotPath" "."\n\t\t\t\t"recursive" "1"\n\t\t\t}\n\t\t\t"FileExclusion" "*.pdb"\n\t\t}`);
  console.log(`depot ${id} <- release/${dir}`);
}
if (!depots.length) { console.error('No builds found in release/ for the depots in steam.json. Run npm run dist:win / dist:linux / dist:mac first.'); process.exit(1); }

const outDir = path.join(ROOT, 'steam-output');
fs.mkdirSync(outDir, { recursive: true });
const vdf = `"AppBuild"
{
\t"AppID" "${cfg.appId}"
\t"Desc" "${(arg('desc') || 'Ashen Crown ' + require('../package.json').version).replace(/"/g, "'")}"
\t"ContentRoot" "${path.join(ROOT, 'release').replace(/\\/g, '/')}/"
\t"BuildOutput" "${outDir.replace(/\\/g, '/')}/"
${arg('live') ? `\t"SetLive" "${arg('live')}"\n` : ''}\t"Depots"
\t{
${depots.join('\n')}
\t}
}
`;
const vdfPath = path.join(outDir, 'app_build.vdf');
fs.writeFileSync(vdfPath, vdf);
console.log('wrote', vdfPath);
const r = spawnSync('steamcmd', ['+login', user, '+run_app_build', vdfPath, '+quit'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (r.error) { console.error('Could not run steamcmd (' + r.error.code + '). Install SteamCMD and make sure it is on your PATH.'); process.exit(1); }
process.exit(r.status ?? 1);

// Copies the built web game (../dist) into desktop/game, which the app serves under app://game/.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', '..', 'dist');
const dst = path.join(__dirname, '..', 'game');
if (!fs.existsSync(path.join(src, 'index.html'))) { console.error('No web build found at', src, '- run "npm run build" in the project root first.'); process.exit(1); }
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log('copied game build to', dst);

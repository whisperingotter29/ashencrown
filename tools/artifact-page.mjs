// Turns dist-single/index.html into a claude.ai artifact page (no html/head/body shell; title first).
import { readFileSync, writeFileSync } from 'node:fs';
const [src = 'dist-single/index.html', out = 'dist-single/ashen-crown.html'] = process.argv.slice(2);
const s = readFileSync(src, 'utf8');
const sOpen = '<script type="module" crossorigin>';
const a = s.indexOf(sOpen), st = s.lastIndexOf('<style');
const b = s.lastIndexOf('</script>', st);
const stEnd = s.indexOf('</style>', st) + '</style>'.length;
if (a < 0 || b < a || st < b) throw new Error('unexpected single-file layout');
const script = s.slice(a, b + '</script>'.length), style = s.slice(st, stEnd);
const page = [
  '<title>Ashen Crown</title>',
  style,
  '<style>:root{color-scheme:dark;background:#000}</style>',
  '<div id="game"></div>',
  '<div id="ui"></div>',
  script,
].join('\n');
writeFileSync(out, page);
console.log(out, page.length);

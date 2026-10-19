// Runs the browser tests one after another and prints a summary.
//   node run.js                     every test in Chromium
//   node run.js --browser=webkit    in WebKit (Safari's engine; needs `npx playwright install webkit`)
//   node run.js tablet sideink      only these tests
const {spawnSync} = require('child_process'), path = require('path');
const args = process.argv.slice(2), browser = (args.find(a => a.startsWith('--browser=')) || '=chromium').split('=')[1];
// assets.js writes nbfile.html, which driveshare.js and trash.js read, so it runs first
const ALL = ['assets', 'e2e', 'nb', 'menu', 'hover', 'tips', 'anno', 'trash', 'cmdk', 'prefs', 'folders', 'fixes', 'tab', 'side', 'beside',
  'drive', 'driveshare', 'sync', 'odsync', 'onedrive', 'guides', 'pickframe', 'fidelity', 'tablet', 'sideink', 'organise', 'layoutscale',
  'sidecorner', 'ribbonscroll', 'pdfside', 'guide', 'table', 'journal', 'blankshape', 'formula', 'pagenum', 'mdlist', 'gapselect', 'hidenotes', 'spelling'];
// these use Chrome DevTools features (touch/pen emulation, CPU throttling) that only Chromium has
const CHROMIUM_ONLY = new Set(['blankshape', 'guide', 'guides', 'hover', 'table', 'tablet', 'sideink', 'organise']);
const pick = args.filter(a => !a.startsWith('--'));
let list = (pick.length ? pick : ALL).filter(t => browser === 'chromium' || pick.length || !CHROMIUM_ONLY.has(t));
const rows = [];
// several tests read nbfile.html, a notebook file that assets.js downloads: make it first if it isn't there
if (!require('fs').existsSync(path.join(__dirname, 'nbfile.html')) && !list.includes('assets')) list.unshift('assets');
for (const t of list) {
  const r = spawnSync(process.execPath, [path.join(__dirname, t + '.js')], {encoding: 'utf8', env: {...process.env, BROWSER: browser}, timeout: 400000});
  const out = (r.stdout || '') + (r.stderr || ''), oks = (out.match(/^ok /gm) || []).length;
  const fail = (out.match(/FAILED:.*|ERRORS:[\s\S]{0,300}|Error: .*/) || [''])[0].split('\n')[0];
  const passed = r.status === 0 && !fail;
  rows.push({t, passed, oks, fail}); console.log(`${passed ? 'PASS' : 'FAIL'}  ${t.padEnd(12)} ${String(oks).padStart(4)} checks  ${fail}`);
}
const bad = rows.filter(r => !r.passed);
console.log(`\n${rows.length - bad.length}/${rows.length} passed in ${browser}` + (browser !== 'chromium' && !pick.length ? ` (skipped Chromium-only: ${[...CHROMIUM_ONLY].join(', ')})` : ''));
process.exit(bad.length ? 1 : 0);

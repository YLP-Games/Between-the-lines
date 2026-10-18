// Opens the app in a browser with every CDN library served from local node_modules.
// BROWSER=webkit (Safari's engine) or BROWSER=firefox picks another engine; Chromium is the default.
const playwright = require('playwright');
const engine = playwright[process.env.BROWSER || 'chromium'];
const path = require('path');
const fs = require('fs');

const NM = path.join(__dirname, 'node_modules');
const MAP = [
  [/pdf\.js\/3\.11\.174\/pdf\.min\.js(\?.*)?$/, 'pdfjs-dist/build/pdf.min.js'],
  [/pdf\.js\/3\.11\.174\/pdf\.worker\.min\.js(\?.*)?$/, 'pdfjs-dist/build/pdf.worker.min.js'],
  [/jszip\/3\.10\.1\/jszip\.min\.js(\?.*)?$/, 'jszip/dist/jszip.min.js'],
  [/KaTeX\/0\.16\.9\/katex\.min\.js(\?.*)?$/, 'katex/dist/katex.min.js'],
  [/KaTeX\/0\.16\.9\/katex\.min\.css$/, 'katex/dist/katex.min.css'],
  [/KaTeX\/0\.16\.9\/fonts\/(KaTeX_[\w-]+\.woff2)$/, m => 'katex/dist/fonts/' + m[1]],
  [/mammoth@1\.6\.0\/mammoth\.browser\.min\.js(\?.*)?$/, 'mammoth/mammoth.browser.min.js'],
  [/docx-preview@0\.3\.7\/dist\/docx-preview\.min\.js(\?.*)?$/, 'docx-preview/dist/docx-preview.min.js'],
  [/typo-js@1\.2\.4\/typo\.js$/, 'typo-js/typo.js'],
  [/dictionary-en@4\.0\.0\/index\.(aff|dic)$/, m => 'dictionary-en/index.' + m[1]],
  [/dictionary-en-gb@3\.0\.0\/index\.(aff|dic)$/, m => 'dictionary-en-gb/index.' + m[1]],
  // the UK dictionary (LibreOffice's, by Marco A.G. Pinto) and the common-word lists are saved in tests/dict, so the tests need no internet
  [/LibreOffice\/dictionaries(@|\/)libreoffice-[\d.]+\/en\/(en_GB\.(aff|dic))$/, m => './dict/' + m[2]],
  [/wordlist-english@1\.2\.1\/((english|british|american)-words-(10|20|35)\.json)$/, m => './dict/' + m[1]],
];
const TYPES = {js: 'text/javascript', css: 'text/css', aff: 'text/plain', dic: 'text/plain', woff2: 'font/woff2', json: 'application/json'};

async function open(file, {width = 1440, height = 900, colorScheme = 'light', storage, contextOptions = {}} = {}){
  fs.mkdirSync(path.join(__dirname, 'shots'), {recursive: true});
  const browser = await engine.launch(process.env.SHOWBARS && engine === playwright.chromium ? {ignoreDefaultArgs: ['--hide-scrollbars']} : {});
  const context = await browser.newContext({viewport: {width, height}, colorScheme, acceptDownloads: true, ...(storage ? {storageState: storage} : {}), ...contextOptions});
  const errors = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('file:') || url.startsWith('http://127.0.0.1')) return route.continue();
    for (const [re, rel] of MAP) {
      const m = url.match(re);
      if (m) {
        const f = typeof rel === 'function' ? rel(m) : rel, p = f.startsWith('./') ? path.join(__dirname, f) : path.join(NM, f);
        return route.fulfill({status: 200, body: fs.readFileSync(p), contentType: TYPES[p.split('.').pop()] || 'application/octet-stream', headers: {'access-control-allow-origin': '*'}});
      }
    }
    if (/fonts\.googleapis\.com/.test(url)) return route.fulfill({status: 200, contentType: 'text/css', body:
      `@font-face{font-family:Caveat;font-weight:400 700;src:url(https://fonts.gstatic.com/caveat.woff2)}@font-face{font-family:"Bricolage Grotesque";font-weight:600;src:url(https://fonts.gstatic.com/bricolage.woff2)}@font-face{font-family:"Patrick Hand";src:url(https://fonts.gstatic.com/patrick.woff2)}@font-face{font-family:Kalam;font-weight:700;src:url(https://fonts.gstatic.com/kalam.woff2)}`});
    if (/fonts\.gstatic\.com\/(caveat|bricolage|patrick|kalam)/.test(url)) { const f = {caveat: '@fontsource/caveat/files/caveat-latin-400-normal.woff2', bricolage: '@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-600-normal.woff2', patrick: '@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff2', kalam: '@fontsource/kalam/files/kalam-latin-700-normal.woff2'}[url.match(/(caveat|bricolage|patrick|kalam)/)[1]];
      return route.fulfill({status: 200, body: fs.readFileSync(path.join(NM, f)), contentType: 'font/woff2', headers: {'access-control-allow-origin': '*'}}); }
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + file);
  return {browser, context, page, errors};
}
module.exports = {open};

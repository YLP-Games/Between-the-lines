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
  [/pdfjs-dist@3\.11\.174\/((cmaps|standard_fonts)\/[\w.-]+)$/, m => 'pdfjs-dist/' + m[1]],
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

// the CDN libraries and web fonts the app asks for, served from node_modules (anything else from the internet is refused)
async function libs(context, net = []){
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/^(file:|blob:|data:|chrome-extension:|http:\/\/127\.0\.0\.1)/.test(url)) return route.continue();      // (WebKit asks for the page's own blob: addresses here too)
    net.push(url);
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
}
// Playwright's WebKit doesn't show a route the body of a request sent as a Blob (postData() is null), so the fake Google Drive and
// OneDrive couldn't read an upload: there the page sends the same bytes as an ArrayBuffer instead (with the Blob's type, as the browser would).
function blobBodies(){
  const bytes = b => b instanceof Blob ? b.arrayBuffer() : null;
  const typed = (h, b) => { h = new Headers(h); if (b.type && !h.has('content-type')) h.set('content-type', b.type); return h; };
  const f = window.fetch;
  window.fetch = async (u, o) => o?.body instanceof Blob ? f(u, {...o, headers: typed(o.headers, o.body), body: await bytes(o.body)}) : f(u, o);
  const X = XMLHttpRequest.prototype, send = X.send, set = X.setRequestHeader;
  X.setRequestHeader = function(k, v){ if (/^content-type$/i.test(k)) this._ct = true; return set.call(this, k, v); };
  X.send = function(b){
    if (!(b instanceof Blob)) return send.call(this, b);
    bytes(b).then(a => { if (b.type && !this._ct) set.call(this, 'Content-Type', b.type); send.call(this, a); });
  };
}
// Playwright's WebKit, set offline, also refuses the page's own blob: addresses and can't read a Blob, which Safari never does (they are
// in memory): there going offline is done by hand, as Safari has it. Requests to the internet fail, and navigator.onLine and its events follow.
function offlineByHand(context){
  let off = false;
  const cut = route => /^(file:|blob:|data:)/.test(route.request().url()) ? route.fallback() : route.abort('internetdisconnected');
  context.setOffline = async o => {
    if (!o === !off) return; off = !!o;
    await (off ? context.route('**/*', cut) : context.unroute('**/*', cut));
    for (const p of context.pages()) await p.evaluate(o => { Object.defineProperty(navigator, 'onLine', {configurable: true, get: () => !o}); dispatchEvent(new Event(o ? 'offline' : 'online')); }, off).catch(() => {});
  };
}
// CHROME_PATH=/path/to/chrome uses that Chrome instead of Playwright's own (e.g. where only a newer Chrome is installed)
const launchOpts = () => ({...(process.env.SHOWBARS && engine === playwright.chromium ? {ignoreDefaultArgs: ['--hide-scrollbars']} : {}), ...(process.env.CHROME_PATH && engine === playwright.chromium ? {executablePath: process.env.CHROME_PATH} : {})});
async function open(file, {width = 1440, height = 900, colorScheme = 'light', storage, contextOptions = {}, url, init} = {}){
  fs.mkdirSync(path.join(__dirname, 'shots'), {recursive: true});
  const browser = await engine.launch(launchOpts());
  const context = await browser.newContext({viewport: {width, height}, colorScheme, acceptDownloads: true, ...(storage ? {storageState: storage} : {}), ...contextOptions});
  const errors = [], net = [];                 // net: every address asked for that is not a local file
  if (engine === playwright.webkit) { await context.addInitScript(blobBodies); offlineByHand(context); }
  if (init) await context.addInitScript(init);
  await libs(context, net);
  const page = await context.newPage();
  // on a Mac, Home and End scroll the page instead of moving the cursor: in a text they get the Mac's keys for the same move
  if (process.platform === 'darwin') {
    const MOVES = {Home: 'Meta+ArrowLeft', End: 'Meta+ArrowRight', 'Control+Home': 'Meta+ArrowUp', 'Control+End': 'Meta+ArrowDown'}, press = page.keyboard.press.bind(page.keyboard);
    page.keyboard.press = async (k, o) => press(MOVES[k] && await page.evaluate(() => { const a = document.activeElement; return a && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName)); }) ? MOVES[k] : k, o);
  }
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url || 'file://' + file);
  return {browser, context, page, errors, net};
}
module.exports = {open, libs, launchOpts};

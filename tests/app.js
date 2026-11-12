// The iPad app (the ios folder): its own copy of the page (ios/web, made by ios/make-web.py) needs nothing from the web, the hooks the
// app calls work (a file handed over, the Pencil's double tap), and a notebook file made in the app is the same as one made on the web.
// Also: page pictures keep their addresses when Safari writes them back with backslashes.
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const {execFileSync} = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  console.log(execFileSync('python3', [path.join(ROOT, 'ios', 'make-web.py')], {encoding: 'utf8'}).trim());
  const COPY = path.join(ROOT, 'ios', 'web', 'index.html');
  ok(fs.existsSync(COPY), 'make-web.py makes the app\'s copy of the page');

  // ---- on the web: nothing changes ----
  let {browser, page, errors} = await open(path.join(ROOT, 'index.html'));
  await page.waitForTimeout(600);
  const webHtml = await page.evaluate(() => APP_HTML);
  ok(await page.evaluate(() => !nativeApp && !LIBS.length && !document.documentElement.classList.contains('in-app') && lib('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js') === 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js'), 'on the web the page is not "in the app", and every library keeps its web address');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#sideDrive')).display !== 'none'), 'and Google Drive is offered');
  // Safari's way of writing a page picture's address back, and the quoted way it is now set
  ok(await page.evaluate(() => plainUrls('<div style="--pg: url(blob\\:https\\:\\/\\/a\\.b\\/1f-2c);"></div><i style="--pg: url(data\\:image\\/png\;base64\\,AA\\+\\/\\=)">') === '<div style="--pg: url(blob:https://a.b/1f-2c);"></div><i style="--pg: url(data:image/png;base64,AA+/=)">'), 'an address Safari wrote with backslashes is put back as it was');
  ok(await page.evaluate(() => { const d = document.createElement('div'), all = []; for (const v of ['url("blob:https://a.b/1f-2c")', 'url(blob\\:https\\:\\/\\/a\\.b\\/1f-2c)', 'url(blob:https://a.b/1f-2c)']) { d.style.setProperty('--pg', v); all.push(pgUrl(d)); } return all.every(u => u === 'blob:https://a.b/1f-2c'); }), 'and a page\'s picture is read the same however it was written');
  ok(!errors.length, 'no page errors on the web: ' + errors.join(' | '));
  await browser.close();

  // ---- in the app ----
  // (served as the app serves it, from one address: a page opened as a file may not load its own scripts)
  const TYPES = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', woff2: 'font/woff2', png: 'image/png', svg: 'image/svg+xml'};
  const server = require('http').createServer((q, r) => {
    const f = path.join(ROOT, 'ios', 'web', decodeURIComponent(new URL(q.url, 'http://x').pathname));
    if (!f.startsWith(path.join(ROOT, 'ios', 'web')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, {'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream'}); r.end(fs.readFileSync(f));
  });
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const HOME = 'http://127.0.0.1:' + server.address().port + '/';
  let net;
  ({browser, page, errors, net} = await open(COPY, {url: HOME + 'index.html', width: 1024, height: 1366, contextOptions: {hasTouch: true}, init: () => { window.webkit = {messageHandlers: {btl: {postMessage(){}}}}; }}));
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => nativeApp && LIBS.length >= 10 && document.documentElement.classList.contains('in-app')), 'the app\'s copy knows it is in the app and has its libraries listed');
  ok(await page.evaluate(() => typeof pdfjsLib === 'object' && typeof JSZip === 'function'), 'the PDF and PowerPoint readers loaded from the app');
  ok(await page.evaluate(() => ['#sideDrive', '#sideOd', '#driveSec', '#odSec', '#saveMenu [data-drive]', '#saveMenu [data-od]', '.mhead.cloud'].every(s => [...document.querySelectorAll(s)].length && [...document.querySelectorAll(s)].every(e => getComputedStyle(e).display === 'none'))), 'Google Drive and OneDrive sign-in are not shown (the iPad\'s file picker has them)');
  // a file handed over by the Files app
  const pdf = fs.readFileSync(path.join(__dirname, 'lecture.pdf')).toString('base64');
  await page.evaluate(async b64 => { const u = URL.createObjectURL(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))])); await btlApp.open(u, 'lecture.pdf', 'application/pdf'); }, pdf);
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(1500);
  ok(await page.evaluate(() => notebookName() === 'lecture'), 'a file the app hands over opens as a notebook, with its name');
  ok(await page.evaluate(() => pdfjsLib.GlobalWorkerOptions.workerSrc === location.origin + '/libs/pdfjs/build/pdf.worker.min.js'), 'the PDF was read with the app\'s own copy of the reader');
  ok(await page.evaluate(() => /^url\("blob:[^"\\]+"\)$/.test(document.querySelector('.pagecard').style.getPropertyValue('--pg'))), 'a page\'s picture is set in quotes: ' + await page.evaluate(() => document.querySelector('.pagecard').style.getPropertyValue('--pg').slice(0, 24)));
  // spelling and maths come from the app too
  await page.evaluate(async () => { await spellFetch(SPELL_LIB); await spellFetch(SPELL_DICTS['en-US'][0] + '.aff'); await spellFetch(SPELL_DICTS['en-GB'][0] + '.dic'); await spellFetch(SPELL_TIERS + 'english-words-10.json'); await loadScript('https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js'); await loadScript(DOCX_LIB); await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js'); });
  ok(await page.evaluate(() => typeof katex === 'object' && typeof docx === 'object' && typeof mammoth === 'object'), 'the maths, Word and spelling libraries load from the app');
  ok(net.length === 0, 'nothing at all was asked of the web' + (net.length ? ': ' + [...new Set(net)].slice(0, 6).join(' , ') : ''));
  // a file opened the moment the app starts (Open with): its pictures are not cleared away as unused before its pages are saved
  // (Playwright's WebKit runs as a private window, which can't store pictures at all: the iPad itself can, and Chromium checks this)
  if (process.env.BROWSER !== 'webkit') ok(await page.evaluate(async () => { const id = assetOf.get(await addAsset(new Blob(['new']))); await putAll({'asset:aold1': new Blob(['old'])}); const had = (await allKeys()).filter(k => String(k).startsWith('asset:')); await tidyAssets(); await new Promise(r => setTimeout(r, 300)); const left = (await allKeys()).filter(k => String(k).startsWith('asset:')); return had.includes('asset:aold1') && !left.includes('asset:aold1') && left.includes('asset:' + id) && left.length === had.length - 1; }), 'tidying up removes a picture nothing uses, but not one stored since the page started, nor the open notebook\'s');
  // the Pencil's double tap
  const tool = () => page.evaluate(() => ds.activeTool);
  await page.evaluate(() => { ds.activeTool = 'hl'; toolBefore = null; dsChanged(); btlApp.pencil('eraser'); });
  ok(await tool() === 'er', 'a double tap set to the eraser picks the eraser');
  ok(await page.evaluate(() => /Eraser/.test(document.body.innerText)), 'and says so, as the drawing tools are put away');
  await page.evaluate(() => btlApp.pencil('eraser'));
  ok(await tool() === 'hl', 'and again goes back to the highlighter');
  await page.evaluate(() => btlApp.pencil('previous'));
  ok(await tool() === 'er', 'set to the last tool, it swaps with the one before');
  await page.evaluate(() => btlApp.pencil('previous'));
  ok(await tool() === 'hl', 'and back');
  await page.evaluate(() => btlApp.pencil('palette'));
  ok(await page.evaluate(() => drawing && !document.getElementById('drawBar').hidden), 'set to the palette, it shows the drawing tools');
  await page.click('#drawBar [data-tool="pen"]'); await page.evaluate(() => btlApp.pencil('previous'));
  ok(await tool() === 'hl', 'a tool picked by hand is remembered as the one before');
  await page.evaluate(() => btlApp.pencil('palette'));
  ok(await page.evaluate(() => !drawing), 'and the palette again puts the tools away');
  // a notebook file made in the app opens anywhere
  const appHtml = await page.evaluate(() => APP_HTML);
  ok(appHtml === webHtml, 'a notebook file made in the app carries the same page as one made on the web (web addresses, nothing of the app)' + (appHtml === webHtml ? '' : ': ' + (() => { let i = 0; while (appHtml[i] === webHtml[i]) i++; return JSON.stringify(appHtml.slice(Math.max(0, i - 40), i + 90)) + " vs " + JSON.stringify(webHtml.slice(Math.max(0, i - 40), i + 90)); })()));
  ok(!errors.length, 'no page errors in the app\'s copy: ' + errors.join(' | '));
  await browser.close(); server.close();
  console.log('all good');
})().catch(e => { console.error(e.message); process.exit(1); });

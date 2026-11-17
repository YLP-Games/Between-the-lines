// The app suggests the browser extension: in Help & settings, in Ctrl+K, and now and then after you open a PDF; its download is one zip
const {open} = require('./harness'); const JSZip = require('jszip');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const TYPES = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml', md: 'text/markdown'};
(async () => {
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x'), p = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, {'content-type': TYPES[p.split('.').pop()] || 'application/octet-stream'}); r.end(fs.readFileSync(p));
  }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const APP = `http://127.0.0.1:${srv.address().port}/index.html`;
  const {browser, context, page, errors} = await open(null, {url: APP, contextOptions: {serviceWorkers: 'block'}});
  await page.waitForTimeout(800);
  const card = () => page.locator('#extCard');

  // ---- the files the app zips are exactly the extension's files ----
  const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)).map(f => e.name + '/' + f) : [e.name]);
  const onDisk = walk(path.join(ROOT, 'extension')).sort(), listed = (await page.evaluate(() => EXT_FILES)).slice().sort();
  ok(JSON.stringify(onDisk) === JSON.stringify(listed), 'the app’s list of the extension’s files matches the extension folder (' + onDisk.length + ' files)');
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8'));
  ok(man.version === await page.evaluate(() => EXT_VER), 'and the version it expects is the extension’s (' + man.version + ')');

  // ---- Help & settings ----
  await page.click('#helpBtn'); await page.waitForTimeout(200);
  ok(await page.isVisible('#extSec') && (await page.textContent('#extHow')).trim() === 'Get the browser extension', 'Help & settings has “Open PDFs straight from your browser” with Get the browser extension');
  await page.click('#extHow'); await page.waitForTimeout(200);
  ok(await card().isVisible() && await page.isHidden('#settings'), 'it opens a card (and closes Help & settings)');
  ok((await page.textContent('#extT')) === 'Open PDFs straight from Chrome', 'titled for this browser: “Open PDFs straight from Chrome”');
  const steps = await page.$$eval('#extCard .a2-steps li', ls => ls.map(l => l.textContent.replace(/\s+/g, ' ').trim()));
  ok(steps.length === 3 && /Download the extension/.test(steps[0]) && /chrome:\/\/extensions/.test(steps[1]) && /Developer mode/.test(steps[1]) && /Load unpacked/.test(steps[2]), 'three steps: download it, open chrome://extensions with Developer mode on, Load unpacked');
  ok(await page.evaluate(() => document.activeElement?.dataset.ext) === 'zip', 'the download button has the focus');
  ok(await page.getAttribute('#extCard [data-ext=copy]', 'data-copy') === 'chrome://extensions', 'a Copy button for chrome://extensions (a page can’t link to it)');
  ok(await page.isHidden('#extCard [data-ext=no]'), 'opened from Help, it has no “Not now”');

  // ---- the download: one zip with the whole extension in a folder ----
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#extCard [data-ext=zip]')]);
  ok(dl.suggestedFilename() === 'between-the-lines-extension.zip', 'Download the extension saves “between-the-lines-extension.zip”');
  const zip = await JSZip.loadAsync(fs.readFileSync(await dl.path()));
  const inZip = Object.keys(zip.files).filter(n => !zip.files[n].dir).sort();
  ok(JSON.stringify(inZip) === JSON.stringify(onDisk.map(f => 'between-the-lines-extension/' + f)), 'with every file of the extension in one folder');
  ok(JSON.parse(await zip.file('between-the-lines-extension/manifest.json').async('string')).version === man.version && (await zip.file('between-the-lines-extension/icons/128.png').async('uint8array')).length === fs.statSync(path.join(ROOT, 'extension/icons/128.png')).size, 'the files are whole (its manifest, its icons)');
  await page.waitForFunction(() => /Unzip it, then do steps 2 and 3/.test(document.querySelector('#toast').textContent));
  ok(true, 'and it says what to do next');
  await page.click('#extCard [data-ext=ok]'); await page.waitForTimeout(100);
  ok(await card().isHidden(), 'Done closes it');

  // ---- Ctrl+K ----
  await page.keyboard.press('Control+k'); await page.waitForTimeout(200); await page.keyboard.type('extension'); await page.waitForTimeout(200);
  ok(/Get the browser extension/.test(await page.textContent('#ckList')), 'Ctrl+K finds “Get the browser extension”');
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  ok(await card().isVisible(), '… and it opens the card'); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok(await card().isHidden(), 'Esc closes it');

  // ---- the nudge: after opening a PDF the long way, once in a while ----
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(2200);
  ok(await card().isVisible() && await page.isVisible('#extCard [data-ext=no]'), 'after you open a PDF with Open, the card suggests the extension (with Not now)');
  await page.click('#extCard [data-ext=no]'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => pref.json('ext-tip', {}).no) === 1, 'Not now is remembered');
  await page.setInputFiles('#file', path.join(__dirname, 'portrait.pdf')); await page.waitForTimeout(3500);
  ok(await card().isHidden(), 'and it doesn’t come back for the next PDF (it waits two weeks)');
  await page.evaluate(() => pref.setJson('ext-tip', {no: 1, at: Date.now() - 15 * 864e5}));
  await page.setInputFiles('#file', path.join(__dirname, 'week2.pptx')); await page.waitForTimeout(3500);
  ok(await card().isHidden(), 'a PowerPoint doesn’t bring it up');
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf')); await page.waitForTimeout(3500);
  ok(await card().isVisible(), 'two weeks on, a PDF brings it up once more');
  await page.click('#extCard [data-ext=no]');
  await page.evaluate(() => pref.setJson('ext-tip', {no: 2, at: 0}));
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf')); await page.waitForTimeout(3500);
  ok(await card().isHidden(), 'after Not now twice, never again');
  await page.evaluate(() => { pref.setJson('ext-tip', {}); pref.set('tips', '0'); });
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf')); await page.waitForTimeout(3500);
  ok(await card().isHidden(), 'with Show tips off, never');
  await page.evaluate(() => pref.set('tips', '1'));

  // ---- with the extension installed (it marks the page), or an older one ----
  await page.evaluate(() => { document.documentElement.dataset.btlExt = EXT_VER; });
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf')); await page.waitForTimeout(3500);
  ok(await card().isHidden(), 'with the extension installed, no nudge');
  await page.click('#helpBtn'); await page.waitForTimeout(200);
  ok((await page.textContent('#extHow')).trim() === 'About the browser extension' && /is installed/.test(await page.textContent('#extHint')), 'Help & settings says it is installed');
  await page.click('#extHow'); await page.waitForTimeout(200);
  ok(/The extension is installed \(version/.test(await page.textContent('#extCard')) && !(await page.$('#extCard .a2-steps')), 'and the card says so, with no steps');
  await page.click('#extCard [data-ext=ok]');
  await page.evaluate(() => { document.documentElement.dataset.btlExt = '1.0.0'; });
  await page.click('#helpBtn'); await page.waitForTimeout(200);
  ok((await page.textContent('#extHow')).trim() === 'Update the browser extension', 'an older version: Help & settings offers to update it');
  await page.click('#extHow'); await page.waitForTimeout(200);
  ok(/newer version of the extension \(1\.1\.0; you have 1\.0\.0\)/.test(await page.textContent('#extCard')) && await page.locator('#extCard .a2-steps li').count() === 3, '… and the card says how (with the steps)');
  await page.screenshot({path: path.join(__dirname, 'shots', 'extension-card.png'), clip: await card().boundingBox()});
  await browser.close();

  // ---- an iPad: it says the extension is for computers ----
  const ipad = await open(null, {url: APP, contextOptions: {serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', hasTouch: true}});
  await ipad.page.waitForTimeout(600);
  await ipad.page.evaluate(() => showExt(false)); await ipad.page.waitForTimeout(200);
  ok(/for Chrome, Edge, Brave and other Chromium browsers on a computer/.test(await ipad.page.textContent('#extCard')) && !(await ipad.page.$('#extCard .a2-steps')), 'on an iPad (or in Safari) it says the extension is for computers, and points to the iPad app');
  await ipad.browser.close();
  srv.close();
  const errs = errors.concat(ipad.errors).filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });

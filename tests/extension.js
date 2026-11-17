// The browser extension: PDFs opened in Chrome (151+) and documents you download go straight into Between the Lines
const {chromium} = require('playwright'); const {libs} = require('./harness');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..'), EXT = path.join(ROOT, 'extension');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const TYPES = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml', pdf: 'application/pdf'};
(async () => {
  // the app and some documents, from a local server
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x'), f = n => fs.readFileSync(path.join(__dirname, n));
    if (u.pathname === '/docs/lecture.pdf') { r.writeHead(200, {'content-type': 'application/pdf'}); return r.end(f('lecture.pdf')); }
    if (u.pathname === '/docs/portrait.pdf') { r.writeHead(200, {'content-type': 'application/pdf'}); return r.end(f('portrait.pdf')); }
    if (u.pathname === '/docs/get') { r.writeHead(200, {'content-type': 'application/pdf', 'content-disposition': `inline; filename="Week 3 - Markets.pdf"; filename*=UTF-8''${encodeURIComponent('Week 3 – Markets.pdf')}`}); return r.end(f('long.pdf')); }
    if (u.pathname === '/docs/slides') { r.writeHead(200, {'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'content-disposition': 'attachment; filename="week2.pptx"'}); return r.end(f('week2.pptx')); }
    if (u.pathname === '/docs/reading.docx') { r.writeHead(200, {'content-type': 'application/octet-stream'}); return r.end(f('reading.docx')); }
    if (u.pathname === '/docs/page.html') { r.writeHead(200, {'content-type': 'text/html'}); return r.end('<!doctype html><title>links</title><a id="dl" href="/docs/slides">Week 2 slides</a> <a id="pdf" href="/docs/lecture.pdf">Lecture</a>'); }
    const p = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, {'content-type': TYPES[p.split('.').pop()] || 'application/octet-stream'}); r.end(fs.readFileSync(p));
  });
  // the app and the documents are on different sites (as with a course website), or the app's service worker would fetch the documents itself
  const app = http.createServer((q, r) => srv.emit('request', q, r)).listen(0, '127.0.0.1');
  srv.listen(0, '127.0.0.1');
  await Promise.all([srv, app].map(x => new Promise(r => x.listening ? r() : x.on('listening', r))));
  const base = `http://127.0.0.1:${srv.address().port}`, APP = `http://127.0.0.1:${app.address().port}/index.html`;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'btl-ext-'));
  const ctx = await chromium.launchPersistentContext(prof, {executablePath: process.env.CHROME_PATH || undefined, headless: true, viewport: {width: 1300, height: 860},
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]});
  await libs(ctx);
  await ctx.addInitScript(() => { if (navigator.serviceWorker) navigator.serviceWorker.register = () => new Promise(() => {}); });      // (the app's offline copy would fetch its libraries itself, past this test's local copies)
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::|favicon|404/.test(m.text())) errors.push('console: ' + m.text()); }); };
  ctx.on('page', watch);
  // PDFs reach an extension only from Chrome 151 (mime_types_handler): an older Chrome (such as Playwright's own) skips this test
  const ver = +(ctx.browser()?.version() || (await (await ctx.newPage()).evaluate(() => navigator.userAgent)).match(/Chrome\/(\d+)/)?.[1] || 0);
  if (ver && ver < 151) { console.log(`skipped: Chrome ${ver} can't hand PDFs to an extension; run with CHROME_PATH set to Chrome 151 or newer`); await ctx.close(); srv.close(); app.close(); return; }
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  ok(/^[a-p]{32}$/.test(id), 'the extension loads (' + id + ')');
  const set = o => sw.evaluate(o => chrome.storage.sync.set(o), o);
  await set({app: APP});
  const viewer = p => p.frames().find(f => f.url().startsWith(`chrome-extension://${id}/viewer.html`));
  // a file has arrived when its name heads the notebook on screen and the app says it opened it
  const head = p => p.evaluate(() => [...document.querySelectorAll('#main .file-head')].map(h => h.textContent).join('|'));
  const arrived = (p, name, t = 30000) => p.waitForFunction(n => [...document.querySelectorAll('#main .file-head')].some(h => h.textContent === n.replace(/\.[^.]+$/, '')) && (document.querySelector('#toast')?.textContent || '').includes('Opened “' + n + '”'), name, {timeout: t}).then(() => true, () => false);
  const cards = (p, n) => p.waitForFunction(n => document.querySelectorAll('#main .pagecard').length >= n, n, {timeout: 60000});
  const toastHas = (p, t) => p.waitForFunction(t => (document.querySelector('#toast')?.textContent || '').includes(t), t, {timeout: 20000}).then(() => true, () => false);

  // ---- a PDF opened in the browser, with Between the Lines not open yet: that tab becomes the app, with the PDF in it ----
  const t1 = await ctx.newPage();
  await t1.goto(base + '/docs/lecture.pdf').catch(() => {});
  await t1.waitForURL(APP + '*', {timeout: 20000});
  ok(t1.url().startsWith(APP), 'opening a PDF turns its tab into Between the Lines');
  await cards(t1, 6);
  ok(await t1.evaluate(() => document.querySelectorAll('#main .pagecard').length) === 6, 'with the PDF’s six pages in it, ready for notes');
  ok(await toastHas(t1, 'Opened “lecture.pdf” from 127.0.0.1'), 'it says where the PDF came from');
  ok(await t1.evaluate(() => document.documentElement.dataset.btlExt) === JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).version, 'the app can tell the extension is installed (and which version), so it doesn’t suggest it');

  // ---- Between the Lines already open: the next PDF goes into that tab, and the PDF's tab goes back to where it was ----
  const t2 = await ctx.newPage();
  await t2.goto(base + '/docs/page.html');
  await t2.click('#pdf').catch(() => {});
  ok(await arrived(t1, 'lecture.pdf'), 'the next PDF opens in the Between the Lines tab already open');
  ok(await t1.waitForFunction(() => docs.filter(d => d.pages).length >= 2, null, {timeout: 15000}).then(() => true, () => false), '… as a notebook of its own, next to the first');
  await t2.waitForURL(base + '/docs/page.html', {timeout: 10000}).catch(() => {});
  ok(t2.isClosed() || t2.url() === base + '/docs/page.html', 'and its own tab goes back to the page it was opened from (' + (t2.isClosed() ? 'closed' : t2.url()) + ')');
  ok(ctx.pages().filter(p => !p.isClosed() && p.url().startsWith(APP)).length === 1, 'only one Between the Lines tab');

  // ---- the file's name comes from the server when it gives one ----
  const t3 = await ctx.newPage(); await t3.goto(base + '/docs/get').catch(() => {});
  const nm = await toastHas(t1, 'Opened “Week 3 – Markets.pdf”');
  ok(nm, 'a PDF from a download address keeps the name the server gives it' + (nm ? '' : ' (' + await t1.evaluate(() => document.querySelector('#toast').textContent + ' | ' + docs.map(d => d.name).join(', ')) + ')'));

  // ---- Keep the browser's own viewer ----
  await set({pdf: 'chrome'}); await t1.evaluate(() => toast('—'));
  const t4 = await ctx.newPage(); await t4.goto(base + '/docs/portrait.pdf').catch(() => {}); await t4.waitForTimeout(2500);
  ok(t4.url() === base + '/docs/portrait.pdf' && !viewer(t4) && !(await arrived(t1, 'portrait.pdf', 500)), '“Keep the browser’s own viewer”: the PDF stays in Chrome’s viewer');
  await t4.close();

  // ---- Ask me each time ----
  await set({pdf: 'ask'});
  const t5 = await ctx.newPage(); await t5.goto(base + '/docs/portrait.pdf').catch(() => {});
  await t5.waitForFunction(() => true); for (let i = 0; i < 40 && !viewer(t5); i++) await t5.waitForTimeout(100);
  let v = viewer(t5); await v.waitForSelector('#open:visible');
  ok((await v.textContent('#name')) === 'portrait.pdf' && (await v.textContent('#from')) === 'from 127.0.0.1', '“Ask me each time”: it shows the file’s name and where it is from');
  ok(await v.isVisible('#native') && await v.isVisible('#remember'), '… with Open in Between the Lines, View in Chrome, and Remember my choice');
  await v.click('#native'); await t5.waitForTimeout(1500);
  ok(!viewer(t5) && t5.url() === base + '/docs/portrait.pdf' && !(await arrived(t1, 'portrait.pdf', 500)), 'View in Chrome hands the PDF back to Chrome’s viewer');
  await t5.close();
  const t6 = await ctx.newPage(); await t6.goto(base + '/docs/portrait.pdf').catch(() => {});
  for (let i = 0; i < 40 && !viewer(t6); i++) await t6.waitForTimeout(100);
  v = viewer(t6); await v.waitForSelector('#open:visible'); await v.check('#remember'); await v.click('#open');
  ok(await arrived(t1, 'portrait.pdf'), 'Open in Between the Lines opens it there');
  ok(await sw.evaluate(() => chrome.storage.sync.get('pdf').then(s => s.pdf)) === 'open', '… and Remember my choice makes that the setting');

  // ---- View in the browser's viewer (from the pop-up): that one time, Chrome's viewer ----
  await t1.evaluate(() => toast('—'));
  await sw.evaluate(u => chrome.storage.session.set({skip: u}), base + '/docs/lecture.pdf');
  const t7 = await ctx.newPage(); await t7.goto(base + '/docs/lecture.pdf').catch(() => {}); await t7.waitForTimeout(2000);
  ok(t7.url() === base + '/docs/lecture.pdf' && !(await arrived(t1, 'lecture.pdf', 500)), '“View in the browser’s viewer” shows that PDF in Chrome, just that once');
  ok(!(await sw.evaluate(() => chrome.storage.session.get('skip').then(s => s.skip))), '… and is used up');
  await t7.close();

  // ---- right-click a link (and the toolbar button): fetched again and handed over; Word and PowerPoint too ----
  ok(await sw.evaluate(u => openUrl(u, null), base + '/docs/reading.docx') === 'ok', 'Open link in Between the Lines: a Word file');
  ok(await arrived(t1, 'reading.docx'), '… opens as a notebook (its type found from its name)');
  ok(await sw.evaluate(u => openUrl(u, null), base + '/docs/page.html') === 'not-a-document', 'a link to a web page is turned down');
  ok(await sw.evaluate(u => openUrl(u, null), base + '/docs/missing.pdf') === 'failed', 'and a link that fails says so');

  // ---- a big PDF goes over in pieces ----
  await set({chunk: 9000});
  const t8 = await ctx.newPage(); await t8.goto(base + '/docs/get').catch(() => {});
  ok(await arrived(t1, 'Week 3 – Markets.pdf', 60000), 'a PDF sent in many small pieces arrives'); await cards(t1, 10);
  ok(await t1.evaluate(() => document.querySelectorAll('#main .pagecard').length) >= 10, '… whole (all its pages; ' + Math.ceil(fs.statSync(path.join(__dirname, 'long.pdf')).size / 6750) + ' pieces)');
  await set({chunk: 8 << 20});

  // ---- downloads: offered with a notification, or opened straight away ----
  await t1.evaluate(() => toast('—'));
  const t9 = await ctx.newPage(); await t9.goto(base + '/docs/page.html');
  const [d1] = await Promise.all([t9.waitForEvent('download'), t9.click('#dl')]); await d1.path();
  let offer = []; for (let i = 0; i < 50 && !offer.length; i++) { await t9.waitForTimeout(100); offer = Object.entries(await sw.evaluate(() => chrome.storage.session.get(null))).filter(([k]) => /^dl\d+$/.test(k)); }
  ok(offer.length === 1 && /\.pptx$/.test(offer[0][1].label) && !(await arrived(t1, 'week2.pptx', 500)), 'a downloaded PowerPoint is offered (a notification, and in the pop-up), not opened unasked');
  const pop0 = await ctx.newPage(); await pop0.goto(`chrome-extension://${id}/popup.html`);
  ok((await pop0.textContent('#offers')).includes('Open the download “' + offer[0][1].label + '”'), 'the pop-up lists it');
  await pop0.click('#offers button').catch(() => {});
  ok(await arrived(t1, 'week2.pptx'), 'choosing it opens the PowerPoint in Between the Lines');
  await set({downloads: 'open'}); await t1.evaluate(() => toast('—'));
  const [d2] = await Promise.all([t9.waitForEvent('download'), t9.click('#dl')]); await d2.path();
  ok(await arrived(t1, 'week2.pptx'), '“Open them straight away”: the next download opens by itself');
  await set({downloads: 'off'}); await t1.evaluate(() => toast('—'));
  const [d3] = await Promise.all([t9.waitForEvent('download'), t9.click('#dl')]); await d3.path(); await t9.waitForTimeout(1500);
  ok(!(await arrived(t1, 'week2.pptx', 1000)), '“Leave them be”: downloads are left alone');

  // ---- the pop-up ----
  const pop = await ctx.newPage(); await pop.goto(`chrome-extension://${id}/popup.html`);
  ok(await pop.isChecked('input[name=pdf][value=open]') && await pop.isChecked('input[name=downloads][value=off]'), 'the pop-up shows the settings');
  await pop.check('input[name=pdf][value=ask]'); await pop.waitForTimeout(200);
  ok(await sw.evaluate(() => chrome.storage.sync.get('pdf').then(s => s.pdf)) === 'ask', '… and changes them');
  ok((await pop.textContent('#viewLast')).includes('portrait.pdf') || (await pop.textContent('#viewLast')).includes('.pdf'), 'it offers to view the last PDF in the browser’s viewer');
  ok(await pop.isHidden('#old'), 'no “older browser” note in Chrome ' + (await pop.evaluate(() => navigator.userAgent.match(/Chrome\/(\d+)/)[1])));
  await pop.screenshot({path: path.join(__dirname, 'shots', 'extension-popup.png')});

  await ctx.close(); srv.close(); app.close(); fs.rmSync(prof, {recursive: true, force: true});
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });

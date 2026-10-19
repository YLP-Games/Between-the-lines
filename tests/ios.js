// iPad and iPhone in Safari: the Add to Home Screen card, Install as an app, the iPad layout, Safari's quirks, two-finger undo and older Safari
const {open} = require('./harness');
const {touch, UA: IPAD_OLD} = require('./ipad');
const http = require('http'), path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const APP = process.env.APP || path.join(ROOT, 'index.html');
const OUT = path.join(__dirname, 'shots');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
// iPadOS 13 and later reports itself as a Mac; only the touch points give it away
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const CRIOS = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.111 Mobile/15E148 Safari/604.1';
const TYPES = {html: 'text/html', js: 'text/javascript', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml', pdf: 'application/pdf'};
const PNG = f => { const b = fs.readFileSync(f); return {w: b.readUInt32BE(16), h: b.readUInt32BE(20), png: b.slice(1, 4).toString() === 'PNG'}; };

(async () => {
  // the app served over http, as on the web (a file opened from disk can't be installed)
  const appDir = path.dirname(APP);
  const server = http.createServer((q, r) => {
    const f = path.join(appDir, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(appDir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, {'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const URL = `http://127.0.0.1:${server.address().port}/index.html`;
  const allErrors = [];
  // a device: user agent, size, touch; init scripts run before the app (to pretend to be standalone, or an older Safari)
  async function device({ua, width = 1024, height = 1366, touchPts = 5, web = true, init = [], storage} = {}){
    const r = await open(APP, {width, height, storage, contextOptions: {hasTouch: touchPts > 0, isMobile: false, deviceScaleFactor: 2, serviceWorkers: 'block', ...(ua ? {userAgent: ua} : {})}});
    allErrors.push(r.errors);
    if (touchPts > 0) await r.context.addInitScript(n => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', {get: () => n, configurable: true}), touchPts);
    for (const s of init) await r.context.addInitScript(s);
    if (web) await r.page.goto(URL); else await r.page.reload();
    await r.page.waitForTimeout(400);
    r.cdp = await r.context.newCDPSession(r.page);
    return r;
  }
  const card = p => p.locator('#a2hs:not([hidden])');
  const waitCard = async p => { await p.waitForTimeout(3300); return card(p).count(); };
  const store = p => p.evaluate(() => JSON.parse(localStorage.getItem('a2hs') || 'null'));

  // ---- what iOS needs to put it on the Home Screen ----
  const html = fs.readFileSync(APP, 'utf8'), sw = fs.readFileSync(path.join(appDir, 'sw.js'), 'utf8'), man = JSON.parse(fs.readFileSync(path.join(appDir, 'manifest.webmanifest'), 'utf8'));
  const ic = PNG(path.join(appDir, 'icons/apple-touch-icon.png'));
  ok(ic.png && ic.w === 180 && ic.h === 180, 'icons/apple-touch-icon.png is a 180 x 180 PNG');
  ok(/<link rel="apple-touch-icon" sizes="180x180" href="icons\/apple-touch-icon.png">/.test(html), 'the page names it as its apple-touch-icon');
  ok(['apple-mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style', 'apple-mobile-web-app-title', 'theme-color'].every(n => html.includes(`name="${n}"`)) && /viewport-fit=cover/.test(html), 'with the apple-mobile-web-app tags, a theme colour and viewport-fit=cover');
  ok(man.display === 'standalone' && man.icons.some(i => i.src === 'icons/apple-touch-icon.png') && man.start_url && man.name === 'Between the Lines', 'the manifest: standalone, with the icon');
  ok(/const CACHE = 'bts-v4'/.test(sw) && sw.includes("'./icons/apple-touch-icon.png'"), 'the service worker keeps the icon offline, under a new cache name (bts-v4)');

  // ---- iPad, Safari, on the web: the card comes by itself ----
  let d = await device({ua: IPAD});
  let {page} = d;
  ok(await page.evaluate(() => navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent) && matchMedia('(pointer: coarse)').matches), '(an iPad: it says it is a Mac, with a touch screen)');
  ok(/maximum-scale=1/.test(await page.getAttribute('meta[name=viewport]', 'content')), 'on iOS the page does not zoom in when a box or note with small text is focused');
  ok(await waitCard(page) === 1, 'Safari on an iPad shows the Add to Home Screen card by itself');
  const ct = await card(page).innerText();
  ok(/Add it to your Home Screen/.test(ct) && /full screen like an app/.test(ct) && /works offline/.test(ct), 'it says what for: full screen like an app, and offline');
  ok(/Tap Share/.test(ct) && /top right of Safari/.test(ct) && /Add to Home Screen/.test(ct) && /Tap Add/.test(ct), 'and how: Share (at the top right on an iPad), Add to Home Screen, Add');
  ok(await card(page).locator('use[href="#i-share"]').count() === 1 && await card(page).locator('use[href="#i-add-square"]').count() === 1 && await page.locator('#i-share path').count() > 0, 'the Share icon is drawn in the steps, as Safari shows it');
  const cb = await card(page).boundingBox(), ab = await page.locator('#appbar').boundingBox();
  ok(cb.x + cb.width > 1024 - 40 && cb.y >= ab.y + ab.height && cb.width <= 360, 'a small card at the top right, under the toolbar (near Safari\'s Share button)');
  ok(await page.evaluate(() => !document.activeElement || !document.activeElement.closest('#a2hs')), 'it does not take the keyboard focus');
  ok(await page.evaluate(() => !document.querySelector('#installBtn').hidden), 'the sidebar has Install as an app');
  await page.screenshot({path: path.join(OUT, 'ios-1-card-ipad.png')});
  const nn = await card(page).getByText('Not now').boundingBox();
  await page.touchscreen.tap(nn.x + nn.width / 2, nn.y + nn.height / 2); await page.waitForTimeout(300);
  ok(await card(page).count() === 0 && (await store(page)).no === 1, 'Not now closes it, and it is remembered');
  await page.reload(); ok(await waitCard(page) === 0, 'so it does not come back at the next visit');
  await page.evaluate(() => { const k = JSON.parse(localStorage.a2hs); k.at -= 15 * 864e5; localStorage.a2hs = JSON.stringify(k); });
  await page.reload(); ok(await waitCard(page) === 1, 'two weeks on, it shows once more');
  await page.click('#a2hs .a2-head .btn'); await page.waitForTimeout(200);
  ok(await card(page).count() === 0 && (await store(page)).no === 2, 'closed with its ×');
  await page.evaluate(() => { const k = JSON.parse(localStorage.a2hs); k.at -= 60 * 864e5; localStorage.a2hs = JSON.stringify(k); });
  await page.reload(); ok(await waitCard(page) === 0, 'closed twice, it never shows by itself again');
  // Help & settings: Install as an app shows the same steps whenever you like
  await page.click('#helpBtn'); await page.waitForTimeout(200);
  ok(await page.locator('#installSec h3').innerText() === 'Install as an app', 'Help & settings has "Install as an app"');
  await page.click('#installHow'); await page.waitForTimeout(250);
  ok(await card(page).count() === 1 && await page.locator('#settings').isHidden() && /Add to Home Screen/.test(await card(page).innerText()), 'its How to install shows the steps (Help closes to make room)');
  ok(await page.evaluate(() => document.activeElement?.textContent === 'Got it') && await card(page).getByText('Not now').count() === 0, 'with Got it focused');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(await card(page).count() === 0 && (await store(page)).no === 2, 'Esc closes it (asked for, so it does not count as a no)');
  await page.locator('#installBtn').evaluate(b => b.click()); await page.waitForTimeout(200);
  ok(await card(page).count() === 1, 'Install as an app in the sidebar shows it too');
  await page.click('#a2hs .a2-act .primary');
  // Show tips off: no card by itself
  await page.evaluate(() => { localStorage.removeItem('a2hs'); localStorage.setItem('tips', '0'); });
  await page.reload(); ok(await waitCard(page) === 0, 'with Show tips off it does not show by itself');
  await d.browser.close();

  // ---- already on the Home Screen: nothing to say ----
  d = await device({ua: IPAD, init: [() => Object.defineProperty(Navigator.prototype, 'standalone', {get: () => true})]}); page = d.page;
  ok(await waitCard(page) === 0 && await page.evaluate(() => document.querySelector('#installBtn').hidden), 'opened from the Home Screen: no card, no install button');
  await page.click('#helpBtn'); await page.click('#installHow'); await page.waitForTimeout(250);
  ok(await card(page).count() === 0 && /already open as an app/.test(await page.textContent('#toast')), 'and How to install says it is already an app');
  await d.browser.close();

  // ---- iPhone: Share is at the bottom of Safari, so the card is too ----
  d = await device({ua: IPHONE, width: 390, height: 844}); page = d.page;
  ok(await waitCard(page) === 1 && await card(page).evaluate(c => c.classList.contains('low')) && /bottom of Safari/.test(await card(page).innerText()), 'on an iPhone the card sits at the bottom, and says Share is at the bottom');
  const pb = await card(page).boundingBox();
  ok(pb.x >= 0 && pb.x + pb.width <= 390 && pb.y + pb.height <= 844 - 44, 'inside the screen, above the status bar');
  ok(await page.evaluate(() => [...document.querySelectorAll('.titlebar .btn')].filter(b => b.offsetParent).every(b => b.getBoundingClientRect().right <= innerWidth + .5)), 'the phone\'s title bar still fits');
  await page.screenshot({path: path.join(OUT, 'ios-2-card-iphone.png')});
  await d.browser.close();

  // ---- Chrome on an iPad: no card by itself (it may not offer Add to Home Screen), but Help explains ----
  d = await device({ua: CRIOS}); page = d.page;
  ok(await waitCard(page) === 0, 'Chrome on an iPad: no card by itself');
  await page.click('#helpBtn'); await page.click('#installHow'); await page.waitForTimeout(250);
  ok(/in Chrome it is in the address bar/.test(await card(page).innerText()) && /Open this page in Safari/.test(await card(page).innerText()), 'How to install: Share in the address bar, or open it in Safari');
  await d.browser.close();

  // ---- a computer: Chrome's own install prompt when it offers one; else the steps for the browser ----
  d = await device({touchPts: 0, width: 1440, height: 900}); page = d.page;
  ok(!/maximum-scale/.test(await page.getAttribute('meta[name=viewport]', 'content')), 'elsewhere the viewport is left alone (pinch zoom stays on Android)');
  ok(await waitCard(page) === 0 && await page.evaluate(() => document.querySelector('#installBtn').hidden), 'Chrome on a computer: no card, and no sidebar button until Chrome offers to install');
  await page.click('#helpBtn'); await page.click('#installHow'); await page.waitForTimeout(250);
  ok(/Install Between the Lines/.test(await card(page).innerText()) && /own window/.test(await card(page).innerText()) && /Chrome’s menu/.test(await card(page).innerText()), 'How to install gives Chrome\'s steps');
  await page.click('#a2hs .a2-act .primary');
  await page.evaluate(() => { const e = new Event('beforeinstallprompt', {cancelable: true}); e.prompt = () => { window.__prompted = (window.__prompted || 0) + 1; }; e.userChoice = Promise.resolve({outcome: 'accepted'}); dispatchEvent(e); });
  ok(await page.evaluate(() => !document.querySelector('#installBtn').hidden), 'when Chrome offers to install, the sidebar shows Install as an app');
  await page.click('#helpBtn'); await page.click('#installHow'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => window.__prompted) === 1 && await card(page).count() === 0, 'and How to install opens Chrome\'s own install prompt');
  await page.keyboard.press('Control+k'); await page.waitForTimeout(200); await page.keyboard.type('install'); await page.waitForTimeout(200);
  ok(/Install as an app/.test(await page.locator('.cmdk').innerText()), 'Ctrl+K finds "Install as an app"');
  await page.keyboard.press('Escape');
  await d.browser.close();
  d = await device({touchPts: 0, width: 1440, height: 900, web: false}); page = d.page;
  await page.click('#helpBtn'); await page.click('#installHow'); await page.waitForTimeout(250);
  ok(/opened from a file/.test(await card(page).innerText()), 'a copy opened from a file says to open it from its web address to install it');
  ok(await page.evaluate(() => getComputedStyle(document.body, '::after').display !== 'none'), 'with a mouse the paper grain is still there');
  await d.browser.close();

  // ---- the iPad layout ----
  d = await device({ua: IPAD_OLD, web: false}); page = d.page;
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 3, null, {timeout: 60000}); await page.waitForTimeout(800);
  const mainW = () => page.evaluate(() => Math.round(document.querySelector('#main').getBoundingClientRect().width));
  const tapEl = async sel => { const q = await page.locator(sel).first().boundingBox(); await page.touchscreen.tap(q.x + q.width / 2, q.y + q.height / 2); await page.waitForTimeout(400); };
  const w0 = await mainW();
  await tapEl('#pagesBtn');
  ok(!(await page.locator('#pagesPanel').isHidden()) && await mainW() === w0 && !(await page.locator('#scrim').isHidden()), 'upright (1024 x 1366) the sidebar opens over the pages: they keep their width (' + w0 + 'px)');
  await page.screenshot({path: path.join(OUT, 'ios-3-drawer.png')});
  await page.touchscreen.tap(900, 900); await page.waitForTimeout(400);
  ok(await page.locator('#pagesPanel').isHidden() && await page.locator('#scrim').isHidden(), 'a tap outside closes it');
  await tapEl('#notesBtn');
  ok(!(await page.locator('#notesPanel').isHidden()) && await mainW() === w0, 'the Notes list too');
  await page.touchscreen.tap(200, 900); await page.waitForTimeout(400);
  ok(await page.locator('#notesPanel').isHidden(), '(closed with a tap outside)');
  await page.setViewportSize({width: 1366, height: 1024}); await page.waitForTimeout(900);
  if (await page.locator('#pagesPanel').isHidden()) await tapEl('#pagesBtn');
  ok(!(await page.locator('#pagesPanel').isHidden()) && await page.locator('#scrim').isHidden() && await mainW() < 1366 - 200, 'turned sideways (1366 x 1024) the sidebar sits beside the pages again');
  await page.setViewportSize({width: 820, height: 1180}); await page.waitForTimeout(900);
  ok(await page.locator('#pagesPanel').isHidden(), 'and at 820 x 1180 it is a drawer, closed to start with');
  await page.setViewportSize({width: 1024, height: 1366}); await page.waitForTimeout(900);
  // 44px targets for the toolbar and menus
  const small = sel => page.evaluate(sel => [...document.querySelectorAll(sel)].filter(e => e.offsetParent && getComputedStyle(e).visibility !== 'hidden').map(e => { const q = e.getBoundingClientRect(); return [e.id || e.className || e.textContent.trim().slice(0, 20), Math.round(q.width), Math.round(q.height)]; }).filter(([, w, h]) => Math.min(w, h) < 43.5), sel);
  let bad = [];
  for (const tab of ['home', 'insert', 'box', 'view']) { await tapEl('#tab-' + tab); bad.push(...await small('.titlebar .btn, .tab, .panel .btn, .panel select, .panel .sw, .statusbar .btn:not(#notesToggle)')); }
  await tapEl('#save'); bad.push(...await small('#saveMenu button')); await page.keyboard.press('Escape'); await page.touchscreen.tap(900, 900); await page.waitForTimeout(300);
  ok(bad.length === 0, 'toolbar buttons, tabs, the status bar and menu entries are 44px or more by touch' + (bad.length ? ' ' + JSON.stringify(bad.slice(0, 8)) : ''));
  const ph = await page.evaluate(() => { const p = document.querySelector('.panel:not([hidden])'), g = [...p.querySelectorAll('.grp')]; return g.every(x => x.scrollHeight <= x.clientHeight + 1) && [...p.querySelectorAll('.cap')].every(c => c.getBoundingClientRect().bottom <= p.getBoundingClientRect().bottom); });
  ok(ph, 'the ribbon is tall enough for its 44px buttons and captions');
  // no text box Safari would zoom in on
  const tiny = await page.evaluate(() => [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=hidden]), select, textarea')]
    .map(e => [e.id || e.className || e.name, parseFloat(getComputedStyle(e).fontSize)]).filter(([, f]) => f < 16));
  ok(tiny.length === 0, 'every text box and list is 16px or more by touch, so Safari does not zoom in on it' + (tiny.length ? ' ' + JSON.stringify(tiny) : ''));
  // lighter for Safari: no paper grain, no grey tap flash, no double-tap zoom on buttons
  ok(await page.evaluate(() => getComputedStyle(document.body, '::after').display === 'none'), 'no paper-grain layer over the screen by touch');
  ok(await page.evaluate(() => getComputedStyle(document.documentElement).webkitTapHighlightColor === 'rgba(0, 0, 0, 0)'), 'no grey flash over what you tap');
  ok(await page.evaluate(() => ['#undoBtn', '#tab-home', '#pagesBtn', '#helpBtn'].every(s => getComputedStyle(document.querySelector(s)).touchAction === 'manipulation') && getComputedStyle(document.querySelector('#bDiv')).touchAction === 'none'), 'a quick second tap on a button is not a zoom (and a handle you drag still takes the finger)');
  // nothing on the whole page holds up scrolling: a touchmove listener that can cancel it is only on the sidebar
  const {result: docObj} = await d.cdp.send('Runtime.evaluate', {expression: 'document'}), {result: winObj} = await d.cdp.send('Runtime.evaluate', {expression: 'window'});
  const ls = [...(await d.cdp.send('DOMDebugger.getEventListeners', {objectId: docObj.objectId})).listeners, ...(await d.cdp.send('DOMDebugger.getEventListeners', {objectId: winObj.objectId})).listeners];
  ok(ls.filter(l => l.type === 'touchmove').every(l => l.passive) && ls.some(l => l.type === 'touchstart' && l.passive), 'no touchmove listener on the whole page can hold up scrolling');
  // a tapped button does not stay lit
  const lit = sel => page.evaluate(sel => getComputedStyle(document.querySelector(sel)).backgroundColor, sel);
  await tapEl('#tab-home');
  await tapEl('[data-cmd="removeFormat"]'); await page.waitForTimeout(300);
  ok(await lit('[data-cmd="removeFormat"]') === await lit('[data-cmd="indent"]'), 'a tapped button does not stay lit in its hover colour');
  // a favourite colour works on the first tap (no × popping up under the finger instead)
  await page.evaluate(() => { favs = ['#7b1fa2']; storeFavs(); });
  if (await page.isVisible('#colorBtn')) await tapEl('#colorBtn');      // (an upright iPad keeps the colours in a pop-up under one button)
  await tapEl('#favText .sw');
  ok(await page.evaluate(() => document.querySelector('#color').value.toLowerCase() === '#7b1fa2' && getComputedStyle(document.querySelector('#favText .favx')).opacity === '0'), 'a favourite colour is picked on the first tap, and its × stays out of the way');
  await d.browser.close();

  // ---- two fingers tapped on the page: Back one step ----
  d = await device({ua: IPAD_OLD, web: false}); page = d.page;
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 3, null, {timeout: 60000}); await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelectorAll('.pagecard')[1].scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(300);
  const sb = await page.locator('.pagecard').nth(1).locator('.strip').first().boundingBox();
  await page.touchscreen.tap(sb.x + 300, sb.y + sb.height * .45); await page.waitForTimeout(400);
  const gp = await page.locator('.gappill').boundingBox();
  await page.touchscreen.tap(gp.x + gp.width / 2, gp.y + gp.height / 2); await page.waitForTimeout(400);
  await page.keyboard.type('Two finger test'); await page.waitForTimeout(300);
  await page.touchscreen.tap(1000, 300); await page.waitForTimeout(900);
  const hi = () => page.evaluate(() => hist.i), notes = () => page.evaluate(() => [...document.querySelectorAll('.notebox .mine')].map(m => m.textContent).join('|'));
  const h0 = await hi(), n0 = await notes();
  ok(h0 > 0 && /Two finger test/.test(n0), 'a note written on the iPad');
  const cx = 500, cy = await page.evaluate(() => Math.round(document.querySelector('.notebox').getBoundingClientRect().top)) - 18, cdp = d.cdp, T = ms => page.waitForTimeout(ms);      // (on the page, 18px above the note, whatever the toolbar's height)
  const two = async ({gap = 30, hold = 60, move = 0} = {}) => {
    await touch(cdp, 'touchStart', [[cx, cy, 1]]); await T(gap);
    await touch(cdp, 'touchStart', [[cx, cy, 1], [cx + 120, cy + 20, 2]]); await T(hold / 2);
    if (move) await touch(cdp, 'touchMove', [[cx - move, cy, 1], [cx + 120 + move, cy + 20, 2]]);
    await T(hold / 2); await touch(cdp, 'touchEnd', []); await T(500);
  };
  await two({move: 40});
  ok(await hi() === h0 && await notes() === n0, 'a pinch (two fingers moving apart) is not an undo');
  await two({hold: 600});
  ok(await hi() === h0 && await notes() === n0, 'nor are two fingers held down');
  await two({gap: 300});
  ok(await hi() === h0, 'nor a second finger that comes much later');
  await page.touchscreen.tap(cx, cy); await T(400);
  ok(await hi() === h0, 'nor a one-finger tap');
  await two();
  ok(await hi() === h0 - 1 && await notes() !== n0 && /Back one step/.test(await page.textContent('#toast')), 'a quick two-finger tap on the page goes Back one step (' + JSON.stringify(n0) + ' to ' + JSON.stringify(await notes()) + ')');
  await touch(cdp, 'touchStart', [[cx, cy, 1], [cx + 120, cy + 20, 2]]); await T(60); await touch(cdp, 'touchEnd', []); await T(500);
  ok(await hi() === h0 - 2, 'also when both fingers land at the same moment');
  await d.browser.close();

  // ---- Safari 15.0 to 15.3: no .at() and no structuredClone; the app still starts and opens a PDF ----
  d = await device({ua: IPAD_OLD, web: false, init: [() => { delete Array.prototype.at; delete String.prototype.at; delete Object.getPrototypeOf(Int8Array).prototype.at; delete window.structuredClone; }]}); page = d.page;
  ok(await page.evaluate(() => /Math\.trunc/.test(String(Array.prototype.at)) && /seen/.test(String(structuredClone)) && [1, 2, 3].at(-1) === 3 && 'abc'.at(-2) === 'b' && new Uint8Array([4, 5]).at(-1) === 5), 'the page adds .at() and structuredClone when the browser has none');
  ok(await page.evaluate(() => { const b = new Uint8Array([1, 2, 3]), o = {a: [b, new Map([['k', {x: 1}]])], d: new Date(5)}, c = structuredClone(o); c.a[0][0] = 9; return b[0] === 1 && c.a[1].get('k').x === 1 && c.d.getTime() === 5 && structuredClone({b}, {transfer: [b.buffer]}).b === b; }), 'its structuredClone copies typed arrays, maps and dates, and hands transferred buffers over');
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 3, null, {timeout: 60000}).catch(() => {});
  ok(await page.locator('.pagecard').count() >= 3, 'a PDF opens without them (pdf.js uses both)');
  // the fallbacks for Safari before 15.4 (dvh) and 16.2 (color-mix) are there
  const sup = await page.evaluate(() => [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch { return []; } }).filter(r => r instanceof CSSSupportsRule).map(r => [r.conditionText, [...r.cssRules].map(x => x.cssText).join(' ')]));
  ok(sup.some(([c, t]) => /not \(height: ?100dvh\)/.test(c) && /\.settings/.test(t) && /100vh/.test(t)), 'without dvh, the panels and dialogs use the window height');
  ok(sup.some(([c, t]) => /not \(color: ?color-mix/.test(c) && /tab\[aria-selected="true"\]::after/.test(t) && /wtable td/.test(t)), 'without color-mix(), the chosen tab and table borders get plain colours');
  await d.browser.close();

  server.close();
  const errs = allErrors.flat();
  console.log(errs.length ? errs : 'no page errors');
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });

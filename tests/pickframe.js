// Google's file picker is framed in the window: centred, sized to fit, sharp, no paper grain over it, page still behind. Google is mocked.
const {open} = require('./harness');
const {GSI, GAPI} = require('./drivemock');
const path = require('path'); const fs = require('fs');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const src = fs.readFileSync(APP, 'utf8');
const CONF = path.join(__dirname, 'index.pickframe.html');
fs.writeFileSync(CONF, src.replace(/const GDRIVE = \{[^}]*\};/, () => "const GDRIVE = {clientId: '123456789-abc.apps.googleusercontent.com', apiKey: 'KEY123'};"));
const CORS = {'access-control-allow-origin': '*'};
const frame = p => p.evaluate(() => { const d = document.querySelector('.picker-dialog'), b = document.querySelector('.picker-dialog-bg'); if (!d) return null; const r = d.getBoundingClientRect(), br = b.getBoundingClientRect();
  return {x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, bg: [br.x, br.y, br.width, br.height], grain: getComputedStyle(document.body, '::after').display, over: getComputedStyle(document.body).overflow, cls: document.body.classList.contains('gpicker')}; });
(async () => {
  for (const [W, H, scroll] of [[1440, 900, false], [1280, 640, true], [390, 760, false]]) {
    const {browser, context, page, errors} = await open(CONF, {width: W, height: H});
    await context.route(/accounts\.google\.com\/gsi\/client/, r => r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: GSI}));
    await context.route(/apis\.google\.com\/js\/api\.js/, r => r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: GAPI}));
    await context.route(/www\.googleapis\.com\//, r => r.fulfill({status: 200, contentType: 'application/json', headers: CORS, body: '{"user":{"displayName":"Ada","emailAddress":"ada@example.com"}}'}));
    await page.waitForTimeout(800);
    if (scroll) {
      await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
      await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
      await page.evaluate(() => scrollTo(0, 2500)); await page.waitForTimeout(300);
    }
    await page.evaluate(() => { window.__pickerStay = true; });
    const opener = scroll ? null : '.welcome [data-drive-open]';
    if (opener) { await page.hover(opener); await page.click(opener); }
    else { await page.evaluate(() => (document.querySelector('[data-drive-open]:not(.welcome *)') || document.querySelector('[data-drive-open]')).click()); }
    await page.waitForSelector('.picker-dialog', {timeout: 10000}); await page.waitForTimeout(200);
    const sy = await page.evaluate(() => scrollY);
    let f = await frame(page);
    const tag = `${W}×${H}${scroll ? ', scrolled down a notebook' : ''}`;
    ok(f.w <= W - 16 && f.h <= H - 16, `${tag}: the picker fits in the window (${f.w}×${f.h})`);
    ok(Math.abs(f.x - (W - f.w) / 2) <= 1 && Math.abs(f.y - (H - f.h) / 2) <= 1, `${tag}: it is centred in the window (${f.x},${f.y})`);
    ok(Number.isInteger(f.x) && Number.isInteger(f.y), `${tag}: on whole pixels, so it stays sharp`);
    ok(f.bg[0] === 0 && f.bg[1] === 0 && f.bg[2] === W && f.bg[3] === H, `${tag}: the backdrop covers exactly the window`);
    ok(f.grain === 'none' && f.over === 'hidden', `${tag}: no paper grain over it, and the page behind doesn't scroll`);
    await page.screenshot({path: path.join(__dirname, 'shots', `pickframe-${W}.png`)});
    if (W === 1440) {
      await page.setViewportSize({width: 1100, height: 700}); await page.waitForTimeout(200);
      f = await frame(page);
      ok(Math.abs(f.x - (1100 - f.w) / 2) <= 1 && Math.abs(f.y - (700 - f.h) / 2) <= 1, 'resizing the window keeps it centred');
    }
    await page.evaluate(() => window.__pickerFinish({action: 'cancel'})); await page.waitForTimeout(200);
    f = await frame(page);
    ok(f === null && await page.evaluate(() => !document.body.classList.contains('gpicker') && getComputedStyle(document.body, '::after').display !== 'none'), `${tag}: closing it brings the grain back and the page scrolls again`);
    ok(await page.evaluate(() => scrollY) === sy, `${tag}: the page stays where it was`);
    await browser.close();
    const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
    if (errs.length) { console.log('ERRORS:\n' + errs.join('\n')); process.exit(1); }
  }
  console.log('no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

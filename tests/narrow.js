// The page must never scroll sideways on a phone: at 320 and 390px wide, in every main view, nothing is wider than the screen
const {open} = require('./harness'); const path = require('path');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
// the page's width, and any floating menu or dialog that sticks out of the screen
const wide = () => {
  const out = [...document.querySelectorAll('.pop, .menu, dialog, [role=dialog], [role=listbox]')].filter(e => e.offsetParent || getComputedStyle(e).position === 'fixed').map(e => ({e, r: e.getBoundingClientRect()})).filter(x => x.r.width && (x.r.right > innerWidth + 1 || x.r.left < -1));
  return {sw: document.documentElement.scrollWidth, iw: innerWidth, out: out.map(x => (x.e.id || x.e.className) + ' ' + Math.round(x.r.left) + '-' + Math.round(x.r.right))};
};
(async () => {
  for (const w of [320, 390]) {
    const {browser, page, errors} = await open(APP, {width: w, height: 700}); await page.waitForTimeout(700);
    const SH = {'the start screen': 'start', 'the home tab': 'notebook', 'the add menu': 'add'};
    const chk = async name => { if (w === 320 && SH[name]) await page.screenshot({path: path.join(__dirname, 'shots', (process.env.SHOT || 'narrow-after') + '-' + SH[name] + '.png')}); const r = await page.evaluate(wide); ok(r.sw <= r.iw && !r.out.length, `${w}px: ${name} does not scroll sideways (${r.sw} of ${r.iw}${r.out.length ? ', sticking out: ' + r.out : ''})`); };
    await chk('the start screen');
    await page.click('#helpBtn'); await page.waitForTimeout(400); await chk('Help and settings'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
    await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(900);
    await chk('a notebook with the ribbon and status bar');
    for (const t of ['home', 'insert', 'box', 'review', 'view']) { await page.click('#tab-' + t); await page.waitForTimeout(200); await chk('the ' + t + ' tab'); }
    await page.click('#ribbonFold'); await page.waitForTimeout(200); await chk('the folded ribbon');
    await page.click('#ribbonFold'); await page.click('#tab-insert'); await page.click('#drawBtn'); await page.waitForTimeout(300); await chk('the drawing toolbar');
    await page.click('#drawBar [data-done]'); await page.waitForTimeout(200);
    await page.click('#helpBtn'); await page.waitForTimeout(400); await chk('Help and settings in a notebook'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    // the add menu: right-click the "+ Add here" button
    await page.evaluate(() => document.querySelector('.strip').scrollIntoView({block: 'center'}));
    const s = await page.$('.strip'), b = await s.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(300);
    const pill = await page.$('.gappill');
    if (pill && await pill.isVisible()) { await pill.click({button: 'right'}); await page.waitForTimeout(300); ok(await page.isVisible('#insList'), `${w}px: the add menu opens`); await chk('the add menu'); }
    else ok(false, 'the Add here button shows');
    await browser.close();
    ok(!errors.length, `${w}px: no page errors ${errors.join(';')}`);
  }
  console.log('no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

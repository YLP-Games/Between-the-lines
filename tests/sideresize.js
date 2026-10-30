// A note on a side page, resized from its left and right edges as far as they go, stays inside the page: while it is dragged,
// after it is let go (it doesn't jump), when the window and so the side page get narrower, and after a reload.
const {open} = require('./harness');
const path = require('path');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(800);
  await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(600);
  const sp = page.locator('.sidepage').nth(1);
  await sp.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const s = await sp.boundingBox();
  await page.mouse.click(s.x + s.width * 0.4, s.y + 80); await page.waitForTimeout(300);
  await page.keyboard.type('The value change becomes bigger and bigger: it highlights gamma risk at the money, where a small move either way changes the value of the straddle a lot.');
  const box = sp.locator('.notebox').first();
  // the note's frame and the inside of its page (within the border), on screen
  const where = () => box.evaluate(b => {
    const p = b.parentElement, br = b.getBoundingClientRect(), pr = p.getBoundingClientRect(), z = pr.width / p.offsetWidth;
    return {l: br.left, r: br.right, inL: pr.left + p.clientLeft * z, inR: pr.left + (p.clientLeft + p.clientWidth) * z};
  });
  const inside = w => w.l >= w.inL - 1 && w.r <= w.inR + 0.5;
  const fmt = w => `frame ${w.l.toFixed(1)} to ${w.r.toFixed(1)}, page inside ${w.inL.toFixed(1)} to ${w.inR.toFixed(1)}`;
  const grab = async dir => { await box.hover(); await page.waitForTimeout(200); const g = await box.locator(':scope > .g-' + dir).boundingBox(); return [g.x + g.width / 2, g.y + g.height / 2]; };

  for (const [dir, dx] of [['w', -700], ['e', 700]]) {
    const [x, y] = await grab(dir);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx / 2, y, {steps: 5}); await page.mouse.move(x + dx, y, {steps: 5}); await page.waitForTimeout(100);
    const held = await where();
    ok(inside(held), `dragging the ${dir === 'w' ? 'left' : 'right'} edge far past the side page, the note stops at the page (${fmt(held)})`);
    await page.mouse.up(); await page.waitForTimeout(400);
    const dropped = await where();
    ok(inside(dropped) && Math.abs(dropped.l - held.l) < 1 && Math.abs(dropped.r - held.r) < 1, `and stays just there when let go, inside the page (${fmt(dropped)})`);
  }
  const wide = await where();
  ok(wide.r - wide.l > (wide.inR - wide.inL) * 0.95, 'it is now as wide as the page allows');

  // ---- after a reload ----
  await page.waitForTimeout(1200);
  await page.reload(); await page.waitForTimeout(1500);
  await page.waitForFunction(() => document.querySelectorAll('.sidepage .notebox').length === 1, null, {timeout: 30000});
  await sp.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
  const back = await where();
  ok(inside(back) && Math.abs(back.r - back.l - (wide.r - wide.l)) < 1, `after a reload it is still inside its side page, as wide (${fmt(back)})`);

  // ---- a narrower side page (as in another layout): the note is shown narrower too, and stays inside ----
  const before = await sp.evaluate(p => p.clientWidth);
  await sp.evaluate(p => { p.style.width = Math.round(p.offsetWidth * 0.7) + 'px'; placeFloats(p); }); await page.waitForTimeout(300);
  const narrow = await where(), now = await sp.evaluate(p => p.clientWidth);
  ok(now < before - 100, `the side page made narrower (${before} to ${now} px)`);
  ok(inside(narrow), `and the note still fits inside it (${fmt(narrow)})`);

  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });

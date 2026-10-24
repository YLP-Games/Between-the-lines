// A note's resize handles by touch, and pinching near them: a slide along an edge the handle doesn't move changes nothing, a drag is one
// step Back undoes, and a second finger landing mid-resize puts the note back (nothing saved) while the two fingers zoom the page.
const {openIpad, touch} = require('./ipad');
const APP = require('path').resolve(__dirname, '..', 'index.html');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const {browser, page, cdp, errors} = await openIpad(APP, {width: 1024, height: 1366});
  await page.evaluate(() => document.querySelectorAll('.pagecard')[1].scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(300);
  const sb = await page.locator('.pagecard').nth(1).locator('.strip').first().boundingBox();
  await page.touchscreen.tap(sb.x + 300, sb.y + sb.height * .45); await page.waitForTimeout(400);
  const gp = await page.locator('.gappill').boundingBox(); await page.touchscreen.tap(gp.x + gp.width / 2, gp.y + gp.height / 2); await page.waitForTimeout(400);
  await page.keyboard.type('Resize me'); await page.touchscreen.tap(1000, 300); await page.waitForTimeout(800);
  const nb = page.locator('.notebox').first();
  const st = () => page.evaluate(() => { const b = document.querySelector('.notebox'), r = b.getBoundingClientRect(); return {i: hist.i, top: Math.round(r.top), h: Math.round(r.height), mh: b.style.minHeight, mt: b.style.marginTop}; });
  const tapNote = async () => { const r = await nb.boundingBox(); await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(400); };
  const drag = async (pts, two) => { await touch(cdp, 'touchStart', [pts[0]]); for (const p of pts.slice(1)) { await touch(cdp, 'touchMove', [p]); await page.waitForTimeout(16); } await touch(cdp, 'touchEnd', []); await page.waitForTimeout(500); };
  await tapNote();
  let g = await page.locator('.notebox.touched > .g-n').boundingBox(); const gx = g.x + g.width / 2, gy = g.y + g.height / 2;
  const s0 = await st();
  await drag([[gx, gy], [gx - 15, gy], [gx - 30, gy], [gx - 45, gy]]);
  const s1 = await st();
  ok(s1.i === s0.i && s1.h === s0.h && s1.mh === s0.mh, `sliding the top handle sideways changes nothing (${JSON.stringify(s0)} → ${JSON.stringify(s1)})`);
  await tapNote(); g = await page.locator('.notebox.touched > .g-n').boundingBox();
  await drag([[g.x + g.width / 2, g.y + g.height / 2], [g.x + g.width / 2, g.y + g.height / 2 - 15], [g.x + g.width / 2, g.y + g.height / 2 - 30], [g.x + g.width / 2, g.y + g.height / 2 - 40]]);
  const s2 = await st();
  ok(s2.i === s1.i + 1 && s2.h >= s1.h + 30 && s2.top <= s1.top - 30, `dragging the top handle up by finger makes the note taller, as one step (${JSON.stringify(s2)})`);
  // a pinch that starts on the handle: the first finger moves up, then a second lands
  await tapNote(); g = await page.locator('.notebox.touched > .g-n').boundingBox(); const hx = g.x + g.width / 2, hy = g.y + g.height / 2;
  await touch(cdp, 'touchStart', [[hx, hy, 1]]); await touch(cdp, 'touchMove', [[hx, hy - 20, 1]]); await page.waitForTimeout(30);
  const mid = await st();
  await touch(cdp, 'touchStart', [[hx, hy - 20, 1], [hx + 150, hy + 60, 2]]); await touch(cdp, 'touchMove', [[hx, hy - 40, 1], [hx + 150, hy + 90, 2]]); await touch(cdp, 'touchEnd', []); await page.waitForTimeout(500);
  const z3 = await page.evaluate(() => pageZoom);
  ok(z3 > 1.05, `the two fingers zoom the page instead (page zoom ${z3.toFixed(2)})`);
  await page.evaluate(() => setPageZoom(1)); await page.waitForTimeout(400);    // (back to the fit, so the note is measured as before)
  const s3 = await st();
  ok(mid.h > s2.h, `(the first finger alone had started to resize it: ${mid.h} > ${s2.h})`);
  ok(s3.i === s2.i && s3.h === s2.h && s3.mh === s2.mh && s3.mt === s2.mt, `when a second finger lands, the note goes back as it was and nothing is saved (${JSON.stringify(s3)})`);
  ok(!errors.length, 'no page errors ' + errors.join(' | '));
  await browser.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

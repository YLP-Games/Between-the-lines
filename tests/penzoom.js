// Apple Pencil on zoomed-in pages: the ink lands under the pen and keeps its detail, the eraser keeps its size on the screen,
// a hand resting by the Pencil never zooms, pans, double-taps or undoes, two fingers move the page instead of drawing, and a
// page being drawn again sharp waits for the stroke
const {openIpad, pen, touch} = require('./ipad');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const shot = (page, n) => page.screenshot({path: path.join(OUT, n + '.png')});

(async () => {
  const {browser, page, cdp, errors} = await openIpad(APP, {width: 1024, height: 1366});
  const wait = ms => page.waitForTimeout(ms);
  const card = 1;
  const ink = () => page.evaluate(i => JSON.parse(document.querySelectorAll('.pagecard')[i].dataset.ink || '[]'), card);
  const zoom = () => page.evaluate(() => pageZoom);
  const setZoom = async z => { await page.evaluate(z => setPageZoom(z), z); await wait(400); };
  const showCard = async () => { await page.evaluate(i => { document.querySelectorAll('.pagecard')[i].scrollIntoView({block: 'start', behavior: 'instant'}); scrollBy({top: -150, behavior: 'instant'}); main.scrollLeft = 0; }, card); await wait(500); };
  // somewhere blank on the page's first strip, on screen
  const spot = () => page.evaluate(i => { const r = document.querySelectorAll('.pagecard')[i].querySelector('.strip').getBoundingClientRect(); return {x: Math.max(r.left, 0) + 120, y: Math.min(innerHeight - 200, Math.max(r.top, 0) + 260)}; }, card);
  const down = async (x, y) => { await pen(cdp, 'mouseMoved', x, y); await pen(cdp, 'mousePressed', x, y, {force: .5}); };
  const lift = async (x, y) => { await pen(cdp, 'mouseReleased', x, y, {force: 0}); };
  const stroke = async (pts, o = {}) => {
    await pen(cdp, 'mouseMoved', pts[0][0], pts[0][1]);
    await pen(cdp, 'mousePressed', pts[0][0], pts[0][1], {force: .5, eraser: o.eraser});
    for (const [x, y] of pts.slice(1)) await pen(cdp, 'mouseMoved', x, y, {down: true, force: .5, eraser: o.eraser});
    await pen(cdp, 'mouseReleased', pts.at(-1)[0], pts.at(-1)[1], {force: 0, eraser: o.eraser});
    await wait(250);
  };
  const pinchAt = async (x, y, from = 120, to = 220) => {
    await touch(cdp, 'touchStart', [[x - from / 2, y, 1], [x + from / 2, y, 2]]); await wait(30);
    for (let k = 1; k <= 6; k++) { const d = from + (to - from) * k / 6; await touch(cdp, 'touchMove', [[x - d / 2, y, 1], [x + d / 2, y, 2]]); await wait(20); }
    await touch(cdp, 'touchEnd', []); await wait(400);
  };
  await showCard();

  // ---- the ink lands under the pen at 1×, 2× and 3×, and scrolled sideways ----
  for (const [z, sl] of [[1, 0], [2, 0], [3, 0], [3, 300]]) {
    await setZoom(z); await showCard(); await page.evaluate(sl => { main.scrollLeft = sl; }, sl); await wait(300);
    const {x, y} = await spot(), pts = Array.from({length: 30}, (_, k) => [x + k * 6, y + Math.sin(k / 3) * 20]);
    const n0 = (await ink()).length;
    await stroke(pts);
    const box = await page.evaluate(i => { const p = [...document.querySelectorAll('.pagecard')[i].querySelectorAll('svg.ink path')].at(-1).getBoundingClientRect(); return [p.left, p.top, p.right, p.bottom]; }, card);
    const want = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
    const off = Math.max(...box.map((v, i) => Math.abs(v - want[i])));
    ok((await ink()).length === n0 + 1 && off < 4 * z, `at ${z * 100}%${sl ? ', scrolled sideways,' : ''} the stroke is where the pen went (within ${off.toFixed(1)} px, the pen's width ${(1.9 * z).toFixed(1)} px)`);
  }
  // the pen keeps its width on the page, so zoomed in it is wider on the screen, as on paper under a magnifier
  const ws = (await ink()).map(it => it.w);
  ok(ws.every(w => w === ws[0]), 'the pen is the same width on the page at every zoom (' + ws[0] + ' points)');

  // ---- zoomed in, small writing keeps its detail: a point for every two screen pixels the pen moves ----
  await setZoom(3); await showCard();
  let {x, y} = await spot();
  const fine = Array.from({length: 40}, (_, k) => [x + k * 2, y + Math.sin(k / 2) * 6]);
  await stroke(fine);
  const kept = (await ink()).at(-1).p.length;
  ok(kept >= 36, `at 300% a stroke made of ${fine.length} points 2 px apart keeps ${kept} of them (two thirds of a point apart on the page)`);
  await setZoom(1); await showCard();
  ({x, y} = await spot());
  await stroke(fine.map(([a, b]) => [a - fine[0][0] + x, b - fine[0][1] + y]));
  const keptFit = (await ink()).at(-1).p.length;
  ok(keptFit >= 36, `and at the fit (${keptFit} kept: two points apart on the page)`);
  await shot(page, 'penzoom-1-strokes');

  // ---- the eraser keeps its size on the screen ----
  await page.click('#tab-insert'); await page.click('#drawBtn'); await wait(150);
  await page.click('.drawbar [data-tool="er"]'); await wait(150);
  const ring = async () => { const {x, y} = await spot(); await page.mouse.move(x + 300, y + 100); await wait(120); return page.evaluate(() => parseFloat(document.querySelector('.erring').style.width)); };
  const r1 = await ring(); await setZoom(3); await showCard(); const r3 = await ring();
  ok(r1 > 4 && Math.abs(r3 - r1) < 1, `the eraser's ring is the same size at the fit and at 300% (${r1.toFixed(1)} px, ${r3.toFixed(1)} px)`);
  // zoomed in, it rubs out a narrower path on the page: the partial eraser across a long straight line takes a smaller bit out
  await page.click('.drawbar [data-tool="pen"]'); await wait(100);
  const gapAt = async (z) => {
    await setZoom(z); await showCard();
    await page.evaluate(i => { const c = document.querySelectorAll('.pagecard')[i]; setInkData(c, []); renderInk(c); }, card);      // (a clean page)
    await page.click('.drawbar [data-tool="pen"]');
    const {x, y} = await spot(); await stroke([[x, y + 100], [x + 300, y + 100]]);
    await page.click('.drawbar [data-tool="er"]'); await page.click('.drawbar [data-em="part"]');
    await stroke([[x + 150, y + 60], [x + 150, y + 140]]);
    const pieces = await ink();
    if (pieces.length !== 2) return null;
    return +(pieces[1].p[0][0] - pieces[0].p.at(-1)[0]).toFixed(1);     // the gap the eraser left, in points
  };
  const g1 = await gapAt(1), g3 = await gapAt(3);
  ok(g1 > 0 && g3 > 0 && g3 < g1 * .6, `zoomed in it rubs out a narrower bit of the page (a gap of ${g1} points at the fit, ${g3} at 300%: the eraser a third as wide, the line as wide as it was)`);
  await page.click('.drawbar [data-tool="pen"]'); await page.click('.drawbar [data-done]'); await wait(200);
  ok(await page.evaluate(() => !document.body.classList.contains('drawing')), '(Draw is off again)');

  // ---- a hand resting by the Pencil: no zoom, no double-tap, no undo ----
  await setZoom(1); await showCard();
  ({x, y} = await spot());
  await down(x, y);
  for (let k = 1; k <= 8; k++) await pen(cdp, 'mouseMoved', x + k * 8, y, {down: true, force: .5});
  await pinchAt(x + 200, y + 300);
  ok(await zoom() === 1, 'two touches of the hand while the Pencil writes do not zoom the page');
  await lift(x + 64, y); await wait(60);
  await pinchAt(x + 200, y + 300);
  ok(await zoom() === 1, 'nor do they just after it lifts, between one stroke and the next');
  await wait(500);
  await pinchAt(x + 200, y + 300);
  ok(await zoom() > 1.2, `a moment later two fingers zoom again (${(await zoom()).toFixed(2)}×)`);
  await setZoom(1); await showCard();
  ({x, y} = await spot());
  await stroke([[x, y], [x + 60, y + 10], [x + 120, y]]);
  for (let k = 0; k < 2; k++) { await touch(cdp, 'touchStart', [[x + 260, y + 300, 5]]); await wait(40); await touch(cdp, 'touchEnd', []); await wait(80); }
  await wait(300);
  ok(await zoom() === 1, 'a palm tapping twice by the Pencil does not zoom in');
  const n1 = (await ink()).length, tap2 = async () => { await touch(cdp, 'touchStart', [[x + 260, y + 300, 1], [x + 330, y + 300, 2]]); await wait(60); await touch(cdp, 'touchEnd', []); };
  await pen(cdp, 'mouseMoved', x, y + 40); await pen(cdp, 'mousePressed', x, y + 40, {force: .5});
  for (let k = 1; k <= 8; k++) await pen(cdp, 'mouseMoved', x + k * 15, y + 40 + (k % 2) * 8, {down: true, force: .5});
  await pen(cdp, 'mouseReleased', x + 120, y + 40, {force: 0}); await wait(80);
  await tap2(); await wait(900);
  ok((await ink()).length === n1 + 1, 'a two-finger tap of the hand right after a stroke is not Back: the stroke stays');
  await tap2(); await wait(500);
  ok((await ink()).length === n1, 'a two-finger tap a moment later still goes Back one step');

  // ---- with Draw on, two fingers move and zoom the page; the first finger's stroke goes ----
  await page.click('#tab-insert'); await page.click('#drawBtn'); await wait(150);
  ({x, y} = await spot());
  const n2 = (await ink()).length;
  await touch(cdp, 'touchStart', [[x, y, 1]]); await wait(20);
  for (let k = 1; k <= 5; k++) { await touch(cdp, 'touchMove', [[x + k * 6, y, 1]]); await wait(16); }
  await touch(cdp, 'touchStart', [[x + 30, y, 1], [x + 150, y, 2]]); await wait(30);
  for (let k = 1; k <= 6; k++) { await touch(cdp, 'touchMove', [[x + 30 - k * 15, y, 1], [x + 150 + k * 15, y, 2]]); await wait(20); }
  await touch(cdp, 'touchEnd', []); await wait(500);
  ok((await ink()).length === n2 && await zoom() > 1.2, `with Draw on, a second finger turns the first finger's stroke into a pinch: nothing drawn, zoomed to ${(await zoom()).toFixed(2)}×`);
  await page.click('#drawBtn'); await wait(150);

  // ---- the sharp drawing of a zoomed-in page waits for the stroke ----
  await setZoom(1); await showCard(); await page.evaluate(async () => { await new Promise(r => setTimeout(r, 300)); await sharp.busy; });
  ({x, y} = await page.evaluate(i => { setPageZoom(2); const r = document.querySelectorAll('.pagecard')[i].querySelector('.strip').getBoundingClientRect(); return {x: Math.max(r.left, 0) + 120, y: Math.min(innerHeight - 200, Math.max(r.top, 0) + 260)}; }, card));
  await down(x, y);
  for (let k = 1; k <= 30; k++) { await pen(cdp, 'mouseMoved', x + k * 4, y + Math.sin(k / 4) * 10, {down: true, force: .5}); await wait(25); }
  ok(await page.evaluate(() => !document.querySelector('canvas.sharp')), 'zoomed in with the Pencil already writing: the page is not drawn again under the stroke');
  await lift(x + 120, y);
  await page.waitForFunction(() => !!document.querySelector('canvas.sharp'), null, {timeout: 5000}).catch(() => {});
  ok(await page.evaluate(() => !!document.querySelector('canvas.sharp')), 'once it lifts, the page is drawn sharp');
  await shot(page, 'penzoom-2-after');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

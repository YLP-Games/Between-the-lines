// Drawing on side-note pages: pen, highlighter, eraser; mouse, finger (Draw on) and Apple Pencil (automatic), with pressure; saved, reloaded, Back/Forward, Study mode, PDF and notebook file
const {openIpad, pen, touch, synthPen} = require('./ipad');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, page, cdp, errors} = await openIpad(APP, {width: 1366, height: 1024});
  const sp = i => page.locator('.sidepage').nth(i);
  const ink = i => page.evaluate(i => JSON.parse(document.querySelectorAll('.sidepage')[i].dataset.ink || '[]'), i);
  const box = async i => sp(i).boundingBox();
  const show = async i => { await page.locator('.pagecard').nth(i).scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 120)); await page.waitForTimeout(300); };
  const mouseStroke = async (i, pts) => {
    const b = await box(i);
    await page.mouse.move(b.x + b.width * pts[0][0], b.y + b.height * pts[0][1]); await page.mouse.down();
    for (const [fx, fy] of pts.slice(1)) await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy, {steps: 6});
    await page.mouse.up(); await page.waitForTimeout(150);
  };
  const penStroke = async (i, pts, o = {}) => {
    const b = await box(i), P = pts.map(([fx, fy, f]) => [b.x + b.width * fx, b.y + b.height * fy, f]);
    await pen(cdp, 'mouseMoved', P[0][0], P[0][1]);
    await pen(cdp, 'mousePressed', P[0][0], P[0][1], {force: P[0][2] ?? .5, eraser: o.eraser});
    for (const [x, y, f] of P.slice(1)) await pen(cdp, 'mouseMoved', x, y, {down: true, force: f ?? .5, eraser: o.eraser});
    await pen(cdp, 'mouseReleased', P.at(-1)[0], P.at(-1)[1], {force: 0, eraser: o.eraser});
    await page.waitForTimeout(200);
  };
  const line = (n, y0, y1, f0, f1) => Array.from({length: n}, (_, k) => [.2 + .5 * k / (n - 1), y0 + (y1 - y0) * k / (n - 1), f0 + (f1 - f0) * k / (n - 1)]);

  await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(500);
  await show(1);
  ok(await page.locator('.sidepage:visible').count() >= 6, 'side pages are on');
  await page.click('#tab-insert');
  ok(await page.locator('.sidepage').nth(1).evaluate(s => !s.dataset.ink), 'no side ink to begin with');

  // ---- mouse, with Draw on ----
  await page.click('#drawBtn'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.body.classList.contains('drawing')), 'Draw turns on with side pages showing');
  ok(await sp(1).evaluate(s => getComputedStyle(s).cursor) === 'crosshair' && await sp(1).evaluate(s => getComputedStyle(s).touchAction) === 'none', 'a side page has the crosshair and takes touches while drawing');
  await mouseStroke(1, [[.2, .2], [.4, .3], [.6, .2], [.8, .3]]);
  let it = await ink(1);
  ok(it.length === 1 && it[0].k === 'pen' && it[0].p.length > 5 && it[0].p.every(q => q.length === 2), 'a mouse stroke on a side page is saved as a plain pen stroke (no pressure)');
  const b1 = await box(1);
  const z1 = await page.evaluate(() => viewZoom);           // (the page is scaled to fit: the points are in its own pixels)
  ok(it[0].p.every(q => q[0] >= 0 && q[0] <= b1.width / z1 + 1 && q[1] >= 0 && q[1] <= b1.height / z1 + 1), 'its points are in pixels from the page\'s top left corner');
  ok(await sp(1).locator(':scope > svg.ink path.pen').count() === 1, 'and drawn as an svg over the side page');
  ok(await page.locator('.notebox').count() === 0, 'drawing did not add a note');
  ok(await sp(0).evaluate(s => !s.dataset.ink) && await page.locator('.pagecard').nth(1).evaluate(c => !c.dataset.ink), 'other pages and the slide have none');
  await page.click('#drawBar [data-tool="hl"]');
  await mouseStroke(1, [[.2, .5], [.8, .5]]);
  it = await ink(1);
  ok(it.length === 2 && it[1].k === 'hl' && it[1].p.every(q => q.length === 2), 'the highlighter works on a side page, flat');
  await page.screenshot({path: path.join(OUT, 'sideink-1-mouse.png')});
  await page.click('#drawBar [data-tool="er"]');
  await mouseStroke(1, [[.5, .1], [.5, .4]]);
  it = await ink(1);
  ok(it.length === 1 && it[0].k === 'hl', 'the eraser rubs out the pen stroke it crosses');
  await mouseStroke(1, [[.1, .5], [.9, .5]]);
  ok((await ink(1)).length === 0 && await sp(1).evaluate(s => !s.dataset.ink && !s.querySelector('svg.ink path')), 'and the highlighter; the page has no ink left');
  await page.click('#drawBar [data-tool="pen"]');

  // ---- a finger, with Draw on ----
  {
    const b = await box(1), x = b.x + b.width * .3, y = b.y + b.height * .6;
    await touch(cdp, 'touchStart', [[x, y]]);
    for (let k = 1; k <= 10; k++) await touch(cdp, 'touchMove', [[x + k * 14, y + Math.sin(k) * 12]]);
    await touch(cdp, 'touchEnd', []); await page.waitForTimeout(200);
    it = await ink(1);
    ok(it.length === 1 && it[0].p.length > 5 && it[0].p.every(q => q.length === 2), 'a finger draws on a side page while Draw is on');
  }
  await page.click('#drawBtn'); await page.waitForTimeout(100);
  ok(!(await page.evaluate(() => document.body.classList.contains('drawing'))), 'Draw is off');
  await mouseStroke(1, [[.2, .8], [.8, .85]]);
  ok((await ink(1)).length === 1, 'with Draw off a mouse does not draw on a side page');

  // ---- Apple Pencil, automatic, with pressure ----
  await penStroke(1, line(24, .25, .35, .15, .95));
  it = await ink(1);
  const last = it.at(-1);
  ok(it.length === 2 && last.k === 'pen' && last.p.length > 10 && last.p.every(q => q.length === 3), 'the Pencil draws by itself on a side page, with a pressure for every point');
  const prs = last.p.map(q => q[2]);
  ok(Math.max(...prs) - Math.min(...prs) > .4 && prs[0] < prs.at(-1), 'the pressure rises as it was pressed harder (' + prs[0] + ' to ' + prs.at(-1) + ')');
  const pd = await sp(1).locator(':scope > svg.ink path.pen').last().evaluate(p => ({fill: p.getAttribute('fill'), stroke: p.getAttribute('stroke'), d: p.getAttribute('d')}));
  ok(pd.fill !== 'none' && pd.stroke === 'none' && /z$/.test(pd.d), 'a pressure stroke is a filled shape whose width follows the pressure');
  await sp(1).scrollIntoViewIfNeeded();
  await page.screenshot({path: path.join(OUT, 'sideink-2-pencil.png')});
  // the Pencil's eraser end
  {
    const b = await box(1), nb = (await ink(1)).length, s = (await ink(1)).at(-1).p;
    const mid = s[Math.floor(s.length / 2)], zz = await page.evaluate(() => viewZoom), mx = b.x + (mid[0] + 1.5) * zz, my = b.y + (mid[1] + 1.5) * zz;       // across the pressure stroke
    await synthPen(page, [[mx, my - 14], [mx, my], [mx, my + 14]], {eraser: true}); await page.waitForTimeout(200);
    ok((await ink(1)).length === nb - 1, 'the eraser end of the Pencil (button 5) rubs out a stroke on a side page');
  }
  await penStroke(1, line(24, .25, .35, .15, .95));
  await penStroke(1, [[.2, .2], [.3, .22], [.4, .24], [.5, .26], [.6, .26]].map(([a, b2]) => [a, b2, .6]));
  const before = (await ink(1)).length;

  // ---- on a note, the Pencil is for writing ----
  {
    const b = await box(1);
    await page.mouse.click(b.x + b.width * .3, b.y + b.height * .75); await page.waitForTimeout(300);        // a click makes a side note
    ok(await sp(1).locator(':scope > .notebox').count() === 1, 'a tap on a side page still makes a note (Draw off)');
    const nb = await sp(1).locator(':scope > .notebox .mine').boundingBox();
    await pen(cdp, 'mouseMoved', nb.x + 10, nb.y + nb.height / 2);
    await pen(cdp, 'mousePressed', nb.x + 10, nb.y + nb.height / 2);
    for (let k = 1; k < 10; k++) await pen(cdp, 'mouseMoved', nb.x + 10 + k * 8, nb.y + nb.height / 2 + k, {down: true});
    await pen(cdp, 'mouseReleased', nb.x + 90, nb.y + nb.height / 2 + 9); await page.waitForTimeout(200);
    ok((await ink(1)).length === before, 'a Pencil stroke on a note is not drawn (it is for Scribble)');
  }
  // a finger drag on the page scrolls and does not draw
  {
    const b = await box(2), y0 = Math.min(900, b.y + 300), x = b.x + 100, s0 = await page.evaluate(() => scrollY);
    await touch(cdp, 'touchStart', [[x, y0]]);
    for (let k = 1; k <= 12; k++) await touch(cdp, 'touchMove', [[x, y0 - k * 20]]);
    await touch(cdp, 'touchEnd', []); await page.waitForTimeout(500);
    ok(await page.evaluate(() => scrollY) > s0 + 50 && (await ink(2)).length === 0, 'a finger swipe over a side page scrolls it and draws nothing');
  }

  // ---- saved, reloaded, Back and Forward, Study mode ----
  const n = (await ink(1)).length;
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => currentDoc().includes('data-ink')) && await page.evaluate(() => /<aside class="sidepage"[^>]*data-ink=/.test(currentDoc())), 'the notebook that is saved holds the side ink on its side page');
  await page.reload(); await page.waitForTimeout(2200);
  ok((await ink(1)).length === n && await sp(1).locator(':scope > svg.ink path').count() === n, 'after a reload the side ink is back (' + n + ' strokes)');
  ok((await ink(1)).filter(s => s.p[0].length === 3).length === 2 || (await ink(1)).some(s => s.p[0].length === 3), 'with its pressure');
  await show(1);
  await page.click('#readBtn'); await page.waitForTimeout(300);
  ok(await sp(1).locator(':scope > svg.ink path').first().isVisible() && await sp(1).locator(':scope > svg.ink').evaluate(v => v.getBoundingClientRect().width > 100), 'Study mode shows the side ink');
  await page.screenshot({path: path.join(OUT, 'sideink-3-study.png')});
  // no drawing in Study mode, not even with the Pencil
  await penStroke(1, line(10, .4, .45, .5, .5));
  ok((await ink(1)).length === n, 'the Pencil does not draw in Study mode');
  await page.click('#readBtn'); await page.waitForTimeout(300);
  await penStroke(1, line(14, .6, .7, .3, .8));
  ok((await ink(1)).length === n + 1, 'one more stroke');
  await page.waitForTimeout(900);
  await page.click('#undoBtn'); await page.waitForTimeout(900);
  ok((await ink(1)).length === n && await sp(1).locator(':scope > svg.ink path').count() === n, 'Back takes the last stroke away');
  await page.click('#redoBtn'); await page.waitForTimeout(900);
  ok((await ink(1)).length === n + 1 && await sp(1).locator(':scope > svg.ink path').count() === n + 1, 'Forward brings it back');

  // ---- the PDF and the notebook file ----
  const px = await page.evaluate(async () => {
    const card = document.querySelectorAll('.pagecard')[1], side = document.querySelectorAll('.sidepage')[1];
    sideForce = true;
    const c = await paintCard(card, 1, side), ctx = c.getContext('2d'), sr = side.getBoundingClientRect(), cr = card.getBoundingClientRect();
    sideForce = false;
    // count non-paper pixels inside the side page's area
    const x0 = Math.round(Math.min(sr.left, cr.left)), y0 = Math.round(Math.min(sr.top, cr.top));
    const d = ctx.getImageData(Math.round(sr.left - x0) + 4, Math.round(sr.top - y0) + 4, Math.round(sr.width) - 8, Math.round(sr.height) - 8).data;
    const bg = side.dataset.bg, n = parseInt(bg.slice(1), 16), R = n >> 16, G = (n >> 8) & 255, B = n & 255;
    let diff = 0, blue = 0; for (let i = 0; i < d.length; i += 4) { if (Math.abs(d[i] - R) + Math.abs(d[i + 1] - G) + Math.abs(d[i + 2] - B) > 60) diff++; if (d[i + 2] > 150 && d[i] < 90) blue++; }
    return {diff, blue, w: c.width, h: c.height};
  });
  ok(px.blue > 100, 'the PDF page is painted with the side ink (' + px.blue + ' blue pixels on the side page)');
  const f = await page.evaluate(async () => { const r = await pdfFile(); return {size: r.blob.size, name: r.name}; });
  ok(f.size > 2000 && /\.pdf$/.test(f.name), 'a PDF can be made with side ink (' + f.size + ' bytes)');
  const nbk = await page.evaluate(async () => { const r = await notebookFile(); return await r.blob.text(); });
  ok(/data-ink=/.test(nbk) && /sidepage/.test(nbk), 'the notebook file carries the side ink');
  // load the saved notebook into a fresh page: ink comes back on the side pages
  const html = await page.evaluate(() => currentDoc());
  await page.evaluate(h => { main.innerHTML = h; upgradeNotes(); applyReadMode(); renderAllInk(); sideRead(); sideLayout(); }, html);
  await page.waitForTimeout(500);
  ok(await page.locator('.sidepage').nth(1).locator(':scope > svg.ink path').count() === n + 1, 'loading a notebook draws its side ink');

  // ---- not horizontally scrolling; split column (sync off) ----
  await page.click('#tab-view'); await page.click('#sideSync'); await page.waitForTimeout(600);
  ok(await page.locator('.sidewrap').count() === 1, 'side pages are in their own column');
  await page.click('#tab-insert'); await page.click('#drawBtn');
  const col0 = (await ink(0)).length;
  await mouseStroke(0, [[.2, .1], [.5, .2], [.7, .1]]);
  ok((await ink(0)).length === col0 + 1, 'drawing works in the separate side column too');
  await page.click('#drawBtn');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scrolling');
  console.log(errors.length ? errors : 'no page errors');
  if (errors.length) process.exit(1);
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });

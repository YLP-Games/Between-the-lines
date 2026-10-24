// Audit follow-ups: pdf.js in a real Web Worker, the ribbon's scroll-bar strip, the Show toolbar pill, the writing guide under drawers, the phone title bar,
// invisible note handles, contrast, measureStrip's layout work, formatting buttons and the split-view pane, and printing.
// `node audit2.js` runs everything; `node audit2.js worker print` only those sections. APP=/path/to/older/index.html checks an older copy.
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const only = process.argv.slice(2);
const SECTIONS = {};
const section = (name, fn) => { SECTIONS[name] = fn; };
const pdfCards = (page, n = 2) => page.waitForFunction(n => document.querySelectorAll('.pagecard').length >= n, n, {timeout: 60000});
const errs = errors => errors.filter(e => !/ERR_FAILED|net::/.test(e));
const finish = (errors, label) => ok(errs(errors).length === 0, label + ': no page errors' + (errs(errors).length ? ': ' + errs(errors).join(' | ') : ''));

// ---------- 2. pdf.js runs in a real Web Worker, and still opens PDFs where one can't be made ----------
section('worker', async () => {
  let {browser, page, errors} = await open(APP);
  await page.waitForTimeout(600);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await pdfCards(page, 6); await page.waitForTimeout(500);
  ok(await page.evaluate(() => !!pdfjsLib.GlobalWorkerOptions.workerSrc), 'pdf.js is told where its worker is');
  ok(page.workers().length >= 1, 'reading a PDF starts a Web Worker (' + page.workers().length + ')');
  ok(await page.evaluate(() => typeof window.pdfjsWorker === 'undefined'), 'the worker script is not also run on the page itself');
  ok(await page.locator('.pagecard').count() >= 6, 'the PDF opens with its pages');
  finish(errors, 'worker'); await browser.close();

  // a browser that won't make a worker: pdf.js reads on the page instead, and the PDF still opens
  ({browser, page, errors} = await open(APP));
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.Worker = function () { throw new Error('workers are blocked here'); }; });
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await pdfCards(page, 6); await page.waitForTimeout(500);
  ok(page.workers().length === 0 && await page.locator('.pagecard').count() >= 6, 'with workers blocked the PDF still opens (on the page)');
  finish(errors, 'worker fallback'); await browser.close();
});

// ---------- 9. measureStrip reads every span, then writes them: one layout, not one per span ----------
section('measure', async () => {
  const {browser, context, page, errors} = await open(APP);
  await page.waitForTimeout(600);
  await page.setInputFiles('#file', path.join(__dirname, 'long.pdf'));
  await pdfCards(page, 44); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => [...document.querySelectorAll('#main .tl')].every(s => s.style.transform)), 'every text span of the 44-page PDF is measured');
  // a strip with 60 spans, measured while Chrome counts how often it works out styles and layout
  const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
  const counts = async () => { const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value])); return m.RecalcStyleCount + m.LayoutCount; };
  await page.evaluate(() => {
    const strip = document.querySelector('#main .strip'), tpl = strip.querySelector('.tl');
    for (let i = strip.querySelectorAll('.tl').length; i < 60; i++) { const c = tpl.cloneNode(true); c.style.top = (i % 20) * 4 + '%'; strip.append(c); }
    strip.querySelectorAll('.tl').forEach(s => s.style.transform = '');
    window.__strip = strip; strip.getBoundingClientRect();
  });
  const before = await counts();
  const sized = await page.evaluate(() => { const t0 = performance.now(); if (window.measureStrips) measureStrips([__strip]); else measureStrip(__strip); return performance.now() - t0; });
  const worked = (await counts()) - before;
  const r = await page.evaluate(() => {
    const strip = __strip, all = [...strip.querySelectorAll('.tl')], w = strip.getBoundingClientRect().width;
    return {spans: all.length, sized: all.filter(s => s.style.transform).length, off: all.filter(s => { const a = s.getBoundingClientRect().width, t = +s.dataset.w * w; return !(t > 0 && Math.abs(a - t) / t < 0.03); }).length};
  });
  ok(r.sized === r.spans, 'a strip of ' + r.spans + ' spans: all ' + r.sized + ' were sized (' + Math.round(sized) + ' ms)');
  ok(worked <= 6, 'measuring it made Chrome work out styles and layout ' + worked + ' times (a handful, not once per span)');
  ok(r.off === 0, 'every span ends up as wide as the PDF says (' + r.off + ' off)');
  finish(errors, 'measure'); await browser.close();
});

// ---------- 7. note handles nobody can see take no taps ----------
const newNote = async (page, text) => {
  await page.evaluate(() => document.getElementById('newDocBtn').click()); await page.waitForTimeout(500);
  await page.evaluate(t => { const s = document.querySelector('#main .slide'); const {box, el} = makeBox(); (s.querySelector('.content') || s).append(box); el.textContent = t; saveSoon(); }, text);
  await page.evaluate(() => document.activeElement?.blur()); await page.waitForTimeout(500);      // (the empty note a new page starts with goes)
};
// each handle of every note: its pointer-events, and whether a point of it takes the pointer (a handle can be partly under another)
const gripState = page => page.evaluate(() => [...document.querySelectorAll('#main .notebox > .grip')].map(g => {
  const r = g.getBoundingClientRect(); let caught = false;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { const t = document.elementFromPoint(r.left + r.width * (i + .5) / 5, r.top + r.height * (j + .5) / 5); if (t === g || g.contains(t)) caught = true; }
  return {dir: g.dataset.dir, pe: getComputedStyle(g).pointerEvents, op: +getComputedStyle(g).opacity, caught};
}));
section('grips', async () => {
  let {browser, page, errors} = await open(APP, {width: 1024, height: 768, contextOptions: {hasTouch: true, isMobile: true}});
  await page.waitForTimeout(600);
  await newNote(page, 'A note about slopes');
  await page.mouse.click(5, 5); await page.waitForTimeout(200);
  let g = await gripState(page);
  ok(g.length >= 8 && g.every(x => x.op === 0), 'touch: nothing tapped, so every handle of the note is clear (' + g.length + ' handles)');
  ok(g.every(x => x.pe === 'none' && !x.caught), 'touch: and none of them takes a tap (' + g.filter(x => x.caught).map(x => x.dir).join(' ') + ' do)');
  // a tap on the note's bottom right corner, where its resize handle is, is a tap on the note: it is picked, not stretched
  const before = await page.$eval('#main .notebox', b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  const corner = await page.$eval('#main .notebox > .g-se', e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.touchscreen.tap(corner[0], corner[1]); await page.waitForTimeout(300);
  ok(await page.$eval('#main .notebox', b => b.classList.contains('touched')), 'touch: tapping the note by its corner picks the note');
  g = await gripState(page);
  ok(g.every(x => x.op === 1 && x.pe === 'auto' && x.caught), 'touch: a picked note shows its handles and they all take a finger');
  ok(await page.$eval('#main .notebox > .nbar .g-min', e => { const r = e.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t === e || e.contains(t); }), 'touch: and so does the toolbar of a picked note');
  const after = await page.$eval('#main .notebox', b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  ok(before.join() === after.join(), 'touch: the tap did not resize the note (' + before + ' then ' + after + ')');
  await page.touchscreen.tap(700, 740); await page.waitForTimeout(300);
  g = await gripState(page);
  ok(g.every(x => x.op === 0 && x.pe === 'none'), 'touch: tapping elsewhere puts the handles away again');
  finish(errors, 'grips (touch)'); await browser.close();

  // a mouse: pointing at the note shows its handles and they work; pointing away, they are clear and let everything through
  ({browser, page, errors} = await open(APP, {width: 1440, height: 900}));
  await page.waitForTimeout(600);
  await newNote(page, 'A note about slopes');
  await page.mouse.move(5, 700); await page.waitForTimeout(300);
  g = await gripState(page);
  ok(g.every(x => x.op === 0 && x.pe === 'none'), 'mouse: pointing elsewhere, the handles are clear and take nothing');
  const r = await page.$eval('#main .notebox > .mine', e => { const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
  await page.mouse.move(r[0], r[1], {steps: 3}); await page.waitForTimeout(300);
  g = await gripState(page);
  ok(g.every(x => x.op === 1 && x.pe === 'auto' && x.caught), 'mouse: pointing at the note shows its handles and they take the pointer');
  const w0 = await page.$eval('#main .notebox', b => b.getBoundingClientRect().width);
  const e = await page.$eval('#main .notebox > .g-e', e => { const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
  await page.mouse.move(e[0], e[1], {steps: 3}); await page.mouse.down(); await page.mouse.move(e[0] - 60, e[1], {steps: 5}); await page.mouse.up(); await page.waitForTimeout(200);
  ok(await page.$eval('#main .notebox', b => b.getBoundingClientRect().width) < w0 - 30, 'mouse: dragging the side handle still makes the note narrower');
  await page.evaluate(() => { document.querySelector('#main .notebox').classList.add('multi-sel'); }); await page.mouse.move(5, 700); await page.waitForTimeout(300);
  ok((await gripState(page)).find(x => x.dir === 'move').pe === 'auto', 'mouse: a note picked with others keeps its move handle live');
  finish(errors, 'grips (mouse)'); await browser.close();
});

// ---------- 5. the writing guide sits under drawers, menus and pop-ups ----------
// what takes the pointer at a point: the first element's name, and whether it is the guide
const topAt = (page, x, y) => page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return {guide: !!e?.closest('#wguide'), name: e ? (e.id || (e.getAttribute('class') || '').split(' ')[0] || e.tagName) : null}; }, [x, y]);
section('wguide', async () => {
  for (const w of [820, 390]) {
    const {browser, page, errors} = await open(APP, {width: w, height: 900});
    await page.waitForTimeout(600);
    await newNote(page, 'A note under a guide');
    await page.evaluate(() => wgOpen()); await page.waitForTimeout(200);
    // the guide takes the whole width, 160px down, so its corner icon is under a drawer on the left and its right edge handle under one on the right
    await page.evaluate(() => wgSet(0, 160, innerWidth - 100, 400)); await page.waitForTimeout(100);
    const ind = await page.$eval('#wguide .wg-ind', e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    ok((await topAt(page, ind[0], ind[1])).guide, w + 'px: with no drawer open, the guide icon takes the pointer');
    await page.evaluate(() => setPanel('pages', true)); await page.waitForTimeout(300);
    let t = await topAt(page, ind[0], ind[1]);
    ok(!t.guide, w + 'px: the sidebar drawer is above the writing guide (' + t.name + ' is on top)');
    await page.evaluate(() => setPanel('notes', true)); await page.waitForTimeout(300);
    const he = await page.$eval('#wguide .wg-e', e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    t = await topAt(page, he[0], he[1]);
    ok(he[0] > w * 0.4 && !t.guide, w + 'px: the Notes drawer is above the guide\'s edge handle (' + t.name + ' is on top)');
    const z = await page.evaluate(() => ({g: +getComputedStyle(document.getElementById('wguide')).zIndex, side: +getComputedStyle(document.getElementById('notesPanel')).zIndex, scrim: +getComputedStyle(document.getElementById('scrim')).zIndex, bar: +getComputedStyle(document.getElementById('appbar')).zIndex, status: +getComputedStyle(document.getElementById('statusbar')).zIndex, beside: +getComputedStyle(document.getElementById('beside')).zIndex}));
    ok(z.g < z.scrim && z.g < z.side && z.g < z.status && z.g < z.bar, w + 'px: the guide (z ' + z.g + ') is under the scrim (' + z.scrim + '), drawers (' + z.side + '), status bar (' + z.status + ') and toolbar (' + z.bar + ')');
    ok(z.g > 0, w + 'px: and still over the pages');
    await page.evaluate(() => { setPanel('pages', false); setPanel('notes', false); }); await page.waitForTimeout(200);
    finish(errors, 'wguide ' + w); await browser.close();
  }
  // a wide window: the sidebar that peeks in over the pages is above the guide too
  const {browser, page, errors} = await open(APP, {width: 1440, height: 900});
  await page.waitForTimeout(600);
  await newNote(page, 'A note under a guide');
  await page.evaluate(() => { setPanel('pages', false); wgOpen(); wgSet(0, 160, 700, 400); }); await page.waitForTimeout(200);
  const ind = await page.$eval('#wguide .wg-ind', e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(2, 400); await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.getElementById('pagesPanel').classList.contains('peeking')), '1440px: pointing at the left edge peeks the sidebar in');
  const t = await topAt(page, ind[0], ind[1]);
  ok(!t.guide, '1440px: the peeking sidebar is above the writing guide (' + t.name + ' is on top)');
  finish(errors, 'wguide 1440'); await browser.close();
});

// ---------- 3. the ribbon's spare strip lets clicks through when there is nothing to scroll ----------
section('ribbon', async () => {
  const {browser, page, errors} = await open(APP, {width: 1440, height: 900});
  await page.waitForTimeout(600);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await pdfCards(page, 6); await page.waitForTimeout(500);
  const probe = () => page.evaluate(() => {
    const p = [...document.querySelectorAll('.panel')].find(p => p.offsetParent), a = document.getElementById('appbar').getBoundingClientRect(), pr = p.getBoundingClientRect();
    const miss = [], hits = []; for (let x = 40; x < innerWidth - 20; x += 90) { const e = document.elementFromPoint(x, a.bottom + 2); hits.push(e && e.closest('.panel') ? 'panel' : e?.tagName); }
    const btns = [...p.querySelectorAll('button, select, input')].filter(b => b.offsetParent && !b.disabled && b.getBoundingClientRect().right < innerWidth && b.getBoundingClientRect().left > 0).map(b => { const r = b.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const hit = t === b || b.contains(t); if (!hit) miss.push((b.id || b.className) + ' under ' + (t && (t.id || t.getAttribute('class') || t.tagName)) + ' at ' + Math.round(r.left)); return hit; });
    return {over: p.scrollWidth - p.clientWidth, spill: Math.round(pr.bottom - a.bottom), hits, btns, miss, id: p.id};
  });
  let r = await probe();
  ok(r.over <= 0 && r.spill > 0, 'the Home tab fits at 1440px, and its panel reaches ' + r.spill + 'px past the toolbar');
  ok(r.hits.every(h => h !== 'panel'), 'a click just under the toolbar goes to the page, not to the ribbon (' + [...new Set(r.hits)] + ')');
  ok(r.btns.length > 15 && r.btns.every(Boolean), 'every one of the ' + r.btns.length + ' Home buttons and boxes still takes the pointer');
  await page.click('#b'); await page.click('#tab-insert'); await page.waitForTimeout(300);
  r = await probe();
  ok(r.hits.every(h => h !== 'panel') && r.btns.every(Boolean), 'the same on the Insert tab (' + r.over + 'px over)');
  // a window too narrow for the tools: the panel scrolls, and the strip holds its scroll bar, so that does take the pointer
  await page.setViewportSize({width: 820, height: 900}); await page.waitForTimeout(500); await page.click('#tab-view'); await page.waitForTimeout(400);
  r = await probe();
  ok(r.over > 50 && r.hits.includes('panel'), 'at 820px the View tab scrolls (' + r.over + 'px over): the strip under it is the scroll bar and takes the pointer');
  ok(r.btns.every(Boolean), 'and its buttons still take the pointer ' + r.miss.join('; '));
  // tabs only: the tools open as a pop-over, which must still block the page under it
  await page.setViewportSize({width: 1440, height: 900}); await page.waitForTimeout(400);
  await page.click('#ribbonFold'); await page.click('#tab-home'); await page.waitForTimeout(400);
  const pop = await page.evaluate(() => { const p = document.getElementById('panel-home'), r = p.getBoundingClientRect(), e = document.elementFromPoint(r.right - 20, r.top + 30); return {shown: !!p.offsetParent, panel: !!e?.closest('#panel-home')}; });
  ok(pop.shown && pop.panel, 'with tabs only, the pop-over tools still catch clicks on their empty parts');
  finish(errors, 'ribbon'); await browser.close();
});

// ---------- 4. the Show toolbar pill keeps off the buttons of the panels ----------
// the pill, and every button, box or link in an open panel (or the notebook beside) that it covers
const pillState = page => page.evaluate(() => {
  const p = document.getElementById('showBar'), cs = getComputedStyle(p), pr = p.getBoundingClientRect(), shown = !p.hidden && cs.display !== 'none' && cs.visibility !== 'hidden';
  const covers = !shown ? [] : [...document.querySelectorAll('.side:not([hidden]) :is(button, a[href], input, select, textarea), #beside:not([hidden]) :is(button, a[href], input, select, textarea)')].filter(e => {
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || e.closest('[hidden]')) return false;
    return Math.min(r.right, pr.right) - Math.max(r.left, pr.left) > 1 && Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top) > 1;
  }).map(e => e.dataset.close || e.id || e.getAttribute('aria-label') || e.className);
  return {shown, covers, left: Math.round(pr.left), right: Math.round(pr.right), w: innerWidth};
});
section('pill', async () => {
  for (const w of [1440, 1100, 820, 390]) {
    const {browser, page, errors} = await open(APP, {width: w, height: 900});
    await page.waitForTimeout(600);
    await newNote(page, 'First notebook'); const a = await page.evaluate(() => curId);
    await newNote(page, 'Second notebook');
    await page.evaluate(() => { setBar('hidden'); setPanel('pages', false); setPanel('notes', true); }); await page.waitForTimeout(400);
    let s = await pillState(page);
    ok(s.covers.length === 0, w + 'px, Notes open: the Show toolbar pill covers no button of the panel (' + (s.covers.join(', ') || 'none') + '; pill at ' + s.left + '-' + s.right + ')');
    if (w >= 820) ok(s.shown, w + 'px, Notes open: and the pill is still there to press');
    else ok(!s.shown, w + 'px, Notes open: on a phone the drawer fills the width, so the pill waits');
    await page.evaluate(() => { setPanel('notes', false); setPanel('pages', true); }); await page.waitForTimeout(400);
    s = await pillState(page);
    ok(s.covers.length === 0, w + 'px, sidebar open: the pill covers no button of the sidebar (' + (s.covers.join(', ') || 'none') + (s.shown ? '' : '; it waits') + ')');
    await page.evaluate(() => setPanel('pages', false)); await page.waitForTimeout(300);
    s = await pillState(page);
    ok(s.shown && s.right > w - 40, w + 'px, no panel: the pill is at the top right where it always was (' + s.left + '-' + s.right + ')');
    // the notebook beside, with Notes shut: its Swap and Close buttons are at the top right too
    await page.evaluate(id => openBeside(id), a); await page.waitForTimeout(900);
    s = await pillState(page);
    ok(s.covers.length === 0, w + 'px, notebook beside: the pill covers no button of the pane (' + (s.covers.join(', ') || 'none') + ')');
    if (w >= 1100) {
      await page.evaluate(() => setPanel('notes', true)); await page.waitForTimeout(500);
      s = await pillState(page);
      ok(s.covers.length === 0 && s.shown, w + 'px, beside and Notes open: still clear of both (' + (s.covers.join(', ') || 'none') + ')');
      await page.evaluate(() => setPanel('notes', false)); await page.waitForTimeout(300);
    }
    await page.evaluate(() => besideClose()); await page.waitForTimeout(500);
    s = await pillState(page);
    ok(s.shown && s.right > w - 40, w + 'px: with everything shut, the pill goes back to the corner');
    await page.click('#showBar'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => !document.getElementById('appbar').classList.contains('barhidden') && document.getElementById('showBar').hidden), w + 'px: pressing it brings the toolbar back');
    finish(errors, 'pill ' + w); await browser.close();
  }
});

// ---------- 6. a phone's title bar keeps the notebook's name (shrunk with …) and the sync status ----------
section('titlebar', async () => {
  const LONG = 'A really rather long lecture title about price elasticity and demand';
  for (const [w, touch] of [[390, false], [390, true], [360, true], [320, true]]) {
    const label = w + 'px' + (touch ? ' (touch)' : '');
    const {browser, page, errors} = await open(APP, {width: w, height: 800, contextOptions: touch ? {hasTouch: true, isMobile: true} : {}});
    await page.waitForTimeout(600);
    await page.setInputFiles('#file', {name: LONG + '.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(path.join(__dirname, 'lecture.pdf'))});
    await pdfCards(page, 6); await page.waitForTimeout(600);
    await page.evaluate(() => { const el = document.getElementById('driveSync'); el.hidden = false; el.dataset.s = 'synced'; el.innerHTML = icon('saved') + '<span>Synced to Google Drive</span>'; });
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const q = s => document.querySelector(s), box = e => { const b = e.getBoundingClientRect(); return {l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height)}; };
      const bar = q('.titlebar'), t = q('#docTitle'), d = q('.doc'), sync = q('#driveSync'), btns = [...bar.querySelectorAll('.btn')].filter(b => b.offsetParent).map(b => box(b));
      const ts = getComputedStyle(t);
      return {vw: document.documentElement.clientWidth, page: document.documentElement.scrollWidth, bar: [bar.scrollWidth, bar.clientWidth], title: box(t), name: t.textContent, ell: ts.textOverflow === 'ellipsis' && ts.overflow === 'hidden', cut: t.scrollWidth > t.clientWidth,
        doc: box(d), sync: box(sync), syncLabel: box(sync.querySelector('span')), save: box(q('#saveState')), btns, minBtn: Math.min(...btns.map(b => Math.min(b.w, b.h))), maxRight: Math.max(...btns.map(b => b.r)), btnBottom: Math.max(...btns.map(b => b.b)), nbtn: btns.length};
    });
    ok(r.page <= r.vw && r.bar[0] <= r.bar[1], label + ': nothing overflows the width (page ' + r.page + ', title bar ' + r.bar[0] + ' of ' + r.bar[1] + ', buttons end at ' + r.maxRight + ')');
    ok(r.title.w >= 120, label + ': the notebook\'s name has room (' + r.title.w + 'px for "' + r.name.slice(0, 20) + '…")');
    ok(r.ell && r.cut, label + ': and a long name shrinks to an ellipsis');
    ok(r.sync.l >= r.doc.l && r.sync.r <= r.doc.r && r.sync.r <= r.vw && r.syncLabel.w > 40 && r.sync.h > 8, label + ': the cloud sync status is whole, with its words (' + r.sync.l + '-' + r.sync.r + ' of ' + r.vw + ')');
    ok(r.save.l >= r.doc.l && r.save.r <= r.doc.r && r.save.w >= 12, label + ': so is the saved mark (' + r.save.w + 'px wide)');
    ok(r.minBtn >= (touch ? 34 : 32) && r.nbtn >= 9, label + ': the ' + r.nbtn + ' buttons stay at least ' + (touch ? 34 : 32) + 'px each way (smallest ' + r.minBtn + ')');
    // opening the notes drawer and a menu still works from this bar
    await page.click('#save'); await page.waitForTimeout(200);
    ok(await page.evaluate(() => { const m = document.getElementById('saveMenu').getBoundingClientRect(); return !document.getElementById('saveMenu').hidden && m.left >= -1 && m.right <= innerWidth + 1; }), label + ': the Download menu opens inside the screen');
    finish(errors, 'titlebar ' + label); await browser.close();
  }
});

// ---------- 10. the toolbar's formatting never reaches the read-only pane beside ----------
section('beside', async () => {
  const {browser, page, errors} = await open(APP, {width: 1440, height: 900});
  await page.waitForTimeout(600);
  await newNote(page, 'alpha beta gamma'); const a = await page.evaluate(() => curId);
  await newNote(page, 'delta epsilon zeta');
  await page.evaluate(id => openBeside(id), a); await page.waitForTimeout(900);
  const pane = () => page.$eval('#bView', e => e.innerHTML);
  const before = await pane();
  const mine = await page.locator('#bView .mine').first().boundingBox();
  const inPane = () => page.evaluate(() => !!active && !!active.closest('#bView'));
  const same = async m => ok(await pane() === before, m);
  await page.click('#tab-home');
  // a word selected in the pane, then a caret in it: each time every Home button and box is used
  for (const [how, put] of [['a selected word', () => page.mouse.dblclick(mine.x + 20, mine.y + mine.height / 2)], ['a caret', () => page.mouse.click(mine.x + 5, mine.y + mine.height / 2)]]) {
    await put(); await page.waitForTimeout(250);
    ok(!(await inPane()), 'pane: with ' + how + ' in the pane, it is not the note the toolbar works on');
    await page.click('#b'); await page.click('#i'); await page.click('#u'); await same('pane, ' + how + ': Bold, Italic and Underline leave it alone');
    await page.click('.sw >> nth=3'); await page.selectOption('#font', 'Verdana'); await same('pane, ' + how + ': a colour and a font leave it alone');
    await page.fill('#size', '40'); await page.keyboard.press('Enter'); await page.waitForTimeout(150); await same('pane, ' + how + ': a size leaves it alone');
    for (const c of ['justifyRight', 'insertUnorderedList', 'indent', 'hiliteColor']) { await page.click(`[data-cmd=${c}]`); await page.waitForTimeout(100); }
    await same('pane, ' + how + ': alignment, a list, an indent and a highlight leave it alone');
    await page.evaluate(() => { document.getElementById('color').value = '#00aa00'; document.getElementById('color').dispatchEvent(new Event('input', {bubbles: true})); }); await same('pane, ' + how + ': a colour from the picker leaves it alone');
    await page.click('#tab-box');
    for (const id of ['bFill', 'alRight', 'bOutline']) { await page.click('#' + id).catch(() => {}); await page.waitForTimeout(100); }
    await same('pane, ' + how + ': the Box tab leaves it alone');
    await page.click('#tab-home');
  }
  // and the notebook on the left still takes its formatting
  const main = await page.locator('#main .mine:not(:empty)').first().boundingBox();
  await page.mouse.click(main.x + 10, main.y + main.height / 2); await page.waitForTimeout(200);
  await page.click('.sw >> nth=3'); await page.waitForTimeout(150);
  ok(await page.$eval('#main .mine:not(:empty)', e => e.style.color !== 'rgb(31, 79, 209)'), 'the notebook you write in still takes the colour');
  await same('pane: and the pane is still as it was');
  finish(errors, 'beside'); await browser.close();
});

// ---------- 8. contrast: the app's own text is at least 4.5:1 (3:1 when large) on its background, in both themes ----------
// runs in the page: every piece of visible text and every placeholder outside the pages and notes (which are your own colours), with the colours the browser worked out
function crawlContrast(){
  const num = s => s.trim() === 'none' ? 0 : parseFloat(s);
  const parse = c => {
    if (!c || c === 'transparent') return {r: 0, g: 0, b: 0, a: 0};
    let m = c.match(/^rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return {r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1}; }
    m = c.match(/^color\(srgb ([^)]+)\)/);
    if (m) { const p = m[1].split(/[\s\/]+/).filter(Boolean).map(Number); return {r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1}; }
    return null;
  };
  const over = (t, b) => { const a = t.a + b.a * (1 - t.a); return a ? {r: (t.r * t.a + b.r * b.a * (1 - t.a)) / a, g: (t.g * t.a + b.g * b.a * (1 - t.a)) / a, b: (t.b * t.a + b.b * b.a * (1 - t.a)) / a, a} : {r: 0, g: 0, b: 0, a: 0}; };
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); };
  const bgOf = el => {
    let acc = {r: 0, g: 0, b: 0, a: 0}, hasImg = false;
    for (let n = el; n && acc.a < 1; n = n.parentElement) {
      const cs = getComputedStyle(n), c = parse(cs.backgroundColor);
      if (c && c.a) acc = over(acc, c);   // layers further up go underneath
      if (cs.backgroundImage !== 'none' && !/radial-gradient/.test(cs.backgroundImage) && n !== document.body) hasImg = true;
    }
    if (acc.a < 1) acc = over(acc, parse(getComputedStyle(document.documentElement).backgroundColor).a ? parse(getComputedStyle(document.documentElement).backgroundColor) : {r: 255, g: 255, b: 255, a: 1});
    if (acc.a < 1) acc = over(acc, {r: 255, g: 255, b: 255, a: 1});
    return {c: acc, hasImg};
  };
  const opacityOf = el => { let o = 1; for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  const visible = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
  const skip = el => el.closest('main, .tl, .mine, svg, option, script, style, [aria-hidden="true"], .bview, #bView, .welcome-art, .d-slide, .thumb, .sw, .dot, .hlswatch, .fchip .dot') || el.disabled || el.closest('[disabled]') || false;
  const out = [], seen = new Set();
  const check = (el, text, fg0, kind) => {
    if (!visible(el) || skip(el)) return;
    const cs = getComputedStyle(el), op = opacityOf(el), {c: bg, hasImg} = bgOf(el);
    if (hasImg) return;
    let fg = parse(fg0); if (!fg) return;
    fg = {...fg, a: fg.a * op};
    if (!fg.a) return;
    const eff = over(fg, bg), r = ratio(eff, bg), fs = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700, large = fs >= 24 || (fs >= 18.66 && bold), need = large ? 3 : 4.5;
    if (r < need - 0.005) {
      const id = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
      const key = id + '|' + fg0 + '|' + JSON.stringify(bg);
      if (seen.has(key)) return; seen.add(key);
      out.push({el: id, kind, text: text.trim().slice(0, 30), ratio: +r.toFixed(2), need, fs, fg: `rgb(${Math.round(eff.r)},${Math.round(eff.g)},${Math.round(eff.b)})`, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`, op: +op.toFixed(2)});
    }
  };
  for (const el of document.body.querySelectorAll('*')) {
    let own = ''; for (const n of el.childNodes) if (n.nodeType === 3) own += n.data;
    if (own.trim()) check(el, own, getComputedStyle(el).color, 'text');
    if (el.matches('input,textarea') && !el.value && el.placeholder) check(el, el.placeholder, getComputedStyle(el, '::placeholder').color, 'placeholder');
  }
  return out;
}
const contrast = (page, label) => page.evaluate(`(${crawlContrast.toString()})()`).then(r => r.map(f => `${f.ratio} ${f.el} "${f.text}" ${f.fg} on ${f.bg} (${label})`));
section('contrast', async () => {
  for (const scheme of ['light', 'dark']) {
    const {browser, page, errors} = await open(APP, {width: 1440, height: 900, colorScheme: scheme});
    await page.waitForTimeout(800);
    const bad = [], scan = async label => bad.push(...await contrast(page, label));
    await scan('start');
    for (const t of ['insert', 'box', 'view', 'home']) { await page.click('#tab-' + t); await page.waitForTimeout(200); await scan('the ' + t + ' tab'); }
    await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf')); await pdfCards(page, 6); await page.waitForTimeout(700);
    await page.click('#pagesBtn').catch(() => {}); await page.click('#notesBtn'); await page.waitForTimeout(400); await scan('the sidebar and Notes');
    await page.click('#save'); await page.waitForTimeout(250); await scan('the Download menu'); await page.keyboard.press('Escape'); await page.mouse.click(700, 500);
    await page.click('#helpBtn'); await page.waitForTimeout(400); await scan('Help and settings'); await page.click('#setClose'); await page.waitForTimeout(200);
    await page.keyboard.press('Control+k'); await page.waitForTimeout(400); await scan('the command palette'); await page.keyboard.press('Escape');
    // "Clear notebook? Click again", under the pointer that just pressed it and away from it
    await page.click('#tab-view'); await page.evaluate(() => { document.getElementById('panel-view').scrollLeft = 9999; });
    await page.click('#clear'); await page.waitForTimeout(250);
    const sure = () => page.evaluate(`(${crawlContrast.toString()})()`).then(r => r.filter(f => /Click again/.test(f.text)));
    ok((await sure()).length === 0, scheme + ': "Click again" can be read while the pointer is on it');
    await scan('Click again, pointed at');
    await page.mouse.move(700, 600); await page.waitForTimeout(250);
    ok((await sure()).length === 0, scheme + ': and when it is not');
    await scan('Click again');
    ok(bad.length === 0, scheme + ': every piece of the app\'s text is readable (AA) in 11 views' + (bad.length ? ':\n    ' + [...new Set(bad)].join('\n    ') : ''));
    finish(errors, 'contrast ' + scheme); await browser.close();
  }
});

// ---------- 1. Ctrl+P prints just the pages and notes ----------
const {spawnSync} = require('child_process');
const tool = (cmd, args) => { const r = spawnSync(cmd, args, {encoding: 'utf8'}); return r.error ? null : r.stdout; };
const HAVE_POPPLER = tool('pdftotext', ['-v']) !== null || spawnSync('pdftotext', ['-v']).status !== null;
// the app's own chrome, which none of a printout should show: every other child of the body, the panels, the grain, the page's own buttons and handles
const printedChrome = page => page.evaluate(() => {
  const shown = e => { const cs = getComputedStyle(e), r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const body = [...document.body.children].filter(e => !e.matches('.workspace, svg, script, style, template') && shown(e)).map(e => e.id || e.className || e.tagName);
  const panels = ['.appbar', '.side', '.beside', '.statusbar', '.scrim', '.showbar', '.toast', '.pop', '.menu', '.wguide', '.qtip', '.drawbar'].flatMap(s => [...document.querySelectorAll(s)].filter(shown).map(e => s + (e.id ? '#' + e.id : '')));
  const page = ['.gappill', '.gapline', '.cardbar', '.grip', '.nbar', '.note-chip', '.pptx-tip', '.welcome'].flatMap(s => [...document.querySelectorAll('#main ' + s)].filter(shown).map(() => s));
  return {body, panels, page, grain: getComputedStyle(document.body, '::after').display, bg: getComputedStyle(document.body).backgroundColor, bgImage: getComputedStyle(document.body).backgroundImage};
});
section('print', async () => {
  const D = path.join(OUT, 'print-');
  for (const scheme of ['light', 'dark']) {
    const {browser, page, errors} = await open(APP, {width: 1440, height: 900, colorScheme: scheme});
    await page.waitForTimeout(600);
    await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
    await pdfCards(page, 6); await page.waitForTimeout(900);
    const slides = await page.locator('#main .slide').count();
    const strip = page.locator('.pagecard').nth(1).locator('.strip').first(); await strip.scrollIntoViewIfNeeded();
    const b = await strip.boundingBox(); await page.mouse.move(b.x + 200, b.y + b.height * .5, {steps: 3}); await page.waitForTimeout(250);
    ok(await page.locator('.gappill').isVisible(), scheme + ': (the Add here pill is up on screen)');
    await page.click('.gappill'); await page.keyboard.type('Elasticity is about slopes'); await page.mouse.click(5, 700); await page.waitForTimeout(500);
    // everything open at once: the sidebar, Notes, Help, a menu, a toast, the writing guide
    await page.click('#pagesBtn').catch(() => {}); await page.click('#notesBtn'); await page.evaluate(() => { wgOpen(); toast('A message on the screen'); }); await page.waitForTimeout(400);
    const screen = await printedChrome(page);
    ok(screen.panels.length >= 4, scheme + ': on screen there is plenty of app around the pages (' + screen.panels.join(' ') + ')');
    await page.emulateMedia({media: 'print'}); await page.waitForTimeout(300);
    const p = await printedChrome(page);
    ok(p.body.length === 0 && p.panels.length === 0 && p.page.length === 0, scheme + ': printing shows no toolbar, panel, pop-up, handle or button (' + [...p.body, ...p.panels, ...p.page].join(' ') + ')');
    ok(p.grain === 'none' && p.bg === 'rgb(255, 255, 255)' && p.bgImage === 'none', scheme + ': on plain white, with no paper grain or dots (' + p.bg + ', grain ' + p.grain + ')');
    const st = await page.evaluate(() => { const s = document.querySelector('#main .slide'), cs = getComputedStyle(s), m = getComputedStyle(document.getElementById('main')); return {bi: cs.breakInside, bg: cs.backgroundColor, mainW: document.getElementById('main').getBoundingClientRect().width, w: s.getBoundingClientRect().width, z: m.zoom, adj: getComputedStyle(document.querySelector('#main .strip')).printColorAdjust || getComputedStyle(document.querySelector('#main .strip')).webkitPrintColorAdjust}; });
    ok(st.bi === 'avoid' && st.adj === 'exact', scheme + ': a slide stays whole on a printed page, and its picture is printed without "Background graphics" (break-inside ' + st.bi + ', colour adjust ' + st.adj + ')');
    if (HAVE_POPPLER) {
      const file = D + scheme + '.pdf';
      await page.pdf({path: file, printBackground: false, preferCSSPageSize: true});
      const text = tool('pdftotext', ['-layout', file, '-']) || '', info = tool('pdfinfo', [file]) || '', pages = +(info.match(/Pages:\s+(\d+)/) || [])[1];
      const bad = ['Saved in this browser', 'Show toolbar', 'Hide notes', 'Between the Slides', 'Download', 'Study mode', 'A message on the screen', 'Writing guide', 'Add note', 'Notes list'].filter(t => text.includes(t));
      ok(bad.length === 0, scheme + ': the printout has none of the app\'s own words (' + (bad.join(', ') || 'none') + ')');
      ok(/Elasticity is about slopes/.test(text), scheme + ': it has the note you wrote (the pages themselves are pictures)');
      ok(pages >= 2 && pages <= slides, scheme + ': ' + slides + ' slides print on ' + pages + ' pages, two to a portrait page');
      const imgs = (tool('pdfimages', ['-list', file]) || '').split('\n').filter(l => /^\s*\d+\s+\d+\s+image\s/.test(l)).length;
      ok(imgs >= slides, scheme + ': every page\'s picture is in the printout (' + imgs + ' pictures for ' + slides + ' slides)');
    }
    await page.emulateMedia({media: 'screen'}); await page.waitForTimeout(200);
    const back = await printedChrome(page);
    ok(back.panels.length >= 4 && back.body.length > 0, scheme + ': and back on screen the app is all there again');
    finish(errors, 'print ' + scheme); await browser.close();
  }
  if (!HAVE_POPPLER) { console.log('    (pdftotext and pdfinfo are not installed: the printout itself was not read)'); return; }
  // a blank notebook in the dark theme prints on white, not the cream of its dark-theme page
  {
    const {browser, page, errors} = await open(APP, {width: 1440, height: 900, colorScheme: 'dark'});
    await page.waitForTimeout(600);
    await newNote(page, 'A page of my own'); await page.emulateMedia({media: 'print'}); await page.waitForTimeout(300);
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('#main .slide')).backgroundColor) === 'rgb(255, 255, 255)', 'dark: a page you started yourself prints white');
    finish(errors, 'print blank'); await browser.close();
  }
  // a landscape page takes the slides bigger
  {
    const {browser, page, errors} = await open(APP, {width: 1440, height: 900});
    await page.waitForTimeout(600);
    await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf')); await pdfCards(page, 6); await page.waitForTimeout(900);
    await page.emulateMedia({media: 'print'}); await page.waitForTimeout(200);
    const file = D + 'landscape.pdf'; await page.pdf({path: file, printBackground: false, landscape: true, preferCSSPageSize: false});
    const info = tool('pdfinfo', [file]) || '';
    const size = (info.match(/Page size:\s+([\d.]+) x ([\d.]+)/) || []).slice(1).map(Number);
    ok(size[0] > size[1], 'a landscape printout is a landscape page (' + size.join(' x ') + ')');
    ok(+(info.match(/Pages:\s+(\d+)/) || [])[1] >= 4, 'and takes a page for each slide or so (' + (info.match(/Pages:\s+(\d+)/) || [])[1] + ' pages)');
    finish(errors, 'print landscape'); await browser.close();
  }
  // the A4 layout: one sheet to a page, A4 sized, with no margin
  {
    const {browser, page, errors} = await open(APP, {width: 1440, height: 900});
    await page.waitForTimeout(600);
    await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf')); await pdfCards(page, 6); await page.waitForTimeout(900);
    await page.click('#tab-view'); await page.selectOption('#layout', 'a4-portrait'); await page.waitForTimeout(900);
    const sheets = await page.locator('#main .sheet').count();
    await page.emulateMedia({media: 'print'}); await page.waitForTimeout(200);
    const file = D + 'a4.pdf'; await page.pdf({path: file, printBackground: false, preferCSSPageSize: true});
    const info = tool('pdfinfo', [file]) || '', size = (info.match(/Page size:\s+([\d.]+) x ([\d.]+)/) || []).slice(1).map(Math.round);
    ok(sheets >= 2 && size.join() === '595,842', 'A4 layout: the printout is A4 pages (' + size.join(' x ') + ' points)');
    ok(+(info.match(/Pages:\s+(\d+)/) || [])[1] === sheets, 'A4 layout: one page for each of the ' + sheets + ' sheets (' + (info.match(/Pages:\s+(\d+)/) || [])[1] + ' pages)');
    finish(errors, 'print A4'); await browser.close();
  }
  // side pages on: the words on a side page are printed too
  {
    const {browser, page, errors} = await open(APP, {width: 1440, height: 900});
    await page.waitForTimeout(600);
    await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf')); await pdfCards(page, 6); await page.waitForTimeout(900);
    await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(600);
    await page.evaluate(() => { const sp = document.querySelectorAll('.sidepage')[1]; sideAddBox(sp, 40, 120, 200); }); await page.keyboard.type('Side note: price elasticity'); await page.mouse.click(5, 700); await page.waitForTimeout(700);
    await page.emulateMedia({media: 'print'}); await page.waitForTimeout(200);
    const file = D + 'side.pdf'; await page.pdf({path: file, printBackground: false, preferCSSPageSize: true});
    ok(/Side note: price elasticity/.test((tool('pdftotext', ['-layout', file, '-']) || '').replace(/\s+/g, ' ')), 'side pages on: the side page and its note are in the printout');
    finish(errors, 'print side'); await browser.close();
  }
});

(async () => {
  for (const [name, fn] of Object.entries(SECTIONS)) {
    if (only.length && !only.includes(name)) continue;
    console.log('--- ' + name);
    await fn();
  }
  console.log('no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

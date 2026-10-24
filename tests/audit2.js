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

(async () => {
  for (const [name, fn] of Object.entries(SECTIONS)) {
    if (only.length && !only.includes(name)) continue;
    console.log('--- ' + name);
    await fn();
  }
  console.log('no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

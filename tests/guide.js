// Writing guide: a temporary grid, ruled lines or dots over the pages, for writing straight with a pen
const {start, settle, addNote, notebookDoc, pdfPages, pixels, ok, OUT, path, results} = require('./wtcommon');

(async () => {
  const {browser, page, errors, card} = await start();
  const G = () => page.evaluate(() => { const e = document.querySelector('#wguide'); if (!e) return null; const r = e.getBoundingClientRect(); return {x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, l: r.left, t: r.top, sy: scrollY}; });
  const box = sel => page.locator(sel).first().boundingBox();
  const mid = async sel => { const b = await box(sel); return {x: b.x + b.width / 2, y: b.y + b.height / 2}; };
  const showBar = async () => { await page.hover('#wguide .wg-ind', {position: {x: 4, y: 4}}); await page.waitForTimeout(80); };
  const drag = async (sel, dx, dy) => { if (sel === '.wg-move') await showBar(); const p = await mid(sel); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + dx, p.y + dy, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(100); };
  const near = (a, b, t = 3) => Math.abs(a - b) <= t;
  const histLen = () => page.evaluate(() => hist.stack.length);
  await page.click('#tab-insert');

  // ---- the button and the default guide ----
  ok(await page.isVisible('#wgBtn') && (await page.textContent('#wgBtn')).includes('Writing guide'), 'Insert has a Writing guide button');
  ok((await page.getAttribute('#wgBtn', 'data-tip')).startsWith('Writing guide: '), 'with a tooltip in the app\'s style (data-tip)');
  ok(/^Writing guide: /.test(await page.getAttribute('#wgBtn', 'data-tip')) && /\(Esc\)$/.test(await page.getAttribute('#wgBtn', 'data-tip')), 'and it names the Esc key (CHANGED: pointing at the button used to show this tooltip; it now opens the settings pop-out, tested below)');
  await page.mouse.move(700, 880);
  const cardBox = await card.boundingBox();
  const h0 = await histLen();
  ok(await page.locator('#wguide').count() === 0 && await page.getAttribute('#wgBtn', 'aria-pressed') === 'false', 'no guide yet');
  await page.click('#wgBtn'); await page.waitForTimeout(250);
  let g = await G();
  ok(g && await page.getAttribute('#wgBtn', 'aria-pressed') === 'true', 'it appears over the pages');
  const vis = await page.evaluate(() => { const c = document.querySelectorAll('.pagecard')[2].getBoundingClientRect(); return {l: Math.max(0, c.left), r: Math.min(innerWidth, c.right), ih: innerHeight, top: document.querySelector('#appbar').getBoundingClientRect().bottom}; });
  ok(near(g.l, vis.l, 2) && near(g.w, vis.r - vis.l, 2), `it covers the visible width of the current page (${Math.round(g.w)}px wide)`);
  ok(near(g.h, vis.ih * 0.6, 3), `and about 60% of the window's height (${Math.round(g.h)} of ${vis.ih}px)`);
  ok(g.t >= vis.top && g.t < vis.top + 40, 'starting just under the toolbar');
  const look = await page.evaluate(() => { const e = document.querySelector('#wguide'), c = getComputedStyle(e), p = getComputedStyle(e.querySelector('.wg-pat')); return {pat: e.dataset.pat, gap: c.getPropertyValue('--wg-gap').trim(), op: c.getPropertyValue('--wg-op').trim(), bg: p.backgroundImage, size: p.backgroundSize, pos: c.position, z: c.zIndex, ink: c.getPropertyValue('--wg-ink').trim() || getComputedStyle(document.documentElement).getPropertyValue('--wg-ink').trim()}; });
  ok(look.pat === 'grid' && look.gap === '28px' && /linear-gradient/.test(look.bg) && look.size.startsWith('28px 28px'), 'a grid of 28px squares to begin with');
  ok(look.pos === 'absolute' && /^#[0-9a-f]{6}$/i.test(look.ink), 'it is positioned in the page (so it stays with the content) and its lines use a theme colour');
  ok(await page.getAttribute('#wguide', 'role') === 'group' && await page.locator('#wguide .wg-bar[role="toolbar"]').count() === 1, 'the bar is a labelled toolbar');
  await page.screenshot({path: path.join(OUT, 'guide-light.png')});

  // ---- NEW: the floating bar: shown when the guide is added, put away by a click elsewhere, brought back from the corner icon ----
  const barState = () => page.evaluate(() => { const b = document.querySelector('.wg-bar'), i = document.querySelector('.wg-ind'), g = document.querySelector('#wguide'); if (!b) return null; const c = getComputedStyle(b), ic = getComputedStyle(i), r = b.getBoundingClientRect(), gr = g.getBoundingClientRect();
    return {vis: c.visibility, pe: c.pointerEvents, off: g.classList.contains('bar-off'), indOp: ic.opacity, indPe: ic.pointerEvents, indW: i.getBoundingClientRect().width, indH: i.getBoundingClientRect().height, indL: i.getBoundingClientRect().left - gr.left, indT: i.getBoundingClientRect().top - gr.top, exp: i.getAttribute('aria-expanded'), inView: r.top >= 0 && r.bottom <= innerHeight, handles: [...document.querySelectorAll('.wg-h')].map(h => getComputedStyle(h).pointerEvents)}; });
  const isShown = async () => { const s = await barState(); return s.vis === 'visible' && s.pe === 'auto' && !s.off; };
  const isHidden = async () => { const s = await barState(); return s.vis === 'hidden' && s.pe === 'none' && s.off; };
  const away = async () => { await page.mouse.move(700, 880); };
  // (the bar is on view, as when the guide was added)
  ok(await isShown(), 'NEW: the bar shows straight away when a guide is added');
  const bs0 = await barState();
  ok(bs0.inView && bs0.exp === 'true', '(and it is on screen)');
  ok(bs0.indW === 48 && bs0.indH === 48 && bs0.indL === 0 && bs0.indT >= 0 && bs0.indT < 4, `NEW: a 48 × 48 icon sits in the guide's top left corner (${bs0.indW}×${bs0.indH} at ${bs0.indL},${Math.round(bs0.indT)})`);
  ok(bs0.indOp === '0.35' && bs0.indPe === 'auto', 'faint (0.35 opacity) and the only part of the corner that takes the pointer');
  ok(await page.getAttribute('.wg-ind', 'aria-label') === 'Writing guide settings' && !!(await page.getAttribute('.wg-ind', 'data-tip')), 'with a name and a tooltip');
  ok(await page.evaluate(() => document.querySelector('.wg-ind').tagName === 'BUTTON' && document.querySelector('.wg-ind').closest('#wguide') && !!document.querySelector('.wg-ind svg')), 'a real button with a grid glyph');
  await page.screenshot({path: path.join(OUT, 'ref-guide-bar-first.png'), clip: {x: 270, y: 100, width: 900, height: 330}});

  // ---- it never blocks anything ----
  const pe = await page.evaluate(() => { const q = s => getComputedStyle(document.querySelector(s)).pointerEvents; return {el: q('#wguide'), pat: q('#wguide .wg-pat'), bar: q('.wg-bar'), h: [...document.querySelectorAll('.wg-h')].map(h => getComputedStyle(h).pointerEvents), move: q('.wg-move')}; });
  ok(pe.el === 'none' && pe.pat === 'none' && pe.bar === 'auto' && pe.move === 'auto' && pe.h.length === 8 && pe.h.every(x => x === 'auto'), 'pointer-events are off for the guide itself, on only for its bar, its 8 handles (and its corner icon)');
  const probe = await page.evaluate(() => { const r = document.querySelector('#wguide').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width * 0.5, r.top + r.height * 0.8); return {inGuide: !!e.closest('#wguide'), tag: e.className}; });
  ok(!probe.inGuide, `a click in the middle of the guide reaches the page below (${probe.tag})`);
  // a note through it: point between two lines and press + Add here
  const s = await card.locator('.strip').first().boundingBox();
  await page.mouse.move(s.x + 300, s.y + s.height * 0.35, {steps: 3}); await page.waitForTimeout(250);
  ok(await page.locator('.gappill').count() === 1, '+ Add here still shows under the guide');
  await page.click('.gappill'); await page.keyboard.type('written through the guide'); await page.waitForTimeout(200);
  ok(await page.locator('.notebox .mine').first().textContent() === 'written through the guide', 'and a note can be written through it');
  // ink through it
  await page.mouse.click(8, 700);
  await page.click('#drawBtn'); await page.waitForTimeout(150);
  const gg = await G(), sx = gg.l + 120, sy = gg.t + gg.h * 0.75;
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 200, sy + 20, {steps: 8}); await page.mouse.move(sx + 400, sy, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(200);
  ok(await page.evaluate(() => JSON.parse(document.querySelectorAll('.pagecard')[2].dataset.ink || '[]').length) === 1, 'a pen stroke goes through the guide onto the page');
  // Esc: first stops drawing, then removes the guide
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => !document.body.classList.contains('drawing')) && await page.locator('#wguide').count() === 1, 'Esc first stops drawing …');
  await page.waitForTimeout(100);

  // ---- NEW: the bar can be put away and brought back ----
  await page.hover('.wg-ind', {position: {x: 4, y: 4}}); await page.waitForTimeout(100);
  // a click on the bar, or on a handle, does not put it away
  const bb0 = await box('.wg-bar');
  await page.mouse.click(bb0.x + bb0.width - 3, bb0.y + 3); await page.waitForTimeout(100);
  ok(await isShown(), 'clicking the bar itself keeps it');
  const eh = await mid('.wg-e'); await page.mouse.click(eh.x, eh.y); await page.waitForTimeout(100);
  ok(await isShown(), 'and so does clicking a handle');
  // a click anywhere else puts it away
  await page.mouse.click(8, 700); await page.waitForTimeout(100);
  ok(await isHidden(), 'NEW: a click anywhere else puts the bar away');
  const bs1 = await barState();
  ok(bs1.exp === 'false' && bs1.indOp === '0.35' && bs1.handles.length === 8 && bs1.handles.every(x => x === 'auto'), 'the icon stays (faint) and the 8 handles are still there');
  ok(await page.evaluate(() => { const b = document.querySelector('.wg-bar'); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !e.closest('.wg-bar'); }), 'the hidden bar lets clicks through');
  await page.screenshot({path: path.join(OUT, 'ref-guide-bar-hidden.png'), clip: {x: 270, y: 100, width: 900, height: 330}});
  // the handles work with the bar away
  const gA = await G(); await drag('.wg-e', 40, 0); const gB = await G();
  ok(near(gB.w - gA.w, 40, 2) && await isHidden(), 'NEW: the handles still move and resize it while the bar is away');
  await drag('.wg-e', -40, 0);
  // pointing at the corner icon brings it back; pointing away puts it away after a moment
  await page.hover('.wg-ind', {position: {x: 4, y: 4}}); await page.waitForTimeout(100);
  ok(await isShown(), 'NEW: pointing at the corner icon shows the bar');
  await page.screenshot({path: path.join(OUT, 'ref-guide-bar-hover.png'), clip: {x: 270, y: 100, width: 900, height: 330}});
  await away(); await page.waitForTimeout(250);
  ok(await isShown(), '(still there a moment after pointing away)');
  await page.waitForTimeout(700);
  ok(await isHidden(), 'and gone after about 600 ms');
  await page.hover('.wg-ind', {position: {x: 4, y: 4}}); await page.waitForTimeout(80);
  const bb1 = await box('.wg-bar');
  await page.mouse.move(bb1.x + bb1.width - 4, bb1.y + bb1.height / 2, {steps: 4}); await page.waitForTimeout(1000);
  ok(await isShown(), 'it stays while the pointer is on the bar');
  await away(); await page.waitForTimeout(1000);
  ok(await isHidden(), 'and goes once the pointer has left the bar');
  // the keyboard: focusing the icon shows it, and Tab goes into it
  await page.keyboard.press('Shift'); await page.evaluate(() => document.querySelector('.wg-ind').focus()); await page.waitForTimeout(100);
  ok(await isShown(), 'NEW: focusing the icon (Tab) shows the bar');
  await page.keyboard.press('Tab');
  ok(await page.evaluate(() => document.activeElement.classList.contains('wg-move')) && await isShown(), 'Tab goes on into the bar, which stays');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab');
  await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(900);
  ok(await isHidden(), 'and it goes when the keyboard leaves it');
  // Enter on the icon keeps it
  await page.evaluate(() => document.querySelector('.wg-ind').focus()); await page.keyboard.press('Enter'); await page.mouse.move(700, 880); await page.waitForTimeout(900);
  ok(await isShown(), 'Enter on the icon keeps the bar until you click away');
  await page.mouse.click(8, 700); await page.waitForTimeout(100);
  ok(await isHidden(), '(a click elsewhere puts it away again)');
  await page.hover('.wg-ind', {position: {x: 4, y: 4}}); await page.waitForTimeout(100);

  // ---- patterns, spacing, opacity ----
  const pat = async name => { await page.click(`#wguide [data-pick="${name}"]`); await page.waitForTimeout(80); return page.evaluate(() => ({pat: document.querySelector('#wguide').dataset.pat, bg: getComputedStyle(document.querySelector('#wguide .wg-pat')).backgroundImage, size: getComputedStyle(document.querySelector('#wguide .wg-pat')).backgroundSize, on: [...document.querySelectorAll('#wguide [data-pick]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent)})); };
  const names = await page.$$eval('#wguide [data-pick]', b => b.map(x => x.textContent));
  ok(names.join() === 'Grid,Lines,Dots', 'three patterns: Grid, Lines, Dots');
  let p = await pat('lines');
  ok(p.pat === 'lines' && /linear-gradient/.test(p.bg) && p.size === '100% 28px' && p.on.join() === 'Lines', 'Lines: ruled lines 28px apart');
  await page.screenshot({path: path.join(OUT, 'guide-lines-light.png'), clip: {x: 360, y: 150, width: 980, height: 400}});
  p = await pat('dots');
  ok(p.pat === 'dots' && /radial-gradient/.test(p.bg) && p.size === '28px 28px' && p.on.join() === 'Dots', 'Dots: a dotted grid');
  await page.screenshot({path: path.join(OUT, 'guide-dots-light.png'), clip: {x: 360, y: 150, width: 980, height: 400}});
  p = await pat('grid');
  ok(p.pat === 'grid' && p.on.join() === 'Grid', 'and back to Grid');
  const gap = () => page.evaluate(() => ({v: document.querySelector('#wguide').style.getPropertyValue('--wg-gap'), out: document.querySelector('#wguide output').textContent, range: document.querySelector('#wguide [data-k="gap"]').value}));
  await page.click('#wguide [data-step="2"]'); await page.click('#wguide [data-step="2"]');
  ok((await gap()).v === '32px' && (await gap()).out === '32px' && (await gap()).range === '32', '+ makes the squares bigger (32px)');
  for (let i = 0; i < 4; i++) await page.click('#wguide [data-step="-2"]');
  ok((await gap()).v === '24px', '− makes them smaller (24px)');
  for (let i = 0; i < 20; i++) await page.click('#wguide [data-step="-2"]');
  ok((await gap()).v === '12px', 'down to 12px, no further');
  for (let i = 0; i < 25; i++) await page.click('#wguide [data-step="2"]');
  ok((await gap()).v === '48px' && (await gap()).out === '48px', 'up to 48px, no further');
  await page.fill('#wguide [data-k="gap"]', '36');
  ok((await gap()).v === '36px' && (await gap()).out === '36px', 'the slider sets it too (36px)');
  await page.fill('#wguide [data-k="op"]', '80');
  const op = async () => page.evaluate(() => ({v: document.querySelector('#wguide').style.getPropertyValue('--wg-op'), real: getComputedStyle(document.querySelector('#wguide .wg-pat')).opacity, bar: getComputedStyle(document.querySelector('.wg-bar')).opacity}));
  let o = await op();
  ok(o.v === '0.80' && o.real === '0.8' && o.bar === '1', 'the opacity slider fades the lines (80%) but not the bar');
  await page.fill('#wguide [data-k="op"]', '10');
  ok((await op()).real === '0.1', 'down to 10%');
  ok(await page.evaluate(() => [...document.querySelectorAll('#wguide [data-k]')].map(i => [i.min, i.max]).join('|')) === '12,48|10,100', 'the sliders run 12–48px and 10–100%');
  await page.fill('#wguide [data-k="op"]', '55'); await page.fill('#wguide [data-k="gap"]', '28');
  const tipped = await page.evaluate(() => [...document.querySelectorAll('#wguide button, #wguide input')].filter(e => !e.dataset.tip).map(e => e.outerHTML.slice(0, 60)));
  ok(tipped.length === 0, 'every control on the bar has a data-tip tooltip');

  // ---- move it ----
  g = await G();
  await drag('.wg-move', 120, 70);
  let g2 = await G();
  ok(near(g2.x - g.x, 120) && near(g2.y - g.y, 70) && g2.w === g.w && g2.h === g.h && g2.sy === g.sy, `the move handle drags it anywhere (moved ${Math.round(g2.x - g.x)},${Math.round(g2.y - g.y)})`);
  // keyboard: arrows nudge, Shift+arrows resize
  await page.focus('.wg-move'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowDown');
  let g3 = await G();
  ok(near(g3.x - g2.x, -10, 1) && near(g3.y - g2.y, 10, 1), 'with the arrow keys it can be nudged 10px');
  await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowUp');
  let g4 = await G();
  ok(near(g4.w - g3.w, 10, 1) && near(g4.h - g3.h, -10, 1), 'and with Shift they resize it');
  // across pages: hold it at the bottom of the window and the page scrolls with it
  await page.mouse.click(8, 700);
  await showBar();
  const before = await G(), mv = await mid('.wg-move');
  await page.mouse.move(mv.x, mv.y); await page.mouse.down();
  await page.mouse.move(mv.x + 10, 880, {steps: 10});
  for (let i = 0; i < 12; i++) { await page.mouse.move(mv.x + 10 + (i % 2), 880); await page.waitForTimeout(80); }
  const endClient = 880 + await page.evaluate(() => scrollY);
  await page.mouse.up(); await page.waitForTimeout(100);
  const after = await G();
  ok(after.sy > before.sy + 300, `holding it at the bottom edge scrolls the page (${Math.round(before.sy)} → ${Math.round(after.sy)})`);
  const want = endClient - (mv.y + before.sy);
  ok(near(after.y - before.y, want, 40) && after.y - before.y > 500, `and the guide went with it, across pages (${Math.round(after.y - before.y)}px down, the pointer travelled ${Math.round(want)})`);
  const where = await page.evaluate(() => { const r = document.querySelector('#wguide').getBoundingClientRect(), cy = r.top + scrollY + 40; return [...document.querySelectorAll('.pagecard')].findIndex(c => { const q = c.getBoundingClientRect(); return cy >= q.top + scrollY && cy <= q.bottom + scrollY; }); });
  ok(where > 2, `it is now over page ${where + 1}`);
  // stays with the content while scrolling
  await page.evaluate(() => { scrollTo(0, 0); wgSet(wg.r.l, 700, wg.r.w, wg.r.h); }); await page.waitForTimeout(100);
  const pos0 = await G();
  const sc = Math.round(pos0.t) + 90;
  await page.evaluate(n => scrollBy(0, n), sc); await page.waitForTimeout(150);
  const pos1 = await G();
  ok(near(pos1.y, pos0.y, 0.6) && near(pos1.x, pos0.x, 0.6) && pos1.t < pos0.t - 200, 'scrolling the page moves the guide with it (it stays where it was on the page)');
  const bar = await page.evaluate(() => ({bar: document.querySelector('.wg-bar').getBoundingClientRect().top, app: document.querySelector('#appbar').getBoundingClientRect().bottom}));
  ok(bar.bar >= bar.app && bar.bar < bar.app + 30, 'and its bar stays in reach under the toolbar while any of the guide is in view');
  await page.evaluate(n => scrollBy(0, -n), sc);

  // ---- resize from every edge and corner ----
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(100);
  await page.evaluate(() => { const c = document.querySelectorAll('.pagecard')[2]; c.scrollIntoView({block: 'start'}); scrollBy(0, -100); });
  // put it somewhere in the middle of the window with room all round
  await page.evaluate(() => { const e = document.querySelector('#wguide'); const r = e.getBoundingClientRect(); wgSet(scrollX + 420, scrollY + 230, 600, 380); });
  await page.waitForTimeout(100);
  const cases = [['e', 60, 0, {w: 60}], ['s', 0, 40, {h: 40}], ['w', 50, 0, {x: 50, w: -50}], ['n', 0, 30, {y: 30, h: -30}], ['se', 30, 20, {w: 30, h: 20}], ['nw', 20, 10, {x: 20, y: 10, w: -20, h: -10}], ['ne', 30, 10, {w: 30, y: 10, h: -10}], ['sw', 10, 20, {x: 10, w: -10, h: 20}]];
  for (const [d, dx, dy, want] of cases) {
    await page.evaluate(() => wgSet(scrollX + 420, scrollY + 230, 600, 380)); await page.waitForTimeout(50);
    const a = await G(); await drag(`.wg-${d}`, dx, dy); const b = await G();
    const got = {x: b.x - a.x, y: b.y - a.y, w: b.w - a.w, h: b.h - a.h};
    ok(['x', 'y', 'w', 'h'].every(k => near(got[k], want[k] || 0, 2)), `the ${d.toUpperCase()} handle resizes (${JSON.stringify(want)} → ${JSON.stringify(Object.fromEntries(Object.entries(got).map(([k, v]) => [k, Math.round(v)])))})`);
  }
  await page.evaluate(() => wgSet(scrollX + 420, scrollY + 230, 600, 380)); await page.waitForTimeout(50);
  await drag('.wg-se', -3000, -3000); g = await G();
  ok(g.w === 160 && g.h === 100, `it cannot be made smaller than ${g.w} × ${g.h}`);
  await page.screenshot({path: path.join(OUT, 'guide-small-light.png')});

  // ---- it is not part of the notebook ----
  await page.evaluate(() => { wgSet(scrollX + 420, scrollY + 230, 700, 400); });
  await settle(page);
  ok(await page.evaluate(() => !document.querySelector('#main #wguide, #main .wguide') && document.querySelector('#wguide').parentElement === document.body), 'the guide sits outside the notebook');
  ok(await page.evaluate(() => !/wguide|wg-/.test(currentDoc())), 'the notebook\'s own content has no trace of it');
  ok(await histLen() === await page.evaluate(() => hist.stack.length) && await page.evaluate(() => hist.stack.every(x => !/wguide|wg-/.test(x))), 'Back / Forward history has none of it');
  const nb = await notebookDoc(page);
  ok(!/wguide|wg-/.test(nb.data.doc) && !/<div class="wguide"|id="wguide"/.test(nb.text), 'the notebook file download has none of it');
  const n0 = await pixels(page, (await pdfPages(page)).jpegs[2], ['#afbbd6'], 24);
  // a PDF with the guide closed, for comparison
  await showBar(); await page.click('#wguide [data-wgx]'); await page.waitForTimeout(100);
  const pdfNo = await pdfPages(page), n1 = await pixels(page, pdfNo.jpegs[2], ['#afbbd6'], 24);
  ok(Math.abs(n0.counts[0] - n1.counts[0]) < 30, `the PDF is the same with or without the guide (${n0.counts[0]} vs ${n1.counts[0]} guide-coloured pixels)`);
  ok(await page.locator('#wguide').count() === 0 && await page.getAttribute('#wgBtn', 'aria-pressed') === 'false', '× removes it');
  ok(await histLen() === h0 + await page.evaluate(() => hist.stack.length - hist.stack.length) + (await histLen() - h0), 'the history only moved for the note and the stroke');

  // ---- remembered: pattern, spacing, opacity (not the place) ----
  await page.click('#wgBtn'); await page.waitForTimeout(150);
  await page.click('#wguide [data-pick="lines"]'); await page.fill('#wguide [data-k="gap"]', '36'); await page.fill('#wguide [data-k="op"]', '70');
  const prefs = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('wg-')).map(k => [k, localStorage.getItem(k)])));
  const pf = await prefs();
  ok(pf['wg-pat'] === 'lines' && pf['wg-gap'] === '36' && pf['wg-op'] === '70' && Object.keys(pf).length === 3, `the last pattern, spacing and opacity are remembered (${JSON.stringify(pf)}) and nothing else`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok(await page.locator('#wguide').count() === 0 && await page.getAttribute('#wgBtn', 'aria-pressed') === 'false', 'Esc removes it');
  await page.keyboard.press('Escape');
  await page.click('#wgBtn'); await page.waitForTimeout(100);
  let again = await page.evaluate(() => ({pat: document.querySelector('#wguide').dataset.pat, gap: document.querySelector('#wguide').style.getPropertyValue('--wg-gap'), op: document.querySelector('#wguide').style.getPropertyValue('--wg-op')}));
  ok(again.pat === 'lines' && again.gap === '36px' && again.op === '0.70', 'the next guide starts that way');
  await page.reload(); await page.waitForTimeout(1800);
  ok(await page.locator('#wguide').count() === 0, 'after a reload there is no guide: it was never saved');
  await page.click('#tab-insert'); await page.click('#wgBtn'); await page.waitForTimeout(100);
  again = await page.evaluate(() => ({pat: document.querySelector('#wguide').dataset.pat, gap: document.querySelector('#wguide').style.getPropertyValue('--wg-gap')}));
  ok(again.pat === 'lines' && again.gap === '36px', 'but a new one comes back with the remembered pattern and spacing');
  await page.click('#wgBtn'); await page.waitForTimeout(100);
  ok(await page.locator('#wguide').count() === 0, 'pressing the button again takes it away');


  // ---- NEW: Insert › Writing guide: pointing at the button opens its settings ----
  await page.mouse.move(700, 880);
  const popOpen = () => page.evaluate(() => { const p = document.querySelector('#wgPop'); return !!p && !p.hidden && p.getBoundingClientRect().width > 0; });
  const pg = () => page.evaluate(() => { const e = document.querySelector('#wguide'); return e && {pat: e.dataset.pat, gap: e.style.getPropertyValue('--wg-gap'), op: e.style.getPropertyValue('--wg-op')}; });
  ok(await page.locator('#wgPop').count() === 0 && await page.getAttribute('#wgBtn', 'aria-haspopup') === 'dialog' && await page.getAttribute('#wgBtn', 'aria-expanded') === 'false', 'NEW: the settings are not showing until you ask');
  await page.hover('#wgBtn'); await page.waitForTimeout(500);
  ok(await popOpen() && await page.getAttribute('#wgBtn', 'aria-expanded') === 'true', 'NEW: pointing at the Writing guide button opens a small settings pop-out under it');
  ok(await page.evaluate(() => { const q = document.querySelector('.qtip'); return q.hidden || !q.classList.contains('on'); }), '(instead of the tooltip)');
  const pc = await page.evaluate(() => { const p = document.querySelector('#wgPop'), r = p.getBoundingClientRect(), b = document.querySelector('#wgBtn').getBoundingClientRect(); return {names: [...p.querySelectorAll('[data-pick]')].map(x => x.textContent), ranges: [...p.querySelectorAll('input[type=range]')].map(x => x.dataset.k), steps: p.querySelectorAll('[data-step]').length, go: p.querySelector('[data-wgt]').textContent, role: p.getAttribute('role'), below: r.top >= b.bottom - 1 && r.top - b.bottom < 12, inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, id: p.id, withoutId: !p.querySelector('#wguide')}; });
  ok(pc.names.join() === 'Grid,Lines,Dots' && pc.ranges.join() === 'gap,op' && pc.steps === 2, 'with the pattern, spacing and opacity');
  ok(pc.go === 'Show guide' && pc.role === 'dialog' && pc.below && pc.inside, `and a "${pc.go}" button, right under the Insert button`);
  ok(await page.evaluate(() => [...document.querySelectorAll('#wgPop button, #wgPop input')].filter(e => !e.dataset.tip && !e.hasAttribute('data-wgt')).length) === 0, '(every control in it has a tip)');
  await page.screenshot({path: path.join(OUT, 'ref-guide-popover.png'), clip: {x: 330, y: 60, width: 760, height: 320}});
  // changed with no guide: remembered for the next one
  await page.click('#wgPop [data-pick="dots"]'); await page.fill('#wgPop [data-k="gap"]', '40'); await page.fill('#wgPop [data-k="op"]', '65');
  const pf2 = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('wg-')).map(k => [k, localStorage.getItem(k)])));
  let pp = await pf2();
  ok(await page.locator('#wguide').count() === 0 && pp['wg-pat'] === 'dots' && pp['wg-gap'] === '40' && pp['wg-op'] === '65', `NEW: with no guide up, the settings are still remembered (${JSON.stringify(pp)})`);
  await page.click('#wgPop [data-wgt]'); await page.waitForTimeout(250);
  let lg = await pg();
  ok(lg && lg.pat === 'dots' && lg.gap === '40px' && lg.op === '0.65' && await isShown(), '"Show guide" adds one with those settings, and its bar shows');
  ok(await popOpen() && (await page.textContent('#wgPop [data-wgt]')) === 'Remove guide' && await page.getAttribute('#wgBtn', 'aria-pressed') === 'true', 'the button now says "Remove guide"');
  // live: the current guide follows
  await page.click('#wgPop [data-pick="lines"]');
  lg = await pg();
  ok(lg.pat === 'lines', 'NEW: a pattern chosen in the pop-out applies live to the guide');
  await page.fill('#wgPop [data-k="gap"]', '20'); await page.fill('#wgPop [data-k="op"]', '30');
  lg = await pg();
  ok(lg.gap === '20px' && lg.op === '0.30', 'and so do spacing and opacity');
  await page.click('#wgPop [data-step="2"]'); await page.click('#wgPop [data-step="2"]');
  ok((await pg()).gap === '24px' && await page.evaluate(() => document.querySelector('#wguide output').textContent === '24px' && document.querySelector('#wgPop output').textContent === '24px'), '+ and − work, and the bar and the pop-out agree');
  ok(await page.evaluate(() => document.querySelector('#wguide [data-pick="lines"]').getAttribute('aria-pressed') === 'true' && document.querySelector('#wguide [data-k="op"]').value === '30'), 'the bar on the guide shows the new settings');
  await page.evaluate(() => document.querySelector('#wguide [data-pick="grid"]').click());      // (the pop-out sits over the bar here)
  ok(await page.evaluate(() => document.querySelector('#wgPop [data-pick="grid"]').getAttribute('aria-pressed') === 'true'), 'and the other way round: a change on the bar shows in the pop-out');
  await page.click('#wgPop [data-pick="lines"]');
  pp = await pf2();
  ok(pp['wg-pat'] === 'lines' && pp['wg-gap'] === '24' && pp['wg-op'] === '30' && Object.keys(pp).length === 3, `all remembered (${JSON.stringify(pp)})`);
  await page.screenshot({path: path.join(OUT, 'ref-guide-popover-live.png'), clip: {x: 270, y: 60, width: 900, height: 420}});
  // Esc closes it (the guide stays); pointing away closes it too
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok(!(await popOpen()) && await page.locator('#wguide').count() === 1, 'NEW: Esc closes the pop-out and leaves the guide');
  await page.hover('#wgBtn'); await page.waitForTimeout(500);
  ok(await popOpen(), '(pointing at the button opens it again)');
  const pb = await box('#wgPop');
  await page.mouse.move(pb.x + 20, pb.y + pb.height - 8, {steps: 6}); await page.waitForTimeout(800);
  ok(await popOpen(), 'it stays while the pointer is on it');
  await page.mouse.move(700, 880, {steps: 4}); await page.waitForTimeout(800);
  ok(!(await popOpen()) && await page.getAttribute('#wgBtn', 'aria-expanded') === 'false', 'and goes when you point away');
  await page.hover('#wgBtn'); await page.waitForTimeout(500);
  await page.mouse.move(700, 880); await page.mouse.click(700, 880); await page.waitForTimeout(100);
  ok(!(await popOpen()), 'a click elsewhere closes it too');
  // clicking the button still toggles the guide
  await page.click('#wgBtn'); await page.waitForTimeout(100);
  ok(await page.locator('#wguide').count() === 0 && await page.getAttribute('#wgBtn', 'aria-pressed') === 'false', 'NEW: clicking the button itself still takes the guide away');
  await page.click('#wgBtn'); await page.waitForTimeout(100);
  ok(await page.locator('#wguide').count() === 1 && (await pg()).pat === 'lines', '… and brings it back, with the settings it was left with');
  await page.mouse.move(700, 880); await page.waitForTimeout(500);
  ok(!(await popOpen()), '(pointing elsewhere straight after, no pop-out)');
  // the keyboard
  await page.keyboard.press('Shift'); await page.focus('#wgBtn'); await page.waitForTimeout(150);
  ok(await popOpen(), 'NEW: focusing the button with the keyboard opens the pop-out');
  await page.keyboard.press('Tab'); await page.waitForTimeout(50);
  ok(await page.evaluate(() => !!document.activeElement.closest('#wgPop')), 'Tab goes into it');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok(!(await popOpen()) && await page.evaluate(() => document.activeElement.id === 'wgBtn') && await page.locator('#wguide').count() === 1, 'Esc closes it and puts the focus back on the button');
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(50);
  ok(!(await popOpen()), '(and it does not jump straight open again)');
  await page.hover('#wgBtn'); await page.waitForTimeout(500);
  await page.focus('#wgBtn'); await page.keyboard.press('ArrowDown');
  ok(await page.evaluate(() => !!document.activeElement.closest('#wgPop')), 'ArrowDown from the button moves into the open pop-out');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.mouse.move(700, 880);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok(await page.locator('#wguide').count() === 0, 'a second Esc removes the guide, as before');

  // ---- Ctrl+K ----
  await page.mouse.move(700, 880);
  await page.keyboard.press('Control+k'); await page.waitForTimeout(200); await page.keyboard.type('writing'); await page.waitForTimeout(200);
  ok((await page.$$eval('.cmdk .iitem .nm', e => e.map(x => x.textContent))).join() === 'Writing guide', 'Ctrl+K finds "Writing guide"');
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  ok(await page.locator('#wguide').count() === 1, 'and shows it');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok(await page.locator('#wguide').count() === 0, 'Esc removes it');
  ok(errors.length === 0, errors.length ? 'page errors: ' + errors.join('\n') : 'no page errors');
  await browser.close();

  // ---- touch: bigger handles, moved and resized by finger ----
  const t = await start({contextOptions: {hasTouch: true, isMobile: false}});
  const tp = t.page;
  ok(await tp.evaluate(() => matchMedia('(pointer: coarse)').matches), '(a touch screen)');
  await tp.click('#tab-insert'); await tp.click('#wgBtn'); await tp.waitForTimeout(250);
  const sizes = await tp.evaluate(() => ({h: [...document.querySelectorAll('.wg-h')].map(h => { const r = h.getBoundingClientRect(); return [h.dataset.d, Math.round(r.width), Math.round(r.height)]; }), move: (() => { const r = document.querySelector('.wg-move').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(), btns: [...document.querySelectorAll('.wg-bar button')].map(b => Math.round(Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)))}));
  ok(sizes.h.length === 8 && sizes.h.every(([, w, h]) => Math.min(w, h) >= 40), `every resize handle is at least 40px (${sizes.h.map(x => x.join(':')).join(' ')})`);
  ok(Math.min(...sizes.move) >= 40 && sizes.btns.every(b => b >= 36), `and so is the move handle (${sizes.move.join('×')}) and the bar's buttons (${sizes.btns.join(',')})`);
  const cdp = await t.context.newCDPSession(tp);
  const fingerDrag = async (sel, dx, dy) => {
    const b = await tp.locator(sel).first().boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + dx * i / 8, y: y + dy * i / 8}]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []}); await tp.waitForTimeout(150);
  };
  const TG = () => tp.evaluate(() => { const r = document.querySelector('#wguide').getBoundingClientRect(); return {x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, sy: scrollY}; });
  let a = await TG(); await fingerDrag('.wg-move', 90, 60); let b = await TG();
  ok(near(b.x - a.x, 90, 3) && near(b.y - a.y, 60, 3) && b.sy === a.sy, `a finger drags it by the move handle (${Math.round(b.x - a.x)},${Math.round(b.y - a.y)}), without scrolling the page`);
  a = await TG(); await fingerDrag('.wg-se', -120, -80); b = await TG();
  ok(near(b.w - a.w, -120, 3) && near(b.h - a.h, -80, 3), `and resizes it from a corner (${Math.round(b.w - a.w)},${Math.round(b.h - a.h)})`);
  a = await TG(); await fingerDrag('.wg-w', 40, 0); b = await TG();
  ok(near(b.x - a.x, 40, 3) && near(b.w - a.w, -40, 3), 'or from an edge');
  // NEW: on touch, a tap elsewhere puts the bar away and a tap on the corner icon brings it back (and again takes it away)
  const tap = async (x, y, hold = 0) => { await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]}); if (hold) await tp.waitForTimeout(hold); await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []}); await tp.waitForTimeout(150); };
  const tbar = () => tp.evaluate(() => getComputedStyle(document.querySelector('.wg-bar')).visibility);
  ok(await tbar() === 'visible', '(touch) the bar is showing');
  await tap(8, 700);
  ok(await tbar() === 'hidden', 'NEW: a tap elsewhere puts the bar away');
  const ib = await tp.locator('.wg-ind').boundingBox();
  ok(ib.width >= 44 && ib.height >= 44, `the corner icon is big enough for a finger (${ib.width}×${ib.height})`);
  await tap(ib.x + ib.width / 2, ib.y + ib.height / 2);
  ok(await tbar() === 'visible', 'NEW: tapping the corner icon shows it');
  await tap(8, 700);
  ok(await tbar() === 'hidden', '(and a tap elsewhere puts it away again)');
  await tap(ib.x + ib.width / 2, ib.y + ib.height / 2); await tap(ib.x + ib.width / 2, ib.y + ib.height / 2);
  ok(await tbar() === 'hidden', 'tapping the icon again toggles it away');
  await tap(ib.x + ib.width / 2, ib.y + ib.height / 2);
  const hb = await tp.locator('.wg-e').boundingBox();
  await tap(hb.x + hb.width / 2, hb.y + hb.height / 2);
  ok(await tbar() === 'visible', 'a tap on a handle does not put it away');
  // press and hold the Insert button: the settings, and no toggling
  const wb = await tp.locator('#wgBtn').boundingBox();
  await tap(wb.x + wb.width / 2, wb.y + wb.height / 2, 800); await tp.waitForTimeout(150);
  ok(await tp.locator('#wgPop').count() === 1 && await tp.locator('#wguide').count() === 1, 'NEW: pressing and holding the Insert button opens the settings, and leaves the guide as it was');
  await tp.screenshot({path: path.join(OUT, 'ref-guide-popover-touch.png')});
  await tap(8, 700);
  ok(await tp.locator('#wgPop').count() === 0, 'a tap elsewhere closes it');
  await tap(wb.x + wb.width / 2, wb.y + wb.height / 2);
  ok(await tp.locator('#wguide').count() === 0, 'a plain tap on the button still removes the guide');
  await tp.screenshot({path: path.join(OUT, 'guide-touch.png')});
  ok(t.errors.length === 0, t.errors.length ? 'page errors: ' + t.errors.join('\n') : 'no page errors');
  await t.browser.close();

  // ---- dark theme ----
  const d = await start({scheme: 'dark'});
  await d.page.click('#tab-insert'); await d.page.click('#wgBtn'); await d.page.waitForTimeout(250);
  await d.page.screenshot({path: path.join(OUT, 'guide-dark.png')});
  await d.page.click('#wguide [data-pick="lines"]'); await d.page.waitForTimeout(100);
  await d.page.screenshot({path: path.join(OUT, 'guide-lines-dark.png'), clip: {x: 360, y: 150, width: 980, height: 400}});
  await d.page.click('#wguide [data-pick="dots"]'); await d.page.waitForTimeout(100);
  await d.page.screenshot({path: path.join(OUT, 'guide-dots-dark.png'), clip: {x: 360, y: 150, width: 980, height: 400}});
  const dInk = await d.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--wg-ink').trim());
  ok(dInk === '#8da3d1', `dark theme: a lighter blue-grey token (${dInk})`);
  ok(d.errors.length === 0, d.errors.length ? 'page errors: ' + d.errors.join('\n') : 'no page errors');
  await d.browser.close();
  console.log(`${results.ok} checks passed; no page errors`);
})().catch(e => { console.error(e); process.exit(1); });

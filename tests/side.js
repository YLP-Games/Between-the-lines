// Side notes: a notes page beside each slide, its paper, sync scrolling, and lines to highlights
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, context, page, errors} = await open(APP);
  await page.evaluate(() => localStorage.setItem('link-match', 'none'));      // (Link to side note: no question, both keep their colours)
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);
  const nPages = await page.locator('.pagecard').count();

  const rect = (sel, i = 0) => page.locator(sel).nth(i).evaluate(e => { const r = e.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom}; });
  const sp = i => page.locator('.sidepage').nth(i);
  const show = async i => { await page.locator('.pagecard').nth(i).scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 160)); await page.waitForTimeout(300); };
  const doc = () => page.evaluate(() => currentDoc());
  // each side page right after its slide in a stored copy of the notebook?
  const stored = () => page.evaluate(() => {
    const d = new DOMParser().parseFromString(currentDoc(), 'text/html'), kids = [...d.body.children];
    const slides = kids.filter(k => k.classList.contains('slide')), sides = kids.filter(k => k.classList.contains('sidepage'));
    return {slides: slides.length, sides: sides.length, right: slides.every(s => s.nextElementSibling?.classList.contains('sidepage') && s.nextElementSibling.dataset.for === s.dataset.sid), wrap: !!d.querySelector('.sidewrap, svg.sidelines')};
  });

  // ---- the View tab ----
  await page.click('#tab-view');
  ok(await page.isVisible('#sideBtn') && (await page.textContent('#sideBtn')).includes('Side notes') && await page.getAttribute('#sideBtn', 'aria-pressed') === 'false', 'View has a Side notes button (off)');
  ok(await page.getAttribute('#sideSync', 'aria-pressed') === 'true' && await page.getAttribute('#sideLinks', 'aria-pressed') === 'true', 'Sync scrolling and Link lines are on');
  ok((await page.textContent('#sideBgBtn')).includes('Side page background'), 'and a Side page background button');
  const grpBefore = await page.evaluate(() => document.querySelector('#sideBtn').closest('.grp').nextElementSibling.nextElementSibling.contains(document.getElementById('themeModes')));
  ok(grpBefore, 'the group sits just before the Theme group');
  ok(await page.locator('.sidepage:visible').count() === 0 && !(await page.evaluate(() => document.body.classList.contains('side-visible'))), 'no side pages yet');

  // ---- turn on: a page beside each slide, in its row, as tall at least ----
  await page.click('#sideBtn'); await page.waitForTimeout(500);
  ok(await page.getAttribute('#sideBtn', 'aria-pressed') === 'true', 'Side notes is on');
  ok(await page.locator('.sidepage').count() === nPages, 'a side page for each of the ' + nPages + ' slides');
  await show(1);
  let slide = await rect('.pagecard', 1), side = await rect('.sidepage', 1);
  ok(Math.abs(slide.y - side.y) < 2 && side.x >= slide.r, 'page 2\'s side page is beside it, in the same row');
  ok(side.h >= slide.h - 1, 'and at least as tall (' + Math.round(side.h) + ' >= ' + Math.round(slide.h) + ')');
  const all = await page.evaluate(() => [...document.querySelectorAll('.pagecard')].every((c, i) => { const s = document.querySelectorAll('.sidepage')[i], a = c.getBoundingClientRect(), b = s.getBoundingClientRect(); return Math.abs(a.top - b.top) < 2 && b.height >= a.height - 1 && b.left >= a.right; }));
  ok(all, 'every side page is level with its slide and as tall');
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('main')).display === 'grid'), 'main is a two-column grid');
  const st = await stored();
  ok(st.slides === nPages && st.sides === nPages && st.right && !st.wrap, 'saved: each side page right after its slide');
  ok(await sp(1).getAttribute('data-label') === 'Page 2' && await sp(1).getAttribute('aria-label') === 'Side notes for page 2', 'labelled Page 2');
  await page.screenshot({path: path.join(OUT, 'side-1-light.png')});

  // ---- a note on page 2's side page ----
  await page.mouse.click(side.x + 50, side.y + 140); await page.waitForTimeout(250);
  ok(await page.locator('.sidepage').nth(1).locator('.notebox').count() === 1, 'clicking the page adds a note box to it');
  ok(await page.evaluate(() => document.activeElement.matches('.sidepage .mine')), 'with the cursor in it');
  await page.keyboard.type('Remember the kinked demand curve'); await page.waitForTimeout(200);
  const nb = await rect('.sidepage .notebox');
  ok(nb.x >= side.x && nb.r <= side.r + 1 && Math.abs(nb.y - (side.y + 120)) < 30 && nb.x < side.x + 80, 'it is where you clicked, inside the page');
  ok(await page.locator('.sidepage .notebox').first().evaluate(b => b.classList.contains('floating') && !!b.dataset.px && !!b.dataset.py), 'a floating box (px, py)');
  await page.mouse.click(5, 700); await page.waitForTimeout(700);
  // drag it with the dots handle
  await page.locator('.sidepage .notebox').first().hover();
  const g = await rect('.sidepage .notebox .g-move'), before = await rect('.sidepage .notebox');
  await page.mouse.move(g.x + g.w / 2, g.y + g.h / 2); await page.mouse.down(); await page.mouse.move(g.x + g.w / 2 + 40, g.y + g.h / 2 + 50, {steps: 6}); await page.mouse.up(); await page.waitForTimeout(300);
  const after = await rect('.sidepage .notebox');
  ok(Math.abs(after.x - before.x - 40) < 6 && Math.abs(after.y - before.y - 50) < 6, 'dragging the dots moves it inside the side page');
  ok(after.r <= (await rect('.sidepage', 1)).r + 1, 'and it stays inside');
  // resize it
  const se = await rect('.sidepage .notebox .g-se');
  await page.mouse.move(se.x + 5, se.y + 5); await page.mouse.down(); await page.mouse.move(se.x + 45, se.y + 45, {steps: 5}); await page.mouse.up(); await page.waitForTimeout(300);
  const res = await rect('.sidepage .notebox');
  ok(res.w > after.w + 20 && res.h > after.h + 20, 'the corner handle resizes it');
  await page.mouse.click(5, 700); await page.waitForTimeout(700);
  // a box low down on a side page makes it taller than its slide
  const sp1 = await rect('.sidepage', 1);
  await page.mouse.click(sp1.x + 80, sp1.b - 30); await page.keyboard.type('Down here'); await page.mouse.click(5, 700); await page.waitForTimeout(700);
  ok((await rect('.sidepage', 1)).h >= (await rect('.pagecard', 1)).h, 'a side page is never shorter than its slide');
  // an empty box vanishes
  await page.mouse.click(sp1.x + 200, sp1.y + 300); await page.waitForTimeout(150);
  ok(await page.locator('.sidepage .notebox').count() === 3, 'a click makes a box');
  await page.mouse.click(5, 700); await page.waitForTimeout(500);
  ok(await page.locator('.sidepage .notebox').count() === 2, 'which vanishes if left empty');

  // ---- the Notes list ----
  await page.click('#notesBtn'); await page.waitForTimeout(600);
  const list = await page.$$eval('#noteList .ncard', cs => cs.map(c => [c.querySelector('.txt').textContent, c.querySelector('.meta').textContent]));
  ok(list.length === 2 && list.every(c => c[1].startsWith('Side note')) && list.some(c => c[0].includes('kinked')), 'side notes are in the Notes list, as Side note');
  ok(await page.$$eval('#noteList li', ls => ls.map(l => l.className === 'group' ? l.textContent : 'c')).then(a => a[0].startsWith('Page 2')), 'under their page');
  await page.click('#notesBtn');

  // ---- background colour and pattern ----
  await page.click('#sideBgBtn'); await page.waitForTimeout(200);
  ok(await page.isVisible('#sideBgPop') && await page.locator('#sideBgPop .sw').count() === 6 && await page.locator('#sideBgPop .pat').count() === 4 && await page.isVisible('#sideCustom'), 'the pop-up has six swatches, a custom colour and four patterns');
  const names = await page.$$eval('#sideBgPop .pat', b => b.map(x => x.textContent.trim()));
  ok(names.join() === 'Plain,Lined,Grid,Dots', 'Plain, Lined, Grid, Dots');
  await page.click('#sideBgPop .sw[data-c="#eef7f0"]'); await page.waitForTimeout(200);
  const bg = () => page.evaluate(() => [...document.querySelectorAll('.sidepage')].map(s => getComputedStyle(s).backgroundColor + '|' + (getComputedStyle(s).backgroundImage === 'none' ? 'none' : 'img')));
  ok((await bg()).every(b => b === 'rgb(238, 247, 240)|none'), 'a swatch colours every side page (plain)');
  await page.click('#sideBgPop .pat[data-pat="lined"]'); await page.waitForTimeout(200);
  ok((await bg()).every(b => b.endsWith('|img')), 'Lined draws lines');
  await page.screenshot({path: path.join(OUT, 'side-2-background.png')});
  for (const p of ['grid', 'dots']) { await page.click(`#sideBgPop .pat[data-pat="${p}"]`); await page.waitForTimeout(100); ok((await bg()).every(b => b.endsWith('|img')), p + ' draws a pattern'); }
  await page.click('#sideBgPop .pat[data-pat="lined"]');
  ok(await page.getAttribute('#sideBgPop .sw[data-c="#eef7f0"]', 'aria-pressed') === 'true' && await page.getAttribute('#sideBgPop .pat[data-pat="lined"]', 'aria-pressed') === 'true', 'the choice is marked in the pop-up');
  await page.evaluate(() => { const i = document.getElementById('sideCustom'); i.value = '#ffe9d6'; i.dispatchEvent(new Event('input', {bubbles: true})); }); await page.waitForTimeout(150);
  ok((await bg()).every(b => b.startsWith('rgb(255, 233, 214)')), 'a custom colour works');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(!(await page.isVisible('#sideBgPop')), 'Esc closes it');
  await page.waitForTimeout(800);
  ok(await sp(1).getAttribute('data-bg') === '#ffe9d6' && await sp(1).getAttribute('data-pat') === 'lined' && await sp(3).getAttribute('data-pat') === 'lined', 'the choice is stored on the side pages');
  await page.reload(); await page.waitForTimeout(2000);
  ok(await page.locator('.sidepage:visible').count() === nPages && (await bg()).every(b => b.startsWith('rgb(255, 233, 214)') && b.endsWith('|img')), 'after a reload the side pages and their paper are back');
  ok(await page.getAttribute('#sideBtn', 'aria-pressed') === 'true' || (await page.click('#tab-view'), await page.getAttribute('#sideBtn', 'aria-pressed') === 'true'), 'and Side notes is still on');
  ok(await page.locator('.sidepage .notebox').count() === 2, 'with its notes');
  // dark slate
  await page.click('#tab-view'); await page.click('#sideBgBtn'); await page.click('#sideBgPop .sw[data-c="#2b2f36"]'); await page.waitForTimeout(200);
  ok(await sp(0).evaluate(s => s.classList.contains('dark') && getComputedStyle(s).color === 'rgb(236, 230, 214)'), 'dark slate has light text');
  await show(1);
  const noteCol = await page.locator('.sidepage .notebox .mine').first().evaluate(m => getComputedStyle(m).color);
  ok(noteCol !== 'rgb(31, 79, 209)', 'and notes written in the usual blue are lightened to be readable (' + noteCol + ')');
  await page.screenshot({path: path.join(OUT, 'side-3-dark-slate.png')});
  await page.click('#sideBgPop .pat[data-pat="grid"]'); await page.screenshot({path: path.join(OUT, 'side-3b-dark-grid.png')});
  await page.click('#sideBgPop .sw[data-c="#fdf6e3"]'); await page.click('#sideBgPop .pat[data-pat="plain"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(700);

  // ---- sync scrolling off: a column of its own ----
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(200);
  await page.click('#sideSync'); await page.waitForTimeout(600);
  ok(await page.getAttribute('#sideSync', 'aria-pressed') === 'false', 'Sync scrolling is off');
  ok(await page.evaluate(() => document.getElementById('main').classList.contains('side-split') && document.querySelectorAll('.sidewrap .sidecol > .sidepage').length === document.querySelectorAll('.slide').length), 'the side pages are in a column of their own');
  const col = await rect('.sidecol'), mainBox = await rect('#main'), slide0 = await rect('.pagecard', 0);
  ok(col.x >= slide0.r && col.r <= mainBox.r + 1, 'on the right of the slides');
  ok((await page.evaluate(() => [...document.querySelectorAll('.sidepage')].map(s => s.dataset.label).join())) === Array.from({length: nPages}, (_, i) => 'Page ' + (i + 1)).join(), 'labelled Page 1, Page 2 ...');
  ok(await page.evaluate(() => { const s = document.querySelector('.sidepage'); return getComputedStyle(s, '::before').display === 'block'; }), 'the labels are shown');
  ok(await page.evaluate(() => [...document.querySelectorAll('.sidepage')].every(s => s.getBoundingClientRect().height >= document.querySelector(`.slide[data-sid="${s.dataset.for}"]`).getBoundingClientRect().height - 1)), 'each is as tall as its slide');
  const sc = await page.evaluate(async () => {
    const c = document.querySelector('.sidecol'), y0 = scrollY; c.scrollTop = 600; await new Promise(r => setTimeout(r, 250));
    const a = {top: c.scrollTop, y: scrollY}; c.scrollTop = 0; await new Promise(r => setTimeout(r, 100)); return {y0, ...a, max: c.scrollHeight - c.clientHeight};
  });
  ok(sc.top > 100 && sc.y === sc.y0 && sc.max > 300, 'the column scrolls by itself without moving the slides (' + sc.top + ')');
  const mv = await page.evaluate(async () => { const y0 = scrollY; scrollTo(0, 500); await new Promise(r => setTimeout(r, 250)); const r = {moved: scrollY - y0, col: document.querySelector('.sidecol').scrollTop}; scrollTo(0, y0); return r; });
  ok(mv.moved > 200 && mv.col === 0, 'and scrolling the slides leaves the column where it is');
  ok(await page.evaluate(() => { const r = document.querySelector('.sidecol').getBoundingClientRect(); return r.top >= document.getElementById('appbar').getBoundingClientRect().bottom - 1 && r.bottom <= innerHeight; }), 'the column stays under the toolbar, on screen');
  const st2 = await stored();
  ok(st2.slides === nPages && st2.sides === nPages && st2.right && !st2.wrap, 'saved: each side page right after its slide in this mode too');
  await page.evaluate(() => document.querySelector('.sidecol').scrollTop = 120); await page.waitForTimeout(300);
  await page.screenshot({path: path.join(OUT, 'side-4-sync-off.png')});
  ok((await page.evaluate(async () => { await flushSave(); return true; })), 'saves while the column is separate');
  // notes still work in the column
  await page.evaluate(() => { document.querySelector('.sidecol').scrollTop = 0; scrollTo(0, 0); }); await page.waitForTimeout(300);
  const spc = await rect('.sidepage', 0);
  await page.mouse.click(spc.x + 90, spc.y + 80); await page.keyboard.type('In the column'); await page.mouse.click(5, 700); await page.waitForTimeout(700);
  ok(await page.locator('.sidepage').first().locator('.notebox').count() === 1, 'a note can be added in the separate column');
  await page.click('#sideSync'); await page.waitForTimeout(600);
  ok(await page.evaluate(() => !document.getElementById('main').classList.contains('side-split') && !document.querySelector('.sidewrap')), 'sync on again: the column is gone');
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(200);
  ok(await page.evaluate(() => [...document.querySelectorAll('.slide')].every(c => { const s = c.nextElementSibling; return s?.classList.contains('sidepage') && Math.abs(s.getBoundingClientRect().top - c.getBoundingClientRect().top) < 2; })), 'the side pages are beside their slides again');
  ok(await page.locator('.sidepage').first().locator('.notebox').count() === 1, 'with the note added meanwhile');
  const st3 = await stored();
  ok(st3.right && st3.sides === nPages, 'stored right after each slide');

  // ---- highlight words and link to a side note ----
  await show(2); await page.waitForTimeout(300);
  const wordsAt = async (i, txt) => {
    const get = () => page.evaluate(([i, txt]) => {
      const sp = [...document.querySelectorAll('.pagecard')[i].querySelectorAll('.tl')].find(s => s.textContent.includes(txt));
      sp.scrollIntoView({block: 'center'});
      const r = sp.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height, text: sp.textContent};
    }, [i, txt]);
    await get(); await page.waitForTimeout(200); return get();
  };
  const dragOver = async (box, from = 0.5, to = 0.98) => {
    await page.mouse.move(box.x + box.w * from, box.y + box.h / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.w * to, box.y + box.h / 2, {steps: 8}); await page.mouse.up();
    await page.waitForTimeout(250);
  };
  const ink = i => page.evaluate(i => JSON.parse(document.querySelectorAll('.pagecard')[i].dataset.ink || '[]'), i);
  let w1 = await wordsAt(2, 'economic profit');
  await dragOver(w1);
  ok(await page.isVisible('#annoBar') && await page.isVisible('#annoBar [data-side]') && (await page.textContent('#annoBar [data-side]')).includes('Link to side note'), 'the selection bar offers Link to side note');
  await page.screenshot({path: path.join(OUT, 'side-5-bar.png')});
  await page.click('#annoBar [data-side]'); await page.waitForTimeout(500);
  let items = await ink(2);
  ok(items.length === 1 && items[0].k === 'mark' && (items[0].t.includes('economic') || items[0].t.includes('profit')), 'the words are highlighted');
  const hid = items[0].id;
  const box1 = page.locator('.sidepage').nth(2).locator('.notebox');
  ok(await box1.count() === 1 && await box1.getAttribute('data-link') === hid, 'and a note box was made on page 3\'s side page, linked to the highlight');
  ok(await page.evaluate(() => document.activeElement.matches('.sidepage .mine')), 'with the cursor in it');
  const level = await page.evaluate(id => {
    const c = document.querySelectorAll('.pagecard')[2], m = markRect(c, id), b = document.querySelector('.sidepage:nth-of-type(1)');
    const box = document.querySelectorAll('.sidepage')[2].querySelector('.notebox').getBoundingClientRect();
    return {mark: m.top + m.height / 2, line: box.top + 18};
  }, hid);
  ok(Math.abs(level.mark - level.line) < 14, 'level with the highlight (' + Math.round(level.mark) + ' vs ' + Math.round(level.line) + ')');
  await page.keyboard.type('Price taker: no market power');
  await page.waitForTimeout(300);
  const lines = () => page.evaluate(() => [...document.querySelectorAll('svg.sidelines path.sl')].map(p => ({id: p.dataset.id, w: getComputedStyle(p).strokeWidth, o: getComputedStyle(p).opacity, hot: p.classList.contains('hot'), stroke: p.getAttribute('stroke'), d: p.getAttribute('d')})));
  let ls = await lines();
  ok(ls.length === 1 && ls[0].id === hid && /^M[\d.]+ [\d.]+C/.test(ls[0].d), 'a line is drawn between them');
  ok(ls[0].w === '1.5px' && ls[0].o === '0.35' && !ls[0].hot, 'faint to begin with (1.5px, 35%)');
  ok(await page.evaluate(() => { const r = document.querySelector('svg.sidelines').getBoundingClientRect(); return r.width >= innerWidth - 1 && getComputedStyle(document.querySelector('svg.sidelines')).pointerEvents === 'none'; }), 'in an overlay that lets clicks through');
  await page.mouse.click(5, 700); await page.waitForTimeout(700);
  await page.mouse.move(5, 650); await page.waitForTimeout(200);
  await page.screenshot({path: path.join(OUT, 'side-6-linked.png')});
  // point at the note: bold
  const nbk = await rect('.sidepage:nth-of-type(1)');
  const boxR = await page.locator('.sidepage').nth(2).locator('.notebox').evaluate(b => { const r = b.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; });
  await page.mouse.move(boxR.x + boxR.w / 2, boxR.y + boxR.h / 2, {steps: 4}); await page.waitForTimeout(250);
  ls = await lines();
  ok(ls[0].hot && ls[0].w === '2.5px' && ls[0].o === '1', 'pointing at the note makes the line bold (2.5px, full)');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('svg.sidelines .sa')).display !== 'none'), 'with an arrowhead at the note');
  await page.screenshot({path: path.join(OUT, 'side-7-hover-note.png')});
  await page.mouse.move(5, 650, {steps: 3}); await page.waitForTimeout(250);
  ok(!(await lines())[0].hot && await page.evaluate(() => getComputedStyle(document.querySelector('svg.sidelines .sa')).display === 'none'), 'and faint again when you move away');
  // point at the highlighted words
  w1 = await wordsAt(2, 'economic profit');
  await page.mouse.move(w1.x + w1.w * 0.75, w1.y + w1.h / 2, {steps: 4}); await page.waitForTimeout(250);
  ok((await lines())[0].hot, 'pointing at the highlight makes it bold too');
  await page.screenshot({path: path.join(OUT, 'side-8-hover-highlight.png')});
  // a line follows the page when it scrolls (it lies on the page, so where it starts on the screen moves with the page)
  const startY = () => page.evaluate(() => { const p = document.querySelector('svg.sidelines path.sl'), v = p.getAttribute('d').match(/-?[\d.]+/g).map(Number), q = p.ownerSVGElement.createSVGPoint(); q.x = v[0]; q.y = v[1]; return q.matrixTransform(p.getScreenCTM()).y; });
  const y1 = await startY();
  await page.evaluate(() => scrollBy(0, 60)); await page.waitForTimeout(250);
  ok(Math.abs(await startY() - (y1 - 60)) < 1, 'lines follow the page as it scrolls');
  await page.mouse.move(5, 650);

  // ---- Link lines off ----
  await page.click('#tab-view'); await page.click('#sideLinks'); await page.waitForTimeout(250);
  ok(await page.getAttribute('#sideLinks', 'aria-pressed') === 'false' && (await lines()).length === 0, 'Link lines off hides every line');
  ok(await page.locator('.sidepage .notebox[data-link]').count() === 1, 'the link itself is kept');
  await page.reload(); await page.waitForTimeout(2000);
  await page.click('#tab-view');
  ok(await page.getAttribute('#sideLinks', 'aria-pressed') === 'false' && (await lines()).length === 0, 'and the choice is remembered');
  await page.click('#sideLinks'); await page.waitForTimeout(300);
  ok((await lines()).length === 1, 'turned on again, the line is back');

  // ---- link an existing note from the highlight pop-up ----
  await show(2);
  const sp2 = await rect('.sidepage', 2);
  await page.mouse.click(sp2.x + 100, sp2.y + 330); await page.keyboard.type('Second note, not linked'); await page.mouse.click(5, 700); await page.waitForTimeout(600);
  const boxP = page.locator('.sidepage').nth(2).locator('.notebox').filter({hasText: 'Price taker'});
  ok(await page.locator('.sidepage').nth(2).locator('.notebox').count() === 2, 'a second note on the side page');
  let w2 = await wordsAt(2, 'identical products');
  await dragOver(w2);
  await page.click('#annoBar .hdot[data-c="#a5d8ff"]'); await page.waitForTimeout(250);
  items = await ink(2);
  ok(items.length === 2 && items[1].c === '#a5d8ff', 'a plain highlight, no note');
  ok(await page.locator('.sidepage').nth(2).locator('.notebox').count() === 2, '(and no box was made for it)');
  w2 = await wordsAt(2, 'identical products');
  await page.mouse.click(w2.x + w2.w * 0.75, w2.y + w2.h * 0.5); await page.waitForTimeout(300);
  ok(await page.isVisible('#annoPop') && await page.isVisible('#annoPop [data-a=sidepick]') && (await page.textContent('#annoPop [data-a=sidepick]')).includes('Link to a side note…'), 'its pop-up offers Link to a side note…');
  ok(!(await page.locator('#annoPop [data-a=unlink]').count()), 'not Unlink yet');
  await page.screenshot({path: path.join(OUT, 'side-9-popup.png')});
  await page.click('#annoPop [data-a=sidepick]'); await page.waitForTimeout(300);
  ok(!(await page.isVisible('#annoPop')) && await page.evaluate(() => document.body.classList.contains('side-picking')), 'then you click a note on the side page');
  ok((await page.textContent('.toast')).includes('Click a note'), 'a toast says so');
  // clicking empty space on the side page doesn't add a note while choosing
  const sp2b = await rect('.sidepage', 2);
  await page.mouse.click(sp2b.x + 60, sp2b.b - 40); await page.waitForTimeout(200);
  ok(await page.locator('.sidepage').nth(2).locator('.notebox').count() === 2 && await page.evaluate(() => document.body.classList.contains('side-picking')), 'empty space does nothing meanwhile');
  const second = page.locator('.sidepage').nth(2).locator('.notebox').filter({hasText: 'Second note'});
  const sb = await second.boundingBox();
  await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.waitForTimeout(400);
  ok(await second.getAttribute('data-link') === items[1].id && await boxP.getAttribute('data-link') === hid, 'the note is linked to the highlight (the first link is untouched)');
  ok(!(await page.evaluate(() => document.body.classList.contains('side-picking'))), 'choosing is over');
  ok((await lines()).length === 2, 'two lines now');
  await page.mouse.move(5, 650); await page.waitForTimeout(700);
  await page.screenshot({path: path.join(OUT, 'side-10-two-links.png')});
  // clicking the highlight opens its own pop-up (its comment and colour), not the line's
  const strokeOf = id => page.evaluate(id => document.querySelector(`svg.sidelines path.sl[data-id="${id}"]`)?.getAttribute('stroke'), id);
  const shown = sel => page.evaluate(sel => [...document.querySelectorAll(sel)].filter(e => e.offsetParent).length, sel);
  const before2 = await strokeOf(items[1].id);
  w2 = await wordsAt(2, 'identical products');
  await page.mouse.click(w2.x + w2.w * 0.75, w2.y + w2.h * 0.5); await page.waitForTimeout(300);
  ok(await page.isVisible('#annoPop') && await shown('#annoPop .hcrow .hdot') === 6 && await page.isVisible('#annoPop .hcrow .hpick'), 'clicking the highlight opens its pop-up, with its colours');
  ok(await shown('#annoPop [data-a=sidego], #annoPop [data-a=unlink], #annoPop .ldot') === 0, 'and nothing about the line');
  ok((await page.textContent('#annoPop [data-a=sidepick]')).includes('Link to another side note…'), 'but it can link to another side note');
  ok(await page.getAttribute('#annoPop .hcrow .hdot[data-c="#a5d8ff"]', 'aria-pressed') === 'true', 'its colour is marked');
  await page.click('#annoPop .hcrow .hdot[data-c="#ffc078"]'); await page.waitForTimeout(250);
  ok((await ink(2))[1].c === '#ffc078' && await page.getAttribute('#annoPop .hcrow .hdot[data-c="#ffc078"]', 'aria-pressed') === 'true', 'Orange recolours the highlight');
  ok(await strokeOf(items[1].id) !== before2 && await page.isVisible('#annoPop'), 'its line follows, and the pop-up stays open');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  // clicking the line opens the line's pop-up
  const lineAt = id => page.evaluate(id => { const p = document.querySelector(`svg.sidelines path.sh[data-id="${id}"]`), q = p.getPointAtLength(p.getTotalLength() / 2), m = p.getScreenCTM(); return {x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f}; }, id);
  const clickLine = async id => { const q = await lineAt(id); await page.mouse.move(q.x, q.y, {steps: 3}); await page.mouse.click(q.x, q.y); await page.waitForTimeout(300); };
  let q2 = await lineAt(items[1].id);
  await page.mouse.move(q2.x, q2.y, {steps: 3}); await page.waitForTimeout(250);
  ok((await lines()).find(l => l.id === items[1].id).hot, 'pointing at the line makes it bold');
  await clickLine(items[1].id);
  ok(await page.isVisible('#linePop') && await page.isVisible('#linePop [data-a=sidego]') && await page.isVisible('#linePop [data-a=unlink]') && !(await page.isVisible('#annoPop')), 'clicking the line opens its own pop-up: Go to side note and Unlink');
  ok((await page.textContent('#linePop .aq')).includes('identical'), 'with the highlighted words');
  await page.screenshot({path: path.join(OUT, 'side-11-line-pop.png')});
  // the line's own colour, and the setting for every line
  const firstCol = await strokeOf(hid), secondCol = await strokeOf(items[1].id);
  ok(await page.locator('#linePop .ldot').count() === 9 && await page.getAttribute('#linePop .ldot[data-lc="hl"]', 'aria-pressed') === 'true', 'it offers nine line colours, Same as highlight picked');
  await page.click('#linePop .ldot[data-lc="#c62828"]'); await page.waitForTimeout(200);
  ok(await strokeOf(items[1].id) === '#c62828' && await second.getAttribute('data-lc') === items[1].id + '=#c62828' && await page.getAttribute('#linePop .ldot[data-lc="#c62828"]', 'aria-pressed') === 'true', 'Red makes this line red');
  ok(await strokeOf(hid) === firstCol, 'and leaves the other line as it was');
  ok(await page.locator('#setLine .ldot').count() === 9 && await page.getAttribute('#setLine .ldot[data-lc="hl"]', 'aria-pressed') === 'true', 'Settings: lines are the same colour as their highlight to begin with');
  await page.evaluate(() => document.querySelector('#setLine .ldot[data-lc="#1971c2"]').click()); await page.waitForTimeout(200);
  ok(await strokeOf(hid) === '#1971c2' && await strokeOf(items[1].id) === '#c62828', 'Blue in Settings colours every line without its own colour');
  ok(await page.evaluate(() => localStorage.getItem('side-line')) === '#1971c2', 'and is remembered');
  await page.evaluate(() => document.querySelector('#setLine .ldot[data-lc="hl"]').click()); await page.waitForTimeout(200);
  ok(await strokeOf(hid) === firstCol, 'Same as highlight puts it back');
  await page.click('#linePop .ldot[data-lc="hl"]'); await page.waitForTimeout(200);
  ok(await strokeOf(items[1].id) === secondCol && await second.getAttribute('data-lc') === null, 'and this line follows its highlight again');
  await page.click('#linePop .ldot[data-lc="#2b8a3e"]'); await page.waitForTimeout(200);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(!(await page.isVisible('#linePop')), 'Esc closes it');
  // go to
  await clickLine(items[1].id);
  await page.click('#linePop [data-a=sidego]'); await page.waitForTimeout(700);
  ok(!(await page.isVisible('#linePop')) && await second.evaluate(b => { const r = b.getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight; }), 'Go to side note scrolls to the note');
  await page.mouse.click(5, 700); await page.waitForTimeout(700);
  // unlink
  w2 = await wordsAt(2, 'identical products'); await page.waitForTimeout(300);
  await clickLine(items[1].id);
  await page.click('#linePop [data-a=unlink]'); await page.waitForTimeout(400);
  ok(await second.getAttribute('data-link') === null && await second.getAttribute('data-lc') === null && (await lines()).length === 1, 'Unlink takes the line (and its colour) away');
  ok(await second.count() === 1 && (await ink(2)).length === 2, 'the note and the highlight are both still there');
  w2 = await wordsAt(2, 'identical products');
  await page.mouse.click(w2.x + w2.w * 0.75, w2.y + w2.h * 0.5); await page.waitForTimeout(300);
  ok(await page.isVisible('#annoPop [data-a=sidepick]'), 'and it can be linked again');
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  // Back and Forward
  await page.click('#undoBtn'); await page.waitForTimeout(600);
  ok(await page.locator('.sidepage').nth(2).locator('.notebox').filter({hasText: 'Second note'}).getAttribute('data-link') === items[1].id && (await lines()).length === 2, 'Back brings the link back');
  await page.click('#redoBtn'); await page.waitForTimeout(600);
  ok(await page.locator('.sidepage').nth(2).locator('.notebox').filter({hasText: 'Second note'}).getAttribute('data-link') === null && (await lines()).length === 1, 'Forward unlinks it again');
  ok(await page.locator('.sidepage:visible').count() === nPages, 'side pages survive Back and Forward');
  // removing the highlight unlinks its note
  w1 = await wordsAt(2, 'economic profit');
  await page.mouse.click(w1.x + w1.w * 0.75, w1.y + w1.h * 0.5); await page.waitForTimeout(300);
  await page.click('#annoPop [data-a=remove]'); await page.waitForTimeout(500);
  ok(await boxP.getAttribute('data-link') === null && (await lines()).length === 0 && await boxP.count() === 1, 'removing a highlight unlinks its note (the note stays)');
  await page.click('#undoBtn'); await page.waitForTimeout(600);
  ok((await lines()).length === 1, 'and Back restores both');
  await page.waitForTimeout(700);

  // ---- a highlight on a text slide ----
  // (after the PDF checks: the pptx opens as a new notebook)

  // ---- A4 gives every printed page its side page; Default still has them ----
  await page.click('#tab-view');
  await page.selectOption('#layout', 'a4-portrait'); await page.waitForTimeout(900);
  ok(await page.locator('.sidepage:visible').count() === nPages && await page.evaluate(() => document.body.classList.contains('side-visible')), 'A4 layout shows a side page for each printed page');
  const tt = await page.textContent('#toast'); ok(!tt.includes('hidden in A4') && !tt.includes('Default layout'), 'with no "not in A4" message: ' + tt);
  ok((await lines()).length === 1, 'and the line');
  const st4 = await stored();
  ok(st4.slides === nPages && st4.sides === nPages && st4.right && !st4.wrap, 'they are saved the same way, each right after its slide (no sheets or rows saved)');
  ok(await page.locator('.sheet').count() >= nPages, 'A4 sheets still work');
  ok(await page.evaluate(() => [...document.querySelectorAll('.sheet')].every((c, i) => { const s = document.querySelectorAll('.sidepage')[i], a = c.getBoundingClientRect(), b = s.getBoundingClientRect(); return Math.abs(a.top - b.top) < 2 && Math.abs(a.height - b.height) < 2 && b.left >= a.right; })), 'each beside its sheet, in its row and as tall');
  await page.click('#sideBtn'); await page.waitForTimeout(500);
  ok(await page.getAttribute('#sideBtn', 'aria-pressed') === 'false' && await page.locator('.sidepage:visible').count() === 0, 'Side notes turns them off in A4');
  await page.click('#sideBtn'); await page.waitForTimeout(500);
  ok(await page.getAttribute('#sideBtn', 'aria-pressed') === 'true' && await page.locator('.sidepage:visible').count() === nPages && await page.locator('.sidepage .notebox').count() === 5, 'and on again, with their notes');
  await page.selectOption('#layout', 'default'); await page.waitForTimeout(900);
  ok(await page.locator('.sidepage:visible').count() === nPages && await page.locator('.sidepage .notebox').count() === 5, 'Default brings them back with their notes');
  ok((await lines()).length === 1, 'and the line');
  ok(await page.evaluate(() => [...document.querySelectorAll('.pagecard')].every((c, i) => Math.abs(c.getBoundingClientRect().top - document.querySelectorAll('.sidepage')[i].getBoundingClientRect().top) < 2)), 'in their rows');

  // ---- a new page gets its side page ----
  await show(5);
  await page.click('#tab-insert'); await page.click('#addPageBtn'); await page.waitForTimeout(900);
  ok(await page.locator('.sidepage').count() === nPages + 1, 'a page added now has a side page too');
  const newOrder = await stored();
  ok(newOrder.right && newOrder.sides === nPages + 1, 'each still right after its slide');
  await page.click('#delPageBtn'); await page.click('#delPageBtn'); await page.waitForTimeout(900);
  ok(await page.locator('.sidepage').count() === nPages && (await stored()).right, 'removing a page takes its side page with it');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(500);

  // ---- study mode ----
  await page.click('#readBtn'); await page.waitForTimeout(400);
  ok(await page.locator('.sidepage .mine[contenteditable=true]').count() === 0, 'Study mode: side notes are read only');
  const sp0 = await rect('.sidepage', 4);
  await show(4);
  const sp4 = await rect('.sidepage', 4);
  const cnt = await page.locator('.sidepage .notebox').count();
  await page.mouse.click(sp4.x + 90, sp4.y + 90); await page.waitForTimeout(300);
  ok(await page.locator('.sidepage .notebox').count() === cnt, 'clicking a side page adds nothing');
  ok(await page.locator('.sidepage .g-move:visible').count() === 0, 'and there are no drag handles');
  ok(!(await page.isVisible('#annoBar')) , 'no bar');
  await page.click('#readBtn'); await page.waitForTimeout(300);

  // ---- notes between the lines on a slide still work, and its side page grows with the slide ----
  await show(3);
  const stp = await page.locator('.pagecard').nth(3).locator('.strip').first().boundingBox();
  await page.mouse.move(stp.x + 300, stp.y + stp.height * 0.6, {steps: 4}); await page.waitForTimeout(300);
  await page.click('.gappill'); await page.waitForTimeout(150); await page.keyboard.press('Enter'); await page.keyboard.type('Between the lines, beside a side page'); await page.mouse.click(5, 700); await page.waitForTimeout(800);
  ok(await page.locator('.pagecard').nth(3).locator('.notebox').count() === 1 && await page.locator('.sidepage .notebox').count() === 5, 'a note between the lines still opens up its slide (the side notes are untouched)');
  ok(await page.evaluate(() => { const c = document.querySelectorAll('.pagecard')[3], s = document.querySelectorAll('.sidepage')[3]; return s.getBoundingClientRect().height >= c.getBoundingClientRect().height - 1 && Math.abs(s.getBoundingClientRect().top - c.getBoundingClientRect().top) < 2; }), 'and the side page grows to match the taller slide');
  await page.click('#undoBtn'); await page.waitForTimeout(600);

  // ---- the PDF ----
  const pdfWith = async (side) => {
    await page.click('#save'); await page.selectOption('#pdfNotes', 'page');
    const [dl] = await Promise.all([page.waitForEvent('download', {timeout: 180000}), page.click('[data-kind=pdf]')]);
    const f = path.join(OUT, `side-${side}.pdf`); await dl.saveAs(f); await page.waitForTimeout(700);
    const b = fs.readFileSync(f), t = b.toString('latin1');
    const m = t.match(/\/Subtype \/Image \/Width (\d+) \/Height (\d+)/);
    return {head: b.slice(0, 5).toString(), w: +m[1], h: +m[2], size: b.length};
  };
  const withSide = await pdfWith('on');
  ok(withSide.head === '%PDF-' && withSide.w / withSide.h > 1.3, 'PDF download with side notes on: wide pages with the side page to the right (' + withSide.w + 'x' + withSide.h + ')');
  // the side page is painted: take a canvas and look at its right half
  const px = await page.evaluate(async () => {
    const c = document.querySelectorAll('.pagecard')[2], sp = document.querySelectorAll('.sidepage')[2], cv = await paintCard(c, 1, sp), ctx = cv.getContext('2d');
    const sr = sp.getBoundingClientRect(), cr = c.getBoundingClientRect(), u = Math.min(cr.left, sr.left);
    const at = (x, y) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data];
    // dark pixels (the note's text, or the line) on the side page's part of the canvas
    const d = ctx.getImageData(Math.round(sr.left - u + 4), Math.round(sr.top - cr.top + 4), Math.round(sr.width - 8), Math.round(sr.height - 8)).data;
    let ink = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 160 || d[i + 2] > 180 && d[i] < 100) ink++;
    return {w: cv.width, h: cv.height, bg: at(sr.left - u + 6, sr.top - cr.top + 6), ink, slideW: cr.width};
  });
  ok(px.w > px.slideW * 1.4 && px.bg[0] > 240 && px.bg[1] > 235, 'the canvas holds the slide and the side page (' + px.w + ' wide), painted in its paper colour ' + px.bg);
  ok(px.ink > 50, 'with its notes and the line painted (' + px.ink + ' dark pixels)');
  await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(500);
  const without = await pdfWith('off');
  ok(without.w / without.h < withSide.w / withSide.h && without.w < withSide.w, 'with side notes off the pages are the slides alone');
  await page.click('#sideBtn'); await page.waitForTimeout(500);
  // sync off at download time: the pages are still painted beside their slides, and the column comes back after
  await page.click('#sideSync'); await page.waitForTimeout(500);
  const sep = await pdfWith('split');
  ok(sep.w / sep.h > 1.3, 'with the column on the right the PDF still has the side page beside its slide');
  ok(await page.evaluate(() => document.getElementById('main').classList.contains('side-split') && !!document.querySelector('.sidecol')), 'and the separate column is back afterwards');
  await page.click('#sideSync'); await page.waitForTimeout(400);

  // ---- a text slide (PowerPoint, opened as editable text) ----
  await page.evaluate(() => pref.set('pptx-mode', 'text'));
  await page.setInputFiles('#file', path.join(__dirname, 'week2.pptx'));
  await page.waitForFunction(() => document.querySelectorAll('#docList .nb').length >= 2, null, {timeout: 30000});
  await page.waitForTimeout(1200);
  ok(await page.locator('.sidepage').count() === 0 && await page.getAttribute('#sideBtn', 'aria-pressed') === 'false', 'a new notebook starts without side notes (they are per notebook)');
  await page.click('#sideBtn'); await page.waitForTimeout(500);
  const nSlides = await page.locator('.slide').count();
  ok(await page.locator('.sidepage').count() === nSlides && nSlides > 1, 'turned on here: a side page for each of the ' + nSlides + ' slides');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.sidepage')).backgroundColor === 'rgb(253, 246, 227)'), 'with the paper from the last choice (cream, plain)');
  const blk = await page.evaluate(() => {
    const nodes = []; for (const b of document.querySelectorAll('.slide .blk')) { const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); for (let x = w.nextNode(); x; x = w.nextNode()) if (x.data.trim().length > 12) nodes.push(x); }
    const t = nodes[0], r = document.createRange(); t.parentElement.scrollIntoView({block: 'center'}); r.setStart(t, 0); r.setEnd(t, 9); const bb = r.getBoundingClientRect();
    return {x: bb.left, y: bb.top, w: bb.width, h: bb.height};
  });
  await page.mouse.move(blk.x + 1, blk.y + blk.h / 2); await page.mouse.down(); await page.mouse.move(blk.x + blk.w - 1, blk.y + blk.h / 2, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(300);
  ok(await page.isVisible('#annoBar [data-side]'), 'selecting words on a text slide offers Link to side note');
  await page.click('#annoBar [data-side]'); await page.waitForTimeout(500);
  const tm = page.locator('mark.anno').first();
  const tid = await tm.getAttribute('data-id');
  ok(await page.locator('.sidepage .notebox[data-link="' + tid + '"]').count() === 1, 'a linked note box on the text slide\'s side page');
  await page.keyboard.type('Text slide note'); await page.waitForTimeout(300);
  ls = await lines();
  ok(ls.length === 1 && ls[0].id === tid, 'with its line');
  await page.mouse.click(5, 700); await page.waitForTimeout(700);
  await page.screenshot({path: path.join(OUT, 'side-11-text-slide.png')});
  const tl = await page.evaluate(() => { const m = document.querySelector('mark.anno'), b = document.querySelector('.sidepage .notebox').getBoundingClientRect(), r = m.getBoundingClientRect(); return Math.abs(r.top + r.height / 2 - (b.top + 18)) < 16; });
  ok(tl, 'level with the highlighted words');

  // ---- dark theme, and the screenshot for it ----
  await page.evaluate(() => scrollTo(0, 0));
  await page.click('#tab-view'); await page.click('#themeModes [data-pick=dark]'); await page.waitForTimeout(400);
  await page.mouse.move(5, 650);
  await page.screenshot({path: path.join(OUT, 'side-12-dark-theme.png')});
  await page.click('#themeModes [data-pick=light]');

  // ---- storage is per notebook ----
  const stText = await stored();
  ok(stText.right && stText.sides === nSlides, 'the text notebook stores its side pages right after the slides');
  await page.click('#docList .nb >> nth=1').catch(() => {});
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(errors.length ? errors.join('\n') : 'no page errors');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

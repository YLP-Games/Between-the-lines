// Annotate: drawing on PDF pages (pen, highlighter, eraser), highlighting and commenting on words, and the PDF download
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);

  const card = i => page.locator('.pagecard').nth(i);
  const ink = i => page.evaluate(i => JSON.parse(document.querySelectorAll('.pagecard')[i].dataset.ink || '[]'), i);
  const stripBox = async (i, n = 0) => { const s = card(i).locator('.strip').nth(n); return s.boundingBox(); };
  const show = async i => { await card(i).locator('.strip').first().scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 100)); await page.waitForTimeout(250); };
  // a stroke with page.mouse across a page (fractions of the strip)
  const stroke = async (i, pts, n = 0) => {
    const b = await stripBox(i, n);
    await page.mouse.move(b.x + b.width * pts[0][0], b.y + b.height * pts[0][1]);
    await page.mouse.down();
    for (const [fx, fy] of pts.slice(1)) await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy, {steps: 6});
    await page.mouse.up(); await page.waitForTimeout(150);
  };

  // ---- Draw button and toolbar ----
  await page.click('#tab-insert');
  ok(await page.isVisible('#drawBtn') && (await page.textContent('#drawBtn')).includes('Draw'), 'Insert has a Draw button');
  ok((await page.getAttribute('#drawBtn', 'title')).startsWith('Draw: '), 'with a tooltip');
  ok(!(await page.isVisible('#drawBar')), 'no drawing toolbar yet');
  await show(1);
  await page.click('#drawBtn'); await page.waitForTimeout(150);
  ok(await page.isVisible('#drawBar') && await page.evaluate(() => document.body.classList.contains('drawing')) && await page.getAttribute('#drawBtn', 'aria-pressed') === 'true', 'Draw shows the toolbar');
  const tools = await page.$$eval('#drawBar [data-tool]', bs => bs.map(b => b.textContent.trim() + ':' + b.getAttribute('aria-pressed')));
  ok(tools.join() === 'Pen:true,Highlighter:false,Eraser:false', 'Pen, Highlighter, Eraser (pen picked)');
  ok(await page.locator('#drawBar .sw').count() === 5 && await page.locator('#drawBar .dw').count() === 3, 'five colours and three thicknesses');
  ok(await card(1).locator('.strip').first().evaluate(s => getComputedStyle(s).cursor) === 'crosshair', 'the pointer is a crosshair over the page');
  ok(await page.evaluate(() => { const b = document.getElementById('drawBar').getBoundingClientRect(), s = document.getElementById('statusbar').getBoundingClientRect(); return b.bottom <= s.top && Math.abs(b.left + b.width / 2 - innerWidth / 2) < 4; }), 'the toolbar floats bottom centre above the status bar');
  // the add-note pill stays away while drawing
  const b1 = await stripBox(1);
  await page.mouse.move(b1.x + 200, b1.y + b1.height * 0.5, {steps: 3}); await page.waitForTimeout(250);
  ok(await page.locator('.gappill').count() === 0, 'no + Add here pill while drawing');

  // ---- a pen stroke ----
  await page.click('#drawBar .sw[data-c="#c62828"]');
  await stroke(1, [[0.1, 0.1], [0.2, 0.05], [0.3, 0.15], [0.4, 0.05], [0.5, 0.15]]);
  let items = await ink(1);
  ok(items.length === 1 && items[0].k === 'pen' && items[0].c === '#c62828' && items[0].p.length > 5, 'a pen stroke is stored in data-ink');
  const W = +(await card(1).getAttribute('data-w')), H = +(await card(1).getAttribute('data-h'));
  const p0 = items[0].p[0];
  ok(Math.abs(p0[0] - W * 0.1) < 3 && Math.abs(p0[1] - H * 0.1) < 3, 'in page units, where it was drawn');
  ok(items[0].p.every(q => q[0] >= 0 && q[0] <= W && q[1] >= 0 && q[1] <= H && Math.round(q[0] * 10) === q[0] * 10), 'inside the page and rounded to 0.1');
  ok(await card(1).locator('.strip svg.ink path.pen').count() === 1, 'and drawn over the page');
  ok(await card(1).locator('.strip > svg.ink').evaluate(s => getComputedStyle(s).pointerEvents === 'none' && s.nextElementSibling?.classList.contains('tl') !== false), 'the ink lets clicks through and sits under the text layer');
  ok(await page.locator('.gappill').count() === 0 && await page.locator('.notebox').count() === 0, 'drawing adds no note');

  // a second stroke, thicker, black
  await page.click('#drawBar .dw[data-w="2"]'); await page.click('#drawBar .sw[data-c="#1d1d1d"]');
  await stroke(1, [[0.1, 0.3], [0.6, 0.35]]);
  items = await ink(1);
  ok(items.length === 2 && items[1].w > items[0].w, 'a thicker stroke is stored too');

  // ---- highlighter ----
  await page.click('#drawBar [data-tool="hl"]');
  ok(await page.getAttribute('#drawBar .sw[data-c="#ffd54a"]', 'aria-pressed') === 'true', 'the highlighter starts yellow');
  await stroke(1, [[0.1, 0.5], [0.7, 0.5]]);
  items = await ink(1);
  ok(items.length === 3 && items[2].k === 'hl' && items[2].c === '#ffd54a', 'a highlighter stroke');
  const hl = card(1).locator('.strip svg.ink path.hl');
  ok(await hl.count() === 1 && +(await hl.getAttribute('stroke-width')) === items[2].w * 4 && await hl.evaluate(p => getComputedStyle(p).opacity === '0.35' && getComputedStyle(p).mixBlendMode === 'multiply'), 'drawn wide, see-through and multiplied');
  await page.screenshot({path: path.join(OUT, 'anno-1-draw.png')});

  // tool, colour and thickness are remembered
  await page.waitForTimeout(900);
  await page.reload(); await page.waitForTimeout(1500);
  await page.click('#tab-insert'); await page.click('#drawBtn');
  ok(await page.getAttribute('#drawBar [data-tool="hl"]', 'aria-pressed') === 'true' && await page.getAttribute('#drawBar .dw[data-w="2"]', 'aria-pressed') === 'true', 'the tool and thickness are remembered');
  ok((await ink(1)).length === 3 && await card(1).locator('.strip svg.ink path').count() === 3, 'strokes are still there after a reload');
  await show(1);

  // ---- eraser ----
  await page.click('#drawBar [data-tool="er"]');
  ok(await page.locator('#drawBar .sw:not([disabled])').count() === 0, 'the eraser has no colours');
  await stroke(1, [[0.4, 0.5], [0.45, 0.5]]);
  items = await ink(1);
  ok(items.length === 2 && items.every(i => i.k !== 'hl'), 'the eraser removes the whole highlighter stroke');
  await page.waitForTimeout(700);
  await stroke(1, [[0.1, 0.3], [0.2, 0.3]]);
  items = await ink(1);
  ok(items.length === 1 && items[0].k === 'pen' && items[0].c === '#c62828', 'and the stroke it touched, not the others');
  await page.waitForTimeout(700);

  // ---- Back and Forward ----
  await page.click('#undoBtn'); await page.waitForTimeout(500);
  ok((await ink(1)).length === 2 && await card(1).locator('.strip svg.ink path').count() === 2, 'Back brings the erased stroke back');
  await page.click('#redoBtn'); await page.waitForTimeout(500);
  ok((await ink(1)).length === 1 && await card(1).locator('.strip svg.ink path').count() === 1, 'Forward erases it again');
  ok(await page.isVisible('#drawBar'), 'drawing carries on after Back');

  // ---- Esc ends drawing, and the pill is back ----
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(!(await page.isVisible('#drawBar')) && await page.getAttribute('#drawBtn', 'aria-pressed') === 'false', 'Esc ends drawing');
  const b2 = await stripBox(1);
  await page.mouse.move(b2.x + 300, b2.y + b2.height * 0.6, {steps: 3}); await page.waitForTimeout(300);
  ok(await page.locator('.gappill').count() === 1, 'the + Add here pill works again');

  // ---- a note between the lines keeps the ink in both pieces ----
  await page.click('#drawBtn');
  await page.click('#drawBar [data-tool="pen"]'); await page.click('#drawBar .dw[data-w="1"]'); await page.click('#drawBar .sw[data-c="#2e7d32"]');
  await stroke(1, [[0.1, 0.7], [0.3, 0.9], [0.5, 0.7], [0.7, 0.9]]);     // a zigzag low on the page
  await stroke(1, [[0.8, 0.2], [0.8, 0.9]]);                              // a line across where the note will go
  await page.click('#drawBar [data-done]'); await page.waitForTimeout(150);
  ok(!(await page.isVisible('#drawBar')), 'Done ends drawing');
  const inkBefore = await ink(1);
  await page.waitForTimeout(700);
  const sb = await stripBox(1);
  await page.mouse.move(sb.x + 300, sb.y + sb.height * 0.6, {steps: 3}); await page.waitForTimeout(300);
  await page.click('.gappill'); await page.keyboard.type('Note between the lines'); await page.waitForTimeout(200);
  await page.mouse.click(5, 700); await page.waitForTimeout(700);
  ok(await card(1).locator('.strip').count() === 2 && await card(1).locator('.notebox').count() === 1, 'the page opened up for the note');
  ok(JSON.stringify(await ink(1)) === JSON.stringify(inkBefore), 'the ink is untouched in data-ink');
  const vb = await card(1).locator('.strip').evaluateAll(ss => ss.map(s => ({vb: s.querySelector('svg.ink').getAttribute('viewBox'), y0: +s.dataset.y0, y1: +s.dataset.y1, paths: s.querySelectorAll('svg.ink path').length})));
  ok(vb.length === 2 && vb.every(v => v.paths >= 2), 'both pieces draw the strokes that reach into them');
  ok(vb[0].vb === `0 ${vb[0].y0} ${W} ${vb[0].y1 - vb[0].y0}` && vb[1].vb === `0 ${vb[1].y0} ${W} ${vb[1].y1 - vb[1].y0}`, 'each shows its own slice of the page');
  // the vertical line crosses the note: it is at the same x in both, and the top piece ends where the lower one starts
  const px = await card(1).locator('.strip').evaluateAll(ss => ss.map(s => { const r = s.getBoundingClientRect(); const p = [...s.querySelectorAll('svg.ink path.pen')].pop(); const bb = p.getBBox(); return {w: r.width, x: r.left + (bb.x + bb.width / 2) / +s.closest('.pagecard').dataset.w * r.width, top: r.top, bottom: r.bottom, h: r.height, y0: +s.dataset.y0, y1: +s.dataset.y1}; }));
  ok(Math.abs(px[0].x - px[1].x) < 2, 'the line is at the same place in both pieces');
  await page.screenshot({path: path.join(OUT, 'anno-2-split.png')});
  // a fresh stroke can be drawn across both pieces
  await page.click('#drawBtn');
  await page.mouse.move(0, 0);
  const sa = await stripBox(1, 0), sc = await stripBox(1, 1);
  await page.mouse.move(sa.x + sa.width * 0.2, sa.y + sa.height * 0.85); await page.mouse.down();
  await page.mouse.move(sa.x + sa.width * 0.25, sa.y + sa.height * 0.98, {steps: 4});
  await page.mouse.move(sc.x + sc.width * 0.3, sc.y + sc.height * 0.1, {steps: 8});
  await page.mouse.move(sc.x + sc.width * 0.35, sc.y + sc.height * 0.3, {steps: 4});
  await page.mouse.up(); await page.waitForTimeout(200);
  items = await ink(1);
  const last = items[items.length - 1];
  ok(last.p.some(q => q[1] < vb[0].y1) && last.p.some(q => q[1] > vb[1].y0) && last.p.every((q, i, a) => !i || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) < 120), 'a stroke can carry on from one piece into the next');
  await page.keyboard.press('Escape');

  // ---- study mode hides Draw ----
  await page.click('#readBtn'); await page.waitForTimeout(300);
  ok(!(await page.isVisible('#drawBtn')) && !(await page.isVisible('#drawBar')), 'Study mode hides Draw');
  await page.click('#readBtn'); await page.waitForTimeout(300);

  // ---- highlight words on a PDF page ----
  // drag across a piece of text on page i (the first one that has the words), like a person would
  const wordsAt = async (i, txt) => {
    const get = () => page.evaluate(([i, txt]) => {
      const sp = [...document.querySelectorAll('.pagecard')[i].querySelectorAll('.tl')].find(s => s.textContent.includes(txt));
      sp.scrollIntoView({block: 'center'});
      const r = sp.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height, text: sp.textContent};
    }, [i, txt]);
    await get(); await page.waitForTimeout(200); return get();
  };
  const dragOver = async (box, from = 0.02, to = 0.98) => {
    await page.mouse.move(box.x + box.w * from, box.y + box.h / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.w * to, box.y + box.h / 2, {steps: 8}); await page.mouse.up();
    await page.waitForTimeout(250);
  };
  await show(2); await page.waitForTimeout(300);
  ok(!(await page.isVisible('#annoBar')), 'no selection bar before words are selected');
  let w1 = await wordsAt(2, 'Perfect');
  await dragOver(w1);
  ok((await page.evaluate(() => getSelection().toString())).trim().length > 3, 'dragging across a line selects its words');
  ok(await page.isVisible('#annoBar'), 'the bar shows when you let go');
  ok(await page.locator('#annoBar .hdot').count() === 4 && (await page.textContent('#annoBar')).includes('Comment'), 'with four colours and Comment');
  const bb = await page.locator('#annoBar').boundingBox();
  ok(bb.y + bb.height <= w1.y + 2 && Math.abs(bb.x + bb.width / 2 - (w1.x + w1.w / 2)) < w1.w, 'it sits just above the selection');
  ok(await page.locator('.gappill').count() === 0, 'and the add-note pill stays away');
  await page.screenshot({path: path.join(OUT, 'anno-3-bar.png')});
  await page.click('#annoBar .hdot[data-c="#a7e3a1"]'); await page.waitForTimeout(200);
  items = await ink(2);
  ok(items.length === 1 && items[0].k === 'mark' && items[0].c === '#a7e3a1' && items[0].r.length >= 1 && items[0].t.includes('Perfect') && items[0].id, 'a colour makes a highlight (mark) with its rectangles and text');
  ok(items[0].r.every(r => r.length === 4 && r[2] > 5 && r[3] > 5 && r[0] >= 0 && r[0] + r[2] <= 960), 'in page units');
  ok(!(await page.isVisible('#annoBar')) && (await page.evaluate(() => getSelection().toString())) === '', 'the bar and the selection go');
  ok(await card(2).locator('svg.ink g.mk rect').count() >= 1, 'the highlight is drawn');
  ok(await page.locator('.notebox').count() === 1, 'and no note was added by the click');
  const mk = card(2).locator('svg.ink g.mk').first();
  ok(await mk.evaluate(g => getComputedStyle(g).opacity === '0.45' && getComputedStyle(g).mixBlendMode === 'multiply'), 'drawn see-through (multiply) so the words stay readable');

  // the bar goes away on scroll, on Esc, and when the selection is cleared
  w1 = await wordsAt(2, 'barriers');
  await dragOver(w1);
  ok(await page.isVisible('#annoBar'), 'selecting again shows the bar');
  await page.evaluate(() => scrollBy(0, 40)); await page.waitForTimeout(200);
  ok(!(await page.isVisible('#annoBar')), 'scrolling hides it');
  w1 = await wordsAt(2, 'barriers');
  await dragOver(w1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(!(await page.isVisible('#annoBar')) && (await ink(2)).length === 1, 'Esc hides it and highlights nothing');
  w1 = await wordsAt(2, 'barriers');
  await dragOver(w1);
  await page.mouse.click(w1.x + w1.w * 0.5, w1.y + w1.h * 6); await page.waitForTimeout(250);
  ok(!(await page.isVisible('#annoBar')), 'clearing the selection hides it');
  await page.mouse.click(5, 700); await page.waitForTimeout(200);

  // ---- comment ----
  w1 = await wordsAt(2, 'barriers');
  await dragOver(w1);
  await page.click('#annoBar [data-cm]'); await page.waitForTimeout(250);
  ok(await page.isVisible('#annoPop') && await page.evaluate(() => document.activeElement === document.querySelector('#annoPop textarea')), 'Comment opens a pop-up with the cursor in the box');
  ok((await page.getAttribute('#annoPop textarea', 'placeholder')) === 'Add a comment…', 'which says Add a comment…');
  items = await ink(2);
  ok(items.length === 2 && items[1].k === 'mark' && items[1].c === '#a7e3a1' && !items[1].cm, 'the words are highlighted (in the colour last used) while you write');
  const pr = await page.locator('#annoPop').boundingBox();
  ok(pr.y >= w1.y + w1.h - 2 && pr.x <= w1.x + w1.w && pr.x + pr.width > w1.x, 'the pop-up is anchored under the highlight');
  await page.keyboard.type('Check the definition in the reader');
  await page.screenshot({path: path.join(OUT, 'anno-4-comment.png')});
  await page.keyboard.press('Control+Enter'); await page.waitForTimeout(300);
  ok(!(await page.isVisible('#annoPop')), 'Ctrl+Enter saves and closes');
  items = await ink(2);
  ok(items[1].cm && items[1].cm.text === 'Check the definition in the reader' && items[1].cm.done === false && items[1].cm.at > 1e12, 'the comment is kept on the highlight');
  ok(await card(2).locator('svg.ink g.bd').count() === 1, 'a speech-bubble badge shows at the end of it');
  await page.mouse.move(5, 700);

  // ---- the Notes panel lists it ----
  await page.click('#notesBtn'); await page.waitForTimeout(700);
  const cards = await page.$$eval('#noteList .ncard', cs => cs.map(c => [c.querySelector('.txt').textContent, c.querySelector('.meta').textContent]));
  ok(cards.length === 2 && cards.some(c => c[0] === 'Check the definition in the reader' && c[1].startsWith('Comment on “') && c[1].includes('barriers')), 'the comment is listed in the Notes panel with what it is about');
  ok((await page.textContent('#noteCount')) === '2', 'and counted');
  await page.fill('#noteSearch', 'definition'); await page.waitForTimeout(200);
  ok(await page.locator('#noteList .ncard').count() === 1, 'comments match the search on their text');
  await page.fill('#noteSearch', ''); await page.waitForTimeout(200);
  const grp = await page.$$eval('#noteList li', ls => ls.map(l => l.className === 'group' ? 'G:' + l.textContent : 'c'));
  ok(grp.length === 4 && grp[2].startsWith('G:Page 3') && grp[3] === 'c', 'under the right page');
  await page.screenshot({path: path.join(OUT, 'anno-5-notes.png')});
  // jump: scroll away, click it in the list
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
  await page.locator('#noteList .ncard', {hasText: 'Check the definition'}).click(); await page.waitForTimeout(400);
  ok(await page.isVisible('#annoPop') && (await page.inputValue('#annoPop textarea')) === 'Check the definition in the reader', 'clicking it in the list opens its pop-up');
  const hb = await page.evaluate(() => { const c = document.querySelectorAll('.pagecard')[2], r = markRect(c, JSON.parse(c.dataset.ink)[1].id); return [r.top, r.bottom, innerHeight]; });
  ok(hb[0] > 0 && hb[1] < hb[2], 'after scrolling to the highlight');
  ok(await page.locator('#annoPop [data-a=resolve]').isVisible() && (await page.textContent('#annoPop [data-a=resolve]')).trim() === 'Resolve' && await page.locator('#annoPop [data-a=remove]').isVisible(), 'it offers Resolve and Remove highlight');
  await page.screenshot({path: path.join(OUT, 'anno-6-popup.png')});
  // edit the comment
  await page.fill('#annoPop textarea', 'Check the definition in the reader (ch. 4)');
  await page.click('#annoPop [data-a=save]'); await page.waitForTimeout(700);
  ok((await ink(2))[1].cm.text.endsWith('(ch. 4)') && !(await page.isVisible('#annoPop')), 'the comment can be edited');
  // click the highlight on the page
  w1 = await wordsAt(2, 'barriers');
  await page.mouse.click(w1.x + w1.w * 0.4, w1.y + w1.h * 0.5); await page.waitForTimeout(300);
  ok(await page.isVisible('#annoPop') && (await page.inputValue('#annoPop textarea')).endsWith('(ch. 4)'), 'clicking a highlight on the page opens its pop-up');
  ok(await page.locator('.gappill').count() === 0 && await page.locator('.notebox').count() === 1, 'and does not start a note');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(!(await page.isVisible('#annoPop')), 'Esc closes it');
  // the green one has no comment: just the box
  w1 = await wordsAt(2, 'Perfect');
  await page.mouse.click(w1.x + w1.w * 0.3, w1.y + w1.h * 0.5); await page.waitForTimeout(300);
  ok(await page.isVisible('#annoPop') && (await page.inputValue('#annoPop textarea')) === '' && !(await page.locator('#annoPop [data-a=resolve]').isVisible()), 'a highlight with no comment opens an empty box (nothing to resolve)');
  await page.keyboard.press('Escape');
  // elsewhere on the page the add-note pill still shows
  await page.mouse.move(w1.x + 400, w1.y + 200, {steps: 3}); await page.waitForTimeout(300);
  ok(await page.locator('.gappill').count() === 1, 'elsewhere on the page the add-note pill still shows');

  // ---- resolve ----
  await page.locator('#noteList .ncard', {hasText: 'Check the definition'}).click(); await page.waitForTimeout(400);
  await page.click('#annoPop [data-a=resolve]'); await page.waitForTimeout(700);
  ok(!(await page.isVisible('#annoPop')) && (await ink(2))[1].cm.done === true, 'Resolve marks it done');
  ok(await page.locator('#noteList .ncard', {hasText: 'Check the definition'}).count() === 0 && (await page.textContent('#noteCount')) === '1', 'it leaves the Notes list');
  ok(await card(2).locator('svg.ink g.bd').count() === 0 && await card(2).locator('svg.ink g.mk rect').count() >= 2, 'the badge goes, the highlight stays');
  w1 = await wordsAt(2, 'barriers');
  await page.mouse.click(w1.x + w1.w * 0.4, w1.y + w1.h * 0.5); await page.waitForTimeout(300);
  ok(await page.isVisible('#annoPop') && (await page.textContent('#annoPop [data-a=resolve]')).trim() === 'Reopen', 'clicking the highlight offers Reopen');
  await page.click('#annoPop [data-a=resolve]'); await page.waitForTimeout(700);
  ok((await ink(2))[1].cm.done === false && await card(2).locator('svg.ink g.bd').count() === 1 && await page.locator('#noteList .ncard', {hasText: 'Check the definition'}).count() === 1, 'Reopen brings the comment and badge back');

  // ---- remove highlight, and Back ----
  await page.mouse.click(w1.x + w1.w * 0.4, w1.y + w1.h * 0.5); await page.waitForTimeout(300);
  await page.click('#annoPop [data-a=remove]'); await page.waitForTimeout(700);
  ok((await ink(2)).length === 1 && await page.locator('#noteList .ncard', {hasText: 'Check the definition'}).count() === 0, 'Remove highlight takes the highlight and its comment away');
  await page.click('#undoBtn'); await page.waitForTimeout(600);
  ok((await ink(2)).length === 2 && (await ink(2))[1].cm?.text.endsWith('(ch. 4)'), 'Back brings them back');
  await page.waitForTimeout(700);

  // ---- ink and highlights are painted into the PDF ----
  const paint = await page.evaluate(async () => {
    const c = document.querySelectorAll('.pagecard')[1], cv = await paintCard(c, 1), ctx = cv.getContext('2d'), r = c.getBoundingClientRect();
    const it = JSON.parse(c.dataset.ink)[0], s = [...c.querySelectorAll(':scope > .strip')][0], sr = s.getBoundingClientRect();
    const q = it.p[Math.floor(it.p.length / 2)], px = (sr.left - r.left) + q[0] / +c.dataset.w * sr.width, py = (sr.top - r.top) + (q[1] - +s.dataset.y0) / (+s.dataset.y1 - +s.dataset.y0) * sr.height;
    const dd = ctx.getImageData(Math.round(px) - 4, Math.round(py) - 4, 9, 9).data; let d = [255, 255, 255]; for (let i = 0; i < dd.length; i += 4) if (dd[i + 1] < d[1]) d = [dd[i], dd[i + 1], dd[i + 2]];
    const c3 = document.querySelectorAll('.pagecard')[2], cv3 = await paintCard(c3, 1), m = JSON.parse(c3.dataset.ink)[0].r[0];
    const s3 = c3.querySelector(':scope > .strip'), sr3 = s3.getBoundingClientRect(), r3 = c3.getBoundingClientRect();
    const d3 = cv3.getContext('2d').getImageData(Math.round(sr3.left - r3.left + (m[0] + 2) / +c3.dataset.w * sr3.width), Math.round(sr3.top - r3.top + (m[1] + m[3] - 2) / (+s3.dataset.y1 - +s3.dataset.y0) * sr3.height), 1, 1).data;
    return {pen: [...d], mark: [...d3]};
  });
  ok(paint.pen[0] > 140 && paint.pen[1] < 100 && paint.pen[2] < 100, 'a pen stroke is painted into the PDF page: ' + paint.pen);
  ok(paint.mark[0] < 245 && paint.mark[2] < 245 && paint.mark[1] > 200, 'and so is a highlight: ' + paint.mark);

  // ---- downloads: page and comments modes ----
  const pdfDownload = async mode => {
    await page.click('#save'); await page.selectOption('#pdfNotes', mode);
    const [dl] = await Promise.all([page.waitForEvent('download', {timeout: 120000}), page.click('[data-kind=pdf]')]);
    const f = path.join(OUT, `anno-${mode}.pdf`); await dl.saveAs(f);
    await page.waitForTimeout(500);
    return fs.readFileSync(f);
  };
  let pdf = await pdfDownload('page');
  ok(pdf.slice(0, 5).toString() === '%PDF-' && !pdf.toString('latin1').includes('/Subtype /Text'), 'PDF download in page mode');
  pdf = await pdfDownload('comments');
  const nAnn = (pdf.toString('latin1').match(/\/Subtype \/Text/g) || []).length;
  ok(pdf.slice(0, 5).toString() === '%PDF-' && nAnn === 2, 'PDF download in comments mode: the note and the open comment are PDF comments (' + nAnn + ')');

  // ---- highlights on a PowerPoint (opened as editable text) ----
  await page.evaluate(() => pref.set('pptx-mode', 'text'));
  await page.setInputFiles('#file', path.join(__dirname, 'week2.pptx'));
  await page.waitForFunction(() => document.querySelectorAll('#docList .nb').length === 2, null, {timeout: 30000});
  await page.waitForTimeout(900);
  const blkWords = async (n, from, to) => page.evaluate(([n, from, to]) => {
    const nodes = []; for (const blk of document.querySelectorAll('.slide .blk')) { const w = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT); for (let x = w.nextNode(); x; x = w.nextNode()) if (x.data.trim().length > 12 && !x.parentElement.closest('mark.anno')) nodes.push(x); }
    const t = nodes[n], r = document.createRange(); t.parentElement.scrollIntoView({block: 'center'});
    r.setStart(t, from); r.setEnd(t, to); const b = r.getBoundingClientRect();
    return {x: b.left, y: b.top, w: b.width, h: b.height, text: t.data.slice(from, to)};
  }, [n, from, to]);
  const swipe = async b => { await page.mouse.move(b.x + 1, b.y + b.h / 2); await page.mouse.down(); await page.mouse.move(b.x + b.w - 1, b.y + b.h / 2, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(250); };
  let bw = await blkWords(0, 0, 9); bw = await blkWords(0, 0, 9);
  await swipe(bw);
  ok(await page.isVisible('#annoBar') && await page.locator('.notebox').count() === 0, 'selecting words on a PowerPoint slide shows the bar (and adds no note)');
  await page.click('#annoBar .hdot[data-c="#a5d8ff"]'); await page.waitForTimeout(250);
  ok(await page.locator('mark.anno').count() >= 1 && await page.locator('mark.anno').first().evaluate(m => m.style.getPropertyValue('--ac') === '#a5d8ff' && getComputedStyle(m).backgroundColor === 'rgb(165, 216, 255)' && !!m.dataset.id), 'a colour wraps the words in mark.anno');
  ok(await page.locator('.notebox').count() === 0, 'and still no note');
  bw = await blkWords(1, 0, 8); bw = await blkWords(1, 0, 8);
  await swipe(bw);
  await page.click('#annoBar [data-cm]'); await page.waitForTimeout(250);
  ok(await page.isVisible('#annoPop'), 'Comment opens the pop-up on a slide too');
  await page.keyboard.type('Ask about the shift in demand'); await page.screenshot({path: path.join(OUT, 'anno-7-pptx.png')});
  await page.keyboard.press('Control+Enter'); await page.waitForTimeout(300);
  ok(await page.locator('mark.anno[data-cm]:not([data-done])').count() === 1 && await page.locator('mark.anno[data-cm]').first().evaluate(m => getComputedStyle(m, '::after').content !== 'none'), 'a commented highlight carries data-cm and a badge');
  ok((await page.$$eval('#noteList .ncard', cs => cs.map(c => c.textContent))).some(t => t.includes('Ask about the shift') && t.includes('Comment on “')), 'listed in the Notes panel');
  // the highlight paints into the PDF
  const bgPix = await page.evaluate(async () => {
    const m = document.querySelector('mark.anno'), card = m.closest('.slide'), cv = await paintCard(card, 1), cr = card.getBoundingClientRect(), r = m.getClientRects()[0];
    return [...cv.getContext('2d').getImageData(Math.round(r.left - cr.left + 1), Math.round(r.top - cr.top + 1), 1, 1).data];
  });
  ok(bgPix[0] < 200 && bgPix[2] > 230, 'highlighted words on a slide are painted into the PDF: ' + bgPix);
  await page.waitForTimeout(800);
  await page.reload(); await page.waitForTimeout(2000);
  ok(await page.locator('mark.anno').count() >= 2 && await page.locator('mark.anno[data-cm]').first().getAttribute('data-cm') === 'Ask about the shift in demand', 'highlights and the comment are still there after a reload');
  // clicking one opens its pop-up; resolve hides the badge
  await page.locator('mark.anno[data-cm]').first().scrollIntoViewIfNeeded();
  await page.locator('mark.anno[data-cm]').first().click({position: {x: 5, y: 5}}); await page.waitForTimeout(300);
  ok(await page.isVisible('#annoPop') && (await page.inputValue('#annoPop textarea')) === 'Ask about the shift in demand' && await page.locator('.notebox').count() === 0, 'clicking a highlight opens its comment');
  await page.click('#annoPop [data-a=resolve]'); await page.waitForTimeout(400);
  ok(await page.locator('mark.anno[data-cm]:not([data-done])').count() === 0 && await page.locator('mark.anno[data-done]').count() === 1, 'Resolve hides the badge');
  await page.locator('mark.anno[data-done]').first().click({position: {x: 5, y: 5}}); await page.waitForTimeout(300);
  await page.click('#annoPop [data-a=remove]'); await page.waitForTimeout(400);
  ok(await page.locator('mark.anno').count() === 1 && await page.evaluate(() => !document.querySelector('.blk').innerHTML.includes('data-cm')), 'Remove highlight unwraps the words');

  // ---- study mode: highlights show, the bar does not, the pop-up is read only ----
  await page.waitForTimeout(700);
  await page.click('#docList .nb >> nth=1 >> .docbtn'); await page.waitForTimeout(1200);
  await page.click('#readBtn'); await page.waitForTimeout(400);
  ok(await card(2).locator('svg.ink g.mk rect').count() >= 2 && await card(2).locator('svg.ink g.bd').count() === 1, 'study mode shows highlights and comment badges');
  w1 = await wordsAt(2, 'Each firm');
  await dragOver(w1);
  ok(!(await page.isVisible('#annoBar')), 'study mode: no bar when you select words');
  await page.mouse.click(5, 700);
  w1 = await wordsAt(2, 'barriers');
  await page.mouse.click(w1.x + w1.w * 0.4, w1.y + w1.h * 0.5); await page.waitForTimeout(300);
  ok(await page.isVisible('#annoPop') && await page.getAttribute('#annoPop textarea', 'readonly') !== null && !(await page.locator('#annoPop [data-a=save]').isVisible()) && !(await page.locator('#annoPop [data-a=remove]').isVisible()) && await page.locator('#annoPop [data-a=resolve]').isVisible(), 'study mode: the pop-up is read only, but Resolve works');
  await page.screenshot({path: path.join(OUT, 'anno-8-study.png')});
  await page.click('#annoPop [data-a=resolve]'); await page.waitForTimeout(400);
  ok((await ink(2))[1].cm.done === true, 'Resolve works in study mode');
  await page.click('#readBtn'); await page.waitForTimeout(300);

  await browser.close();

  // ---- dark mode ----
  const d = await open(APP, {colorScheme: 'dark'});
  const dp = d.page;
  await dp.waitForTimeout(500);
  await dp.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await dp.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await dp.waitForTimeout(800);
  await dp.locator('.pagecard').nth(2).locator('.strip').first().scrollIntoViewIfNeeded(); await dp.waitForTimeout(300);
  await dp.click('#tab-insert'); await dp.click('#drawBtn');
  const db = await dp.locator('.pagecard').nth(2).locator('.strip').first().boundingBox();
  for (const [c, y] of [['#c62828', 0.62], ['#1f4fd1', 0.7]]) {
    await dp.click(`#drawBar .sw[data-c="${c}"]`);
    await dp.mouse.move(db.x + db.width * 0.5, db.y + db.height * y); await dp.mouse.down();
    for (const [fx, fy] of [[0.55, y - 0.04], [0.6, y + 0.03], [0.65, y - 0.04], [0.7, y]]) await dp.mouse.move(db.x + db.width * fx, db.y + db.height * fy, {steps: 5});
    await dp.mouse.up();
  }
  await dp.screenshot({path: path.join(OUT, 'anno-9-dark-draw.png')});
  await dp.keyboard.press('Escape');
  const dw = await dp.evaluate(() => { const sp = [...document.querySelectorAll('.pagecard')[2].querySelectorAll('.tl')].find(s => s.textContent.includes('Each firm')); const r = sp.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; });
  await dp.mouse.move(dw.x + 2, dw.y + dw.h / 2); await dp.mouse.down(); await dp.mouse.move(dw.x + dw.w * 0.7, dw.y + dw.h / 2, {steps: 8}); await dp.mouse.up(); await dp.waitForTimeout(300);
  await dp.click('#annoBar [data-cm]'); await dp.keyboard.type('Why is P = MR here?'); await dp.waitForTimeout(200);
  await dp.screenshot({path: path.join(OUT, 'anno-10-dark-comment.png')});
  await dp.keyboard.press('Control+Enter'); await dp.waitForTimeout(300);
  await dp.click('#notesBtn'); await dp.waitForTimeout(500);
  await dp.screenshot({path: path.join(OUT, 'anno-11-dark-notes.png')});
  await d.browser.close();
  const derr = d.errors.filter(e => !/ERR_FAILED|net::/.test(e));
  ok(!derr.length, 'dark mode: no page errors');
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  if (errs.length) { console.log(errs.join('\n')); throw new Error('FAILED: page errors'); }
  console.log('no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

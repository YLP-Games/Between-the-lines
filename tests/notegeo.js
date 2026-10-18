// Note geometry: a pencil icon moves by itself (Shift+drag takes the note along), a double-click on a box's edge fits it to its words,
// pages grow to hold notes near their bottom (nothing is cut off), and clicking a note's buttons or handles never moves it
const {open} = require('./harness');
const path = require('path');
const OUT = path.join(__dirname, 'shots');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const near = (a, b, t = 1.5) => Math.abs(a - b) <= t;
const PAD = 48;          // the room a page keeps below its lowest note

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);
  const R = loc => loc.evaluate(e => { const r = e.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom}; });
  const show = async (loc, dy = 0) => { await loc.evaluate((e, dy) => { e.scrollIntoView({block: 'center', behavior: 'instant'}); scrollBy(0, dy); }, dy); await page.waitForTimeout(250); };
  const away = async () => { await page.mouse.click(5, 700); await page.waitForTimeout(300); };
  const saved = () => page.waitForFunction(() => document.getElementById('saveState').dataset.s === 'saved', null, {timeout: 5000}).then(() => page.waitForTimeout(200));
  // what is on screen at the top, middle and bottom of a box: is it the box itself?
  const shown = loc => loc.evaluate(b => { const r = b.getBoundingClientRect(); return [r.top + 6, r.top + r.height / 2, r.bottom - 6].every(y => b.contains(document.elementFromPoint(r.left + 30, y))); });
  const relTo = (a, c) => ({x: a.x - c.x, y: a.y - c.y});
  const press = async (loc, jx = 0, jy = 0) => { const g = await R(loc); const x = g.x + g.w / 2, y = g.y + g.h / 2; await page.mouse.move(x, y); await page.mouse.down(); if (jx || jy) await page.mouse.move(x + jx, y + jy); await page.mouse.up(); await page.waitForTimeout(250); };

  // ---- B: dragging a minimised note's pencil icon moves only the icon ----
  const card = page.locator('.pagecard').nth(2);
  await show(card);
  let s = await R(card.locator('.strip').first());
  await page.mouse.move(s.x + 200, s.y + s.h * 0.3, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.keyboard.type('Anchored here'); await page.waitForTimeout(150);
  await away();
  const box = card.locator('.notebox').first();
  const b0 = relTo(await R(box), await R(card));
  await box.hover(); await box.locator('.g-min').click(); await page.waitForTimeout(300);
  ok(/Shift\+drag/.test(await box.locator('.note-chip').getAttribute('title')), 'the pencil icon\'s tooltip tells about Shift+drag');
  const c0 = await R(box.locator('.note-chip')), before = await box.evaluate(b => [b.previousElementSibling?.dataset.y1, b.nextElementSibling?.dataset.y0].join());
  await page.mouse.move(c0.x + c0.w / 2, c0.y + c0.h / 2); await page.mouse.down();
  await page.mouse.move(c0.x + c0.w / 2 + 300, c0.y + c0.h / 2 + 120, {steps: 12}); await page.mouse.up(); await page.waitForTimeout(300);
  const c1 = await R(box.locator('.note-chip'));
  ok(near(c1.x - c0.x, 300, 3) && near(c1.y - c0.y, 120, 3), 'dragging the pencil icon moves it');
  ok(await box.evaluate(b => b.classList.contains('collapsed')) && await box.evaluate(b => [b.previousElementSibling?.dataset.y1, b.nextElementSibling?.dataset.y0].join()) === before, 'the note stays minimised, between the same lines');
  await saved();
  const chipRel = async () => relTo(await R(card.locator('.notebox').first().locator('.note-chip')), await R(card));
  const k0 = await chipRel();
  ok((await page.evaluate(() => currentDoc())).includes('--cdx'), 'the icon\'s own place is saved');
  await page.reload(); await page.waitForTimeout(2500);
  await show(card);
  const k1 = await chipRel();
  ok(near(k0.x, k1.x) && near(k0.y, k1.y), `after a reload the icon is still where it was dropped (${k1.x.toFixed(0)},${k1.y.toFixed(0)})`);
  await box.locator('.note-chip').click(); await page.waitForTimeout(400);
  const b1 = relTo(await R(box), await R(card));
  ok(!(await box.evaluate(b => b.classList.contains('collapsed'))), 'clicking the icon opens the note');
  ok(near(b1.x, b0.x, 2) && near(b1.y, b0.y, 2), `it opens where it was, not where the icon is (at ${b1.x.toFixed(0)},${b1.y.toFixed(0)}; it was at ${b0.x.toFixed(0)},${b0.y.toFixed(0)})`);
  await away(); await box.hover(); await box.locator('.g-min').click(); await page.waitForTimeout(300);
  const k2 = await chipRel();
  ok(near(k2.x, k0.x) && near(k2.y, k0.y), 'minimised again, its icon goes back to where it was dragged');
  // Shift+drag takes the note along
  const cr = await R(card), c2 = await R(box.locator('.note-chip')), to = {x: cr.x + cr.w * 0.55, y: cr.y + cr.h * 0.72};
  await page.mouse.move(c2.x + c2.w / 2, c2.y + c2.h / 2); await page.keyboard.down('Shift'); await page.mouse.down();
  await page.mouse.move(to.x, to.y, {steps: 12}); await page.mouse.up(); await page.keyboard.up('Shift'); await page.waitForTimeout(700);      // (the click that ends a drag is ignored for a moment)
  const c3 = await R(box.locator('.note-chip'));
  ok(await box.evaluate(b => b.classList.contains('collapsed')) && near(c3.x + c3.w / 2, to.x, 3) && near(c3.y + c3.h / 2, to.y, 3), 'Shift+drag: the note stays minimised, its icon where it was dropped');
  await box.locator('.note-chip').click(); await page.waitForTimeout(400);
  const b2 = await R(box);
  ok(Math.abs(b2.y - to.y) < 40 && b2.x <= to.x + 4 && b2.r >= to.x, `and it opens where the icon was dropped (${b2.x.toFixed(0)},${b2.y.toFixed(0)}; dropped at ${to.x.toFixed(0)},${to.y.toFixed(0)})`);
  ok(!(await box.evaluate(b => b.classList.contains('floating'))) && await card.locator('.notebox').count() === 1, 'still a note between the lines, on the same page');
  await away();

  // ---- G: floating a note near the bottom of a PDF page keeps it where it is, and it is not cut off ----
  const card4 = page.locator('.pagecard').nth(3);
  await show(card4, 250);
  s = await R(card4.locator('.strip').last());
  await page.mouse.move(s.x + 200, s.y + s.h * 0.96, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.keyboard.type('Near the bottom of the page: a long note that wraps onto several lines once it floats at a narrower width, so that it reaches down past the bottom edge of the page and would be cut off there'); await page.waitForTimeout(150);
  await away();
  const low = card4.locator('.notebox').first();
  await show(low, 120);
  const l0 = await R(low);
  await low.hover({position: {x: 80, y: 8}}); await low.locator('.g-float').click(); await page.waitForTimeout(500);
  const l1 = await R(low);
  ok(await low.evaluate(b => b.classList.contains('floating')), 'the float button floats the note');
  ok(near(l1.x, l0.x) && near(l1.y, l0.y), `floating it keeps its top-left corner in place (${l1.x.toFixed(1)},${l1.y.toFixed(1)} was ${l0.x.toFixed(1)},${l0.y.toFixed(1)})`);
  await show(low);
  ok((await R(low)).b > (await R(card4.locator('.strip').last())).b + 20 && await shown(low), 'and the part of it below the bottom of the slide\'s picture is not cut off');
  ok((await R(card4)).b >= (await R(low)).b + 40, 'the page grows, with blank room below the picture, to hold it');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.pagecard')).overflow) === 'visible', 'a PDF page does not clip what hangs over its edge');
  ok((await R(page.locator('.pagecard').nth(4))).y > (await R(low)).b, 'the next page moves down rather than sit under the note');
  const l2 = await R(low);
  await low.hover({position: {x: 80, y: 8}}); await low.locator('.g-float').click(); await page.waitForTimeout(500);
  const l3 = await R(low);
  ok(!(await low.evaluate(b => b.classList.contains('floating'))) && near(l3.x, l2.x) && near(l3.y, l2.y), `back between the lines, it stays put too (${l3.x.toFixed(1)},${l3.y.toFixed(1)} was ${l2.x.toFixed(1)},${l2.y.toFixed(1)})`);
  // two notes at the very end of a page: floating the last one doesn't send it to the top of the page
  await page.evaluate(() => { const c = document.querySelectorAll('.pagecard')[3]; for (const t of ['End note one', 'End note two']) { const {box, el} = makeBox(); el.textContent = t; c.append(box); } saveSoon(); });
  await page.waitForTimeout(300);
  const last = card4.locator('.notebox').last();
  await show(last);
  const e0 = await R(last);
  await last.hover({position: {x: 80, y: 8}}); await last.locator('.g-float').click(); await page.waitForTimeout(500);
  const e1 = await R(last);
  ok(near(e1.x, e0.x) && near(e1.y, e0.y) && await shown(last), `the last of two notes at the end of a page floats where it is, in sight (${e1.x.toFixed(1)},${e1.y.toFixed(1)} was ${e0.x.toFixed(1)},${e0.y.toFixed(1)})`);
  await page.screenshot({path: path.join(OUT, 'notegeo-1-pdf.png')});
  await away();

  // ---- a blank page with floating notes ----
  await show(page.locator('#main .slide').nth(0)); await page.locator('#main .slide').nth(0).click({position: {x: 30, y: 30}}).catch(() => {});
  await page.click('#tab-insert'); await page.click('#addPageBtn'); await page.waitForTimeout(700); await away();
  const bp = page.locator('#main .blankpage').first();
  await show(bp);
  const bp0 = await R(bp);
  await page.evaluate(() => { const bp = document.querySelector('.blankpage'), r = bp.getBoundingClientRect(), z = zoomOf(bp);
    for (const [id, t, x, y, w] of [['tA', 'Note A', 120, 150, 260], ['tB', 'Note B, on top of A', 200, 170, 260], ['tF', 'Fit me', 520, 60, 384]]) {
      const {box, el} = makeBox(); box.id = id; el.textContent = t; box.classList.add('floating'); box.style.width = w + 'px'; bp.append(box); setFloatPos(box, r.left + x * z, r.top + y * z); }
    placeFloats(); saveSoon(); });
  await page.waitForTimeout(400);
  const nA = page.locator('#tA'), nB = page.locator('#tB'), nF = page.locator('#tF');
  const geo = loc => loc.evaluate(b => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, b.dataset.px, b.dataset.py, b.style.width, b.style.minHeight].map(v => typeof v === 'number' ? v.toFixed(1) : v).join(' '); });
  // G: the note you press comes to the front
  const zz = () => page.evaluate(() => ['tA', 'tB'].map(id => +getComputedStyle(document.getElementById(id)).zIndex));
  const ra = await R(nA), rb = await R(nB), topAt = () => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.notebox')?.textContent.slice(0, 6), [Math.max(ra.x, rb.x) + 20, Math.max(ra.y, rb.y) + 8]);
  ok(await topAt() === 'Note B', 'where notes A and B overlap, B is in front');
  await nA.hover({position: {x: 30, y: 8}}); await press(nA.locator('.g-move'));
  const z1 = await zz();
  ok(z1[0] > z1[1] && await topAt() === 'Note A', `pressing note A's handle brings it in front of B (z-index ${z1.slice(0, 2).join(' over ')})`);
  // G: a press on a handle (even with a tiny wobble) changes nothing
  for (const d of ['move', 'e', 's', 'se', 'w', 'n', 'nw', 'ne', 'sw']) {
    await nA.hover({position: {x: 60, y: 12}});
    const g0 = await geo(nA);
    await press(nA.locator('.g-' + d), 2, 1);
    ok(await geo(nA) === g0, `pressing the ${d} handle without dragging leaves the note where it is`);
  }
  // G: putting a floating note back between the lines keeps it where it is
  await nB.hover({position: {x: 230, y: 12}});
  const f0 = await R(nB);
  await nB.locator('.g-float').click(); await page.waitForTimeout(500);
  const f1 = await R(nB);
  ok(!(await nB.evaluate(b => b.classList.contains('floating'))) && near(f1.x, f0.x) && near(f1.y, f0.y), `a floating note in the middle of a blank page goes back between the lines right where it is (${f1.x.toFixed(1)},${f1.y.toFixed(1)} was ${f0.x.toFixed(1)},${f0.y.toFixed(1)})`);
  await nB.hover({position: {x: 230, y: 12}}); await nB.locator('.g-float').click(); await page.waitForTimeout(500);
  const f2 = await R(nB);
  ok(await nB.evaluate(b => b.classList.contains('floating')) && near(f2.x, f0.x) && near(f2.y, f0.y), 'and floats again just there');
  await away();

  // ---- E: double-click a resize handle and the box fits its words ----
  await saved();
  await nF.hover({position: {x: 60, y: 12}});
  const w0 = await R(nF), wst = await nF.evaluate(b => b.style.width);
  await nF.locator('.g-se').dblclick(); await page.waitForTimeout(300);
  const w1 = await R(nF), st1 = await nF.evaluate(b => [b.style.width, b.style.minHeight]);
  ok(w1.w < w0.w - 150 && w1.w > 60, `a wide box shrinks to its words (${w0.w.toFixed(0)} to ${w1.w.toFixed(0)}px wide)`);
  ok(near(w1.x, w0.x) && near(w1.y, w0.y), 'its top-left corner stays put');
  ok(/^\d+px$/.test(st1[0]) && /^\d+px$/.test(st1[1]), `with a width and height in pixels, like a resize (${st1.join(', ')})`);
  ok(await nF.evaluate(b => { const m = b.querySelector('.mine'), r = document.createRange(); r.selectNodeContents(m); return r.getClientRects().length === 1; }), 'the words still fit on one line');
  await saved(); await away();
  await page.keyboard.press('Control+z'); await page.waitForTimeout(600);
  ok(await page.evaluate(() => document.getElementById('tF').style.width) === wst, 'Back (Ctrl+Z) undoes it, like a resize');
  // a narrow box grows: wider, so its words take fewer lines
  await page.evaluate(() => { const b = document.getElementById('tF'); b.querySelector('.mine').textContent = 'A line long enough to wrap in a narrow box'; b.style.width = '110px'; saveSoon(); });
  await page.waitForTimeout(300);
  await nF.hover({position: {x: 30, y: 12}});
  const g0 = await R(nF);
  await nF.locator('.g-e').dblclick(); await page.waitForTimeout(300);
  const g1 = await R(nF);
  ok(g1.w > g0.w + 100 && g1.h < g0.h - 20 && near(g1.x, g0.x) && near(g1.y, g0.y), `a narrow box grows to fit its words (${g0.w.toFixed(0)}x${g0.h.toFixed(0)} to ${g1.w.toFixed(0)}x${g1.h.toFixed(0)}), top-left in place`);
  // … but not past the edge of the page
  await page.evaluate(() => { const b = document.getElementById('tF'); b.querySelector('.mine').textContent = 'A very long line of words that would run far past the right-hand edge of this page if nothing stopped it'; saveSoon(); });
  await page.waitForTimeout(300);
  await nF.hover({position: {x: 30, y: 12}}); await nF.locator('.g-w').dblclick(); await page.waitForTimeout(300);
  const g2 = await R(nF), pr = await bp.evaluate(p => { const r = p.getBoundingClientRect(); return r.left + (p.clientLeft + p.clientWidth) * zoomOf(p); });
  ok(g2.r <= pr + 1 && g2.r > pr - 30 && near(g2.x, g0.x), `a long line fills the room up to the page's edge, no further (right edge ${g2.r.toFixed(0)}, page ${pr.toFixed(0)})`);
  await away();

  // ---- F: a page grows to hold a note near its bottom, and shrinks back ----
  await page.evaluate(() => { const bp = document.querySelector('.blankpage'); bp.scrollIntoView({block: 'center', behavior: 'instant'}); const r = bp.getBoundingClientRect(); addSticky(bp, r.left + 100, r.bottom - 90, 'Sticky near the bottom\nline 2\nline 3\nline 4\nline 5\nline 6'); saveSoon(); });
  await page.waitForTimeout(400);
  const st = bp.locator('.notebox.sticky');
  let p1 = await R(bp), q1 = await R(st);
  ok(p1.b >= q1.b + 40 && near(p1.w, bp0.w), `the blank page grows to hold the sticky note, with room below it (page ends ${(p1.b - q1.b).toFixed(0)}px below it)`);
  await show(st); ok(await shown(st.locator('.mine')), 'the sticky note is all there');
  // typing more lines near the bottom of the screen: the page grows and the caret stays in sight
  await st.evaluate(b => { const r = b.getBoundingClientRect(); scrollBy(0, r.bottom - (innerHeight - 60)); }); await page.waitForTimeout(250);
  await st.locator('.mine').click(); await page.keyboard.press('Control+End');
  for (let i = 7; i <= 12; i++) { await page.keyboard.press('Enter'); await page.keyboard.type('line ' + i); }
  await page.waitForTimeout(400);
  const caret = await page.evaluate(() => { const r = getSelection().getRangeAt(0).getClientRects()[0]; return r ? r.bottom : null; }), sb = await R(page.locator('#statusbar'));
  p1 = await R(bp); q1 = await R(st);
  ok(p1.b >= q1.b + 40, `typing more, the page keeps growing (page ends ${(p1.b - q1.b).toFixed(0)}px below the note)`);
  ok(caret !== null && caret <= sb.y, `and the caret stays in sight above the status bar (${caret?.toFixed(0)} <= ${sb.y.toFixed(0)})`);
  await page.screenshot({path: path.join(OUT, 'notegeo-2-blank.png')});
  // a shorter note: the page goes back to its own shape
  await page.keyboard.press('Control+a'); await page.keyboard.type('Short now'); await page.waitForTimeout(400);
  await away();
  const p2 = await R(bp), q2 = await R(st);
  ok(p2.h < p1.h - 100 && near(p2.b - q2.b, PAD, 2) && near(p2.w, bp0.w), `when the note is short again the page shrinks with it (${p1.h.toFixed(0)} to ${p2.h.toFixed(0)}px tall)`);
  // the sticky dragged down past the bottom: the page grows; dragged back up, it shrinks
  await st.hover();
  const tape = await R(st.locator('.g-move'));
  await page.mouse.move(tape.x + tape.w / 2, tape.y + tape.h / 2); await page.mouse.down(); await page.mouse.move(tape.x + tape.w / 2, tape.y + tape.h / 2 + 60, {steps: 6}); await page.mouse.up(); await page.waitForTimeout(400);
  const p3 = await R(bp), q3 = await R(st);
  ok(p3.b >= q3.b + 40, 'dragged lower, the page grows to hold it');
  await st.hover(); const tape2 = await R(st.locator('.g-move'));
  await page.mouse.move(tape2.x + tape2.w / 2, tape2.y + tape2.h / 2); await page.mouse.down(); await page.mouse.move(tape2.x + tape2.w / 2, tape2.y + tape2.h / 2 - 300, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(400);
  ok(near((await R(bp)).h, bp0.h), 'dragged back up, it shrinks to its own size again');
  await away();

  // ---- F: beside the slides, a slide and its side page are always as tall as each other ----
  await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(600);
  const sp = page.locator('.sidepage').nth(5), sl = page.locator('#main .slide').nth(5);
  const same = async () => { const a = await R(sl), b = await R(sp); return near(a.y, b.y) && near(a.h, b.h, 2); };
  await show(sp);
  const sl0 = await R(sl);
  ok(await same(), 'a side page starts level with its slide and as tall');
  // a note between the lines opens up the slide; its side page follows
  s = await R(sl.locator('.strip').first());
  await page.mouse.move(s.x + 200, s.y + s.h * 0.55, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.keyboard.type('A note on the slide');
  for (let i = 2; i <= 4; i++) { await page.keyboard.press('Enter'); await page.keyboard.type('slide line ' + i); }
  await away();
  const slm = await R(sl);
  ok(slm.h > sl0.h + 60 && await same(), `a note between the lines makes the slide taller, and its side page with it (${sl0.h.toFixed(0)} to ${slm.h.toFixed(0)}px)`);
  // long side notes near the bottom of the side page
  await show(sp);
  const sp0 = await R(sp);
  await page.mouse.click(sp0.x + 60, sp0.b - 50); await page.waitForTimeout(250);
  await page.keyboard.type('A side note low down');
  for (let i = 2; i <= 8; i++) { await page.keyboard.press('Enter'); await page.keyboard.type('side line ' + i); }
  await page.waitForTimeout(500);
  const sn = sp.locator('.notebox').first(), sp1 = await R(sp), sn1 = await R(sn), sz = await sp.evaluate(p => zoomOf(p));
  const caret2 = await page.evaluate(() => { const r = getSelection().getRangeAt(0).getClientRects()[0]; return r ? r.bottom : null; }), sb2 = await R(page.locator('#statusbar'));
  ok((sp1.b - sn1.b) / sz >= 40, `the side page grows to hold its note, with room below (${((sp1.b - sn1.b) / sz).toFixed(0)}px)`);
  ok(caret2 !== null && caret2 <= sb2.y, `typing in it keeps the caret in sight (${caret2?.toFixed(0)} <= ${sb2.y.toFixed(0)})`);
  const sl1 = await R(sl);
  ok(sp1.h > slm.h + 60 && await same(), `when its notes make the side page taller, the slide beside it grows to match (${sl1.h.toFixed(0)} and ${sp1.h.toFixed(0)}px)`);
  await show(sl);
  ok(await sl.evaluate(c => { const r = c.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.bottom - 12); return e === c && getComputedStyle(c).backgroundColor === 'rgb(255, 255, 255)'; }), 'with blank room of its own colour below it');
  await page.screenshot({path: path.join(OUT, 'notegeo-3-side.png')});
  await away();
  // the notes on the pages hidden (the side notes stay open): the slide closes up, but stays as tall as its side page
  const hideMain = on => page.evaluate(on => { for (const b of main.querySelectorAll('.notebox')) if (!b.closest('.sidepage')) on ? setCollapsed(b, true) : openNote(b); afterNotesToggle(); }, on);
  await hideMain(true); await page.waitForTimeout(500);
  const sl4 = await R(sl), sp4 = await R(sp);
  ok(await sl.locator('.notebox.collapsed').count() === 1 && await sn.evaluate(b => !b.classList.contains('collapsed')), 'hiding the notes on the pages minimises the slide\'s note, not the side note');
  ok(await same() && near(sp4.h, sp1.h, 2), `the slide stays as tall as its side page (${sl4.h.toFixed(0)} and ${sp4.h.toFixed(0)}px)`);
  await hideMain(false); await page.waitForTimeout(500);
  ok(await same() && near((await R(sp)).h, sp1.h, 2), 'shown again, they still match');
  // side notes shorter, then gone: both shrink back together, to the slide's own size
  await sn.locator('.mine').click(); await page.keyboard.press('Control+a'); await page.keyboard.type('Short side note'); await page.waitForTimeout(500);
  await away();
  const sp2 = await R(sp), sl2 = await R(sl), want = Math.max(slm.h, (await R(sn)).b - sp2.y + PAD * sz);
  ok(sl2.h < sl1.h - 60 && await same() && near(sl2.h, want, 3), `shorter again, both shrink back together (${sl2.h.toFixed(0)} and ${sp2.h.toFixed(0)}px; the slide alone is ${slm.h.toFixed(0)})`);
  await sn.locator('.mine').click(); await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await away(); await page.waitForTimeout(300);
  ok(await sp.locator('.notebox').count() === 0 && await same() && near((await R(sl)).h, slm.h), `with the side note gone, both are back to the slide's own size (${(await R(sl)).h.toFixed(0)}px)`);
  await hideMain(true); await page.waitForTimeout(500);
  ok(await same() && near((await R(sl)).h, sl0.h), `and with the slide's note hidden too, to the size of the slide itself (${(await R(sl)).h.toFixed(0)}px)`);

  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });

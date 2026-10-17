// iPad and tablets: touch, Apple Pencil, press-and-hold menus, the keyboard, rotation, hit targets
const {openIpad, pen, touch, synthPen} = require('./ipad');
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const shot = (page, n) => page.screenshot({path: path.join(OUT, n + '.png')});

(async () => {
  // a pretend visual viewport, so the on-screen keyboard can be shown and hidden (Chromium has no keyboard to open)
  const r = await openIpad(APP, {width: 1024, height: 1366});
  const {browser, page, cdp, errors} = r;
  const card = i => page.locator('.pagecard').nth(i);
  const ink = i => page.evaluate(i => JSON.parse(document.querySelectorAll('.pagecard')[i].dataset.ink || '[]'), i);
  const scrollY = () => page.evaluate(() => window.scrollY);
  const stripBox = async (i, n = 0) => card(i).locator('.strip').nth(n).boundingBox();
  const show = async i => { await card(i).evaluate(c => { c.scrollIntoView({block: 'start', behavior: 'instant'}); scrollBy({top: -(document.querySelector('.appbar').offsetHeight + 40), behavior: 'instant'}); }); await page.waitForTimeout(600); };
  const hold = async (x, y, ms = 700) => { await touch(cdp, 'touchStart', [[x, y]]); await page.waitForTimeout(ms); await touch(cdp, 'touchEnd', []); await page.waitForTimeout(250); };
  const drag = async (x, y, dx, dy, n = 10) => {
    await touch(cdp, 'touchStart', [[x, y]]);
    for (let k = 1; k <= n; k++) await touch(cdp, 'touchMove', [[x + dx * k / n, y + dy * k / n]]);
    await touch(cdp, 'touchEnd', []); await page.waitForTimeout(300);
  };
  const penStroke = async (pts, o = {}) => {
    await pen(cdp, 'mouseMoved', pts[0][0], pts[0][1]);
    await pen(cdp, 'mousePressed', pts[0][0], pts[0][1], {force: pts[0][2] ?? .5});
    for (const [x, y, f] of pts.slice(1)) await pen(cdp, 'mouseMoved', x, y, {down: true, force: f ?? .5});
    await pen(cdp, 'mouseReleased', pts.at(-1)[0], pts.at(-1)[1], {force: 0});
    await page.waitForTimeout(250);
  };
  const wave = (b, y, n = 22, f0 = .1, f1 = .9) => Array.from({length: n}, (_, k) => [b.x + 80 + k * 14, b.y + y + Math.sin(k / 3) * 22, f0 + (f1 - f0) * k / (n - 1)]);
  const small = async () => page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a[href], select, input:not([type=hidden]):not([type=file]), [role=button], [role=menuitem], summary, .grip, .pg, .docbtn, label.chk')) {
      const q = el.getBoundingClientRect(); if (!q.width || !q.height) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[hidden], .gappill:not(:hover)') && false) continue;
      let hidden = false; for (let n = el; n && n !== document.body; n = n.parentElement) { const c = getComputedStyle(n); if (c.display === 'none' || c.visibility === 'hidden' || n.hidden) { hidden = true; break; } if (c.opacity === '0') { hidden = true; break; } }
      if (hidden || q.right < 0 || q.bottom < 0 || q.left > innerWidth || q.top > innerHeight && false) continue;
      if (el.closest('.grip') && el.classList.contains('grip') && !el.closest('.nbar')) continue;     // (note handles: checked above, with their catching area)
      if (el.classList.contains('note-chip')) { const cx = q.left + q.width / 2, cy = q.top + q.height / 2; if ([[19, 0], [-19, 0], [0, 19], [0, -19]].every(([dx, dy]) => { const e2 = document.elementFromPoint(cx + dx, cy + dy); return e2?.closest('.note-chip') === el || !!e2?.closest('.pop'); })) continue; out.push('chip reach ' + [[19, 0], [-19, 0], [0, 19], [0, -19]].map(([dx, dy]) => { const e = document.elementFromPoint(cx + dx, cy + dy); return e && (e.className.baseVal ?? e.className); }).join('|') + ' rect ' + [q.left, q.top, q.width].map(Math.round)); continue; }     // (a small icon: its catching area reaches 19px out)
      if (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) continue;     // (the label around it is the target)
      if (Math.min(q.width, q.height) < 39.5) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} ${Math.round(q.width)}x${Math.round(q.height)} "${(el.getAttribute('title') || el.textContent || '').trim().slice(0, 22)}"`);
    }
    return out;
  });
  let bad = [];
  const audit = async label => { bad.push(...(await small()).map(x => label + ': ' + x)); };
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth);

  // ---- the page itself: an iPad Safari app ----
  ok(await page.evaluate(() => matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches), '(the browser here is a touch device that cannot hover, as an iPad is)');
  const meta = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('meta[name^=apple-mobile-web-app], meta[name=viewport]')].map(m => [m.name, m.content])));
  ok(meta['apple-mobile-web-app-capable'] === 'yes' && meta['apple-mobile-web-app-title'] === 'Between the Lines' && meta['apple-mobile-web-app-status-bar-style'], 'the page asks to run as a full-screen web app, titled "Between the Lines"');
  ok(/viewport-fit=cover/.test(meta.viewport), 'with viewport-fit=cover, so the safe areas are ours to respect');
  const acc = await page.getAttribute('#file', 'accept');
  ok(['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/html', 'text/markdown', 'text/plain', '.pptx', '.docx'].every(t => acc.includes(t)), 'the file picker lists MIME types as well as extensions, so iOS does not grey out .pptx and .docx');
  ok(await page.locator('.pagecard').count() >= 3, 'a PDF opened on the iPad-sized screen');
  ok(await noHScroll(), 'no sideways scrolling at 1024 x 1366');
  await shot(page, 'tablet-1-portrait');

  // ---- add a note by tapping ----
  await show(1);
  let b = await stripBox(1);
  await page.touchscreen.tap(b.x + 360, b.y + b.height * .45); await page.waitForTimeout(400);
  ok(await page.locator('.gappill').isVisible(), 'tapping between the lines shows "+ Add here"');
  const pb = await page.locator('.gappill').boundingBox();
  ok(pb.height >= 40, 'and the button is big enough for a fingertip (' + Math.round(pb.height) + 'px)');
  ok(await page.locator('.gapline').isVisible(), 'with the dashed line to show where');
  await page.touchscreen.tap(pb.x + pb.width / 2, pb.y + pb.height / 2); await page.waitForTimeout(500);
  ok(await page.locator('.notebox').count() === 1 && await page.evaluate(() => !!document.activeElement.closest('.mine')), 'tapping it adds a note with the cursor in it');
  await page.keyboard.type('Pencil and touch notes'); await page.waitForTimeout(200);
  ok((await page.locator('.notebox .mine').first().innerText()).includes('Pencil and touch notes'), 'typing works');
  await page.keyboard.press('Enter'); await page.keyboard.type('second line'); await page.waitForTimeout(200);

  // ---- tap a note: handles; float it; move and resize by finger ----
  await page.locator('body').click({position: {x: 1012, y: 700}});
  const nb = card(1).locator('.notebox').first();
  let nr = await nb.boundingBox();
  await page.touchscreen.tap(nr.x + nr.width / 2, nr.y + nr.height / 2); await page.waitForTimeout(300);
  ok(await nb.evaluate(n => n.classList.contains('touched')), 'tapping a note shows its handles');
  const gsz = await nb.locator('.nbar .grip').evaluateAll(gs => gs.map(g => { const q = g.getBoundingClientRect(); return Math.min(q.width, q.height); }));
  ok(gsz.length >= 3 && gsz.every(v => v >= 40), 'its toolbar buttons are 40px or more (' + gsz.map(Math.round) + ')');
  const fl = await nb.locator('.g-float').boundingBox();
  await page.touchscreen.tap(fl.x + fl.width / 2, fl.y + fl.height / 2); await page.waitForTimeout(400);
  ok(await nb.evaluate(n => n.classList.contains('floating')), 'the float button works by touch');
  await page.waitForTimeout(700); await nb.evaluate(n => n.scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(200); nr = await nb.boundingBox();
  await page.touchscreen.tap(nr.x + nr.width / 2, nr.y + nr.height / 2); await page.waitForTimeout(800);
  await nb.evaluate(n => n.scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(200); nr = await nb.boundingBox();
  let mv = await nb.locator('.g-move').boundingBox();
  const x0 = nr.x, y0 = nr.y;
  await drag(mv.x + mv.width / 2, mv.y + mv.height / 2, 120, 60);
  nr = await nb.boundingBox();
  ok(Math.abs(nr.x - x0 - 120) < 25 && Math.abs(nr.y - y0 - 60) < 25, 'a note moves when you drag its handle with a finger (by ' + Math.round(nr.x - x0) + ', ' + Math.round(nr.y - y0) + ')');
  await page.touchscreen.tap(nr.x + nr.width / 2, nr.y + nr.height / 2); await page.waitForTimeout(800);
  await nb.evaluate(n => n.scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(200); nr = await nb.boundingBox();
  const se = await nb.locator('.g-se').boundingBox(), w0 = nr.width, h0 = nr.height;
  await drag(se.x + se.width / 2, se.y + se.height / 2, 90, 50);
  nr = await nb.boundingBox();
  ok(nr.width > w0 + 50 && nr.height > h0 + 20, 'and resizes when you drag its corner (' + Math.round(w0) + 'x' + Math.round(h0) + ' to ' + Math.round(nr.width) + 'x' + Math.round(nr.height) + ')');
  // a fat catching area: 14px outside the right edge still catches the edge handle
  await page.touchscreen.tap(nr.x + nr.width / 2, nr.y + nr.height / 2); await page.waitForTimeout(800);
  const ge = await nb.locator('.g-e').boundingBox();
  ok(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.g-e'), [ge.x + ge.width + 9, ge.y + ge.height / 2]), 'the edge handle can be caught from 9px outside it');
  await shot(page, 'tablet-2-note');

  // ---- press and hold ----
  await page.locator('body').click({position: {x: 1012, y: 700}});
  await show(2); b = await stripBox(2);
  await page.touchscreen.tap(b.x + 300, b.y + b.height * .6); await page.waitForTimeout(400);
  let pill = await page.locator('.gappill').boundingBox();
  await hold(pill.x + pill.width / 2, pill.y + pill.height / 2, 750);
  ok(await page.locator('.imenu').isVisible(), 'press and hold on "+ Add here" opens the menu of a note, a sticky note and an equation');
  ok(await page.locator('.notebox').count() === 1, '(and did not add a note)');
  await audit('add menu'); await shot(page, 'tablet-3-gapmenu');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  // the pencil chip's colours
  await nb.evaluate(n => n.scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(300); nr = await nb.boundingBox();
  await page.touchscreen.tap(nr.x + nr.width / 2, nr.y + nr.height / 2); await page.waitForTimeout(300);
  await page.waitForTimeout(400); const mn = await nb.locator('.g-min').boundingBox();
  await page.touchscreen.tap(mn.x + mn.width / 2, mn.y + mn.height / 2); await page.waitForTimeout(400);
  await page.waitForTimeout(600); await nb.evaluate(n => n.scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(300);
  const chip = await nb.locator('.note-chip').boundingBox();
  ok(!!chip, 'a minimised note is a pencil chip');
  await hold(chip.x + chip.width / 2, chip.y + chip.height / 2, 800);
  ok(await page.locator('.chippop').isVisible(), 'press and hold on a pencil chip opens its colours');
  await audit('chip colours'); await shot(page, 'tablet-4-chip');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.touchscreen.tap(chip.x + chip.width / 2, chip.y + chip.height / 2); await page.waitForTimeout(400);
  ok(await nb.evaluate(n => !n.classList.contains('collapsed')), 'a tap on the chip opens the note again');
  // a notebook row in the sidebar
  if (await page.locator('#pagesPanel').isHidden()) { await page.touchscreen.tap(...(await page.locator('#pagesBtn').boundingBox().then(q => [q.x + q.width / 2, q.y + q.height / 2]))); await page.waitForTimeout(500); }
  const row = await page.locator('#docList .docbtn').first().boundingBox();
  await hold(row.x + row.width / 2, row.y + row.height / 2, 700);
  ok(await page.locator('.docmenu').isVisible(), 'press and hold on a notebook in the sidebar opens its menu (rename, duplicate, trash...)');
  await audit('notebook menu'); await shot(page, 'tablet-5-docmenu');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !document.body.classList.contains('dragging')) && await page.locator('#docList .docbtn').count() === 1, '(it did not leave a drag half-done)');
  await page.touchscreen.tap(...(await page.locator('#pagesBtn').boundingBox().then(q => [q.x + q.width / 2, q.y + q.height / 2]))); await page.waitForTimeout(400);
  // spelling: tap a misspelt word
  await page.waitForFunction(() => typeof spellDict !== 'undefined' && !!spellDict, null, {timeout: 20000}).catch(() => {});
  const spellReady = await page.evaluate(() => typeof spellDict !== 'undefined' && !!spellDict);
  if (spellReady) {
    await nb.locator('.mine').click(); await page.keyboard.press('End'); await page.keyboard.type(' recieve teh'); await page.waitForTimeout(1200);
    await page.locator('body').click({position: {x: 1012, y: 700}}); await page.waitForTimeout(300);
    const w = await page.evaluate(() => {
      const n = document.querySelector('.notebox .mine'), t = n.firstChild && document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      for (let x = t.nextNode(); x; x = t.nextNode()) { const i = x.data.indexOf('recieve'); if (i >= 0) { const r = document.createRange(); r.setStart(x, i); r.setEnd(x, i + 7); const q = r.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; } }
    });
    if (w) { await page.touchscreen.tap(w[0], w[1]); await page.waitForTimeout(700); ok(await page.locator('.spellmenu').isVisible(), 'tapping a misspelt word shows spelling suggestions'); await audit('spelling'); await shot(page, 'tablet-6-spell'); await page.keyboard.press('Escape'); }
  } else console.log('    (the spelling dictionary did not load here, so the spelling menu was not tried)');
  await page.locator('body').click({position: {x: 1012, y: 700}});

  // ---- Apple Pencil: draws without the Draw tool; pressure; saved; reload ----
  await show(3); b = await stripBox(3);
  ok(await page.evaluate(() => !document.body.classList.contains('drawing')), 'Draw is off');
  const before3 = (await ink(3)).length;
  b = await stripBox(3);
  await penStroke(wave(b, 120));
  let it = await ink(3);
  ok(it.length === before3 + 1 && it.at(-1).k === 'pen', 'the Pencil draws on the page even though Draw is off');
  const st = it.at(-1), pr = st.p.map(q => q[2]);
  ok(st.p.length > 12 && st.p.every(q => q.length === 3), 'every point carries a pressure (' + st.p.length + ' points)');
  ok(Math.max(...pr) - Math.min(...pr) > .5 && pr[0] < .3 && pr.at(-1) > .6, 'and it follows how hard the Pencil was pressed (' + pr[0] + ' ... ' + pr.at(-1) + ')');
  const pd = await card(3).locator('svg.ink path.pen').last().evaluate(p => ({fill: p.getAttribute('fill'), stroke: p.getAttribute('stroke'), d: p.getAttribute('d')}));
  ok(pd.stroke === 'none' && pd.fill !== 'none', 'it is painted as a shape that gets thicker as the pressure rises');
  // width differs along the stroke: measure the filled shape's thickness near both ends
  const thick = await card(3).locator('svg.ink path.pen').last().evaluate(p => {
    const len = p.getTotalLength(), bb = p.getBBox(); return {w: bb.width, h: bb.height};
  });
  ok(thick.w > 200, 'it spans the stroke');
  ok(await page.evaluate(() => !document.body.classList.contains('drawing')) && await page.locator('.notebox').count() === 1, 'the Pencil stroke did not add a note or turn Draw on');
  await shot(page, 'tablet-7-pencil');
  // an old stroke (no pressure) still draws the same way
  await page.evaluate(() => { const c = document.querySelectorAll('.pagecard')[3], a = JSON.parse(c.dataset.ink); a.push({k: 'pen', c: '#c62828', w: 3.5, p: [[40, 40], [80, 60], [120, 40], [160, 60]]}); setInk(c, a); saveSoon(); });
  const oldp = await card(3).locator('svg.ink path.pen').last().evaluate(p => ({fill: p.getAttribute('fill'), sw: p.getAttribute('stroke-width'), cap: p.getAttribute('stroke-linecap')}));
  ok(oldp.fill === 'none' && oldp.sw === '3.5' && oldp.cap === 'round', 'a stroke saved before pressure existed draws exactly as it did (a line of one width)');
  await page.waitForTimeout(900);
  await page.reload(); await page.waitForTimeout(2200);
  it = await ink(3);
  ok(it.length === before3 + 2 && it.some(s => s.p[0].length === 3) && await card(3).locator('svg.ink path.pen').count() === it.length, 'after a reload both strokes are back, the pressure one still with its pressures');
  await show(3); b = await stripBox(3);

  // a finger drag scrolls the page and does not draw
  const s0 = await scrollY(), n0 = (await ink(3)).length;
  await drag(b.x + 400, 900, 0, -300, 14); await page.waitForTimeout(500);
  ok(await scrollY() > s0 + 100 && (await ink(3)).length === n0, 'a finger drag scrolls the page and draws nothing');
  await show(3); b = await stripBox(3);

  // pen hover is a mouse hover, not a tap
  await page.mouse.move(5, 5);
  await pen(cdp, 'mouseMoved', b.x + 400, b.y + b.height * .55); await page.waitForTimeout(100);
  await pen(cdp, 'mouseMoved', b.x + 410, b.y + b.height * .56); await page.waitForTimeout(400);
  ok(await page.locator('.gappill').isVisible(), 'a hovering Pencil shows "+ Add here" like a mouse does');
  ok(await page.locator('.touched').count() === 0 && (await ink(3)).length === n0, 'and is not a tap (nothing is selected, nothing drawn)');
  const nbc = await page.locator('.notebox').count();
  await pen(cdp, "mouseMoved", 700, 30); await page.waitForTimeout(300);
  await show(3); b = await stripBox(3);
  // a quick tap with the Pencil is a tap: no dot is drawn, it shows the button
  await pen(cdp, 'mouseMoved', b.x + 300, b.y + b.height * .3); await pen(cdp, 'mousePressed', b.x + 300, b.y + b.height * .3); await pen(cdp, 'mouseReleased', b.x + 300, b.y + b.height * .3); await page.waitForTimeout(500);
  ok((await ink(3)).length === n0 && await page.locator('.gappill').isVisible(), 'a quick tap with the Pencil draws no dot and shows "+ Add here"');

  // palm rejection: a finger down while the pen writes does nothing
  {
    const s1 = await scrollY(), n1 = (await ink(3)).length;
    const P = wave(b, 300, 24, .3, .6);
    await pen(cdp, 'mouseMoved', P[0][0], P[0][1]); await pen(cdp, 'mousePressed', P[0][0], P[0][1], {force: .4});
    for (const [i, [x, y, f]] of P.slice(1, 8).entries()) await pen(cdp, 'mouseMoved', x, y, {down: true, force: f});
    await touch(cdp, 'touchStart', [[b.x + 700, b.y + 480, 5]]);
    for (const [i, [x, y, f]] of P.slice(8, 20).entries()) { await pen(cdp, 'mouseMoved', x, y, {down: true, force: f}); await touch(cdp, 'touchMove', [[b.x + 700 + i * 6, b.y + 480 - i * 18, 5]]); }
    await touch(cdp, 'touchEnd', []);
    for (const [x, y, f] of P.slice(20)) await pen(cdp, 'mouseMoved', x, y, {down: true, force: f});
    await pen(cdp, 'mouseReleased', P.at(-1)[0], P.at(-1)[1], {force: 0}); await page.waitForTimeout(400);
    it = await ink(3);
    ok(it.length === n1 + 1 && it.at(-1).p.length > 15, 'palm rejection: the pen stroke is one stroke, and the resting hand drew nothing (' + it.length + ' strokes)');
    ok(Math.abs(await scrollY() - s1) < 4, 'and did not scroll the page');
  }

  // ---- a Pencil stroke on a note's text is for writing ----
  {
    const t = await card(1).locator('.notebox .mine').first().boundingBox(), c1 = (await ink(1)).length;
    await show(1);
    const t2 = await card(1).locator('.notebox .mine').first().boundingBox();
    await penStroke([[t2.x + 30, t2.y + t2.height / 2, .5], [t2.x + 90, t2.y + t2.height / 2 + 4, .5], [t2.x + 150, t2.y + t2.height / 2, .5], [t2.x + 200, t2.y + t2.height / 2 + 3, .5]]);
    ok((await ink(1)).length === c1, 'a Pencil stroke on a note draws nothing there (Scribble can write in it)');
  }

  // ---- the setting ----
  await page.click('#helpBtn'); await page.waitForTimeout(300);
  ok(await page.locator('#penAuto').isChecked() && (await page.textContent('#tabletSec h3')) === 'On iPad and tablets', 'Help has "On iPad and tablets" and the setting "Apple Pencil draws automatically", on by default');
  const hb = await page.locator('#penAuto').boundingBox();
  await shot(page, 'tablet-8-help');
  await page.locator('#penAuto').evaluate(e => e.scrollIntoView({block: 'center'})); await page.waitForTimeout(150);
  await page.locator('label[for=penAuto]').click(); await page.waitForTimeout(200);
  ok(!(await page.locator('#penAuto').isChecked()) && await page.evaluate(() => localStorage.getItem('pen-auto')) === '0', 'it can be turned off, and is remembered');
  await page.click('#setClose'); await page.waitForTimeout(200);
  await show(3); b = await stripBox(3);
  const n2 = (await ink(3)).length;
  await penStroke(wave(b, 400, 12));
  ok((await ink(3)).length === n2, 'with it off the Pencil does not draw by itself');
  await page.click('#tab-insert'); await page.click('#drawBtn'); await page.waitForTimeout(200);
  await penStroke(wave(b, 430, 12));
  ok((await ink(3)).length === n2 + 1, 'but it draws while Draw is on');
  await page.click('#drawBtn');
  await page.reload(); await page.waitForTimeout(2200);
  await page.click('#helpBtn'); await page.waitForTimeout(300);
  ok(!(await page.locator('#penAuto').isChecked()), 'the setting is still off after a reload');
  await page.locator('#penAuto').evaluate(e => e.scrollIntoView({block: 'center'})); await page.locator('label[for=penAuto]').click(); await page.click('#setClose');
  await page.waitForTimeout(200);

  // ---- the on-screen keyboard (a pretend visual viewport) ----
  await page.evaluate(() => {
    const vv = new EventTarget(); Object.assign(vv, {height: innerHeight, width: innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1});
    Object.defineProperty(window, 'visualViewport', {value: vv, configurable: true});
    window.__vv = vv;
    // (the app listens at start-up, so give it the new one)
  });
  // the app attached its listeners to the real visualViewport at start-up; call its handler the way the real event would
  const kb = async h => { await page.evaluate(h => { __vv.height = h; fitKeyboard(); }, h); await page.waitForTimeout(500); };
  await show(2); b = await stripBox(2);
  await page.touchscreen.tap(b.x + 300, b.y + b.height * .7); await page.waitForTimeout(300);
  await page.touchscreen.tap(...(await page.locator('.gappill').boundingBox().then(q => [q.x + q.width / 2, q.y + q.height / 2]))); await page.waitForTimeout(500);
  const live = page.locator('.notebox .mine:focus');
  ok(await live.count() === 1, 'a new note to type in');
  await kb(1366 - 420);
  ok(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--kb').trim()) === '420px' && await page.evaluate(() => document.body.classList.contains('kb-open')), 'the keyboard opens: the app knows how tall it is (420px)');
  // type enough lines to push the caret to the bottom; it must stay above the keyboard
  for (let i = 0; i < 14; i++) { await page.keyboard.type('line ' + i); await page.keyboard.press('Enter'); }
  await page.waitForTimeout(500);
  const caret = await page.evaluate(() => { const s = getSelection(), r = s.getRangeAt(0).cloneRange(); r.collapse(true); const q = r.getClientRects()[0] || r.startContainer.getBoundingClientRect?.(); return {bottom: q.bottom, vis: __vv.height + __vv.offsetTop}; });
  ok(caret.bottom <= caret.vis, 'typing keeps the caret above the keyboard (caret bottom ' + Math.round(caret.bottom) + ', keyboard top ' + Math.round(caret.vis) + ')');
  // floating bars lift above it
  await page.evaluate(() => { document.body.append(Object.assign(document.createElement('div'), {id: 'probeBar', className: 'toast show'})); });
  const tb = await page.locator('#probeBar').boundingBox();
  ok(tb.y + tb.height <= 1366 - 420, 'the pop-up bars sit above the keyboard (bottom ' + Math.round(tb.y + tb.height) + ' <= ' + (1366 - 420) + ')');
  await page.evaluate(() => document.getElementById('probeBar').remove());
  await kb(1366);
  ok(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--kb').trim()) === '0px' && await page.evaluate(() => !document.body.classList.contains('kb-open')), 'the keyboard closes and the bars come back down');
  await page.evaluate(() => { __vv.height = innerHeight * .5; __vv.scale = 2; fitKeyboard(); });
  ok(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--kb').trim()) === '0px', 'a pinch zoom (smaller visual viewport, scale 2) is not mistaken for the keyboard');
  await page.evaluate(() => { __vv.height = innerHeight; __vv.scale = 1; fitKeyboard(); });
  await page.locator('body').click({position: {x: 1012, y: 700}});

  // ---- rotation: keeps the page you were on; no sideways scroll; sizes ----
  await show(3); await page.evaluate(() => scrollBy({top: 260, behavior: 'instant'})); await page.waitForTimeout(300);
  const spotBefore = await page.evaluate(() => { const y = document.querySelector('.appbar').getBoundingClientRect().bottom + 8; const cs = [...document.querySelectorAll('.pagecard')]; const c = cs.find(c => c.getBoundingClientRect().bottom > y); const r = c.getBoundingClientRect(); return {i: cs.indexOf(c), f: (y - r.top) / r.height}; });
  await page.evaluate(() => scrollBy(0, 200)); await page.waitForTimeout(300);
  const spotMid = await page.evaluate(() => { const y = document.querySelector('.appbar').getBoundingClientRect().bottom + 8; const cs = [...document.querySelectorAll('.pagecard')]; const c = cs.find(c => c.getBoundingClientRect().bottom > y); const r = c.getBoundingClientRect(); return {i: cs.indexOf(c), f: (y - r.top) / r.height}; });
  await page.setViewportSize({width: 1366, height: 1024}); await page.waitForTimeout(1200);
  const spotAfter = await page.evaluate(() => { const y = document.querySelector('.appbar').getBoundingClientRect().bottom + 8; const cs = [...document.querySelectorAll('.pagecard')]; const c = cs.find(c => c.getBoundingClientRect().bottom > y); const r = c.getBoundingClientRect(); return {i: cs.indexOf(c), f: (y - r.top) / r.height}; });
  ok(spotAfter.i === spotMid.i && Math.abs(spotAfter.f - spotMid.f) < .04, 'rotating to landscape keeps you at the same spot on the same page (page ' + (spotMid.i + 1) + ', ' + Math.round(spotMid.f * 100) + '% down, then ' + Math.round(spotAfter.f * 100) + '%)');
  ok(await noHScroll(), 'no sideways scrolling in landscape');
  await shot(page, 'tablet-9-landscape');
  await page.setViewportSize({width: 1024, height: 1366}); await page.waitForTimeout(1200);
  const back = await page.evaluate(() => { const y = document.querySelector('.appbar').getBoundingClientRect().bottom + 8; const cs = [...document.querySelectorAll('.pagecard')]; const c = cs.find(c => c.getBoundingClientRect().bottom > y); const r = c.getBoundingClientRect(); return {i: cs.indexOf(c), f: (y - r.top) / r.height}; });
  ok(back.i === spotMid.i && Math.abs(back.f - spotMid.f) < .04, 'and back to portrait');
  await page.setViewportSize({width: 820, height: 1180}); await page.waitForTimeout(1200);
  ok(await noHScroll(), 'no sideways scrolling at 820 x 1180');
  const narrow = await page.evaluate(() => { const y = document.querySelector('.appbar').getBoundingClientRect().bottom + 8; const cs = [...document.querySelectorAll('.pagecard')]; const c = cs.find(c => c.getBoundingClientRect().bottom > y); const r = c.getBoundingClientRect(); return {i: cs.indexOf(c), f: (y - r.top) / r.height, w: r.width}; });
  ok(narrow.w < 800 && narrow.i === spotMid.i && Math.abs(narrow.f - spotMid.f) < .04, 'at 820 wide the pages are narrower (' + Math.round(narrow.w) + 'px) and you are still at the same spot on page ' + (narrow.i + 1) + ' (' + Math.round(narrow.f * 100) + '% down, was ' + Math.round(spotMid.f * 100) + '%)');
  await shot(page, 'tablet-10-820');
  await page.setViewportSize({width: 1024, height: 1366}); await page.waitForTimeout(800);

  // ---- hit targets: everything you can press is 40px or more with a coarse pointer ----
  for (const tab of ['home', 'insert', 'box', 'view']) { await page.click('#tab-' + tab); await page.waitForTimeout(250); await audit(tab); }
  // the formula panel and the highlight bar
  await page.click('#tab-insert'); await page.click('#formulaBtn').catch(() => {}); await page.waitForTimeout(300); await audit('formula'); await page.keyboard.press('Escape');
  await show(3);
  await page.evaluate(() => { const t = [...document.querySelectorAll('.pagecard')[3].querySelectorAll('.tl')].find(e => e.textContent.trim().length > 6); const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new PointerEvent('pointerup', {bubbles: true})); });
  await page.waitForTimeout(500); await audit('highlight bar'); await page.evaluate(() => getSelection().removeAllRanges());
  await page.click('#helpBtn'); await page.waitForTimeout(300); await audit('help'); await page.click('#setClose');
  await page.click('#tab-insert'); await page.click('#drawBtn'); await page.waitForTimeout(250); await audit('draw'); await page.click('#drawBtn');
  await page.click('#save'); await page.waitForTimeout(250); await audit('download'); await page.keyboard.press('Escape'); await page.mouse.click(1012, 600);
  bad = [...new Set(bad)];
  if (bad.length) console.log('    small targets:\n      ' + bad.join('\n      '));
  ok(bad.length === 0, 'every button, tab, menu entry and field is 40px or more on a touch screen');

  // a mouse (fine pointer) keeps the desktop sizes
  {
    const d = await open(APP, {width: 1440, height: 900});
    await d.page.waitForTimeout(600);
    const h = await d.page.evaluate(() => ({btn: document.querySelector('#undoBtn').getBoundingClientRect().height, tab: document.querySelector('#tab-home').getBoundingClientRect().height, coarse: matchMedia('(pointer: coarse)').matches, st: getComputedStyle(document.documentElement).getPropertyValue('--status-h')}));
    ok(!h.coarse && h.btn === 34 && h.tab === 36 && h.st.trim() === '34px', 'with a mouse the sizes are the same as ever (buttons 34px, tabs 36px, status bar 34px)');
    await d.browser.close();
  }

  console.log(errors.length ? errors : 'no page errors');
  if (errors.length) process.exit(1);
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });

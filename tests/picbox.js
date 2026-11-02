// A picture put on the page (Insert › Picture with no note being typed in, or pasted or dropped onto a page) is its own box, not a text box:
// it looks like a picture, takes no typing, keeps its shape when resized from a corner or an edge, moves, floats, is resized by the picture bar,
// is removed whole, survives a reload and Study mode. A picture inserted, pasted or dropped into a note still goes into that note
const {open} = require('./harness');
const path = require('path');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(800);
  const card = page.locator('.pagecard').nth(1);
  await card.scrollIntoViewIfNeeded(); await card.click({position: {x: 30, y: 30}}).catch(() => {}); await page.mouse.click(5, 700); await page.waitForTimeout(300);
  const boxes = () => page.locator('#main .picbox');
  const R = el => el.evaluate(n => { const r = n.getBoundingClientRect(); return {l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height}; });
  // a little picture made in the page, as a file to paste or drop
  const PNG = (w, h) => [w, h];
  const makePng = () => page.evaluate(() => { window.__png = ([w, h]) => new Promise(r => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, w, h); c.toBlob(b => r(new File([b], 'made.png', {type: 'image/png'}))); }); });
  const insertPic = async () => { await page.click('#tab-insert'); const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#mediaBtn')]); await fc.setFiles(path.join(__dirname, 'pic.png')); await page.waitForTimeout(700); };
  // point at a box, then drag one of its handles
  const drag = async (box, dir, dx, dy) => {
    const r = await R(box); await page.mouse.move(r.l + r.w / 2, r.t + r.h / 2, {steps: 2}); await page.waitForTimeout(200);
    const g = await R(box.locator(`:scope > .g-${dir}`)), x = g.l + g.w / 2, y = g.t + g.h / 2;
    await page.mouse.move(x, y, {steps: 2}); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(300);
  };

  // ---- Insert › Picture with no note being typed in: its own box ----
  ok(await page.evaluate(() => !noteActive()), 'no note is being typed in');
  await insertPic();
  ok(await boxes().count() === 1, 'Insert › Picture makes a picture box');
  const pb = boxes().first();
  const look = await pb.evaluate(b => { const m = b.querySelector(':scope > .mine'), cs = getComputedStyle(m), g = s => b.querySelector(s);
    return {inNote: !!b.parentElement.closest('.notebox'), onPage: b.parentElement.classList.contains('pagecard'), media: m.querySelectorAll('.media').length, text: m.textContent.trim(), ce: m.contentEditable, editable: m.isContentEditable,
      border: cs.borderTopWidth, pad: cs.paddingTop + cs.paddingRight, bg: cs.backgroundColor, shadow: cs.boxShadow, ph: getComputedStyle(m, '::before').content,
      chip: getComputedStyle(g('.note-chip')).display, min: getComputedStyle(g('.g-min')).display, link: getComputedStyle(g('.g-link')).display, move: !!g(':scope > .g-move'), float: !!g('.g-float'), w: b.getBoundingClientRect().width, nat: m.querySelector('img').naturalWidth,
      sel: m.querySelector('.media').classList.contains('media-sel'), bar: !document.querySelector('.mediabar').hidden}; });
  ok(!look.inNote && look.onPage, 'it sits on the page between the lines, not inside another note');
  ok(look.media === 1 && !look.text, 'it holds just the picture');
  ok(look.ce === 'false' && !look.editable, 'it takes no typing');
  ok(look.border === '0px' && look.pad === '0px0px' && /rgba\(0, 0, 0, 0\)|transparent/.test(look.bg) && look.shadow === 'none' && look.ph === 'none', `it has no outline, fill, padding, ring or "type here" (${look.border}, ${look.pad}, ${look.bg}, ${look.shadow}, ${look.ph})`);
  ok(look.chip === 'none' && look.min === 'none' && look.link === 'none' && look.move && look.float, 'no pencil icon, minimise or link button; it keeps its move and float handles');
  ok(Math.abs(look.w - look.nat) < 2, `it is as wide as the picture itself (${look.w} for ${look.nat})`);
  ok(look.sel && look.bar, 'the new picture is selected, with its picture bar');
  // hovering shows no ring around it
  let r = await R(pb); await page.mouse.move(r.l + r.w / 2, r.t + r.h / 2); await page.waitForTimeout(250);
  ok(await pb.evaluate(b => getComputedStyle(b.querySelector('.mine')).boxShadow) === 'none', 'pointing at it draws no text box ring');
  ok(await page.evaluate(() => !document.querySelector('#noteInfo').textContent), 'it is not counted as a note in the status bar');

  // ---- resizing keeps its shape ----
  const center = () => pb.evaluate(n => n.scrollIntoView({block: 'center', behavior: 'instant'})).then(() => page.waitForTimeout(150));
  await page.mouse.click(5, 700); await page.waitForTimeout(200); await center();
  let r0 = await R(pb);
  await drag(pb, 'se', 90, 10);
  let r1 = await R(pb);
  ok(r1.w > r0.w + 60 && Math.abs(r1.w / r1.h - r0.w / r0.h) < 0.03, `the corner makes it bigger and it keeps its shape (${r0.w.toFixed(0)}×${r0.h.toFixed(0)} → ${r1.w.toFixed(0)}×${r1.h.toFixed(0)})`);
  ok(Math.abs(r1.l - r0.l) < 1.5 && Math.abs(r1.t - r0.t) < 1.5, 'and its top-left corner stays put');
  ok(await pb.evaluate(b => !b.style.minHeight && !b.style.height), 'its height just follows the picture');
  await drag(pb, 'e', -60, 0);
  let r2 = await R(pb);
  ok(r2.w < r1.w - 40 && Math.abs(r2.w / r2.h - r0.w / r0.h) < 0.03, `the right edge makes it smaller, still the same shape (${r2.w.toFixed(0)}×${r2.h.toFixed(0)})`);
  await center(); r2 = await R(pb);
  await drag(pb, 's', 0, 40);
  let r3 = await R(pb);
  ok(r3.h > r2.h + 25 && Math.abs(r3.w / r3.h - r0.w / r0.h) < 0.03, `the bottom edge makes it taller and wider together (${r3.w.toFixed(0)}×${r3.h.toFixed(0)})`);
  await drag(pb, 'nw', 30, 0);
  let r4 = await R(pb);
  ok(r4.w < r3.w - 15 && Math.abs(r4.r - r3.r) < 2 && Math.abs(r4.b - r3.b) < 3 && Math.abs(r4.w / r4.h - r0.w / r0.h) < 0.03, `the top-left corner resizes it from there, its bottom-right corner staying put (${r4.w.toFixed(0)}×${r4.h.toFixed(0)})`);
  // double-click an edge: back to its own size
  r = await R(pb); await page.mouse.move(r.l + r.w / 2, r.t + r.h / 2); await page.waitForTimeout(200);
  const ge = await R(pb.locator(':scope > .g-e')); await page.mouse.dblclick(ge.l + ge.w / 2, ge.t + ge.h / 2); await page.waitForTimeout(300);
  ok(Math.abs((await R(pb)).w - look.nat) < 2, 'double-clicking an edge gives it its own size again');

  // ---- moving ----
  await page.mouse.click(5, 700); await page.waitForTimeout(200); await center();
  r0 = await R(pb);
  await drag(pb, 'move', 120, 0);
  r1 = await R(pb);
  ok(Math.abs(r1.l - r0.l - 120) < 6 && Math.abs(r1.t - r0.t) < 2, `the move handle moves it across the page (${(r1.l - r0.l).toFixed(0)}px)`);
  // dragged by the picture itself, with a mouse
  r0 = r1; await page.mouse.move(r0.l + r0.w / 2, r0.t + r0.h / 2, {steps: 2}); await page.mouse.down(); await page.mouse.move(r0.l + r0.w / 2 - 70, r0.t + r0.h / 2, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(300);
  r1 = await R(pb);
  ok(Math.abs(r0.l - r1.l - 70) < 6, `it can be dragged by the picture too (${(r0.l - r1.l).toFixed(0)}px)`);

  // ---- the picture bar's widths resize the box ----
  await page.mouse.click(5, 700); await page.waitForTimeout(200);
  await pb.locator('.media').click(); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !!mediaSel && mediaSel.closest('.picbox') && !document.querySelector('.mediabar').hidden), 'clicking the picture selects it');
  await page.click('.mediabar [data-w="50%"]'); await page.waitForTimeout(200);
  const half = await pb.evaluate(b => ({w: b.style.width, mw: b.querySelector('.media').style.width, bw: b.getBoundingClientRect().width, mwpx: b.querySelector('.media').getBoundingClientRect().width, pw: b.parentElement.clientWidth}));
  ok(half.w === '50%' && !half.mw && Math.abs(half.bw - half.mwpx) < 1, `Medium makes the box half as wide, and the picture fills it (${half.bw.toFixed(0)}px of ${half.pw})`);
  ok(await page.evaluate(() => picSizeEl(mediaSel) === mediaSel.closest('.picbox')), 'picSizeEl gives the box of a picture on the page by itself');
  ok(await page.locator('.mediabar [data-act=note]').isVisible(), 'the bar offers a note below it');

  // ---- floating on top of the page keeps its size ----
  await center(); r0 = await R(pb); await page.mouse.move(r0.l + r0.w / 2, r0.t + r0.h / 2); await page.waitForTimeout(200);
  await pb.locator('.g-float').click(); await page.waitForTimeout(300);
  r1 = await R(pb);
  ok(await pb.evaluate(b => b.classList.contains('floating')) && Math.abs(r1.l - r0.l) < 2 && Math.abs(r1.t - r0.t) < 2, 'it floats on top of the page where it was');
  await page.mouse.move(r1.l + 10, r1.t + 10); await page.mouse.move(r1.l + r1.w / 2, r1.t + r1.h / 2); await page.waitForTimeout(250);
  await pb.locator('.g-float').click(); await page.waitForTimeout(300);
  ok(await pb.evaluate(b => !b.classList.contains('floating')), 'and goes back between the lines');

  // ---- Hide notes leaves it showing; Study mode never makes it editable ----
  await page.evaluate(() => main.querySelectorAll('.notebox').forEach(b => setCollapsed(b, true))); await page.waitForTimeout(200);
  ok(await pb.evaluate(b => !b.classList.contains('collapsed')), 'Hide notes leaves the picture showing');
  await page.evaluate(() => { $('#readBtn').click(); }); await page.waitForTimeout(200);
  ok(await pb.evaluate(b => b.querySelector('.mine').contentEditable === 'false'), 'in Study mode it is read only');
  await page.evaluate(() => { $('#readBtn').click(); }); await page.waitForTimeout(200);
  ok(await pb.evaluate(b => b.querySelector('.mine').contentEditable === 'false'), 'and after Study mode it still takes no typing');
  ok(await page.evaluate(() => /class="notebox picbox[^"]*"[^>]*>\s*<div class="mine"[^>]*contenteditable="false"/.test(currentDoc())), 'it is stored as a picture box that takes no typing');

  // ---- it is kept after a reload ----
  const before = await pb.evaluate(b => b.style.width);
  await page.waitForTimeout(1200); await page.evaluate(() => snapNow()); await page.reload(); await page.waitForTimeout(2500);
  const after = await page.evaluate(() => { const b = document.querySelector('#main .picbox'); return b && {n: document.querySelectorAll('#main .picbox').length, w: b.style.width, ce: b.querySelector('.mine').contentEditable, img: b.querySelector('.media img')?.naturalWidth, grips: b.querySelectorAll('.grip').length}; });
  ok(after && after.n === 1 && after.w === before && after.ce === 'false' && after.img > 0 && after.grips > 8, `after a reload it is still a picture box, its size kept, with its handles (${JSON.stringify(after)})`);

  // ---- Remove deletes the whole box, and Back brings it back ----
  await makePng();
  const pb2 = boxes().first(); await pb2.scrollIntoViewIfNeeded();
  await pb2.locator('.media').click(); await page.waitForTimeout(200);
  const nb0 = await page.locator('#main .notebox').count();
  await page.click('.mediabar [data-act=remove]'); await page.waitForTimeout(400);
  ok(await boxes().count() === 0 && await page.locator('#main .notebox').count() === nb0 - 1, 'Remove takes away the whole picture box');
  await page.mouse.click(5, 700); await page.waitForTimeout(800);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(800);
  ok(await boxes().count() === 1, 'Back brings it back');
  // Delete on a selected picture removes it too
  await boxes().first().scrollIntoViewIfNeeded(); await boxes().first().locator('.media').click(); await page.waitForTimeout(200);
  await page.keyboard.press('Delete'); await page.waitForTimeout(400);
  ok(await boxes().count() === 0, 'Delete on a selected picture removes its box');

  // ---- inserting while typing in a note puts it in that note ----
  const strip = page.locator('.pagecard').nth(2).locator('.strip').first(); await strip.scrollIntoViewIfNeeded();
  let sb = await strip.boundingBox(); await page.mouse.move(sb.x + 200, sb.y + sb.height / 2, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.keyboard.type('Words then a picture ');
  await insertPic();
  const inNote = await page.evaluate(() => ({pics: document.querySelectorAll('#main .picbox').length, inNote: document.querySelectorAll('#main .notebox:not(.picbox) > .mine .media').length, text: document.querySelector('#main .notebox:not(.picbox) .media')?.closest('.mine').textContent}));
  ok(inNote.pics === 0 && inNote.inNote === 1 && /Words then a picture/.test(inNote.text), 'Insert › Picture while typing in a note puts it into that note');
  // pasting into a note keeps it in the note
  await page.evaluate(async png => { const f = await window.__png(png), dt = new DataTransfer(); dt.items.add(f); const m = document.querySelector('#main .notebox:not(.picbox) > .mine'); m.focus(); m.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true})); }, PNG(60, 30));
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => document.querySelectorAll('#main .notebox:not(.picbox) > .mine .media').length === 2 && !document.querySelector('#main .picbox')), 'a picture pasted into a note goes into the note');
  // dropping into a note keeps it in the note
  await page.evaluate(async png => { const f = await window.__png(png), dt = new DataTransfer(); dt.items.add(f); const m = document.querySelector('#main .notebox:not(.picbox) > .mine'), r = m.getBoundingClientRect();
    m.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10})); }, PNG(60, 30));
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => document.querySelectorAll('#main .notebox:not(.picbox) > .mine .media').length === 3 && !document.querySelector('#main .picbox')), 'a picture dropped into a note goes into the note');
  await page.mouse.click(5, 700); await page.waitForTimeout(400);

  // ---- pasted when not in a note: its own box on the page ----
  await page.evaluate(() => document.activeElement?.blur());
  await page.evaluate(async png => { const f = await window.__png(png), dt = new DataTransfer(); dt.items.add(f); document.body.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true})); }, PNG(300, 150));
  await page.waitForTimeout(600);
  const pasted = await page.evaluate(() => { const b = document.querySelector('#main .picbox'); return b && {inNote: !!b.parentElement.closest('.notebox'), w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height}; });
  ok(pasted && !pasted.inNote && Math.abs(pasted.w - 300) < 2 && Math.abs(pasted.h - 150) < 2, `a picture pasted on the page is its own box, at its own size (${JSON.stringify(pasted)})`);

  // ---- dropped on a page: its own box, between the lines where it was dropped ----
  const dcard = page.locator('.pagecard').nth(3); await dcard.scrollIntoViewIfNeeded();
  const dropped = await page.evaluate(async png => {
    const f = await window.__png(png), dt = new DataTransfer(); dt.items.add(f);
    const c = document.querySelectorAll('.pagecard')[3], s = c.querySelector(':scope > .strip'), r = s.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height * 0.4;
    const over = new DragEvent('dragover', {dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y}); document.elementFromPoint(x, y).dispatchEvent(over);
    const covered = !document.querySelector('#dropCover').hidden;
    document.elementFromPoint(x, y).dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y}));
    await new Promise(r => setTimeout(r, 500));
    const b = c.querySelector(':scope > .picbox');
    return {covered, here: !!b, between: !!b && b.previousElementSibling?.classList.contains('strip') && b.nextElementSibling?.classList.contains('strip'), pages: document.querySelectorAll('.pagecard').length, w: b && b.getBoundingClientRect().width, cw: c.clientWidth};
  }, PNG(3000, 600));
  ok(!dropped.covered, 'dragging a picture over a page does not cover it with "Drop to open"');
  ok(dropped.here && dropped.between, 'a picture dropped on a page is its own box, between the lines where it was dropped');
  ok(dropped.pages === 6, 'and it is not opened as a notebook page');
  ok(dropped.w < dropped.cw, `a picture wider than the page is made as wide as the page (${dropped.w?.toFixed(0)} of ${dropped.cw})`);
  // dropping onto a picture box adds another box, never a second picture inside it
  await page.evaluate(async png => { const f = await window.__png(png), dt = new DataTransfer(); dt.items.add(f); const m = document.querySelectorAll('.pagecard')[3].querySelector('.picbox img'), r = m.getBoundingClientRect();
    m.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5})); }, PNG(50, 50));
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => [...document.querySelectorAll('#main .picbox')].every(b => b.querySelectorAll('.media').length === 1) && document.querySelectorAll('#main .picbox').length === 3), 'dropping onto a picture box makes another box, with one picture each');

  // ---- the notes list names it as a picture ----
  ok(await page.evaluate(() => noteSummary(document.querySelector('#main .picbox > .mine')) === '(picture)'), 'it is summed up as "(picture)"');

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

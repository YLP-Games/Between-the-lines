// Insert Table: a size picker, tables in notes, Tab between cells, sizing, rows and columns, merging
const {start, settle, addNote, notebookDoc, pdfPages, near, ok, OUT, path, results} = require('./wtcommon');

(async () => {
  const {browser, page, errors, card} = await start();
  const T = () => page.locator('.wtable').first();
  const shape = () => page.evaluate(() => [...document.querySelectorAll('.wtable')].map(t => ({rows: t.rows.length, cols: t.querySelectorAll(':scope > colgroup > col').length, cells: [...t.rows].map(r => r.cells.length)})));
  const texts = () => page.$$eval('.wtable >> nth=0', () => 0).catch(() => 0).then(() => page.evaluate(() => [...document.querySelector('.wtable').rows].map(tr => [...tr.cells].map(c => c.textContent))));
  const consistent = () => page.evaluate(() => {
    const t = document.querySelector('.wtable'), m = wtModel(t);
    for (let r = 0; r < m.nr; r++) for (let c = 0; c < m.nc; c++) if (!m.at(r, c)) return `hole at ${r},${c}`;
    const area = m.cells.reduce((a, x) => a + x.rs * x.cs, 0); if (area !== m.nr * m.nc) return 'area ' + area + ' vs ' + m.nr * m.nc;
    const cols = [...t.querySelectorAll(':scope > colgroup > col')]; if (cols.length !== m.nc) return `cols ${cols.length} vs ${m.nc}`;
    const sum = cols.reduce((a, c) => a + parseFloat(c.style.width), 0); return Math.abs(sum - 100) > 0.05 ? 'widths add up to ' + sum : 'ok';
  });
  const cell = (r, c) => page.locator('.wtable').first().locator('tr').nth(r).locator('td').nth(c);
  const centre = async l => { const b = await l.boundingBox(); return {x: b.x + b.width / 2, y: b.y + b.height / 2}; };
  const quiet = async l => { const b = await l.boundingBox(); return {x: b.width - 10, y: b.height - 4}; };       // a spot away from any words and handles
  const menu = async (r, c) => { await cell(r, c).click({button: 'right', position: await quiet(cell(r, c))}); await page.waitForSelector('.wtmenu'); };
  const act = async name => { await page.click(`.wtmenu button[data-act="${name}"]`); await page.waitForTimeout(150); };
  await page.click('#tab-insert');

  // ---- the size picker ----
  ok((await page.getAttribute('#tblBtn', 'data-tip')).startsWith('Table'), 'Insert › Table has a tooltip');
  await page.click('#tblBtn'); await page.waitForSelector('.tblpick');
  ok(await page.locator('.tblpick .tp-g > i').count() === 80, 'the picker is a grid of 10 columns by 8 rows');
  ok(await page.textContent('.tp-l') === 'Insert table', 'at first it just says Insert table');
  await page.hover('.tp-g > i >> nth=23'); await page.waitForTimeout(80);
  ok(await page.textContent('.tp-l') === '4 × 3' && await page.locator('.tp-g > i.on').count() === 12, 'hovering shows how big it will be, "4 × 3" (columns × rows), and lights those squares');
  await page.hover('.tp-g > i >> nth=79'); await page.waitForTimeout(80);
  ok(await page.textContent('.tp-l') === '10 × 8' && await page.locator('.tp-g > i.on').count() === 80, 'all the way, 10 × 8');
  await page.screenshot({path: path.join(OUT, 'table-picker-light.png'), clip: {x: 380, y: 60, width: 420, height: 400}});
  await page.hover('.tp-g > i >> nth=23'); await page.waitForTimeout(50);
  ok(await page.locator('.notebox').count() === 0, 'nothing is inserted by hovering');
  await page.click('.tp-g > i >> nth=23'); await page.waitForTimeout(400);
  ok(!(await page.isVisible('.tblpick')), 'a click inserts it and closes the picker');
  let sh = await shape();
  ok(sh.length === 1 && sh[0].rows === 3 && sh[0].cols === 4 && sh[0].cells.every(n => n === 4), 'a 4 × 3 table: four columns, three rows');
  ok(await page.locator('.notebox').count() === 1 && await card.locator('.notebox .wtable').count() === 1, 'with no note open it made a new note between the lines, on the page you are on');
  const markup = await page.evaluate(() => document.querySelector('.wtable').outerHTML);
  ok(/^<table class="wtable" style="width: 100%;"><colgroup>(<col style="width: 25%;">){4}<\/colgroup><tbody>/.test(markup), 'plain HTML: a <table> with a <colgroup> of 25% columns');
  ok(await page.evaluate(() => document.activeElement.classList.contains('mine') && !!document.activeElement.querySelector('.wtable') && document.activeElement.querySelector('.wtable td') === getSelection().anchorNode), 'the cursor is in the first cell');
  // drag over the squares
  await page.mouse.click(8, 700); await page.waitForTimeout(100);
  await page.click('#tblBtn'); await page.waitForSelector('.tblpick');
  const a = await centre(page.locator('.tp-g > i').nth(11)), b = await centre(page.locator('.tp-g > i').nth(34));
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, {steps: 6});
  ok(await page.textContent('.tp-l') === '5 × 4', 'pressing and dragging across the squares follows the pointer ("5 × 4")');
  await page.mouse.up(); await page.waitForTimeout(400);
  sh = await shape();
  ok(sh.length === 2 && sh.some(x => x.rows === 4 && x.cols === 5), 'letting go inserts it (5 × 4, in another new note)');
  await settle(page); await page.click('#undoBtn'); await page.waitForTimeout(600);

  // ---- keyboard ----
  await page.mouse.click(8, 700); await page.waitForTimeout(100);
  await page.focus('#tblBtn'); await page.keyboard.press('Enter'); await page.waitForSelector('.tblpick'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => document.activeElement.classList.contains('tp-g')) && await page.textContent('.tp-l') === '1 × 1', 'Enter on the Table button opens the picker with the grid focused, at 1 × 1');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  ok(await page.textContent('.tp-l') === '3 × 3', 'arrow keys change the size (3 × 3)');
  await page.keyboard.press('ArrowLeft');
  ok(await page.textContent('.tp-l') === '2 × 3', 'Left makes it smaller (2 × 3)');
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown');
  ok(await page.textContent('.tp-l') === '10 × 8', 'it stops at 10 × 8');
  await page.keyboard.press('Escape');
  ok(!(await page.isVisible('.tblpick')) && (await shape()).length === 1 && await page.evaluate(() => document.activeElement.id) === 'tblBtn', 'Esc closes it without inserting, and focus goes back to the button');
  await page.keyboard.press('Enter'); await page.waitForSelector('.tblpick');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  sh = await shape();
  ok(sh.length === 2 && sh.some(x => x.cols === 2 && x.rows === 3), 'Enter inserts the size chosen (2 × 3)');
  // custom size
  await page.mouse.click(8, 700); await page.waitForTimeout(100);
  await page.click('#tblBtn'); await page.waitForSelector('.tblpick');
  await page.click('#tpMore'); await page.waitForTimeout(100);
  ok(await page.isVisible('#tpC') && await page.isVisible('#tpR'), '"Custom size…" shows two number boxes');
  await page.fill('#tpC', '6'); await page.fill('#tpR', '2'); await page.press('#tpR', 'Enter'); await page.waitForTimeout(400);
  sh = await shape();
  ok(sh.length === 3 && sh.some(x => x.cols === 6 && x.rows === 2), 'Enter in the boxes inserts a 6 × 2 table');
  await page.screenshot({path: path.join(OUT, 'table-custom-light.png')});

  // ---- where it goes: at the cursor of the note being edited ----
  await page.evaluate(() => { document.querySelectorAll('.wtable').forEach(t => t.closest('.notebox').remove()); saveSoon(); });
  const card4 = page.locator('.pagecard').nth(4);
  await addNote(page, card4, 'abcdef');
  await page.keyboard.press('Home'); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.click('#tab-insert'); await page.click('#tblBtn'); await page.hover('.tp-g > i >> nth=11'); await page.click('.tp-g > i >> nth=11'); await page.waitForTimeout(400);
  const inNote = await card4.locator('.notebox .mine').first().evaluate(n => ({kids: [...n.childNodes].map(c => c.nodeType === 3 ? c.data : c.nodeName), tables: n.querySelectorAll('.wtable').length}));
  ok(inNote.tables === 1 && inNote.kids[0] === 'abc' && inNote.kids[1] === 'TABLE' && inNote.kids[2] === 'def', `with a note open, the table goes inside it at the cursor (${inNote.kids.join(' ')})`);
  ok(await card4.locator('.notebox').count() === 1, 'no extra note was made');

  // ---- the add menu and the / menu ----
  await page.mouse.click(8, 700); await page.waitForTimeout(100);
  const c1 = page.locator('.pagecard').nth(1); await c1.scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
  const s1 = await c1.locator('.strip').first().boundingBox();
  await page.mouse.move(s1.x + 250, s1.y + s1.height * 0.4, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill', {button: 'right'}); await page.waitForTimeout(200);
  ok((await page.$$eval('.imenu .iitem .nm span', e => e.map(x => x.textContent))).includes('Table'), '+ Add here lists Table');
  await page.keyboard.type('tab'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ok(await c1.locator('.notebox .wtable').count() === 1 && (await shape()).some(s => s.rows === 3 && s.cols === 3), '+ Add here › Table puts a 3 × 3 table in a new note in that gap');
  await page.keyboard.type('Z'); await page.waitForTimeout(100);
  ok(await c1.locator('.wtable td').first().textContent() === 'Z', 'ready to type in the first cell');
  await page.mouse.click(8, 700);
  const c5 = page.locator('.pagecard').nth(5);
  await addNote(page, c5, 'x /tab'); await page.waitForTimeout(250);
  ok(await page.locator('.imenu .iitem').count() === 1 && (await page.textContent('.imenu .iitem .nm span')) === 'Table', 'typing /tab in a note finds Table');
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  const slash = await c5.locator('.notebox .mine').first().evaluate(n => ({txt: n.firstChild.data, tables: n.querySelectorAll('.wtable').length}));
  ok(slash.tables === 1 && slash.txt === 'x ', 'Enter puts the table in and takes the "/tab" away');
  await page.evaluate(() => { document.querySelectorAll('.notebox').forEach(b => b.remove()); saveSoon(); });

  // ---- one table to work with: 3 x 3 in its own note ----
  await page.mouse.click(8, 700);
  await page.click('#tab-insert'); await page.click('#tblBtn'); await page.hover('.tp-g > i >> nth=22'); await page.click('.tp-g > i >> nth=22'); await page.waitForTimeout(400);
  await page.keyboard.type('one'); await page.keyboard.press('Tab'); await page.keyboard.type('two'); await page.keyboard.press('Tab'); await page.keyboard.type('three');
  let tx = await texts();
  ok(tx[0].join() === 'one,two,three', 'cells take text; Tab goes to the next cell');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.type('!');
  tx = await texts();
  ok(tx[0][1] === '!' && await page.evaluate(() => ((n) => (n.nodeType === 1 ? n : n.parentElement).closest('td'))(getSelection().anchorNode) === document.querySelectorAll('.wtable td')[1]), 'Shift+Tab goes back (and the words in the cell are selected, so typing replaces them)');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  ok(await page.evaluate(() => document.querySelectorAll('.wtable td')[5] === ((n) => (n.nodeType === 1 ? n : n.parentElement).closest('td'))(getSelection().anchorNode)), 'Tab runs along the row and on to the next row');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  ok((await shape())[0].rows === 3 && await page.evaluate(() => document.querySelectorAll('.wtable td')[8] === ((n) => (n.nodeType === 1 ? n : n.parentElement).closest('td'))(getSelection().anchorNode)), 'to the last cell');
  await page.keyboard.press('Tab'); await page.keyboard.type('new');
  tx = await texts();
  ok((await shape())[0].rows === 4 && tx[3][0] === 'new' && await consistent() === 'ok', 'Tab in the last cell adds a row and moves into it');
  await page.keyboard.press('Enter'); await page.keyboard.type('second line');
  tx = await texts();
  ok(tx[3][0] === 'newsecond line' && await page.evaluate(() => document.querySelectorAll('.wtable td')[9].querySelector('br') !== null), 'Enter in a cell is a new line in that cell');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  // back to the first cell and no further
  await page.evaluate(() => { const td = document.querySelector('.wtable td'); td.closest('.mine').focus(); const r = document.createRange(); r.selectNodeContents(td); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await page.keyboard.press('Shift+Tab');
  ok(await page.evaluate(() => ((n) => (n.nodeType === 1 ? n : n.parentElement).closest('td'))(getSelection().anchorNode) === document.querySelector('.wtable td')), 'Shift+Tab in the first cell stays put (it does not indent the note)');
  ok(await page.evaluate(() => !document.querySelector('.wtable').closest('.mine').querySelector('blockquote, [style*="margin-left"]')), '… and made no indent');

  // ---- sizing ----
  await cell(1, 1).hover(); await page.waitForTimeout(200);
  ok(await page.locator('.wt-col').count() === 2 && await page.isVisible('.wt-r') && await page.isVisible('.wt-c'), 'pointing at the table shows handles: one on each column border, the right edge and the bottom-right corner');
  const before = await page.evaluate(() => ({cols: [...document.querySelectorAll('.wtable col')].map(c => parseFloat(c.style.width)), w: document.querySelector('.wtable').getBoundingClientRect().width}));
  let h = await centre(page.locator('.wt-col').first());
  await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x + 90, h.y, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(150);
  let after = await page.evaluate(() => ({cols: [...document.querySelectorAll('.wtable col')].map(c => parseFloat(c.style.width)), w: document.querySelector('.wtable').getBoundingClientRect().width}));
  ok(after.cols[0] > before.cols[0] + 5 && after.cols[1] < before.cols[1] - 5 && Math.abs(after.cols[2] - before.cols[2]) < 0.01 && Math.abs(after.w - before.w) < 1, `dragging a column border moves it (${before.cols.map(x => x.toFixed(1))} → ${after.cols.map(x => x.toFixed(1))}) and the table stays as wide`);
  ok(Math.abs(after.cols.reduce((a, b) => a + b) - 100) < 0.05, 'the columns still add up to 100%');
  const wcell = await page.evaluate(() => { const t = document.querySelector('.wtable'), r = t.getBoundingClientRect(), c = t.querySelector('td').getBoundingClientRect(); return [c.width / r.width * 100, parseFloat(t.querySelector('col').style.width)]; });
  ok(Math.abs(wcell[0] - wcell[1]) < 0.5, 'and the column really is that wide on screen');
  await page.mouse.move(h.x - 300, h.y - 100);
  await cell(1, 1).hover(); await page.waitForTimeout(150);
  h = await centre(page.locator('.wt-col').first()); await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x - 5000, h.y, {steps: 4}); await page.mouse.up();
  after = await page.evaluate(() => [...document.querySelectorAll('.wtable col')].map(c => parseFloat(c.style.width)));
  ok(after[0] > 2 && after[0] < 8 && after[1] > 50, `a column cannot be dragged away to nothing (${after.map(x => x.toFixed(1))})`);
  await cell(1, 1).hover(); await page.waitForTimeout(150);
  h = await centre(page.locator('.wt-col').first()); await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x + 110, h.y, {steps: 4}); await page.mouse.up();
  // right edge: the whole table
  await cell(1, 1).hover(); await page.waitForTimeout(150);
  const w0 = await page.evaluate(() => document.querySelector('.wtable').getBoundingClientRect().width);
  h = await centre(page.locator('.wt-r')); await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x - 250, h.y, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(150);
  const w1 = await page.evaluate(() => ({w: document.querySelector('.wtable').getBoundingClientRect().width, pct: document.querySelector('.wtable').style.width, cols: [...document.querySelectorAll('.wtable col')].map(c => c.style.width)}));
  ok(w1.w < w0 - 200 && /^\d+(\.\d+)?%$/.test(w1.pct) && parseFloat(w1.pct) < 80, `dragging the right edge makes the whole table narrower (${w0.toFixed(0)} → ${w1.w.toFixed(0)}px, stored as ${w1.pct})`);
  ok(await consistent() === 'ok', 'the columns keep their shares');
  // bottom-right corner: width and height
  await cell(1, 1).hover(); await page.waitForTimeout(150);
  const hb = await page.evaluate(() => document.querySelector('.wtable').getBoundingClientRect().height);
  h = await centre(page.locator('.wt-c')); await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x + 120, h.y + 90, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(150);
  const w2 = await page.evaluate(() => ({w: document.querySelector('.wtable').getBoundingClientRect().width, h: document.querySelector('.wtable').getBoundingClientRect().height, style: document.querySelector('.wtable').getAttribute('style')}));
  ok(w2.w > w1.w + 80 && w2.h > hb + 60 && /height: \d+px/.test(w2.style), `dragging the corner changes width and height (${w1.w.toFixed(0)}×${hb.toFixed(0)} → ${w2.w.toFixed(0)}×${w2.h.toFixed(0)}; ${w2.style})`);
  // the handles sit on the table's edges
  const geo = await page.evaluate(() => { const r = document.querySelector('.wtable').getBoundingClientRect(), q = e => document.querySelector(e).getBoundingClientRect(); const R = q('.wt-r'), C = q('.wt-c'), K = q('.wt-col'); return {r: r.right, R: R.left + R.width / 2, cx: C.left + C.width / 2, cy: C.top + C.height / 2, bottom: r.bottom, k: K.left + K.width / 2, kcell: document.querySelectorAll('.wtable td')[1].getBoundingClientRect().left}; });
  ok(Math.abs(geo.R - geo.r) < 2 && Math.abs(geo.cx - geo.r) < 2 && Math.abs(geo.cy - geo.bottom) < 2 && Math.abs(geo.k - geo.kcell) < 2, 'each handle sits exactly on the border it moves');
  await page.screenshot({path: path.join(OUT, 'table-sized-light.png'), clip: {x: 360, y: 150, width: 980, height: 520}});

  // ---- save, reload ----
  await settle(page);
  const saved = await page.evaluate(() => document.querySelector('.wtable').outerHTML);
  await page.reload(); await page.waitForTimeout(2000);
  const back = await page.evaluate(() => document.querySelector('.wtable')?.outerHTML);
  ok(back === saved, 'after a reload the table is exactly as it was (same widths and text)');
  await cell(0, 0).hover(); await page.waitForTimeout(200);
  const after2 = await page.evaluate(() => document.querySelector('.wtable').getBoundingClientRect().width);
  ok(Math.abs(after2 - w2.w) < 1.5, 'and just as wide on screen');

  // ---- row and column menu ----
  await page.evaluate(() => { const t = document.querySelector('.wtable'); t.style.height = ''; });
  await menu(1, 1);
  const items = await page.$$eval('.wtmenu button', b => b.map(x => [x.textContent, x.disabled]));
  ok(items.map(i => i[0]).join() === 'Insert row above,Insert row below,Insert column left,Insert column right,Delete row,Delete column,Merge cells,Split cell,Delete table', `right-click shows the menu (${items.map(i => i[0]).join(', ')})`);
  ok(items.find(i => i[0] === 'Merge cells')[1] && items.find(i => i[0] === 'Split cell')[1], 'Merge cells and Split cell are greyed out for a single, unmerged cell');
  await act('rowUp');
  let s2 = await shape(); tx = await texts();
  ok(s2[0].rows === 5 && tx[1].every(x => x === '') && tx[2][0] === '' && await consistent() === 'ok', 'Insert row above adds an empty row above the one you clicked');
  await menu(2, 1); await act('rowDown');
  s2 = await shape(); tx = await texts();
  ok(s2[0].rows === 6 && tx[3].every(x => x === '') && await consistent() === 'ok', 'Insert row below adds one under it');
  await menu(0, 1); await act('colLeft');
  s2 = await shape();
  ok(s2[0].cols === 4 && s2[0].cells.every(n => n === 4) && await consistent() === 'ok', 'Insert column left adds a column (and the widths still add up)');
  tx = await texts();
  ok(tx[0][0] === 'one' && tx[0][1] === '' && tx[0][2] === '!', 'before the clicked column, so it sits between "one" and "!"');
  await menu(0, 3); await act('colRight');
  s2 = await shape(); tx = await texts();
  ok(s2[0].cols === 5 && tx[0].join() === 'one,,!,three,' && await consistent() === 'ok', 'Insert column right adds one after it');
  await menu(1, 0); await act('delRow');
  s2 = await shape();
  ok(s2[0].rows === 5 && await consistent() === 'ok', 'Delete row removes the row');
  await menu(0, 1); await act('delCol');
  s2 = await shape(); tx = await texts();
  ok(s2[0].cols === 4 && tx[0].join() === 'one,!,three,' && await consistent() === 'ok', 'Delete column removes the column');
  // the ⋯ button
  await cell(2, 2).hover(); await page.waitForTimeout(200);
  ok(await page.isVisible('.wt-more'), 'a small ⋯ button shows at the corner of the cell you point at');
  const mb = await page.locator('.wt-more').boundingBox(), cb = await cell(2, 2).boundingBox();
  ok(mb.x + mb.width <= cb.x + cb.width + 1 && mb.x >= cb.x + cb.width - 40 && mb.y >= cb.y - 1 && mb.y <= cb.y + 12, 'at its top-right corner');
  await page.click('.wt-more'); await page.waitForSelector('.wtmenu');
  ok(await page.locator('.wtmenu button').count() === 9, 'it opens the same menu');
  await page.keyboard.press('Escape');
  ok(!(await page.isVisible('.wtmenu')) && await page.evaluate(() => ((n) => n && (n.nodeType === 1 ? n : n.parentElement).closest('td'))(getSelection().anchorNode) === document.querySelectorAll('.wtable tr')[2].cells[2] || !!getSelection().anchorNode), 'Esc closes it');
  // keyboard in the menu
  await menu(2, 2);
  ok(await page.evaluate(() => document.activeElement.textContent) === 'Insert row above', 'the first item has the focus');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  s2 = await shape();
  ok(s2[0].rows === 6 && !(await page.isVisible('.wtmenu')), 'arrow keys move through the menu and Enter picks (Insert row below)');
  // tidy to a 3 x 3 again
  await page.evaluate(() => { const t = document.querySelector('.wtable'); const m = wtModel(t); wtCut(t, m, 'r', 3, 5); const m2 = wtModel(t); wtCut(t, m2, 'c', 3, 3); const tds = t.querySelectorAll('td'); tds.forEach((td, i) => { td.innerHTML = i === 0 ? 'A' : i === 1 ? 'B' : i === 2 ? 'C' : i === 4 ? 'mid' : '<br>'; }); t.style.width = '100%'; });
  await settle(page);

  // ---- merging ----
  await cell(0, 0).hover();
  const p0 = await centre(cell(0, 0)), p1 = await centre(cell(1, 1));
  await page.mouse.move(p0.x, p0.y); await page.mouse.down(); await page.mouse.move(p1.x, p1.y, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(250);
  const sel = await page.evaluate(() => { const b = document.querySelector('.wt-selbox'); if (b.hidden) return null; const r = b.getBoundingClientRect(), tds = [...document.querySelectorAll('.wtable tr')].slice(0, 2).flatMap(tr => [...tr.cells].slice(0, 2)).map(c => c.getBoundingClientRect()); return {box: [r.left, r.top, r.right, r.bottom], want: [Math.min(...tds.map(t => t.left)), Math.min(...tds.map(t => t.top)), Math.max(...tds.map(t => t.right)), Math.max(...tds.map(t => t.bottom))], bg: getComputedStyle(b).backgroundColor, border: getComputedStyle(b).borderTopWidth, text: getSelection().toString()}; });
  ok(sel && sel.box.every((v, i) => Math.abs(v - sel.want[i]) < 4), 'dragging across cells shows the selection: a tinted, outlined block over exactly those cells');
  ok(sel.border === '2px' && /rgba?\(|color\(/.test(sel.bg) && !/rgba?\(0, 0, 0, 0\)/.test(sel.bg) && sel.text === '', `clearly outlined and tinted (${sel.bg}), with no stray text highlight`);
  await page.screenshot({path: path.join(OUT, 'table-selection-light.png'), clip: {x: 360, y: 150, width: 980, height: 400}});
  await cell(1, 1).click({button: 'right', position: await quiet(cell(1, 1))}); await page.waitForSelector('.wtmenu');
  ok(!(await page.locator('.wtmenu button[data-act="merge"]').isDisabled()), 'with several cells selected, Merge cells is available');
  await act('merge');
  const merged = await page.evaluate(() => { const t = document.querySelector('.wtable'); return {n: t.querySelectorAll('td').length, first: [t.rows[0].cells[0].colSpan, t.rows[0].cells[0].rowSpan, t.rows[0].cells[0].textContent], html: t.rows[0].cells[0].outerHTML.slice(0, 60)}; });
  ok(merged.n === 6 && merged.first[0] === 2 && merged.first[1] === 2 && merged.first[2] === 'ABmid' && await consistent() === 'ok', `Merge cells makes one cell, 2 wide and 2 tall, with their words (${merged.first.join(' / ')})`);
  ok(await page.evaluate(() => !document.querySelector('.wt-selbox') || document.querySelector('.wt-selbox').hidden), 'and the selection goes');
  await settle(page);
  const mergedHtml = await page.evaluate(() => document.querySelector('.wtable').outerHTML);
  await page.screenshot({path: path.join(OUT, 'table-merged-light.png'), clip: {x: 360, y: 150, width: 980, height: 400}});
  // save + reload with a merged cell
  await page.reload(); await page.waitForTimeout(2000);
  ok(await page.evaluate(() => document.querySelector('.wtable').outerHTML) === mergedHtml && await consistent() === 'ok', 'a merged cell is kept after a reload');
  // insert a column through the merged cell, then split
  await menu(2, 0); await act('colRight');
  ok(await consistent() === 'ok' && await page.evaluate(() => document.querySelector('.wtable').rows[0].cells[0].colSpan) === 3, 'adding a column through a merged cell widens it (and the table is still consistent)');
  await menu(0, 1); await act('rowDown');
  ok(await consistent() === 'ok' && await page.evaluate(() => document.querySelector('.wtable').rows[0].cells[0].rowSpan) === 3, 'adding a row through it makes it taller');
  await menu(0, 0);
  ok(!(await page.locator('.wtmenu button[data-act="split"]').isDisabled()), 'Split cell is available on a merged cell');
  await act('split');
  const split = await page.evaluate(() => ({n: document.querySelectorAll('.wtable td').length, spans: [...document.querySelectorAll('.wtable td')].filter(c => c.colSpan > 1 || c.rowSpan > 1).length, text: document.querySelector('.wtable td').textContent}));
  ok(split.spans === 0 && split.n === 4 * 4 && split.text === 'ABmid' && await consistent() === 'ok', `Split cell gives the cells back (${split.n} cells, words stay in the first)`);
  // Shift+click
  await cell(0, 0).click(); await cell(2, 2).click({modifiers: ['Shift']}); await page.waitForTimeout(200);
  const shiftSel = await page.evaluate(() => { const b = document.querySelector('.wt-selbox'); return !b.hidden && Math.abs(b.getBoundingClientRect().width - (document.querySelectorAll('.wtable tr')[0].cells[2].getBoundingClientRect().right - document.querySelectorAll('.wtable td')[0].getBoundingClientRect().left)) < 4; });
  ok(shiftSel, 'Shift+click selects the block from the cell the cursor was in to the one clicked');
  await page.keyboard.press('Delete'); await page.waitForTimeout(100);
  ok((await texts()).slice(0, 3).every(r => r.slice(0, 3).every(x => x === '')), 'Delete empties the selected cells');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => document.querySelector('.wt-selbox').hidden), 'Esc clears a selection');
  // delete the table
  await settle(page);
  await menu(0, 0); await act('delTable');
  ok(await page.locator('.wtable').count() === 0 && await page.locator('.notebox').count() >= 1, 'Delete table removes it (the note stays)');
  await settle(page); await page.click('#undoBtn'); await page.waitForTimeout(600);
  ok(await page.locator('.wtable').count() === 1, 'and Back brings it back');

  // ---- undo and redo ----
  await page.evaluate(() => { document.querySelectorAll('.notebox').forEach(b => b.remove()); saveSoon(); });
  await settle(page); await page.waitForTimeout(300);
  await page.mouse.click(8, 700);
  await page.click('#tab-insert'); await page.click('#tblBtn'); await page.hover('.tp-g > i >> nth=11'); await page.click('.tp-g > i >> nth=11'); await page.waitForTimeout(300);
  await settle(page);
  await page.keyboard.type('keep'); await settle(page);
  await menu(0, 0); await act('rowDown'); await settle(page);
  ok((await shape())[0].rows === 3, 'a table with 3 rows, "keep" in the first cell');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(600);
  ok((await shape())[0].rows === 2 && (await texts())[0][0] === 'keep', 'Back (Ctrl+Z) undoes the new row');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(600);
  ok((await shape())[0].rows === 2 && (await texts())[0][0] === '', 'and then the typing');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(600);
  ok(await page.locator('.wtable').count() === 0, 'and then the table itself');
  await page.click('#redoBtn'); await page.click('#redoBtn'); await page.click('#redoBtn'); await page.waitForTimeout(600);
  ok((await shape())[0].rows === 3 && (await texts())[0][0] === 'keep' && await consistent() === 'ok', 'Forward (Ctrl+Y) puts it all back');

  // ---- the colour of the borders ----
  const bc = async () => page.evaluate(() => { const td = document.querySelector('.wtable td'), c = getComputedStyle(td).borderTopColor, n = c.match(/[\d.]+/g).map(Number); return {c, td: getComputedStyle(td).color, n}; });
  let b0 = await bc();
  ok(/0\.38|\/ ?0\.38/.test(b0.c) || b0.n[3] === 0.38 || b0.n[b0.n.length - 1] === 0.38, `borders are the text colour at reduced opacity (${b0.c})`);
  await page.evaluate(() => { document.querySelector('.wtable').closest('.mine').style.color = '#c62828'; });
  b0 = await bc();
  const red = b0.n.slice(0, 3); const scale = red.every(v => v <= 1) ? 255 : 1;
  ok(red[0] * scale > 150 && red[1] * scale < 80 && red[2] * scale < 80, `and follow the note's colour (red note: ${b0.c})`);
  await page.evaluate(() => { document.querySelector('.wtable').closest('.mine').style.color = '#1f4fd1'; });

  // ---- downloads ----
  await page.click('#tab-insert');
  await cell(0, 1).click(); await page.keyboard.type('Cost'); await page.keyboard.press('Tab'); await page.keyboard.type('£12'); await settle(page);
  const nb = await notebookDoc(page);
  ok(/<table class="wtable"/.test(nb.data.doc) && /<colgroup>(<col style="width: [\d.]+%;">)+<\/colgroup>/.test(nb.data.doc) && nb.data.doc.includes('keep') && nb.data.doc.includes('£12'), 'the notebook file holds the table: <table class="wtable">, its <colgroup> and the words');
  ok(!/wtui|wt-selbox|wt-col|wt-more/.test(nb.data.doc), 'and none of the handles');
  const pdf = await pdfPages(page);
  ok(pdf.jpegs.length === 6, 'the PDF has its six pages');
  require('fs').writeFileSync(path.join(OUT, 'table-pdf-light.jpg'), pdf.jpegs[2]);
  const lines = await page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), bmp = await createImageBitmap(new Blob([bytes], {type: 'image/jpeg'}));
    const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(bmp, 0, 0);
    const card = document.querySelectorAll('.pagecard')[2].getBoundingClientRect(), k = bmp.width / card.width;
    const out = {tops: 0, lefts: 0, n: 0};
    for (const td of document.querySelectorAll('.wtable td')) {
      const r = td.getBoundingClientRect(); out.n++;
      const px = (X, Y) => { const d = x.getImageData(Math.round(X), Math.round(Y), 1, 1).data; return Math.min(d[0], d[1], d[2]) < 235; };
      const ys = (r.top - card.top) * k, xs = (r.left - card.left) * k, mid = (r.left - card.left + r.width / 2) * k, midy = (r.top - card.top + r.height / 2) * k;
      if ([-1, 0, 1].some(o => px(mid, ys + o))) out.tops++;
      if ([-1, 0, 1].some(o => px(xs + o, midy))) out.lefts++;
    }
    return out;
  }, pdf.jpegs[2].toString('base64'));
  ok(lines.n === 6 && lines.tops === 6 && lines.lefts === 6, `the PDF draws every cell border (${lines.tops}/${lines.n} tops, ${lines.lefts}/${lines.n} sides)`);

  // ---- Study mode ----
  await page.click('#readBtn'); await page.waitForTimeout(300);
  await cell(1, 1).hover(); await page.waitForTimeout(250);
  ok(await page.evaluate(() => !document.querySelector('#wtui') || document.querySelector('#wtui').hidden), 'Study mode: no handles');
  await cell(1, 1).click({button: 'right'}); await page.waitForTimeout(200);
  ok(!(await page.isVisible('.wtmenu')) && !(await page.evaluate(() => document.querySelector('.wtable td').isContentEditable)), 'no menu, and the cells cannot be edited');
  await page.click('#readBtn'); await page.waitForTimeout(300);

  // ---- notes list, search and Markdown read it as words ----
  const md = await page.evaluate(() => noteMarkdown(document.querySelector('.wtable').closest('.mine')));
  ok(/\| keep \| Cost \|/.test(md) && /\| --- \| --- \|/.test(md) && /\| £12 \|/.test(md), `Markdown makes it a table (${md.split('\n')[0]})`);
  ok(/keep Cost £12/.test(await page.evaluate(() => noteSummary(document.querySelector('.wtable').closest('.mine')))), 'the notes list reads its words');

  ok(errors.length === 0, errors.length ? 'page errors: ' + errors.join('\n') : 'no page errors');
  await browser.close();

  // ---- touch: press and hold opens the menu; the handles are easy to grab ----
  const t = await start({contextOptions: {hasTouch: true, isMobile: false}});
  const {page: tp} = t;
  ok(await tp.evaluate(() => matchMedia('(pointer: coarse)').matches), '(a touch screen)');
  await tp.click('#tab-insert'); await tp.click('#tblBtn'); await tp.waitForSelector('.tblpick');
  const gb = await tp.locator('.tp-g > i').first().boundingBox();
  ok(gb.width >= 30 && gb.height >= 30, `on a touch screen the squares in the picker are big (${gb.width}px)`);
  const c23 = await tp.locator('.tp-g > i').nth(22).boundingBox();
  await tp.touchscreen.tap(c23.x + c23.width / 2, c23.y + c23.height / 2); await tp.waitForTimeout(500);
  ok((await tp.evaluate(() => [document.querySelectorAll('.wtable tr').length, document.querySelectorAll('.wtable tr')[0].cells.length])).join() === '3,3', 'a tap inserts the table');
  const cdp = await t.context.newCDPSession(tp);
  const td = await tp.locator('.wtable td').nth(4).boundingBox();
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: td.x + 20, y: td.y + td.height / 2}]});
  await tp.waitForTimeout(800);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await tp.waitForTimeout(200);
  ok(await tp.isVisible('.wtmenu') && await tp.locator('.wtmenu button').count() === 9, 'press and hold on a cell opens the row and column menu');
  await tp.waitForTimeout(300);
  const hs = await tp.evaluate(() => ({col: document.querySelector('.wt-col').getBoundingClientRect().width, c: document.querySelector('.wt-c').getBoundingClientRect().width, more: document.querySelector('.wt-more').getBoundingClientRect().width}));
  ok(hs.col >= 24 && hs.c >= 24 && hs.more >= 30, `and the handles are bigger for a finger (${hs.col}, ${hs.c}, ${hs.more}px)`);
  ok(t.errors.length === 0, t.errors.length ? 'page errors: ' + t.errors.join('\n') : 'no page errors');
  await t.browser.close();

  // ---- dark theme ----
  const d = await start({scheme: 'dark'});
  await d.page.click('#tab-insert'); await d.page.click('#tblBtn'); await d.page.waitForSelector('.tblpick'); await d.page.hover('.tp-g > i >> nth=34');
  await d.page.screenshot({path: path.join(OUT, 'table-picker-dark.png'), clip: {x: 380, y: 60, width: 420, height: 400}});
  await d.page.click('.tp-g > i >> nth=34'); await d.page.waitForTimeout(400);
  for (const w of ['Item', 'Qty', 'Cost', 'Hat', '2', '£8', 'Scarf', '1', '£14']) { await d.page.keyboard.type(w); await d.page.keyboard.press('Tab'); }
  await d.page.keyboard.press('Shift+Tab');
  const dc = d.page.locator('.wtable').first().locator('tr');
  const q0 = await dc.nth(0).locator('td').nth(0).boundingBox(), q1 = await dc.nth(1).locator('td').nth(1).boundingBox();
  await d.page.mouse.move(q0.x + 10, q0.y + 10); await d.page.mouse.down(); await d.page.mouse.move(q1.x + 20, q1.y + 12, {steps: 6}); await d.page.mouse.up(); await d.page.waitForTimeout(250);
  await d.page.screenshot({path: path.join(OUT, 'table-selection-dark.png')});
  await d.page.mouse.click(q1.x + 10, q1.y + 10);
  await d.page.waitForTimeout(200);
  await d.page.screenshot({path: path.join(OUT, 'table-dark.png')});
  const dcol = await d.page.evaluate(() => getComputedStyle(document.querySelector('.wtable td')).borderTopColor);
  ok(/0\.38/.test(dcol) || dcol.endsWith('0.38)'), `dark theme: the borders are the note's colour, faded (${dcol})`);
  ok(d.errors.length === 0, d.errors.length ? 'page errors: ' + d.errors.join('\n') : 'no page errors');
  await d.browser.close();
  console.log(`${results.ok} checks passed; no page errors`);
})().catch(e => { console.error(e); process.exit(1); });

// The add menu (Note / Sticky note / Equation), sticky notes and their drag and drop, and adding notes from the Notes panel
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

  const pointAt = async (pi, frac, x = 260) => {
    const strip = page.locator('.pagecard').nth(pi).locator('.strip').first();
    await strip.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 120)); await page.waitForTimeout(300);
    const b = await strip.boundingBox();
    await page.mouse.move(b.x + x, b.y + b.height * frac, {steps: 4}); await page.waitForTimeout(250);
  };
  const shown = () => page.$$eval('.imenu .iitem', els => els.map(e => e.querySelector('.nm span').textContent));
  const selected = () => page.$eval('.imenu .iitem[aria-selected="true"] .nm span', e => e.textContent).catch(() => null);

  // ---- the menu between the lines ----
  await pointAt(2, 0.5);
  ok((await page.textContent('.gappill')).trim() === '+ Add here', 'the pill says + Add here');
  await page.click('.gappill', {button: 'right'}); await page.waitForTimeout(200);
  ok(await page.isVisible('.imenu') && (await shown()).join() === 'Note,Sticky note,Equation,Table,Journal entry', 'the menu lists Note, Sticky note, Equation, Table and Journal entry');
  ok(await selected() === 'Note' && await page.isVisible('.itip'), 'Note is picked first, with its tip beside it');
  ok(await page.evaluate(() => document.activeElement.matches('.imenu input')), 'the search box has the cursor');
  ok(await page.isVisible('.gappill') && await page.isVisible('.gapline'), 'the gap stays marked while the menu is open');
  await page.screenshot({path: path.join(OUT, 'menu-1-open.png')});
  await page.hover('.imenu .iitem >> nth=1'); await page.waitForTimeout(100);
  ok(await selected() === 'Sticky note' && (await page.textContent('.itip')).includes('tape'), 'pointing at an option picks it and its tip follows');
  await page.keyboard.press('ArrowDown'); ok(await selected() === 'Equation', 'arrow down');
  await page.keyboard.press('ArrowDown'); ok(await selected() === 'Table', 'arrow down');
  await page.keyboard.press('ArrowDown'); ok(await selected() === 'Journal entry', 'arrow down');
  await page.keyboard.press('ArrowDown'); ok(await selected() === 'Note', 'arrows wrap around');
  await page.keyboard.type('xyz'); await page.waitForTimeout(100);
  ok(await page.isVisible('.imenu .iempty'), 'no match says No results');
  await page.fill('.imenu input', 'form'); await page.waitForTimeout(100);
  ok((await shown()).join() === 'Equation', 'typing filters (formula finds Equation)');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(!(await page.isVisible('.imenu')), 'Esc closes the menu');
  ok(await page.locator('.notebox').count() === 0, 'and nothing was added');

  // Equation from the menu: a note in the gap with the formula in it
  await pointAt(2, 0.5);
  await page.click('.gappill', {button: 'right'}); await page.keyboard.type('eq'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ok(await page.isVisible('#formulaPanel'), 'Equation opens the formula box');
  await page.keyboard.type('MR = (dTR)/(dQ)'); await page.waitForTimeout(300); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(await page.locator('.notebox .formula').count() === 1 && await page.locator('.pagecard').nth(2).locator('.notebox').count() === 1, 'the formula lands in a new note between the lines');
  await page.mouse.click(5, 700); await page.waitForTimeout(300);
  // cancelling an equation leaves no empty note behind
  await pointAt(3, 0.4);
  await page.click('.gappill', {button: 'right'}); await page.keyboard.type('eq'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(await page.locator('.pagecard').nth(3).locator('.notebox').count() === 0, 'closing the formula box removes the empty note');

  // Sticky note from the menu, where you pointed
  await pointAt(3, 0.45, 420);
  const gapY = (await page.locator('.gapline').boundingBox()).y;
  await page.click('.gappill', {button: 'right'}); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  const st = page.locator('.notebox.sticky').first();
  ok(await st.count() === 1 && await st.evaluate(b => b.classList.contains('floating') && b.contains(document.activeElement)), 'Sticky note puts a sticky note on the page, ready to type');
  await page.keyboard.type('Ask about this in the tutorial'); await page.waitForTimeout(200);
  const sb = await st.boundingBox();
  ok(Math.abs(sb.y - (gapY - 12)) < 6 && Math.abs(sb.x + sb.width / 2 - (await page.locator('.pagecard').nth(3).boundingBox()).x - 420) < 6, 'it sits where you pointed');
  ok(await st.locator('.mine').evaluate(m => getComputedStyle(m).backgroundColor) === 'rgb(255, 245, 157)', 'sticky notes are yellow');
  ok(await st.locator('.g-move').evaluate(g => getComputedStyle(g).opacity === '1' && g.offsetWidth > 60), 'its tape always shows');
  await page.mouse.click(5, 700); await page.waitForTimeout(600);
  await page.screenshot({path: path.join(OUT, 'menu-2-sticky.png')});

  // drag it by its tape onto the next page
  const tape = await st.locator('.g-move').boundingBox();
  const p4 = page.locator('.pagecard').nth(4);
  await page.mouse.move(tape.x + tape.width / 2, tape.y + tape.height / 2);
  await page.mouse.down();
  const p4b0 = await p4.boundingBox();
  await page.mouse.move(tape.x + tape.width / 2 - 100, p4b0.y + 80, {steps: 12}); await page.waitForTimeout(150);
  ok(await p4.evaluate(c => c.classList.contains('drop-target')), 'the page under it is marked while dragging');
  ok(await p4.evaluate(c => !!c.querySelector('.notebox.sticky.moving')), 'it moves onto that page as you drag (so it stays visible)');
  await page.mouse.up(); await page.waitForTimeout(400);
  const p4b = await p4.boundingBox(), sb2 = await page.locator('.notebox.sticky').first().boundingBox();
  ok(await p4.locator('.notebox.sticky').count() === 1 && await page.locator('.pagecard').nth(3).locator('.notebox.sticky').count() === 0, 'drag and drop moves a sticky note to another page');
  ok(sb2.y > p4b.y && sb2.y < p4b.y + 120 && !(await p4.evaluate(c => c.classList.contains('drop-target'))), 'it lands where it was dropped');

  // ---- / in a note ----
  await pointAt(1, 0.5);
  await page.click('.gappill'); await page.waitForTimeout(200);
  await page.keyboard.type('Supply and demand a/b '); await page.waitForTimeout(150);
  ok(!(await page.isVisible('.imenu')), 'a slash inside a word does not open the menu');
  await page.keyboard.type('/'); await page.waitForTimeout(200);
  ok(await page.isVisible('.imenu') && !(await page.isVisible('.imenu .isearch')), 'a slash after a space opens the menu at the cursor');
  ok((await shown()).join() === 'Equation,Table,Journal entry,Sticky note' && (await page.textContent('.imenu')).includes('Turn into'), 'in a note it offers Equation, Table, Journal entry, Template… and Turn into Sticky note');
  await page.screenshot({path: path.join(OUT, 'menu-3-slash.png')});
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok(!(await page.isVisible('.imenu')) && (await page.locator('.pagecard').nth(1).locator('.mine').textContent()).endsWith('/'), 'Esc closes it and leaves the slash');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(' /stic'); await page.waitForTimeout(150);
  ok((await shown()).join() === 'Sticky note', 'what you type after the slash searches');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  const turned = page.locator('.pagecard').nth(1).locator('.notebox');
  ok(await turned.evaluate(b => b.classList.contains('sticky') && b.classList.contains('floating')), 'Turn into Sticky note lifts the note onto the page');
  ok(!(await turned.locator('.mine').textContent()).includes('/stic'), 'and the /stic you typed is taken out');
  await page.keyboard.type('/'); await page.waitForTimeout(150);
  ok((await shown()).join() === 'Equation,Table,Journal entry,Note', 'a sticky note can turn back into a note');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(await turned.evaluate(b => !b.classList.contains('sticky') && !b.classList.contains('floating')), 'and goes back between the lines');
  await page.keyboard.type('/x'); await page.waitForTimeout(100); await page.keyboard.type('yz '); await page.waitForTimeout(150);
  ok(!(await page.isVisible('.imenu')), 'the menu gives up when nothing matches and you carry on typing');
  await page.mouse.click(5, 700); await page.waitForTimeout(600);

  // ---- the Notes panel: write a note, or a sticky ----
  await page.click('#notesBtn'); await page.waitForTimeout(400);
  ok(await page.isVisible('#noteCompose') && /to page \d/.test(await page.textContent('#ncWhere')), 'the Notes panel has a box to write a note, and says which page it goes to');
  await page.locator('.pagecard').nth(5).scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
  const where = await page.textContent('#ncWhere');
  await page.click('#newNote'); await page.keyboard.type('Revise elasticity for the quiz'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  const pg = +where.match(/\d+/)[0] - 1;
  ok((await page.locator('.slide').nth(pg).locator('.notebox').last().textContent()).includes('Revise elasticity'), `Enter adds the note to that page (${where})`);
  ok(await page.inputValue('#newNote') === '' && await page.evaluate(() => document.activeElement.id === 'newNote'), 'the box empties and keeps the cursor for the next note');
  await page.waitForTimeout(500);
  ok((await page.textContent('#noteList')).includes('Revise elasticity'), 'the new note shows in the list');
  await page.keyboard.type('Graph on slide 6'); await page.click('#stickyPad'); await page.waitForTimeout(500);
  ok((await page.locator('.notebox.sticky').allTextContents()).some(t => t.includes('Graph on slide 6')), 'Sticky makes a sticky note with what you wrote');
  ok((await page.textContent('#noteList')).includes('Sticky note'), 'the list says it is a sticky note');
  // drag the sticky from the panel onto a page
  await page.keyboard.type('Dropped here');
  const target = page.locator('.pagecard').nth(5); await target.scrollIntoViewIfNeeded();
  const tb = await target.boundingBox(), pad = await page.locator('#stickyPad').boundingBox();
  await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height / 2); await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, {steps: 14}); await page.waitForTimeout(150);
  ok(await page.isVisible('.stickyghost') && await target.evaluate(c => c.classList.contains('drop-target')), 'dragging Sticky shows a sticky note under the pointer and marks the page');
  await page.screenshot({path: path.join(OUT, 'menu-4-drag.png')});
  await page.mouse.up(); await page.waitForTimeout(500);
  const dropped = target.locator('.notebox.sticky', {hasText: 'Dropped here'});
  ok(await dropped.count() === 1 && !(await page.isVisible('.stickyghost')), 'dropping it sticks it on that page');
  const db = await dropped.boundingBox();
  ok(Math.abs(db.x + db.width / 2 - (tb.x + tb.width / 2)) < 6 && Math.abs(db.y - (tb.y + tb.height / 2 - 10)) < 8, 'right where it was dropped');
  await page.screenshot({path: path.join(OUT, 'menu-5-panel.png')});
  // an empty sticky dragged out is ready to type in
  await page.click('#newNote');
  const onTarget = await target.locator('.notebox.sticky').count();
  const pad2 = await page.locator('#stickyPad').boundingBox();
  await page.mouse.move(pad2.x + 10, pad2.y + 10); await page.mouse.down();
  await page.mouse.move(tb.x + 120, tb.y + 60, {steps: 10}); await page.mouse.up(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !!document.activeElement.closest('.notebox.sticky')), 'an empty sticky dropped on a page has the cursor');
  await page.keyboard.press('Escape'); await page.mouse.click(5, 700); await page.waitForTimeout(400);
  ok(await target.locator('.notebox.sticky').count() === onTarget, 'left empty, it goes away again');
  // Esc while dragging cancels
  const pad3 = await page.locator('#stickyPad').boundingBox();
  await page.mouse.move(pad3.x + 10, pad3.y + 10); await page.mouse.down();
  await page.mouse.move(tb.x + 120, tb.y + 60, {steps: 10}); await page.keyboard.press('Escape'); await page.mouse.up(); await page.waitForTimeout(300);
  ok(!(await page.isVisible('.stickyghost')) && await target.locator('.notebox.sticky').count() === onTarget, 'Esc cancels a drag');

  // the sidebar's Add a note, and the Insert tab's Sticky note
  await page.click('#notesBtn'); await page.waitForTimeout(200);
  await page.click('#sideAdd'); await page.waitForTimeout(300);
  ok(await page.isVisible('#notesPanel') && await page.evaluate(() => document.activeElement.id === 'newNote'), 'Add a note in the sidebar opens the Notes panel ready to write');
  const before = await page.locator('.notebox.sticky').count();
  await page.click('#tab-insert'); await page.click('#stickyBtn'); await page.waitForTimeout(300);
  ok(await page.locator('.notebox.sticky').count() === before + 1 && await page.evaluate(() => !!document.activeElement.closest('.notebox.sticky')), 'Insert › Sticky note adds one to the page you are on');
  await page.keyboard.type('From the Insert tab'); await page.mouse.click(5, 700); await page.waitForTimeout(900);

  // Back undoes a sticky, and stickies are kept after reload
  const n0 = await page.locator('.notebox.sticky').count();
  await page.click('#undoBtn'); await page.waitForTimeout(400);
  ok(await page.locator('.notebox.sticky').count() === n0 - 1, 'Back takes a sticky note away');
  await page.click('#redoBtn'); await page.waitForTimeout(900);
  await page.reload(); await page.waitForTimeout(2000);
  ok(await page.locator('.notebox.sticky').count() === n0 && (await page.textContent('main')).includes('Dropped here'), 'sticky notes are kept after reload');
  ok(await page.locator('.notebox.sticky .mine').first().evaluate(m => getComputedStyle(m).backgroundColor) === 'rgb(255, 245, 157)', 'and still look like sticky notes');

  // study mode: no menu, no composer
  await page.click('#readBtn'); await page.waitForTimeout(300);
  await page.click('#notesBtn').catch(() => {}); await page.waitForTimeout(300);
  ok(!(await page.isVisible('#noteCompose')), 'study mode hides the note box');
  await page.click('#readBtn'); await page.waitForTimeout(300);

  // dark mode, and a phone
  await pointAt(1, 0.3); await page.click('.gappill', {button: 'right'}); await page.emulateMedia({colorScheme: 'dark'}); await page.waitForTimeout(250);
  await page.screenshot({path: path.join(OUT, 'menu-6-dark.png')});
  await page.keyboard.press('Escape'); await page.emulateMedia({colorScheme: 'light'});
  await page.setViewportSize({width: 390, height: 800}); await page.waitForTimeout(500);
  const s2 = page.locator('.pagecard').nth(2).locator('.strip').first(); await s2.scrollIntoViewIfNeeded();
  const sb3 = await s2.boundingBox(); await page.mouse.click(sb3.x + 120, sb3.y + sb3.height * 0.3); await page.waitForTimeout(200);
  await page.click('.gappill', {button: 'right'}); await page.waitForTimeout(250);
  const mb = await page.locator('.imenu').boundingBox();
  ok(mb.x >= 8 && mb.x + mb.width <= 382 && !(await page.isVisible('.itip')), 'on a phone the menu fits the screen (no tip)');
  await page.screenshot({path: path.join(OUT, 'menu-7-phone.png')});
  await page.keyboard.press('Escape');

  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

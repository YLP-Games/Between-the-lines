// Copy notes into another notebook: Ctrl+A twice or Box tab › Whole notebook selects every note in the notebook, Copy (or Ctrl+C) copies them,
// and Paste notes (or Ctrl+V on the page) in another notebook puts each on the page with the same number, in the same kind of place (between
// the lines, floating, a side note); notes from pages it hasn't go on its last page. One Back takes the paste out. A notebook's ⋯ menu copies
// all its notes without opening it, and pastes them into it
const {open} = require('./harness');
const path = require('path');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, page, errors} = await open(APP, {contextOptions: {permissions: ['clipboard-read', 'clipboard-write']}});
  await page.waitForTimeout(500);
  const away = async () => { await page.mouse.click(5, 700); await page.waitForTimeout(500); };
  const curName = () => page.$eval('.nb[aria-current] .docbtn .nm', e => e.textContent);
  // every note in the open notebook: its words, its page (from 1), and where it is
  const notes = () => page.evaluate(() => docBoxes().map(b => {
    const sp = b.closest('.sidepage'), slide = sp ? sideSlide(sp) : b.closest('.slide');
    return {t: b.querySelector('.mine').textContent.trim(), page: [...document.querySelectorAll('#main .slide')].indexOf(slide) + 1, kind: sp ? 'side' : b.classList.contains('floating') ? 'float' : 'line', grips: b.querySelectorAll(':scope > .grip').length};
  }));

  // ---- a notebook with three notes: between the lines on page 2, floating on page 4, and a side note on page 3 ----
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(900);
  for (const [i, words] of [[1, 'Note on page two'], [3, 'Floating on page four']]) {
    const strip = page.locator('.pagecard').nth(i).locator('.strip').first();
    await strip.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    const b = await strip.boundingBox();
    await page.mouse.move(b.x + 200, b.y + b.height * .5, {steps: 3}); await page.waitForTimeout(200);
    await page.click('.gappill'); await page.keyboard.type(words); await away();
  }
  await page.evaluate(() => toggleFloat([...document.querySelectorAll('.pagecard')[3].querySelectorAll('.notebox')][0]));
  await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(800);
  await page.evaluate(() => sideAddBox(sideOf(document.querySelectorAll('.pagecard')[2]), 40, 60, 200));
  await page.keyboard.type('Side note on page three'); await away();
  let n = await notes();
  ok(n.length === 3 && n.some(x => x.kind === 'float' && x.page === 4) && n.some(x => x.kind === 'side' && x.page === 3) && n.some(x => x.kind === 'line' && x.page === 2), 'notebook “lecture” has a note between the lines, a floating one and a side note: ' + JSON.stringify(n.map(x => x.page + x.kind)));

  // ---- Ctrl+A selects the page's notes, and again every note in the notebook ----
  await page.locator('.pagecard').nth(1).scrollIntoViewIfNeeded(); await page.locator('.pagecard').nth(1).click({position: {x: 20, y: 20}}); await page.waitForTimeout(200); await away();
  await page.locator('.pagecard').nth(1).click({position: {x: 20, y: 20}}); await page.waitForTimeout(300);
  await page.keyboard.press('Escape'); await page.keyboard.press('ControlOrMeta+a'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => multi.size) === 1, 'Ctrl+A: the one note on this page');
  await page.keyboard.press('ControlOrMeta+a'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => multi.size) === 3 && /3 notes selected in this notebook/.test(await page.textContent('#multiCount')), 'Ctrl+A again: all 3 notes in the notebook (' + await page.textContent('#multiCount') + ')');
  await page.keyboard.press('Escape');
  await page.click('#tab-box'); await page.click('#selBookBtn'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => multi.size) === 3, 'Box tab › Whole notebook selects them too');
  ok(await page.isDisabled('#pasteNotesBtn'), 'Paste notes waits until something is copied');
  await page.click('#multibar [data-act=copy]'); await page.waitForTimeout(300);
  ok(/Copied 3 notes/.test(await page.textContent('#toast')) && !(await page.isDisabled('#pasteNotesBtn')), 'Copy on the bar copies the 3 notes, and Paste notes is ready');
  const mark = await page.evaluate(() => navigator.clipboard.readText());
  ok(mark === '3 notes from “lecture” (Between the Lines)', 'the clipboard says what was copied: ' + mark);
  await page.keyboard.press('Escape');

  // ---- paste into another notebook with fewer pages (a blank one: one page) with Ctrl+V ----
  await page.click('#newDocBtn'); await page.waitForTimeout(900); await away();
  ok((await notes()).length === 0, 'a new, blank notebook with no notes');
  await page.locator('#main .slide').first().click({position: {x: 30, y: 30}}); await page.waitForTimeout(200); await away();
  await page.keyboard.press('ControlOrMeta+v'); await page.waitForTimeout(800);
  n = await notes();
  ok(n.length === 3 && n.every(x => x.page === 1) && n.every(x => x.grips > 4), `Ctrl+V pastes all 3, on its only page, with their handles (${JSON.stringify(n.map(x => x.page + x.kind))})`);
  ok(/Pasted 3 notes from “lecture”/.test(await page.textContent('#toast')) && /last page/.test(await page.textContent('#toast')), 'and says the ones from later pages went on its last page');
  ok(n.map(x => x.t).sort().join('|') === 'Floating on page four|Note on page two|Side note on page three', 'with their words');
  await page.keyboard.press('ControlOrMeta+z'); await page.waitForTimeout(900);
  ok((await notes()).length === 0, 'one Back takes the whole paste out');

  // ---- paste into a notebook with the same pages: same pages, same places ----
  await page.setInputFiles('#file', path.join(__dirname, 'long.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('#docList .nb').length === 3 && document.querySelectorAll('.pagecard').length >= 4, null, {timeout: 60000}); await page.waitForTimeout(900);
  await page.click('#tab-box'); await page.click('#pasteNotesBtn'); await page.waitForTimeout(900);
  n = await notes();
  const at = t => n.find(x => x.t === t);
  ok(at('Note on page two')?.page === 2 && at('Note on page two').kind === 'line', 'Paste notes: the note between the lines is on page 2, between the lines');
  ok(at('Side note on page three')?.page === 3 && at('Side note on page three').kind === 'side', 'the side note is on page 3’s side page');
  ok(at('Floating on page four')?.page === 4 && at('Floating on page four').kind === 'float', 'the floating note floats on page 4');
  ok(await page.evaluate(() => { const b = [...document.querySelectorAll('.pagecard')[1].children].find(c => c.classList.contains('notebox')); return b && b.previousElementSibling?.classList.contains('strip') && b.nextElementSibling?.classList.contains('strip'); }), 'between two pieces of page 2');

  // ---- the ⋯ menu: copy all of a notebook's notes without opening it, and paste into one ----
  const long = await curName();
  await page.evaluate(() => { noteClip = null; });
  const row = page.locator('#docList .nb').filter({has: page.locator('.docbtn .nm', {hasText: /^lecture$/})});
  await row.hover(); await row.locator('.more').click(); await page.waitForTimeout(150);
  ok(await page.isVisible('.docmenu [data-act=copynotes]') && !(await page.isVisible('.docmenu [data-act=pastenotes]')), '⋯ menu: Copy all notes (and no Paste notes here until something is copied)');
  await page.click('.docmenu [data-act=copynotes]'); await page.waitForTimeout(500);
  ok(await curName() === long && /Copied 3 notes/.test(await page.textContent('#toast')), '“lecture”’s 3 notes are copied while “' + long + '” stays open');
  ok(await page.evaluate(() => noteClip.notes.map(x => x.page + 1 + x.kind).sort().join()) === '2line,3side,4float', 'with their pages and places');
  const blank = page.locator('#docList .nb').filter({has: page.locator('.docbtn .nm', {hasText: /^My notes$/})});
  await blank.hover(); await blank.locator('.more').click(); await page.waitForTimeout(150);
  await page.click('.docmenu [data-act=pastenotes]'); await page.waitForTimeout(1200);
  ok(await curName() === 'My notes' && (await notes()).length === 3, 'Paste notes here opens the blank notebook (“My notes”) and pastes them into it');

  // ---- they are kept ----
  await away(); await page.waitForTimeout(1500);
  await page.reload(); await page.waitForTimeout(3000);
  ok(await curName() === 'My notes' && (await notes()).length === 3, 'after a reload the pasted notes are still there');
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });

// End-to-end check of the redesigned app
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, context, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.screenshot({path: path.join(OUT, '1-start.png')});
  ok(await page.isVisible('.welcome [data-open]'), 'start screen with drop zone');

  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);
  ok((await page.textContent('#docTitle')).trim() === 'lecture', 'title bar shows the file name');
  ok(await page.isVisible('#pagesPanel'), 'pages panel open on a wide screen');
  ok(await page.locator('#pageList .pg').count() === 6, 'six page thumbnails');
  ok((await page.locator('#pageList .pg').nth(2).textContent()).includes('Perfect competition'), 'page titles read from the PDF');

  // add two notes between the lines
  const addNote = async (pi, frac, text) => {
    const strip = page.locator('.pagecard').nth(pi).locator('.strip').first();
    await strip.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 120)); await page.waitForTimeout(300);
    const b = await strip.boundingBox();
    await page.mouse.move(b.x + 200, b.y + b.height * frac, {steps: 4}); await page.waitForTimeout(250);
    await page.click('.gappill'); await page.keyboard.type(text); await page.waitForTimeout(300);
  };
  await addNote(2, 0.52, 'Price taker means a flat demand curve, so MR = P!');
  await addNote(4, 0.6, 'Shutdown point is the minimum of AVC');
  await page.mouse.click(5, 600); await page.waitForTimeout(900);
  ok(await page.locator('.notebox').count() === 2, 'two notes added');
  ok((await page.textContent('#noteInfo')).includes('2 notes'), 'status bar counts notes');
  ok((await page.getAttribute('#saveState', 'data-s')) === 'saved', 'saved in this browser');

  // notes panel: list, search, jump
  await page.click('#notesBtn'); await page.waitForTimeout(400);
  ok(await page.locator('#noteList .ncard').count() === 2, 'notes list shows both notes');
  await page.fill('#noteSearch', 'avc'); await page.waitForTimeout(200);
  ok(await page.locator('#noteList .ncard').count() === 1 && await page.locator('#noteList mark').count() === 1, 'search filters and highlights');
  await page.fill('#noteSearch', '');
  // minimise the first note, then jump to it from the list
  await page.evaluate(() => { const b = document.querySelector('.notebox'); setCollapsed(b, true); afterNotesToggle(); });
  await page.waitForTimeout(500);
  await page.locator('#noteList .ncard').first().click(); await page.waitForTimeout(900);
  ok(!(await page.evaluate(() => document.querySelector('.notebox').classList.contains('collapsed'))), 'jumping to a minimised note opens it');
  await page.mouse.click(5, 600);
  await page.locator('.pagecard').nth(2).scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({path: path.join(OUT, '2-editing.png')});

  // ribbon tabs
  await page.click('#tab-insert'); ok(await page.isVisible('#fBtn') && !(await page.isVisible('#font')), 'Insert tab');
  await page.click('#tab-box'); ok(await page.isVisible('#bOutline'), 'Box tab');
  await page.click('#tab-view'); ok(await page.isVisible('#layout'), 'View tab');
  await page.screenshot({path: path.join(OUT, '3-view-tab.png'), clip: {x: 0, y: 0, width: 1440, height: 140}});
  await page.click('#tab-home');
  await page.click('#ribbonFold'); await page.waitForTimeout(200);
  ok(!(await page.isVisible('#panel-home')), 'tabs only hides the tools');
  await page.click('#tab-box'); ok(await page.isVisible('#bOutline'), 'a tab opens its tools over the page');
  await page.mouse.click(700, 600); await page.waitForTimeout(200);
  ok(!(await page.isVisible('#bOutline')), 'and they fold away again');
  await page.click('#ribbonFold'); await page.click('#tab-home');

  // focus mode
  await page.click('#focusBtn'); await page.waitForTimeout(500);
  ok(!(await page.isVisible('#appbar')) && !(await page.isVisible('#pagesPanel')) && !(await page.isVisible('#notesPanel')) && !(await page.isVisible('#statusbar')), 'focus mode hides toolbar, panels and status bar');
  ok(await page.isVisible('#focusExit'), 'exit focus button shows');
  await page.screenshot({path: path.join(OUT, '4-focus.png')});
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  ok(await page.isVisible('#appbar') && await page.isVisible('#pagesPanel') && await page.isVisible('#notesPanel'), 'Esc brings everything back');
  // panels close with their x
  await page.click('#pagesPanel [data-close]'); await page.click('#notesPanel [data-close]'); await page.waitForTimeout(300);
  ok(!(await page.isVisible('#pagesPanel')) && !(await page.isVisible('#notesPanel')), 'side panels close');

  // study mode puts editing tabs away
  await page.click('#readBtn'); await page.waitForTimeout(200);
  ok(!(await page.isVisible('#tab-home')) && await page.isVisible('#panel-view'), 'study mode shows only View');
  await page.click('#readBtn'); await page.waitForTimeout(200);
  ok(await page.isVisible('#panel-home'), 'back to editing restores Home');

  // undo
  const before = await page.locator('.notebox').count();
  await page.evaluate(() => { document.querySelectorAll('.notebox')[1].remove(); saveSoon(); }); await page.waitForTimeout(800);
  await page.click('#undoBtn'); await page.waitForTimeout(600);
  ok(await page.locator('.notebox').count() === before, 'Back undoes a change');

  // downloads
  await page.click('#save');
  let [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-kind=notebook]')]);
  const nb = path.join(OUT, 'notebook.html'); await dl.saveAs(nb);
  const html = fs.readFileSync(nb, 'utf8');
  ok(html.startsWith('<!doctype html>') && html.includes('id="notebook-data"') && html.includes('<title>'), 'notebook file is a whole page with the notes');
  await page.click('#save');
  [dl] = await Promise.all([page.waitForEvent('download', {timeout: 120000}), page.click('[data-kind=pdf]')]);
  const pdfp = path.join(OUT, 'notes.pdf'); await dl.saveAs(pdfp);
  ok(fs.readFileSync(pdfp).slice(0, 5).toString() === '%PDF-', 'PDF download');

  // reload: notes come back from the browser store
  await page.reload(); await page.waitForTimeout(1500);
  ok(await page.locator('.notebox').count() === 2 && await page.locator('.pagecard').count() === 6, 'notes are restored after reload');
  ok(await page.locator('.notebox .g-pin svg').count() === 2, 'handles use the new icons');
  await browser.close();

  // the notebook file opens on its own
  const nbRun = await open(nb); await nbRun.page.waitForTimeout(1500);
  ok(await nbRun.page.locator('.notebox').count() === 2, 'notebook file opens with its notes');
  await nbRun.browser.close();

  // phone
  const ph = await open(APP, {width: 390, height: 844});
  await ph.page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await ph.page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await ph.page.waitForTimeout(600);
  ok(!(await ph.page.isVisible('#pagesPanel')), 'panels start closed on a phone');
  ok(await ph.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scrolling on a phone');
  await ph.page.screenshot({path: path.join(OUT, '5-phone.png')});
  await ph.page.click('#pagesBtn'); await ph.page.waitForTimeout(300);
  await ph.page.screenshot({path: path.join(OUT, '6-phone-pages.png')});
  await ph.page.mouse.click(380, 500); await ph.page.waitForTimeout(200); ok(!(await ph.page.isVisible('#pagesPanel')), 'tapping outside closes the drawer');
  await ph.browser.close();

  const errs = errors.concat(nbRun.errors, ph.errors).filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

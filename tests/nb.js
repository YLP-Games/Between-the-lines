// Notebooks: each file its own notebook, switching keeps notes apart, rename, delete, peek; PowerPoint and Word files
const {open} = require('./harness');
const path = require('path');
const OUT = path.join(__dirname, 'shots');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const names = p => p.$$eval('#docList .docbtn .nm', els => els.map(e => e.textContent));

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(800);
  ok((await names(page)).length === 1, 'one empty notebook to start');

  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(900);
  ok((await names(page)).length === 1 && (await names(page))[0] === 'lecture', 'the first file fills the empty notebook');

  // a note in the lecture
  const strip = page.locator('.pagecard').nth(1).locator('.strip').first();
  await strip.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
  const b = await strip.boundingBox();
  await page.mouse.move(b.x + 200, b.y + b.height * 0.5, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.keyboard.type('Lecture note'); await page.mouse.click(5, 700); await page.waitForTimeout(900);

  // a PowerPoint opens as a second notebook
  await page.setInputFiles('#file', path.join(__dirname, 'week2.pptx'));
  await page.waitForFunction(() => document.querySelectorAll('#docList .nb').length === 2, null, {timeout: 30000});
  await page.waitForFunction(() => document.querySelector('#docList .docbtn .nm')?.textContent === 'week2', null, {timeout: 15000}).catch(() => {});      // named once it has been read
  await page.waitForTimeout(800);
  ok((await names(page))[0] === 'week2', 'a second file becomes its own notebook');
  ok(await page.locator('.slide').count() === 2 && (await page.textContent('main')).includes('Equilibrium'), 'PowerPoint slides read');
  ok(await page.locator('.notebox').count() === 0, 'the new notebook has none of the lecture notes');
  // add-a-file-here: a Word file into this notebook
  await page.click('#tab-insert');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addHereBtn')]);
  await chooser.setFiles(path.join(__dirname, 'reading.docx'));
  await page.waitForFunction(() => document.body.textContent.includes('elasticity'), null, {timeout: 30000});
  await page.waitForTimeout(800);
  ok((await names(page)).length === 2 && await page.locator('.file-head').count() === 2, 'Add a file here puts a Word file in the same notebook');
  await page.click('#tab-home');

  // switch back: the lecture and its note return
  await page.click('#docList .docbtn >> text=lecture'); await page.waitForTimeout(1200);
  ok(await page.locator('.pagecard').count() === 6 && (await page.textContent('.notebox .mine')).includes('Lecture note'), 'switching back brings the lecture and its note');
  ok((await page.textContent('#docTitle')).trim() === 'lecture', 'title bar follows the notebook');
  ok(await page.locator('#docList .nb[aria-current] #pageList .pg').count() === 6, 'the open notebook shows its pages in the sidebar');
  await page.click('#undoBtn'); await page.waitForTimeout(500);
  ok(await page.locator('.notebox').count() === 0, 'Back history belongs to the notebook');
  await page.click('#redoBtn'); await page.waitForTimeout(500);

  // rename
  await page.hover('#docList .nb[aria-current] .docrow');
  await page.click('#docList .nb[aria-current] .more'); await page.click('.docmenu [data-act=rename]');
  await page.keyboard.press('Control+A'); await page.keyboard.type('ECON 101 Lecture 4'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ok((await names(page)).includes('ECON 101 Lecture 4') && (await page.textContent('#docTitle')).includes('ECON 101 Lecture 4'), 'rename a notebook');
  await page.screenshot({path: path.join(OUT, 'nb-1-sidebar.png')});

  // new blank notebook
  await page.click('#newDocBtn'); await page.waitForTimeout(800);
  ok((await names(page)).length === 3 && await page.locator('.blankpage').count() === 1, 'New notebook starts with a blank page');
  await page.keyboard.type('My own revision notes'); await page.waitForTimeout(900);

  // reload: three notebooks, the open one comes back
  await page.reload(); await page.waitForTimeout(1800);
  ok((await names(page)).length === 3 && (await page.textContent('main')).includes('My own revision notes'), 'notebooks are kept after reload');

  // move week2 to the Trash (one click), then delete it for ever from there (two clicks)
  const row = page.locator('#docList .nb', {hasText: 'week2'});
  await row.hover(); await row.locator('.more').click();
  await page.click('.docmenu [data-act=trash]'); await page.waitForTimeout(600);
  ok(!(await names(page)).includes('week2') && (await names(page)).length === 2, 'move a notebook to the Trash');
  await page.click('#trashBox .trashhead'); await page.waitForTimeout(200);
  await page.click('#trashBox [data-t=purge]'); await page.click('#trashBox [data-t=purge]'); await page.waitForTimeout(600);
  ok((await page.locator('#trashBox .trashrow').count()) === 0 && (await names(page)).length === 2, 'delete a notebook for ever');

  // hide the sidebar: the left edge does nothing until Open sidebar on hover is on, then the pointer there peeks it in
  await page.click('#sideHide'); await page.waitForTimeout(300);
  await page.mouse.move(400, 400); await page.mouse.move(3, 400, {steps: 5}); await page.waitForTimeout(400);
  ok(!(await page.isVisible('#pagesPanel')), 'the hidden sidebar does not open by itself at the left edge');
  await page.mouse.move(900, 400, {steps: 5}); await page.evaluate(() => setSideHover(true)); await page.waitForTimeout(200);
  ok(!(await page.isVisible('#pagesPanel')), 'sidebar hides');
  await page.mouse.move(400, 400); await page.mouse.move(3, 400, {steps: 5}); await page.waitForTimeout(400);
  ok(await page.isVisible('#pagesPanel'), 'pointing at the left edge peeks it in');
  await page.screenshot({path: path.join(OUT, 'nb-2-peek.png')});
  await page.mouse.move(900, 400, {steps: 5}); await page.waitForTimeout(400);
  ok(!(await page.isVisible('#pagesPanel')), 'and it slides away again');
  await page.keyboard.press('Control+Backslash'); await page.waitForTimeout(300);
  ok(await page.isVisible('#pagesPanel'), 'Ctrl+\\ brings it back');

  // dark (chalkboard) look
  await page.emulateMedia({colorScheme: 'dark'}); await page.waitForTimeout(300);
  await page.screenshot({path: path.join(OUT, 'nb-3-dark.png')});
  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

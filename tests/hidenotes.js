// View › Hide notes: hide the notes on your pages only (side page notes stay open), every note, or show them all
const {open} = require('./harness'); const path = require('path');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(800);
  // two notes on the pages
  for (const i of [1, 2]) {
    await page.mouse.click(5, 700); await page.waitForTimeout(200);
    const strip = page.locator('.pagecard').nth(i).locator('.strip').last(); await strip.scrollIntoViewIfNeeded();
    const b = await strip.boundingBox(); await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2, {steps: 3}); await page.waitForTimeout(200);
    await page.click('.gappill'); await page.keyboard.type('page note ' + i);
  }
  await page.mouse.click(5, 700); await page.waitForTimeout(300);
  // and one on a side page
  await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(600);
  const sp = page.locator('.sidepage').nth(1); await sp.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const side = await sp.boundingBox();
  await page.mouse.click(side.x + 50, side.y + 140); await page.waitForTimeout(250);
  await page.keyboard.type('side note'); await page.mouse.click(5, 700); await page.waitForTimeout(400);
  const state = () => page.evaluate(() => [...document.querySelectorAll('main .notebox')].map(b => (b.closest('.sidepage') ? 'side' : 'page') + ':' + (b.classList.contains('collapsed') ? 'hidden' : 'open')).sort().join(' '));
  ok(await state() === 'page:open page:open side:open', 'two notes on the pages and one on a side page, all open');

  // ---- the button opens a menu ----
  ok(await page.isVisible('#notesMenuBtn') && (await page.textContent('#notesMenuBtn')).includes('Hide notes') && await page.getAttribute('#notesMenuBtn', 'aria-haspopup') === 'menu', 'View has a Hide notes menu button');
  await page.click('#notesMenuBtn'); await page.waitForTimeout(200);
  ok(await page.isVisible('#notesMenu') && await page.getAttribute('#notesMenuBtn', 'aria-expanded') === 'true', 'it opens a menu');
  const items = await page.$$eval('#notesMenu button', bs => bs.map(b => b.querySelector('strong').textContent + (b.disabled ? ' (off)' : '')));
  ok(items.join(' | ') === 'Hide notes on the pages | Hide all notes | Show all notes (off)', 'with three choices; Show all is off while everything shows (' + items.join(' | ') + ')');
  const mb = await page.locator('#notesMenu').boundingBox(), bb = await page.locator('#notesMenuBtn').boundingBox();
  ok(mb.y >= bb.y + bb.height && mb.y < bb.y + bb.height + 12 && mb.x + mb.width <= 1440, 'right under the button, on screen');

  // ---- pages only ----
  await page.click('#notesMenu [data-hide="main"]'); await page.waitForTimeout(400);
  ok(await page.isHidden('#notesMenu'), 'choosing closes the menu');
  ok(await state() === 'page:hidden page:hidden side:open', 'Hide notes on the pages: the page notes shrink to pencils, the side page note stays open (' + await state() + ')');
  ok(await sp.locator('.notebox .mine').isVisible() && await page.getAttribute('#sideBtn', 'aria-pressed') === 'true', '… visible, and side pages are still on');
  await sp.locator('.notebox .mine').click(); await page.keyboard.press('End'); await page.keyboard.type('!');
  ok((await sp.locator('.notebox .mine').textContent()).includes('side note!'), '… and you can keep writing in it');
  await page.mouse.click(5, 700); await page.waitForTimeout(300);

  // ---- everything ----
  await page.click('#notesMenuBtn'); await page.waitForTimeout(150);
  ok(await page.isDisabled('#notesMenu [data-hide="main"]') && !(await page.isDisabled('#notesMenu [data-hide="none"]')), 'now "pages" is done (off) and Show all is on');
  await page.click('#notesMenu [data-hide="all"]'); await page.waitForTimeout(400);
  ok(await state() === 'page:hidden page:hidden side:hidden', 'Hide all notes: the side page note too');
  ok((await page.textContent('#notesMenuBtn')).includes('Show notes'), 'the button now says Show notes');

  // ---- back to pages only: the side page note opens again ----
  await page.click('#notesMenuBtn'); await page.click('#notesMenu [data-hide="main"]'); await page.waitForTimeout(400);
  ok(await state() === 'page:hidden page:hidden side:open', '"Hide notes on the pages" from everything hidden opens the side page note again');

  // ---- show all ----
  await page.click('#notesMenuBtn'); await page.click('#notesMenu [data-hide="none"]'); await page.waitForTimeout(400);
  ok(await state() === 'page:open page:open side:open', 'Show all notes opens every note');

  // ---- side notes off and on again doesn't change what is hidden ----
  await page.click('#notesMenuBtn'); await page.click('#notesMenu [data-hide="main"]'); await page.waitForTimeout(300);
  await page.click('#sideBtn'); await page.waitForTimeout(400); await page.click('#sideBtn'); await page.waitForTimeout(500);
  ok(await state() === 'page:hidden page:hidden side:open', 'turning side notes off and on keeps it as it was');

  // ---- keyboard ----
  await page.focus('#notesMenuBtn'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.activeElement.closest('#notesMenu') !== null), 'opened with the keyboard, the first choice has focus');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok(await page.isHidden('#notesMenu') && await page.evaluate(() => document.activeElement.id === 'notesMenuBtn'), 'Esc closes it and goes back to the button');

  // ---- the status bar button still hides and shows everything ----
  ok((await page.textContent('#notesToggle')).includes('Hide notes'), 'the status bar button offers to hide the rest');
  await page.click('#notesToggle'); await page.waitForTimeout(300);
  ok(await state() === 'page:hidden page:hidden side:hidden', 'the status bar button still hides every note');
  await page.click('#notesToggle'); await page.waitForTimeout(300);
  ok(await state() === 'page:open page:open side:open', '… and shows every note');
  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

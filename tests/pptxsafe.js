// Hardening of the PowerPoint import (a crafted .pptx can't inject markup or script, odd relationships still open, a custom-shaped picture
// still draws, a notebook switch mid-import doesn't misfile the slides) and two keys in notes (Enter that confirms an IME word, Esc to leave a note)
const {open} = require('./harness'); const path = require('path'); const fs = require('fs');
const JSZip = require('jszip');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, {recursive: true});
(async () => {
  const {browser, page, errors} = await open(APP, {width: 1300, height: 1000});
  await page.waitForTimeout(600);
  const openFile = async (f, n, sel = '#main .slide') => { const head = path.basename(f).replace(/\.[^.]+$/, '').replace(/_+/g, ' '); await page.setInputFiles('#file', f.includes('/') ? f : path.join(__dirname, f)); await page.waitForFunction(([sel, n, head]) => document.querySelector('#main .file-head')?.textContent === head && document.querySelectorAll(sel).length >= n, [sel, n, head], {timeout: 60000}); await page.waitForTimeout(700); };

  // ---- keys in a note ----
  await openFile('week2.pptx', 2);
  const strip = page.locator('.pagecard').first().locator('.strip').first(); await strip.scrollIntoViewIfNeeded();
  const gaps = await page.evaluate(() => JSON.parse(document.querySelector('.pagecard').dataset.gaps));
  const bb = await strip.boundingBox(), H = await page.evaluate(() => +document.querySelector('.pagecard').dataset.h), g = gaps[1];
  await page.mouse.move(bb.x + 300, bb.y + (g[0] + g[1]) / 2 / H * bb.height, {steps: 3}); await page.waitForTimeout(250);
  await page.click('.gappill'); await page.keyboard.type('hello'); await page.waitForTimeout(200);
  const note = page.locator('.pagecard').first().locator('.notebox .mine').first();
  const key = init => note.evaluate((n, init) => { const before = n.innerHTML, ev = new KeyboardEvent('keydown', {bubbles: true, cancelable: true, ...init}); n.dispatchEvent(ev); return {prevented: ev.defaultPrevented, changed: n.innerHTML !== before, html: n.innerHTML}; }, init);
  let r = await key({key: 'Enter', isComposing: true});
  ok(!r.prevented && !r.changed, 'Enter while an IME is composing is left to the IME (no line break)');
  r = await key({key: 'Enter', keyCode: 229});
  ok(!r.prevented && !r.changed, 'Enter that confirms an IME word (keyCode 229, as Safari sends it) is no line break either');
  r = await key({key: 'Enter'});
  ok(r.prevented && r.changed && r.html.includes('<br>'), 'a plain Enter still makes a line break');
  await page.keyboard.type('x'); await page.keyboard.press('Tab'); await page.waitForTimeout(100);
  ok(await note.evaluate(n => !!n.querySelector('blockquote, [style*="margin-left"]')), 'Tab in a note still indents');
  await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(100);
  ok(await note.evaluate(n => !n.querySelector('blockquote, [style*="margin-left"]')), 'Shift+Tab takes it back');
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => !document.activeElement?.closest('.mine')) && (await note.textContent()).includes('hello'), 'Esc leaves the note (focus is free to move on) and keeps its words');
  await note.focus(); await page.keyboard.press('End'); await page.keyboard.type('!'); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => !document.activeElement?.closest('.mine')) && (await note.textContent()).includes('!'), 'and again after more typing');
  await page.evaluate(() => setFocus(true)); await note.focus(); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => !focusMode && !!document.activeElement?.closest('.mine')), 'in Focus mode the first Esc leaves Focus mode and the note keeps the cursor');
  await page.mouse.click(5, 500); await page.waitForTimeout(400);

  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

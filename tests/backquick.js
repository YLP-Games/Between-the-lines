// Back straight after a change (before it has been saved) undoes just that change, and Forward brings it back; quick presses each take one step
const {open} = require('./harness');
const path = require('path');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(1200);
  const marks = () => page.evaluate(() => JSON.parse(document.querySelectorAll('.pagecard')[2].dataset.ink || '[]').filter(x => x.k === 'mark').map(x => x.t));
  // highlight words on page 3 (no waiting afterwards)
  const highlight = async txt => {
    await page.evaluate(txt => {
      const t = [...document.querySelectorAll('.pagecard')[2].querySelectorAll('.tl')].find(s => s.textContent.includes(txt));
      t.scrollIntoView({block: 'center'});
    }, txt);
    await page.waitForTimeout(300);
    await page.evaluate(txt => {
      const t = [...document.querySelectorAll('.pagecard')[2].querySelectorAll('.tl')].find(s => s.textContent.includes(txt)), r = document.createRange();
      r.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(r); checkSelection();
    }, txt);
    await page.click('#annoBar .hdot[data-c="#ffe066"]');
  };

  await highlight('Perfect'); await page.waitForTimeout(1200);
  ok((await marks()).length === 1, 'a first highlight, saved');
  await highlight('barriers');
  await page.click('#undoBtn'); await page.waitForTimeout(800);       // straight away, before the save
  let m = await marks();
  ok(m.length === 1 && m[0].includes('Perfect'), 'Back straight after the second highlight takes away just that one');
  await page.click('#redoBtn'); await page.waitForTimeout(800);
  m = await marks();
  ok(m.length === 2 && m.some(t => t.includes('barriers')), 'Forward brings it back (it was not lost)');

  // the keyboard, pressed twice quickly
  await page.mouse.click(5, 700); await page.waitForTimeout(200);
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); await page.waitForTimeout(900);
  ok((await marks()).length === 0, 'Ctrl+Z twice in a row goes back two steps');
  await page.keyboard.press('Control+y'); await page.waitForTimeout(700);
  ok((await marks()).length === 1, 'Ctrl+Y goes forward one');

  // a change, then Back at once, by keyboard
  await highlight('identical'); await page.mouse.click(5, 700);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(800);
  m = await marks();
  ok(m.length === 1 && !m.some(t => t.includes('identical')), 'Ctrl+Z straight after a change undoes that change');
  await page.keyboard.press('Control+y'); await page.waitForTimeout(800);
  ok((await marks()).some(t => t.includes('identical')), 'and Ctrl+Y brings it back');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

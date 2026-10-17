// The "+ Add here" button never gets in the way of selecting the words on a page
const {open} = require('./harness'); const path = require('path');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(800);
  const card = page.locator('.pagecard').nth(1); await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  // the first line of words that starts near the left of the page and has a line below it
  const line = await card.evaluate(c => {
    const t = [...c.querySelectorAll('.tl')].map(s => ({s, r: s.getBoundingClientRect()})).filter(o => o.s.textContent.trim().length > 8 && o.r.width > 120 && o.r.height > 6).sort((a, b) => a.r.left - b.r.left || a.r.top - b.r.top);
    const o = t[0]; return o && {x: o.r.left, y: o.r.top, w: o.r.width, h: o.r.height, text: o.s.textContent};
  });
  ok(line, 'a line of words to select (' + line?.text + ')');
  const pillAt = async () => (await page.$('.gappill')) ? page.locator('.gappill').boundingBox() : null;

  // ---- the button is small and sits in the gap ----
  await page.mouse.move(line.x + 30, line.y - 2, {steps: 4}); await page.waitForTimeout(250);
  let pill = await pillAt();
  ok(pill && pill.height <= 24, 'hovering shows "+ Add here", now a small button (' + pill?.height + 'px tall)');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.gapline')).pointerEvents === 'none'), 'the dashed line lets clicks through');

  // ---- pressing on the button and dragging selects the words under it ----
  await page.mouse.move(line.x + 6, line.y + 4, {steps: 2}); await page.waitForTimeout(250);
  // where the button sits over the start of a line of words
  const hit = await page.evaluate(() => {
    const p = document.querySelector('.gappill')?.getBoundingClientRect(); if (!p) return null;
    for (const s of document.querySelectorAll('.tl')) {
      const r = s.getBoundingClientRect(), l = Math.max(r.left, p.left), rt = Math.min(r.right, p.right), t = Math.max(r.top, p.top), b = Math.min(r.bottom, p.bottom);
      if (rt - l > 4 && b - t > 4 && s.textContent.trim().length > 8) return {x: (l + rt) / 2, y: (t + b) / 2, end: r.right - 3, text: s.textContent};
    }
    return null;
  });
  ok(hit, 'the button covers the start of some words (' + hit?.text + ')');
  const sx = hit.x, sy = hit.y, target = hit.text;
  await page.mouse.move(sx, sy, {steps: 2}); await page.waitForTimeout(250);         // the mouse arrives on the words; the button follows it into the gap
  ok(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.gappill'), [sx, sy]), 'the button is right under the mouse, over the words');
  await page.mouse.down();
  await page.mouse.move(sx + 40, sy, {steps: 3}); await page.mouse.move(hit.end, sy, {steps: 6}); await page.waitForTimeout(100);
  const during = await page.evaluate(() => !!document.querySelector('.gappill'));
  await page.mouse.up(); await page.waitForTimeout(300);
  const sel = await page.evaluate(() => getSelection().toString());
  ok(sel.trim().length > 5 && target.includes(sel.trim().slice(0, 5)), 'dragging from where the button is selects the words (' + JSON.stringify(sel) + ')');
  ok(!during, 'the button is out of the way while you drag');
  ok(await page.isVisible('#annoBar'), 'the highlight bar offers to highlight them');
  ok(!(await page.$('.gappill')), 'and the button stays away while words are selected');

  // ---- dragging over words from anywhere hides it at once ----
  await page.mouse.click(5, 700); await page.waitForTimeout(300);
  await page.mouse.move(line.x + line.w * 0.5, line.y - 2, {steps: 3}); await page.waitForTimeout(250);
  ok(!!(await pillAt()), 'the button is back when nothing is selected');
  await page.mouse.move(line.x + line.w * 0.3, line.y + line.h / 2); await page.mouse.down();
  await page.mouse.move(line.x + line.w * 0.6, line.y + line.h / 2, {steps: 4}); await page.waitForTimeout(100);
  ok(!(await page.$('.gappill')), 'starting a selection elsewhere hides it straight away');
  await page.mouse.up(); await page.waitForTimeout(200);

  // ---- a plain click on it still adds a note ----
  await page.mouse.click(5, 700); await page.waitForTimeout(300);
  const n0 = await page.locator('.notebox').count();
  await page.mouse.move(line.x + 30, line.y - 2, {steps: 3}); await page.waitForTimeout(250);
  await page.click('.gappill'); await page.waitForTimeout(300);
  ok(await page.locator('.notebox').count() === n0 + 1 && await page.evaluate(() => document.activeElement.classList.contains('mine')), 'a click on "+ Add here" still adds a note, ready to type in');
  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

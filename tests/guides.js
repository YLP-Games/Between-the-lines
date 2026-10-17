// Pink alignment guides never stay on screen after a drag, even one let go outside the window
const {open} = require('./harness'); const path = require('path');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const guides = p => p.evaluate(() => document.querySelectorAll('.guide').length);
(async () => {
  const {browser, page, context, errors} = await open(APP);
  const cdp = await context.newCDPSession(page);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(800);
  const card = page.locator('.pagecard').nth(2); await card.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 150)); await page.waitForTimeout(300);
  const s = await card.locator('.strip').first().boundingBox();
  await page.mouse.move(s.x + 120, s.y + s.height * 0.5, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill', {button: 'right'}); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.keyboard.type('A sticky'); await page.waitForTimeout(150);
  await page.mouse.click(5, 700); await page.waitForTimeout(400);
  const st = page.locator('.notebox.sticky'), cb = await card.boundingBox();
  const drag = async () => {
    await st.hover(); await page.waitForTimeout(150);
    const g = await st.locator('.g-move').first().boundingBox(), b = await st.boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await page.mouse.down();
    // put the note's middle on the page's middle: a guide shows
    const tx = cb.x + cb.width / 2 - b.width / 2 + (g.x + g.width / 2 - b.x);
    await page.mouse.move(tx - 40, g.y + 40, {steps: 6}); await page.mouse.move(tx + 1, g.y + 41, {steps: 4}); await page.waitForTimeout(100);
  };
  await drag();
  ok(await guides(page) > 0, 'moving a note shows a guide where it lines up');
  await page.mouse.up(); await page.waitForTimeout(150);
  ok(await guides(page) === 0, 'letting go removes it');
  // let go outside the window: the browser only sees the mouse come back with no button pressed
  await drag();
  ok(await guides(page) > 0, 'moving it again shows the guide');
  const at = await st.boundingBox();
  await cdp.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: 700, y: 500, button: 'none', buttons: 0});
  await page.waitForTimeout(150);
  ok(await guides(page) === 0, 'let go outside the window: no guide is left behind');
  ok(await page.evaluate(() => !document.querySelector('.notebox.moving')), 'and the note is put down, not stuck to the pointer');
  const after = await st.boundingBox();
  ok(Math.abs(after.x - at.x) < 3 && Math.abs(after.y - at.y) < 3, 'right where it was shown');
  await page.mouse.up();
  // any stray guide goes as soon as the mouse moves, or the page scrolls
  await page.evaluate(() => showGuides([{x: 300, a: 100, b: 600}]));
  await page.mouse.move(600, 600); await page.mouse.move(610, 610); await page.waitForTimeout(100);
  ok(await guides(page) === 0, 'a stray guide goes when the mouse moves');
  await page.evaluate(() => showGuides([{x: 300, a: 100, b: 600}])); await page.evaluate(() => scrollBy(0, 200)); await page.waitForTimeout(150);
  ok(await guides(page) === 0, 'or when the page scrolls');
  ok(await page.evaluate(() => !currentDoc().includes('guide')), 'guides are never saved');
  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

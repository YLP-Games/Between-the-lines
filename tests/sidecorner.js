// The side page's palette button: clear until the pointer is near the page's top right corner, the page is tapped, or Tab reaches it
const {setup} = require('./scalelib');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, page, errors} = await setup(APP, {width: 1440, pages: [1]});
  const on = () => page.evaluate(() => { const b = document.getElementById('sideBgCorner'), c = getComputedStyle(b); return !b.hidden && +c.opacity > .5 && c.pointerEvents !== 'none'; });
  const op = () => page.evaluate(() => +getComputedStyle(document.getElementById('sideBgCorner')).opacity);
  await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(700);
  await page.locator('.pagecard').nth(1).scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 60)); await page.waitForTimeout(400);
  const sp = await page.locator('.sidepage').nth(1).boundingBox();
  const topV = Math.max(sp.y, await page.evaluate(() => appbar.getBoundingClientRect().bottom));
  const right = sp.x + sp.width - 8;

  await page.mouse.move(40, 500); await page.waitForTimeout(300);
  ok(!(await on()) && await op() === 0, 'at rest the button is clear');
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('sideBgCorner')).pointerEvents) === 'none', 'and not clickable');
  await page.screenshot({path: path.join(OUT, 'fix-corner-rest.png'), clip: {x: sp.x - 160, y: topV - 6, width: sp.width + 200, height: 260}});
  await page.mouse.move(sp.x + sp.width / 2, sp.y + 300, {steps: 4}); await page.waitForTimeout(400);
  ok(!(await on()), 'pointing at the middle of the side page does not show it');
  await page.mouse.move(right - 130, topV + 40, {steps: 4}); await page.waitForTimeout(400);
  ok(!(await on()), 'nor 130px from the corner');
  await page.mouse.move(right - 100, topV + 70, {steps: 4}); await page.waitForTimeout(500);
  ok(await on(), 'pointing within about 120 x 80 of the corner fades it in');
  await page.screenshot({path: path.join(OUT, 'fix-corner-zone.png'), clip: {x: sp.x - 160, y: topV - 6, width: sp.width + 200, height: 260}});
  await page.mouse.move(right - 100, topV + 120, {steps: 3}); await page.waitForTimeout(500);
  ok(!(await on()), 'moving 120px down out of the zone fades it out');
  await page.mouse.move(right - 20, topV + 20, {steps: 3}); await page.waitForTimeout(400);
  const cb = await page.locator('#sideBgCorner').boundingBox();
  ok(await on() && cb.x + cb.width <= sp.x + sp.width && cb.y >= sp.y, 'it is in the corner of the page');

  // writing on the page: the button stays away unless the pointer is in the corner
  await page.mouse.click(sp.x + 60, sp.y + 340); await page.waitForTimeout(300);
  await page.keyboard.type('Writing a side note'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.activeElement.matches('.sidepage .mine')) && !(await on()), 'while you write a note there (pointer in the page, away from the corner) it is not shown');
  await page.mouse.move(right - 60, topV + 30, {steps: 3}); await page.waitForTimeout(400);
  ok(await on(), 'but it shows if the pointer goes to the corner');
  await page.mouse.move(sp.x + 200, sp.y + 400, {steps: 3}); await page.waitForTimeout(400);
  ok(!(await on()), 'and goes again');

  // keyboard: Tab reaches it, and it shows
  // (notes keep Tab for indenting, so come at it from the status bar, which is just before it in the page)
  await page.evaluate(() => document.activeElement.blur());
  await page.locator('.statusbar .btn').last().focus();
  let reached = false, n = 0;
  for (; n < 40 && !reached; n++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => document.activeElement?.id === 'sideBgCorner'); }
  ok(reached, 'Tab reaches the button (it is not hidden from the keyboard), after ' + n + ' presses');
  await page.waitForTimeout(400);
  ok(await on(), 'and it appears when it has focus');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(await page.isVisible('#sideBgPop'), 'Enter opens the pop-up');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.activeElement?.id === 'sideBgCorner') && await on(), 'Esc closes it and the button keeps focus, still shown');
  await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(400);
  ok(!(await on()), 'and it clears once focus leaves');

  // dark
  await page.emulateMedia({colorScheme: 'dark'}); await page.waitForTimeout(300);
  await page.mouse.move(right - 40, topV + 30, {steps: 3}); await page.waitForTimeout(500);
  await page.screenshot({path: path.join(OUT, 'fix-corner-zone-dark.png'), clip: {x: sp.x - 160, y: topV - 6, width: sp.width + 200, height: 260}});
  ok(await on(), 'dark: shows in the corner zone too');
  await page.emulateMedia({colorScheme: 'light'});
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

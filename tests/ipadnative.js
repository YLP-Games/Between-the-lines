// What an iPad app is expected to do: save on leaving, redo with three fingers, keep its zoom, zoom from the keyboard, and not save mid-writing
const {openIpad, pen, touch} = require('./ipad'); const path = require('path');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
(async () => {
  const {browser, page, cdp, errors} = await openIpad(path.resolve(__dirname, '..', 'index.html'), {width: 1180, height: 820});
  const box = await page.locator('.pagecard .strip').first().boundingBox(), x = box.x + 200, y = box.y + box.height / 2;
  const stroke = async () => { await pen(cdp, 'mousePressed', x, y); for (let i = 1; i < 20; i++) await pen(cdp, 'mouseMoved', x + i * 8, y + i, {down: true}); await pen(cdp, 'mouseReleased', x + 160, y + 20); };
  const hi = () => page.evaluate(() => hist.i);
  const i0 = await hi(); await stroke(); await page.waitForTimeout(700);
  ok(await hi() === i0, 'a pause of 700 ms in the writing doesn\'t save yet');
  await stroke();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', {value: true, configurable: true}); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(400);
  ok(await hi() === i0 + 2, 'going to another app saves what was waiting, each stroke a step of its own');
  const inkN = () => page.evaluate(() => [...document.querySelectorAll('#main [data-ink]')].reduce((n, c) => n + JSON.parse(c.dataset.ink).length, 0));
  const n2 = await inkN();
  await page.evaluate(() => stepHistory(-1)); await page.waitForTimeout(400);
  ok(await inkN() === n2 - 1, 'Back takes away the last stroke only');
  await page.evaluate(() => stepHistory(-1)); await page.waitForTimeout(400);
  ok(await inkN() === n2 - 2, 'and Back again the one before it');
  await page.evaluate(() => stepHistory(2)); await page.waitForTimeout(600);
  ok(await inkN() === n2, 'Forward brings them both back');
  await page.evaluate(() => { delete document.hidden; });
  // Back with two fingers, Forward with three
  const tap = async n => { const pts = [...Array(n)].map((_, k) => [x + k * 60, y, k]); await touch(cdp, 'touchStart', pts); await page.waitForTimeout(40); await touch(cdp, 'touchEnd', []); await page.waitForTimeout(600); };
  await tap(2); ok(await hi() === i0 + 1, 'two fingers tapped: Back');
  await tap(3); ok(await hi() === i0 + 2, 'three fingers tapped: Forward');
  // the keyboard, and the zoom kept
  await page.keyboard.press('Control+='); await page.waitForTimeout(300);
  ok(await page.evaluate(() => pageZoom) === 1.25, 'Ctrl/Cmd + zooms in');
  await page.keyboard.press('Control+='); await page.keyboard.press('Control+-'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => pageZoom) === 1.25, 'Ctrl/Cmd − zooms out');
  await page.waitForTimeout(800); await page.reload(); await page.waitForFunction(() => document.querySelector('.pagecard'), null, {timeout: 30000}); await page.waitForTimeout(800);
  ok(await page.evaluate(() => pageZoom === 1.25 && main.classList.contains('zoomed')), 'the zoom is as it was after a reload');
  await page.keyboard.press('Control+0'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => pageZoom) === 1, 'Ctrl/Cmd 0 fits the pages');
  // pages out of sight keep their height
  ok(await page.evaluate(() => [...document.querySelectorAll('.pagecard .strip')].every(s => s.getBoundingClientRect().height > 50)), 'strips out of sight keep their height');
  // the page goes away before a stroke's save is done: the stroke is there when the notebook opens again
  const n3 = await page.evaluate(() => { const c = document.querySelector('.pagecard'), was = c.dataset.ink || ''; inkAdd(c, {k: 'pen', c: '#1d1d1d', w: 2, p: [[.1, .1], [.2, .2]]}); saveInk(c, was); clearTimeout(timer); timer = null; return JSON.parse(c.dataset.ink).length; });
  const firstInk = () => page.evaluate(() => JSON.parse(document.querySelector('.pagecard').dataset.ink || '[]').length);
  await page.reload(); await page.waitForFunction(() => document.querySelector('.pagecard'), null, {timeout: 30000}); await page.waitForTimeout(1000);
  ok(await firstInk() === n3, 'a stroke whose save was cut off by the page closing is still there');
  ok(await page.evaluate(async () => !(await get('ink-wait'))), 'and its note is gone once read');
  await page.reload(); await page.waitForFunction(() => document.querySelector('.pagecard'), null, {timeout: 30000}); await page.waitForTimeout(800);
  ok(await firstInk() === n3, 'and it is saved for good after that');
  await browser.close();
  if (errors.length) throw new Error('ERRORS: ' + errors.join(' | '));
  console.log('no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

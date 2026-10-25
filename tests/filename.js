// A file's name above its pages can be removed: point at it for a ×, its pages stay and join the file above; Back brings it back
const {open} = require('./harness'); const path = require('path');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  const heads = () => page.$$eval('#main .file-head', hs => hs.map(h => h.textContent));
  const order = () => page.evaluate(() => [...document.querySelectorAll('#main .file-head, #main .slide')].map(e => e.matches('.file-head') ? 'H' : 'p').join(''));
  const pageIds = () => page.evaluate(() => [...document.querySelectorAll('#main .slide')].map(s => (s.style.getPropertyValue('--pg').match(/url\(["']?(.*?)["']?\)$/) || [])[1]).map(u => assetOf.get(u) || u).join());
  const settle = async n => { await page.waitForFunction(n => document.querySelectorAll('#main .slide').length >= n, n, {timeout: 60000}); await page.waitForTimeout(1500); };
  const pointAt = async i => { const h = page.locator('#main .file-head').nth(i); await h.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, -120)); await h.hover({position: {x: 20, y: 10}}); await page.waitForTimeout(200); };

  // a 6-page PDF, with a picture added after page 2: lecture / pic / lecture
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf')); await settle(6);
  const c = page.locator('#main .slide').nth(1); await c.scrollIntoViewIfNeeded(); await c.click({position: {x: 30, y: 30}});
  await page.click('#tab-insert');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFileAfterBtn')]); await fc.setFiles(path.join(__dirname, 'pic.png')); await settle(7);
  ok((await heads()).join(' / ') === 'lecture / pic / lecture' && await order() === 'HppHpHpppp', 'a picture in the middle brings its name, and the rest of the PDF gets its own again');
  const ids = await pageIds();

  // pointing at a name shows a × at its end
  ok(await page.isHidden('.headx'), 'no × until you point at a name');
  await pointAt(1);
  ok(await page.isVisible('.headx'), 'pointing at the picture’s name shows a ×');
  const g = await page.evaluate(() => { const h = document.querySelectorAll('#main .file-head')[1], r = document.createRange(); r.selectNodeContents(h); const t = r.getBoundingClientRect(), b = document.querySelector('.headx').getBoundingClientRect(); return {gap: b.left - t.right, dy: Math.abs((b.top + b.bottom) / 2 - (t.top + t.bottom) / 2)}; });
  ok(g.gap >= 0 && g.gap < 20 && g.dy < 4, `just after the name, on its line (${g.gap.toFixed(0)}px after, ${g.dy.toFixed(1)}px off)`);
  ok((await page.textContent('#main .file-head >> nth=1')) === 'pic', 'and it is not part of the name');
  await page.hover('.headx'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.querySelectorAll('#main .file-head')[1].classList.contains('headx-on')), 'pointing at the × crosses the name out first');
  await page.click('.headx'); await page.waitForTimeout(700);
  ok(await order() === 'Hppppppp' && (await heads()).join() === 'lecture', 'the name goes, and the PDF’s two parts are one file again');
  ok(await pageIds() === ids, 'every page stays, in the same order');
  ok(/File name removed/.test(await page.textContent('#toast')), 'it says so, and how to undo it');
  ok(await page.$$eval('#pageList li.group', ls => ls.length) === 1 && await page.$$eval('#pageList li:not(.group)', ls => ls.length) === 7, 'the page list shows one file with all 7 pages');
  ok(await page.isHidden('.headx'), 'the × goes away');

  // Back brings it back, Forward takes it away again
  await page.click('#tab-home'); await page.click('#undoBtn'); await page.waitForTimeout(800);
  ok((await heads()).join(' / ') === 'lecture / pic / lecture', 'Back brings the names back');
  await page.click('#redoBtn'); await page.waitForTimeout(800);
  ok((await heads()).join() === 'lecture', 'Forward removes them again');

  // a file added at the end: removing its name puts its pages under the first file's
  await page.click('#tab-insert');
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addHereBtn')]); await fc2.setFiles(path.join(__dirname, 'numbers.pdf')); await settle(8);
  const n = await page.locator('#main .slide').count();
  ok((await heads()).join(' / ') === 'lecture / numbers', 'a file at the end has its name');
  await pointAt(1); await page.click('.headx'); await page.waitForTimeout(700);
  ok((await heads()).join() === 'lecture' && await page.locator('#main .slide').count() === n, 'its name goes and its pages stay');
  // the first name too
  await pointAt(0); await page.click('.headx'); await page.waitForTimeout(700);
  ok((await heads()).length === 0 && await page.locator('#main .slide').count() === n, 'the first file’s name can go too');

  // it is saved that way, with nothing of the button in the notebook
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => !/headx/.test(currentDoc())), 'nothing of the × is saved');
  await page.reload(); await page.waitForTimeout(2500);
  ok((await heads()).length === 0 && await page.locator('#main .slide').count() === n, 'after a reload the names are still gone and every page is there');

  // in A4 layout, and not in Study mode
  await page.click('#tab-insert');
  const [fc3] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addHereBtn')]); await fc3.setFiles(path.join(__dirname, 'pic.png')); await settle(n + 1);
  await page.click('#tab-view'); await page.locator('select:has(option[value="a4-portrait"])').first().selectOption('a4-portrait'); await page.waitForTimeout(1200);
  await pointAt(0);
  ok(await page.isVisible('.headx'), 'in A4 layout the name shows a × too');
  await page.click('#readBtn'); await page.waitForTimeout(400); await page.mouse.move(5, 5); await pointAt(0);
  ok(await page.isHidden('.headx'), 'but not in Study mode');
  await page.click('#readBtn'); await page.waitForTimeout(400);
  await page.click('#tab-view'); await page.locator('select:has(option[value="a4-portrait"])').first().selectOption('default'); await page.waitForTimeout(600);
  // on a touch screen, tapping the name shows it
  await page.evaluate(() => { const h = document.querySelector('#main .file-head'); h.scrollIntoView({block: 'center'}); const r = h.getBoundingClientRect(); h.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerType: 'touch', clientX: r.left + 10, clientY: r.top + 10})); });
  await page.waitForTimeout(200);
  ok(await page.isVisible('.headx'), 'tapping a name on a touch screen shows the ×');
  await page.click('.headx'); await page.waitForTimeout(700);
  ok((await heads()).length === 0, 'and tapping it removes the name');
  await page.screenshot({path: path.join(__dirname, 'shots', 'filename.png')});
  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });

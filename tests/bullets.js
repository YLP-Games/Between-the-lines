// A bullet or number looks like the words after it: colour a whole list green and its bullets go green too
const {open} = require('./harness'); const path = require('path');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(600);
  const strip = page.locator('.pagecard').nth(1).locator('.strip').last(); await strip.scrollIntoViewIfNeeded();
  const b = await strip.boundingBox(); await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.waitForTimeout(200);
  await page.keyboard.type('- Driven by new information'); await page.keyboard.press('Enter'); await page.keyboard.type('Random walk');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.type('1. First'); await page.keyboard.press('Enter'); await page.keyboard.type('Second');
  const marks = () => page.evaluate(() => [...document.querySelectorAll('.pagecard .mine li')].map(li => { const m = getComputedStyle(li, '::marker'); return {c: m.color, s: m.fontSize, t: getComputedStyle(li.querySelector('span') || li).color}; }));
  const base = (await marks())[0].c;
  ok((await marks()).length === 4, 'two bullets and two numbers');
  const setColor = c => page.evaluate(c => { const i = document.querySelector('#color'); i.value = c; i.dispatchEvent(new Event('input', {bubbles: true})); }, c);

  // ---- the whole note selected and coloured ----
  await page.keyboard.press('Control+a'); await setColor('#2e7d32'); await page.waitForTimeout(200);
  let m = await marks();
  ok(m.every(x => x.c === 'rgb(46, 125, 50)'), 'colouring everything turns the bullets and numbers green too (' + m.map(x => x.c).join(' / ') + ')');

  // ---- one item coloured on its own ----
  const li = page.locator('.pagecard .mine li').nth(1);
  await li.evaluate(el => { const r = document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await setColor('#c62828'); await page.waitForTimeout(200);
  m = await marks();
  ok(m[1].c === 'rgb(198, 40, 40)' && m[0].c === 'rgb(46, 125, 50)', 'colouring one line changes only its bullet (' + m.map(x => x.c).join(' / ') + ')');

  // ---- a word in the middle doesn't change the bullet; the first word does ----
  const first = page.locator('.pagecard .mine li').nth(2);
  await first.evaluate(el => { const t = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode(); const r = document.createRange(); r.setStart(t, 2); r.setEnd(t, 4); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await setColor('#1f4fd1'); await page.waitForTimeout(200);
  m = await marks();
  ok(m[2].c === 'rgb(46, 125, 50)', 'a few letters in the middle of a line leave its number as it was');

  // ---- size: a bigger line gets a bigger bullet ----
  await li.evaluate(el => { const r = document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await page.fill('#size', '28'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  m = await marks();
  ok(m[1].s === '28px' && m[0].s !== '28px', 'a bigger line gets a bigger bullet (' + m.map(x => x.s).join(' / ') + ')');

  // ---- a new line typed after a coloured one keeps the colour, bullet included ----
  await page.locator('.pagecard .mine li').nth(3).click(); await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.keyboard.type('Third');
  await page.waitForTimeout(150);
  m = await marks();
  ok(m.length === 5 && m[4].c === 'rgb(46, 125, 50)', 'a new item after a green one has a green number (' + m[4]?.c + ')');

  // ---- saved with the notebook ----
  await page.mouse.click(5, 700); await page.waitForTimeout(900);
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('.pagecard .mine li').length === 5, null, {timeout: 30000}); await page.waitForTimeout(500);
  m = await marks();
  ok(m[0].c === 'rgb(46, 125, 50)' && m[1].c === 'rgb(198, 40, 40)' && m[1].s === '28px', 'after reloading the bullets keep their colours and size');
  ok(base !== 'rgb(46, 125, 50)', 'and to begin with they were the note colour (' + base + ')');

  // ---- clearing: colouring the whole note again sets every bullet to that colour ----
  await page.locator('.pagecard .mine').last().click(); await page.waitForTimeout(200); await page.keyboard.press('Control+a'); await setColor('#1d1d1d'); await page.waitForTimeout(400);
  m = await marks();
  ok(m.every(x => x.c === 'rgb(29, 29, 29)'), 'colouring everything again sets every bullet (' + m.map(x => x.c + '/' + x.t).join(' ') + ')');
  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

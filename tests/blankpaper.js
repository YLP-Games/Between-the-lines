// A new blank page takes the paper of the page it follows: white after a PDF page even in the dark theme (where a blank page
// is otherwise cream), the slide's own colour after a dark slide (with light words on it), and a page after that one matches too
const {open} = require('./harness'); const path = require('path'); const fs = require('fs');
const {chromium} = require('playwright');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
(async () => {
  const DARK = path.join(__dirname, 'darkslides.pdf');
  if (!fs.existsSync(DARK)) {
    const b = await chromium.launch(); const p = await b.newPage();
    await p.setContent('<style>@page{size:960px 540px;margin:0}body{margin:0;font:28px sans-serif}section{height:540px;padding:60px;box-sizing:border-box;background:#1e2a44;color:#fff;page-break-after:always}</style>' + [1, 2, 3].map(i => `<section><h1>Dark slide ${i}</h1><p>White words on a navy slide.</p></section>`).join(''));
    await p.pdf({path: DARK, width: '960px', height: '540px', printBackground: true}); await b.close();
  }
  const {browser, page, errors} = await open(APP);
  await page.emulateMedia({colorScheme: 'dark'});
  await page.waitForTimeout(500);
  const addAfter = async n => {
    const card = page.locator('#main .slide').nth(n); await card.scrollIntoViewIfNeeded(); await card.click({position: {x: 30, y: 30}}).catch(() => {});
    await page.click('#tab-insert'); await page.click('#addPageBtn'); await page.waitForTimeout(900);
    await page.mouse.click(5, 700); await page.waitForTimeout(300);
  };
  const look = sel => page.$eval(sel, c => ({bg: getComputedStyle(c).backgroundColor, ink: getComputedStyle(c).color}));
  const rgb = s => s.match(/\d+/g).slice(0, 3).map(Number), near = (a, b, d = 20) => rgb(a).every((v, i) => Math.abs(v - rgb(b)[i]) <= d);

  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('#main .pagecard').length >= 3, null, {timeout: 60000}); await page.waitForTimeout(900);
  const card = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--card').trim());
  ok(card.toLowerCase() === '#f4f1e8', `the dark theme's blank-page colour is cream (${card})`);
  await addAfter(0);
  let b = await look('#main .blankpage');
  ok(near(b.bg, 'rgb(255, 255, 255)', 4), `a page added after a white PDF page is white, not cream (${b.bg})`);
  await addAfter(1);
  const both = await page.$$eval('#main .blankpage', bs => bs.map(c => getComputedStyle(c).backgroundColor));
  ok(both.length === 2 && near(both[1], 'rgb(255, 255, 255)', 4), `a page added after that blank page is white too (${both[1]})`);
  await page.waitForTimeout(900); await page.reload(); await page.waitForTimeout(2500);
  b = await look('#main .blankpage');
  ok(near(b.bg, 'rgb(255, 255, 255)', 4), `and it stays white after a reload (${b.bg})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'blankpaper-white.png')});

  // its own background, from the palette in its corner
  const bp = page.locator('#main .blankpage').first(); await bp.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const r = await bp.boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(200);
  ok(await page.$eval('#pageBgCorner', b => !b.hidden && !b.classList.contains('near')), 'pointing at an inserted page puts its palette button in the corner, clear until you come near');
  await page.mouse.move(r.x + r.width - 30, r.y + 25); await page.waitForTimeout(200);
  ok(await page.$eval('#pageBgCorner', b => b.classList.contains('near')), 'and it shows near the corner');
  await page.click('#pageBgCorner'); await page.waitForTimeout(200);
  ok(await page.isVisible('#pageBgPop'), 'clicking it opens Page background');
  await page.click('#pageBgPop .sw[data-c="#eef7f0"]'); await page.click('#pageBgPop .pat[data-pat="lined"]'); await page.waitForTimeout(200);
  await page.screenshot({path: path.join(__dirname, 'shots', 'blankpaper-pop.png')});
  b = await look('#main .blankpage');
  ok(near(b.bg, 'rgb(238, 247, 240)', 2) && await bp.evaluate(p => p.dataset.pat === 'lined' && getComputedStyle(p).backgroundImage.includes('gradient')), `Mint and Lined paint that page (${b.bg})`);
  ok(near((await page.$$eval('#main .blankpage', bs => getComputedStyle(bs[1]).backgroundColor)), 'rgb(255, 255, 255)', 4), 'and only that page');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(!(await page.isVisible('#pageBgPop')), 'Escape closes it');
  await page.waitForTimeout(900); await page.reload(); await page.waitForTimeout(2500);
  b = await look('#main .blankpage');
  ok(near(b.bg, 'rgb(238, 247, 240)', 2) && await page.$eval('#main .blankpage', p => p.dataset.pat === 'lined'), 'the colour and pattern stay after a reload');
  await addAfter(1);
  ok(await page.$$eval('#main .blankpage', bs => bs.length === 3 && bs[1].dataset.pat === 'lined' && getComputedStyle(bs[1]).backgroundColor === 'rgb(238, 247, 240)'), 'a page added after it is mint and lined too');
  await page.evaluate(() => { const p = document.querySelector('#main .blankpage'); openPageBg(p); });
  await page.click('#pageBgLike'); await page.waitForTimeout(600);
  b = await look('#main .blankpage');
  ok(near(b.bg, 'rgb(255, 255, 255)', 4), `Match the page before takes the PDF page's white again (${b.bg})`);
  await page.keyboard.press('Escape');

  await page.click('#newDocBtn'); await page.waitForTimeout(600);
  await page.setInputFiles('#file', DARK);
  await page.waitForFunction(() => document.querySelectorAll('#main .pagecard').length >= 3, null, {timeout: 60000}); await page.waitForTimeout(900);
  await addAfter(0);
  b = await look('#main .blankpage');
  ok(near(b.bg, 'rgb(30, 42, 68)'), `a page added after a navy slide is navy (${b.bg})`);
  ok(rgb(b.ink).every(v => v > 200), `with light words on it (${b.ink})`);
  const th = await page.$$eval('#pageList .pg .thumb', ts => getComputedStyle(ts[1]).backgroundColor);
  ok(near(th, 'rgb(30, 42, 68)'), `its thumbnail is navy too (${th})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'blankpaper-dark.png')});
  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

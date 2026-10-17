// A new blank page takes the shape of the page it follows: portrait PDFs get portrait blank pages, slides get slide-shaped ones
const {open} = require('./harness'); const path = require('path'); const fs = require('fs');
const {chromium} = require('playwright');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
(async () => {
  const PORTRAIT = path.join(__dirname, 'portrait.pdf');
  if (!fs.existsSync(PORTRAIT)) {
    const b = await chromium.launch(); const p = await b.newPage();
    await p.setContent('<style>body{font:16px serif;margin:0}section{height:100vh;padding:60px;box-sizing:border-box;page-break-after:always}</style>' + [1, 2, 3].map(i => `<section><h1>Handout page ${i}</h1><p>Some lecture text on a portrait A4 page, line one.</p><p>Line two of the handout, with more words.</p></section>`).join(''));
    await p.pdf({path: PORTRAIT, format: 'A4'}); await b.close();
  }
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  const shape = sel => page.$eval(sel, c => { const r = c.getBoundingClientRect(); return {w: r.width, h: r.height, ar: r.width / r.height}; });
  const addAfter = async n => {
    const card = page.locator('#main .slide').nth(n); await card.scrollIntoViewIfNeeded(); await card.click({position: {x: 30, y: 30}}).catch(() => {});
    await page.click('#tab-insert'); await page.click('#addPageBtn'); await page.waitForTimeout(700);
    await page.mouse.click(5, 700); await page.waitForTimeout(300);
  };
  for (const [file, label] of [[PORTRAIT, 'portrait A4 PDF'], [path.join(__dirname, 'lecture.pdf'), 'landscape slides PDF']]) {
    await page.setInputFiles('#file', file);
    await page.waitForFunction(() => document.querySelectorAll('#main .pagecard').length >= 3, null, {timeout: 60000}); await page.waitForTimeout(900);
    await addAfter(0);
    const before = await shape('#main .slide:nth-child(1 of .slide)'), blank = await shape('#main .blankpage');
    ok(Math.abs(blank.w - before.w) < 1.5, `${label}: the new page is exactly as wide as the page above (${blank.w.toFixed(0)} vs ${before.w.toFixed(0)})`);
    ok(Math.abs(blank.ar - before.ar) / before.ar < 0.01, `${label}: and the same shape (${blank.ar.toFixed(3)} vs ${before.ar.toFixed(3)})`);
    // a blank page added after a blank page keeps the shape too
    await addAfter(1);
    const second = await page.$$eval('#main .blankpage', bs => bs.map(c => c.getBoundingClientRect().width / c.getBoundingClientRect().height));
    ok(second.length === 2 && Math.abs(second[1] - before.ar) / before.ar < 0.01, `${label}: a page added after a blank page matches as well`);
    // thumbnails show the same shape
    const th = await page.$$eval('#pageList .pg .thumb', ts => ts.slice(0, 3).map(t => t.getBoundingClientRect().width / t.getBoundingClientRect().height));
    ok(th.length === 3 && Math.abs(th[1] - th[0]) / th[0] < 0.03, `${label}: its thumbnail has the same shape (${th.map(x => x.toFixed(2)).join(', ')})`);
    // it stays that shape after a reload
    await page.waitForTimeout(800); await page.reload(); await page.waitForTimeout(2500);
    const again = await shape('#main .blankpage');
    ok(Math.abs(again.ar - before.ar) / before.ar < 0.01, `${label}: and keeps it after a reload`);
    // in A4 layout too
    await page.click('#tab-view'); await page.selectOption('#layoutSel, select[aria-label*="layout" i]', 'a4-portrait').catch(async () => { const s = await page.$('select:has(option[value="a4-portrait"])'); await s.selectOption('a4-portrait'); });
    await page.waitForTimeout(900);
    // (the first sheet also holds the notebook's title, so its page is drawn a little smaller: compare with a page on a sheet of its own)
    const pc = await page.evaluate(() => { const m = c => { const r = c.getBoundingClientRect(); return [c.className, r.width, r.width / r.height]; };
      const plain = [...document.querySelectorAll('#main .sheet')].filter(s => !s.querySelector('.file-head'));
      const a = plain.map(s => s.querySelector('.pagecard')).find(Boolean), b = plain.map(s => s.querySelector('.blankpage')).find(Boolean);
      return a && b ? [m(a), m(b)] : []; });
    ok(pc.length === 2 && Math.abs(pc[0][1] - pc[1][1]) / pc[0][1] < 0.01 && Math.abs(pc[0][2] - pc[1][2]) / pc[0][2] < 0.01, `${label}: in A4 layout the blank page matches the page above (${pc.map(x => x[1].toFixed(0) + 'w ' + x[2].toFixed(3)).join(' | ')})`);
    await page.locator('select:has(option[value="a4-portrait"])').first().selectOption('default'); await page.waitForTimeout(500);
    await page.screenshot({path: path.join(__dirname, 'shots', `blankshape-${label.split(' ')[0]}.png`)});
    await page.click('#newDocBtn'); await page.waitForTimeout(600);
  }
  // with nothing to copy (a brand-new notebook), a blank page is still a sensible slide shape
  await page.click('#tab-insert'); await page.click('#stickyBtn').catch(() => {}); await page.waitForTimeout(500);
  const fresh = await page.$('#main .blankpage');
  ok(!fresh || await fresh.evaluate(c => { const r = c.getBoundingClientRect(); return Math.abs(r.width / r.height - 16 / 9) < 0.05; }), 'a page in an empty notebook keeps the usual 16:9 shape');
  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

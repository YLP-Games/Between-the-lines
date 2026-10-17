// Slide numbers are cleaned off PDF pages, but other numbers near the bottom of a slide (tables, lists, values) stay
const {open} = require('./harness'); const path = require('path'); const fs = require('fs');
const {chromium} = require('playwright');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
(async () => {
  const PDF = path.join(__dirname, 'numbers.pdf');
  if (!fs.existsSync(PDF)) {
    const b = await chromium.launch(); const p = await b.newPage();
    const slide = n => `<section><h1>Market indices ${n}</h1><p>Points scored in the session.</p>
      <table><tr><td>Top</td><td>40</td><td>-0.92%</td></tr><tr><td>Industrial</td><td>25</td><td>${n + 1}</td></tr><tr><td>Resources</td><td>10</td><td>7</td></tr></table>
      <div class="lone">250</div><div class="num">${n}</div></section>`;
    await p.setContent(`<style>@page{size:960px 540px;margin:0}body{margin:0;font:22px Arial}section{position:relative;width:960px;height:540px;padding:40px 60px;box-sizing:border-box;page-break-after:always}
      table{position:absolute;left:60px;bottom:24px;border-collapse:collapse}td{padding:2px 18px;font-size:16px}.num{position:absolute;right:30px;bottom:14px;font-size:14px}.lone{position:absolute;left:470px;top:20px;font-size:14px}</style>` + [1, 2, 3].map(slide).join(''));
    await p.pdf({path: PDF, width: '960px', height: '540px', printBackground: true}); await b.close();
  }
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', PDF);
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 3, null, {timeout: 60000}); await page.waitForTimeout(800);
  const words = await page.$$eval('.pagecard', cs => cs.map(c => JSON.parse(c.dataset.text || '[]').map(t => t[0].trim()).filter(Boolean)));
  for (const [i, w] of words.entries()) {
    const n = String(i + 1);
    ok(['40', '25', '10', '7', String(i + 2), '-0.92%'].every(x => w.includes(x)), `page ${n}: the numbers in the table near the bottom stay (${w.filter(x => /\d/.test(x)).join(' ')})`);
    ok(w.includes('250'), `page ${n}: a lone number that isn't a page number stays`);
    ok(w.filter(x => x === n).length === 0 || (i + 2 === +n), `page ${n}: the slide number ${n} in the corner is cleaned away`);
  }
  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

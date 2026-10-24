// Audit follow-ups: pdf.js in a real Web Worker, the ribbon's scroll-bar strip, the Show toolbar pill, the writing guide under drawers, the phone title bar,
// invisible note handles, contrast, measureStrip's layout work, formatting buttons and the split-view pane, and printing.
// `node audit2.js` runs everything; `node audit2.js worker print` only those sections. APP=/path/to/older/index.html checks an older copy.
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const only = process.argv.slice(2);
const SECTIONS = {};
const section = (name, fn) => { SECTIONS[name] = fn; };
const pdfCards = (page, n = 2) => page.waitForFunction(n => document.querySelectorAll('.pagecard').length >= n, n, {timeout: 60000});
const errs = errors => errors.filter(e => !/ERR_FAILED|net::/.test(e));
const finish = (errors, label) => ok(errs(errors).length === 0, label + ': no page errors' + (errs(errors).length ? ': ' + errs(errors).join(' | ') : ''));

// ---------- 2. pdf.js runs in a real Web Worker, and still opens PDFs where one can't be made ----------
section('worker', async () => {
  let {browser, page, errors} = await open(APP);
  await page.waitForTimeout(600);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await pdfCards(page, 6); await page.waitForTimeout(500);
  ok(await page.evaluate(() => !!pdfjsLib.GlobalWorkerOptions.workerSrc), 'pdf.js is told where its worker is');
  ok(page.workers().length >= 1, 'reading a PDF starts a Web Worker (' + page.workers().length + ')');
  ok(await page.evaluate(() => typeof window.pdfjsWorker === 'undefined'), 'the worker script is not also run on the page itself');
  ok(await page.locator('.pagecard').count() >= 6, 'the PDF opens with its pages');
  finish(errors, 'worker'); await browser.close();

  // a browser that won't make a worker: pdf.js reads on the page instead, and the PDF still opens
  ({browser, page, errors} = await open(APP));
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.Worker = function () { throw new Error('workers are blocked here'); }; });
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await pdfCards(page, 6); await page.waitForTimeout(500);
  ok(page.workers().length === 0 && await page.locator('.pagecard').count() >= 6, 'with workers blocked the PDF still opens (on the page)');
  finish(errors, 'worker fallback'); await browser.close();
});

// ---------- 9. measureStrip reads every span, then writes them: one layout, not one per span ----------
section('measure', async () => {
  const {browser, context, page, errors} = await open(APP);
  await page.waitForTimeout(600);
  await page.setInputFiles('#file', path.join(__dirname, 'long.pdf'));
  await pdfCards(page, 44); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => [...document.querySelectorAll('#main .tl')].every(s => s.style.transform)), 'every text span of the 44-page PDF is measured');
  // a strip with 60 spans, measured while Chrome counts how often it works out styles and layout
  const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
  const counts = async () => { const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value])); return m.RecalcStyleCount + m.LayoutCount; };
  await page.evaluate(() => {
    const strip = document.querySelector('#main .strip'), tpl = strip.querySelector('.tl');
    for (let i = strip.querySelectorAll('.tl').length; i < 60; i++) { const c = tpl.cloneNode(true); c.style.top = (i % 20) * 4 + '%'; strip.append(c); }
    strip.querySelectorAll('.tl').forEach(s => s.style.transform = '');
    window.__strip = strip; strip.getBoundingClientRect();
  });
  const before = await counts();
  const sized = await page.evaluate(() => { const t0 = performance.now(); if (window.measureStrips) measureStrips([__strip]); else measureStrip(__strip); return performance.now() - t0; });
  const worked = (await counts()) - before;
  const r = await page.evaluate(() => {
    const strip = __strip, all = [...strip.querySelectorAll('.tl')], w = strip.getBoundingClientRect().width;
    return {spans: all.length, sized: all.filter(s => s.style.transform).length, off: all.filter(s => { const a = s.getBoundingClientRect().width, t = +s.dataset.w * w; return !(t > 0 && Math.abs(a - t) / t < 0.03); }).length};
  });
  ok(r.sized === r.spans, 'a strip of ' + r.spans + ' spans: all ' + r.sized + ' were sized (' + Math.round(sized) + ' ms)');
  ok(worked <= 6, 'measuring it made Chrome work out styles and layout ' + worked + ' times (a handful, not once per span)');
  ok(r.off === 0, 'every span ends up as wide as the PDF says (' + r.off + ' off)');
  finish(errors, 'measure'); await browser.close();
});

(async () => {
  for (const [name, fn] of Object.entries(SECTIONS)) {
    if (only.length && !only.includes(name)) continue;
    console.log('--- ' + name);
    await fn();
  }
  console.log('no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

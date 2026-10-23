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

(async () => {
  for (const [name, fn] of Object.entries(SECTIONS)) {
    if (only.length && !only.includes(name)) continue;
    console.log('--- ' + name);
    await fn();
  }
  console.log('no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

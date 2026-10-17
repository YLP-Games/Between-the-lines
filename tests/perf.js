// How much work saving is: size of what is saved, and time spent per save and per keystroke, on a 44-page PDF
const {open} = require('./harness'); const path = require('path');
(async () => {
  const {browser, page} = await open(require('path').resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'long.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 44, null, {timeout: 120000});
  await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => {
    const t0 = performance.now(); const doc = currentDoc(); const t1 = performance.now();
    await saveNow(); const t2 = performance.now();
    return {docMB: +(doc.length / 1e6).toFixed(2), serialiseMs: Math.round(t1 - t0), saveMs: Math.round(t2 - t1)};
  });
  console.log('saved notebook:', r.docMB, 'MB; building it', r.serialiseMs, 'ms; one save', r.saveMs, 'ms');
  // typing in a note: time the main thread is busy while saving catches up
  const strip = page.locator('.pagecard').nth(3).locator('.strip').first(); await strip.scrollIntoViewIfNeeded();
  const b = await strip.boundingBox(); await page.mouse.move(b.x + 200, b.y + b.height / 2, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill');
  await page.evaluate(() => {
    window.__t = {};
    for (const n of ['refreshPanels', 'renderPages', 'renderNotes', 'renderDocs', 'saveNow', 'currentDoc', 'snapshot', 'placeFloats', 'updateNotesBtn', 'trackPage', 'spellNote', 'putAll', 'updateWhere']) {
      const f = window[n]; if (typeof f !== 'function') continue;
      window[n] = function(...a){ const t = performance.now(); const r = f.apply(this, a); const add = () => { window.__t[n] = (window.__t[n] || 0) + performance.now() - t; }; if (r && r.then) r.then(add); else add(); return r; };
    }
  });
  await page.evaluate(() => { window.__long = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long += e.duration; }).observe({type: 'longtask', buffered: false}); });
  for (let i = 0; i < 6; i++) { await page.keyboard.type('typing some words '); await page.waitForTimeout(900); }
  console.log('time per function:', JSON.stringify(await page.evaluate(() => Object.fromEntries(Object.entries(window.__t).map(([k, v]) => [k, Math.round(v)])))));
  console.log('busy time (long tasks) while typing for ~6 s:', Math.round(await page.evaluate(() => window.__long)), 'ms');
  await browser.close();
})();

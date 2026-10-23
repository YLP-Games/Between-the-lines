// How quickly a pen stroke is drawn on an iPad-like page: the work per frame while the Pencil moves, the frames that run long, and the
// work when the pen lifts, on a page that already has 50 pressure strokes, with the CPU slowed 4× (roughly a phone or an older iPad).
// Prints numbers only (no pass/fail): compare before and after a change.
const {openIpad, pen} = require('./ipad');
(async () => {
  const {browser, page, cdp, errors} = await openIpad(require('path').resolve(__dirname, '..', 'index.html'), {width: 1180, height: 820});
  const rate = +(process.env.CPU || 4);
  await page.evaluate(() => {
    const card = document.querySelector('.pagecard'), W = +card.dataset.w, items = [];
    for (let s = 0; s < 50; s++) { const p = []; let x = 40 + (s % 10) * 85, y = 40 + Math.floor(s / 10) * 90; for (let i = 0; i < 200; i++) p.push([+(x + i * .4).toFixed(1), +(y + Math.sin(i / 7) * 12).toFixed(1), .4 + (i % 9) / 20]); items.push({k: s % 3 ? 'pen' : 'pc', c: '#1f4fd1', w: 1.5, p}); }
    setInk(card, items); card.scrollIntoView();
    window.__perf = {calls: {}, frames: []};
    for (const n of ['liveInk', 'livePaint', 'paintStroke', 'inkAdd', 'inkShow', 'setInk', 'renderInk', 'strokeAttrs', 'inkOutline', 'saveSoon']) {
      const f = window[n]; if (typeof f !== 'function') continue;
      window[n] = function(...a){ const t = performance.now(); try { return f.apply(this, a); } finally { const c = window.__perf.calls[n] ||= {n: 0, ms: 0}; c.n++; c.ms += performance.now() - t; } };
    }
    let last = performance.now(); const tick = t => { window.__perf.frames.push(t - last); last = t; if (window.__perf.on) requestAnimationFrame(tick); };
    window.__perf.start = () => { window.__perf.on = true; window.__perf.frames = []; last = performance.now(); requestAnimationFrame(tick); };
    new PerformanceObserver(l => { for (const e of l.getEntries()) (window.__perf.long ||= []).push(Math.round(e.duration)); }).observe({type: 'longtask'});
  });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => { const s = document.querySelector('.pagecard .strip').getBoundingClientRect(); return {x: s.x, y: s.y, w: s.width, h: s.height}; });
  await cdp.send('Emulation.setCPUThrottlingRate', {rate});
  await cdp.send('Performance.enable');
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  await page.evaluate(() => { window.__perf.long = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.longAt = [...(window.__perf.longAt || []), [Math.round(e.startTime - window.__perf.t0), Math.round(e.duration)]]; }).observe({type: 'longtask'}); window.__perf.t0 = performance.now(); });
  const m0 = await metric();
  await page.evaluate(() => window.__perf.start());
  const N = +(process.env.N || 600), x0 = r.x + 60, y0 = r.y + r.h * .55, t0 = Date.now();
  await pen(cdp, 'mousePressed', x0, y0, {force: .5});
  for (let i = 1; i <= N; i++) {
    const x = x0 + (i % 300) * 2.2, y = y0 + Math.floor(i / 300) * 40 + Math.sin(i / 9) * 18;
    await pen(cdp, 'mouseMoved', x, y, {down: true, force: .3 + (i % 20) / 30});
  }
  const tMove = Date.now() - t0;
  const m1 = await metric(); const tUp = Date.now(); await page.evaluate(() => window.__perf.upAt = Math.round(performance.now() - window.__perf.t0));
  await pen(cdp, 'mouseReleased', x0 + 300, y0 + 40, {force: 0});
  await page.waitForTimeout(600);
  const m2 = await metric();
  const d = (a, b, k) => ((b[k] - a[k]) * 1000).toFixed(0) + 'ms';
  console.log('while drawing  script', d(m0, m1, 'ScriptDuration'), 'layout', d(m0, m1, 'LayoutDuration'), 'style', d(m0, m1, 'RecalcStyleDuration'), 'all tasks', d(m0, m1, 'TaskDuration'));
  console.log('pen-up + 600ms script', d(m1, m2, 'ScriptDuration'), 'layout', d(m1, m2, 'LayoutDuration'), 'style', d(m1, m2, 'RecalcStyleDuration'), 'all tasks', d(m1, m2, 'TaskDuration'));
  const out = await page.evaluate(() => { window.__perf.on = false; const f = window.__perf.frames.slice(1); f.sort((a, b) => a - b);
    return {calls: Object.fromEntries(Object.entries(window.__perf.calls).map(([k, v]) => [k, `${v.n}× ${v.ms.toFixed(0)}ms (${(v.ms / v.n).toFixed(2)} each)`])), frames: f.length, p50: f[Math.floor(f.length * .5)]?.toFixed(1), p95: f[Math.floor(f.length * .95)]?.toFixed(1), max: f.at(-1)?.toFixed(1), over33: f.filter(x => x > 33).length, longTasksAt: JSON.stringify(window.__perf.longAt || []), penUpAt: window.__perf.upAt, strokes: inkItems(document.querySelector('.pagecard')).length}; });
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: 1});
  console.log(`CPU ${rate}x, ${N} pen moves in ${tMove} ms (${(tMove / N).toFixed(2)} ms each), pen-up to idle measured below`);
  console.log(JSON.stringify(out, null, 1));
  if (errors.length) console.log('ERRORS:', errors.join(' | ')); else console.log('no page errors');
  await browser.close();
})();

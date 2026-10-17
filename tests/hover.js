// Note handles show only for the note you point at (or tap), including on touchscreen laptops, in study mode and in focus mode
const {open} = require('./harness');
const path = require('path');
const OUT = path.join(__dirname, 'shots');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
// how many note handles you can see (opacity above zero, not hidden), per note
const shownGrips = p => p.$$eval('.notebox', bs => bs.map(b => [...b.querySelectorAll('.grip')].filter(g => {
  let o = 1; for (let n = g; n !== b; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
  const cs = getComputedStyle(g); return cs.display !== 'none' && cs.visibility !== 'hidden' && o > 0.05;
}).map(g => g.dataset.dir).sort().join(' ')));

(async () => {
  const {browser, page, context, errors} = await open(APP);
  const cdp = await context.newCDPSession(page);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);
  const strip = page.locator('.pagecard').nth(2).locator('.strip').first();
  await strip.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 160)); await page.waitForTimeout(300);
  for (const [f, t] of [[0.3, 'First note'], [0.55, 'Second note'], [0.8, 'Third note']]) {
    const b = await page.locator('.pagecard').nth(2).locator('.strip').last().boundingBox();
    await page.mouse.move(b.x + 200, b.y + b.height * f, {steps: 3}); await page.waitForTimeout(200);
    await page.click('.gappill'); await page.keyboard.type(t); await page.waitForTimeout(150);
  }
  await page.mouse.click(5, 700); await page.waitForTimeout(600);
  ok(await page.locator('.notebox').count() === 3, 'three notes');

  for (const [label, touch] of [['a mouse', false], ['a touchscreen laptop (the browser says it cannot hover)', true]]) {
    if (touch) { await cdp.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 5}); await page.waitForTimeout(200); }
    console.log(`    (${label}: the browser says hover:${await page.evaluate(() => matchMedia('(hover: none)').matches ? 'none' : 'hover')})`);
    await page.mouse.move(700, 880); await page.waitForTimeout(250);
    ok((await shownGrips(page)).every(s => !s), `${label}: no handles while you point elsewhere`);
    const n2 = page.locator('.notebox').nth(1);
    const r = await n2.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2, {steps: 3}); await page.waitForTimeout(250);
    const g = await shownGrips(page);
    ok(!g[0] && /move/.test(g[1]) && /se/.test(g[1]) && !g[2], `${label}: pointing at a note shows only its handles`);
    await page.mouse.click(r.x + 40, r.y + r.height / 2); await page.keyboard.type(' more'); await page.mouse.move(700, 880); await page.waitForTimeout(250);
    ok((await shownGrips(page)).every(s => !s), `${label}: typing in a note, the handles go when you point away`);
    await page.mouse.move(r.x + r.width - 2, r.y + 2, {steps: 3}); await page.waitForTimeout(250);
    ok(/min/.test((await shownGrips(page))[1]), `${label}: and come back when you point at it again`);
    await page.mouse.click(5, 700); await page.waitForTimeout(300);
  }
  await page.screenshot({path: path.join(OUT, 'hover-1-edit.png')});

  // study mode and focus mode: the minimise button only for the note you point at
  await page.click('#readBtn'); await page.waitForTimeout(300);
  await page.mouse.move(700, 880); await page.waitForTimeout(250);
  ok((await shownGrips(page)).every(s => !s), 'study mode: no minimise buttons while you point elsewhere');
  const n1 = await page.locator('.notebox').nth(0).boundingBox();
  await page.mouse.move(n1.x + n1.width / 2, n1.y + n1.height / 2, {steps: 3}); await page.waitForTimeout(250);
  const gs = await shownGrips(page);
  ok(gs[0] === 'min pin' && !gs[1] && !gs[2], 'study mode: pointing at a note shows only its minimise and pin buttons');
  await page.screenshot({path: path.join(OUT, 'hover-2-study.png')});
  await page.click('.notebox >> nth=0 >> .g-min'); await page.waitForTimeout(250);
  await page.mouse.move(700, 880); await page.waitForTimeout(250);
  ok(await page.locator('.notebox >> nth=0 >> .note-chip').isVisible(), 'a minimised note keeps its pencil icon, so it can be opened again');
  await page.click('#focusBtn'); await page.waitForTimeout(300);
  await page.mouse.move(700, 880); await page.waitForTimeout(250);
  ok((await shownGrips(page)).every(s => !s), 'focus mode: no handles while you point elsewhere');
  const n3 = await page.locator('.notebox').nth(2).boundingBox();
  await page.mouse.move(n3.x + n3.width / 2, n3.y + n3.height / 2, {steps: 3}); await page.waitForTimeout(250);
  ok((await shownGrips(page))[2] === 'min pin' && !(await shownGrips(page))[1], 'focus mode: pointing at a note shows only its minimise and pin buttons');
  await page.keyboard.press('Escape'); await page.click('#readBtn'); await page.waitForTimeout(300);

  // a phone or tablet: tapping a note shows its handles, tapping elsewhere hides them
  await page.mouse.move(700, 880); await page.waitForTimeout(250);
  const tap = (sel) => page.evaluate(s => { const el = document.querySelector(s); el.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerType: 'touch', isPrimary: true})); }, sel);
  ok((await shownGrips(page)).every(s => !s), 'touch only: no handles until you tap a note');
  await tap('.notebox:not(.collapsed) .mine'); await page.waitForTimeout(250);
  ok((await shownGrips(page)).filter(Boolean).length === 1, 'touch only: tapping a note shows its handles');
  ok(await page.$eval('.notebox.touched .g-min', g => g.getBoundingClientRect().width >= 32) && await page.$eval('.notebox.touched > .g-move', g => g.getBoundingClientRect().height >= 30), 'touch only: handles are big enough for a finger');
  await tap('#statusbar'); await page.waitForTimeout(250);
  ok((await shownGrips(page)).every(s => !s), 'touch only: tapping elsewhere hides them');
  ok(!(await page.evaluate(() => currentDoc())).includes('touched'), 'which note was tapped is not saved');

  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

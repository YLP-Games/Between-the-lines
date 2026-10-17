// A slide and its notes scale as one: note positions (as fractions of their card) stay put whatever the window width,
// sidebar, Notes list or side pages; no two notes meet that did not before; ink stays on the page.
const {setup} = require('./scalelib');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const TOL = 0.005;

// every visible note as fractions of its card (slide or side page), the ink of each card, and which notes touch
const measure = page => page.evaluate(() => {
  const cards = [...main.querySelectorAll('.slide, .sidepage')];
  const boxes = [...main.querySelectorAll('.notebox')].filter(b => !b.classList.contains('collapsed') && b.getBoundingClientRect().width);
  const notes = boxes.map((b, i) => {
    const c = b.closest('.slide, .sidepage'), cr = c.getBoundingClientRect(), r = b.getBoundingClientRect();
    return {id: b.dataset.t || (c.classList.contains('sidepage') ? 'S' : 'N') + cards.indexOf(c) + '-' + [...c.querySelectorAll('.notebox')].indexOf(b), side: c.classList.contains('sidepage'), c: cards.indexOf(c),
      x: (r.left - cr.left) / cr.width, y: (r.top - cr.top) / (c.classList.contains('sidepage') ? cr.width : cr.height), w: r.width / cr.width, h: r.height / (c.classList.contains('sidepage') ? cr.width : cr.height), r};   // (a side page is as tall as its slide beside it, and only as tall as its notes below it: its notes are measured against its width)
  });
  const touch = [];
  for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) {
    const a = notes[i].r, b = notes[j].r;
    if (notes[i].c === notes[j].c && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) touch.push(notes[i].id + '|' + notes[j].id);
  }
  // the pen stroke on page 2: one box round every piece of it (it passes through several strips)
  const ink = []; { const c = document.querySelectorAll('.pagecard')[1].getBoundingClientRect(); let u = null;
    for (const p of document.querySelectorAll('.pagecard')[1].querySelectorAll('svg.ink path')) { const r = p.getBoundingClientRect(); if (!r.width && !r.height) continue; u = u ? {l: Math.min(u.l, r.left), t: Math.min(u.t, r.top), r: Math.max(u.r, r.right), b: Math.max(u.b, r.bottom)} : {l: r.left, t: r.top, r: r.right, b: r.bottom}; }
    if (u) ink.push({x: (u.l - c.left) / c.width, y: (u.t - c.top) / c.height, w: (u.r - u.l) / c.width, h: (u.b - u.t) / c.height}); }
  const card = document.querySelectorAll('.pagecard')[1];
  return {notes: notes.map(({r, ...n}) => n), touch, ink, cardW: card.offsetWidth, z: viewZoom, vw: innerWidth, room: main.getBoundingClientRect().width};
});

(async () => {
  const {browser, page, errors} = await setup(APP, {width: 1600, pages: [1]});
  // a sticky note on page 2, and a pen stroke
  await page.click('#tab-insert'); await page.click('#stickyBtn'); await page.waitForTimeout(400);
  await page.keyboard.type('Sticky: check the axes'); await page.mouse.click(5, 700); await page.waitForTimeout(500);
  await page.evaluate(() => { const c = document.querySelectorAll('.pagecard')[1]; setInk(c, [{k: 'pen', c: '#d33', w: 3, p: [[60, 80], [200, 120], [320, 90], [440, 160]]}]); renderInk(c); });
  // turn side notes on and write one on page 2's side page
  await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(700);
  const sp = await page.locator('.sidepage').nth(1).boundingBox();
  await page.locator('.pagecard').nth(1).scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const sp2 = await page.locator('.sidepage').nth(1).boundingBox();
  await page.mouse.click(sp2.x + 40, sp2.y + 100); await page.waitForTimeout(250);
  await page.keyboard.type('A side note with a few words, enough to wrap onto a second line.'); await page.mouse.click(5, 700); await page.waitForTimeout(600);

  const set = async (W, pages, notes, sideOn) => {
    await page.setViewportSize({width: W, height: 900}); await page.waitForTimeout(150);
    await page.evaluate(([p, n]) => { setPanel('pages', p); setPanel('notes', n); }, [pages, notes]);
    const on = await page.evaluate(() => side.on);
    if (on !== sideOn) { await page.click('#tab-view'); await page.click('#sideBtn'); }
    await page.waitForTimeout(1100);
    await page.evaluate(() => { document.querySelectorAll('.pagecard')[1].scrollIntoView({block: 'start'}); });
    await page.waitForTimeout(250);
    return measure(page);
  };
  const states = [];
  for (const W of [1600, 1280, 1024]) for (const pages of [false, true]) for (const notes of [false, true]) for (const sideOn of [false, true]) states.push([W, pages, notes, sideOn]);
  const ref = await set(1600, false, false, false);
  const docRef = await page.evaluate(() => currentDoc());
  const refSide = await set(1600, false, false, true);
  const slideIds = ref.notes.filter(n => !n.side).map(n => n.id);
  ok(slideIds.length >= 4, 'the slide has its notes to check: ' + ref.notes.filter(n => !n.side).map(n => n.id).join(', ') + '; side notes: ' + refSide.notes.filter(n => n.side).length);
  ok(ref.notes.some(n => n.h > .15) && ref.notes.some(n => n.x > .5), 'including a tall multi-line note and a floating note over on the right');
  ok(refSide.notes.some(n => n.side), 'and a side note');
  ok(ref.ink.length === 1, 'and a pen stroke');
  let worst = 0, bad = null, badTouch = null;
  const keys = ['x', 'y', 'w', 'h'];
  for (const st of states) {
    const m = await set(...st), label = `${st[0]}px, sidebar ${st[1] ? 'open' : 'closed'}, Notes ${st[2] ? 'open' : 'closed'}, side notes ${st[3] ? 'on' : 'off'}`;
    const base = st[3] ? refSide : ref;
    let d = 0;
    for (const n of base.notes) {
      const k = m.notes.find(x => x.id === n.id);
      if (!k) { d = 9; bad = bad || label + ': ' + n.id + ' missing'; continue; }
      for (const a of keys) { const e = Math.abs(k[a] - n[a]); if (e > d) d = e; if (e > TOL) { console.log(`      ! ${n.id} ${a} ${n[a].toFixed(4)} -> ${k[a].toFixed(4)}`); if (!bad) bad = `${label}: ${n.id} ${a} ${n[a].toFixed(4)} -> ${k[a].toFixed(4)}`; } }
    }
    for (const a of ref.ink) { const k = m.ink[0]; if (!k) { d = 9; bad = bad || label + ': ink missing'; break; } for (const q of keys) { const e = Math.abs(k[q] - ref.ink[0][q]); if (e > d) d = e; if (e > TOL && !bad) bad = `${label}: ink ${q} ${ref.ink[0][q].toFixed(4)} -> ${k[q].toFixed(4)}`; } }
    const newTouch = m.touch.filter(t => !base.touch.includes(t));
    if (newTouch.length && !badTouch) badTouch = `${label}: notes now overlap: ${newTouch.join(', ')}`;
    if (m.z < 1 && Math.abs(m.cardW - 960) > 4 && m.room >= 500) bad = bad || `${label}: the card is ${m.cardW}px wide, not 960`;
    worst = Math.max(worst, d);
    console.log(`    ${label}: scale ${m.z.toFixed(2)}, card ${m.cardW}px, worst shift ${(d * 100).toFixed(2)}%, overlaps ${m.touch.length}/${base.touch.length}`);
    if (st[0] === 1600 && st[1] && !st[2] && st[3]) await page.screenshot({path: path.join(OUT, 'fix-after-layoutscale-1600.png')});
    if (st[0] === 1280 && st[1] && !st[2] && st[3]) await page.screenshot({path: path.join(OUT, 'fix-after-layoutscale-1280.png')});
  }
  ok(!bad, 'every note and the ink keep their place within ' + TOL * 100 + '% of the card in all ' + states.length + ' states (worst ' + (worst * 100).toFixed(2) + '%)' + (bad ? ': ' + bad : ''));
  ok(!badTouch, 'and no two notes meet that did not before' + (badTouch ? ': ' + badTouch : ''));
  // nothing is rewritten because the window changed: the saved notebook is the same text at a narrow width with every panel open
  await set(1024, true, true, false);
  const docNarrow = await page.evaluate(() => currentDoc());
  const num = t => t.replace(/(top|left|min-height): -?[\d.]+(px|%);/g, '').replace(/-?\d+\.\d+/g, m => (+m).toFixed(1));       // (where a floating note is drawn is worked out again each time, to a fraction of a pixel; what it is saved with, data-px and data-py, must not move)
  if (num(docNarrow) !== num(docRef)) { const a = num(docRef), b = num(docNarrow); let k = 0; while (a[k] === b[k]) k++; console.log('  differs at ' + k + ': ' + a.slice(k - 80, k + 80) + '\n  vs: ' + b.slice(k - 80, k + 80)); }
  ok(num(docNarrow) === num(docRef), 'the saved notebook is unchanged by the window size and panels (' + docRef.length + ' characters)');
  await set(1600, false, false, false);

  // ---- the printed layouts too: A4 and A3, with and without their side pages ----
  for (const lay of ['a4-portrait', 'a3-landscape']) {
    await page.click('#tab-view'); await page.selectOption('#layout', lay); await page.waitForTimeout(900);
    const aRef = await set(1600, false, false, false), aSide = await set(1600, false, false, true);
    ok(aRef.notes.filter(n => !n.side).length >= 4 && aSide.notes.some(n => n.side), lay + ': the notes are there, and the side note');
    let abad = null, aworst = 0;
    for (const st of states.filter(s => s[0] !== 1600 || s[1] || s[2])) {
      const m = await set(...st), base = st[3] ? aSide : aRef, label = `${lay} ${st[0]}px, sidebar ${st[1] ? 'open' : 'closed'}, Notes ${st[2] ? 'open' : 'closed'}, side notes ${st[3] ? 'on' : 'off'}`;
      let d = 0;
      if (m.z < .4) { console.log(`    ${label}: scale ${m.z.toFixed(2)}, too small to compare (skipped)`); continue; }
      for (const n of base.notes) { const k = m.notes.find(x => x.id === n.id); if (!k) { d = 9; abad = abad || label + ': ' + n.id + ' missing'; continue; } for (const a of keys) { const e = Math.abs(k[a] - n[a]); d = Math.max(d, e); if (e > TOL && !abad) abad = `${label}: ${n.id} ${a} ${n[a].toFixed(4)} -> ${k[a].toFixed(4)}`; } }
      const nt = m.touch.filter(t => !base.touch.includes(t)); if (nt.length && !abad) abad = `${label}: notes now overlap: ${nt.join(', ')}`;
      aworst = Math.max(aworst, d);
      console.log(`    ${label}: scale ${m.z.toFixed(2)}, worst shift ${(d * 100).toFixed(2)}%`);
      if (lay === 'a4-portrait' && st[0] === 1600 && st[1] && !st[2] && st[3]) await page.screenshot({path: path.join(OUT, 'fix-after-a4-side.png')});
    }
    ok(!abad, lay + ': notes keep their place in every state (worst ' + (aworst * 100).toFixed(2) + '%)' + (abad ? ': ' + abad : ''));
  }
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

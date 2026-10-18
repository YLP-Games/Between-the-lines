// Side notes while scrolling: the link lines stay on their highlights and notes in the very same task as the scroll (not a frame later)
const {open} = require('./harness');
const path = require('path');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);
  await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(500);

  // two highlights on page 3 and one on page 4, each linked to a note on its side page
  const wordsAt = async (i, txt) => {
    const get = () => page.evaluate(([i, txt]) => {
      const sp = [...document.querySelectorAll('.pagecard')[i].querySelectorAll('.tl')].find(s => s.textContent.includes(txt));
      sp.scrollIntoView({block: 'center'});
      const r = sp.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height};
    }, [i, txt]);
    await get(); await page.waitForTimeout(200); return get();
  };
  const link = async (i, txt) => {
    const b = await wordsAt(i, txt);
    await page.mouse.move(b.x + b.w * 0.5, b.y + b.h / 2); await page.mouse.down(); await page.mouse.move(b.x + b.w * 0.98, b.y + b.h / 2, {steps: 8}); await page.mouse.up();
    await page.waitForTimeout(250);
    await page.click('#annoBar [data-side]'); await page.waitForTimeout(400);
    await page.keyboard.type('note on ' + txt); await page.mouse.click(5, 700); await page.waitForTimeout(500);
  };
  await link(2, 'economic profit'); await link(2, 'identical products'); await link(3, 'Below minimum');
  const nLinks = await page.evaluate(() => document.querySelectorAll('.sidepage .notebox[data-link]').length);
  ok(nLinks === 3, 'three notes linked to highlights (' + nLinks + ')');
  await page.mouse.move(5, 650);

  // where every line starts and ends on screen, against where its highlight and note are: the largest miss in pixels
  await page.evaluate(() => {
    const pt = (path, x, y) => { const svg = path.ownerSVGElement, p = svg.createSVGPoint(); p.x = x; p.y = y; const q = p.matrixTransform(path.getScreenCTM()); return [q.x, q.y]; };
    window.lineMiss = () => {
      const svg = document.querySelector('svg.sidelines'); let worst = 0, n = 0;
      if (!svg || svg.hidden) return {worst: 1e9, n: 0};
      for (const box of document.querySelectorAll('.sidepage .notebox[data-link]')) {
        const id = box.dataset.link, path = svg.querySelector(`path.sl[data-id="${id}"]`); if (!path) return {worst: 1e9, n};
        const card = sideSlide(box.closest('.sidepage')), m = markRect(card, id), b = box.getBoundingClientRect();
        const v = path.getAttribute('d').match(/-?[\d.]+/g).map(Number), s = pt(path, v[0], v[1]), e = pt(path, v[v.length - 2], v[v.length - 1]);
        const want = [m.right, m.top + m.height / 2, b.left, b.top + Math.min(18, b.height / 2)];
        worst = Math.max(worst, Math.abs(s[0] - want[0]), Math.abs(s[1] - want[1]), Math.abs(e[0] - want[2]), Math.abs(e[1] - want[3])); n++;
      }
      return {worst, n};
    };
    // how often the lines are drawn again
    window.redraws = 0; new MutationObserver(r => { window.redraws += r.length; }).observe(document.querySelector('svg.sidelines'), {childList: true});
  });
  const miss0 = await page.evaluate(() => lineMiss());
  ok(miss0.n === 3 && miss0.worst < 1.5, 'to begin with, three lines meet their highlights and notes (' + miss0.worst.toFixed(2) + 'px off)');

  // ---- sync scrolling on: everything is one page that scrolls ----
  const one = await page.evaluate(() => {
    const scroller = el => { for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) { const o = getComputedStyle(n).overflowY; if (o !== 'visible' && o !== 'clip') return n; } return document.scrollingElement; };
    const els = [...document.querySelectorAll('.slide, .sidepage')], set = new Set(els.map(scroller));
    return {n: els.length, same: set.size === 1 && set.has(document.scrollingElement), col: !!document.querySelector('.sidecol'), nested: [...document.querySelectorAll('main, .workspace')].map(e => getComputedStyle(e).overflowY)};
  });
  ok(one.n === 12 && one.same && !one.col && one.nested.every(o => o === 'visible'), 'with Sync scrolling on the slides and the side pages share one scroll container: the window');
  const tops = await page.evaluate(async () => {
    const out = [], c = document.querySelectorAll('.pagecard')[2], s = document.querySelectorAll('.sidepage')[2], gap = () => s.getBoundingClientRect().top - c.getBoundingClientRect().top;
    const g0 = gap(); for (const d of [13, 250, 77, 420, -300]) { scrollBy(0, d); out.push(gap() - g0); }
    return out;
  });
  ok(tops.every(d => Math.abs(d) < .01), 'a slide and its side page never move apart by even a pixel when scrolled');

  // right after scrollBy, before any frame: lines still on the highlights and notes
  await page.evaluate(() => { const c = document.querySelectorAll('.pagecard')[2]; scrollTo(0, scrollY + c.getBoundingClientRect().top - 150); });
  await page.waitForTimeout(400);
  const r0 = await page.evaluate(() => window.redraws);
  const steps = [3, 17, 61, 140, 333, -90, -420, 25, 800, -800, 1];
  const misses = [];
  for (const d of steps) misses.push(await page.evaluate(d => { scrollBy(0, d); const a = lineMiss(); return {d, ...a}; }, d));
  for (const m of misses) ok(m.n === 3 && m.worst < 2, `scrolled ${m.d}px: the lines are still on their words and notes at once (${m.worst.toFixed(2)}px off)`);
  const bursts = await page.evaluate(() => { const o = []; for (let i = 0; i < 40; i++) { scrollBy(0, 9 + i * 3); o.push(lineMiss().worst); } return Math.max(...o); });
  ok(bursts < 2, 'and through 40 small scrolls in a row (' + bursts.toFixed(2) + 'px at worst)');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => window.redraws) === r0, 'the lines are not drawn again for scrolling: they sit on the page and move with it');
  // real wheel scrolling too
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(40); }
  await page.waitForTimeout(400);
  const mw = await page.evaluate(() => lineMiss());
  ok(mw.n === 3 && mw.worst < 1.5 && await page.evaluate(() => window.redraws) === r0, 'after wheel scrolling they are in place too (' + mw.worst.toFixed(2) + 'px)');
  ok(await page.evaluate(() => { const s = document.querySelector('svg.sidelines'); return !document.getElementById('main').contains(s) && getComputedStyle(s).pointerEvents === 'none'; }), 'the overlay is not part of the notebook, and lets clicks through');

  // a layout change still moves them: a window of another width
  for (const [w, h] of [[1100, 800], [820, 800], [1440, 900]]) {
    await page.setViewportSize({width: w, height: h}); await page.waitForTimeout(900);
    await page.evaluate(() => { const c = document.querySelectorAll('.pagecard')[2]; scrollTo(0, scrollY + c.getBoundingClientRect().top - 150); }); await page.waitForTimeout(300);
    const z = await page.evaluate(() => document.getElementById('main').style.zoom || '1');
    const r = await page.evaluate(() => { scrollBy(0, 41); const a = lineMiss(); scrollBy(0, -170); return {...a, b: lineMiss().worst}; });
    ok(r.n === 3 && r.worst < 2 && r.b < 2, `${w}px wide (zoom ${z}${await page.evaluate(() => document.getElementById('main').classList.contains('side-stack')) ? ', side pages below' : ''}): the lines are in place straight after scrolling (${r.worst.toFixed(2)}, ${r.b.toFixed(2)}px)`);
  }

  // a note moved or written in: the line follows
  const nb = page.locator('.sidepage').nth(2).locator('.notebox').first();
  await nb.hover(); const gm = await nb.locator('.g-move').boundingBox();
  await page.mouse.move(gm.x + gm.width / 2, gm.y + gm.height / 2); await page.mouse.down(); await page.mouse.move(gm.x + gm.width / 2 + 30, gm.y + gm.height / 2 + 70, {steps: 6}); await page.mouse.up(); await page.waitForTimeout(500);
  ok((await page.evaluate(() => lineMiss())).worst < 2, 'a note dragged to another place: its line follows it');
  await page.evaluate(() => { const m = document.querySelectorAll('.sidepage')[2].querySelector('.notebox .mine'); m.focus(); getSelection().selectAllChildren(m); getSelection().collapseToEnd(); });
  await page.keyboard.type(' and some more words that make the note wrap over a few lines so that it grows quite tall indeed'); await page.waitForTimeout(500);
  ok((await page.evaluate(() => lineMiss())).worst < 2, 'a note written in: its line is still on it');
  await page.mouse.click(5, 700); await page.waitForTimeout(600);

  // ---- sync scrolling off: a column of its own ----
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(200);
  await page.click('#tab-view'); await page.click('#sideSync'); await page.waitForTimeout(700);
  ok(await page.evaluate(() => document.getElementById('main').classList.contains('side-split') && !!document.querySelector('.sidecol')), 'Sync scrolling off: the side pages are in a column of their own');
  await page.evaluate(() => { const c = document.querySelectorAll('.pagecard')[2]; scrollTo(0, scrollY + c.getBoundingClientRect().top - 150); }); await page.waitForTimeout(400);
  await page.evaluate(() => { const col = document.querySelector('.sidecol'), b = document.querySelectorAll('.sidepage')[2].querySelector('.notebox'); col.scrollTop += b.getBoundingClientRect().top - col.getBoundingClientRect().top - 150; }); await page.waitForTimeout(400);
  const sp0 = await page.evaluate(() => ({m: lineMiss(), y: scrollY, c: document.querySelector('.sidecol').scrollTop, vis: document.querySelectorAll('svg.sidelines path.sl').length}));
  ok(sp0.vis >= 1, 'the lines run from the slides to the column (' + sp0.vis + ' in view)');
  // the lines of notes in the column that are in view must meet their words and notes
  const inView = () => page.evaluate(() => {
    const svg = document.querySelector('svg.sidelines'), col = document.querySelector('.sidecol').getBoundingClientRect(); let worst = 0, n = 0;
    for (const path of svg.querySelectorAll('path.sl')) {
      const id = path.dataset.id, box = document.querySelector(`.sidepage .notebox[data-link="${id}"]`), card = sideSlide(box.closest('.sidepage')), m = markRect(card, id), b = box.getBoundingClientRect();
      const q = svg.createSVGPoint(), pt = (x, y) => { q.x = x; q.y = y; const r = q.matrixTransform(path.getScreenCTM()); return [r.x, r.y]; };
      const v = path.getAttribute('d').match(/-?[\d.]+/g).map(Number), s = pt(v[0], v[1]), e = pt(v[v.length - 2], v[v.length - 1]);
      worst = Math.max(worst, Math.abs(s[0] - m.right), Math.abs(s[1] - (m.top + m.height / 2)), Math.abs(e[0] - b.left), Math.abs(e[1] - (b.top + Math.min(18, b.height / 2)))); n++;
    }
    return {worst, n, y: scrollY, c: document.querySelector('.sidecol').scrollTop};
  });
  const a = await inView();
  ok(a.n >= 1 && a.worst < 2, 'in the column the lines meet their highlights and notes (' + a.n + ' lines, ' + a.worst.toFixed(2) + 'px off)');
  // the column's own scroll: the lines are right in the scroll event itself
  const colScroll = await page.evaluate(() => new Promise(res => {
    const col = document.querySelector('.sidecol'), out = [];
    const check = () => {
      const svg = document.querySelector('svg.sidelines'); let worst = 0, n = 0;
      for (const path of svg.querySelectorAll('path.sl')) {
        const id = path.dataset.id, box = document.querySelector(`.sidepage .notebox[data-link="${id}"]`), b = box.getBoundingClientRect();
        const q = svg.createSVGPoint(); const v = path.getAttribute('d').match(/-?[\d.]+/g).map(Number); q.x = v[v.length - 2]; q.y = v[v.length - 1]; const e = q.matrixTransform(path.getScreenCTM());
        worst = Math.max(worst, Math.abs(e.x - b.left), Math.abs(e.y - (b.top + Math.min(18, b.height / 2)))); n++;
      }
      out.push({worst, n, y: scrollY});
    };
    let k = 0; const steps = [20, 15, 25, -10, 30, -60];
    col.addEventListener('scroll', () => { check(); if (++k < steps.length) col.scrollTop += steps[k]; else res(out); });
    col.scrollTop += steps[0];
  }));
  ok(colScroll.length === 6 && colScroll.every(c => c.worst < 2 && c.n >= 1), 'scrolling the column: the lines are on the notes within the scroll event itself (' + colScroll.map(c => c.worst.toFixed(1)).join(', ') + 'px)');
  ok(colScroll.every(c => c.y === a.y), 'and the slides do not move when the column does');
  const winScroll = await page.evaluate(() => new Promise(res => {
    const out = [], col = document.querySelector('.sidecol'), c0 = col.scrollTop;
    const check = () => {
      const svg = document.querySelector('svg.sidelines'); let worst = 0, n = 0;
      for (const path of svg.querySelectorAll('path.sl')) {
        const id = path.dataset.id, box = document.querySelector(`.sidepage .notebox[data-link="${id}"]`), m = markRect(sideSlide(box.closest('.sidepage')), id);
        const q = svg.createSVGPoint(); const v = path.getAttribute('d').match(/-?[\d.]+/g).map(Number); q.x = v[0]; q.y = v[1]; const s = q.matrixTransform(path.getScreenCTM());
        worst = Math.max(worst, Math.abs(s.x - m.right), Math.abs(s.y - (m.top + m.height / 2))); n++;
      }
      out.push({worst, n, c: col.scrollTop - c0});
    };
    let k = 0; const steps = [30, 70, -20, 110, -150, 15];
    document.addEventListener('scroll', () => { check(); if (++k < steps.length) scrollBy(0, steps[k]); else res(out); });
    scrollBy(0, steps[0]);
  }));
  ok(winScroll.length === 6 && winScroll.every(c => c.worst < 2 && c.n >= 1), 'scrolling the slides: the lines are on the highlights within the scroll event itself (' + winScroll.map(c => c.worst.toFixed(1)).join(', ') + 'px)');
  ok(winScroll.every(c => c.c === 0), 'and the column stays where it is');
  await page.waitForTimeout(600);
  const settle = await page.evaluate(async () => { const n0 = performance.now(); let k = 0; const f = () => { k++; }; addEventListener('scroll', f, true); await new Promise(r => setTimeout(r, 500)); removeEventListener('scroll', f, true); return k; });
  ok(settle === 0, 'no scrolling goes on by itself afterwards (no echo between the column and the slides)');

  // sync on again
  await page.click('#sideSync'); await page.waitForTimeout(700);
  ok(await page.evaluate(() => !document.getElementById('main').classList.contains('side-split') && !document.querySelector('.sidecol')), 'Sync scrolling on again: one page');
  await page.evaluate(() => { const c = document.querySelectorAll('.pagecard')[2]; scrollTo(0, scrollY + c.getBoundingClientRect().top - 150); }); await page.waitForTimeout(400);
  const back = await page.evaluate(() => { scrollBy(0, 55); return lineMiss(); });
  ok(back.n === 3 && back.worst < 2, 'and the lines are in place straight after scrolling (' + back.worst.toFixed(2) + 'px)');

  // the lines can be turned off and stay off while scrolling
  await page.click('#tab-view'); await page.click('#sideLinks'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => { scrollBy(0, 30); return document.querySelectorAll('svg.sidelines path').length === 0; }), 'Link lines off: none are drawn');
  await page.click('#sideLinks'); await page.waitForTimeout(300);
  ok((await page.evaluate(() => lineMiss())).n === 3, 'and on again they are back');

  await page.waitForTimeout(300);
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(errors.length ? errors.join('\n') : 'no page errors');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

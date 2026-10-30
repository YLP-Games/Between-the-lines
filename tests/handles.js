// A note's handles are easy to find and to catch with a mouse: every edge, corner and the move handle has a catching area of 16px or more,
// pointing just outside an edge shows the resize cursor, lights up that edge and drags it, the handles are clear of the words (a click there types),
// they are hidden and take no clicks while you point elsewhere, and they stand out from the page in light and dark (and on dark side paper)
const {open} = require('./harness');
const path = require('path');
const OUT = path.join(__dirname, 'shots');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
// contrast of two colours (WCAG), from "rgb(...)" strings
const rgb = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + .05) / (y + .05); };

// the colours a note's handles show in, against the paper under the note
const colours = nb => nb.evaluate(b => {
  const cs = (el, p) => getComputedStyle(el, p), paperOf = el => { for (let n = el.parentElement; n; n = n.parentElement) { const c = cs(n).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
  const bar = cs(b.querySelector(':scope > .g-e'), '::after'), mv = b.querySelector(':scope > .g-move'), m = cs(mv);
  return {paper: b.closest('.sidepage') ? cs(b.closest('.sidepage')).backgroundColor : 'rgb(255, 255, 255)', ring: (cs(b.querySelector(':scope > .mine')).boxShadow.match(/rgba?\([^)]+\)/) || [''])[0],
    barFill: bar.backgroundColor, barLine: bar.borderTopColor, moveBg: m.backgroundColor, moveLine: m.borderTopColor, moveIcon: m.color, paperBehindMove: paperOf(b),
    corner: cs(b.querySelector(':scope > .g-se')).color};
});
const checkColours = (c, label) => {
  ok(contrast(c.ring, c.paper) >= 3, `${label}: the outline of the note you point at stands out from the paper (${contrast(c.ring, c.paper).toFixed(1)}:1)`);
  const bar = Math.max(contrast(c.barLine, c.paper), contrast(c.barFill, c.paper));
  ok(bar >= 3, `${label}: so do its edge bars (${bar.toFixed(1)}:1)`);
  ok(contrast(c.corner, c.paper) >= 3, `${label}: and its corner mark (${contrast(c.corner, c.paper).toFixed(1)}:1)`);
  const mv = Math.max(contrast(c.moveLine, c.paperBehindMove), contrast(c.moveBg, c.paperBehindMove));
  ok(mv >= 3 && contrast(c.moveIcon, c.moveBg) >= 4.5, `${label}: the move handle stands out from the page (${mv.toFixed(1)}:1) and its dots from the handle (${contrast(c.moveIcon, c.moveBg).toFixed(1)}:1)`);
};

(async () => {
  for (const scheme of ['light', 'dark']) {
    const {browser, page, errors} = await open(APP, {colorScheme: scheme});
    await page.waitForTimeout(500);
    await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
    await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(800);
    const strip = page.locator('.pagecard').nth(2).locator('.strip').last();
    await strip.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 160)); await page.waitForTimeout(300);
    let b = await strip.boundingBox();
    await page.mouse.move(b.x + 200, b.y + b.height * 0.5, {steps: 3}); await page.waitForTimeout(200);
    await page.click('.gappill'); await page.keyboard.type('Handles you can find'); await page.waitForTimeout(150);
    await page.mouse.click(5, 700); await page.waitForTimeout(600);
    const nb = page.locator('.pagecard .notebox').first();
    await nb.evaluate(n => n.scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(200);
    const R = () => nb.evaluate(n => { const r = n.getBoundingClientRect(); return {l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height}; });
    const away = () => page.mouse.move(700, 880, {steps: 2}).then(() => page.waitForTimeout(300));
    const at = (x, y) => page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y), g = e?.closest('.grip, .nbar'); return {dir: g?.dataset.dir || (g ? 'nbar' : ''), cursor: e ? getComputedStyle(e).cursor : '', mine: !!e?.closest('.mine')}; }, [x, y]);

    if (scheme === 'light') {
      // ---- pointing elsewhere: every handle is clear and takes no clicks ----
      await away();
      const hidden = await nb.evaluate(n => [...n.querySelectorAll(':scope > .grip')].map(g => {
        const r = g.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {o: +getComputedStyle(g).opacity, pe: getComputedStyle(g).pointerEvents, caught: !!e && (e === g || g.contains(e))};
      }));
      ok(hidden.length >= 9 && hidden.every(h => h.o === 0 && h.pe === 'none' && !h.caught), `pointing elsewhere, the ${hidden.length} handles are hidden and take no clicks`);
      let r = await R();
      ok((await at(r.r + 7, r.t + r.h / 2)).dir === '', 'and 7px outside the right edge is still the page');

      // ---- pointing at the note ----
      await page.mouse.move(r.l + r.w / 2, r.t + r.h / 2, {steps: 3}); await page.waitForTimeout(300);
      const size = await nb.evaluate(n => Object.fromEntries([...n.querySelectorAll(':scope > .grip')].map(g => { const q = g.getBoundingClientRect(); return [g.dataset.dir, [Math.round(q.width), Math.round(q.height)]]; })));
      ok(['e', 'w'].every(d => size[d][0] >= 16 && size[d][1] >= r.h - 1), `the left and right edges catch the pointer 16px wide or more, all along them (${size.e} ${size.w})`);
      ok(['n', 's'].every(d => size[d][1] >= 16 && size[d][0] >= r.w - 1), `the top and bottom edges 16px tall or more, all along them (${size.n} ${size.s})`);
      ok(['nw', 'ne', 'sw', 'se'].every(d => Math.min(...size[d]) >= 16), `every corner 16px or more (${['nw', 'ne', 'sw', 'se'].map(d => d + ':' + size[d].join('x')).join(' ')})`);
      ok(Math.min(...size.move) >= 16 && size.move[1] >= 24, `and the move handle ${size.move.join('x')}px`);
      const shown = await nb.evaluate(n => [...n.querySelectorAll(':scope > .grip')].every(g => +getComputedStyle(g).opacity === 1 && getComputedStyle(g).pointerEvents === 'auto'));
      ok(shown, 'they all show and take the pointer');
      const mv = await nb.locator(':scope > .g-move').evaluate(g => ({bg: getComputedStyle(g).backgroundColor, bd: parseFloat(getComputedStyle(g).borderTopWidth)}));
      ok(!/rgba\(0, 0, 0, 0\)/.test(mv.bg) && mv.bd >= 1, 'the move handle is a visible button, not just faint dots (' + mv.bg + ')');
      const nbar = await nb.locator(':scope > .nbar').boundingBox(), ne = await nb.locator(':scope > .g-ne').boundingBox(), mvb = await nb.locator(':scope > .g-move').boundingBox();
      ok(nbar.x + nbar.width <= ne.x + 1, 'the toolbar does not cover the top right corner handle');
      ok(mvb.x + mvb.width <= r.l - 2, 'the move handle sits outside the note, clear of the left edge bar');

      // ---- just outside an edge: the edge lights up, dragging resizes, and every edge and corner shows its resize cursor ----
      const lit = async (dir, x, y) => { await page.mouse.move(x, y, {steps: 3}); await page.waitForTimeout(250); return nb.locator(':scope > .g-' + dir).evaluate(g => ({after: getComputedStyle(g, '::after').backgroundColor, line: getComputedStyle(g).backgroundImage})); };
      const before = await nb.locator(':scope > .g-e').evaluate(g => getComputedStyle(g, '::after').backgroundColor);
      const on = await lit('e', r.r + 7, r.t + r.h / 2);
      ok(on.after !== before && /gradient/.test(on.line), `pointing by the right edge lights its bar (${before} to ${on.after}) and draws a line all along the edge`);
      await page.screenshot({path: path.join(OUT, 'handles-1-edge.png'), clip: {x: r.l - 60, y: r.t - 50, width: r.w + 120, height: r.h + 100}});
      await page.mouse.down(); await page.mouse.move(r.r + 7 - 80, r.t + r.h / 2, {steps: 6}); await page.mouse.up(); await page.waitForTimeout(300);
      let r2 = await R();
      ok(Math.abs(r2.w - (r.w - 80)) < 6 && Math.abs(r2.l - r.l) < 1, `dragging from 7px outside the right edge resizes it (${Math.round(r.w)} to ${Math.round(r2.w)} px wide)`);
      r = r2;
      await page.mouse.move(r.l + r.w * .4, r.b + 8, {steps: 3}); await page.waitForTimeout(250);
      await page.mouse.down(); await page.mouse.move(r.l + r.w * .4, r.b + 8 + 40, {steps: 6}); await page.mouse.up(); await page.waitForTimeout(300);
      r2 = await R();
      ok(Math.abs(r2.h - (r.h + 40)) < 6 && Math.abs(r2.t - r.t) < 1, `and from 8px below the bottom edge (${Math.round(r.h)} to ${Math.round(r2.h)} px tall)`);
      r = r2;
      await page.mouse.move(r.l + r.w / 2, r.t + r.h / 2, {steps: 3}); await page.waitForTimeout(250);
      // (the left edge is probed below the move handle, which sits on top of it by the first line)
      for (const [dir, x, y, cur] of [['e', r.r + 7, r.t + r.h / 2 + 3, 'ew-resize'], ['e', r.r + 6, r.t + 8, 'ew-resize'], ['s', r.l + r.w * .3, r.b + 7, 'ns-resize'], ['n', r.l + r.w * .3, r.t - 7, 'ns-resize'],
        ['w', r.l - 7, r.t + r.h * .7, 'ew-resize'], ['w', r.l - 2, r.t + 16, 'ew-resize'], ['move', r.l - 12, r.t + 16, 'grab'],
        ['nw', r.l - 8, r.t - 8, 'nwse-resize'], ['ne', r.r + 8, r.t - 8, 'nesw-resize'], ['sw', r.l - 8, r.b + 8, 'nesw-resize'], ['se', r.r + 6, r.b + 6, 'nwse-resize']]) {
        const a = await at(x, y);
        ok(a.dir === dir && a.cursor === cur, `${Math.round(x - r.l)},${Math.round(y - r.t)} from the note's top left corner catches the ${dir} handle, with the ${cur} cursor (${a.dir}, ${a.cursor})`);
      }
      await nb.locator(':scope > .g-e').dblclick(); await page.waitForTimeout(300);
      r2 = await R();
      ok(r2.w < r.w - 40, `double-clicking an edge still fits the box to its words (${Math.round(r.w)} to ${Math.round(r2.w)} px)`);
      r = r2;

      // ---- the words: no handle sits over them, and a click there types ----
      await page.mouse.move(r.l + r.w / 2, r.t + r.h / 2, {steps: 3}); await page.waitForTimeout(250);
      const over = await nb.evaluate(n => {
        const m = n.querySelector('.mine'), cs = getComputedStyle(m), q = m.getBoundingClientRect(), bad = [];
        const L = q.left + parseFloat(cs.paddingLeft), T = q.top + parseFloat(cs.paddingTop), Rt = q.right - parseFloat(cs.paddingRight), B = q.bottom - parseFloat(cs.paddingBottom);
        for (let x = L; x <= Rt; x += 4) for (let y = T; y <= B; y += 3) { const e = document.elementFromPoint(x, y); if (e?.closest('.notebox > .grip')) bad.push(e.closest('.grip').className + '@' + Math.round(x - q.left) + ',' + Math.round(y - q.top)); }
        return bad;
      });
      ok(!over.length, 'no handle sits over the words of the note (the toolbar may, as before: it is not checked here) (' + over.slice(0, 4).join(' ') + ')');
      const t = await nb.locator('.mine').evaluate(m => { const rg = document.createRange(), tx = m.firstChild; rg.setStart(tx, 0); rg.setEnd(tx, 1); const q = rg.getBoundingClientRect(); return {x: q.left + 1, y: q.top + q.height / 2}; });
      await page.mouse.click(t.x, t.y); await page.keyboard.type('#'); await page.waitForTimeout(150);
      ok((await nb.locator('.mine').innerText()).startsWith('#Handles'), 'a click on the first letter puts the cursor there, and typing works');
      await page.keyboard.press('Backspace');
      const tEnd = await nb.locator('.mine').evaluate(m => { const rg = document.createRange(), tx = m.firstChild; rg.setStart(tx, tx.length - 1); rg.setEnd(tx, tx.length); const q = rg.getBoundingClientRect(); return {x: q.right - 1, y: q.top + q.height / 2}; });
      await page.mouse.click(tEnd.x, tEnd.y); await page.keyboard.type('!'); await page.waitForTimeout(150);
      ok((await nb.locator('.mine').innerText()).trim().endsWith('find!'), 'and so does a click on its last letter, by the right edge');
      await page.mouse.click(5, 700); await page.waitForTimeout(300);
    }

    // ---- colours: in the light and dark themes, between the lines and on side pages (light and dark paper) ----
    let r = await R();
    await page.mouse.move(r.l + r.w / 2, r.t + r.h / 2, {steps: 3}); await page.waitForTimeout(300);
    checkColours(await colours(nb), `${scheme} theme, between the lines`);
    await page.screenshot({path: path.join(OUT, `handles-2-${scheme}-between.png`), clip: {x: r.l - 60, y: r.t - 50, width: r.w + 120, height: r.h + 100}});
    await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(600);
    const sp = page.locator('.sidepage').nth(2);
    await sp.evaluate(s => s.scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(300);
    const s = await sp.boundingBox();
    await page.mouse.click(s.x + 4, s.y + 80); await page.waitForTimeout(300);
    await page.keyboard.type('A side note'); await page.mouse.click(5, 700); await page.waitForTimeout(400);
    const sn = sp.locator('.notebox').first();
    for (const paper of ['light paper', 'dark paper']) {
      if (paper === 'dark paper') { await page.click('#tab-view'); await page.click('#sideBgBtn'); await page.click('#sideBgPop .sw[data-c="#2b2f36"]'); await page.waitForTimeout(200); await page.keyboard.press('Escape'); await page.mouse.click(5, 700); await page.waitForTimeout(300); }
      await sn.evaluate(n => n.scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(200);
      const q = await sn.boundingBox();
      await page.mouse.move(q.x + q.width / 2, q.y + q.height / 2, {steps: 3}); await page.waitForTimeout(300);
      checkColours(await colours(sn), `${scheme} theme, a side note on ${paper}`);
      // the note sits at the page's left edge: its move handle hangs over the gap beside it, still to be seen and caught
      const m = await sn.locator(':scope > .g-move').boundingBox();
      ok((await at(m.x + m.width / 2, m.y + m.height / 2)).dir === 'move', `${scheme} theme, ${paper}: the move handle of a note at the page's left edge can be caught`);
      await page.screenshot({path: path.join(OUT, `handles-3-${scheme}-side-${paper.split(' ')[0]}.png`), clip: {x: q.x - 60, y: q.y - 50, width: q.width + 120, height: q.height + 100}});
      if (scheme === 'light' && paper === 'light paper') {
        const p0 = await sn.boundingBox();
        await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2); await page.mouse.down(); await page.mouse.move(m.x + m.width / 2 + 60, m.y + m.height / 2 + 40, {steps: 6}); await page.mouse.up(); await page.waitForTimeout(300);
        const p1 = await sn.boundingBox();
        ok(Math.abs(p1.x - p0.x - 60) < 6 && Math.abs(p1.y - p0.y - 40) < 6, 'dragging the move handle moves the side note');
        // dragged as far left as it goes, the note stops at the page's edge, and its move handle (hanging over the gap beside the page) still shows and can be caught
        const m1 = await sn.locator(':scope > .g-move').boundingBox();
        await page.mouse.move(m1.x + m1.width / 2, m1.y + m1.height / 2); await page.mouse.down(); await page.mouse.move(m1.x - 300, m1.y + m1.height / 2, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(300);
        const p2 = await sn.boundingBox(); await page.mouse.move(p2.x + p2.width / 2, p2.y + p2.height / 2, {steps: 2}); await page.waitForTimeout(300);
        const edge = await sn.evaluate(n => { const p = n.parentElement, z = p.getBoundingClientRect().width / p.offsetWidth; return {l: n.getBoundingClientRect().left, inL: p.getBoundingClientRect().left + p.clientLeft * z}; });
        const m2 = await sn.locator(':scope > .g-move').boundingBox();
        ok(Math.abs(edge.l - edge.inL) < 2 && (await at(m2.x + m2.width / 2, m2.y + m2.height / 2)).dir === 'move' && (await at(m2.x + 3, m2.y + m2.height / 2)).dir === 'move', `at the page's left edge (${Math.round(edge.l - edge.inL)}px in) the note's move handle can still be caught, all of it`);
        await page.screenshot({path: path.join(OUT, 'handles-4-side-edge.png'), clip: {x: m2.x - 60, y: m2.y - 40, width: 320, height: 120}});
      }
    }
    await browser.close();
    const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
    if (errs.length) { console.log('ERRORS:\n' + errs.join('\n')); process.exit(1); }
  }
  console.log('no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

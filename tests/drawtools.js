// The drawing tools: the dark pill toolbar, Pen, Pencil, Highlighter, Text and Eraser (whole strokes or partial), the thickness slider in millimetres,
// colours, favourites, minimising to the purple button, the settings kept in 'draw-settings' (and the old ones moved over), saving, Back and the PDF
const {open} = require('./harness');
const {pen} = require('./ipad');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const near = (a, b, d = .02) => Math.abs(a - b) <= d;

(async () => {
  const {browser, context, page, errors} = await open(APP);
  const cdp = await context.newCDPSession(page);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);

  const card = i => page.locator('.pagecard').nth(i);
  const ink = i => page.evaluate(i => JSON.parse(document.querySelectorAll('.pagecard')[i].dataset.ink || '[]'), i);
  const stripBox = async (i, n = 0) => card(i).locator('.strip').nth(n).boundingBox();
  const show = async i => { await card(i).locator('.strip').first().scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 60)); await page.waitForTimeout(250); };
  const top = async i => { await card(i).evaluate(c => { c.scrollIntoView({block: 'start', behavior: 'instant'}); scrollBy({top: -(document.querySelector('.appbar').offsetHeight + 20), behavior: 'instant'}); }); await page.waitForTimeout(300); };
  const at = (b, fx, fy) => [b.x + b.width * fx, b.y + b.height * fy];
  const stroke = async (i, pts, steps = 6) => {
    const b = await stripBox(i);
    await page.mouse.move(...at(b, ...pts[0])); await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(...at(b, ...p), {steps});
    await page.mouse.up(); await page.waitForTimeout(150);
  };
  const tool = t => page.click(`#drawBar [data-tool="${t}"]`);
  const size = async v => { await page.fill('#drawSize', String(v)); await page.waitForTimeout(50); };
  const out = () => page.textContent('#drawSizeOut');
  const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem('draw-settings')));
  const unitsPerMm = i => page.evaluate(i => 96 / 25.4 * +document.querySelectorAll('.pagecard')[i].dataset.w / 960, i);
  // the colours on screen at some points (a screenshot, read back in the page)
  const pix = async pts => { const buf = await page.screenshot(); return page.evaluate(async ([b64, pts]) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    return pts.map(([px, py]) => [...x.getImageData(Math.round(px), Math.round(py), 1, 1).data].slice(0, 3));
  }, [buf.toString('base64'), pts]); };

  // ---- the toolbar: a dark see-through pill above the status bar, under menus ----
  await show(1);
  await page.click('#tab-insert'); await page.click('#drawBtn'); await page.waitForTimeout(200);
  ok(await page.isVisible('#drawBar') && await page.evaluate(() => document.body.classList.contains('drawing')), 'Draw shows the drawing tools');
  const tools = await page.$$eval('#drawBar [data-tool]', bs => bs.map(b => b.textContent.trim()));
  ok(tools.join() === 'Pen,Pencil,Highlighter,Text,Eraser', 'the tools are Pen, Pencil, Highlighter, Text and Eraser');
  ok(await page.isVisible('#drawBar [data-min]') && await page.isVisible('#drawBar [data-done]'), 'with Minimise and Done');
  const look = await page.evaluate(() => { const b = document.getElementById('drawBar'), cs = getComputedStyle(b), r = b.getBoundingClientRect(), s = document.getElementById('statusbar').getBoundingClientRect();
    return {bg: cs.backgroundColor, blur: cs.backdropFilter || cs.webkitBackdropFilter, z: +cs.zIndex, appZ: +getComputedStyle(document.querySelector('.appbar')).zIndex, shadow: cs.boxShadow, rad: parseFloat(cs.borderTopLeftRadius), above: r.bottom <= s.top, mid: Math.abs(r.left + r.width / 2 - innerWidth / 2)}; });
  ok(/rgba\(30, 30, 36, 0\.8\)/.test(look.bg) && /blur/.test(look.blur) && look.shadow !== 'none' && look.rad >= 20, 'it is a dark see-through pill with a blurred backdrop and a shadow (' + look.bg + ', ' + look.blur + ')');
  ok(look.above && look.mid < 4, 'it floats bottom centre, above the status bar');
  ok(look.z < look.appZ, 'and sits under the menus and pop-ups (z-index ' + look.z + ' < ' + look.appZ + ')');
  await page.screenshot({path: path.join(OUT, 'drawtools-1-bar.png')});

  // ---- the thickness slider, in millimetres, one for each tool ----
  ok(await page.getAttribute('#drawSize', 'type') === 'range' && await out() === '0.5mm', 'the pen starts at 0.5mm, read out beside the slider');
  for (const [v, t] of [[1.2, '1.2mm'], [3, '3.0mm'], [0.1, '0.1mm'], [0.5, '0.5mm']]) { await size(v); ok(await out() === t, `${v} on the slider reads ${t}`); }
  await size(1.2);
  await tool('hl'); ok(await out() === '5.0mm', 'the highlighter has its own thickness (5.0mm)');
  await size(3); ok(await out() === '3.0mm', 'set to 3.0mm');
  await tool('pc'); ok(await out() === '0.4mm', 'the pencil its own (0.4mm)');
  await tool('er'); ok(await out() === '4.0mm' && await page.getAttribute('#drawSize', 'aria-label') === 'Eraser size', 'the eraser its own size (4.0mm)');
  await tool('pen'); ok(await out() === '1.2mm', 'and the pen still has 1.2mm');
  ok((await settings()).thickness.pen === 1.2 && (await settings()).thickness.hl === 3, 'each tool\'s thickness is kept in draw-settings');

  // ---- Pen ----
  await page.click('#drawBar .sw[data-c="#c62828"]');
  await stroke(1, [[.1, .1], [.2, .05], [.3, .15], [.4, .05]]);
  let it = await ink(1), k = await unitsPerMm(1);
  ok(it.length === 1 && it[0].k === 'pen' && it[0].c === '#c62828' && near(it[0].w, 1.2 * k), 'a pen stroke is stored with its width from the slider: 1.2mm = ' + it[0].w + ' page units');
  const pp = await card(1).locator('svg.ink path.pen').first().evaluate(p => ({cap: p.getAttribute('stroke-linecap'), join: p.getAttribute('stroke-linejoin'), sw: +p.getAttribute('stroke-width')}));
  ok(pp.cap === 'round' && pp.join === 'round' && near(pp.sw, it[0].w), 'drawn with round ends and joins');
  const onScreen = await page.evaluate(() => { const s = document.querySelectorAll('.pagecard')[1].querySelector('.strip'), c = s.closest('.pagecard'); return s.getBoundingClientRect().width / +c.dataset.w; });
  ok(near(it[0].w * onScreen, 1.2 * 96 / 25.4 * (await page.evaluate(() => viewZoom)), .05), 'and 1.2mm is 1.2 CSS millimetres on the page as laid out (' + (it[0].w * onScreen).toFixed(2) + 'px)');

  // ---- Pencil: grainy and see-through, with pressure from a pen ----
  await tool('pc'); await page.click('#drawBar .sw[data-c="#1d1d1d"]'); await size(0.8);
  await stroke(1, [[.1, .3], [.2, .25], [.3, .35], [.4, .25]]);
  it = await ink(1);
  ok(it.length === 2 && it[1].k === 'pc' && it[1].c === '#1d1d1d' && near(it[1].w, .8 * k) && it[1].p.every(q => q.length === 2), 'a pencil stroke (k "pc") with a mouse has one width');
  const pc = await card(1).locator('svg.ink path.pc').first().evaluate(p => ({stroke: p.getAttribute('stroke'), op: getComputedStyle(p).opacity, pat: !!document.querySelector(p.getAttribute('stroke').slice(4, -1) + ' circle')}));
  ok(/^url\(#pcg1d1d1d\)$/.test(pc.stroke) && pc.op === '0.9' && pc.pat, 'it paints with a speckled grain of its colour and is slightly see-through');
  {
    const b = await stripBox(1), P = Array.from({length: 20}, (_, n) => [b.x + b.width * (.5 + n * .015), b.y + b.height * (.3 + Math.sin(n / 3) * .04), .1 + .85 * n / 19]);
    await pen(cdp, 'mouseMoved', P[0][0], P[0][1]); await pen(cdp, 'mousePressed', P[0][0], P[0][1], {force: P[0][2]});
    for (const [x, y, f] of P.slice(1)) await pen(cdp, 'mouseMoved', x, y, {down: true, force: f});
    await pen(cdp, 'mouseReleased', P.at(-1)[0], P.at(-1)[1], {force: 0}); await page.waitForTimeout(250);
  }
  it = await ink(1);
  const prs = it[2].p.map(q => q[2]);
  ok(it.length === 3 && it[2].k === 'pc' && it[2].p.every(q => q.length === 3) && prs.at(-1) - prs[0] > .4, 'with a pen the pencil follows the pressure (' + prs[0] + ' to ' + prs.at(-1) + ')');
  const pcp = await card(1).locator('svg.ink path.pc').last().evaluate(p => ({fill: p.getAttribute('fill'), stroke: p.getAttribute('stroke')}));
  ok(pcp.stroke === 'none' && /^url\(#pcg/.test(pcp.fill), 'and is a grainy shape whose width follows the pressure');

  // ---- Highlighter: see-through, one path, no darker where it crosses itself ----
  await tool('hl');
  ok(await page.getAttribute('#drawBar .sw[data-c="#ffd54a"]', 'aria-pressed') === 'true' && await out() === '3.0mm', 'the highlighter is yellow, 3.0mm');
  await size(5);
  await top(1);
  const hb = await stripBox(1), bgc = (await pix([at(hb, .75, .69)]))[0];
  await stroke(1, [[.65, .62], [.85, .76], [.85, .62], [.65, .76]], 12);
  it = await ink(1);
  ok(it.length === 4 && it[3].k === 'hl' && near(it[3].w * 4, 5 * k), 'a highlighter stroke, 5.0mm wide');
  ok(await card(1).locator('svg.ink path.hl').count() === 1 && await card(1).locator('svg.ink path.hl').evaluate(p => getComputedStyle(p).opacity === '0.35' && getComputedStyle(p).mixBlendMode === 'multiply'), 'drawn as one see-through path, multiplied');
  {
    await page.mouse.move(5, 300);
    const [cross, once] = await pix([at(hb, .75, .69), at(hb, .7, .655)]);
    ok(bgc.every(v => v > 235) && cross[2] < bgc[2] - 40 && cross.every((v, i) => Math.abs(v - once[i]) <= 3), 'where it crosses itself it is no darker than elsewhere (' + cross + ' vs ' + once + ')');
  }
  await page.screenshot({path: path.join(OUT, 'drawtools-2-strokes.png')});

  // ---- Eraser: whole strokes, its size from the slider, and partial ----
  await tool('er');
  ok(await page.isVisible('#drawBar .dmode') && await page.getAttribute('#drawBar [data-em="stroke"]', 'aria-pressed') === 'true' && !(await page.isVisible('#drawBar .dcols')), 'the eraser rubs out whole strokes to begin with, and has no colours');
  await size(1);
  {
    const b = await stripBox(1);
    await page.mouse.move(...at(b, .6, .6)); await page.waitForTimeout(100);
    const rw = await page.evaluate(() => { const r = document.querySelector('.erring'); return r.hidden ? 0 : r.getBoundingClientRect().width; });
    ok(near(rw, 1 * k * onScreen, 1), 'with a mouse its outline follows the pointer at its real size (' + rw.toFixed(1) + 'px)');
  }
  // a stroke 5mm away: the 1mm eraser misses it, a 12mm one rubs it out
  await tool('pen'); await stroke(1, [[.1, .45], [.2, .45]]); await tool('er');
  const n0 = (await ink(1)).length, dy = 5 * k / await card(1).evaluate(c => +c.querySelector('.strip').dataset.y1 - +c.querySelector('.strip').dataset.y0);
  await stroke(1, [[.1, .45 + dy], [.2, .45 + dy]]);
  ok((await ink(1)).length === n0, 'a small eraser (1mm) 5mm from a stroke leaves it');
  await size(12);
  await stroke(1, [[.1, .45 + dy], [.2, .45 + dy]]);
  it = await ink(1);
  ok(it.length === n0 - 1 && it.filter(s => s.k === 'pen').length === 1, 'a bigger eraser (12mm) reaches it and rubs out the whole stroke');
  await page.waitForTimeout(700);
  // partial: a line is cut where the eraser goes, and what is left is two strokes
  await top(2); await tool('pen'); await stroke(2, [[.1, .5], [.7, .5]], 20);
  await page.evaluate(() => { const c = document.querySelectorAll('.pagecard')[2], a = JSON.parse(c.dataset.ink || '[]'); a.push({k: 'pen', c: '#2e7d32', w: 2, p: [[100, 400], [800, 400]]}); setInk(c, a); saveSoon(); });
  await page.waitForTimeout(700);
  const before = await ink(2);
  await tool('er'); await size(4); await page.click('#drawBar [data-em="part"]');
  ok(await page.getAttribute('#drawBar [data-em="part"]', 'aria-pressed') === 'true' && (await settings()).eraserMode === 'part', 'Partial is picked (and kept)');
  const W2 = +(await card(2).getAttribute('data-w')), sb2 = await stripBox(2), H2 = await card(2).evaluate(c => +c.querySelector('.strip').dataset.y1 - +c.querySelector('.strip').dataset.y0);
  const ex = .35, ey = 400 / H2;
  await stroke(2, [[ex, .4], [ex, .6]], 12);
  await page.waitForTimeout(700);
  await stroke(2, [[450 / W2, ey - .08], [450 / W2, ey + .08]], 8);
  it = await ink(2);
  const k2 = await unitsPerMm(2), r = 2 * k2, X = ex * W2;
  const reds = it.filter(s => s.c === before[0].c && s.k === 'pen'), greens = it.filter(s => s.c === '#2e7d32');
  ok(before.length === 2 && it.length === 4, 'the partial eraser splits each stroke it passes over in two (' + before.length + ' strokes, now ' + it.length + ')');
  const [lft, rgt] = reds.sort((a, b) => a.p[0][0] - b.p[0][0]);
  ok(Math.max(...lft.p.map(q => q[0])) < X - r && Math.min(...rgt.p.map(q => q[0])) > X + r && lft.p.length > 3 && rgt.p.length > 3, 'only the points under the eraser go: the gap is where it passed (' + Math.max(...lft.p.map(q => q[0])) + ' … ' + Math.min(...rgt.p.map(q => q[0])) + ' around ' + X.toFixed(1) + ')');
  ok(reds.every(s => s.w === before[0].w) && lft.p[0][0] === before[0].p[0][0] && rgt.p.at(-1)[0] === before[0].p.at(-1)[0], 'both pieces keep the colour, the width and their ends');
  const [g1, g2] = greens.sort((a, b) => a.p[0][0] - b.p[0][0]);
  ok(greens.length === 2 && g1.p[0][0] === 100 && g2.p.at(-1)[0] === 800 && g1.p.at(-1)[0] < 450 - r && g2.p[0][0] > 450 + r && g1.p.at(-1)[0] > 400 && g2.p[0][0] < 500, 'a long straight line (two points) is cut in the middle too, close to the eraser (' + g1.p.at(-1)[0] + ' … ' + g2.p[0][0] + ')');
  await page.screenshot({path: path.join(OUT, 'drawtools-3-partial.png')});
  await page.waitForTimeout(800);
  await page.click('#undoBtn'); await page.waitForTimeout(600);
  await page.click('#undoBtn'); await page.waitForTimeout(600);
  ok((await ink(2)).length === 2, 'Back puts the cut strokes back together');
  await page.click('#redoBtn'); await page.waitForTimeout(600); await page.click('#redoBtn'); await page.waitForTimeout(600);
  ok((await ink(2)).length === 4, 'and Forward cuts them again');
  await page.click('#drawBar [data-em="stroke"]');

  // ---- Text: a tap starts a note there in the colour, size and font picked ----
  await tool('tx');
  ok(await page.isVisible('#drawFont') && !(await page.isVisible('#drawBar .dprev')) && await out() === '24px', 'Text has a size (24px) and a font');
  await size(32); await page.click('#drawBar .sw[data-c="#c62828"]'); await page.selectOption('#drawFont', 'Georgia');
  ok(await out() === '32px', 'the size reads 32px');
  await top(3);
  const nb0 = await page.locator('.notebox').count(), tb = await stripBox(3), [tx, ty] = at(tb, .55, .6);
  await page.mouse.click(tx, ty); await page.waitForTimeout(300);
  const tn = card(3).locator('.notebox.floating').first();
  ok(await page.locator('.notebox').count() === nb0 + 1 && await tn.count() === 1, 'a tap on the page with Text makes a note floating on that page');
  const ts = await tn.evaluate(b => { const m = b.querySelector('.mine'), r = b.getBoundingClientRect(); return {fs: m.style.fontSize, col: getComputedStyle(m).color, ff: m.style.fontFamily, focus: document.activeElement === m, x: r.left, y: r.top, h: r.height, no: b.classList.contains('no-outline')}; });
  ok(ts.fs === '32px' && ts.col === 'rgb(198, 40, 40)' && /Georgia/.test(ts.ff) && ts.no, 'in red, 32px Georgia, with no border');
  ok(ts.focus && Math.abs(ts.x - tx) < 30 && ts.y < ty && ts.y + ts.h > ty, 'where you tapped, ready to type');
  await page.keyboard.type('Elastic demand'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.body.classList.contains('drawing')) && await page.getAttribute('#drawBar [data-tool="tx"]', 'aria-pressed') === 'true', 'drawing carries on with the Text tool');
  await page.mouse.click(...at(tb, .15, .45)); await page.waitForTimeout(300);
  ok(await card(3).locator('.notebox.floating').count() === 2 && (await tn.textContent()).includes('Elastic demand'), 'another tap starts another note, and the first keeps its words');
  await page.keyboard.type('Inelastic'); await page.waitForTimeout(700);
  await page.screenshot({path: path.join(OUT, 'drawtools-4-text.png')});

  // ---- favourites ----
  await tool('pen'); await page.click('#drawBar .sw[data-c="#2e7d32"]'); await size(0.7);
  ok(!(await page.isVisible('#drawBar .dfavs')), 'no favourites yet');
  await page.click('#drawBar [data-fav]'); await page.waitForTimeout(100);
  ok(await page.locator('#drawBar .dfav').count() === 1 && await page.getAttribute('#drawBar .dfav', 'aria-pressed') === 'true', 'Save as favourite adds the pen as a favourite, outlined');
  const favRing = await page.locator('#drawBar .dfav').evaluate(b => getComputedStyle(b).boxShadow);
  ok(/0px 0px 0px 4px/.test(favRing), 'the favourite in use has a ring round it');
  await tool('hl'); await page.click('#drawBar .sw[data-c="#ffd54a"]'); await size(8); await page.click('#drawBar [data-fav]');
  await tool('tx'); await page.click('#drawBar [data-fav]');
  let st = await settings();
  ok(st.favorites.length === 3 && st.favorites[0].toolType === 'pen' && st.favorites[0].color === '#2e7d32' && st.favorites[0].thickness === .7 && st.favorites[1].toolType === 'hl' && st.favorites[1].thickness === 8
    && st.favorites[2].toolType === 'tx' && st.favorites[2].fontSize === 32 && st.favorites[2].fontFamily === 'Georgia' && st.favorites[2].color === '#c62828' && st.favorites.every(f => typeof f.id === 'string'), 'favourites keep the tool, colour and thickness (text: size and font)');
  ok(st.activePresetId === st.favorites[2].id && await page.locator('#drawBar .dfav[aria-pressed="true"]').count() === 1, 'only the last one saved is outlined');
  await page.click('#drawBar [data-fav]'); await page.waitForTimeout(100);
  ok(await page.locator('#drawBar .dfav').count() === 3, 'saving the same again adds no copy');
  await tool('pen'); await size(2.5); await page.click('#drawBar .sw[data-c="#1f4fd1"]');
  ok(await page.locator('#drawBar .dfav[aria-pressed="true"]').count() === 0 && (await settings()).activePresetId === null, 'changing the tools lets go of the favourite');
  await page.click('#drawBar .dfav >> nth=0');
  ok(await page.getAttribute('#drawBar [data-tool="pen"]', 'aria-pressed') === 'true' && await out() === '0.7mm' && await page.getAttribute('#drawBar .sw[data-c="#2e7d32"]', 'aria-pressed') === 'true' && await page.getAttribute('#drawBar .dfav >> nth=0', 'aria-pressed') === 'true', 'clicking a favourite picks its tool, colour and thickness at once, and outlines it');
  await page.click('#drawBar .dfav >> nth=1');
  ok(await page.getAttribute('#drawBar [data-tool="hl"]', 'aria-pressed') === 'true' && await out() === '8.0mm', 'the highlighter favourite too');
  await tool('pen'); ok(await out() === '0.7mm', '(the pen keeps what its favourite set)');
  await page.click('#drawBar .dfav >> nth=2');
  ok(await page.getAttribute('#drawBar [data-tool="tx"]', 'aria-pressed') === 'true' && await out() === '32px' && await page.inputValue('#drawFont') === 'Georgia', 'and the text favourite sets the size and font');
  await page.screenshot({path: path.join(OUT, 'drawtools-5-favourites.png')});
  // remove: right-click shows ×, a click on it removes; or the × that shows when you point at it
  await page.click('#drawBar .dfav >> nth=1', {button: 'right'});
  ok(await page.locator('#drawBar .dfav.del').count() === 1 && await page.locator('#drawBar .dfav.del .dfx').isVisible(), 'right-click on a favourite shows its ×');
  await page.click('#drawBar .dfav.del'); await page.waitForTimeout(100);
  st = await settings();
  ok(st.favorites.length === 2 && !st.favorites.some(f => f.toolType === 'hl'), 'and clicking it removes the favourite');
  await page.hover('#drawBar .dfav >> nth=0');
  ok(await page.locator('#drawBar .dfav >> nth=0 >> .dfx').isVisible(), 'pointing at a favourite shows a small ×');
  await page.click('#drawBar .dfav >> nth=0 >> .dfx'); await page.waitForTimeout(100);
  ok((await settings()).favorites.length === 1 && (await settings()).favorites[0].toolType === 'tx', 'which removes it');

  // ---- minimise: the purple button ----
  await page.click('#drawBar .dfav'); await tool('pc');
  await page.click('#drawBar [data-min]'); await page.waitForTimeout(150);
  const fab = await page.evaluate(() => { const f = document.getElementById('drawFab'), cs = getComputedStyle(f), r = f.getBoundingClientRect(), s = document.getElementById('statusbar').getBoundingClientRect();
    return {vis: !f.hidden && r.width > 0, bg: cs.backgroundColor, round: cs.borderRadius === '50%', w: r.width, h: r.height, col: getComputedStyle(f.querySelector('.i')).color, icon: f.querySelector('use').getAttribute('href'), above: r.bottom <= s.top}; });
  ok(!(await page.isVisible('#drawBar')) && fab.vis && fab.bg === 'rgb(124, 58, 237)' && fab.round && fab.w >= 44 && fab.w === fab.h && fab.col === 'rgb(255, 255, 255)' && fab.icon === '#i-pencil' && fab.above, 'Minimise folds the tools into a round purple button with a white pencil');
  ok(await page.evaluate(() => document.body.classList.contains('drawing')) && (await settings()).minimised === true, 'drawing stays on (and minimised is kept)');
  await page.screenshot({path: path.join(OUT, 'drawtools-6-minimised.png')});
  await show(4);
  const n4 = (await ink(4)).length;
  await stroke(4, [[.6, .2], [.7, .25], [.8, .2]]);
  ok((await ink(4)).length === n4 + 1 && (await ink(4)).at(-1).k === 'pc', 'it still draws with the tool picked');
  await page.click('#drawFab'); await page.waitForTimeout(150);
  ok(await page.isVisible('#drawBar') && !(await page.isVisible('#drawFab')) && await page.getAttribute('#drawBar [data-tool="pc"]', 'aria-pressed') === 'true' && (await settings()).minimised === false, 'the button opens the tools again, with the pencil still picked');
  await page.click('#drawBar [data-min]');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(!(await page.isVisible('#drawFab')) && !(await page.isVisible('#drawBar')) && await page.getAttribute('#drawBtn', 'aria-pressed') === 'false', 'Esc stops drawing, minimised or not');
  await page.click('#drawBtn'); await page.waitForTimeout(150);
  ok(await page.isVisible('#drawFab') && !(await page.isVisible('#drawBar')), 'Draw again comes back minimised, as it was left');
  await page.click('#drawFab');

  // ---- reload: the same tool, colour and thickness ----
  await tool('pc'); await page.click('#drawBar .sw[data-c="#2e7d32"]'); await size(0.9);
  const inkAll = await page.evaluate(() => [...document.querySelectorAll('.pagecard')].map(c => c.dataset.ink || ''));
  await page.waitForTimeout(900);
  await page.reload(); await page.waitForTimeout(2000);
  await page.click('#tab-insert'); await page.click('#drawBtn'); await page.waitForTimeout(200);
  ok(await page.getAttribute('#drawBar [data-tool="pc"]', 'aria-pressed') === 'true' && await out() === '0.9mm' && await page.getAttribute('#drawBar .sw[data-c="#2e7d32"]', 'aria-pressed') === 'true', 'after a reload the pencil is picked again, green, 0.9mm');
  ok(await page.locator('#drawBar .dfav').count() === 1 && await page.getAttribute('#drawBar .dfav', 'aria-pressed') === 'false', 'with the favourites');
  st = await settings();
  ok(['activeTool', 'colors', 'thickness', 'favorites', 'activePresetId', 'minimised'].every(x => x in st) && st.colors.pc === '#2e7d32' && st.thickness.pc === .9, 'all kept in one draw-settings JSON');
  ok(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.pagecard')].map(c => c.dataset.ink || ''))) === JSON.stringify(inkAll), 'every stroke is still there after the reload');
  ok(await card(1).locator('svg.ink path.pc').count() === 2 && await card(1).locator('svg.ink path.hl').count() === 1, 'and drawn again (pencil and highlighter)');
  ok((await page.locator('.notebox .mine').allTextContents()).some(t => t.includes('Elastic demand')), 'and the text note is there');
  await page.keyboard.press('Escape');

  // ---- the PDF ----
  const paint = await page.evaluate(async () => {
    const c = document.querySelectorAll('.pagecard')[1], cv = await paintCard(c, 1), ctx = cv.getContext('2d'), r = c.getBoundingClientRect(), s = c.querySelector(':scope > .strip'), sr = s.getBoundingClientRect();
    const dark = it => { let n = 0; for (const q of it.p) { const x = Math.round(sr.left - r.left + q[0] / +c.dataset.w * sr.width), y = Math.round(sr.top - r.top + (q[1] - +s.dataset.y0) / (+s.dataset.y1 - +s.dataset.y0) * sr.height); const d = ctx.getImageData(x - 1, y - 1, 3, 3).data; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 560) { n++; break; } } return n / it.p.length; };
    const a = JSON.parse(c.dataset.ink);
    return {pen: dark(a[0]), pc: dark(a.find(x => x.k === 'pc'))};
  });
  ok(paint.pen > .8 && paint.pc > .6, 'pen and pencil strokes are painted into the PDF (' + paint.pen.toFixed(2) + ', ' + paint.pc.toFixed(2) + ' of their points)');
  await page.click('#save'); await page.selectOption('#pdfNotes', 'page');
  const [dl] = await Promise.all([page.waitForEvent('download', {timeout: 120000}), page.click('[data-kind=pdf]')]);
  const f = path.join(OUT, 'drawtools.pdf'); await dl.saveAs(f);
  ok(fs.readFileSync(f).slice(0, 5).toString() === '%PDF-', 'the PDF downloads');

  // ---- the Pencil by itself (Draw off) with the Text tool picked writes with the pen ----
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('draw-settings')); s.activeTool = 'tx'; localStorage.setItem('draw-settings', JSON.stringify(s)); });
  await page.reload(); await page.waitForTimeout(2000);
  await show(5);
  {
    const b = await stripBox(5), n5 = (await ink(5)).length, P = Array.from({length: 14}, (_, n) => [b.x + b.width * (.3 + n * .02), b.y + b.height * .3, .5]);
    await pen(cdp, 'mouseMoved', P[0][0], P[0][1]); await pen(cdp, 'mousePressed', P[0][0], P[0][1]);
    for (const [x, y] of P.slice(1)) await pen(cdp, 'mouseMoved', x, y, {down: true});
    await pen(cdp, 'mouseReleased', P.at(-1)[0], P.at(-1)[1], {force: 0}); await page.waitForTimeout(250);
    const a = await ink(5);
    ok(a.length === n5 + 1 && a.at(-1).k === 'pen' && !(await page.evaluate(() => document.body.classList.contains('drawing'))), 'with Draw off and Text picked, the Pencil still draws (with the pen)');
  }

  // ---- the old settings move over ----
  await page.evaluate(() => { localStorage.removeItem('draw-settings'); localStorage.setItem('draw-tool', 'hl'); localStorage.setItem('draw-c-pen', '#c62828'); localStorage.setItem('draw-c-hl', '#2e7d32'); localStorage.setItem('draw-w', '2'); });
  await page.reload(); await page.waitForTimeout(2000);
  await page.click('#tab-insert'); await page.click('#drawBtn'); await page.waitForTimeout(200);
  ok(await page.getAttribute('#drawBar [data-tool="hl"]', 'aria-pressed') === 'true' && await page.getAttribute('#drawBar .sw[data-c="#2e7d32"]', 'aria-pressed') === 'true' && await out() === '8.5mm', 'the old tool, colour and thickness come over (the highlighter, green, thick = 8.5mm)');
  await tool('pen');
  ok(await page.getAttribute('#drawBar .sw[data-c="#c62828"]', 'aria-pressed') === 'true' && await out() === '2.1mm' && (await settings()).activeTool === 'pen', 'and the pen\'s (red, 2.1mm), now kept in draw-settings');
  await page.keyboard.press('Escape');
  await browser.close();

  // ---- a phone, and the dark theme ----
  for (const [w, h, scheme] of [[390, 844, 'light'], [820, 1180, 'dark']]) {
    const d = await open(APP, {width: w, height: h, colorScheme: scheme, contextOptions: {hasTouch: true, isMobile: w < 500, deviceScaleFactor: 2}});
    await d.page.waitForTimeout(500);
    await d.page.evaluate(() => { localStorage.setItem('draw-settings', JSON.stringify({activeTool: 'hl', favorites: [{id: 'a', toolType: 'pen', color: '#c62828', thickness: .5}, {id: 'b', toolType: 'hl', color: '#ffd54a', thickness: 5}, {id: 'c', toolType: 'tx', color: '#1f4fd1', fontSize: 30, fontFamily: 'Kalam'}], activePresetId: 'b'})); });
    await d.page.reload(); await d.page.waitForTimeout(800);
    await d.page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
    await d.page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 3, null, {timeout: 60000});
    await d.page.waitForTimeout(800);
    await d.page.click('#tab-insert'); await d.page.click('#drawBtn'); await d.page.waitForTimeout(300);
    const m = await d.page.evaluate(() => {
      const b = document.getElementById('drawBar'), r = b.getBoundingClientRect(), s = document.getElementById('statusbar').getBoundingClientRect(), small = [];
      for (const el of b.querySelectorAll('button, input, select')) { const q = el.getBoundingClientRect(); if (q.width && Math.min(q.width, q.height) < 39.5) small.push(el.className + ' ' + Math.round(q.width) + 'x' + Math.round(q.height)); }
      return {l: r.left, r: r.right, h: r.height, above: r.bottom <= s.top, small, bg: getComputedStyle(b).backgroundColor, hs: document.documentElement.scrollWidth <= innerWidth};
    });
    ok(m.r - m.l > 200 && m.l >= 0 && m.r <= w && m.above && m.hs, `${w}px wide: the tools fit on the screen above the status bar (${Math.round(m.l)}–${Math.round(m.r)}, ${Math.round(m.h)}px tall)`);
    ok(m.small.length === 0, `${w}px wide: every control is 40px or more for a finger` + (m.small.length ? ': ' + m.small.join(', ') : ''));
    ok(/rgba\(30, 30, 36, 0\.8\)/.test(m.bg), `the pill is dark in the ${scheme} theme too`);
    await d.page.screenshot({path: path.join(OUT, `drawtools-7-${w}-${scheme}.png`)});
    await d.page.click('#drawBar [data-min]'); await d.page.waitForTimeout(150);
    const fb = await d.page.locator('#drawFab').boundingBox();
    ok(fb.width >= 44 && fb.x + fb.width <= w, `${w}px wide: the minimised button is a fingertip size (${fb.width}px)`);
    const derr = d.errors.filter(e => !/ERR_FAILED|net::/.test(e));
    if (derr.length) errors.push(...derr);
    await d.browser.close();
  }

  console.log(errors.length ? errors : 'no page errors');
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });

// Picture Format, as in Word: selecting a picture of yours brings a Picture Format tab (the tab you were on comes back after); Crop with black
// handles, crop to an aspect ratio or a shape, rotate and flip, corrections, colour, transparency, styles, a border, alt text, the size with its
// ratio locked or not, and Reset. Each change is one step for Back, nothing changes the picture itself, and it all comes back after a reload
const {open} = require('./harness');
const path = require('path');
const OUT = path.join(__dirname, 'shots');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const near = (a, b, d = 2) => Math.abs(a - b) <= d;

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(800);
  // a 200 × 100 picture in four colours: red, green (top), blue, yellow (bottom)
  const png = Buffer.from(await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 200; c.height = 100; const x = c.getContext('2d');
    [['#ff0000', 0, 0], ['#00ff00', 100, 0], ['#0000ff', 0, 50], ['#ffff00', 100, 50]].forEach(([f, l, t]) => { x.fillStyle = f; x.fillRect(l, t, 100, 50); });
    return c.toDataURL('image/png').split(',')[1];
  }), 'base64');
  // the colour on screen at a point: red, green, blue, yellow (or grey, white, other)
  const colourAt = async (x, y) => {
    const b = await page.screenshot({clip: {x: Math.round(x) - 1, y: Math.round(y) - 1, width: 3, height: 3}});
    const [r, g, bl] = await page.evaluate(async s => { const im = await createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob()); const c = new OffscreenCanvas(im.width, im.height), x = c.getContext('2d'); x.drawImage(im, 0, 0); return [...x.getImageData(1, 1, 1, 1).data]; }, b.toString('base64'));
    return r > 180 && g > 180 && bl < 90 ? 'yellow' : r > 180 && g < 90 && bl < 90 ? 'red' : g > 180 && r < 90 && bl < 90 ? 'green' : bl > 180 && r < 90 && g < 90 ? 'blue' : `rgb(${r},${g},${bl})`;
  };
  // a note, with the picture in it
  const strip = page.locator('.pagecard').nth(1).locator('.strip').first();
  await strip.scrollIntoViewIfNeeded(); let b = await strip.boundingBox();
  await page.mouse.move(b.x + 200, b.y + b.height / 2, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.keyboard.type('A picture: ');
  await page.click('#tab-insert');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#mediaBtn')]);
  await fc.setFiles({name: 'quads.png', mimeType: 'image/png', buffer: png});
  await page.waitForTimeout(500); await page.mouse.click(5, 700); await page.waitForTimeout(800);
  const pic = page.locator('.notebox .media').first();
  await pic.evaluate(m => m.scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(200);
  const R = () => pic.evaluate(m => { const r = m.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom}; });
  const ds = () => pic.evaluate(m => Object.fromEntries(Object.entries(m.dataset).filter(([k]) => PF_KEYS.includes(k))));       // (the picture's own settings)
  const tabOn = () => page.evaluate(() => ({shown: !document.querySelector('#tab-picture').hidden, selected: document.querySelector('#tab-picture').getAttribute('aria-selected') === 'true', panel: !document.querySelector('#panel-picture').hidden, tab: document.querySelector('.tab[aria-selected="true"]').dataset.tab}));
  const select = async () => { const r = await R(); await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await page.waitForTimeout(250); };
  const away = async () => { await page.mouse.click(5, 700); await page.waitForTimeout(250); };
  const popItem = async (btn, sel) => { await page.click(btn); await page.waitForTimeout(150); await page.click(`.pfpop ${sel}`); await page.waitForTimeout(250); };
  const r0 = await R();
  ok(near(r0.w / r0.h, 2, .05), `the picture shows whole (${r0.w.toFixed(0)} × ${r0.h.toFixed(0)})`);

  // ---- the tab ----
  let t = await tabOn();
  ok(!t.shown && t.tab === 'insert', 'no Picture Format tab until a picture is selected');
  await select(); t = await tabOn();
  ok(t.shown && t.selected && t.panel, 'selecting the picture brings the Picture Format tab, open');
  await page.click('#tab-home'); await page.waitForTimeout(150); t = await tabOn();
  ok(t.shown && t.tab === 'home' && await pic.evaluate(m => m.classList.contains('media-sel')), 'another tab can be picked while the picture stays selected, and the Picture Format tab stays');
  await page.click('#tab-picture'); await page.waitForTimeout(150);
  await away(); t = await tabOn();
  ok(!t.shown && t.tab === 'insert', 'clicking away hides it, and the tab you were on (Insert) comes back');
  await select();

  // ---- Crop: drag the left handle to the middle ----
  await page.click('#pfCrop'); await page.waitForTimeout(200);
  ok(await page.locator('.pfcrop .pf-h').count() === 8, 'Crop shows 8 black handles round the picture');
  let r = await R();
  let h = await page.locator('.pfcrop .pf-h[data-d="w"]').boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
  await page.mouse.move(r.x + r.w / 2, h.y + h.height / 2, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(100);
  ok(near((await R()).w, r.w, 1), 'while cropping, the picture keeps its place (only the frame moves)');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  let d = await ds(), r1 = await R();
  ok(!(await page.locator('.pfcrop').count()) && /^0 0 0 0\.(49|5|51)/.test(d.crop || ''), `Enter keeps the crop (data-crop "${d.crop}")`);
  ok(near(r1.w, r.w / 2, 3) && near(r1.h, r.h, 2) && near(r1.x, r.x, 2), `the picture is now half as wide, at the same scale (${r1.w.toFixed(0)} × ${r1.h.toFixed(0)})`);
  ok(await colourAt(r1.x + r1.w / 2, r1.y + r1.h * .25) === 'green' && await colourAt(r1.x + r1.w / 2, r1.y + r1.h * .75) === 'yellow' && await colourAt(r1.x + 4, r1.y + 4) === 'green', 'the kept part is the right half: green over yellow');
  await page.waitForTimeout(700);

  // ---- Esc puts it back; dragging the picture inside the frame moves it ----
  await page.click('#pfCrop'); await page.waitForTimeout(200);
  h = await page.locator('.pfcrop .pf-h[data-d="n"]').boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down(); await page.mouse.move(h.x + h.width / 2, h.y + 30, {steps: 5}); await page.mouse.up();
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok((await ds()).crop === d.crop && !(await page.locator('.pfcrop').count()) && await pic.evaluate(m => m.classList.contains('media-sel')), 'Esc puts the crop back as it was (and the picture stays selected)');
  await page.click('#pfCrop'); await page.waitForTimeout(200);
  r = await R();
  await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2); await page.mouse.down(); await page.mouse.move(r.x + r.w / 2 + r.w, r.y + r.h / 2, {steps: 8}); await page.mouse.up();
  await page.click('#pfCrop'); await page.waitForTimeout(300);
  d = await ds(); r1 = await R();
  ok(/^0 0\.(49|5|51)\d* 0 0$/.test(d.crop || '') && near(r1.w, r.w, 2), `dragging the picture right in the frame shows its left half instead, same size (data-crop "${d.crop}"; Crop again keeps it)`);
  ok(await colourAt(r1.x + r1.w / 2, r1.y + r1.h * .25) === 'red', 'now red over blue');
  await page.waitForTimeout(700);

  // ---- one change, one step back ----
  await page.keyboard.press('Control+z'); await page.waitForTimeout(700);
  ok(/^0 0 0 0\.(49|5|51)/.test((await ds()).crop || ''), 'Ctrl+Z undoes just the last change (the move), not the crop before it');
  await page.keyboard.press('Control+y'); await page.waitForTimeout(700);
  ok(/^0 0\.(49|5|51)\d* 0 0$/.test((await ds()).crop || ''), 'and Ctrl+Y does it again');

  // ---- crop to an aspect ratio, and to a shape ----
  await select();
  await popItem('#pfCropMore', '[data-act="nocrop"]');
  r = await R(); ok(near(r.w / r.h, 2, .05) && !(await ds()).crop, 'No crop shows the whole picture again');
  await popItem('#pfCropMore', '[data-act="ar"][data-v="1"]');
  r1 = await R(); d = await ds();
  ok(near(r1.w, r1.h, 2) && near(r1.h, r.h, 2), `crop to 1:1 makes it square, from the middle (${r1.w.toFixed(0)} × ${r1.h.toFixed(0)}; "${d.crop}")`);
  await popItem('#pfCropMore', '.pf-th[data-set="shape=oval"]');
  ok(await pic.evaluate(m => m.dataset.shape === 'oval' && getComputedStyle(m).borderRadius === '50%'), 'crop to shape: an oval (a circle, as it is square)');
  r1 = await R();
  ok(await colourAt(r1.x + 3, r1.y + 3) !== await colourAt(r1.x + r1.w / 2 - 6, r1.y + r1.h / 2 - 6), 'the corners are cut off');
  await popItem('#pfCropMore', '.pf-th[data-set="shape=star"]');
  ok(await pic.evaluate(m => /polygon/.test(getComputedStyle(m).clipPath)), 'or a star');
  await page.click('#pfReset'); await page.waitForTimeout(300);
  d = await ds(); r = await R();
  ok(!Object.keys(d).length && near(r.w / r.h, 2, .05) && await pic.evaluate(m => !m.style.boxShadow && !m.style.clipPath && !m.style.borderRadius && !m.querySelector('img').style.filter), 'Reset takes the crop and the shape off, and the picture is whole again');

  // ---- rotate and flip ----
  await popItem('#pfRotate', '[data-act="rr"]');
  r1 = await R();
  ok((await ds()).rot === '90' && near(r1.w, r.h, 2) && near(r1.h, r.w, 3), `Rotate right 90°: it stands on its end, its width now its height (${r1.w.toFixed(0)} × ${r1.h.toFixed(0)})`);
  ok(await colourAt(r1.x + r1.w * .25, r1.y + r1.h * .25) === 'blue' && await colourAt(r1.x + r1.w * .75, r1.y + r1.h * .25) === 'red' && await colourAt(r1.x + r1.w * .25, r1.y + r1.h * .75) === 'yellow', 'and its colours turned with it (blue top left, red top right)');
  await popItem('#pfRotate', '[data-act="fh"]');
  ok((await ds()).flip === 'h' && await colourAt(r1.x + r1.w * .25, r1.y + r1.h * .25) === 'red', 'Flip horizontal mirrors it (red top left)');
  await popItem('#pfRotate', '[data-act="rl"]');
  r1 = await R();
  ok(near(r1.w, r.w, 3) && await colourAt(r1.x + r1.w * .25, r1.y + r1.h * .25) === 'blue' && await colourAt(r1.x + r1.w * .75, r1.y + r1.h * .75) === 'green', 'Rotate left after the flip turns it back on its side, as seen (blue top left, green bottom right)');
  await popItem('#pfRotate', '[data-act="fh"]');
  r1 = await R();
  ok(await colourAt(r1.x + r1.w * .25, r1.y + r1.h * .25) === 'yellow' && !(await ds()).flip && (await ds()).rot === '180', 'flipping again leaves it upside down: turned 180°, with no flip');
  await page.click('#pfReset'); await page.waitForTimeout(300);

  // ---- corrections, colour, transparency, artistic effects ----
  const filter = () => pic.evaluate(m => m.querySelector('img').style.filter);
  await page.click('#pfCorr'); await page.waitForTimeout(150);
  ok(await page.locator('.pfpop .pf-th').count() === 30 && await page.locator('.pfpop .pf-th img[src]').count() === 30, 'Corrections shows 30 choices, each with the picture itself');
  await page.hover('.pfpop .pf-th[data-set="bri=40&con=40"]'); await page.waitForTimeout(100);
  ok(/brightness\(1\.4\)/.test(await filter()) && !(await ds()).bri, 'pointing at one tries it on the picture, without keeping it');
  await page.click('.pfpop .pf-th[data-set="bri=20&con=-20"]'); await page.waitForTimeout(250);
  ok(/brightness\(1\.2\) contrast\(0\.8\)/.test(await filter()) && (await ds()).bri === '20', 'Brightness +20%, contrast −20%');
  await popItem('#pfColor', '.pf-th[data-set="recolor=gray"]');
  ok(/grayscale\(1\)/.test(await filter()) && /brightness\(1\.2\)/.test(await filter()), 'Colour: greyscale, on top of the correction');
  await popItem('#pfTrans', '.pf-th[data-set="trans=50"]');
  ok(/opacity\(0\.5\)/.test(await filter()), 'Transparency 50%');
  await popItem('#pfArt', '.pf-th[data-set="art=pencil"]');
  ok(/contrast\(2\.2\)/.test(await filter()), 'an artistic effect: pencil sketch');
  await popItem('#pfCorr', '.pf-th[data-set="sharp=50"]');
  ok(/url\(/.test(await filter()), 'Sharpen 50%');

  // ---- picture styles, border, effects ----
  await page.click('#pfStyles'); await page.waitForTimeout(150);
  await page.hover('.pfpop .pf-th[data-set^="pstyle=white"]'); await page.waitForTimeout(100);
  ok(/8px/.test(await pic.evaluate(m => m.style.boxShadow)) && !(await ds()).pstyle, 'pointing at a picture style tries it on the picture');
  await page.mouse.move(5, 880); await page.waitForTimeout(100);
  ok(!(await pic.evaluate(m => m.style.boxShadow)), 'and pointing away takes it off');
  await page.click('.pfpop .pf-th[data-set^="pstyle=polaroid"]'); await page.waitForTimeout(250);
  ok((await ds()).pstyle === 'polaroid' && /22px/.test(await pic.evaluate(m => m.style.boxShadow)), 'a picture style: an instant photo, with its deep white edge at the bottom');
  await popItem('#pfBorder', '.pf-sw[title="Red"]');
  ok((await ds()).bc === '#ef5350' && /rgb\(239, 83, 80\)/.test(await pic.evaluate(m => getComputedStyle(m).boxShadow)), 'Picture border: red');
  await popItem('#pfBorder', '.pf-mi[data-set="bw=12"]');
  ok((await ds()).bw === '12' && /12px/.test(await pic.evaluate(m => m.style.boxShadow)) && await pic.evaluate(m => getComputedStyle(m).marginLeft === '12px'), 'its weight: 12 px, with room kept round it');
  await popItem('#pfFx', '.pf-th[data-set="rad=28"]');
  ok(await pic.evaluate(m => getComputedStyle(m).borderTopLeftRadius === '28px'), 'Picture effects: rounded corners');
  await popItem('#pfFx', '.pf-th[data-set="glow=#3552c4 12"]');
  ok((await ds()).glow === '#3552c4 12' && /rgb\(53, 82, 196\) 70%.* 0px 0px 12px 18px/.test(await pic.evaluate(m => m.style.boxShadow)), 'and a blue glow, round the frame');

  // ---- alt text ----
  await page.click('#pfAlt'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.activeElement?.id === 'pfAltIn' && document.activeElement.value === 'quads.png'), 'Alt text opens ready to type, with the file name to start with');
  await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('Four coloured squaresx'); await page.keyboard.press('Backspace'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  ok(await pic.evaluate(m => m.querySelector('img').alt === 'Four coloured squares') && !(await page.locator('.pfpop').count()) && await pic.evaluate(m => m.classList.contains('media-sel')), 'the picture gets its alt text (Backspace while typing it did not remove the picture)');

  // ---- size: the ratio locked, and not ----
  await page.click('#pfReset'); await page.waitForTimeout(300);
  await page.fill('#pfW', '3'); await page.press('#pfW', 'Enter'); await page.waitForTimeout(300);
  r = await R();
  ok(near(r.w, 3 * 96 / 2.54, 2) && near(r.w / r.h, 2, .05) && await page.inputValue('#pfH') === '1.5', `width 3 cm: its height follows (1.5 cm), as the ratio is locked (${r.w.toFixed(0)} × ${r.h.toFixed(0)} px)`);
  await page.click('#pfLock'); await page.waitForTimeout(100);
  await page.fill('#pfH', '3'); await page.press('#pfH', 'Enter'); await page.waitForTimeout(300);
  r = await R();
  ok(near(r.w, 3 * 96 / 2.54, 2) && near(r.h, 3 * 96 / 2.54, 2) && (await ds()).stretch, 'unlocked, height 3 cm stretches it, keeping its width');
  await page.click('#pfLock');
  await popItem('#pfResetMore', '[data-act="resetsize"]');
  r = await R(); d = await ds();
  ok(!Object.keys(d).length && near(r.w, 200, 2) && near(r.h, 100, 2), 'Reset picture and size puts it back as it came in (200 × 100)');

  // ---- it all stays after a reload; the PDF draws it ----
  await page.click('#pfCrop'); await page.waitForTimeout(200);
  h = await page.locator('.pfcrop .pf-h[data-d="e"]').boundingBox(); r = await R();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down(); await page.mouse.move(r.x + r.w / 2, h.y + h.height / 2, {steps: 6}); await page.mouse.up();
  await away();
  ok(/^0 0\.(49|5|51)\d* 0 0$/.test((await ds()).crop || '') && !(await tabOn()).shown, 'a click away keeps the crop too (and the tab goes)');
  await select();
  await popItem('#pfStyles', '.pf-th[data-set^="pstyle=white"]');
  await popItem('#pfColor', '.pf-th[data-set="sat=200"]');
  await popItem('#pfRotate', '[data-act="fv"]');
  const src = () => pic.evaluate(m => m.querySelector('img').getAttribute('src')), before = {d: await ds(), r: await R(), f: await filter(), sh: await pic.evaluate(m => m.style.boxShadow), src: await src()};
  // the PDF's drawing of the page shows the crop and the flip
  const pdf = await pic.evaluate(async m => {
    const card = m.closest('.slide'), cv = await paintCard(card, 1), cr = card.getBoundingClientRect(), r = m.getBoundingClientRect(), x = cv.getContext('2d');
    const at = (fx, fy) => [...x.getImageData(Math.round(r.left - cr.left + r.width * fx), Math.round(r.top - cr.top + r.height * fy), 1, 1).data];
    return {tl: at(.5, .25), bl: at(.5, .75)};
  });
  ok(pdf.tl[2] > 150 && pdf.tl[0] < 100 && pdf.bl[0] > 150 && pdf.bl[2] < 100, `the PDF draws it cropped and flipped too: blue over red (${pdf.tl.slice(0, 3)} / ${pdf.bl.slice(0, 3)})`);
  await away(); await page.waitForTimeout(1500);
  await page.reload(); await page.waitForTimeout(2500);
  await pic.evaluate(m => m.scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(300);
  const after = {d: await ds(), r: await R(), f: await filter(), sh: await pic.evaluate(m => m.style.boxShadow)};
  ok(JSON.stringify(after.d) === JSON.stringify(before.d) && after.f === before.f && after.sh === before.sh && near(after.r.w, before.r.w, 1) && near(after.r.h, before.r.h, 1), `after a reload it has its crop, flip, style and colour (${JSON.stringify(after.d)})`);
  r = after.r;
  ok(await colourAt(r.x + r.w / 2, r.y + r.h * .25) === 'blue' && await colourAt(r.x + r.w / 2, r.y + r.h * .75) === 'red', 'and shows them: the left half, upside down (blue over red)');
  ok(await src() === before.src && await pic.evaluate(m => m.querySelector('img').naturalWidth === 200), 'the picture itself is kept just as it came in (nothing drawn into it)');

  // ---- study mode, and the folded toolbar ----
  const was = (await tabOn()).tab; await select();
  ok((await tabOn()).shown, 'selected again after the reload: the tab comes');
  await page.click('#readBtn'); await page.waitForTimeout(300);
  t = await tabOn();
  ok(!t.shown && t.tab === 'view', 'Study mode puts the tab away (study mode is on View)');
  await select(); ok(!(await tabOn()).shown, 'and a picture cannot be selected while studying');
  await page.click('#readBtn'); await page.waitForTimeout(300);
  ok((await tabOn()).tab === was, 'back to editing: the tab you were on before comes back');
  await page.click('#ribbonFold'); await page.waitForTimeout(200);
  await select(); t = await tabOn();
  ok(t.shown && t.selected && await page.evaluate(() => !document.querySelector('#ribbon').classList.contains('peek')), 'tabs only: the Picture Format tab shows, picked, without covering the page');
  await page.click('#tab-picture'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.querySelector('#ribbon').classList.contains('peek') && document.querySelector('#panel-picture').offsetHeight > 30), 'clicking it opens its tools over the page');
  await page.click('#pfCorr'); await page.waitForTimeout(150); await page.click('.pfpop .pf-th[data-set="bri=-20&con="]'); await page.waitForTimeout(250);
  ok((await ds()).bri === '-20', 'and they work from there');
  await away(); await page.click('#ribbonFold'); await page.waitForTimeout(200);

  // ---- how it looks, light and dark ----
  await select();
  for (const th of ['light', 'dark']) {
    await page.evaluate(th => { document.documentElement.dataset.theme = th; }, th); await page.waitForTimeout(250);
    await page.screenshot({path: path.join(OUT, `picformat-${th}.png`), clip: {x: 0, y: 0, width: 1440, height: 150}});
    await page.click('#pfFx'); await page.waitForTimeout(200);
    await page.screenshot({path: path.join(OUT, `picformat-fx-${th}.png`)});
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  }
  await page.click('#pfCrop'); await page.waitForTimeout(200);
  await page.screenshot({path: path.join(OUT, 'picformat-crop.png')});
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => { const p = document.querySelector('#panel-picture'); return [...p.querySelectorAll('button, input:not([type=file])')].every(b => (b.title || b.dataset.tip || b.closest('[title], [data-tip]')) && (b.textContent.trim() || b.getAttribute('aria-label'))); }), 'every tool says what it does');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

// A picture in its own box and the Picture Format tab together: the tab comes for a picture box, cropping it (dragging a handle, or the picture in
// its frame) crops the picture and doesn't move the box, the box is the cropped size, the size boxes and the box's corner resize it keeping the crop,
// a turn makes the box the turned shape, Reset gives the whole picture back, and it all survives a reload
const {open} = require('./harness');
const path = require('path');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const near = (a, b, d) => Math.abs(a - b) <= d;

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(800);
  // a 200 × 100 picture in four colours
  const png = Buffer.from(await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 200; c.height = 100; const x = c.getContext('2d');
    [['#ff0000', 0, 0], ['#00ff00', 100, 0], ['#0000ff', 0, 50], ['#ffff00', 100, 50]].forEach(([f, l, t]) => { x.fillStyle = f; x.fillRect(l, t, 100, 50); });
    return c.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await page.locator('.pagecard').nth(1).click({position: {x: 30, y: 30}}); await page.waitForTimeout(200);
  await page.keyboard.press('Escape'); await page.mouse.click(5, 700); await page.waitForTimeout(200);
  await page.click('#tab-insert');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#mediaBtn')]);
  await fc.setFiles({name: 'quads.png', mimeType: 'image/png', buffer: png}); await page.waitForTimeout(800);
  const box = page.locator('#main .picbox').first(), pic = box.locator('.media');
  ok(await box.count() === 1, 'the picture is on the page in its own box');
  await pic.evaluate(m => m.scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(200);
  const R = l => l.evaluate(m => { const r = m.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; });
  const tab = () => page.evaluate(() => !document.querySelector('#tab-picture').hidden && document.querySelector('#tab-picture').getAttribute('aria-selected') === 'true');
  if (!await tab()) { await page.mouse.click(5, 700); await page.waitForTimeout(200); const r = await R(pic); await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await page.waitForTimeout(300); }
  ok(await tab(), 'a picture box, selected, has the Picture Format tab open');

  // crop the left half off with the handle: the box shrinks to the cropped picture, its right edge stays put
  let b0 = await R(box), p0 = await R(pic);
  await page.click('#pfCrop'); await page.waitForTimeout(250);
  let h = await page.locator('.pfcrop .pf-h[data-d="w"]').boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + p0.w / 2, h.y + h.height / 2, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(150);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  let b1 = await R(box), p1 = await R(pic);
  const crop = await pic.evaluate(m => m.dataset.crop);
  ok(/^0 0 0 0\.(49|5|51)/.test(crop || ''), `the crop is kept (data-crop "${crop}")`);
  ok(near(p1.w / p1.h, 1, .06), `the picture shows its right half, square (${p1.w.toFixed(0)} × ${p1.h.toFixed(0)})`);
  ok(near(b1.w, p1.w, 2) && near(b1.h, p1.h, 4), `the box is the cropped size, not the old one (box ${b1.w.toFixed(0)} × ${b1.h.toFixed(0)})`);

  // dragging the picture in its frame while cropping moves the picture, not the box
  b0 = await R(box);
  await page.click('#pfCrop'); await page.waitForTimeout(250);
  const c = await R(pic);
  await page.mouse.move(c.x + c.w / 2, c.y + c.h / 2); await page.mouse.down();
  await page.mouse.move(c.x + c.w / 2 + 300, c.y + c.h / 2 + 60, {steps: 10}); await page.mouse.up(); await page.waitForTimeout(150);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  b1 = await R(box);
  ok(near(b1.x, b0.x, 2) && near(b1.y, b0.y, 2), 'dragging the picture while cropping leaves the box where it is');
  ok(/^0 0\.(49|5|51)\d* 0 0$/.test(await pic.evaluate(m => m.dataset.crop) || ''), 'and shows the other half of the picture in the frame');

  // the width box makes the picture box wider, and the height follows (the crop is kept)
  p0 = await R(pic);
  await page.fill('#pfW', String((+(await page.inputValue('#pfW')) * 1.5).toFixed(1))); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  b1 = await R(box); p1 = await R(pic);
  ok(near(p1.w, p0.w * 1.5, 4) && near(p1.w / p1.h, 1, .06) && near(b1.w, p1.w, 2), `the width box resizes the picture box, keeping the crop (${p1.w.toFixed(0)} × ${p1.h.toFixed(0)})`);

  // the box's corner resizes it keeping the cropped shape
  p0 = await R(pic);
  await box.hover(); await page.waitForTimeout(200);
  h = await box.locator(':scope > .g-se').boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 - 60, h.y + h.height / 2 - 60, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(300);
  p1 = await R(pic); b1 = await R(box);
  ok(p1.w < p0.w - 30 && near(p1.w / p1.h, 1, .06) && near(b1.w, p1.w, 2), `dragging the box's corner makes it smaller, still square (${p1.w.toFixed(0)} × ${p1.h.toFixed(0)})`);

  // a quarter turn: the box takes the turned shape. Reset gives the whole picture back
  await page.evaluate(() => { const m = document.querySelector('#main .picbox .media'); m.click(); });
  await page.waitForTimeout(250);
  await page.click('#pfCropMore'); await page.waitForTimeout(150); await page.click('.pfpop [data-act="nocrop"]'); await page.waitForTimeout(300);
  p0 = await R(pic);
  ok(near(p0.w / p0.h, 2, .06), 'No crop: the whole picture again, twice as wide as tall');
  await page.click('#pfRotate'); await page.waitForTimeout(150); await page.click('.pfpop [data-act="rr"]'); await page.waitForTimeout(300);
  p1 = await R(pic); b1 = await R(box);
  ok(near(p1.h / p1.w, 2, .1) && near(b1.h, p1.h, 4), `turned a quarter: the picture box is tall now (${b1.w.toFixed(0)} × ${b1.h.toFixed(0)})`);
  const before = await pic.evaluate(m => ({d: JSON.stringify(m.dataset), w: m.closest('.picbox').style.width}));
  await page.mouse.click(5, 700); await page.waitForTimeout(1500);
  await page.reload(); await page.waitForTimeout(2500);
  const after = await page.evaluate(() => { const m = document.querySelector('#main .picbox .media'); return {d: JSON.stringify(m.dataset), w: m.closest('.picbox').style.width, ce: m.closest('.mine').contentEditable}; });
  ok(after.d === before.d && after.w === before.w && after.ce === 'false', `after a reload it is still a picture box with its turn and size (${after.d})`);
  await page.evaluate(() => document.querySelector('#main .picbox .media').scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(200);
  const r = await R(page.locator('#main .picbox .media').first()); await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await page.waitForTimeout(300);
  await page.click('#pfReset'); await page.waitForTimeout(300);
  const p2 = await R(page.locator('#main .picbox .media').first());
  ok(near(p2.w / p2.h, 2, .06), 'Reset: the picture box holds the whole picture, the right way round');
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });

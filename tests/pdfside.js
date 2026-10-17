// The PDF: a side page is painted beside its slide in Default, and beside its printed page in A4, whatever the window width
const {setup} = require('./scalelib');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
(async () => {
  const {browser, page, errors} = await setup(APP, {width: 1280, pages: [1]});
  await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(600);
  const sp = await page.locator('.sidepage').nth(1).boundingBox();
  await page.locator('.pagecard').nth(1).scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const b = await page.locator('.sidepage').nth(1).boundingBox();
  await page.mouse.click(b.x + 40, b.y + 100); await page.keyboard.type('A side note for the PDF'); await page.mouse.click(5, 700); await page.waitForTimeout(500);
  const boxes = async () => page.evaluate(async () => {
    const f = await pdfFile(), t = new TextDecoder('latin1').decode(new Uint8Array(await f.blob.arrayBuffer()));
    return {name: f.name, size: f.blob.size, boxes: [...t.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map(m => [+m[1], +m[2]]), after: {side: side.on, z: viewZoom, shown: sideShown()}};
  });
  for (const lay of ['default', 'a4-portrait']) {
    await page.selectOption('#layout', lay); await page.waitForTimeout(800);
    const w1 = await page.evaluate(() => innerWidth);
    const r1 = await boxes();
    await page.setViewportSize({width: 1700, height: 900}); await page.waitForTimeout(800);
    const r2 = await boxes();
    await page.setViewportSize({width: 1280, height: 900}); await page.waitForTimeout(500);
    console.log(lay, JSON.stringify(r1.boxes.slice(0, 2)), JSON.stringify(r2.boxes.slice(0, 2)), r1.size, r2.size);
    ok(r1.boxes.length === 6, lay + ': one PDF page per slide (' + r1.boxes.length + ')');
    ok(JSON.stringify(r1.boxes) === JSON.stringify(r2.boxes), lay + ': the same page sizes at a narrow and a wide window');
    if (lay === 'a4-portrait') ok(r1.boxes.every(m => m[0] > 595.3 + 300 && Math.abs(m[1] - 841.89) < 1.5), 'A4: each page is as tall as A4 and wider, to hold the side page: ' + r1.boxes[0]);
    else ok(r1.boxes.every(m => Math.abs(m[0] - 595.28) < .1 && m[1] < 595.28 * 1.2), 'Default: A4 wide pages that hold the slide and its side page, so less tall than the slide alone: ' + r1.boxes[0]);
    ok(r1.after.shown && r1.after.z < 1, lay + ': the screen goes back to its scaled layout afterwards');
  }
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

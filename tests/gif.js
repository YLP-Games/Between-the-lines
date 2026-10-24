// Animated GIFs keep moving: an opened GIF is a page that animates (with notes, ink, reload, PDF and notebook file all working),
// a GIF in a note animates and is kept, and a GIF on a PowerPoint slide drawn as it looks moves over the drawing.
// A still (one-frame) GIF opens as any other picture does.
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

// a small GIF89a writer: 128-colour table, 8-bit codes written uncompressed (a clear code every 100 pixels keeps the code size at 8)
function gif(w, h, frames, delay = 40){
  const b = [], u16 = v => b.push(v & 255, v >> 8);
  b.push(...Buffer.from('GIF89a')); u16(w); u16(h); b.push(0xf6, 0, 0);
  const pal = [[255, 255, 255], [0, 0, 0], [220, 30, 30], [30, 60, 220]];
  for (let i = 0; i < 128; i++) b.push(...(pal[i] || [255, 255, 255]));
  if (frames.length > 1) b.push(0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0);          // loop for ever
  for (const px of frames) {
    b.push(0x21, 0xf9, 4, 0, delay & 255, delay >> 8, 0, 0);
    b.push(0x2c); u16(0); u16(0); u16(w); u16(h); b.push(0, 7);
    const codes = [];
    for (let i = 0; i < px.length; i++) { if (i % 100 === 0) codes.push(128); codes.push(px[i]); }
    codes.push(129);
    for (let i = 0; i < codes.length; i += 255) { const s = codes.slice(i, i + 255); b.push(s.length, ...s); }
    b.push(0);
  }
  b.push(0x3b);
  return Buffer.from(b);
}
// handwriting-like bars on three lines (each page unit is half a pixel), and a square that is red on one frame and blue (somewhere else) on the next
const GW = 480, GH = 360;
function frame(sq, colour){
  const px = new Array(GW * GH).fill(0);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if ([[40, 46], [120, 126], [220, 226]].some(([a, z]) => y >= a && y < z) && x >= 20 && x < 300) px[y * GW + x] = 1;
    if (x >= sq[0] && x < sq[0] + 40 && y >= sq[1] && y < sq[1] + 40) px[y * GW + x] = colour;
  }
  return px;
}
const ANIM = gif(GW, GH, [frame([380, 30], 2), frame([380, 250], 3)]);
const STILL = gif(GW, GH, [frame([380, 30], 2)]);

// week2.pptx with an animated GIF on its first slide, shown plainly, and the same GIF turned on its side (which stays still)
async function pptxWithGif(){
  const z = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, 'week2.pptx')));
  const pic = (id, x, y, rot = '') => `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdGif"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm${rot}><a:off x="${x}" y="${y}"/><a:ext cx="2540000" cy="1905000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  const s = (await z.file('ppt/slides/slide1.xml').async('string')).replace('</p:spTree>', pic(10, 6096000, 3400000) + pic(11, 1000000, 4400000, ' rot="5400000"') + '</p:spTree>');
  z.file('ppt/slides/slide1.xml', s);
  z.file('ppt/slides/_rels/slide1.xml.rels', (await z.file('ppt/slides/_rels/slide1.xml.rels').async('string')).replace('</Relationships>', '<Relationship Id="rIdGif" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/anim.gif"/></Relationships>'));
  z.file('ppt/media/anim.gif', ANIM);
  z.file('[Content_Types].xml', (await z.file('[Content_Types].xml').async('string')).replace('<Default Extension="jpeg"', '<Default Extension="gif" ContentType="image/gif"/><Default Extension="jpeg"'));
  return z.generateAsync({type: 'nodebuffer'});
}

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  const pgType = sel => page.$eval(sel, async c => { const u = c.style.getPropertyValue('--pg').match(/url\(["']?(.*?)["']?\)$/)[1]; const b = await (await fetch(u)).blob(); return {type: b.type, size: b.size}; });
  // screenshots of one element a little apart: more than one picture means it moves
  const moving = async loc => { const seen = new Set(); for (let i = 0; i < 12 && seen.size < 2; i++) { seen.add((await loc.screenshot()).toString('base64')); await page.waitForTimeout(170); } return seen.size; };

  // ---- an animated GIF opens as a page that moves ----
  ok(await page.evaluate(b => gifAnimated(new Blob([new Uint8Array(b)])), [...ANIM]) && !(await page.evaluate(b => gifAnimated(new Blob([new Uint8Array(b)])), [...STILL])), 'two frames are told from one');
  await page.setInputFiles('#file', {name: 'dance.gif', mimeType: 'image/gif', buffer: ANIM});
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length === 1, null, {timeout: 20000}); await page.waitForTimeout(500);
  const card = page.locator('.pagecard').first();
  const t = await pgType('.pagecard');
  ok(t.type === 'image/gif' && t.size === ANIM.length, `the page's picture is the GIF itself, not a still copy (${t.type}, ${t.size} bytes)`);
  ok(+(await card.getAttribute('data-w')) === 960 && +(await card.getAttribute('data-h')) === 720, 'in page units, in the GIF\'s shape (960 × 720)');
  ok(await moving(card.locator('.strip').first()) > 1, 'and it moves on screen');
  const gaps = JSON.parse(await card.getAttribute('data-gaps'));
  ok(gaps.some(([a, b]) => a >= 46 * 2 - 2 && b <= 120 * 2 + 2 && b - a > 60), `the gaps between its lines are found on its first frame (${gaps.length} gaps)`);

  // a note between its lines
  const gap = gaps.find(([a, b]) => a >= 46 * 2 - 2 && b <= 120 * 2 + 2 && b - a > 60);
  const s0 = card.locator('.strip').first(); await s0.scrollIntoViewIfNeeded();
  let sb = await s0.boundingBox();
  await page.mouse.move(sb.x + 300, sb.y + sb.height * ((gap[0] + gap[1]) / 2) / 720, {steps: 4}); await page.waitForTimeout(300);
  ok(await card.locator('.gappill').count() === 1, '+ Add here shows on the GIF page');
  await page.click('.gappill'); await page.waitForTimeout(300);
  await page.keyboard.type('Between the frames'); await page.waitForTimeout(300);
  ok(await card.locator(':scope > .strip').count() === 2 && await card.locator(':scope > .notebox .mine').textContent() === 'Between the frames', 'a note goes between its lines, opening the page in two');
  await page.mouse.click(5, 700); await page.waitForTimeout(300);
  ok(await moving(card.locator('.strip').last()) > 1, 'the lower piece of the page still moves');

  // ink on it
  await page.click('#tab-insert'); await page.click('#drawBtn'); await page.waitForTimeout(150);
  sb = await card.locator('.strip').first().boundingBox();
  await page.mouse.move(sb.x + sb.width * 0.2, sb.y + sb.height * 0.5); await page.mouse.down();
  for (const f of [0.3, 0.4, 0.5]) await page.mouse.move(sb.x + sb.width * f, sb.y + sb.height * 0.5 + 10, {steps: 5});
  await page.mouse.up(); await page.waitForTimeout(200);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(JSON.parse(await card.getAttribute('data-ink') || '[]').length === 1 && await card.locator('.strip svg.ink path.pen').count() === 1, 'ink can be drawn on it');

  // ---- a GIF in a note moves and is kept ----
  await card.locator(':scope > .notebox .mine').click(); await page.keyboard.press('End');
  await page.click('#tab-insert');
  await Promise.all([page.waitForEvent('filechooser').then(fc => fc.setFiles({name: 'wave.gif', mimeType: 'image/gif', buffer: ANIM})), page.click('#mediaBtn')]);
  await page.waitForFunction(() => document.querySelector('.notebox .media img'), null, {timeout: 10000}); await page.waitForTimeout(500);
  await page.mouse.click(5, 700); await page.waitForTimeout(300);
  ok(await moving(page.locator('.notebox .media img').first()) > 1, 'a GIF put in a note moves');
  await page.screenshot({path: path.join(OUT, 'gif-1.png')});

  // ---- a still GIF is an ordinary picture page ----
  await page.click('#tab-insert');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addHereBtn')]);
  await fc.setFiles({name: 'still.gif', mimeType: 'image/gif', buffer: STILL});
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length === 2, null, {timeout: 20000}); await page.waitForTimeout(500);
  ok((await pgType('.pagecard:last-of-type')).type === 'image/jpeg', 'a one-frame GIF is drawn and kept as a picture like any other');

  // ---- after a reload ----
  await page.waitForTimeout(1500);
  await page.reload(); await page.waitForTimeout(1500);
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length === 2, null, {timeout: 20000}); await page.waitForTimeout(500);
  const back = await page.$eval('.pagecard', c => ({ink: JSON.parse(c.dataset.ink || '[]').length, note: c.querySelector(':scope > .notebox .mine')?.textContent.trim(), strips: c.querySelectorAll(':scope > .strip').length}));
  ok(back.ink === 1 && back.note === 'Between the frames' && back.strips === 2, 'its note and ink are kept after a reload');
  ok((await pgType('.pagecard')).type === 'image/gif' && await moving(page.locator('.pagecard .strip').first()) > 1, 'and it is still the GIF, still moving');
  const noteImg = await page.$eval('.notebox .media img', async im => (await (await fetch(im.src)).blob()).type);
  ok(noteImg === 'image/gif' && await moving(page.locator('.notebox .media img').first()) > 1, 'the GIF in the note is kept as a GIF and moves after a reload');

  // ---- the PDF download works (a still frame there) ----
  await page.click('#save');
  let [dl] = await Promise.all([page.waitForEvent('download', {timeout: 120000}), page.click('[data-kind=pdf]')]);
  const pdf = fs.readFileSync(await dl.path());
  ok(pdf.slice(0, 5).toString() === '%PDF-' && (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length === 2 && pdf.length > 20000, `the PDF downloads with both pages (${(pdf.length / 1024).toFixed(0)} KB)`);

  // ---- the notebook file carries the GIF, and opens again with it moving ----
  await page.click('#save');
  [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-kind=notebook]')]);
  const nbPath = path.join(OUT, 'gif-notebook.html');
  fs.copyFileSync(await dl.path(), nbPath);
  ok(fs.readFileSync(nbPath, 'utf8').includes('data:image/gif;base64'), 'the downloaded notebook file has the GIF inside it');
  await page.setInputFiles('#file', nbPath);
  await page.waitForFunction(() => document.querySelectorAll('#docList .nb').length === 2 && document.querySelectorAll('.pagecard').length === 2, null, {timeout: 30000}); await page.waitForTimeout(2500);
  ok((await pgType('.pagecard')).type === 'image/gif' && await moving(page.locator('.pagecard .strip').first()) > 1, 'and the notebook file opens with the GIF page moving');

  // ---- a GIF on a PowerPoint slide drawn as it looks ----
  await page.setInputFiles('#file', {name: 'gifdeck.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: await pptxWithGif()});
  await page.waitForFunction(() => document.querySelectorAll('#docList .nb').length === 3 && document.querySelectorAll('.pagecard').length === 2, null, {timeout: 30000}); await page.waitForTimeout(800);
  const slide = page.locator('.pagecard').first();
  const gp = await slide.evaluate(async c => {
    const g = JSON.parse(c.dataset.gifs || '[]'), ims = [...c.querySelectorAll('.strip > .gifpic')];
    return {n: g.length, box: g[0]?.slice(1), W: +c.dataset.w, imgs: ims.length, type: ims[0] ? (await (await fetch(ims[0].src)).blob()).type : '', pe: ims[0] && getComputedStyle(ims[0]).pointerEvents};
  });
  ok(gp.n === 1 && gp.imgs === 1 && gp.type === 'image/gif', 'the upright GIF on the slide is laid over the drawing as the GIF; the one turned on its side stays still');
  ok(Math.abs(gp.box[0] - 480) < 1 && Math.abs(gp.box[2] - 200) < 1 && Math.abs(gp.box[3] - 150) < 1, `where the slide has it, in points (${gp.box.join(', ')})`);
  ok(gp.pe === 'none', 'never in the way of a click');
  await slide.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const gb = await slide.locator('.gifpic').boundingBox(), cb = await slide.boundingBox();
  ok(Math.abs((gb.x - cb.x) / cb.width - gp.box[0] / gp.W) < 0.01 && Math.abs(gb.width / cb.width - gp.box[2] / gp.W) < 0.01, 'and in the right place on screen');
  await page.screenshot({path: path.join(OUT, 'gif-2.png')});
  ok(await moving(slide.locator('.gifpic')) > 1, 'and it moves');
  // ink drawn across it shows on top of it
  await page.click('#tab-insert'); await page.click('#drawBtn'); await page.waitForTimeout(150);
  await page.mouse.move(gb.x - 20, gb.y + gb.height / 2); await page.mouse.down();
  await page.mouse.move(gb.x + gb.width + 20, gb.y + gb.height / 2, {steps: 12}); await page.mouse.up(); await page.waitForTimeout(200);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.screenshot({path: path.join(OUT, 'gif-3.png')});
  ok(await slide.evaluate(c => { const s = c.querySelector('.gifpic').parentElement, ink = s.querySelector(':scope > svg.ink'), g = s.querySelector('.gifpic'); return !!ink && getComputedStyle(g).zIndex === '-1' && getComputedStyle(s).isolation === 'isolate'; }), 'ink on the slide is drawn over the GIF, which stays under it');
  const saved = await page.evaluate(() => currentDoc());
  ok(!saved.includes('gifpic') && saved.includes('data-gifs'), 'what is saved has the GIF once, by name, not the picture laid over it');
  await page.waitForTimeout(1500);
  await page.reload(); await page.waitForTimeout(2000);
  await page.waitForFunction(() => document.querySelector('.pagecard .gifpic'), null, {timeout: 20000});
  ok(await moving(page.locator('.pagecard .gifpic').first()) > 1, 'the slide\'s GIF is back and moving after a reload');
  await page.click('#save');
  [dl] = await Promise.all([page.waitForEvent('download', {timeout: 120000}), page.click('[data-kind=pdf]')]);
  const pdf2 = fs.readFileSync(await dl.path());
  ok(pdf2.slice(0, 5).toString() === '%PDF-', 'the slides with a GIF download as a PDF');

  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

// Pictures open as pages, like a PDF page: a scan of handwritten notes gets the page width, its own shape, gaps between its
// lines, notes, sticky notes and ink, and keeps them after a reload. Big pictures are drawn smaller, odd ones are refused politely.
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const {chromium} = require('playwright');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

// a "scan": off-white paper, faint blue rules every 40px, handwriting on some lines, a blank stretch (600-1000px) and grey specks all over
const SCAN = path.join(OUT, 'scan.jpg'), SW = 1000, SH = 1400;
async function makeScan(){
  const b = await chromium.launch(), p = await b.newPage({viewport: {width: SW, height: SH}});
  await p.setContent(`<body style="margin:0"><canvas id=c width=${SW} height=${SH}></canvas><script>
    const x = c.getContext('2d'); x.fillStyle = '#f6f3ea'; x.fillRect(0, 0, ${SW}, ${SH});
    x.fillStyle = '#bcd0e8'; for (let y = 120; y < ${SH}; y += 40) x.fillRect(60, y, ${SW - 120}, 2);
    x.fillStyle = '#1f2f6b'; x.font = 'italic 28px cursive';
    const lines = ['Lecture 4: demand and supply', 'shift vs movement along the curve', 'price ceiling -> shortage', 'elasticity = %dQ / %dP',
      'inelastic: necessities, few substitutes', 'tax incidence falls on the less elastic side', 'consumer surplus shrinks', 'deadweight loss triangle', 'see textbook ch. 4'];
    lines.forEach((t, i) => x.fillText(t, 80, i < 7 ? 155 + i * 40 : 1035 + (i - 7) * 40));
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    x.fillStyle = '#8a8a8a'; for (let i = 0; i < 400; i++) x.fillRect(Math.floor(rnd() * ${SW}), Math.floor(rnd() * ${SH}), 2, 2);
  </script>`);
  await p.locator('#c').screenshot({path: SCAN, type: 'jpeg', quality: 90});
  await b.close();
}

(async () => {
  await makeScan();
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);

  // ---- a picture on its own: a new notebook with one page, as wide as any page ----
  await page.setInputFiles('#file', path.join(__dirname, 'pic.png'));          // 160 × 90
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length === 1, null, {timeout: 20000}); await page.waitForTimeout(400);
  const small = await page.$eval('.pagecard', c => ({w: +c.dataset.w, h: +c.dataset.h, img: !!c.querySelector('img'), content: !!c.querySelector('.content'), strips: c.querySelectorAll(':scope > .strip').length, pg: c.style.getPropertyValue('--pg'), text: c.dataset.text}));
  ok(small.w === 960 && small.h === 540, `a picture opens as a page card in page units like a PDF page's (${small.w} × ${small.h}, the picture's 16:9)`);
  ok(!small.img && !small.content && small.strips === 1 && /url\(/.test(small.pg), 'drawn as the page picture (--pg) in a strip, not an <img> in a text page');
  ok(small.text === '[]', 'with no words to select');
  const pg = await page.evaluate(async () => { const u = document.querySelector('.pagecard').style.getPropertyValue('--pg').match(/url\(["']?(.*?)["']?\)$/)[1]; const im = await loadImg(u); return [im.naturalWidth, im.naturalHeight]; });
  ok(pg[0] === 160 && pg[1] === 90, `a small picture isn't blown up: it is stored at its own size (${pg.join(' × ')})`);

  // ---- a PDF, then the scan added to the same notebook: the scan is a page among its pages ----
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(800);
  const nPdf = await page.locator('.pagecard').count();
  await page.click('#tab-insert');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addHereBtn')]);
  ok(/image\/\*/.test(await page.getAttribute('#file', 'accept')), 'Open and Add a file here take pictures');
  await fc.setFiles(SCAN);
  await page.waitForFunction(n => document.querySelectorAll('.pagecard').length === n + 1, nPdf, {timeout: 20000}); await page.waitForTimeout(600);
  const scan = page.locator('.pagecard').last();
  const W = +(await scan.getAttribute('data-w')), H = +(await scan.getAttribute('data-h'));
  ok(W === 960 && Math.abs(H - 960 * SH / SW) < 0.2, `the scan keeps its shape (${W} × ${H})`);
  ok(await page.evaluate(() => [...document.querySelectorAll('h2.file-head')].pop().textContent === 'scan'), 'under its own heading, in the notebook that was open');
  await scan.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const [r0, rs] = [await page.locator('.pagecard').first().boundingBox(), await scan.boundingBox()];
  ok(Math.abs(r0.width - rs.width) < 1.5, `as wide as the PDF's pages on screen (${r0.width.toFixed(1)} and ${rs.width.toFixed(1)})`);
  ok(Math.abs(rs.height / rs.width - H / W) < 0.01, 'and as tall as its shape says');

  // the blank rows of the paper are gaps a note can open into, even with specks of dust on them
  const gaps = JSON.parse(await scan.getAttribute('data-gaps')), k = W / SW;
  const inBlank = gaps.filter(([a, b]) => a >= 600 * k && b <= 1000 * k);
  const room = inBlank.reduce((t, [a, b]) => t + b - a, 0);
  ok(inBlank.length >= 8 && room > 0.75 * 400 * k, `the blank stretch of paper is gaps between the rules, specks and all (${inBlank.length} gaps, ${room.toFixed(0)} of ${(400 * k).toFixed(0)} units)`);
  ok(!gaps.some(([a, b]) => a < 140 * k && b > 420 * k), 'the handwritten lines are not one big gap');

  // ---- + Add here: a note between the lines of the scan ----
  const pointAt = async frac => {
    const s = scan.locator('.strip').first(); await s.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 200)); await page.waitForTimeout(300);
    const b = await s.boundingBox(); await page.mouse.move(b.x + 300, b.y + b.height * frac, {steps: 4}); await page.waitForTimeout(250);
  };
  await pointAt(800 / SH);
  ok(await scan.locator('.gappill').count() === 1, '+ Add here shows on the scan');
  await page.click('.gappill'); await page.waitForTimeout(300);
  await page.keyboard.type('Remember the diagram'); await page.waitForTimeout(300);
  ok(await scan.locator(':scope > .notebox .mine').textContent() === 'Remember the diagram', 'a note goes between the lines of the scan');
  const strips = await scan.locator(':scope > .strip').evaluateAll(ss =>ss.map(s => [+s.dataset.y0, +s.dataset.y1]));
  ok(strips.length === 2 && gaps.some(([a, b]) => strips[0][1] >= a - 0.5 && strips[0][1] <= b + 0.5), `the scan opens up in a gap (${strips[0][1]})`);
  await page.mouse.click(5, 700); await page.waitForTimeout(300);

  // ---- a sticky note on the scan, from the menu ----
  await pointAt(0.9);
  await page.click('.gappill', {button: 'right'}); await page.waitForTimeout(250);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await page.keyboard.type('exam!'); await page.waitForTimeout(200);
  ok(await scan.locator(':scope > .notebox.sticky').count() === 1, 'a sticky note sits on the scan');
  await page.mouse.click(5, 700); await page.waitForTimeout(300);

  // ---- ink on the scan ----
  await page.click('#tab-insert'); await page.click('#drawBtn'); await page.waitForTimeout(150);
  const sb = await scan.locator('.strip').first().boundingBox();
  await page.mouse.move(sb.x + sb.width * 0.2, sb.y + sb.height * 0.5); await page.mouse.down();
  for (const f of [0.3, 0.4, 0.5]) await page.mouse.move(sb.x + sb.width * f, sb.y + sb.height * 0.5 + 10, {steps: 5});
  await page.mouse.up(); await page.waitForTimeout(200);
  const ink = JSON.parse(await scan.getAttribute('data-ink') || '[]');
  ok(ink.length === 1 && ink[0].k === 'pen' && Math.abs(ink[0].p[0][0] - W * 0.2) < 3, 'Draw puts a pen stroke on the scan, in page units');
  ok(await scan.locator('.strip svg.ink path.pen').count() === 1, 'drawn over it');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.screenshot({path: path.join(OUT, 'scan-1.png')});

  // ---- all of it is still there after a reload ----
  await page.waitForTimeout(1200);
  await page.reload(); await page.waitForTimeout(1500);
  await page.waitForFunction(n => document.querySelectorAll('.pagecard').length === n + 1, nPdf, {timeout: 20000}); await page.waitForTimeout(400);
  const back = await page.$eval('.pagecard:last-of-type', c => ({ink: JSON.parse(c.dataset.ink || '[]').length, note: c.querySelector(':scope > .notebox:not(.sticky) .mine')?.textContent, sticky: c.querySelectorAll(':scope > .notebox.sticky').length, pg: getComputedStyle(c.querySelector('.strip')).backgroundImage}));
  ok(back.ink === 1 && back.note === 'Remember the diagram' && back.sticky === 1 && /url\(/.test(back.pg), 'the scan, its note, its sticky note and its ink are all kept after a reload');

  // ---- a very big picture is drawn smaller (an iPad can't hold a huge canvas), in its own shape ----
  const big = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 4000; c.height = 6000;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 4000, 6000); x.fillStyle = '#000'; x.fillRect(200, 200, 3600, 40);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8)); c.width = c.height = 0;
    await openFiles([new File([blob], 'big photo.jpg', {type: ''})]);         // no type, as some systems drop it: known by its name
    const pc = [...document.querySelectorAll('.pagecard')].pop(), u = pc.style.getPropertyValue('--pg').match(/url\(["']?(.*?)["']?\)$/)[1], im = await loadImg(u);
    return {n: document.querySelectorAll('.pagecard').length, w: +pc.dataset.w, h: +pc.dataset.h, iw: im.naturalWidth, ih: im.naturalHeight};
  });
  ok(big.n === 1 && big.w === 960 && big.h === 1440, `a picture with no type but a .jpg name opens, as its own notebook (${big.w} × ${big.h})`);
  ok(big.iw * big.ih <= 12e6 && big.iw <= 1920 && Math.abs(big.ih / big.iw - 1.5) < 0.01, `a 4000 × 6000 photo is stored smaller, in the same shape (${big.iw} × ${big.ih})`);

  // ---- a file that only says it is a picture is refused with a message, and nothing is added ----
  const bad = await page.evaluate(async () => {
    await openFiles([new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'broken.png', {type: 'image/png'})]);
    await new Promise(r => setTimeout(r, 300));
    return {n: document.querySelectorAll('.pagecard').length, heads: [...document.querySelectorAll('h2.file-head')].map(h => h.textContent), say: document.querySelector('#toast')?.textContent || ''};
  });
  ok(bad.n === 0 && !bad.heads.includes('broken'), 'a broken picture adds no page and no heading');
  ok(/broken\.png.*couldn't be read.*picture/.test(bad.say), `and says why ("${bad.say.slice(0, 90)}…")`);

  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e) && !/kind of picture/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

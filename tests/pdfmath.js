// A PDF page keeps everything it shows: equations built up slide after slide, text under a soft mask or in a transparency group,
// letters drawn as outlines. Only backgrounds and template artwork (a logo, a footer) are left out, and the hidden text layer never paints.
const {open} = require('./harness'); const path = require('path'); const fs = require('fs'); const zlib = require('zlib');
const {chromium} = require('playwright');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, {recursive: true});
const BUILD = path.join(OUT, 'pdfmath-build.pdf'), RAW = path.join(OUT, 'pdfmath-raw.pdf');
const pt = b => b.map(x => x * 0.75);           // CSS pixels on a 960px slide to PDF points

// lecture slides made in a browser: a background picture, a logo and a footer on every slide; a calculation built up over five
// slides, each line a picture of its equation on a white frame (T_A the same picture every time, T_B new numbers each slide, T_M
// the same picture on three slides in a row near the bottom); KaTeX, an SVG equation and a white box behind text on the first slide
async function buildDeck(){
  const b = await chromium.launch(), p = await b.newPage();
  const png = async (html, css) => { await p.setContent(`<body style="margin:0"><div id=e style="display:inline-block;${css}">${html}</div></body>`); return 'data:image/png;base64,' + (await (await p.$('#e')).screenshot({omitBackground: true})).toString('base64'); };
  const eq = (v, a, c, r) => png(`<i>T</i><sub>${v}</sub> = (${a} − 7.31)/${c} = ${r}`, 'font:italic 30px serif;padding:4px 8px;background:#fff');
  const bg = await png('', 'width:480px;height:270px;background:linear-gradient(135deg,#d3def2,#f2e6cf)');
  const logo = await png('UNI', 'width:90px;height:45px;background:#a22;color:#fff;font:bold 24px sans-serif;text-align:center;line-height:45px;border-radius:8px');
  const foot = await png('', 'width:600px;height:18px;background:repeating-linear-gradient(90deg,#246 0 20px,#9ab 20px 40px)');
  const tA = await eq('A', '20.41', '0.32', '40.94'), tM = await eq('M', '8.21', '1', '0.9');
  const tB = await Promise.all([0, 1, 2, 3, 4].map(k => eq('B', (15.39 + k * 1.11).toFixed(2), '0.19', (42.53 + k * 5.84).toFixed(2))));
  const katex = require(path.join(__dirname, 'node_modules/katex/dist/katex.js')), kx = s => katex.renderToString(s, {output: 'html'});
  const line = (y, v, pic) => `<div class=lbl style="top:${y + 12}px"><i>T</i><sub>${v}</sub> =</div><div class=fr style="top:${y}px"><img src="${pic}"></div>`;
  const slides = [`<h1>Working it out</h1><div class=panel><div style="position:absolute;left:30px;top:20px;font-size:28px">${kx('T_A = \\frac{20.41 - 7.31}{0.32} = 40.94')}</div>
    <svg style="position:absolute;left:30px;top:140px" width=500 height=70><text x=0 y=40 font-family=serif font-style=italic font-size=30>T</text><text x=18 y=48 font-family=serif font-size=18>B</text>
    <text x=40 y=40 font-family=serif font-size=30>= 42.53</text><path d="M180 30 h120 v3 h-120z"/><rect x=320 y=10 width=150 height=40 fill=#fff /><text x=330 y=40 font-size=26>0.19</text></svg>
    <div style="position:absolute;left:30px;top:250px;background:#fff;padding:6px 10px;font:italic 30px serif">T<sub>M</sub> = (8.21 − 7.31)/1 = 0.9</div></div>`];
  for (let k = 1; k <= 5; k++) slides.push(`<h1>Break-even temperatures</h1><div class=panel></div>${line(150, 'A', tA)}${k >= 2 ? line(240, 'B', tB[k - 1]) : ''}${k >= 3 ? line(440, 'M', tM) : ''}`);
  slides.push('<h1>Summary</h1><p style="position:relative;left:10px;top:40px">The break-even temperature is lowest for M.</p>');
  await p.setContent(`<link rel=stylesheet href="file://${path.join(__dirname, 'node_modules/katex/dist/katex.min.css')}"><style>@page{size:960px 540px;margin:0}body{margin:0;font:24px sans-serif}
    section{position:relative;width:960px;height:540px;padding:30px 60px;box-sizing:border-box;page-break-after:always;overflow:hidden}section > *{position:absolute}h1{position:relative;margin:0;font-size:34px}
    .bg{left:0;top:0;width:960px;height:540px}.logo{left:850px;top:15px;width:90px;height:45px}.foot{left:180px;top:505px;width:600px;height:18px}
    .panel{left:60px;top:120px;width:840px;height:380px;background:#f3eedb}.lbl{left:90px;font-size:24px}.fr{left:200px;width:520px;height:56px;background:#fff}.fr img{margin:4px 10px;width:500px;height:48px}</style>` +
    slides.map(s => `<section><img class=bg src="${bg}"><img class=logo src="${logo}"><img class=foot src="${foot}">${s}</section>`).join(''));
  await p.waitForTimeout(300); await p.evaluate(() => document.fonts.ready);
  await p.pdf({path: BUILD, width: '960px', height: '540px', printBackground: true}); await b.close();
}

// a PDF written by hand: text under a soft mask, text in a transparency group the size of the page, and Symbol and Times text
// in fonts the PDF doesn't carry
function rawPdf(){
  const objs = [], obj = s => objs.push(s), st = (d, s) => `<< ${d} /Length ${s.length} >>\nstream\n${s}\nendstream`;
  const F = '/Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >> /F3 << /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >> /F4 << /Type /Font /Subtype /Type1 /BaseFont /Symbol >> >>';
  const line = (y, s) => `BT /F1 24 Tf 60 ${y} Td (${s}) Tj ET\n`;
  obj('<< /Type /Catalog /Pages 2 0 R >>'); obj('<< /Type /Pages /Kids [6 0 R 8 0 R 10 0 R] /Count 3 >>');
  obj(st('/Type /XObject /Subtype /Form /BBox [0 0 720 405] /Group << /S /Transparency /CS /DeviceRGB >>', '1 g 0 0 720 405 re f'));            // 3: the soft mask (all white: shows everything)
  obj(st(`/Type /XObject /Subtype /Form /BBox [0 0 720 405] /Group << /S /Transparency >> /Resources << ${F} >>`, line(280, 'TM = (8.21 - 7.31)/1 = 0.9') + line(220, 'TA = (20.41 - 7.31)/0.32 = 40.94')));   // 4: a page-sized group
  obj(`<< ${F} /ExtGState << /GS1 << /SMask << /Type /Mask /S /Luminosity /G 3 0 R >> >> >> /XObject << /G 4 0 R >> >>`);                     // 5: resources
  const page = (c, cs) => { obj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 720 405] /Resources 5 0 R /Contents ${objs.length + 2} 0 R >>`); obj(st('', cs)); };
  page(6, line(360, 'Soft mask') + 'q /GS1 gs ' + line(280, 'TB = (15.39 - 7.31)/0.19 = 42.53') + '0.2 0.2 0.8 rg 60 200 200 30 re f Q\n');
  page(8, line(360, 'Transparency group') + '/G Do\n');
  page(10, line(360, 'Fonts the PDF leaves out') + 'BT /F2 30 Tf 60 280 Td (T) Tj /F3 18 Tf 0 -7 Td (B) Tj /F4 30 Tf 16 7 Td ( = \\050) Tj /F3 30 Tf (15.39 ) Tj /F4 30 Tf (-) Tj /F3 30 Tf ( 7.31) Tj /F4 30 Tf (\\051/) Tj /F3 30 Tf (0.19 ) Tj /F4 30 Tf (= ) Tj /F3 30 Tf (42.53) Tj ET\nBT /F4 30 Tf 60 200 Td (abgdq \\326 \\345 \\362) Tj ET\n');
  let out = '%PDF-1.7\n'; const offs = objs.map((s, i) => { const o = out.length; out += `${i + 1} 0 obj\n${s}\nendobj\n`; return o; });
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${out.length}\n%%EOF\n`;
  fs.writeFileSync(RAW, out, 'latin1');
}

// each page picture against pdf.js's own drawing of the page: in each box (PDF points), the dark pixels pdf.js draws (ink), the ones
// the page picture draws (mine), and the ones pdf.js draws that the page picture leaves light (lost)
const measure = (page, file, boxes) => page.evaluate(async ([b64, boxes]) => {
  const lib = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/', S = 2;
  const pdf = await pdfjsLib.getDocument({data: Uint8Array.from(atob(b64), c => c.charCodeAt(0)), isEvalSupported: false, cMapUrl: lib + 'cmaps/', cMapPacked: true, standardFontDataUrl: lib + 'standard_fonts/'}).promise;
  const out = [];
  for (const [i, card] of [...document.querySelectorAll('.pagecard')].entries()) {
    const pg = await pdf.getPage(i + 1), v = pg.getViewport({scale: S}), cv = () => { const e = document.createElement('canvas'); e.width = v.width; e.height = v.height; return e.getContext('2d', {willReadFrequently: true}); };
    const ref = cv(); ref.fillStyle = '#fff'; ref.fillRect(0, 0, v.width, v.height); await pg.render({canvasContext: ref, viewport: v}).promise;
    const img = new Image(); img.src = card.style.getPropertyValue('--pg').match(/url\(["']?(.*?)["']?\)$/)[1]; await img.decode();
    const ours = cv(); ours.drawImage(img, 0, 0, v.width, v.height);
    const R = ref.getImageData(0, 0, v.width, v.height).data, O = ours.getImageData(0, 0, v.width, v.height).data, lum = (D, k) => 0.3 * D[k] + 0.59 * D[k + 1] + 0.11 * D[k + 2];
    out.push(boxes.map(([l, t, r, b]) => { let ink = 0, mine = 0, lost = 0, light = 0, all = 0;
      for (let y = Math.round(t * S); y < b * S; y++) for (let x = Math.round(l * S); x < r * S; x++) { const k = (y * v.width + x) * 4, ri = lum(R, k) < 140; all++;
        if (ri) ink++; if (lum(O, k) < 140) mine++; if (ri && lum(O, k) > 215) lost++; if (lum(O, k) > 245) light++; }
      return {ink, mine, lost, light: light / all}; }));
  }
  return out;
}, [fs.readFileSync(file).toString('base64'), boxes]);

(async () => {
  await buildDeck(); rawPdf();
  const {browser, page, errors} = await open(APP);
  const fonts = []; page.on('request', r => { if (/pdfjs-dist@3\.11\.174\/standard_fonts\//.test(r.url())) fonts.push(r.url().split('/').pop()); });
  await page.waitForTimeout(500);
  const openPdf = async (file, n) => { await page.setInputFiles('#file', file); await page.waitForFunction(([t, n]) => document.querySelector('#docTitle')?.textContent.trim() === t && document.querySelectorAll('.pagecard').length === n, [path.basename(file, '.pdf'), n], {timeout: 60000}); await page.waitForTimeout(800); };

  // ---- the calculation built up slide after slide ----
  await openPdf(BUILD, 7);
  const [PANEL, LOGO, FOOT, SIDE, LA, LB, LM] = [[60, 120, 900, 500], [850, 15, 940, 60], [180, 505, 780, 523], [8, 120, 52, 500], [200, 150, 720, 206], [200, 240, 720, 296], [200, 440, 720, 496]].map(pt);
  const m = await measure(page, BUILD, [PANEL, LOGO, FOOT, SIDE, LA, LB, LM]);
  for (const [i, [panel, logo, foot, side, a, b, c]] of m.entries()) {
    const s = `slide ${i + 1}: `;
    ok(panel.ink > 500 && panel.lost <= panel.ink * 0.01, s + `everything on the slide is on its page picture (${panel.lost} of ${panel.ink} dark pixels missing)`);
    if (i >= 1 && i <= 5) ok(a.mine > a.ink * 0.9 && a.lost <= a.ink * 0.01, s + `the picture of T_A = (20.41 − 7.31)/0.32 = 40.94 stays, though it is the same on five slides in a row (${a.mine} of ${a.ink})`);
    if (i >= 2 && i <= 5) ok(b.mine > b.ink * 0.9 && b.lost <= b.ink * 0.01, s + `the picture of T_B, in the same frame with new numbers on each slide, stays (${b.mine} of ${b.ink})`);
    if (i >= 3 && i <= 5) ok(c.mine > c.ink * 0.9 && c.lost <= c.ink * 0.01, s + `the picture of T_M near the bottom, the same on three slides in a row, stays (${c.mine} of ${c.ink})`);
    ok(logo.ink > 500 && logo.mine === 0 && foot.ink > 500 && foot.mine === 0, s + 'the logo and the footer on every slide are template artwork and left out');
    ok(side.light > 0.99, s + 'the background picture is left out');
  }
  const words = await page.$$eval('.pagecard', cs => cs.map(c => JSON.parse(c.dataset.text || '[]').map(t => t[0]).join(' ')));
  ok(['A', 'B', 'M'].every(v => new RegExp(`T\\s*${v}\\s*=`).test(words[5])), 'the labels T_A =, T_B =, T_M = are in the page\'s words');

  // ---- soft mask, transparency group, fonts the PDF leaves out ----
  fonts.length = 0;
  await openPdf(RAW, 3); const used = [...new Set(fonts)];
  const r = await measure(page, RAW, [[0, 0, 720, 405]]);
  ok(r[0][0].ink > 2000 && r[0][0].lost <= r[0][0].ink * 0.01, `text and shapes under a soft mask are on the page picture (${r[0][0].lost} of ${r[0][0].ink} dark pixels missing)`);
  ok(r[1][0].ink > 2000 && r[1][0].lost <= r[1][0].ink * 0.01, `text in a transparency group the size of the page is on the page picture (${r[1][0].lost} of ${r[1][0].ink} missing)`);
  ok(used.some(f => /^FoxitSymbol/.test(f)), 'the Symbol font, which the PDF leaves out, comes from pdf.js\'s standard fonts (' + used.join(', ') + ')');
  ok(r[2][0].ink > 2000 && r[2][0].lost <= r[2][0].ink * 0.01, `and its equation is drawn on the page picture (${r[2][0].lost} of ${r[2][0].ink} missing)`);

  // ---- a filled shape made only of curves (how pdf.js draws letters as outlines) is drawn ----
  const curve = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = c.height = 200; const ctx = c.getContext('2d', {willReadFrequently: true});
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 200, 200); skipBackgrounds(ctx, 1, 200, 200, []);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(100, 50); ctx.quadraticCurveTo(150, 50, 150, 100); ctx.quadraticCurveTo(150, 150, 100, 150); ctx.quadraticCurveTo(50, 150, 50, 100); ctx.quadraticCurveTo(50, 50, 100, 50); ctx.fill();
    return ctx.getImageData(100, 100, 1, 1).data[0];
  });
  ok(curve < 50, 'a letter-like shape drawn with curves only is filled in');

  // ---- the hidden text layer paints nothing, even in a high-contrast theme ----
  const card = page.locator('.pagecard').nth(0); await card.scrollIntoViewIfNeeded(); await page.mouse.move(5, 5); await page.waitForTimeout(300);
  const shot = async () => (await card.screenshot()).toString('base64');
  for (const fc of ['none', 'active']) {
    await page.emulateMedia({forcedColors: fc}); await page.waitForTimeout(300);
    const withText = await shot();
    await page.addStyleTag({content: '.tl{visibility:hidden}'}); await page.waitForTimeout(200);
    const without = await shot(); await page.evaluate(() => document.head.lastElementChild.remove()); await page.waitForTimeout(200);
    ok(withText === without, `forced colours ${fc}: the page looks the same with and without its hidden words`);
  }
  ok(await page.$$eval('.tl', s => s.length > 5 && s.every(x => getComputedStyle(x).forcedColorAdjust === 'none')), 'the hidden words keep their own colours (transparent)');
  await page.emulateMedia({forcedColors: 'none'});

  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

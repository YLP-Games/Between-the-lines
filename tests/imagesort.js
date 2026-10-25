// A lecture PDF or PowerPoint shows each page without its design (slide backgrounds, background photos and gradients behind
// the words, bands along the edges, logos and template artwork on many slides, watermarks), but keeps its content: graphs,
// charts, diagrams, screenshots and photos, big ones and ones that fill the slide included, and a graph built up over a run
// of slides. Each case is a deck made here; what each page shows is read from its stored picture.
const {open} = require('./harness');
const path = require('path'), fs = require('fs'), JSZip = require('jszip');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, page, errors} = await open(APP, {width: 1300, height: 1000});
  await page.waitForTimeout(500);

  // ---- pictures, drawn on canvases in the page: a graph, a screenshot, photos, a gradient, a logo, a band, a watermark ----
  await page.evaluate(() => {
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const make = (w, h, paint) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); return c; };
    const P = window.__pics = {};
    // a bar chart pasted as a picture: white, axes, gridlines, labels, orange-red bars and a dark line
    P.chart = make(1200, 600, (x, w, h) => {
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#ccc'; x.lineWidth = 1; for (let y = 60; y < 520; y += 60) { x.beginPath(); x.moveTo(90, y); x.lineTo(1160, y); x.stroke(); }
      x.strokeStyle = '#222'; x.lineWidth = 3; x.beginPath(); x.moveTo(90, 30); x.lineTo(90, 520); x.lineTo(1160, 520); x.stroke();
      const v = [220, 310, 180, 400, 350, 260, 430, 300];
      v.forEach((b, i) => { x.fillStyle = '#e4572e'; x.fillRect(130 + i * 128, 520 - b, 80, b); x.fillStyle = '#333'; x.font = '22px sans-serif'; x.fillText('Q' + (i + 1), 150 + i * 128, 555); });
      x.strokeStyle = '#1f3a5f'; x.lineWidth = 2; x.beginPath(); v.forEach((b, i) => x.lineTo(170 + i * 128, 500 - b * 0.8)); x.stroke();
      x.fillStyle = '#333'; x.font = '20px sans-serif'; for (let i = 0; i <= 8; i++) x.fillText(String(i * 50), 30, 525 - i * 60);
    });
    // a screenshot of an editor: a blue title bar, a pale grey side bar (narrow, like a side band), coloured code on white
    P.shot = make(1440, 810, (x, w, h) => {
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#2c5aa0'; x.fillRect(0, 0, w, 48);
      x.fillStyle = '#dfe3e8'; x.fillRect(0, 48, 130, h - 48);
      x.fillStyle = '#6b7280'; for (let y = 80; y < h; y += 60) x.fillRect(45, y, 40, 30);
      const cols = ['#a31515', '#0000ff', '#008000', '#795e26'];
      for (let y = 90, i = 0; y < h - 20; y += 34, i++) { let cx = 170 + (i % 4) * 30; for (let k = 0; k < 5; k++) { const len = 40 + rnd() * 120; x.fillStyle = cols[(i + k) % 4]; x.fillRect(cx, y, len, 14); cx += len + 18; } }
    });
    // photos: a busy light one, a dark one
    const photo = (base, light) => make(1440, 810, (x, w, h) => {
      x.fillStyle = base; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { const r = 10 + rnd() * 70; x.fillStyle = light ? `hsl(${rnd() * 360},55%,${72 + rnd() * 15}%)` : `hsl(${rnd() * 360},40%,${12 + rnd() * 18}%)`; x.beginPath(); x.arc(rnd() * w, rnd() * h, r, 0, 7); x.fill(); }
    });
    P.photo = photo('#e9eef2', true); P.dark = photo('#1c2733', false);
    P.gradient = make(1440, 810, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#1d4fb8'); g.addColorStop(1, '#6a2bb0'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    P.logo = make(120, 70, (x, w, h) => { x.fillStyle = '#00a651'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = 'bold 40px sans-serif'; x.fillText('UNI', 18, 50); });
    P.red = make(80, 70, (x, w, h) => { x.fillStyle = '#d62728'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(20, 20, 40, 30); });
    P.band = make(1440, 96, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#7a1fa2'); g.addColorStop(1, '#8e24aa'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    P.mark = make(400, 400, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#f2b134'; x.beginPath(); x.arc(200, 200, 190, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 90px serif'; x.fillText('UoX', 110, 230); });
    // a pale blue panel, flat colour (a gradient)
    P.panel = make(800, 616, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#aed6f1'); g.addColorStop(1, '#9cc9ea'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    // a diagram: boxes, arrows and outlines (its labels are words drawn on top of it in the PDF)
    P.diagram = make(1120, 640, (x, w, h) => {
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.lineWidth = 4; x.strokeStyle = '#4b0082';
      [[60, 60], [420, 60], [780, 60], [240, 380], [600, 380]].forEach(([bx, by], i) => { x.fillStyle = ['#c0392b', '#16a085', '#2980b9', '#8e44ad', '#d35400'][i]; x.fillRect(bx, by, 280, 160); x.strokeRect(bx, by, 280, 160); });
      x.beginPath(); x.moveTo(340, 140); x.lineTo(420, 140); x.moveTo(700, 140); x.lineTo(780, 140); x.moveTo(380, 220); x.lineTo(380, 380); x.moveTo(740, 220); x.lineTo(740, 380); x.stroke();
    });
    // a background made of 3 Ã— 3 tiles, each a piece of a gradient
    for (let i = 0; i < 9; i++) P['tile' + i] = make(480, 270, (x, w, h) => { x.fillStyle = `hsl(${200 + i * 8},60%,${38 + i * 2}%)`; x.fillRect(0, 0, w, h); });
  });

  // ---- a PDF made here: each page draws pictures (name, x, y, w, h in points, from the top left) and words ----
  const openPdf = (name, W, H, pages) => page.evaluate(async ([name, W, H, pages]) => {
    const P = window.__pics, enc = new TextEncoder(), chunks = [], offs = []; let len = 0;
    const used = [...new Set(pages.flatMap(p => p.filter(o => o.pic).map(o => o.pic)))];
    const jpeg = {}; for (const u of used) jpeg[u] = new Uint8Array(await (await new Promise(r => P[u].toBlob(r, 'image/jpeg', 0.92))).arrayBuffer());
    const esc = t => t.replace(/[\\()]/g, m => '\\' + m);
    const content = items => items.map(o => o.pic ? `q ${o.w} 0 0 ${o.h} ${o.x} ${H - o.y - o.h} cm /${o.pic} Do Q`
      : o.rect ? `q ${o.rect.map(v => (v / 255).toFixed(3)).join(' ')} rg ${o.x} ${H - o.y - o.h} ${o.w} ${o.h} re f Q`
      : `BT /F1 ${o.size || 18} Tf ${o.white ? '1 g' : '0 g'} ${o.x} ${H - o.y} Td (${esc(o.text)}) Tj ET`).join('\n');
    const push = d => { const b = typeof d === 'string' ? enc.encode(d) : d; chunks.push(b); len += b.length; };
    const obj = (n, ...parts) => { offs[n] = len; push(`${n} 0 obj\n`); parts.forEach(push); push('\nendobj\n'); };
    const first = 4 + pages.length * 2, imgNo = Object.fromEntries(used.map((u, i) => [u, first + i]));
    push('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
    obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const xo = used.map(u => `/${u} ${imgNo[u]} 0 R`).join(' ');
    pages.forEach((items, i) => {
      const c = content(items);
      obj(4 + i * 2, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << ${xo} >> /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
      obj(5 + i * 2, `<< /Length ${enc.encode(c).length} >>\nstream\n${c}\nendstream`);
    });
    for (const u of used) obj(imgNo[u], `<< /Type /XObject /Subtype /Image /Width ${P[u].width} /Height ${P[u].height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg[u].length} >>\nstream\n`, jpeg[u], '\nendstream');
    const xref = len, size = offs.length;
    push(`xref\n0 ${size}\n0000000000 65535 f \n` + offs.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
    push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    await openFiles([new File(chunks, name, {type: 'application/pdf'})]);
  }, [name, W, H, pages]);

  // the pages of the file just opened (after its heading), their pictures kept in the page for measuring
  const grab = () => page.evaluate(async () => {
    const head = [...document.querySelectorAll('#main .file-head')].pop(), cards = [];
    for (let s = head.nextElementSibling; s && !s.classList.contains('file-head'); s = s.nextElementSibling) if (s.classList.contains('slide')) cards.push(s);
    window.__px = [];
    for (const c of cards) {
      const u = c.style.getPropertyValue('--pg').match(/url\(["']?(.*?)["']?\)$/)?.[1]; if (!u) { window.__px.push(null); continue; }
      const im = await loadImg(u), cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const x = cv.getContext('2d'); x.drawImage(im, 0, 0); window.__px.push({w: cv.width, h: cv.height, d: x.getImageData(0, 0, cv.width, cv.height).data});
    }
    return cards.map(c => ({text: (() => { try { return JSON.parse(c.dataset.text || '[]').map(t => t[0]).join(' '); } catch { return ''; } })(), imgs: c.querySelectorAll('.content img').length, html: c.textContent}));
  });
  // the share of a part of page n (fractions of its width and height) that is near a colour, or (rgb null) near white
  const share = (n, [x0, y0, x1, y1], rgb, tol = 40) => page.evaluate(([n, x0, y0, x1, y1, rgb, tol]) => {
    const {w, h, d} = window.__px[n]; let hit = 0, all = 0;
    for (let y = Math.floor(y0 * h); y < Math.min(h, Math.ceil(y1 * h)); y += 2) for (let x = Math.floor(x0 * w); x < Math.min(w, Math.ceil(x1 * w)); x += 2) {
      const i = (y * w + x) * 4, c = rgb || [255, 255, 255]; all++;
      if (Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) < tol * (rgb ? 1.5 : 1)) hit++;
    }
    return all ? hit / all : 0;
  }, [n, x0, y0, x1, y1, rgb, tol]);
  const pct = v => (v * 100).toFixed(1) + '%';
  const ORANGE = [228, 87, 46], GREEN = [0, 166, 81], PURPLE = [122, 31, 162], AMBER = [242, 177, 52], TEAL = [11, 110, 79], RED = [214, 39, 40], SIDE = [223, 227, 232], NAVY = [20, 40, 90], BLUEBAR = [44, 90, 160], PANEL = [165, 208, 238];

  // ======== PDF 1: a 10-slide lecture deck exported from PowerPoint (16:9), with a university template ========
  // every slide: a purple band picture across the top and a green logo on it (template artwork)
  const W = 720, H = 405, tpl = [{pic: 'band', x: 0, y: 0, w: 720, h: 48}, {pic: 'logo', x: 640, y: 6, w: 66, h: 36}];
  const t = (text, y = 80, size = 28, x = 40, white) => ({text, x, y, size, white});
  await openPdf('lecture deck.pdf', W, H, [
    // the title slide: a navy band (a filled shape) across the slide with the title in white on it
    [...tpl, {rect: NAVY, x: 0, y: 130, w: 720, h: 110}, t('Lecture 3: Markets and prices', 180, 36, 40, true), t('Introduction to economics', 220, 20, 40, true)],
    // a big chart (70% of the slide) under its title, which is outside it, and a footnote below it
    [...tpl, t('Prices over eight quarters'), {pic: 'chart', x: 20, y: 95, w: 680, h: 300}, t('Source: Office for National Statistics', 402, 8)],
    // a wide chart reaching the bottom edge of the slide (sent behind the words, which are above it)
    [...tpl, {pic: 'chart', x: 40, y: 140, w: 640, h: 265}, t('Output by quarter'), t('Seasonally adjusted, millions', 115, 16)],
    // the same chart on three slides in a row while points are added beside it (the last with a label on the chart)
    [...tpl, t('Building the picture'), t('Demand rises', 130, 18), {pic: 'chart', x: 300, y: 100, w: 390, h: 260}],
    [...tpl, t('Building the picture'), t('Demand rises', 130, 18), t('Supply lags', 160, 18), {pic: 'chart', x: 300, y: 100, w: 390, h: 260}],
    [...tpl, t('Building the picture'), t('Demand rises', 130, 18), t('Supply lags', 160, 18), t('Prices peak', 190, 18), {pic: 'chart', x: 300, y: 100, w: 390, h: 260}, t('Peak', 160, 11, 600)],
    // a screenshot filling the whole slide, nothing on top of it
    [...tpl, {pic: 'shot', x: 0, y: 0, w: 720, h: 405}],
    // a busy photo behind the title and bullets
    [...tpl, {pic: 'photo', x: 0, y: 0, w: 720, h: 405}, t('Case study: the coffee market'), t('Brazil grows a third of the world', 140, 20), t('Frost in 2021 cut the harvest', 175, 20), t('Prices doubled within a year', 210, 20)],
    // a gradient background behind the title and bullets
    [...tpl, {pic: 'gradient', x: 0, y: 0, w: 720, h: 405}, t('Summary'), t('Demand slopes down', 140, 20), t('Supply slopes up', 175, 20)],
    // a dark photo behind white words: it stays, or the words would vanish on white paper
    [...tpl, {pic: 'dark', x: 0, y: 0, w: 720, h: 405}, t('Questions?', 80, 32, 40, true), t('Office hours on Thursday', 140, 20, 40, true)],
  ]);
  await page.waitForTimeout(800);
  let cards = await grab();
  ok(cards.length === 10, `the deck opens as ten pages (${cards.length})`);
  for (let i = 0; i < 10; i++) {
    if (i === 6) continue;          // (the screenshot covers the template there)
    const logo = await share(i, [0.89, 0.015, 0.98, 0.1], GREEN), band = await share(i, [0.02, 0.01, 0.85, 0.11], PURPLE);
    ok(logo < 0.01 && band < 0.01, `page ${i + 1}: the logo in the top right corner and the band across the top (on every slide) are left out (${pct(logo)}, ${pct(band)})`);
  }
  let v = await share(1, [0.03, 0.24, 0.97, 0.97], ORANGE);
  ok(v > 0.08, `a big chart (70% of the slide) under its title is kept (${pct(v)} of it is its bars)`);
  ok(cards[1].text.includes('Prices over eight quarters'), 'and its title is there to select');
  v = await share(2, [0.06, 0.36, 0.94, 1], ORANGE);
  ok(v > 0.08, `a wide chart reaching the bottom edge of the slide is kept (${pct(v)})`);
  for (const i of [3, 4, 5]) { v = await share(i, [0.42, 0.25, 0.96, 0.89], ORANGE); ok(v > 0.08, `page ${i + 1}: the chart built up over three slides in a row is kept (${pct(v)})`); }
  v = await share(6, [0.005, 0.15, 0.08, 0.95], SIDE);
  const bar = await share(6, [0.2, 0.005, 0.95, 0.05], BLUEBAR), code = 1 - await share(6, [0.12, 0.1, 0.9, 0.95], null);
  ok(v > 0.6 && bar > 0.6 && code > 0.15, `a screenshot filling the slide, with nothing on top, is kept, its narrow side bar too (${pct(v)} side bar, ${pct(bar)} title bar, ${pct(code)} code)`);
  v = await share(7, [0.62, 0.62, 0.99, 0.99], null);
  ok(v > 0.97, `a busy photo behind the title and bullets is left out (${pct(v)} of a bare corner is white)`);
  ok(cards[7].text.includes('Case study') && cards[7].text.includes('Frost in 2021'), 'and the words on it stay');
  v = Math.min(await share(8, [0.4, 0.15, 1, 0.5], null), await share(8, [0.6, 0.6, 1, 1], null));
  ok(v > 0.97, `a gradient behind the title and bullets is left out (${pct(v)} white)`);
  v = await share(9, [0.6, 0.6, 0.99, 0.99], null);
  ok(v < 0.2, `a dark photo behind white words stays, so the words can still be read (${pct(v)} white)`);
  v = await share(0, [0.7, 0.34, 0.99, 0.58], NAVY);
  ok(v > 0.9 && cards[0].text.includes('Lecture 3'), `a dark band behind white words (a filled shape across the slide) stays too (${pct(v)})`);

  // ======== PDF 2: six slides with a watermark in the middle of each, a header bar set in from the edges, a logo that shifts ========
  const tpl2 = i => [{pic: 'mark', x: 260, y: 112, w: 200, h: 200}, {rect: TEAL, x: 14, y: 8, w: 692, h: 42}, {pic: 'red', x: 12 + (i % 2) * 3, y: 362 + (i % 2) * 2, w: 40, h: 35}];
  const words = [t('Elasticity', 90), t('Price elasticity of demand', 150, 20, 230), t('Responds to price changes', 190, 20, 230), t('Luxuries are elastic', 230, 20, 230), t('Necessities are not', 270, 20, 230)];
  const tiles = []; for (let i = 0; i < 9; i++) tiles.push({pic: 'tile' + i, x: (i % 3) * 240, y: Math.floor(i / 3) * 135, w: 240, h: 135});
  await openPdf('watermarked.pdf', W, H, [
    [...tpl2(0), ...words],
    // a background made of nine tiles, words on top (on the left)
    [...tpl2(1), ...tiles, t('Tiled background', 90), t('Nine pieces of one picture', 150, 20), t('Words on top of it', 190, 20)],
    // a flat pale panel at the right edge with the bullets on it, the title outside it
    [...tpl2(2), t('Cross elasticity', 90), {pic: 'panel', x: 324, y: 110, w: 396, h: 295}, t('Substitutes: positive', 160, 20, 345), t('Complements: negative', 200, 20, 345)],
    // a big diagram with its labels typed on top, the title above it
    [...tpl2(3), t('The market system'), {pic: 'diagram', x: 140, y: 82, w: 560, h: 320}, t('Households', 135, 11, 180), t('Firms', 135, 11, 330), t('Government', 135, 11, 480), t('Goods market', 300, 11, 260), t('Labour market', 300, 11, 410)],
    [...tpl2(4), ...words],
    [...tpl2(5), ...words],
  ]);
  await page.waitForTimeout(800);
  cards = await grab();
  ok(cards.length === 6, `the second deck opens as six pages (${cards.length})`);
  for (let i = 0; i < 6; i++) {
    const mark = await share(i, [0.36, 0.28, 0.64, 0.77], AMBER), head = await share(i, [0.03, 0.025, 0.97, 0.12], TEAL), logo = await share(i, [0.01, 0.89, 0.08, 0.99], RED);
    ok(mark < 0.01 && head < 0.01 && logo < 0.01, `page ${i + 1}: the watermark in the middle (on every slide), the header bar set in from the edges and the logo that shifts a little are left out (${pct(mark)}, ${pct(head)}, ${pct(logo)})`);
    ok(cards[i].text.includes(i === 1 ? 'Tiled background' : i === 2 ? 'Cross elasticity' : i === 3 ? 'The market system' : 'Elasticity'), `page ${i + 1}: its words stay`);
  }
  v = Math.min(await share(1, [0.55, 0.36, 0.95, 0.64], null), await share(1, [0.7, 0.7, 0.99, 0.99], null));
  ok(v > 0.97, `a background made of nine tiles is left out, its middle tile too (${pct(v)} white)`);
  v = await share(2, [0.47, 0.6, 0.99, 0.99], PANEL);
  ok(v < 0.02, `a flat pale panel with the bullets on it is left out (${pct(v)})`);
  v = 1 - await share(3, [0.22, 0.25, 0.95, 0.95], null);
  ok(v > 0.3, `a big diagram with labels typed on top of it, under its title, is kept (${pct(v)} of it is drawn)`);
  ok(cards[3].text.includes('Households'), 'and its labels stay');

  // ======== PowerPoint: week2.pptx made into a 4-slide deck with a logo on its master and pictures on its slides ========
  const pngs = await page.evaluate(() => Object.fromEntries(['chart', 'photo', 'dark', 'logo', 'red', 'gradient'].map(k => [k, window.__pics[k].toDataURL('image/png').split(',')[1]])));
  const E = 12700, A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const pic = (id, rid, x, y, w, h) => `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x * E}" y="${y * E}"/><a:ext cx="${w * E}" cy="${h * E}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  const run = (text, white) => `<a:r><a:rPr lang="en-GB" dirty="0">${white ? '<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>' : ''}</a:rPr><a:t>${text}</a:t></a:r>`;
  const title = (text, white) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p>${run(text, white)}</a:p></p:txBody></p:sp>`;
  const body = (lines, white) => `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${lines.map(l => `<a:p>${run(l, white)}</a:p>`).join('')}</p:txBody></p:sp>`;
  const sld = (inner, bg = '') => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${A}><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${inner}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const R = (id, type, target) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
  // the same small logo pasted onto every slide in the bottom left corner (not on the master): template artwork too
  const pasted = pic(9, 'rIdRed', 14, 456, 80, 70);
  const slides = [
    // a picture background (the slide's own background fill) behind the title and bullets
    {xml: sld(title('Supply and demand') + body(['Demand slopes down', 'Supply slopes up']) + pasted, '<p:bg><p:bgPr><a:blipFill><a:blip r:embed="rIdGrad"/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>'), media: ['rIdGrad', 'rIdRed']},
    // the slide's own chart picture, big, under its title
    {xml: sld(title('Prices over eight quarters') + pic(4, 'rIdChart', 30, 140, 660, 380) + pasted), media: ['rIdChart', 'rIdRed']},
    // a photo covering the slide, sent to the back, with the title and bullets on it
    {xml: sld(pic(4, 'rIdPhoto', 0, 0, 720, 540) + title('Case study: coffee') + body(['Frost cut the harvest', 'Prices doubled']) + pasted), media: ['rIdPhoto', 'rIdRed']},
    // a dark photo behind white words: it stays
    {xml: sld(pic(4, 'rIdDark', 0, 0, 720, 540) + title('Questions?', true) + body(['Office hours on Thursday'], true) + pasted), media: ['rIdDark', 'rIdRed']},
  ];
  const MEDIA = {rIdGrad: 'gradient', rIdRed: 'red', rIdChart: 'chart', rIdPhoto: 'photo', rIdDark: 'dark'};
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, 'week2.pptx')));
  for (const [k, b] of Object.entries(pngs)) zip.file(`ppt/media/${k}.png`, Buffer.from(b, 'base64'));
  let types = await zip.file('[Content_Types].xml').async('string');
  if (!/Extension="png"/.test(types)) types = types.replace('<Default Extension="rels"', '<Default Extension="png" ContentType="image/png"/><Default Extension="rels"');
  types = types.replace(/<Override PartName="\/ppt\/slides\/[^>]*\/>/g, '').replace('</Types>', slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('') + '</Types>');
  zip.file('[Content_Types].xml', types);
  slides.forEach((s, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, s.xml);
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${R('rId1', 'slideLayout', '../slideLayouts/slideLayout2.xml')}${s.media.map(m => R(m, 'image', `../media/${MEDIA[m]}.png`)).join('')}</Relationships>`);
  });
  let pres = await zip.file('ppt/presentation.xml').async('string');
  pres = pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rIdS${i + 1}"/>`).join('')}</p:sldIdLst>`);
  zip.file('ppt/presentation.xml', pres);
  let prel = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
  prel = prel.replace(/<Relationship Id="rId\d+" Type="[^"]*\/slide" Target="slides\/slide\d+\.xml"\/>/g, '').replace('</Relationships>', slides.map((_, i) => R(`rIdS${i + 1}`, 'slide', `slides/slide${i + 1}.xml`)).join('') + '</Relationships>');
  zip.file('ppt/_rels/presentation.xml.rels', prel);
  // the master: a green logo in the top right corner of every slide
  let mas = await zip.file('ppt/slideMasters/slideMaster1.xml').async('string');
  mas = mas.replace('</p:spTree>', pic(99, 'rIdLogo', 600, 12, 100, 58) + '</p:spTree>');
  zip.file('ppt/slideMasters/slideMaster1.xml', mas);
  let mrel = await zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels').async('string');
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', mrel.replace('</Relationships>', R('rIdLogo', 'image', '../media/logo.png') + '</Relationships>'));
  const pptx = (await zip.generateAsync({type: 'nodebuffer'})).toString('base64');
  const openPptx = (name, mode) => page.evaluate(async ([b, name, mode]) => {
    pref.set('pptx-mode', mode);
    const bytes = Uint8Array.from(atob(b), c => c.charCodeAt(0));
    await openFiles([new File([bytes], name, {type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'})]);
  }, [pptx, name, mode]);

  // ---- as the slides look ----
  await openPptx('template deck.pptx', 'look'); await page.waitForTimeout(800);
  cards = await grab();
  ok(cards.length === 4, `the PowerPoint opens as four pages (${cards.length})`);
  for (let i = 0; i < 4; i++) {
    if (i === 3) continue;          // (the dark photo stays there, logos and all)
    const logo = await share(i, [0.84, 0.03, 0.96, 0.12], GREEN), red = await share(i, [0.025, 0.85, 0.125, 0.97], RED);
    ok(logo < 0.01 && red < 0.01, `slide ${i + 1}: the master's logo and the logo pasted onto every slide are left out (${pct(logo)}, ${pct(red)})`);
  }
  v = Math.min(await share(0, [0, 0, 0.12, 0.2], null), await share(0, [0.15, 0.82, 1, 1], null));
  ok(v > 0.97, `slide 1: its picture background is left out (${pct(v)} white)`);
  ok(cards[0].text.includes('Supply and demand') && cards[0].text.includes('Demand slopes down'), 'and its words stay');
  v = await share(1, [0.05, 0.27, 0.95, 0.95], ORANGE);
  ok(v > 0.08, `slide 2: the slide's own big chart picture is kept (${pct(v)})`);
  v = await share(2, [0.62, 0.8, 0.99, 0.99], null);
  ok(v > 0.97, `slide 3: a photo sent to the back of the slide behind the title and bullets is left out (${pct(v)} white)`);
  ok(cards[2].text.includes('Case study: coffee'), 'and its words stay');
  v = await share(3, [0.62, 0.8, 0.99, 0.99], null);
  ok(v < 0.2, `slide 4: a dark photo behind white words stays (${pct(v)} white)`);
  // a native chart (drawn from the numbers in the file) is content
  await page.evaluate(() => pref.set('pptx-mode', 'look'));
  await page.setInputFiles('#file', path.join(__dirname, 'fid-charts.pptx'));
  await page.waitForFunction(() => document.querySelector('#main .file-head')?.textContent === 'fid-charts' && document.querySelectorAll('.pagecard').length >= 5, null, {timeout: 60000});
  await page.waitForTimeout(800); cards = await grab();
  v = 1 - await share(0, [0.15, 0.25, 0.85, 0.9], null);
  ok(v > 0.1, `a native chart filling most of its slide is kept (${pct(v)} of it is drawn)`);

  // ---- rebuilt as editable text: the same pictures kept and left out ----
  await openPptx('template deck.pptx', 'text'); await page.waitForTimeout(800);
  cards = await grab();
  ok(cards.length === 4, `as editable text it opens as four slides (${cards.length})`);
  ok(cards[1].imgs === 1, `slide 2: its chart picture is kept (${cards[1].imgs} picture)`);
  ok(cards[0].imgs === 0 && cards[2].imgs === 0, `slides 1 and 3: no background picture, and no logo pasted onto every slide (${cards[0].imgs}, ${cards[2].imgs})`);
  ok(cards[2].html.includes('Case study: coffee') && cards[0].html.includes('Demand slopes down'), 'and their words are there');
  await page.evaluate(() => pref.set('pptx-mode', 'look'));

  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });

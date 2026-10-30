// A PowerPoint opened as the slides look: every piece of text you can see on a slide can be selected and copied, as on a PDF
// page, wherever it is (turned, written down the side, in a group, a table, SmartArt, WordArt or a chart), lined up with the
// drawing, in reading order, with nothing on top of it; and + Add here, sticky notes and ink still work over those slides
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

// The deck: fid-charts.pptx (slide 1 is a column chart with a legend under a title) with slides 2 and 3 made here.
// Slide 2: words turned, upside down, written down the side, in groups (one shrunk, one turned), WordArt, a mirrored box and
// a title that takes its place from the layout. Slide 3: a table and SmartArt (one of its shapes turned).
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const E = v => Math.round(v * 914400);                       // inches → EMU
const xfrm = ([x, y, w, h], at = '', tag = 'a:xfrm') => `<${tag}${at}><a:off x="${E(x)}" y="${E(y)}"/><a:ext cx="${E(w)}" cy="${E(h)}"/></${tag}>`;
const run = (t, sz = 2400, col = '1F2937') => `<a:r><a:rPr lang="en-US" sz="${sz}"><a:solidFill><a:srgbClr val="${col}"/></a:solidFill></a:rPr><a:t>${t}</a:t></a:r>`;
const box = (id, b, t, {rot = 0, flipH = false, vert = '', warp = '', sz = 2400, ns = 'p'} = {}) =>
  `<${ns}:sp><${ns}:nvSpPr><${ns}:cNvPr id="${id}" name="Box ${id}"/><${ns}:cNvSpPr txBox="1"/>${ns === 'p' ? '<p:nvPr/>' : ''}</${ns}:nvSpPr><${ns}:spPr>${xfrm(b, (rot ? ` rot="${Math.round(((rot % 360) + 360) % 360 * 60000)}"` : '') + (flipH ? ' flipH="1"' : ''))}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></${ns}:spPr>`
  + `<${ns}:txBody><a:bodyPr wrap="square"${vert ? ` vert="${vert}"` : ''}>${warp ? `<a:prstTxWarp prst="${warp}"><a:avLst/></a:prstTxWarp>` : ''}</a:bodyPr><a:lstStyle/><a:p>${run(t, sz)}</a:p></${ns}:txBody></${ns}:sp>`;
const grp = (id, b, ch, kids, rot = 0) => `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="Group ${id}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm${rot ? ` rot="${rot * 60000}"` : ''}><a:off x="${E(b[0])}" y="${E(b[1])}"/><a:ext cx="${E(b[2])}" cy="${E(b[3])}"/><a:chOff x="0" y="0"/><a:chExt cx="${E(ch[0])}" cy="${E(ch[1])}"/></a:xfrm></p:grpSpPr>${kids}</p:grpSp>`;
const sld = shapes => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${A}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
const title = t => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`;
// what each slide says, and where (the box it lies in, in inches: x, y, w, h, before turning)
const S2 = [
  ['Inherited title words', null],
  ['Plain box words', [0.4, 1.5, 4, 0.6]],
  ['Tilted words here', [4.8, 1.6, 4, 0.6], {rot: -30}],
  ['Turned sideways', [9.6, 3.6, 3.2, 0.6], {rot: 90}],
  ['Down the side', [12.4, 1.6, 0.7, 3.4], {vert: 'eaVert', sz: 2000}],
  ['Up the side', [9.0, 4.6, 0.7, 2.6], {vert: 'vert270', sz: 2000}],
  ['WordArt words', [0.4, 2.4, 4, 0.9], {warp: 'textArchUp', sz: 3200}],
  ['Mirrored box words', [0.4, 5.4, 4, 0.6], {flipH: true}],
  ['Upside down words', [4.8, 4.6, 4, 0.6], {rot: 180}],
  ['Grouped first', [0.4, 3.6, 4, 0.7]], ['Grouped second', [0.4, 4.3, 4, 0.7]], ['Group turned', [4.8, 3.3, 4, 0.9], {rot: 10}],
];
const slide2 = sld(title(S2[0][0]) + S2.slice(1, -3).map(([t, b, o], i) => box(10 + i, b, t, o)).join('')
  // a group shrunk to half its size (its words keep their size), and a group turned by 10°
  + grp(30, [0.4, 3.6, 4, 1.4], [8, 2.8], box(31, [0, 0, 8, 1.4], 'Grouped first', {sz: 2000}) + box(32, [0, 1.4, 8, 1.4], 'Grouped second', {sz: 2000}))
  + grp(40, [4.8, 3.3, 4, 0.9], [4, 0.9], box(41, [0, 0, 4, 0.9], 'Group turned', {sz: 2000}), 10));
const cell = t => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p>${run(t, 1800)}</a:p></a:txBody><a:tcPr/></a:tc>`;
const table = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="Table 4"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${xfrm([0.5, 1.6, 6, 1.2], '', 'p:xfrm')}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid><a:gridCol w="${E(3)}"/><a:gridCol w="${E(3)}"/></a:tblGrid>`
  + `<a:tr h="${E(0.6)}">${cell('Cell top left')}${cell('Cell top right')}</a:tr><a:tr h="${E(0.6)}">${cell('Cell low left')}${cell('Cell low right')}</a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
const smart = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="6" name="Diagram 5"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${xfrm([7, 1.6, 5.5, 3.6], '', 'p:xfrm')}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" r:dm="rId3" r:lo="rId4" r:qs="rId5" r:cs="rId7"/></a:graphicData></a:graphic></p:graphicFrame>`;
const DSP = 'xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const dsp = (id, b, t, rot = 0) => `<dsp:sp modelId="{${id}}"><dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr><dsp:spPr>${xfrm(b, rot ? ` rot="${rot * 60000}"` : '')}<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="4472C4"/></a:solidFill></dsp:spPr>`
  + `<dsp:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/>${run(t, 2000, 'FFFFFF')}</a:p></dsp:txBody>${xfrm(b, rot ? ` rot="${rot * 60000}"` : '', 'dsp:txXfrm')}</dsp:sp>`;
const drawing = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><dsp:drawing ${DSP}><dsp:spTree><dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr><dsp:grpSpPr/>`
  + dsp(1, [0, 0, 2.5, 1], 'Smart one') + dsp(2, [3, 0, 2.5, 1], 'Smart two') + dsp(3, [1, 2.2, 3.4, 0.9], 'Smart turned', 90) + '</dsp:spTree></dsp:drawing>';
const data = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><dgm:ptLst/><dgm:cxnLst/><dgm:bg/><dgm:whole/><dgm:extLst><a:ext uri="http://schemas.microsoft.com/office/drawing/2008/diagram"><dsp:dataModelExt xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" relId="rId6" minVer="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></a:ext></dgm:extLst></dgm:dataModel>`;
const slide3 = sld(title('Table and SmartArt') + table + smart);
const S3 = [['Table and SmartArt', null], ['Cell top left', [0.5, 1.6, 3, 0.6]], ['Cell top right', [3.5, 1.6, 3, 0.6]], ['Cell low left', [0.5, 2.2, 3, 0.6]], ['Cell low right', [3.5, 2.2, 3, 0.6]],
  ['Smart one', [7, 1.6, 2.5, 1]], ['Smart two', [10, 1.6, 2.5, 1]], ['Smart turned', [8, 3.8, 3.4, 0.9], {rot: 90}]];
// slide 1's chart: its title, its legend, the quarters along the bottom and the numbers up the side (in the chart's box)
const S1 = [['Clustered columns', null], ...['East', 'West', 'Q1', 'Q2', 'Q3', 'Q4', '0', '100'].map(t => [t, [1.5, 1.6, 10, 5.4]])];
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
async function makeDeck(){
  const z = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, 'fid-charts.pptx')));
  z.file('ppt/slides/slide2.xml', slide2);
  z.file('ppt/slides/_rels/slide2.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout6.xml"/></Relationships>`);
  z.file('ppt/slides/slide3.xml', slide3);
  z.file('ppt/slides/_rels/slide3.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout6.xml"/>`
    + `<Relationship Id="rId3" Type="${REL}/diagramData" Target="../diagrams/data1.xml"/><Relationship Id="rId6" Type="http://schemas.microsoft.com/office/2007/relationships/diagramDrawing" Target="../diagrams/drawing1.xml"/></Relationships>`);
  z.file('ppt/diagrams/data1.xml', data); z.file('ppt/diagrams/drawing1.xml', drawing);
  let ct = await z.file('[Content_Types].xml').async('string');
  ct = ct.replace('</Types>', '<Override PartName="/ppt/diagrams/data1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml"/><Override PartName="/ppt/diagrams/drawing1.xml" ContentType="application/vnd.ms-office.drawingml.diagramDrawing+xml"/></Types>');
  z.file('[Content_Types].xml', ct);
  const f = path.join(OUT, 'select-deck.pptx');
  fs.writeFileSync(f, await z.generateAsync({type: 'nodebuffer'}));
  return f;
}

// every span of the page's text layer: its words, its box on the screen, what the browser finds at its middle, whether it can
// be selected, and how much of the drawing under it is ink
const layer = (page, n) => page.evaluate(async n => {
  const card = document.querySelectorAll('#main .pagecard')[n]; card.scrollIntoView({block: 'center'});
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const u = card.style.getPropertyValue('--pg').match(/url\(["']?(.*?)["']?\)$/)[1], im = new Image(); im.src = u; await im.decode();
  const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const c = cv.getContext('2d', {willReadFrequently: true}); c.drawImage(im, 0, 0);
  const px = c.getImageData(0, 0, cv.width, cv.height).data;
  const W = +card.dataset.w, H = +card.dataset.h;
  return [...card.querySelectorAll('.tl')].map(sp => {
    const r = sp.getBoundingClientRect(), mx = r.left + r.width / 2, my = r.top + r.height / 2, hit = document.elementFromPoint(mx, my);
    // (each strip shows the slide from y0 to y1, in page points: a note between the lines splits the slide into strips)
    const strip = sp.closest('.strip'), sr = strip.getBoundingClientRect(), y0 = +strip.dataset.y0, y1 = +strip.dataset.y1;
    // ink: points along the span's own middle line (it may be turned), on the page picture
    const cs = getComputedStyle(sp), m = new DOMMatrix().rotate(parseFloat(cs.rotate) || 0).multiply(new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform)), w = sp.offsetWidth, h = sp.offsetHeight, ox = sp.offsetLeft, oy = sp.offsetTop;
    let inked = 0, all = 0;
    for (let i = 1; i < 20; i++) for (const f of [.45, .6, .75]) {
      const q = m.transformPoint(new DOMPoint(w * i / 20, h * f)), x = (ox + q.x) / strip.offsetWidth, y = (y0 + (oy + q.y) / strip.offsetHeight * (y1 - y0)) / H;
      const X = Math.floor(x * cv.width), Y = Math.floor(y * cv.height); all++;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const k = ((Y + dy) * cv.width + X + dx) * 4; if (px[k] + px[k + 1] + px[k + 2] < 600 || Math.abs(px[k] - px[k + 2]) > 40) { inked++; dy = dx = 9; } }
    }
    return {t: sp.textContent, mid: [(mx - sr.left) / sr.width * W, y0 + (my - sr.top) / sr.height * (y1 - y0)], hit: hit === sp, on: hit ? hit.className || hit.tagName : null,
      sel: cs.userSelect !== 'none' && cs.pointerEvents !== 'none' && cs.visibility !== 'hidden', ink: inked / all, rot: parseFloat(cs.rotate) || 0};
  });
}, n);

(async () => {
  const deck = await makeDeck();
  const {browser, page, errors} = await open(APP, {width: 1440, height: 1000});
  await page.waitForTimeout(600);
  await page.setInputFiles('#file', deck);
  await page.waitForFunction(() => document.querySelector('#main .file-head')?.textContent === 'select-deck' && document.querySelectorAll('#main .pagecard').length >= 5 && !(document.querySelector('#toast.show')?.textContent || '').startsWith('Reading'), null, {timeout: 60000});
  await page.waitForTimeout(900);
  ok(await page.locator('#main .pagecard').count() === 5, 'the deck opens as 5 slide pictures');

  const IN = 72;                                               // points in an inch
  // each piece of text on slide n: in the text layer, selectable, found by the browser at its middle, on its drawn words,
  // where the slide puts it and turned as far as the slide turns it
  const check = async (n, want, when = '') => {
    const L = await layer(page, n), text = L.map(s => s.t).join(' ');
    for (const [t, b, o = {}] of want) {
      const mine = L.filter(s => t.split(' ').includes(s.t) || t.includes(s.t) && s.t.length > 2), at = `slide ${n + 1}${when}: “${t}”`;
      ok(text.includes(t) && mine.length, at + ' is in the text layer');
      ok(mine.every(s => s.sel && s.hit), at + ` can be selected, and the browser finds it at its middle (${mine.filter(s => !s.hit).map(s => s.on).join() || 'yes'})`);
      ok(mine.every(s => s.ink > .3), at + ` lies on its drawn words (${mine.map(s => Math.round(s.ink * 100) + '%').join(', ')} ink under it)`);
      const turn = {eaVert: 90, vert270: -90}[o.vert] ?? o.rot ?? 0, same = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180) < 1;
      ok(mine.every(s => same(s.rot, turn)), at + ` is turned ${turn}° as on the slide (${mine.map(s => s.rot).join()})`);
      if (b) {
        const cx = (b[0] + b[2] / 2) * IN, cy = (b[1] + b[3] / 2) * IN, half = Math.max(b[2], b[3]) / 2 * IN + 6;
        ok(mine.every(s => Math.abs(s.mid[0] - cx) <= half && Math.abs(s.mid[1] - cy) <= half), at + ' is where the slide puts it');
      }
    }
    return L;
  };
  for (const [n, want] of [[0, S1], [1, S2], [2, S3]]) { await check(n, want); await page.screenshot({path: path.join(OUT, `pptxselect-${n + 1}.png`)}); }

  // ---- copied in reading order: top to bottom, left to right, the turned words among the rest ----
  const copied = await page.evaluate(() => { const s = document.querySelectorAll('#main .pagecard')[1].querySelector('.strip'), r = document.createRange(); r.selectNodeContents(s); getSelection().removeAllRanges(); getSelection().addRange(r); const t = getSelection().toString(); getSelection().removeAllRanges(); return t; });
  // (the upright words top to bottom; turned ones go by the middle of their box: the heading tilted beside the first box comes after it)
  const order = ['Inherited title words', 'Plain box words', 'Tilted words here', 'WordArt words', 'Grouped first', 'Grouped second', 'Mirrored box words'].map(w => copied.indexOf(w));
  ok(order.every((v, i) => v >= 0 && (!i || v > order[i - 1])), 'slide 2 copies whole, in reading order: ' + JSON.stringify(copied.replace(/\s+/g, ' ')));
  ok(['Turned sideways', 'Down the side', 'Up the side', 'Upside down words'].every(w => copied.includes(w)), 'with the words turned or down the side');
  const ch = await page.evaluate(() => { const s = document.querySelectorAll('#main .pagecard')[0].querySelector('.strip'), r = document.createRange(); r.selectNodeContents(s); return r.toString(); });
  ok(ch.indexOf('Clustered columns') < ch.indexOf('100') && ch.indexOf('Q1') < ch.indexOf('Q4') && ch.indexOf('Q4') < ch.indexOf('East'), 'the chart copies as title, numbers, quarters, then its legend');

  // ---- with the mouse: a double click on turned words selects a word of them ----
  const spanAt = (n, w) => page.evaluate(([n, w]) => { const sp = [...document.querySelectorAll('#main .pagecard')[n].querySelectorAll('.tl')].find(s => s.textContent === w); sp.scrollIntoView({block: 'center'}); const r = sp.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, [n, w]);
  for (const w of ['Tilted words here', 'Down the side', 'Upside down words']) {
    const [x, y] = await spanAt(1, w); await page.waitForTimeout(150);
    await page.mouse.dblclick(x, y); await page.waitForTimeout(150);
    const sel = await page.evaluate(() => getSelection().toString().trim());
    ok(sel && w.split(' ').includes(sel), `a double click on “${w}” selects a word of it (${sel})`);
    await page.mouse.click(5, 500); await page.waitForTimeout(100);
  }
  ok(await page.locator('.notebox').count() === 0, 'selecting words added no note');

  // ---- + Add here still opens the page up between the lines, and the words below stay lined up ----
  const card3 = page.locator('#main .pagecard').nth(2), strip3 = card3.locator('.strip').first(); await strip3.scrollIntoViewIfNeeded();
  const gaps = JSON.parse(await card3.getAttribute('data-gaps')), H3 = +(await card3.getAttribute('data-h'));
  const g = gaps.filter(g => g[0] > 1.5 * IN && g[1] < 6.5 * IN).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] || gaps[0];
  const bb = await strip3.boundingBox(), gy = bb.y + (g[0] + g[1]) / 2 / H3 * bb.height;
  await page.mouse.move(bb.x + 200, gy, {steps: 3}); await page.waitForTimeout(250);
  ok(await page.locator('.gappill').isVisible(), '“+ Add here” follows the pointer over a slide with turned words');
  await page.click('.gappill'); await page.keyboard.type('note beside the SmartArt'); await page.waitForTimeout(300);
  ok(await card3.locator('.notebox .mine').count() === 1 && await card3.locator('.strip').count() === 2, 'a note opens the slide up at the gap');
  await page.mouse.click(5, 500); await page.waitForTimeout(600);
  await check(2, S3, ' (opened up)');

  // ---- ink: Draw writes over the turned words instead of selecting them, and they can be selected again after ----
  await page.click('#tab-insert'); await page.click('#drawBtn'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.body.classList.contains('drawing') && getComputedStyle(document.querySelector('#main .pagecard .tl[style*="rotate"]')).userSelect === 'none'), 'while drawing, the words aren’t selected');
  const [x0, y0] = await spanAt(1, 'Tilted words here'); await page.waitForTimeout(150);
  await page.mouse.move(x0 - 60, y0); await page.mouse.down(); for (let k = 1; k <= 8; k++) await page.mouse.move(x0 - 60 + k * 15, y0 + (k % 2 ? 6 : -6)); await page.mouse.up(); await page.waitForTimeout(250);
  const inkN = await page.evaluate(() => { try { return JSON.parse(document.querySelectorAll('#main .pagecard')[1].dataset.ink || '[]').length; } catch { return -1; } });
  ok(inkN === 1 && !(await page.evaluate(() => getSelection().toString().trim())), 'a pen stroke across turned words is drawn on the slide, and selects nothing');
  await page.click('#drawBtn'); await page.waitForTimeout(150);
  await check(1, S2.filter(([, , o]) => o && (o.rot || o.vert)), ' (after drawing)');

  if (errors.length) throw new Error('page errors: ' + errors.join('; '));
  console.log('ALL PASS');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

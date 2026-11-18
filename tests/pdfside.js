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
  // a side page keeps its drawing in every mode; its notes follow the mode, as the slide's do (page: painted, comments: PDF comments, none: left out)
  await page.selectOption('#layout', 'default'); await page.waitForTimeout(800);
  await page.click('#tab-insert'); await page.click('#drawBtn'); await page.waitForTimeout(150);
  await page.locator('.sidepage').nth(1).scrollIntoViewIfNeeded();
  const sb = await page.locator('.sidepage').nth(1).boundingBox();
  await page.mouse.move(sb.x + sb.width * .2, sb.y + sb.height * .8); await page.mouse.down();
  await page.mouse.move(sb.x + sb.width * .8, sb.y + sb.height * .85, {steps: 8}); await page.mouse.up();
  await page.click('#drawBtn'); await page.waitForTimeout(200);
  await page.evaluate(() => { const sp = document.querySelectorAll('.sidepage')[1]; sp.dataset.ink = sp.dataset.ink.replace(/"c":"[^"]*"/g, '"c":"#00ff00"'); renderInk(sp); });
  ok(await page.locator('.sidepage').nth(1).evaluate(s => /#00ff00/.test(s.dataset.ink || '')), 'a green stroke is on the second side page');
  const modes = {};
  for (const m of ['page', 'comments', 'none']) {
    await page.evaluate(v => { $('#pdfNotes').value = v; }, m);
    modes[m] = await page.evaluate(async () => {
      const old = paintCard, got = [];
      paintCard = async (card, k, sd) => {
        const c = await old(card, k, sd); if (!sd) { got.push(null); return c; }
        const cr = card.getBoundingClientRect(), sr = sd.getBoundingClientRect(), x0 = Math.round((sr.left - Math.min(cr.left, sr.left)) * k), y0 = Math.round((sr.top - Math.min(cr.top, sr.top)) * k);
        const d = c.getContext('2d').getImageData(x0 + 4, y0 + 4, Math.round(sr.width * k) - 8, Math.round(sr.height * k) - 8).data; let g = 0, t = 0;
        for (let i = 0; i < d.length; i += 4) { if (d[i + 1] > 200 && d[i] < 80 && d[i + 2] < 80) g++; else if (d[i] < 120 && d[i + 1] < 120) t++; }
        got.push({g, t, w: c.width}); return c;
      };
      let f; try { f = await pdfFile(); } finally { paintCard = old; }
      const t = new TextDecoder('latin1').decode(new Uint8Array(await f.blob.arrayBuffer()));
      return {got, notes: t.includes(utf16('A side note for the PDF').slice(1, -1)), annots: (t.match(/\/Subtype \/Text/g) || []).length, pages: (t.match(/\/Type \/Page /g) || []).length};
    });
    const r = modes[m], s1 = r.got[1];
    console.log(m, JSON.stringify({annots: r.annots, notes: r.notes, side1: s1, sides: r.got.filter(Boolean).length}));
    ok(r.got.filter(Boolean).length === 6 && r.pages === 6, m + ': every page is made with its side page beside it');
    ok(s1 && s1.g > 200, m + ': the drawing on the side page is in the PDF');
    if (m === 'page') ok(s1.t > 100 && !r.notes && r.annots === 0, 'page: the side note is painted, not a comment');
    if (m === 'comments') ok(s1.t < modes.page.got[1].t / 4 && r.notes, 'comments: the side note is a PDF comment, not painted');
    if (m === 'none') ok(s1.t < modes.page.got[1].t / 4 && !r.notes && r.annots === 0, 'none: the side note is left out');
  }
  // printing (Ctrl+P) has no choice of notes: side pages print with their notes and drawing, as the slides do
  await page.emulateMedia({media: 'print'});
  const pr = await page.evaluate(() => { const sp = document.querySelectorAll('.sidepage')[1], n = sp.querySelector('.notebox .mine'); return {d: getComputedStyle(sp).display, h: sp.getBoundingClientRect().height, note: getComputedStyle(n).display, ink: !!sp.querySelector(':scope > svg.ink path') && getComputedStyle(sp.querySelector(':scope > svg.ink')).display}; });
  await page.emulateMedia({media: 'screen'});
  ok(pr.d === 'block' && pr.h > 100 && pr.note !== 'none' && pr.ink && pr.ink !== 'none', 'print: the side page, its note and its drawing are printed ' + JSON.stringify(pr));
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

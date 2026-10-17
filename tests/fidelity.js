// PowerPoint opens as it looks (a picture of each slide plus its selectable text, like a PDF page) and Word with docx-preview
const {open} = require('./harness'); const path = require('path'); const fs = require('fs');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const store = p => p.evaluate(() => new Promise(res => { const r = indexedDB.open('between-slides-text', 1); r.onsuccess = () => { const t = r.result.transaction('kv').objectStore('kv'), out = {}; const c = t.openCursor(); c.onsuccess = () => { const x = c.result; if (!x) return res(out); out[x.key] = typeof x.value === 'string' ? x.value.length : x.value instanceof Blob ? 'blob' : 'other'; x.continue(); }; }; }));
const storedDoc = p => p.evaluate(() => new Promise(res => { const r = indexedDB.open('between-slides-text', 1); r.onsuccess = () => { const t = r.result.transaction('kv').objectStore('kv'); let all = ''; const c = t.openCursor(); c.onsuccess = () => { const x = c.result; if (!x) return res(all); if (String(x.key).startsWith('doc:') && typeof x.value === 'string') all += x.value; x.continue(); }; }; }));
// what a page picture holds: how much it varies, and the colour at some points (as fractions of its width and height)
const pixels = (p, n, pts = []) => p.evaluate(async ([n, pts]) => {
  const card = document.querySelectorAll('.pagecard')[n], u = card.style.getPropertyValue('--pg').match(/url\(["']?(.*?)["']?\)$/)[1];
  const im = new Image(); im.src = u; await im.decode();
  const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const c = cv.getContext('2d'); c.drawImage(im, 0, 0);
  const d = c.getImageData(0, 0, cv.width, cv.height).data; let s = 0, s2 = 0, k = 0;
  for (let i = 0; i < d.length; i += 4 * 7) { const y = .3 * d[i] + .59 * d[i + 1] + .11 * d[i + 2]; s += y; s2 += y * y; k++; }
  const mean = s / k, near = (r, g, b) => { let cnt = 0; for (let i = 0; i < d.length; i += 4 * 3) if (Math.abs(d[i] - r) < 14 && Math.abs(d[i + 1] - g) < 14 && Math.abs(d[i + 2] - b) < 14) cnt++; return cnt; };
  return {w: cv.width, h: cv.height, std: Math.sqrt(s2 / k - mean * mean), at: pts.map(([fx, fy]) => { const i = (Math.floor(fy * cv.height) * cv.width + Math.floor(fx * cv.width)) * 4; return [d[i], d[i + 1], d[i + 2]]; }), near: [[31, 58, 95], [250, 200, 60], [79, 129, 189], [224, 90, 71]].map(c => near(...c))};
}, [n, pts]);
const words = (p, n) => p.evaluate(n => [...document.querySelectorAll('.pagecard')[n].querySelectorAll('.tl')].map(s => s.textContent).join(' '), n);
const close = (a, b, t = 12) => a.every((v, i) => Math.abs(v - b[i]) <= t);
(async () => {
  const {browser, page, errors} = await open(APP, {width: 1300, height: 1000});
  await page.waitForTimeout(600);
  const warn = []; page.on('console', m => { if (m.type() === 'warning') warn.push(m.text()); });
  const openFile = async (f, n, sel = '#main .slide') => { const head = f.replace(/\.[^.]+$/, '').replace(/_+/g, ' '); await page.setInputFiles('#file', path.join(__dirname, f)); await page.waitForFunction(([sel, n, head]) => document.querySelector('#main .file-head')?.textContent === head && document.querySelectorAll(sel).length >= n, [sel, n, head], {timeout: 60000}); await page.waitForTimeout(900); };

  // ---- the default: slides as they look ----
  await openFile('week2.pptx', 2);
  ok(await page.locator('.pagecard').count() === 2 && await page.locator('#main .slide:not(.pagecard)').count() === 0, 'week2.pptx: one page for each slide');
  for (const [i, w] of [[0, ['Week 2: Supply and demand', 'Demand slopes down', 'Supply slopes up']], [1, ['Equilibrium', 'Where supply meets demand']]]) {
    const px = await pixels(page, i);
    ok(px.std > 5 && px.w >= 1400, `slide ${i + 1} has a picture that is not blank (spread ${px.std.toFixed(1)}, ${px.w}×${px.h})`);
    const t = await words(page, i);
    ok(w.every(x => t.includes(x)), `slide ${i + 1} has its words to select: ${w[0]}…`);
  }
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.pagecard .tl')).userSelect !== 'none'), 'the words can be selected');
  ok(await page.locator('.pptx-tip').count() === 1 && (await page.textContent('.pptx-tip span')).includes('as the slides look') && (await page.textContent('.pptx-tip span')).includes('SmartArt'), 'the tip says it opens as it looks and that SmartArt and animations may differ');
  // notes between the lines
  const strip = page.locator('.pagecard').first().locator('.strip').first(); await strip.scrollIntoViewIfNeeded();
  const gaps = await page.evaluate(() => JSON.parse(document.querySelector('.pagecard').dataset.gaps));
  ok(gaps.length >= 2, `the page has gaps between its lines (${gaps.length})`);
  const bb = await strip.boundingBox(), H = await page.evaluate(() => +document.querySelector('.pagecard').dataset.h);
  const g = gaps[1], gy = bb.y + (g[0] + g[1]) / 2 / H * bb.height;
  await page.mouse.move(bb.x + 300, gy, {steps: 3}); await page.waitForTimeout(250);
  ok(await page.locator('.gappill').isVisible(), '“+ Add here” follows the pointer on a slide');
  await page.click('.gappill'); await page.keyboard.type('note between the lines'); await page.waitForTimeout(300);
  ok(await page.locator('.pagecard').first().locator('.notebox .mine').count() === 1 && (await page.textContent('.pagecard .notebox .mine')).includes('between the lines') && await page.locator('.pagecard').first().locator('.strip').count() === 2, 'a note opens the slide up at the gap');
  await page.mouse.click(5, 500); await page.waitForTimeout(1200);

  // ---- stored, reloaded, downloaded ----
  let st = await store(page), doc = await storedDoc(page);
  ok(Object.values(st).filter(v => v === 'blob').length === 2 && doc.includes('bts-asset:') && !doc.includes('data:image'), 'slide pictures are stored as assets (bts-asset:), not data URLs');
  await page.reload(); await page.waitForTimeout(2500);
  ok(await page.locator('.pagecard').count() === 2 && (await page.textContent('.pagecard .notebox .mine')).includes('between the lines') && (await pixels(page, 1)).std > 5, 'after a reload the slides, their pictures and the note are back');
  await page.click('#save'); const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-kind=notebook]')]);
  const file = fs.readFileSync(await dl.path(), 'utf8'), data = (file.match(/<script id="notebook-data" type="application\/json">([\s\S]*?)<\/script>/) || [, ''])[1];
  ok(data.includes('data:image/jpeg;base64') && !data.includes('bts-asset:') && !data.includes('blob:') && data.includes('between the lines'), 'Download notebook carries the pictures and the note');

  // ---- a richer deck ----
  await openFile('fid-rich.pptx', 4);
  const cards = await page.locator('.pagecard').count();
  ok(cards === 4, 'fid-rich.pptx: four slides, four pages');
  let px = await pixels(page, 0, [[.02, .02], [.5, .95]]);
  ok(close(px.at[0], [31, 58, 95]) && close(px.at[1], [31, 58, 95]), `slide 1: the coloured background (${px.at[0]})`);
  ok(px.near[3] > 3000, 'slide 1: a shape in its own colour');
  ok(JSON.parse(await page.evaluate(() => document.querySelectorAll('.pagecard')[0].dataset.text)).map(i => i[3]).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).join() === '18,28,32,54', 'slide 1: its words keep four sizes (18, 28, 32, 54 pt)');
  px = await pixels(page, 1);
  ok(px.near[1] > 20000, 'slide 2: the picture is there');
  ok((await words(page, 1)).includes('Second bullet') && (await words(page, 1)).includes('First bullet point'), 'slide 2: bullets are selectable text');
  px = await pixels(page, 2);
  ok(px.near[2] > 8000, 'slide 3: the table header in the theme colour');
  ok((await words(page, 2)).includes('Plums') && (await words(page, 2)).includes('2.50'), 'slide 3: the table’s words are selectable');
  px = await pixels(page, 3);
  ok(px.std > 5 && (await words(page, 3)).includes('In a group') && (await words(page, 3)).includes('Also grouped'), 'slide 4: grouped shapes and their words');
  // shapes, lists, charts
  await openFile('fid-feat.pptx', 2);
  ok(await page.locator('.pagecard').count() === 2 && (await words(page, 0)).includes('Number two') && (await words(page, 1)).includes('Bottom anchored text'), 'fid-feat.pptx: text styles, lists, anchoring');
  await openFile('fid-charts.pptx', 5);
  ok(await page.locator('.pagecard').count() === 5 && (await pixels(page, 0)).std > 20 && (await pixels(page, 3)).std > 20, 'fid-charts.pptx: bar, line, pie and scatter charts are drawn');

  // ---- a slide that can't be drawn is rebuilt as text, and the other way of opening ----
  await page.evaluate(() => { window.__render = PPT.render; PPT.render = async (D, path, n) => { if (n === 2) throw new Error('test'); return window.__render(D, path, n); }; });
  await openFile('week2.pptx', 2);
  ok(await page.locator('.pagecard').count() === 1 && await page.locator('#main .slide:not(.pagecard)').count() === 1 && (await page.textContent('#main')).includes('Equilibrium'), 'if drawing a slide fails, that slide is rebuilt as text and the rest stay pages');
  await page.evaluate(() => { PPT.render = window.__render; });

  // ---- the setting: Editable text still gives today's result ----
  await page.click('#tab-view');
  ok(await page.locator('#settings .pptx-mode-sel').inputValue() === 'look', 'Help & settings has “Open PowerPoint as”, set to Slides as they look');
  await page.evaluate(() => { const s = document.querySelector('#settings .pptx-mode-sel'); s.value = 'text'; s.dispatchEvent(new Event('change', {bubbles: true})); });
  ok(await page.evaluate(() => pref.get('pptx-mode')) === 'text', 'the choice is remembered');
  await openFile('week2.pptx', 2);
  ok(await page.locator('.pagecard').count() === 0 && await page.locator('#main .slide').count() === 2 && (await page.textContent('#main')).includes('Week 2: Supply and demand') && await page.locator('#main .slide .blk').count() >= 4, 'Editable text: the slides are rebuilt as text, as before');
  ok((await page.textContent('.pptx-tip span')).includes('rebuilt as text'), 'and the tip says so');
  await page.reload(); await page.waitForTimeout(2000);
  ok(await page.evaluate(() => pref.get('pptx-mode')) === 'text', 'the choice survives a reload');
  // the tip reopens the file the other way
  await openFile('week2.pptx', 2); await page.waitForTimeout(500);
  await page.click('.pptx-tip >> text=Open as slides as they look'); await page.waitForFunction(() => document.querySelectorAll('.pagecard').length === 2, null, {timeout: 30000}); await page.waitForTimeout(600);
  ok(await page.locator('#main .slide .blk').count() === 0 && (await words(page, 1)).includes('Equilibrium') && await page.locator('.pptx-tip').count() === 1, 'the tip’s button reopens the slides as they look');
  await page.click('.pptx-tip >> text=Open as editable text instead'); await page.waitForFunction(() => document.querySelectorAll('.pagecard').length === 0 && document.querySelectorAll('#main .slide .blk').length > 3, null, {timeout: 30000});
  ok(true, 'and back as editable text');
  await page.evaluate(() => { document.querySelectorAll('.pptx-mode-sel').forEach(s => s.value = 'look'); document.querySelector('.pptx-mode-sel').dispatchEvent(new Event('change', {bubbles: true})); });
  ok(await page.evaluate(() => pref.get('pptx-mode')) === 'look', 'Slides as they look can be chosen again');

  // ---- Word ----
  await openFile('reading.docx', 1);
  ok(await page.evaluate(() => !!window.docx), 'reading.docx is drawn with docx-preview');
  const h = await page.evaluate(() => { const p = [...document.querySelectorAll('#main .blk')].find(x => x.textContent.includes('Reading notes: elasticity')); const s = p.querySelector('span'), cs = getComputedStyle(s); return {cls: p.className, weight: cs.fontWeight, size: cs.fontSize, color: cs.color, plain: getComputedStyle(document.querySelector('#main .blk:not(:first-child) span')).fontSize}; });
  ok(+h.weight >= 700 && parseFloat(h.size) > parseFloat(h.plain) && h.color !== 'rgb(0, 0, 0)', `its heading keeps its look (${h.size}, bold, ${h.color})`);
  await openFile('fid-rich.docx', 2);
  const w = await page.evaluate(() => ({cards: document.querySelectorAll('#main .slide').length, rows: document.querySelectorAll('#main table tr').length, cells: document.querySelectorAll('#main table td').length, shade: [...document.querySelectorAll('#main td')].some(c => getComputedStyle(c).backgroundColor === 'rgb(217, 226, 243)'), labels: [...document.querySelectorAll('#main .bul')].map(b => b.textContent), imgs: [...document.querySelectorAll('#main img')].map(i => i.complete && i.naturalWidth), header: [...document.querySelectorAll('#main header')].length, blk: document.querySelectorAll('#main .blk').length, style: document.querySelectorAll('#main style').length, border: getComputedStyle(document.querySelector('#main td')).borderTopStyle}));
  ok(w.cards === 2, 'fid-rich.docx: the page break gives two pages');
  ok(w.rows === 4 && w.cells === 12 && w.shade && w.border === 'solid', 'a table with its shaded header and borders');
  ok(w.labels.join() === '•,•,•,1.,2.,3.', `list bullets and numbers are real text (${w.labels})`);
  ok(w.imgs.length === 1 && w.imgs[0] === 600 && w.header === 2 && w.style === 0, 'its picture, headers, and no style sheet behind it');
  // you can type inside a sentence
  const where = await page.evaluate(() => { const sp = [...document.querySelectorAll('#main p span')].find(s => s.textContent.includes('quantity responds')); sp.scrollIntoView({block: 'center'}); const r = document.createRange(); r.setStart(sp.firstChild, 12); r.setEnd(sp.firstChild, 12); const b = sp.getBoundingClientRect(), t = document.createRange(); t.setStart(sp.firstChild, 11); t.setEnd(sp.firstChild, 13); const q = t.getBoundingClientRect(); return {x: q.left + q.width / 2, y: q.top + q.height / 2}; });
  await page.mouse.click(where.x, where.y); await page.keyboard.type('Z'); await page.waitForTimeout(700);
  ok(await page.evaluate(() => [...document.querySelectorAll('#main p')].some(p => p.textContent.includes('Price elasticity of demand') && /\bZ|Z\b|\wZ\w|Z/.test(p.textContent) && p.textContent.includes('quantity responds'))), 'you can type inside a sentence of a Word page');
  await page.mouse.click(5, 500); await page.waitForTimeout(1500);
  doc = await storedDoc(page);
  ok(doc.includes('bts-asset:') && !doc.includes('data:image') && !doc.includes('blob:'), 'a Word picture is stored as an asset too');
  await page.reload(); await page.waitForTimeout(2500);
  ok(await page.evaluate(async () => { const im = document.querySelector('#main img'); return !!im && im.complete && im.naturalWidth === 600; }) && (await page.textContent('#main')).includes('Elasticity and revenue'), 'and the Word file is intact after a reload');

  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

// Zoomed-in PDF pages are drawn again sharp, only where you can see them, and let go of again (iPad-sized window, 2× screen)
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const CHROMIUM = !process.env.BROWSER || process.env.BROWSER === 'chromium';
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const shot = (page, n) => page.screenshot({path: path.join(OUT, n + '.png')});

// a PDF of n text slides (960 × 540 points): a title, lines of 18, 12 and 9 point text, a band down the left edge and a slide number
function makePdf(file, n){
  const body = [], kids = [];
  body[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  body[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let no = 4;
  for (let i = 1; i <= n; i++) {
    const text = ['0.15 0.25 0.55 rg 0 0 28 540 re f', '0 0 0 rg',
      `BT /F1 36 Tf 60 460 Td (Slide ${i}: zoomed in, still sharp) Tj ET`,
      'BT /F1 18 Tf 60 380 Td (The quick brown fox jumps over the lazy dog 0123456789) Tj ET',
      'BT /F1 12 Tf 60 330 Td (Small print: the quick brown fox jumps over the lazy dog, 0123456789, and back again.) Tj ET',
      'BT /F1 9 Tf 60 290 Td (Tiny print: pack my box with five dozen liquor jugs. Sphinx of black quartz, judge my vow.) Tj ET',
      '0.5 w 60 250 m 900 250 l S',
      `BT /F1 12 Tf 920 18 Td (${i}) Tj ET`].join('\n');
    body[no] = `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`;
    body[no + 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Contents ${no} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
    kids.push(`${no + 1} 0 R`); no += 2;
  }
  body[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${n} >>`;
  let out = '%PDF-1.4\n'; const offs = [];
  for (let k = 1; k < no; k++) { offs[k] = Buffer.byteLength(out); out += `${k} 0 obj\n${body[k]}\nendobj\n`; }
  const x = Buffer.byteLength(out);
  out += `xref\n0 ${no}\n0000000000 65535 f \n` + offs.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${no} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  fs.writeFileSync(file, out);
}

(async () => {
  const N = 45, PDF = path.join(OUT, 'zoomsharp.pdf');
  makePdf(PDF, N);
  const {browser, context, page, errors} = await open(APP, {width: 1024, height: 1366, contextOptions: {deviceScaleFactor: 2, hasTouch: true}});
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', PDF);
  await page.waitForFunction(n => document.querySelectorAll('.pagecard').length >= n, N, {timeout: 120000});
  await page.waitForTimeout(800);

  // once the zoom and the scrolling stop, the drawing starts; wait for it to be done
  const settle = () => page.evaluate(async () => { for (let i = 0; i < 3; i++) { await new Promise(r => setTimeout(r, 250)); await sharp.busy; } });
  const state = () => page.evaluate(() => {
    const cvs = [...document.querySelectorAll('canvas.sharp')];
    return {n: cvs.length, live: sharp.live.size, px: cvs.reduce((s, c) => s + c.width * c.height, 0), docs: sharp.docs.size, pages: sharp.pages.size, view: innerWidth * innerHeight * devicePixelRatio ** 2,
      far: cvs.filter(c => { const r = c.getBoundingClientRect(); return r.bottom < -innerHeight * .25 || r.top > innerHeight * 1.25; }).length};
  });
  // the box of a line of the page's text (from its invisible text layer), on screen
  const lineBox = (i, start) => page.evaluate(([i, start]) => {
    const sp = [...document.querySelectorAll('.pagecard')[i].querySelectorAll('.tl')].find(s => s.textContent.startsWith(start));
    const r = sp.getBoundingClientRect(), x = Math.max(0, r.left - 4), y = Math.max(0, r.top - 4);
    return {x, y, width: Math.min(innerWidth, r.right + 4) - x, height: Math.min(innerHeight, r.bottom + 4) - y};
  }, [i, start]);
  // how sharp text looks on screen: the steepest steps from one screen pixel to the next, against the darkest to lightest
  const crisp = async box => {
    const png = await page.screenshot({clip: box});
    return page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data, L = i => d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11, g = [];
      let lo = 255, hi = 0;
      for (let y = 0; y < c.height; y++) for (let X = 0; X < c.width - 1; X++) { const i = (y * c.width + X) * 4, a = L(i); lo = Math.min(lo, a); hi = Math.max(hi, a); g.push(Math.abs(a - L(i + 4))); }
      g.sort((p, q) => q - p); const top = g.slice(0, Math.max(1, g.length * .01 | 0));
      return top.reduce((s, v) => s + v, 0) / top.length / Math.max(1, hi - lo);
    }, png.toString('base64'));
  };
  const soft = on => page.evaluate(on => { let st = document.getElementById('nosharp'); if (on && !st) { st = document.createElement('style'); st.id = 'nosharp'; st.textContent = 'canvas.sharp{visibility:hidden}'; document.head.append(st); } else if (!on) st?.remove(); }, on);
  const showPage = i => page.evaluate(i => { document.querySelectorAll('.pagecard')[i].scrollIntoView({block: 'start', behavior: 'instant'}); scrollBy({top: -120, behavior: 'instant'}); }, i);

  // ---- reading the PDF keeps it, once, for drawing pages again ----
  const kept = await page.evaluate(async () => {
    const cards = [...document.querySelectorAll('.pagecard')], srcs = new Set(cards.map(c => c.dataset.pdfsrc));
    const how = cards.map(c => JSON.parse(c.dataset.pdf || 'null'));
    const id = assetOf.get([...srcs][0]), blob = id && await get('asset:' + id);
    return {srcs: srcs.size, src: [...srcs][0], pages: how.map(h => h?.p).join(), type: blob?.type, size: blob?.size, out: how[1]?.out?.length, bg: how[1]?.bg};
  });
  ok(kept.srcs === 1 && /^blob:/.test(kept.src), 'every page of the PDF names the one copy of it kept in this browser');
  ok(kept.type === 'application/pdf' && kept.size === fs.statSync(PDF).size, 'the PDF is stored as it came (' + kept.size + ' bytes)');
  ok(kept.pages === Array.from({length: N}, (_, i) => i + 1).join(), 'each page knows which page of the PDF it is');
  ok(kept.out >= 1 && kept.bg, 'and what was painted out of it (the slide number) and in which colour');

  // ---- at the fit: nothing more is drawn ----
  await showPage(1); await settle();
  ok(await page.evaluate(() => pageZoom === 1 && !document.querySelector('canvas.sharp') && !sharp.docs.size), 'at the fit the page pictures are shown as they are, and the PDF is not open');
  const fit12 = await crisp(await lineBox(1, 'Small print')), fit9 = await crisp(await lineBox(1, 'Tiny print'));

  // ---- 2×: − / + in the status bar ----
  for (let k = 0; k < 3; k++) { await page.click('#zoomIn'); await page.waitForTimeout(120); }
  ok(await page.evaluate(() => Math.abs(pageZoom - 2) < .01), 'three steps of + zoom to 200%');
  await settle();
  let st = await state();
  ok(st.n >= 1 && st.docs === 1, `zoomed in, the pages on screen are drawn again (${st.n} drawing${st.n > 1 ? 's' : ''})`);
  const dens = await page.evaluate(() => [...document.querySelectorAll('canvas.sharp')].map(c => { const r = c.getBoundingClientRect(), s = c.closest('.strip').getBoundingClientRect(), W = +c.closest('.pagecard').dataset.w;
    return {px: c.width / r.width, k: c.sharp.k, want: s.width / W * devicePixelRatio}; }));
  ok(dens.every(d => Math.abs(d.px - 2) < .02 && Math.abs(d.k - d.want) < .01 && d.k > 3.5), 'at the screen’s own resolution: one canvas pixel per screen pixel (' + dens.map(d => d.k.toFixed(2) + ' px/pt').join(', ') + ')');
  const z12 = await crisp(await lineBox(1, 'Small print')), z9 = await crisp(await lineBox(1, 'Tiny print'));
  await soft(true); const s12 = await crisp(await lineBox(1, 'Small print')); await soft(false);
  ok(s12 < fit12 * .8, `(the page picture alone is soft at 2×: ${s12.toFixed(2)} against ${fit12.toFixed(2)} at the fit)`);
  ok(z12 >= fit12 * .9 && z9 >= fit9 * .9, `at 2× the 12 and 9 point text is as crisp as at the fit (${z12.toFixed(2)} / ${fit12.toFixed(2)}, ${z9.toFixed(2)} / ${fit9.toFixed(2)})`);
  await shot(page, 'zoomsharp-1-2x');

  // the same page as its picture: the band down the side and the slide number left out the same way
  const same = await page.evaluate(async () => {
    const out = [];
    for (const cv of document.querySelectorAll('canvas.sharp')) {
      const card = cv.closest('.pagecard'), W = +card.dataset.w, url = getComputedStyle(card).getPropertyValue('--pg').match(/url\(["']?(.*?)["']?\)/)[1];
      const img = new Image(); img.src = url; await img.decode();
      const s = img.naturalWidth / W, {x0, x1, y0, y1} = cv.sharp, w = Math.round((x1 - x0) * 2), h = Math.round((y1 - y0) * 2);
      const a = document.createElement('canvas'), b = document.createElement('canvas'); a.width = b.width = w; a.height = b.height = h;
      const ca = a.getContext('2d'), cb = b.getContext('2d'); ca.imageSmoothingQuality = cb.imageSmoothingQuality = 'high';
      ca.drawImage(cv, 0, 0, w, h); cb.fillStyle = '#fff'; cb.fillRect(0, 0, w, h); cb.drawImage(img, x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s, 0, 0, w, h);
      const da = ca.getImageData(0, 0, w, h).data, db = cb.getImageData(0, 0, w, h).data;
      let worst = 0, mean = 0;
      for (let by = 0; by + 16 <= h; by += 16) for (let bx = 0; bx + 16 <= w; bx += 16) {
        let d = 0; for (let y = by; y < by + 16; y++) for (let x = bx; x < bx + 16; x++) { const i = (y * w + x) * 4; d += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]); }
        d /= 16 * 16 * 3; worst = Math.max(worst, d); mean += d;
      }
      out.push({worst, w, h});
    }
    return out;
  });
  ok(same.length && same.every(s => s.worst < 30), 'what is drawn again is the page as its picture shows it, only sharper (largest difference in a 16 px square: ' + same.map(s => s.worst.toFixed(1)).join(', ') + ')');

  // ---- 3×, at the slide number in the corner ----
  await page.evaluate(() => setPageZoom(3));
  await settle();
  st = await state();
  ok(await page.evaluate(() => Math.abs(pageZoom - 3) < .01) && st.n >= 1, 'zoomed to 300%, drawn again for that');
  await page.evaluate(() => { main.scrollLeft = main.scrollWidth; const r = document.querySelectorAll('.pagecard')[1].querySelector('.strip').getBoundingClientRect(); scrollBy({top: r.bottom - innerHeight + 200, behavior: 'instant'}); });
  await settle();
  const num = await page.evaluate(() => {
    const cv = document.querySelectorAll('.pagecard')[1].querySelector('canvas.sharp'); if (!cv) return null;
    const {x0, y0, k} = cv.sharp, K = cv.width / ((cv.sharp.x1 - x0) * k) * k, x = cv.getContext('2d');
    const px = (918 - x0) * K, py = (540 - 32 - y0) * K, w = 20 * K, h = 18 * K;
    if (px < 0 || py < 0 || px + w > cv.width || py + h > cv.height) return 'not in view';
    const d = x.getImageData(px, py, w, h).data; let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) dark++;
    return dark;
  });
  ok(num === 0, 'the slide number is left out of the sharp drawing too (' + num + ' dark pixels where it was)');
  await showPage(1); await page.evaluate(() => { main.scrollLeft = 0; }); await settle();
  const t12 = await crisp(await lineBox(1, 'Small print')), t9 = await crisp(await lineBox(1, 'Tiny print'));
  await soft(true); const u12 = await crisp(await lineBox(1, 'Small print')); await soft(false);
  ok(u12 < fit12 * .75, `(the page picture alone at 3×: ${u12.toFixed(2)})`);
  ok(t12 >= fit12 * .9 && t9 >= fit9 * .9, `at 3× the 12 and 9 point text is as crisp as at the fit (${t12.toFixed(2)} / ${fit12.toFixed(2)}, ${t9.toFixed(2)} / ${fit9.toFixed(2)})`);
  await shot(page, 'zoomsharp-2-3x');

  // ---- ink drawn on the page shows over the sharp drawing ----
  if (CHROMIUM) {
    const cdp = await context.newCDPSession(page);
    const pen = (type, x, y, down) => cdp.send('Input.dispatchMouseEvent', {type, x, y, button: type === 'mouseMoved' && !down ? 'none' : 'left', buttons: type === 'mouseMoved' && !down ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'pen', force: .6});
    const b = await lineBox(1, 'Small print'), y = b.y + b.height + 60, area = {x: b.x + 20, y: y - 30, width: 300, height: 60};
    const before = await page.screenshot({clip: area});
    await pen('mouseMoved', b.x + 40, y); await pen('mousePressed', b.x + 40, y, true);
    for (let k = 1; k <= 20; k++) await pen('mouseMoved', b.x + 40 + k * 12, y + Math.sin(k / 2) * 12, true);
    await pen('mouseReleased', b.x + 280, y); await page.waitForTimeout(400); await settle();
    const after = await page.screenshot({clip: area});
    const changed = await page.evaluate(async ([a, b]) => {
      const load = async s => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
      const p = await load(a), q = await load(b); let n = 0; for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 90) n++;
      return n;
    }, [before.toString('base64'), after.toString('base64')]);
    ok(await page.evaluate(() => JSON.parse(document.querySelectorAll('.pagecard')[1].dataset.ink || '[]').length) === 1, 'the Pencil draws on the zoomed-in page');
    ok(changed > 500 && await page.evaluate(() => !!document.querySelectorAll('.pagecard')[1].querySelector('canvas.sharp')), `and the stroke shows over the sharp drawing (${changed} screen pixels changed)`);
  }

  // ---- what is kept: the drawings are not saved, the PDF stays out of notebook files ----
  await page.evaluate(() => flushSave?.()); await page.waitForTimeout(900);
  const saved = await page.evaluate(async () => ({doc: await get('doc:' + curId), file: JSON.parse((await (await notebookFile()).blob.text()).match(/<script id="notebook-data" type="application\/json">([\s\S]*?)<\/script>/)[1]).doc}));
  ok(/data-pdfsrc="bts-asset:a[0-9a-z]+"/.test(saved.doc) && !/<canvas/.test(saved.doc), 'saved in this browser: each page names the stored PDF, and none of the sharp drawings is saved');
  ok(!/data-pdfsrc|data-pdf=|application\/pdf/.test(saved.file) && !/<canvas/.test(saved.file), 'a notebook file (download, Google Drive, OneDrive) leaves the PDF out');

  // ---- memory: scrolling the whole 45 pages at 3× keeps only what is on screen ----
  const top = await page.evaluate(() => { document.querySelector('.pagecard').scrollIntoView({block: 'start', behavior: 'instant'}); return document.documentElement.scrollHeight; });
  let worst = {px: 0, n: 0, pages: 0, docs: 0, far: 0, live: 0}, steps = 0, drawn = 0;
  for (let y = await page.evaluate(() => scrollY); y < top; y += 1100) {
    await page.evaluate(y => scrollTo({top: y, behavior: 'instant'}), y); await settle(); steps++;
    const s = await state(); drawn += s.n ? 1 : 0;
    for (const k of Object.keys(worst)) worst[k] = Math.max(worst[k], s[k]);
    worst.view = s.view;
    if (s.live !== s.n) { ok(false, 'every drawing kept is on the page (' + s.live + ' kept, ' + s.n + ' on the page)'); }
  }
  ok(steps > 40 && drawn >= steps - 2, `scrolled down all ${N} pages at 3× in ${steps} steps, each drawn sharp where it stopped`);
  ok(worst.px <= worst.view * 2.1, `the sharp drawings never held more than ${(worst.px / 1e6).toFixed(1)} million pixels (${(worst.px * 4 / 2 ** 20).toFixed(0)} MB; the window is ${(worst.view / 1e6).toFixed(1)} million)`);
  ok(worst.n <= 4 && worst.far === 0, `at most ${worst.n} drawings at a time, none far off the screen`);
  ok(worst.pages <= 3 && worst.docs === 1, `at most ${worst.pages} PDF pages held open at a time, in the one PDF`);

  // ---- back to the fit: all let go of ----
  await page.click('#zoomPct'); await settle();
  st = await state();
  ok(await page.evaluate(() => pageZoom === 1) && st.n === 0 && st.live === 0 && st.docs === 0 && st.pages === 0, 'back at the fit every drawing is let go of and the PDF is closed');

  // ---- after a reload the stored PDF is used ----
  await page.reload(); await page.waitForFunction(n => document.querySelectorAll('.pagecard').length >= n, N, {timeout: 60000}); await page.waitForTimeout(800);
  await showPage(2);
  await page.evaluate(() => setPageZoom(2)); await settle();
  st = await state();
  ok(st.n >= 1 && st.docs === 1, 'after a reload, zooming in draws the pages sharp again from the stored PDF');
  await page.evaluate(() => setPageZoom(1)); await settle();
  ok((await state()).n === 0, 'and lets them go at the fit');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

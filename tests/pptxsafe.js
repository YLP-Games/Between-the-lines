// Hardening of the PowerPoint import (a crafted .pptx can't inject markup or script, odd relationships still open, a custom-shaped picture
// still draws, a notebook switch mid-import doesn't misfile the slides) and two keys in notes (Enter that confirms an IME word, Esc to leave a note)
const {open} = require('./harness'); const path = require('path'); const fs = require('fs');
const JSZip = require('jszip');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, {recursive: true});
// a copy of a test file with changes made to it, saved to shots/<name>
const edit = async (z, p, f) => z.file(p, f(await z.file(p).async('string')));
const craft = async (src, name, fn) => { const z = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, src))); await fn(z); const out = path.join(OUT, name); fs.writeFileSync(out, await z.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'})); return out; };
// what a page picture holds around a colour: how many pixels are near it
const near = (p, n, rgb) => p.evaluate(async ([n, rgb]) => {
  const u = document.querySelectorAll('.pagecard')[n].style.getPropertyValue('--pg').match(/url\(["']?(.*?)["']?\)$/)[1], im = new Image(); im.src = u; await im.decode();
  const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const c = cv.getContext('2d'); c.drawImage(im, 0, 0);
  const d = c.getImageData(0, 0, cv.width, cv.height).data; let k = 0;
  for (let i = 0; i < d.length; i += 12) if (Math.abs(d[i] - rgb[0]) < 14 && Math.abs(d[i + 1] - rgb[1]) < 14 && Math.abs(d[i + 2] - rgb[2]) < 14) k++;
  return k;
}, [n, rgb]);
// a plain PNG of one colour
const png = (w, h, rgb) => {
  const crcT = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', require('zlib').deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
(async () => {
  const {browser, page, errors} = await open(APP, {width: 1300, height: 1000});
  await page.waitForTimeout(600);
  const warn = []; page.on('console', m => { if (m.type() === 'warning') warn.push(m.text()); });
  const openFile = async (f, n, sel = '#main .slide', ms = 60000) => { const head = path.basename(f).replace(/\.[^.]+$/, '').replace(/_+/g, ' '); await page.setInputFiles('#file', f.includes('/') ? f : path.join(__dirname, f)); await page.waitForFunction(([sel, n, head]) => document.querySelector('#main .file-head')?.textContent === head && document.querySelectorAll(sel).length >= n, [sel, n, head], {timeout: ms}); await page.waitForTimeout(700); };
  const opens = (...a) => openFile(...a.slice(0, 3), 12000).then(() => true, () => false);

  // ---- keys in a note ----
  await openFile('week2.pptx', 2);
  const strip = page.locator('.pagecard').first().locator('.strip').first(); await strip.scrollIntoViewIfNeeded();
  const gaps = await page.evaluate(() => JSON.parse(document.querySelector('.pagecard').dataset.gaps));
  const bb = await strip.boundingBox(), H = await page.evaluate(() => +document.querySelector('.pagecard').dataset.h), g = gaps[1];
  await page.mouse.move(bb.x + 300, bb.y + (g[0] + g[1]) / 2 / H * bb.height, {steps: 3}); await page.waitForTimeout(250);
  await page.click('.gappill'); await page.keyboard.type('hello'); await page.waitForTimeout(200);
  const note = page.locator('.pagecard').first().locator('.notebox .mine').first();
  const key = init => note.evaluate((n, init) => { const before = n.innerHTML, ev = new KeyboardEvent('keydown', {bubbles: true, cancelable: true, ...init}); n.dispatchEvent(ev); return {prevented: ev.defaultPrevented, changed: n.innerHTML !== before, html: n.innerHTML}; }, init);
  let r = await key({key: 'Enter', isComposing: true});
  ok(!r.prevented && !r.changed, 'Enter while an IME is composing is left to the IME (no line break)');
  r = await key({key: 'Enter', keyCode: 229});
  ok(!r.prevented && !r.changed, 'Enter that confirms an IME word (keyCode 229, as Safari sends it) is no line break either');
  r = await key({key: 'Enter'});
  ok(r.prevented && r.changed && r.html.includes('<br>'), 'a plain Enter still makes a line break');
  await page.keyboard.type('x'); await page.keyboard.press('Tab'); await page.waitForTimeout(100);
  ok(await note.evaluate(n => !!n.querySelector('blockquote, [style*="margin-left"]')), 'Tab in a note still indents');
  await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(100);
  ok(await note.evaluate(n => !n.querySelector('blockquote, [style*="margin-left"]')), 'Shift+Tab takes it back');
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => !document.activeElement?.closest('.mine')) && (await note.textContent()).includes('hello'), 'Esc leaves the note (focus is free to move on) and keeps its words');
  await note.focus(); await page.keyboard.press('End'); await page.keyboard.type('!'); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => !document.activeElement?.closest('.mine')) && (await note.textContent()).includes('!'), 'and again after more typing');
  await page.evaluate(() => setFocus(true)); await note.focus(); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => !focusMode && !!document.activeElement?.closest('.mine')), 'in Focus mode the first Esc leaves Focus mode and the note keeps the cursor');
  await page.mouse.click(5, 500); await page.waitForTimeout(400);

  // ---- a crafted .pptx can't put markup or script into the page ----
  const ENT = x => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const xss = await craft('fid-rich.pptx', 'xss.pptx', async z => {
    await edit(z, 'ppt/slides/slide1.xml', x => x.replace('<a:srgbClr val="FFFFFF"/>', `<a:srgbClr val="${ENT('"><img src=x onerror="window.__pwned=1">')}"/>`)
      .replace('<a:latin typeface="Georgia"/>', `<a:latin typeface="${ENT('q"><img src=y onerror="window.__pwned=2"> x" onmouseover="window.__pwned=3')}"/>`)
      .replace('<a:t>Richer test deck</a:t>', `<a:t>Richer test deck</a:t></a:r><a:r><a:t>${ENT('<img src=z onerror="window.__pwned=4">')}</a:t>`));
  });
  const dirty = () => page.evaluate(() => ({pwned: window.__pwned, imgs: [...document.querySelectorAll('#main img')].map(i => i.getAttribute('src')).filter(s => s && !/^(blob|data):/.test(s)), handlers: [...document.querySelectorAll('#main *')].filter(e => [...e.attributes].some(a => /^on/i.test(a.name))).length, text: document.querySelector('#main').textContent}));
  for (const mode of ['text', 'look']) {
    await page.evaluate(m => pref.set('pptx-mode', m), mode);
    await openFile(xss, 4, mode === 'look' ? '#main .pagecard' : '#main .slide');
    await page.waitForTimeout(500);
    const d = await dirty();
    ok(d.pwned === undefined && !d.imgs.length && d.handlers === 0, `${mode} mode: a script-laden colour and font name in the file run nothing and make no element (${JSON.stringify({p: d.pwned, i: d.imgs, h: d.handlers})})`);
    ok(await page.locator(mode === 'look' ? '.pagecard' : '#main .slide').count() === 4 && (mode === 'look' || d.text.includes('Richer test deck')), `${mode} mode: the deck still opens with its four slides`);
    if (mode === 'text') ok(d.text.includes('<img src=z onerror="window.__pwned=4">') && await page.evaluate(() => [...document.querySelectorAll('#main span')].every(s => !/color:\s*#[^;]*[^0-9a-f;\s]/i.test(s.getAttribute('style') || ''))), 'text mode: text that looks like markup stays text, and only real colours are used');
  }
  await page.evaluate(() => pref.set('pptx-mode', 'look'));

  // ---- relationships written with absolute targets ("/ppt/slides/slide1.xml"), and slides that aren't called slideN.xml ----
  const abs = await craft('fid-rich.pptx', 'abs.pptx', async z => {
    z.file('ppt/slides/deckslide2.xml', await z.file('ppt/slides/slide2.xml').async('string')); z.remove('ppt/slides/slide2.xml');
    z.file('ppt/slides/_rels/deckslide2.xml.rels', await z.file('ppt/slides/_rels/slide2.xml.rels').async('string')); z.remove('ppt/slides/_rels/slide2.xml.rels');
    await edit(z, 'ppt/_rels/presentation.xml.rels', x => x.replace('slides/slide2.xml', 'slides/deckslide2.xml'));
    for (const f of Object.keys(z.files).filter(f => f.endsWith('.rels'))) {
      const dir = f.replace(/_rels\/[^/]*$/, '');
      await edit(z, f, x => x.replace(/Target="([^"]+)"(?! TargetMode)/g, (m, t) => { if (t[0] === '/' || /^[a-z]+:/i.test(t)) return m; const parts = dir.split('/').filter(Boolean); for (const seg of t.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); } return `Target="/${parts.join('/')}"`; }));
    }
  });
  ok((await JSZip.loadAsync(fs.readFileSync(abs)).then(z => z.file('ppt/_rels/presentation.xml.rels').async('string'))).includes('Target="/ppt/slides/slide1.xml"'), 'the test file has absolute targets');
  for (const mode of ['text', 'look']) {
    await page.evaluate(m => pref.set('pptx-mode', m), mode);
    const sel = mode === 'look' ? '#main .pagecard' : '#main .slide';
    ok(await opens(abs, 4, sel), `${mode} mode: a deck with absolute relationship targets opens with its four slides`);
    if (mode === 'text') ok(await page.evaluate(() => [...document.querySelectorAll('#main .slide')].map(c => c.querySelectorAll('img').length).join()) === '0,1,0,0', 'text mode: the picture on slide 2 (absolute target, slide not called slideN.xml) is there');
    else ok(await near(page, 1, [250, 200, 60]) > 20000, 'look mode: and the picture on slide 2 is drawn');
  }
  await page.evaluate(() => pref.set('pptx-mode', 'look'));

  // ---- custom outlines: a picture cut to a shape, and a shape whose path is missing its points, still draw ----
  await openFile('fid-rich.pptx', 4, '#main .pagecard'); const full = await near(page, 1, [250, 200, 60]);
  const CUST = body => `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst>${body}</a:pathLst></a:custGeom>`;
  const cg = await craft('fid-rich.pptx', 'custgeom.pptx', async z => {
    await edit(z, 'ppt/slides/slide2.xml', x => x.replace('<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>', CUST('<a:path w="100" h="100"><a:moveTo><a:pt x="0" y="100"/></a:moveTo><a:lnTo><a:pt x="50" y="0"/></a:lnTo><a:lnTo><a:pt x="100" y="100"/></a:lnTo><a:close/></a:path>') + '</p:spPr></p:pic>'));
    await edit(z, 'ppt/slides/slide1.xml', x => x.replace('</p:spTree>', `<p:sp><p:nvSpPr><p:cNvPr id="90" name="Broken"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="5000000"/><a:ext cx="1000000" cy="500000"/></a:xfrm>${CUST('<a:path w="10" h="10"><a:moveTo/><a:lnTo/><a:cubicBezTo><a:pt x="1" y="1"/></a:cubicBezTo><a:close/></a:path>')}<a:solidFill><a:srgbClr val="FF00FF"/></a:solidFill></p:spPr></p:sp></p:spTree>`));
  });
  warn.length = 0;
  ok(await opens(cg, 4, '#main .pagecard'), 'a deck with custom outlines opens as four slide pictures');
  const cut = await near(page, 1, [250, 200, 60]);
  ok(!warn.some(w => /drawn as text/.test(w)) && await page.locator('#main .slide:not(.pagecard)').count() === 0, 'no slide had to be rebuilt as text' + (warn.length ? ' (' + warn.join(' | ').slice(0, 200) + ')' : ''));
  ok(cut > 3000 && cut < full * .7, `the picture shows through its triangle outline only (${cut} of ${full} yellow pixels)`);

  // ---- one very long word breaks into lines in a moment (it used to take time with the square of its length) ----
  const LONG = Array.from({length: 4000}, (_, i) => 'abcdefghijklmnopqrstuvwxyz'[(i * 7) % 26]).join('');
  const lw = await craft('fid-rich.pptx', 'longword.pptx', z => edit(z, 'ppt/slides/slide1.xml', x => x.replace('Small caption text at eighteen points', LONG)));
  const t0 = Date.now(), fast = await opens(lw, 4, '#main .pagecard'), took = Date.now() - t0;
  ok(fast, `a 4000-letter word lays out in ${took} ms (not tens of seconds)`);
  const bits = await page.evaluate(() => JSON.parse(document.querySelector('.pagecard').dataset.text).filter(i => /^[a-z]{12,}$/.test(i[0])));
  ok(bits.length > 40 && bits.map(i => i[0]).join('') === LONG && bits.every(i => i[4] <= 418), `…in ${bits.length} pieces that together are the whole word and each fit the box`);

  // ---- switching notebook while a file is still being read: the rest of it is not added to the notebook you went to ----
  await openFile('week2.pptx', 2, '#main .pagecard');
  const idOf = name => page.evaluate(n => docs.find(d => d.name === n)?.id, name), cards = () => page.evaluate(() => ({cards: document.querySelectorAll('#main .pagecard').length, slides: document.querySelectorAll('#main .slide').length, heads: [...document.querySelectorAll('#main .file-head')].map(h => h.textContent), cur: curId}));
  const idWeek = await idOf('week2'), before = await cards();
  ok(before.cards === 2 && before.heads.join() === 'week2', 'a notebook with the two slides of week2 to go back to');
  await page.evaluate(() => { window.__render = PPT.render; PPT.render = async (D, path, n) => { if (n === 2 && window.__hold) await new Promise(r => { window.__go = r; }); return window.__render(D, path, n); }; window.__hold = true; });
  await page.setInputFiles('#file', path.join(__dirname, 'fid-rich.pptx'));
  await page.waitForFunction(() => window.__go && document.querySelectorAll('#main .pagecard').length === 1, null, {timeout: 30000});
  const idRich = (await cards()).cur;
  await page.evaluate(id => switchDoc(id), idWeek); await page.waitForTimeout(500);
  await page.evaluate(() => { window.__hold = false; window.__go(); }); await page.waitForTimeout(2500);
  let now = await cards();
  ok(now.cur === idWeek && now.cards === 2 && now.heads.join() === 'week2', `the other notebook still has just its two slides (${JSON.stringify(now)})`);
  ok((await page.textContent('#toast')).includes('Stopped opening'), 'and a message says the file stopped opening');
  await page.evaluate(id => switchDoc(id), idRich); await page.waitForTimeout(600);
  now = await cards();
  ok(now.cur === idRich && now.cards <= 1 && now.heads.length <= 1, `the notebook the file was being opened in is not left in pieces (${JSON.stringify(now)})`);
  await page.evaluate(() => { PPT.render = window.__render; });
  // the same for a Word file, held while its first page's picture is stored; the other notebook's pages must not be taken away either
  await page.evaluate(id => switchDoc(id), idWeek); await page.waitForTimeout(500);
  await page.evaluate(() => { window.__add = addAsset; window.addAsset = async b => { if (window.__hold2) await new Promise(r => { window.__go2 = r; }); return window.__add(b); }; window.__hold2 = true; });
  await page.setInputFiles('#file', path.join(__dirname, 'fid-rich.docx'));
  await page.waitForFunction(() => window.__go2, null, {timeout: 30000});
  const idDoc = (await cards()).cur;
  await page.evaluate(id => switchDoc(id), idWeek); await page.waitForTimeout(500);
  await page.evaluate(() => { window.__hold2 = false; window.__go2(); }); await page.waitForTimeout(2500);
  now = await cards();
  ok(now.cur === idWeek && now.slides === 2 && now.heads.join() === 'week2', `Word: the other notebook is left as it was (${JSON.stringify(now)})`);
  await page.evaluate(() => { window.addAsset = window.__add; });
  await page.evaluate(id => switchDoc(id), idDoc); await page.waitForTimeout(600);
  ok(await page.evaluate(() => document.querySelectorAll('#main .slide').length) <= 1, 'Word: and the notebook it was being opened in is not left in pieces');
  // and a PDF, held while its first page's picture is stored
  await page.evaluate(id => switchDoc(id), idWeek); await page.waitForTimeout(500);
  await page.evaluate(() => { window.addAsset = async b => { if (window.__hold3) await new Promise(r => { window.__go3 = r; }); return window.__add(b); }; window.__hold3 = true; });
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => window.__go3, null, {timeout: 30000});
  const idPdf = (await cards()).cur;
  await page.evaluate(id => switchDoc(id), idWeek); await page.waitForTimeout(500);
  await page.evaluate(() => { window.__hold3 = false; window.__go3(); }); await page.waitForTimeout(2500);
  now = await cards();
  ok(now.cur === idWeek && now.slides === 2 && now.heads.join() === 'week2', `PDF: the other notebook is left as it was (${JSON.stringify(now)})`);
  ok((await page.textContent('#toast')).includes('Stopped opening'), 'PDF: and a message says the file stopped opening');
  await page.evaluate(() => { window.addAsset = window.__add; });
  await page.evaluate(id => switchDoc(id), idPdf); await page.waitForTimeout(600);
  ok(await page.evaluate(() => document.querySelectorAll('#main .slide').length) <= 1, 'PDF: and the notebook it was being opened in is not left in pieces');

  // ---- SmartArt: a picture in the diagram's drawing is found through the drawing's own relationships, not the slide's ----
  const DGM = 'http://schemas.openxmlformats.org/drawingml/2006/diagram', A = 'http://schemas.openxmlformats.org/drawingml/2006/main', R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', DSP = 'http://schemas.microsoft.com/office/drawing/2008/diagram';
  const REL = (id, type, target) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`, RELS = body => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
  const sa = await craft('fid-rich.pptx', 'smartart.pptx', async z => {
    // slide 2: its own rId2 is the yellow picture; the diagram's drawing says rId2 is a magenta one
    await edit(z, 'ppt/slides/slide2.xml', x => x.replace(/<p:pic>[\s\S]*<\/p:pic>/, `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="Diagram 8"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="6400800" y="1645920"/><a:ext cx="4572000" cy="3044952"/></p:xfrm><a:graphic><a:graphicData uri="${DGM}"><dgm:relIds xmlns:dgm="${DGM}" r:dm="rId5" r:lo="rId5" r:qs="rId5" r:cs="rId5"/></a:graphicData></a:graphic></p:graphicFrame>`));
    await edit(z, 'ppt/slides/_rels/slide2.xml.rels', x => x.replace('</Relationships>', REL('rId5', R + '/diagramData', '../diagrams/data1.xml') + REL('rId6', 'http://schemas.microsoft.com/office/2007/relationships/diagramDrawing', '../diagrams/drawing1.xml') + '</Relationships>'));
    z.file('ppt/diagrams/data1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><dgm:dataModel xmlns:dgm="${DGM}" xmlns:a="${A}"><dgm:ptLst/><dgm:cxnLst/><dgm:bg/><dgm:whole/><dgm:extLst><a:ext uri="${DSP}"><dsp:dataModelExt xmlns:dsp="${DSP}" relId="rId6" minVer="${DGM}"/></a:ext></dgm:extLst></dgm:dataModel>`);
    z.file('ppt/diagrams/drawing1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><dsp:drawing xmlns:dsp="${DSP}" xmlns:a="${A}" xmlns:r="${R}"><dsp:spTree><dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr><dsp:grpSpPr/><dsp:sp modelId="{1}"><dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr><dsp:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4572000" cy="3044952"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></dsp:spPr></dsp:sp></dsp:spTree></dsp:drawing>`);
    z.file('ppt/diagrams/_rels/drawing1.xml.rels', RELS(REL('rId2', R + '/image', '../media/magenta.png')));
    z.file('ppt/media/magenta.png', png(32, 32, [255, 0, 255]));
  });
  ok(await opens(sa, 4, '#main .pagecard'), 'a deck with a SmartArt drawing opens as four slide pictures');
  const mag = await near(page, 1, [255, 0, 255]), yel = await near(page, 1, [250, 200, 60]);
  ok(mag > 20000 && yel < 500, `the diagram shows its own (magenta) picture, not the slide's rId2 (magenta ${mag}, yellow ${yel})`);

  // ---- a deck of many pictures doesn't keep them all decoded, or every slide's parts, until it is done ----
  const many = await craft('fid-rich.pptx', 'manypics.pptx', async z => {
    const s2 = await z.file('ppt/slides/slide2.xml').async('string'), r2 = await z.file('ppt/slides/_rels/slide2.xml.rels').async('string');
    let ids = '', rels = '';
    for (let i = 0; i < 30; i++) {
      z.file(`ppt/slides/pic${i}.xml`, s2); z.file(`ppt/slides/_rels/pic${i}.xml.rels`, r2.replace('../media/image1.png', `../media/u${i}.png`));
      z.file(`ppt/media/u${i}.png`, png(16, 16, [(i * 8) % 256, (i * 40) % 256, 90]));
      ids += `<p:sldId id="${300 + i}" r:id="rId${100 + i}"/>`; rels += REL(`rId${100 + i}`, R + '/slide', `slides/pic${i}.xml`);
    }
    await edit(z, 'ppt/presentation.xml', x => x.replace('</p:sldIdLst>', ids + '</p:sldIdLst>'));
    await edit(z, 'ppt/_rels/presentation.xml.rels', x => x.replace('</Relationships>', rels + '</Relationships>'));
  });
  await page.evaluate(() => { const o = PPT.deck; PPT.deck = async zip => (window.__D = await o(zip)); });
  ok(await opens(many, 34, '#main .pagecard'), 'a deck of 34 slides, 30 of them with a picture of their own, opens');
  const kept = await page.evaluate(() => ({imgs: window.__D.imgs.size, slideParts: [...window.__D.xml.keys()].filter(k => /^ppt\/slides\//.test(k)).length}));
  ok(kept.imgs <= 24 && kept.slideParts === 0, `…and kept at most 24 decoded pictures and none of the slide parts once drawn (${JSON.stringify(kept)})`);

  // ---- the same for a Word file: a link that runs script is made plain text ----
  const dx = await craft('reading.docx', 'xssdoc.docx', async z => {
    await edit(z, 'word/document.xml', x => x.replace('<w:body>', '<w:body><w:p><w:hyperlink r:id="rId98"><w:r><w:t>evil link</w:t></w:r></w:hyperlink><w:r><w:t xml:space="preserve"> and </w:t></w:r><w:hyperlink r:id="rId99"><w:r><w:t>good link</w:t></w:r></w:hyperlink></w:p>'));
    await edit(z, 'word/_rels/document.xml.rels', x => x.replace('</Relationships>', '<Relationship Id="rId98" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:window.__pwned=5" TargetMode="External"/><Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/" TargetMode="External"/></Relationships>'));
  });
  await openFile(dx, 1);
  const links = await page.evaluate(() => [...document.querySelectorAll('#main a')].map(a => [a.textContent, a.getAttribute('href')]));
  ok(links.some(l => l[0] === 'good link' && l[1] === 'https://example.com/') && links.every(l => !/^\s*javascript:/i.test(l[1] || '')) && (await page.textContent('#main')).includes('evil link'), 'Word: an https link is kept, a javascript: link has no address (' + JSON.stringify(links) + ')');
  await page.evaluate(() => { for (const a of document.querySelectorAll('#main a')) if (a.textContent === 'evil link') a.click(); });
  ok(await page.evaluate(() => window.__pwned === undefined), 'and clicking that link runs nothing');

  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

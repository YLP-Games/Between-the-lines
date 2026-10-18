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
(async () => {
  const {browser, page, errors} = await open(APP, {width: 1300, height: 1000});
  await page.waitForTimeout(600);
  const openFile = async (f, n, sel = '#main .slide') => { const head = path.basename(f).replace(/\.[^.]+$/, '').replace(/_+/g, ' '); await page.setInputFiles('#file', f.includes('/') ? f : path.join(__dirname, f)); await page.waitForFunction(([sel, n, head]) => document.querySelector('#main .file-head')?.textContent === head && document.querySelectorAll(sel).length >= n, [sel, n, head], {timeout: 60000}); await page.waitForTimeout(700); };

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

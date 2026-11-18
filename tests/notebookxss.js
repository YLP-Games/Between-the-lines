// A notebook file is HTML that may come from someone else: nothing in it may run, whether it is opened, reloaded,
// shown beside another notebook, or read back from a tampered saved copy; and an ordinary notebook comes through whole
const {open} = require('./harness'); const path = require('path'); const fs = require('fs');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const HIT = 'window.__pwned=(window.__pwned||[]).concat';
const TRAPS = [
  `<img src="x:none" onerror="${HIT}('img')">`,
  `<svg onload="${HIT}('svg')"><script>${HIT}('svgscript')</script><a href="javascript:${HIT}('svga')"><text y="10">x</text></a><set attributeName="onload" to="${HIT}('set')"/><animate attributeName="href" values="javascript:${HIT}('anim')"/></svg>`,
  `<iframe srcdoc="<script>parent.__pwned=(parent.__pwned||[]).concat('srcdoc')<\/script>"></iframe>`,
  `<details open ontoggle="${HIT}('details')"><summary>s</summary></details>`,
  `<a id="jsLink" href=" java\tscript:${HIT}('link')">click me</a>`,
  `<noscript><p title="</noscript><img src=x:none onerror=${HIT}('noscript')>"></p></noscript>`,
  `<math><mtext><table><mglyph><style><img src=x:none onerror=${HIT}('mxss')></style></mglyph></table></mtext></math>`,
  `<form action="https://example.invalid/"><button formaction="javascript:${HIT}('form')">go</button></form>`,
  `<object data="javascript:${HIT}('object')"></object><embed src="javascript:${HIT}('embed')">`,
  `<meta http-equiv="refresh" content="0;url=javascript:${HIT}('meta')"><base href="https://example.invalid/"><link rel="stylesheet" href="https://example.invalid/x.css">`,
  `<style>body{display:none}</style>`,
  `<img name="querySelector" src="x:none"><img id="getElementById" name="getElementById" src="x:none"><span id="file">clobber</span>`,
  `<video src="x:none" onerror="${HIT}('video')"></video><audio><source src="x:none" onerror="${HIT}('source')"></audio>`,
];
const LEGIT = `<p class="legit"><b>Bold</b> <span style="color: rgb(200, 0, 0)">red</span> <a href="https://example.com/x">a link</a> <a href="#top">jump</a> <a href="mailto:a@b.c">mail</a> <img alt="dot" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="></p>`;
const pwned = p => p.evaluate(() => window.__pwned || []);
(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  // an ordinary notebook, saved as a file
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(800);
  const strip = page.locator('.pagecard').nth(1).locator('.strip').first(); await strip.scrollIntoViewIfNeeded();
  const b = await strip.boundingBox(); await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.keyboard.type('my own note'); await page.mouse.click(5, 700); await page.waitForTimeout(800);
  const clean = await page.evaluate(() => main.innerHTML);
  if (await page.evaluate(() => typeof safeHtml === 'function')) {
    ok(await page.evaluate(h => safeHtml(h) === h, clean), `an ordinary notebook comes through the check unchanged (${(clean.length / 1000).toFixed(0)} kB)`);
    const big = await page.evaluate(h => { const s = h.repeat(20), t = performance.now(); safeHtml(s); return [s.length, performance.now() - t]; }, clean);
    console.log(`    (a ${(big[0] / 1e6).toFixed(1)} MB notebook takes ${big[1].toFixed(0)} ms to check)`);
  }
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => downloadNotebook())]);
  const file = fs.readFileSync(await dl.path(), 'utf8');
  const m = file.match(/(<script id="notebook-data" type="application\/json">)([\s\S]*?)(<\/script>)/);
  const data = JSON.parse(m[2]);
  ok(data.doc.includes('my own note'), 'the notebook file holds the note');

  // someone booby-traps it: a page full of tricks, and the same in a note
  data.id = 'evil1'; data.name = 'Shared notes';
  data.doc = data.doc.replace('my own note', 'my own note' + TRAPS.join('')) + `<div class="slide"><div class="content">${LEGIT}${TRAPS.join('')}</div></div>`;
  const evil = path.join(__dirname, 'shots', 'evil-notebook.html');
  fs.writeFileSync(evil, file.replace(m[0], m[1] + JSON.stringify(data).replace(/</g, '\\u003c') + m[3]));

  const check = async (where, root = 'main', legit = true) => {
    await page.waitForTimeout(1200);
    ok((await pwned(page)).length === 0, `${where}: nothing in it ran (${(await pwned(page)).join(', ') || 'none'})`);
    const left = await page.evaluate(r => {
      const el = document.querySelector(r), bad = [];
      for (const e of el.querySelectorAll('*')) {
        if (/^(script|style|iframe|object|embed|meta|base|link|noscript|form|set|animate|template)$/i.test(e.localName)) bad.push(e.localName);
        for (const a of e.attributes) if (/^on/i.test(a.name) || a.name === 'srcdoc' || a.name === 'formaction' || /^\s*j\s*a\s*v\s*a/i.test(a.value.replace(/[\0-\x20]/g, ''))) bad.push(e.localName + '@' + a.name);
      }
      return bad;
    }, root);
    ok(left.length === 0, `${where}: no scripts, frames, handlers or javascript: links are left in the page (${left.join(', ') || 'none'})`);
    ok(await page.evaluate(() => typeof document.querySelector === 'function' && typeof document.getElementById === 'function' && document.getElementById('file')?.type === 'file'), `${where}: the page’s own names still work (document.querySelector, #file)`);
    if (!legit) return;
    const kept = await page.evaluate(r => {
      const p = document.querySelector(r + ' .legit'); if (!p) return null;
      return {b: !!p.querySelector('b'), red: !!p.querySelector('span[style*="color"]'), https: p.querySelector('a[href^="https://"]')?.href, hash: !!p.querySelector('a[href="#top"]'), mail: !!p.querySelector('a[href^="mailto:"]'), img: p.querySelector('img')?.src.startsWith('data:image/png')};
    }, root);
    ok(kept && kept.b && kept.red && kept.https === 'https://example.com/x' && kept.hash && kept.mail && kept.img, `${where}: what is ordinary stays (bold, colour, links, a picture)`);
  };

  // 1. opened as a file
  await page.setInputFiles('#file', evil);
  await page.waitForFunction(() => Document.prototype.querySelector.call(document, '#main .legit'), null, {timeout: 20000});
  await check('opened with Open');
  ok(await page.evaluate(() => [...document.querySelectorAll('#main .mine')].some(n => n.textContent.includes('my own note'))), 'and the note’s own words are there');
  await page.click('#jsLink', {force: true}).catch(() => {}); await page.waitForTimeout(300);
  ok((await pwned(page)).length === 0, 'clicking the link does nothing harmful');
  const evilId = await page.evaluate(() => curId);
  await page.waitForTimeout(1500);

  // 2. reloaded from what this browser saved
  await page.reload(); await page.waitForTimeout(2500);
  await check('after a reload');

  // 3. a saved copy changed behind the app's back (another tab, an old version, a tampered sync), then opened
  const raw = data.doc;
  await page.evaluate(async ([id, html]) => { await putAll({['doc:' + id]: html}); }, [evilId, raw]);
  const other = await page.evaluate(async () => { await switchDoc(null); return curId; });
  await page.waitForTimeout(800);
  await page.evaluate(id => switchDoc(id), evilId);
  await check('a tampered saved copy');

  // 4. shown beside another notebook (split view)
  await page.evaluate(id => switchDoc(id), other); await page.waitForTimeout(800);
  await page.evaluate(async ([id, html]) => { await putAll({['doc:' + id]: html}); }, [evilId, raw]);
  ok(await page.evaluate(id => besideShow(id), evilId) !== false, 'the booby-trapped notebook shows beside another');
  await check('split view', '.bview');

  // 5. its notes copied and pasted into another notebook
  const pasted = await page.evaluate(async id => { await copyDocNotes(id); return noteClip?.notes.length || 0; }, evilId).catch(e => -1);
  if (pasted > 0) {
    await page.evaluate(() => pasteNotes('same')); await check('notes copied from it and pasted', 'main', false);
    ok(await page.evaluate(() => [...document.querySelectorAll('#main .mine')].some(n => n.textContent.includes('my own note'))), 'and the pasted note keeps its words');
  } else console.log('    (copying a whole notebook’s notes isn’t reachable here; skipped)');

  await page.screenshot({path: path.join(__dirname, 'shots', 'notebookxss.png')});
  await browser.close();
  fs.unlinkSync(evil);
  const errs = errors.filter(e => !/ERR_FAILED|net::|x:none|example\.invalid|ERR_UNKNOWN_URL_SCHEME/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });

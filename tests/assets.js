// Pictures are stored once, apart from the notes: small saves, nothing lost on reload, downloads still carry the pictures
const {open} = require('./harness'); const path = require('path'); const fs = require('fs');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const store = p => p.evaluate(() => new Promise(res => { const r = indexedDB.open('between-slides-text', 1); r.onsuccess = () => { const t = r.result.transaction('kv').objectStore('kv'), out = {}; const c = t.openCursor(); c.onsuccess = () => { const x = c.result; if (!x) return res(out); out[x.key] = typeof x.value === 'string' ? x.value.length : x.value instanceof Blob ? 'blob' : 'other'; x.continue(); }; }; }));
const pagesShow = p => p.evaluate(async () => { const urls = [...document.querySelectorAll('.pagecard')].map(c => (c.style.getPropertyValue('--pg').match(/url\(["']?(.*?)["']?\)$/) || [])[1]); for (const u of urls) { if (!u) return false; const r = await fetch(u); if (!r.ok || (await r.blob()).size < 1000) return false; } return urls.length > 0; });
const blobs = st => Object.values(st).filter(v => v === 'blob').length;
(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(1500);
  let st = await store(page);
  const docKey = Object.keys(st).find(k => k.startsWith('doc:') && st[k] > 100);
  ok(blobs(st) === 6, 'each PDF page picture is stored once, on its own');
  ok(st[docKey] < 60000, `the notebook itself is small (${Math.round(st[docKey] / 1000)} kB)`);
  ok(await page.evaluate(() => !document.querySelector('#main').innerHTML.includes('data:image')), 'the page holds no picture data, only links to the stored pictures');
  // a picture in a note
  const strip = page.locator('.pagecard').nth(2).locator('.strip').first(); await strip.scrollIntoViewIfNeeded();
  const b = await strip.boundingBox(); await page.mouse.move(b.x + 200, b.y + b.height / 2, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.keyboard.type('With a picture ');
  await page.click('#tab-insert'); const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#mediaBtn')]); await fc.setFiles(path.join(__dirname, 'pic.png'));
  await page.waitForTimeout(400); await page.mouse.click(5, 700); await page.waitForTimeout(1500);
  st = await store(page);
  ok(blobs(st) === 7, 'a picture added to a note is stored the same way');
  // reload twice (the second time after unused pictures are tidied away)
  for (const n of [1, 2]) {
    await page.reload(); await page.waitForTimeout(2500);
    ok(await pagesShow(page) && await page.locator('.notebox .media img').evaluate(i => i.complete && i.naturalWidth === 160), `reload ${n}: every page and the note's picture show`);
  }
  ok(blobs(await store(page)) === 7, 'pictures in use are kept');
  // Back / Forward still work
  await page.click('#tab-home');
  const before = await page.locator('.notebox').count();
  await page.click('#undoBtn').catch(() => {}); await page.waitForTimeout(400); await page.click('#redoBtn').catch(() => {}); await page.waitForTimeout(400);
  ok(await page.locator('.notebox').count() === before && await pagesShow(page), 'Back and Forward keep the pictures');
  // the notebook file carries the pictures inside it
  await page.click('#save'); const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-kind=notebook]')]);
  const file = fs.readFileSync(await dl.path(), 'utf8'), data = (file.match(/<script id="notebook-data" type="application\/json">([\s\S]*?)<\/script>/) || [, ''])[1];
  ok(data.includes('data:image/jpeg;base64') && data.includes('data:image/png;base64') && !data.includes('blob:') && !data.includes('bts-asset:'), 'a downloaded notebook file has its pictures inside it');
  fs.writeFileSync(path.join(__dirname, 'nbfile.html'), file);
  // a second notebook, then delete the first: its pictures are tidied away at the next start
  await page.evaluate(() => pref.set('pptx-mode', 'text'));      // this test counts stored pictures: the slides as text have none
  await page.setInputFiles('#file', path.join(__dirname, 'week2.pptx'));
  await page.waitForFunction(() => document.querySelectorAll('#docList .nb').length === 2, null, {timeout: 30000}); await page.waitForTimeout(800);
  const row = page.locator('#docList .nb', {hasText: 'lecture'}); await row.hover(); await row.locator('.more').click();
  await page.click('.docmenu [data-act=trash]'); await page.waitForTimeout(500);
  await page.click('#trashBox .trashhead'); await page.click('#trashBox [data-t=purge]'); await page.click('#trashBox [data-t=purge]'); await page.waitForTimeout(800);
  await page.reload(); await page.waitForTimeout(3000);
  ok(blobs(await store(page)) === 0, 'pictures of a deleted notebook are removed');
  ok((await page.textContent('main')).includes('Equilibrium'), 'the other notebook is untouched');
  // the downloaded file opens again, pictures and all (and they become stored pictures)
  await page.setInputFiles('#file', path.join(__dirname, 'nbfile.html'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 30000}); await page.waitForTimeout(2000);
  ok(await pagesShow(page) && (await page.textContent('main')).includes('With a picture'), 'the downloaded notebook file opens with its pages and notes');
  ok(blobs(await store(page)) === 7 && await page.evaluate(() => !document.querySelector('#main').innerHTML.includes('data:image')), 'and its pictures are stored once again');
  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

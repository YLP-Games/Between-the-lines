// A note on the slide linked to side notes: Link to side note on its toolbar, then a blank spot on the side page (a new note) or a note there;
// its lines, their pop-up, and what happens when the note on the slide goes
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);
  const away = async () => { await page.mouse.click(5, 700); await page.waitForTimeout(400); };
  const lines = () => page.$$eval('svg.sidelines path.sl', ps => ps.map(p => ({id: p.dataset.id, stroke: p.getAttribute('stroke'), hot: p.classList.contains('hot')})));
  const card = page.locator('.pagecard').nth(2), sp = page.locator('.sidepage').nth(2);
  const main = card.locator('.notebox').filter({hasText: 'Price taker idea'});
  const side = t => sp.locator('.notebox').filter({hasText: t});
  // the note's link button (its toolbar shows when you point at the note)
  const linkBtn = async () => {
    await main.scrollIntoViewIfNeeded(); await page.mouse.move(5, 700); const b = await main.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {steps: 3}); await page.waitForTimeout(250);
    return main.locator('.nbar .g-link');
  };

  // a note between the lines of the third page
  const strip = card.locator('.strip').first();
  await strip.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 120)); await page.waitForTimeout(300);
  const sb = await strip.boundingBox();
  await page.mouse.move(sb.x + 260, sb.y + sb.height * .5, {steps: 4}); await page.waitForTimeout(250);
  await page.click('.gappill'); await page.waitForTimeout(250);
  await page.keyboard.type('Price taker idea'); await away();
  ok(await main.count() === 1, 'a note on the slide');
  ok(!(await (await linkBtn()).isVisible()), 'with side notes off, its toolbar has no link button');

  await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(800);
  let lb = await linkBtn();
  ok(await lb.isVisible() && (await lb.getAttribute('title')).startsWith('Link to side note'), 'with side notes on, it has Link to side note');

  // a blank spot on the side page: a new side note, joined
  await lb.click(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.body.classList.contains('side-picking')), 'pressing it starts picking a side note');
  const nid = await main.getAttribute('data-nid');
  ok(/^n\w+$/.test(nid || ''), 'the note gets an id of its own: ' + nid);
  let spb = await sp.boundingBox();
  const m0 = await main.boundingBox(); await page.mouse.click(spb.x + 80, m0.y + 4); await page.waitForTimeout(500);
  await page.keyboard.type('Explained here'); await away();
  ok(await side('Explained here').getAttribute('data-link') === nid, 'clicking a blank spot makes a side note there, joined to it');
  ok(!(await page.evaluate(() => document.body.classList.contains('side-picking'))), 'and picking is over');
  let ls = await lines();
  ok(ls.length === 1 && ls[0].id === nid, 'one line, from the note');
  // it starts at the note's right edge, and ends at the side note
  const geo = await page.evaluate(() => {
    const p = document.querySelector('svg.sidelines path.sl'), m = p.getScreenCTM(), pt = l => { const q = p.getPointAtLength(l); return {x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f}; };
    return {a: pt(0), z: pt(p.getTotalLength())};
  });
  const mb = await main.boundingBox(), xb = await side('Explained here').boundingBox();
  ok(Math.abs(geo.a.x - (mb.x + mb.width)) < 3 && geo.a.y >= mb.y && geo.a.y <= mb.y + mb.height, 'the line starts at the note\'s right edge');
  ok(Math.abs(geo.z.x - xb.x) < 3, 'and ends at the side note');
  await page.screenshot({path: path.join(OUT, 'notelink-1-line.png')});

  // pointing at the note on the slide makes its line bold
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2, {steps: 3}); await page.waitForTimeout(250);
  ok((await lines()).every(l => l.hot), 'pointing at the note makes its line bold');

  // a note already on the side page
  await page.mouse.click(spb.x + 80, spb.y + spb.height - 140); await page.waitForTimeout(400);
  await page.keyboard.type('Also related'); await away();
  lb = await linkBtn(); await lb.click(); await page.waitForTimeout(300);
  const ab = await side('Also related').boundingBox();
  await page.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2); await page.waitForTimeout(400);
  await away();
  ok(await side('Also related').getAttribute('data-link') === nid && (await lines()).length === 2, 'clicking a side note joins it too: two lines');
  ok(await main.getAttribute('data-nid') === nid, 'the note keeps its id');

  // clicking a line: the note's words, and Unlink
  const mid = await page.evaluate(id => {
    const p = [...document.querySelectorAll('svg.sidelines path.sh')].find(x => x.dataset.id === id), m = p.getScreenCTM(), q = p.getPointAtLength(p.getTotalLength() / 2);
    return {x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f};
  }, nid);
  await page.mouse.move(mid.x, mid.y, {steps: 3}); await page.mouse.click(mid.x, mid.y); await page.waitForTimeout(300);
  ok(await page.isVisible('#linePop') && (await page.textContent('#linePop .aq')).includes('Price taker idea'), 'clicking a line shows the note\'s words');
  await page.click('#linePop [data-a=unlink]'); await page.waitForTimeout(300);
  ok((await lines()).length === 1, 'Unlink takes that line away');

  // it is kept with the notebook
  ok(await page.evaluate(id => currentDoc().includes(`data-nid="${id}"`), nid), 'the note\'s id is saved with the notebook');

  // the note on the slide goes: so do its lines
  await page.evaluate(() => { const b = [...document.querySelectorAll('.pagecard')[2].querySelectorAll('.notebox')].find(x => x.textContent.includes('Price taker idea')); b.remove(); sideLayout(); });
  await page.waitForTimeout(300);
  ok((await lines()).length === 0 && await sp.locator('.notebox[data-link]').count() === 0, 'when the note on the slide is gone, its side notes lose their lines');

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

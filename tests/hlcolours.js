// Highlight colours: one row that scrolls sideways, any colour of your own, and favourite highlight colours (on a computer and on a phone)
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
  const ink = i => page.evaluate(i => JSON.parse(document.querySelectorAll('.pagecard')[i].dataset.ink || '[]'), i);
  const wordsAt = async (i, txt) => {
    const get = () => page.evaluate(([i, txt]) => {
      const sp = [...document.querySelectorAll('.pagecard')[i].querySelectorAll('.tl')].find(s => s.textContent.includes(txt));
      sp.scrollIntoView({block: 'center'});
      const r = sp.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height};
    }, [i, txt]);
    await get(); await page.waitForTimeout(200); return get();
  };
  const select = async txt => {
    const b = await wordsAt(2, txt);
    await page.mouse.move(b.x + b.w * .02, b.y + b.h / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.w * .98, b.y + b.h / 2, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(250);
  };
  const row = () => page.evaluate(() => {
    const d = document.querySelector('#annoBar .hdots'), w = d.parentElement, r = d.getBoundingClientRect(), cur = d.querySelector('.hdot[aria-pressed="true"]')?.getBoundingClientRect();
    const tops = new Set([...d.querySelectorAll('.hdot')].map(b => Math.round(b.offsetTop)));
    return {sw: d.scrollWidth, cw: d.clientWidth, l: d.scrollLeft, rows: tops.size, ml: w.classList.contains('more-l'), mr: w.classList.contains('more-r'),
      curIn: !!cur && cur.left >= r.left - 1 && cur.right <= r.right + 1, first: d.querySelector('.hdot')?.dataset.c, favs: [...d.querySelectorAll('.hfav')].map(b => b.dataset.c)};
  });

  await select('Perfect');
  ok(await page.isVisible('#annoBar'), 'selecting words shows the bar');
  ok(await page.locator('#annoBar .hdot').count() === 15, 'with fifteen highlight colours');
  let r = await row();
  ok(r.rows === 1 && r.sw > r.cw + 50, 'in one row that scrolls sideways, not stacked');
  ok(!r.ml && r.mr && await page.isVisible('#annoBar .hsl[data-dir="1"]') && !(await page.isVisible('#annoBar .hsl[data-dir="-1"]')), 'an arrow (and a faded end) shows there are more to the right');
  ok(await page.isVisible('#annoBar .hpick') && await page.isVisible('#annoBar [data-hstar]'), 'then Any colour and a star for favourites');
  const bar = await page.locator('#annoBar').boundingBox();
  ok(bar.height < 50, 'the bar stays one line high (' + Math.round(bar.height) + 'px)');
  await page.screenshot({path: path.join(OUT, 'hl-1-bar.png'), clip: {x: bar.x - 10, y: bar.y - 10, width: bar.width + 20, height: bar.height + 20}});
  // the mouse wheel and the arrows scroll it
  const hb = await page.locator('#annoBar .hdots').boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.wheel(0, 200); await page.waitForTimeout(500);
  r = await row();
  ok(r.l > 50 && r.ml, 'the mouse wheel scrolls the colours sideways');
  ok(await page.isVisible('#annoBar'), 'without hiding the bar');
  await page.click('#annoBar .hsl[data-dir="-1"]'); await page.waitForTimeout(600);
  ok((await row()).l < r.l, 'the left arrow scrolls back');
  ok((await page.evaluate(() => getSelection().toString())).includes('Perfect'), 'and the words stay selected');
  // a colour far along the row
  await page.click('#annoBar .hdot[data-c="#d8f5a2"]'); await page.waitForTimeout(250);
  let items = await ink(2);
  ok(items.length === 1 && items[0].c === '#d8f5a2', 'Lime, at the far end, highlights the words');
  await select('barriers');
  r = await row();
  ok(r.curIn, 'next time the colour in use is scrolled into view');
  // favourites
  await page.click('#annoBar [data-hstar]'); await page.waitForTimeout(150);
  r = await row();
  ok(r.first === '#d8f5a2' && r.favs.join() === '#d8f5a2' && await page.getAttribute('#annoBar [data-hstar]', 'aria-pressed') === 'true', 'the star keeps the colour in use at the front of the row');
  ok(await page.evaluate(() => localStorage.getItem('hl-favs')) === '["#d8f5a2"]', 'and remembers it');
  ok(await page.isVisible('#annoBar') && (await ink(2)).length === 1, 'without highlighting anything yet');
  // any colour
  await page.evaluate(() => { const p = document.querySelector('#annoBar .hpick'); p.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})); p.value = '#ff66cc'; p.dispatchEvent(new Event('change', {bubbles: true})); });
  await page.waitForTimeout(250);
  items = await ink(2);
  ok(items.length === 2 && items[1].c === '#ff66cc' && items[1].t.includes('barriers'), 'Any colour highlights the words in the colour picked');
  ok(!(await page.isVisible('#annoBar')), 'and the bar goes');
  await select('identical');
  ok(await page.evaluate(() => document.querySelector('#annoBar .hpick').classList.contains('on')) && await page.getAttribute('#annoBar [data-hstar]', 'aria-pressed') === 'false', 'next time Any colour shows it is in use');
  await page.click('#annoBar [data-hstar]'); await page.waitForTimeout(150);
  r = await row();
  ok(r.favs.join() === '#ff66cc,#d8f5a2' && !(await page.evaluate(() => document.querySelector('#annoBar .hpick').classList.contains('on'))), 'the star adds it to the front of the row');
  await page.screenshot({path: path.join(OUT, 'hl-2-favs.png'), clip: await page.locator('#annoBar').boundingBox()});
  // remove a favourite: right-click, or its ×
  await page.click('#annoBar .hfav[data-c="#d8f5a2"]', {button: 'right'}); await page.waitForTimeout(150);
  ok((await row()).favs.join() === '#ff66cc' && (await ink(2)).length === 2, 'right-clicking a favourite removes it (and highlights nothing)');
  await page.hover('#annoBar .hfav[data-c="#ff66cc"]'); await page.waitForTimeout(150);
  await page.click('#annoBar [data-hx="#ff66cc"]'); await page.waitForTimeout(150);
  r = await row();
  ok(r.favs.length === 0 && r.first === '#ffe066' && await page.evaluate(() => localStorage.getItem('hl-favs')) === '[]', 'its × removes it too');
  ok(await page.isVisible('#annoBar') && (await ink(2)).length === 2, 'the bar is still there for the words');
  await page.keyboard.press('Escape');
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();

  // ---- on a phone ----
  const ph = await open(APP, {width: 390, height: 844, contextOptions: {hasTouch: true, isMobile: true}});
  await ph.page.waitForTimeout(500);
  await ph.page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await ph.page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await ph.page.waitForTimeout(800);
  await ph.page.evaluate(() => { const t = [...document.querySelectorAll('.pagecard')[2].querySelectorAll('.tl')].find(s => s.textContent.includes('barriers')); t.scrollIntoView({block: 'center'}); });
  await ph.page.waitForTimeout(500);
  await ph.page.evaluate(() => { const t = [...document.querySelectorAll('.pagecard')[2].querySelectorAll('.tl')].find(s => s.textContent.includes('barriers')); const g = document.createRange(); g.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(g); checkSelection(); });
  await ph.page.waitForTimeout(300);
  const pb = await ph.page.locator('#annoBar').boundingBox();
  const pr = await ph.page.evaluate(() => { const d = document.querySelector('#annoBar .hdots'); return {sw: d.scrollWidth, cw: d.clientWidth, rows: new Set([...d.querySelectorAll('.hdot')].map(b => Math.round(b.offsetTop))).size, dot: d.querySelector('.hdot').offsetWidth}; });
  ok(pb.x >= 0 && pb.x + pb.width <= 390, 'phone: the bar fits the screen (' + Math.round(pb.width) + 'px)');
  ok(pr.rows === 1 && pr.sw > pr.cw && pr.dot === 44, 'phone: the colours are one row of fingertip-sized dots you swipe through');
  ok(await ph.page.evaluate(() => { const c = document.querySelector('#annoBar [data-cm]').getBoundingClientRect(), d = document.querySelector('#annoBar .hdots').getBoundingClientRect(); return c.top >= d.bottom - 1; }), 'phone: Comment sits on a second row');
  await ph.page.screenshot({path: path.join(OUT, 'hl-3-phone.png'), clip: {x: 0, y: Math.max(0, pb.y - 10), width: 390, height: pb.height + 20}});
  ok(ph.errors.length === 0, 'no page errors');
  await ph.browser.close();
})().catch(e => { console.error(e); process.exit(1); });

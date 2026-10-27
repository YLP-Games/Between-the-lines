// Side notes with several lines: a highlight linked to two notes, a note linked to two highlights, each line with its own pop-up and colour,
// and the end of a line beside its note left free for the note's handles
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
  await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(800);
  const ink = i => page.evaluate(i => JSON.parse(document.querySelectorAll('.pagecard')[i].dataset.ink || '[]'), i);
  const wordsAt = async txt => {
    const get = () => page.evaluate(txt => {
      const sp = [...document.querySelectorAll('.pagecard')[2].querySelectorAll('.tl')].find(s => s.textContent.includes(txt));
      sp.scrollIntoView({block: 'center'});
      const r = sp.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height};
    }, txt);
    await get(); await page.waitForTimeout(250); return get();
  };
  const select = async txt => {
    const b = await wordsAt(txt);
    await page.mouse.move(b.x + b.w * .5, b.y + b.h / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.w * .98, b.y + b.h / 2, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(250);
  };
  const away = async () => { await page.mouse.click(5, 700); await page.waitForTimeout(400); };
  // the lines on screen: which highlight, which note, its colour, where it ends, and where its clickable part ends
  const lines = () => page.evaluate(() => {
    const pt = (p, l) => { const q = p.getPointAtLength(l), m = p.getScreenCTM(); return {x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f}; };
    const sl = [...document.querySelectorAll('svg.sidelines path.sl')], sh = [...document.querySelectorAll('svg.sidelines path.sh')];
    return sl.map((p, i) => ({id: p.dataset.id, stroke: p.getAttribute('stroke'), hot: p.classList.contains('hot'), end: pt(p, p.getTotalLength()), hitEnd: sh[i] && pt(sh[i], sh[i].getTotalLength()), mid: sh[i] && pt(sh[i], sh[i].getTotalLength() / 2)}));
  });

  // two highlights, each with its own new side note
  await select('economic profit');
  await page.click('#annoBar [data-side]'); await page.waitForTimeout(500);
  await page.keyboard.type('First note'); await away();
  await select('identical products');
  await page.click('#annoBar [data-side]'); await page.waitForTimeout(500);
  await page.keyboard.type('Second note'); await away();
  const items = await ink(2), h1 = items[0].id, h2 = items[1].id;
  const note = t => page.locator('.sidepage').nth(2).locator('.notebox').filter({hasText: t});
  ok(items.length === 2 && await note('First note').getAttribute('data-link') === h1 && await note('Second note').getAttribute('data-link') === h2, 'two highlights, each linked to its own note');
  ok((await lines()).length === 2, 'two lines');

  // link the first highlight to the second note too
  let w = await wordsAt('economic profit');
  await page.mouse.click(w.x + w.w * .8, w.y + w.h / 2); await page.waitForTimeout(300);
  ok(await page.isVisible('#annoPop [data-a=sidepick]') && (await page.textContent('#annoPop [data-a=sidepick]')).includes('Link to another side note…'), 'a linked highlight offers Link to another side note');
  await page.click('#annoPop [data-a=sidepick]'); await page.waitForTimeout(300);
  const nb = await note('Second note').boundingBox();
  await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2); await page.waitForTimeout(400);
  ok(await note('Second note').getAttribute('data-link') === `${h2} ${h1}`, 'the second note now belongs to both highlights');
  ok(await note('First note').getAttribute('data-link') === h1, 'and the first note keeps its link');
  let ls = await lines();
  ok(ls.length === 3 && ls.filter(l => l.id === h1).length === 2, 'three lines: the first highlight has two');
  await away();
  await page.screenshot({path: path.join(OUT, 'multi-1-three-lines.png')});

  // pointing at the second note makes both its lines bold
  const nb2 = await note('Second note').boundingBox();
  await page.mouse.move(nb2.x + nb2.width / 2, nb2.y + nb2.height / 2, {steps: 3}); await page.waitForTimeout(250);
  ls = await lines();
  ok(ls.filter(l => l.hot).length >= 2 && ls.filter(l => l.hot).some(l => l.id === h2), 'pointing at the second note makes both its lines bold');
  await page.mouse.move(5, 700); await page.waitForTimeout(250);

  // the last 40px of a line, beside its note, can't be pointed at (so the note's handles are easy to reach)
  ls = await lines();
  ok(ls.every(l => l.hitEnd && Math.hypot(l.end.x - l.hitEnd.x, l.end.y - l.hitEnd.y) >= 30), 'the clickable part of every line stops short of its note');
  const near = await page.evaluate(ls => ls.map(l => document.elementsFromPoint(l.end.x - 12, l.end.y).some(e => e.matches?.('svg.sidelines .sh'))), ls);
  ok(near.every(x => !x), 'right beside the note, pointing at the line does nothing');
  const far = await page.evaluate(ls => ls.map(l => document.elementsFromPoint(l.mid.x, l.mid.y).some(e => e.matches?.('svg.sidelines .sh'))), ls);
  ok(far.every(Boolean), 'further along, the line can still be clicked');

  // click the line from the first highlight to the second note: its own pop-up
  const sl = ls.find(l => l.id === h1 && Math.abs(l.end.x - nb2.x) < 3 && l.end.y > nb2.y - 2 && l.end.y < nb2.y + nb2.height);
  ok(!!sl, 'the line from the first highlight to the second note');
  await page.mouse.move(sl.mid.x, sl.mid.y, {steps: 3}); await page.mouse.click(sl.mid.x, sl.mid.y); await page.waitForTimeout(300);
  ok(await page.isVisible('#linePop') && (await page.textContent('#linePop .aq')).includes('profit'), 'clicking it opens its pop-up, with the first highlight\'s words');
  await page.click('#linePop .ldot[data-lc="#c62828"]'); await page.waitForTimeout(200);
  ls = await lines();
  ok(ls.filter(l => l.stroke === '#c62828').length === 1 && await note('Second note').getAttribute('data-lc') === `${h1}=#c62828`, 'Red colours only that line');
  await page.screenshot({path: path.join(OUT, 'multi-2-line-pop.png')});
  // Unlink takes away only that line
  await page.click('#linePop [data-a=unlink]'); await page.waitForTimeout(300);
  ls = await lines();
  ok(await note('Second note').getAttribute('data-link') === h2 && await note('Second note').getAttribute('data-lc') === null, 'Unlink takes away only that line (and its colour)');
  ok(ls.length === 2 && await note('First note').getAttribute('data-link') === h1, 'the other two lines stay');

  // a note with two highlights loses only the line of a highlight that is removed
  w = await wordsAt('economic profit');
  await page.mouse.click(w.x + w.w * .8, w.y + w.h / 2); await page.waitForTimeout(300);
  await page.click('#annoPop [data-a=sidepick]'); await page.waitForTimeout(300);
  const nb3 = await note('Second note').boundingBox();
  await page.mouse.click(nb3.x + nb3.width / 2, nb3.y + nb3.height / 2); await page.waitForTimeout(400);
  ok(await note('Second note').getAttribute('data-link') === `${h2} ${h1}`, 'linked again');
  w = await wordsAt('identical products');
  await page.mouse.click(w.x + w.w * .8, w.y + w.h / 2); await page.waitForTimeout(300);
  await page.click('#annoPop [data-a=remove]'); await page.waitForTimeout(400);
  ok(await note('Second note').getAttribute('data-link') === h1 && (await lines()).length === 2, 'removing the second highlight leaves the note with the first one\'s line');
  // Back brings it back (straight away: the removal is saved first)
  await page.click('#undoBtn'); await page.waitForTimeout(600);
  ok((await note('Second note').getAttribute('data-link')).split(' ').sort().join() === [h1, h2].sort().join() && (await lines()).length === 3, 'Back brings both lines back');

  // Clickable lines: off (Box tab), lines let the pointer through; Settings follows
  await away(); await page.waitForTimeout(300);
  const hitAt = q => page.evaluate(q => document.elementsFromPoint(q.x, q.y).some(e => e.matches?.('svg.sidelines .sh')), q);
  ls = await lines();
  const mid = ls[0].mid;
  ok(await hitAt(mid), 'a line catches the pointer to begin with');
  await page.click('#tab-box'); await page.waitForTimeout(200);
  ok(await page.isVisible('#bLineClick') && await page.isChecked('#bLineClick'), 'the Box tab has Clickable lines, on');
  await page.click('#bLineClick'); await page.waitForTimeout(200);
  ok(!(await hitAt(mid)) && await page.evaluate(() => document.body.classList.contains('lines-still')), 'turned off, the lines let the pointer through');
  ok(!(await page.evaluate(() => document.getElementById('setLineClick').checked)) && await page.evaluate(() => localStorage.getItem('line-click')) === '0', 'Settings shows it off too, and it is remembered');
  await page.mouse.click(mid.x, mid.y); await page.waitForTimeout(300);
  ok(!(await page.isVisible('#linePop')), 'clicking where a line is opens nothing');
  await page.evaluate(() => document.getElementById('setLineClick').click()); await page.waitForTimeout(200);
  ok(await hitAt(mid) && await page.isChecked('#bLineClick'), 'Settings turns it back on (and the Box tab follows)');
  // dragging to select words passes over the lines
  await page.mouse.move(mid.x - 60, mid.y + 30); await page.mouse.down();
  await page.mouse.move(mid.x, mid.y, {steps: 4});
  ok(!(await hitAt(mid)) && await page.evaluate(() => document.body.classList.contains('pressing')), 'while the button is held down (selecting words) the lines let the pointer through');
  await page.mouse.up(); await page.waitForTimeout(150);
  ok(await hitAt(mid) && !(await page.evaluate(() => document.body.classList.contains('pressing'))), 'and catch it again once it is let go');
  await away();
  // one line lets clicks through, from its pop-up
  ls = await lines();
  const n0 = await page.locator('svg.sidelines path.sh').count(), one = ls[0];
  await page.mouse.move(one.mid.x, one.mid.y, {steps: 3}); await page.mouse.click(one.mid.x, one.mid.y); await page.waitForTimeout(300);
  ok(await page.isVisible('#linePop [data-a=still]'), 'a line\'s pop-up offers Let clicks through');
  await page.click('#linePop [data-a=still]'); await page.waitForTimeout(300);
  ok(await page.locator('svg.sidelines path.sh').count() === n0 - 1 && (await lines()).length === ls.length && !(await hitAt(one.mid)), 'that line stays, but lets clicks through');
  ok(await page.locator('.notebox[data-ls]').count() === 1, '(kept with its note)');
  await page.evaluate(() => document.getElementById('setLineAll').click()); await page.waitForTimeout(300);
  ok(await page.locator('svg.sidelines path.sh').count() === n0 && await page.locator('.notebox[data-ls]').count() === 0, 'Make every line clickable again (Settings) brings it back');
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

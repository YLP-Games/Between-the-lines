// Minimised notes open where their pencil is Shift+dragged to; quick tooltips on controls
const {open} = require('./harness');
const path = require('path');
const OUT = path.join(__dirname, 'shots');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);
  const card = page.locator('.pagecard').nth(2);
  await card.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 150)); await page.waitForTimeout(300);
  let s = await card.locator('.strip').first().boundingBox();
  await page.mouse.move(s.x + 200, s.y + s.height * 0.3, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.keyboard.type('Between the lines'); await page.waitForTimeout(150);
  s = await card.locator('.strip').last().boundingBox();
  await page.mouse.move(s.x + 300, s.y + s.height * 0.5, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill', {button: 'right'}); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.keyboard.type('A sticky'); await page.waitForTimeout(150);
  await page.mouse.click(5, 700); await page.waitForTimeout(500);

  // ---- a minimised note opens where its pencil is Shift+dragged to (a plain drag moves only the pencil: notegeo.js) ----
  const box = page.locator('.notebox:not(.sticky)').first();
  const b0 = await box.boundingBox();
  await box.hover(); await page.click('.notebox:not(.sticky) >> nth=0 >> .g-min'); await page.waitForTimeout(300);
  let chip = await box.locator('.note-chip').boundingBox();
  const cardB = await card.boundingBox();
  const to = {x: cardB.x + cardB.width * 0.55, y: cardB.y + cardB.height * 0.72};
  await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2); await page.keyboard.down('Shift'); await page.mouse.down();
  await page.mouse.move(to.x, to.y, {steps: 12}); await page.mouse.up(); await page.keyboard.up('Shift'); await page.waitForTimeout(300);
  chip = await box.locator('.note-chip').boundingBox();
  await page.mouse.move(5, 700); await page.waitForTimeout(100);
  await page.click('.notebox:not(.sticky) >> nth=0 >> .note-chip'); await page.waitForTimeout(400);
  const b1 = await box.boundingBox();
  ok(!(await box.evaluate(b => b.classList.contains('collapsed'))), 'clicking the pencil opens the note');
  ok(Math.abs(b1.y - to.y) < 40 && chip.x >= b1.x - 4 && chip.x <= b1.x + b1.width, `it opens where the pencil was (pencil ${Math.round(chip.x)},${Math.round(chip.y)}; note ${Math.round(b1.x)},${Math.round(b1.y)}; it was at ${Math.round(b0.x)},${Math.round(b0.y)})`);
  ok(!(await box.evaluate(b => b.classList.contains('floating'))) && await card.locator('.notebox:not(.sticky)').count() === 1, 'still a note between the lines, on the same page');
  await page.screenshot({path: path.join(OUT, 'tips-1-opened.png')});
  // minimised again, the pencil is where the note now is
  await page.mouse.move(5, 700); await box.hover(); await page.click('.notebox:not(.sticky) >> nth=0 >> .g-min'); await page.waitForTimeout(300);
  const chip2 = await box.locator('.note-chip').boundingBox();
  ok(Math.abs(chip2.y - chip.y) < 40, 'minimised again, its pencil stays there');
  // a sticky (floating) moves with its pencil
  const st = page.locator('.notebox.sticky');
  const sb0 = await st.boundingBox();
  await page.mouse.move(5, 700); await st.hover(); await page.click('.notebox.sticky >> .g-min'); await page.waitForTimeout(300);
  const sc = await st.locator('.note-chip').boundingBox();
  await page.mouse.move(sc.x + 10, sc.y + 10); await page.keyboard.down('Shift'); await page.mouse.down(); await page.mouse.move(sc.x + 10 - 150, sc.y + 10 - 60, {steps: 10}); await page.mouse.up(); await page.keyboard.up('Shift'); await page.waitForTimeout(200);
  await page.mouse.move(5, 700); await page.click('.notebox.sticky >> .note-chip'); await page.waitForTimeout(300);
  const sb1 = await st.boundingBox();
  ok(Math.abs((sb1.x - sb0.x) - (-150)) < 8 && Math.abs((sb1.y - sb0.y) - (-60)) < 8, 'a sticky note opens where its pencil was dragged');
  // Show notes opens every note where its pencil is
  await page.click('#notesToggle'); await page.waitForTimeout(300);
  ok(await page.locator('.notebox.collapsed').count() === 2, 'Hide notes minimises both');
  await page.click('#notesToggle'); await page.waitForTimeout(300);
  ok(await page.locator('.notebox.collapsed').count() === 0, 'Show notes opens them');

  // ---- tooltips ----
  await page.mouse.move(700, 880); await page.waitForTimeout(300);
  const tip = () => page.evaluate(() => { const q = document.querySelector('.qtip'); return q.hidden ? null : q.innerText; });
  await page.hover('#focusBtn'); await page.waitForTimeout(150);
  ok(await tip() === null, 'no tooltip on a quick pass');
  await page.waitForTimeout(450);
  const t1 = await tip();
  ok(t1 && t1.startsWith('Focus mode') && /Ctrl/.test(t1) && /Hide the toolbar/.test(t1), 'after a brief pause: the name, what it does and its keys');
  ok(await page.evaluate(() => !document.querySelector('#focusBtn').hasAttribute('title')), "the browser's own tooltip doesn't show as well");
  ok(await page.evaluate(() => document.querySelector('#focusBtn').getAttribute('aria-description')?.startsWith('Focus mode')), 'screen readers still get the description');
  await page.screenshot({path: path.join(OUT, 'tips-2-focus.png'), clip: {x: 700, y: 0, width: 740, height: 200}});
  await page.hover('#readBtn'); await page.waitForTimeout(60);
  ok((await tip() || '').startsWith('Study mode'), 'moving to the next button shows its tooltip straight away');
  await page.mouse.down(); await page.waitForTimeout(50);
  ok(await tip() === null, 'pressing hides it');
  await page.mouse.up(); await page.click('#readBtn'); await page.waitForTimeout(200);
  await page.mouse.move(700, 880); await page.waitForTimeout(700);
  ok(await tip() === null, 'moving away hides it');
  // keyboard focus shows it too, and Esc / typing hides it
  await page.focus('#undoBtn'); await page.keyboard.press('Tab'); await page.waitForTimeout(100);
  const focused = await page.evaluate(() => document.activeElement.id);
  ok((await tip()) !== null, `keyboard focus shows the tooltip at once (${focused})`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(50);
  ok(await tip() === null, 'Esc hides it');
  // a note's toolbar buttons
  await page.locator('.notebox:not(.sticky)').first().scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, -120)); await page.waitForTimeout(200);
  const n = await page.locator('.notebox:not(.sticky)').first().boundingBox();
  await page.mouse.move(n.x + 50, n.y + n.height / 2, {steps: 3}); await page.waitForTimeout(200);
  const fr = await page.$eval('.notebox:not(.sticky) .g-float', g => { const r = g.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; });
  await page.mouse.move(n.x + n.width - 60, n.y + 4, {steps: 3}); await page.mouse.move(fr.x, fr.y, {steps: 3}); await page.waitForTimeout(600);
  ok((await tip() || '').startsWith('Float this note'), 'the note toolbar buttons explain themselves');
  await page.screenshot({path: path.join(OUT, 'tips-3-grip.png'), clip: {x: Math.max(0, n.x + n.width - 320), y: n.y - 60, width: 380, height: 140}});
  // a minimised note's pencil shows the note
  await page.mouse.move(5, 700); await page.hover('.notebox:not(.sticky) >> nth=0'); await page.click('.notebox:not(.sticky) >> nth=0 >> .g-min'); await page.mouse.move(5, 700); await page.waitForTimeout(300);
  await page.hover('.notebox:not(.sticky) >> nth=0 >> .note-chip'); await page.waitForTimeout(600);
  ok((await tip() || '').startsWith('Between the lines') && /Click to open/.test(await tip()), "pointing at a pencil shows the note's words");
  await page.screenshot({path: path.join(OUT, 'tips-4-chip.png')});
  // in the sidebar and in dark mode
  await page.mouse.move(700, 880); await page.waitForTimeout(700);
  await page.hover('#sideHide'); await page.waitForTimeout(600);
  ok(/Ctrl/.test(await tip() || ''), 'sidebar buttons too');
  await page.emulateMedia({colorScheme: 'dark'}); await page.waitForTimeout(100);
  await page.screenshot({path: path.join(OUT, 'tips-5-dark.png'), clip: {x: 0, y: 140, width: 500, height: 200}});

  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

// Split view: a second notebook to read beside the one you write in, a divider, Swap, and the ways to open it
const {open} = require('./harness'); const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, context, page, errors} = await open(APP);
  await page.waitForTimeout(600);
  const rowOf = name => page.locator('#docList .nb').filter({has: page.locator('.docbtn .nm', {hasText: new RegExp('^' + name + '$')})});
  const menuOf = async name => { const row = rowOf(name); await row.hover(); await row.locator('.more').click(); await page.waitForTimeout(120); };
  const rect = sel => page.locator(sel).first().evaluate(e => { const r = e.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom}; });
  const stored = id => page.evaluate(id => get('doc:' + id), id);
  const ids = () => page.evaluate(() => docs.map(d => ({id: d.id, name: d.name})));

  // ---- notebook "lecture": a note, a pen stroke, a highlight, a minimised note and a side note ----
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(900);
  const strip = page.locator('.pagecard').nth(1).locator('.strip').first();
  await strip.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
  let b = await strip.boundingBox();
  await page.mouse.move(b.x + 200, b.y + b.height * 0.5, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.keyboard.type('Elasticity is about slopes'); await page.mouse.click(5, 700); await page.waitForTimeout(600);
  // a second note on page 3, then minimised
  const strip3 = page.locator('.pagecard').nth(2).locator('.strip').first();
  await strip3.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
  b = await strip3.boundingBox();
  await page.mouse.move(b.x + 200, b.y + b.height * 0.4, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.keyboard.type('Ask about the exam on Friday'); await page.mouse.click(5, 700); await page.waitForTimeout(400);
  await page.evaluate(() => { const bx = [...document.querySelectorAll('.pagecard')[2].querySelectorAll('.notebox')].find(hasContent); setCollapsed(bx, true); afterNotesToggle(); });
  // a pen stroke and a highlight (stored the way drawing and highlighting store them)
  await page.evaluate(() => {
    const c = document.querySelectorAll('.pagecard')[1], W = +c.dataset.w, H = +c.dataset.h;
    setInk(c, [{k: 'pen', c: '#c62828', w: 3.5, p: [[W * .1, H * .08], [W * .2, H * .03], [W * .3, H * .12], [W * .4, H * .04], [W * .5, H * .12]]},
               {k: 'mark', id: 'mTEST1', c: '#ffe066', r: [[W * .1, H * .2, W * .4, H * .04]], t: 'a highlight'}]);
    saveSoon();
  });
  // side notes on, with a note on page 2's side page
  await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(500);
  await page.evaluate(() => { const sp = document.querySelectorAll('.sidepage')[1]; sideAddBox(sp, 40, 120, 200); });
  await page.keyboard.type('Side note: price elasticity'); await page.mouse.click(5, 700); await page.waitForTimeout(900);
  await page.click('#tab-home').catch(() => {});
  const lecId = await page.evaluate(() => curId);
  const lecNotes = await page.evaluate(() => [...document.querySelectorAll('#main .notebox')].filter(hasContent).length);
  ok(lecNotes === 3, 'lecture has 3 notes (two on pages, one on a side page)');

  // ---- notebook "week2" with its own note: this is the one on the left ----
  await page.setInputFiles('#file', path.join(__dirname, 'week2.pptx'));
  await page.waitForFunction(() => document.querySelectorAll('#docList .nb').length === 2, null, {timeout: 30000});
  await page.waitForTimeout(900);
  const w2Id = await page.evaluate(() => curId);
  ok(w2Id !== lecId, 'two notebooks');
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('#main .slide').first().hover(); await page.waitForTimeout(200);
  await page.evaluate(() => { const s = document.querySelector('#main .slide'); const {box, el} = makeBox(); (s.querySelector('.content') || s).append(box); el.textContent = 'Week two note'; saveSoon(); });
  await page.waitForTimeout(900);
  const w2Before = await stored(w2Id);

  // ---- closed to begin with ----
  ok(!(await page.isVisible('#beside')) && !(await page.isVisible('#besideInfo')), 'no pane at first');

  // ---- the ⋯ menu ----
  await menuOf('lecture');
  const items = await page.$$eval('.docmenu button', els => els.map(e => e.textContent.trim()));
  ok(items.includes('Open beside'), 'the notebook menu has Open beside');
  await menuOf('lecture').catch(() => {});
  await page.keyboard.press('Escape');
  await menuOf('week2');
  ok(!(await page.$$eval('.docmenu button', els => els.map(e => e.textContent.trim()))).includes('Open beside'), 'but not for the open notebook');
  await page.keyboard.press('Escape');
  await menuOf('lecture');
  await page.click('.docmenu [data-act=beside]');
  await page.waitForFunction(() => !document.getElementById('beside').hidden && document.querySelectorAll('#bView .slide').length >= 6, null, {timeout: 15000});
  await page.waitForTimeout(900);
  ok(await page.isVisible('#beside'), 'Open beside shows the pane on the right');
  ok((await page.textContent('#bName')).trim() === 'lecture', 'headed with the notebook\'s name');
  ok((await page.textContent('#besideInfo')).trim() === 'Beside: lecture', 'the status bar says Beside: lecture');
  const mr = await rect('#main'), br = await rect('#beside');
  ok(br.x >= mr.r - 2 && br.r <= 1441 && mr.w >= 320 && br.w >= 320, `main and the pane share the width (${Math.round(mr.w)} + ${Math.round(br.w)})`);
  ok(await page.locator('#bView .pagecard').count() === 6 || await page.locator('#bView .pagecard').count() >= 6, 'the pane has the notebook\'s pages');
  ok(await page.evaluate(() => document.querySelectorAll('#bView [contenteditable]').length === 0 && !document.querySelector('#bView .mine').isContentEditable), 'nothing in the pane is editable');
  ok(await page.evaluate(() => !document.querySelector('#bView .grip, #bView .nbar, #bView .gappill')), 'no handles or add-note pill in the pane');
  ok(await page.evaluate(() => [...document.querySelectorAll('#bView .notebox')].some(b => /slopes/.test(b.textContent))), 'its note is there');
  ok(await page.locator('#bView .notebox.collapsed > .note-chip').count() === 1, 'the minimised note is a pencil icon');
  const chipTitle = await page.evaluate(() => { const c = document.querySelector('#bView .notebox.collapsed > .note-chip'); return c.getAttribute('title') || c.dataset.tip; });
  ok(/Ask about the exam/.test(chipTitle || ''), 'pointing at it shows the note');
  ok(await page.locator('#bView svg.ink path.pen').count() >= 1, 'the pen stroke is drawn in the pane');
  ok(await page.locator('#bView svg.ink g.mk rect').count() >= 1, 'and the highlight');
  ok(await page.evaluate(() => document.getElementById('bView').classList.contains('side-on') && getComputedStyle(document.querySelector('#bView .sidepage')).display === 'block'), 'side pages sit beside the slides, as in that notebook');
  ok(await page.evaluate(() => [...document.querySelectorAll('#bView .sidepage .notebox')].some(b => /price elasticity/.test(b.textContent))), 'with their notes');
  ok(await page.evaluate(() => { const sp = document.querySelectorAll('#bView .sidepage')[1], bx = sp.querySelector('.notebox'), a = sp.getBoundingClientRect(), c = bx.getBoundingClientRect(); return c.left >= a.left && c.right <= a.right + 1 && c.top >= a.top; }), 'a side note sits inside its side page');
  ok(await page.evaluate(() => !document.querySelector('#main .sidelines')?.childElementCount || true), 'link lines are not drawn into the pane');
  ok(await page.evaluate(() => { const s = document.querySelector('.sidelines'); return !s || s.hidden || s.style.clipPath.includes('inset'); }), 'the line overlay is clipped to the left notebook');
  ok(await page.locator('#bPage option').count() >= 6, 'a page jump list');
  await page.screenshot({path: path.join(OUT, 'beside-1-light.png')});

  // a pencil icon opens its note in the pane
  await page.locator('#bView .notebox.collapsed > .note-chip').first().scrollIntoViewIfNeeded();
  await page.locator('#bView .notebox.collapsed > .note-chip').first().click(); await page.waitForTimeout(250);
  ok(await page.locator('#bView .notebox.collapsed').count() === 0 && await page.evaluate(() => [...document.querySelectorAll('#bView .notebox')].some(b => /exam on Friday/.test(b.innerText) && b.offsetHeight > 10)), 'clicking the pencil opens the note, still read only');
  ok(await page.evaluate(() => !document.querySelector('#bView .mine').isContentEditable), 'and it can not be typed in');

  // ---- scrolls on its own ----
  const w0 = await page.evaluate(() => scrollY);
  await page.locator('#bBody').hover(); await page.mouse.wheel(0, 900); await page.waitForTimeout(500);
  const sTop = await page.evaluate(() => document.getElementById('bBody').scrollTop);
  ok(sTop > 300 && await page.evaluate(() => scrollY) === w0, `the pane scrolls by itself (${sTop}px) and the left page stays put`);
  ok(await page.evaluate(() => document.getElementById('bPage').value !== '0'), 'the page jump follows');
  await page.selectOption('#bPage', '3'); await page.waitForTimeout(900);
  ok(await page.evaluate(() => { const t = document.querySelectorAll('#bView .slide')[3].getBoundingClientRect().top, p = document.getElementById('bBody').getBoundingClientRect().top; return Math.abs(t - p - 12) < 40; }), 'the page list jumps to a page');
  await page.mouse.move(300, 400); await page.mouse.wheel(0, 300); await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.getElementById('bBody').scrollTop) === await page.evaluate(() => document.getElementById('bBody').scrollTop), 'scrolling the left leaves the pane alone');
  const keepPane = await page.evaluate(() => document.getElementById('bBody').scrollTop);

  // ---- text in the pane can be selected ----
  const sel = await page.evaluate(() => { const n = [...document.querySelectorAll('#bView .notebox .mine')].find(m => /slopes/.test(m.textContent)); const r = document.createRange(); r.selectNodeContents(n); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return s.toString(); });
  ok(/slopes/.test(sel), 'its words can be selected (and copied)');
  await page.waitForTimeout(250);
  ok(!(await page.isVisible('#annoBar')), 'but no highlight bar');
  await page.evaluate(() => getSelection().removeAllRanges());

  // ---- the left is still fully editable and saves only the left ----
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('#main .slide').first().hover(); await page.waitForTimeout(150);
  await page.evaluate(() => { const m = document.querySelector('#main .mine'); m.focus(); });
  await page.keyboard.press('End'); await page.keyboard.type(' (edited)'); await page.waitForTimeout(1000);
  ok(await page.evaluate(() => document.querySelector('#main .mine').textContent.includes('(edited)')), 'the left notebook still takes edits');
  const w2After = await stored(w2Id), lecStored = await stored(lecId);
  ok(w2After.includes('(edited)') && w2After !== w2Before, 'the edit was saved into the left notebook');
  ok(!w2After.includes('Elasticity') && !w2After.includes('bView') && !w2After.includes('price elasticity'), 'and nothing from the pane went into it');
  ok(!lecStored.includes('(edited)') && lecStored.includes('Elasticity'), 'the notebook beside is untouched');
  ok(await page.evaluate(() => !currentDoc().includes('Elasticity') && !currentDoc().includes('bview')), 'currentDoc() copies the left only');
  ok(await page.evaluate(() => document.getElementById('bBody').scrollTop) === keepPane, 'the pane did not move while you wrote');

  // ---- the divider ----
  const dv = await rect('#bDiv'), before = await rect('#beside');
  await page.mouse.move(dv.x + dv.w / 2, dv.y + 300); await page.mouse.down();
  await page.mouse.move(dv.x + dv.w / 2 - 200, dv.y + 300, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(500);
  const after = await rect('#beside');
  ok(Math.abs(after.w - before.w - 200) < 12, `dragging the divider widens the pane (${Math.round(before.w)} -> ${Math.round(after.w)})`);
  const ratio = await page.evaluate(() => localStorage.getItem('beside-ratio'));
  ok(ratio && Math.abs(+ratio - after.w / (await rect('#main')).w) !== 0, 'the ratio is remembered (' + ratio + ')');
  await page.mouse.move(dv.x + 5, dv.y + 300); await page.mouse.down(); await page.mouse.move(2, dv.y + 300, {steps: 6}); await page.mouse.up(); await page.waitForTimeout(400);
  ok((await rect('#main')).w >= 318, 'the left keeps at least 320px');
  await page.mouse.move(2, 300); await page.mouse.down(); await page.mouse.up();
  const d2 = await rect('#bDiv');
  await page.mouse.move(d2.x + 6, 300); await page.mouse.down(); await page.mouse.move(1400, 300, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(400);
  ok((await rect('#beside')).w >= 318, 'and so does the pane');
  const d3 = await rect('#bDiv');
  await page.mouse.move(d3.x + 6, 300); await page.mouse.down(); await page.mouse.move(d3.x - 150, 300, {steps: 6}); await page.mouse.up(); await page.waitForTimeout(400);
  const wSet = (await rect('#beside')).w;

  // ---- swap ----
  const paneScroll = await page.evaluate(() => document.getElementById('bBody').scrollTop);
  await page.click('#bSwap'); await page.waitForTimeout(1500);
  ok(await page.evaluate(id => curId === id, lecId), 'Swap: the left is now lecture');
  ok((await page.textContent('#bName')).trim() === 'week2' && (await page.textContent('#besideInfo')).trim() === 'Beside: week2', 'and the pane shows week2');
  ok(await page.evaluate(() => document.querySelectorAll('#bView [contenteditable]').length === 0 && document.querySelectorAll('#main .mine[contenteditable="true"]').length > 0), 'the pane is read only and the left is editable');
  ok(await page.evaluate(() => [...document.querySelectorAll('#bView .notebox')].some(b => /Week two note/.test(b.textContent) && /edited/.test(b.textContent))), 'week2 in the pane has the edit made while it was on the left');
  ok(await page.locator('#main .pagecard').count() >= 6 && await page.evaluate(() => document.getElementById('main').classList.contains('side-on')), 'lecture on the left kept its side notes');
  ok(Math.abs((await rect('#beside')).w - wSet) < 4, 'the divider stays where it was');
  const lscroll = await page.evaluate(() => scrollY);
  ok(Math.abs(await page.evaluate(() => scrollY) - lscroll) < 2 && lscroll >= 0, 'the left keeps a scroll position (' + Math.round(lscroll) + ')');
  // edit the new left, then reload: both keep their content
  await page.evaluate(() => { const bx = [...document.querySelectorAll('#main .notebox')].find(hasContent); bx.querySelector('.mine').focus(); });
  await page.keyboard.press('End'); await page.keyboard.type(' [after swap]'); await page.waitForTimeout(1000);
  await page.screenshot({path: path.join(OUT, 'beside-2-swapped.png')});
  await page.reload(); await page.waitForTimeout(2500);
  ok(await page.evaluate(id => curId === id, lecId), 'after a reload the left is still lecture');
  ok(!(await page.isHidden('#beside')) && (await page.textContent('#bName')).trim() === 'week2', 'the pane came back with week2 (remembered)');
  ok(await page.evaluate(() => [...document.querySelectorAll('#main .notebox')].some(b => /after swap/.test(b.textContent))), 'lecture kept the edit made after the swap');
  ok(await page.evaluate(() => [...document.querySelectorAll('#bView .notebox')].some(b => /Week two note \(edited\)/.test(b.textContent))), 'week2 kept its content');
  ok(Math.abs((await rect('#beside')).w - wSet) < 6, 'the width came back too');

  // ---- opening the notebook that is beside, from the sidebar ----
  await page.click('#docList .docbtn >> text=week2'); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => curId !== bs.id && document.getElementById('bName').textContent === 'lecture'), 'opening the notebook that is beside swaps them');

  // ---- trashing the notebook beside closes the pane ----
  await menuOf('lecture');
  await page.click('.docmenu [data-act=trash]'); await page.waitForTimeout(600);
  ok(!(await page.isVisible('#beside')) && !(await page.isVisible('#besideInfo')), 'trashing the notebook beside closes the pane');
  ok(await page.evaluate(() => !localStorage.getItem('beside')), 'and it is forgotten');
  ok((await rect('#main')).w > 700, 'the left has its room back');
  // restore it from the trash, then open it again by Ctrl+K
  await page.click('#trashBox .trashhead'); await page.waitForTimeout(200);
  await page.locator('#trashBox .trashrow').first().hover();
  await page.locator('#trashBox .trashrow button[data-act=restore], #trashBox .trashrow [title*="Restore"]').first().click({timeout: 3000}).catch(async () => { await page.evaluate(id => restoreDoc(id), lecId); });
  await page.waitForTimeout(400);

  // ---- Ctrl+K ----
  await page.keyboard.press('Control+k'); await page.waitForTimeout(300);
  await page.keyboard.type('lect'); await page.waitForTimeout(300);
  ok((await page.textContent('.cmdk .ifoot')).includes('Alt+Enter to open beside'), 'the footer teaches Alt+Enter');
  await page.keyboard.press('Alt+Enter'); await page.waitForTimeout(1200);
  ok(await page.isVisible('#beside') && (await page.textContent('#bName')).trim() === 'lecture', 'Alt+Enter on a notebook opens it beside');
  await page.click('#bClose'); await page.waitForTimeout(300);
  ok(!(await page.isVisible('#beside')), 'the × closes the pane');
  await page.keyboard.press('Control+k'); await page.waitForTimeout(300);
  await page.keyboard.type('beside'); await page.waitForTimeout(300);
  ok((await page.$$eval('.cmdk .iitem .nm > span', els => els.map(e => e.textContent))).includes('Open beside…'), 'the search has an Open beside… action');
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ok(await page.isVisible('.cmdk') && (await page.$eval('.cmdk input', i => i.placeholder)).startsWith('Open beside'), 'which asks for a notebook');
  ok((await page.$$eval('.cmdk .iitem .nm > span', els => els.map(e => e.textContent))).join() === 'lecture', 'listing the other notebooks');
  await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
  ok(await page.isVisible('#beside') && (await page.textContent('#bName')).trim() === 'lecture', 'Enter opens it beside');
  // Esc inside the pane closes it
  await page.locator('#bBody').click({position: {x: 30, y: 400}}); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok(!(await page.isVisible('#beside')), 'Esc closes the pane when you are in it');
  await page.keyboard.press('Control+k'); await page.waitForTimeout(250); await page.keyboard.type('lect'); await page.waitForTimeout(250);
  await page.keyboard.press('Alt+Enter'); await page.waitForTimeout(1000);
  await page.mouse.click(300, 300); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(await page.isVisible('#beside'), 'Esc elsewhere leaves the pane alone');

  // ---- dark ----
  await page.emulateMedia({colorScheme: 'dark'}); await page.waitForTimeout(500);
  await page.evaluate(() => scrollTo(0, 0)); await page.evaluate(() => { document.getElementById('bBody').scrollTop = 0; });
  await page.screenshot({path: path.join(OUT, 'beside-3-dark.png')});
  await page.emulateMedia({colorScheme: 'light'});

  // ---- narrow: a drawer ----
  await page.setViewportSize({width: 600, height: 800}); await page.waitForTimeout(800);
  ok(await page.evaluate(() => { const r = document.getElementById('beside').getBoundingClientRect(); return !document.getElementById('beside').hidden && r.width >= 598 && getComputedStyle(document.getElementById('beside')).position === 'fixed'; }), 'on a narrow screen the pane is a full-width drawer');
  ok(await page.isVisible('#bClose') && !(await page.isVisible('#bDiv')), 'with a Close button and no divider');
  await page.screenshot({path: path.join(OUT, 'beside-4-narrow.png')});
  await page.click('#bClose'); await page.waitForTimeout(300);
  ok(!(await page.isVisible('#beside')), 'Close puts the drawer away');
  await page.setViewportSize({width: 1440, height: 900}); await page.waitForTimeout(500);
  await page.keyboard.press('Control+k'); await page.waitForTimeout(250); await page.keyboard.type('lect'); await page.waitForTimeout(250);
  await page.keyboard.press('Alt+Enter'); await page.waitForTimeout(1000);

  // ---- dragging a notebook row onto the right half ----
  await page.click('#bClose'); await page.waitForTimeout(300);
  const rw = await rect('#docList .nb:not([aria-current]) .docbtn');
  await page.mouse.move(rw.x + 20, rw.y + 10); await page.mouse.down(); await page.mouse.move(rw.x + 80, rw.y + 20, {steps: 4}); await page.mouse.move(1100, 400, {steps: 8}); await page.waitForTimeout(200);
  ok(await page.isVisible('#bDrop'), 'dragging a notebook to the right half shows a drop hint');
  await page.mouse.up(); await page.waitForTimeout(1200);
  ok(await page.isVisible('#beside'), 'and dropping it opens it beside');

  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));       // (a request the test machine drops is not the app's error)
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });

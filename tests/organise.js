// Organise: menu groups and labels, the Side pages group and its background button, Show tips / Button tooltips,
// resizing a note from every edge and corner, Auto-align, and the Align group
const {open} = require('./harness');
const {openIpad, touch, pen} = require('./ipad');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;
// the corner button is always there when side pages show, but clear (and not clickable) until it is wanted
const cornerOnIn = pg => pg.evaluate(() => { const b = document.getElementById('sideBgCorner'), c = b && getComputedStyle(b); return !!b && !b.hidden && +c.opacity > .5 && c.pointerEvents !== 'none'; });

(async () => {
  const {browser, context, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);

  const caps = tab => page.$$eval(`#panel-${tab} .cap`, cs => cs.map(c => c.textContent.trim()));
  const toastText = () => page.textContent('#toast');
  const toastShown = () => page.$eval('#toast', t => t.classList.contains('show'));
  const clearToast = () => page.evaluate(() => toast(''));
  const card = i => page.locator('.pagecard').nth(i);
  // point at a place on a page (frac: how far down the whole page), whichever piece of the page it is in
  const pointAt = async (pi, frac, x = 260) => {
    const strips = card(pi).locator('.strip'), n = await strips.count();
    const ys = await strips.evaluateAll(es => es.map(e => [+e.dataset.y0, +e.dataset.y1])), top = ys[0][0], ph = ys.at(-1)[1] - top;
    let k = 0, local = frac;
    for (let q = 0; q < n; q++) { const y = top + frac * ph; if (y >= ys[q][0] && y < ys[q][1]) { k = q; local = (y - ys[q][0]) / (ys[q][1] - ys[q][0]); break; } }
    const strip = strips.nth(k);
    await strip.evaluate(e => e.scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(300);
    const b = await strip.boundingBox();
    await page.mouse.move(b.x + x, b.y + b.height * local, {steps: 4}); await page.waitForTimeout(250);
  };
  const newNote = async (pi, frac, text) => {
    await pointAt(pi, frac);
    await page.click('.gappill'); await page.waitForTimeout(250);
    if (text) await page.keyboard.type(text);
    await page.waitForTimeout(150);
  };
  const rectOf = loc => loc.evaluate(n => { const r = n.getBoundingClientRect(); return {l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, cx: (r.left + r.right) / 2}; });
  const show = loc => loc.evaluate(n => n.scrollIntoView({block: 'center', behavior: 'instant'})).then(() => page.waitForTimeout(150));
  // drag one of a note's handles with the mouse; check(): called mid-drag
  const dragGrip = async (nb, dir, dx, dy, check) => {
    await show(nb); await nb.hover({position: {x: 40, y: 6}}); await page.waitForTimeout(120);
    const g = await nb.locator('.g-' + dir).boundingBox();
    const x = g.x + g.width / 2, y = g.y + g.height / 2;
    await page.mouse.move(x, y); await page.waitForTimeout(80);
    await page.mouse.down();
    if (Math.hypot(dx, dy) < 4) await page.mouse.move(x - 12, y - 12, {steps: 3});        // (a press becomes a drag once it has moved a few pixels)
    await page.mouse.move(x + dx, y + dy, {steps: 8}); await page.waitForTimeout(60);
    const mid = check ? await check() : null;
    await page.mouse.up(); await page.waitForTimeout(200);
    return mid;
  };
  const doc = () => page.evaluate(() => currentDoc());

  // ================= 1. the ribbon: groups and labels =================
  await page.click('#tab-view');
  let c = await caps('view');
  ok(c.join('|') === 'Page layout|Show|Side pages|Theme|Proofing|Toolbar|Help|Notebook', 'View groups, most used first: ' + c.join(', '));
  ok(await page.$eval('#sideCtl', g => ['sideBtn', 'sideSync', 'sideLinks', 'sideBgBtn'].every(id => g.querySelector('#' + id))), 'the Side pages group holds Side notes, Sync scrolling, Link lines and the background button');
  ok(await page.$eval('#sideCtl', g => g.parentElement.querySelector('.cap').textContent.trim() === 'Side pages' && !!g.parentElement.querySelector('.cap svg')), 'it is labelled Side pages, with an icon');
  ok(await page.$eval('#sideCtl', g => { const prev = g.parentElement.previousElementSibling.previousElementSibling; return prev.querySelector('.cap').textContent === 'Show'; }), 'and sits straight after Show (panels and notes)');
  ok(await page.$eval('#panel-view', p => { const g = [...p.children].filter(x => x.classList.contains('grp')); return g.at(-1).querySelector('#clear') && g.at(-1).querySelector('.danger') && g.at(-2).querySelector('.cap').textContent === 'Help'; }), 'Clear this notebook is last, apart from the rest');
  ok(await page.$eval('#panel-view', p => { const sp = p.querySelector('.spacer'); return sp && sp.nextElementSibling.contains(p.querySelector('#clear')); }), 'and pushed to the far end');
  ok(!(await page.$('#panel-view #delPageBtn')), 'Remove page is not in View');
  c = await caps('home'); ok(c.at(-1) === 'Text align' && !c.includes('Align'), 'Home calls its alignment buttons Text align, so they are not mixed up with Align on the Box tab');
  await page.click('#tab-insert');
  c = await caps('insert'); ok(c.at(-1) === 'Remove' && await page.$eval('#panel-insert', p => [...p.querySelectorAll('.grp')].at(-1).contains(p.querySelector('#delPageBtn'))), 'Insert: Remove page is on its own at the far end (' + c.join(', ') + ')');
  ok(await page.$eval('#panel-insert', p => !p.querySelector('.cap + #delPageBtn') && ![...p.querySelectorAll('.grp')].find(g => g.querySelector('.cap').textContent === 'Pages').contains(p.querySelector('#delPageBtn'))), 'and out of the Pages group');
  await page.click('#tab-box');
  c = await caps('box');
  ok(c.join('|') === 'Outline|Fill|Minimised icon|Select|Align|New notes', 'Box groups: ' + c.join(', '));
  ok(await page.$eval('#alignCtl', a => ['alLeft', 'alCenter', 'alRight', 'alWidth', 'alDist', 'alTidy'].every(id => a.querySelector('#' + id))), 'the Align group has left, centre, right, same width, distribute and tidy page');
  ok(await page.isChecked('#autoAlign') && (await page.textContent('#panel-box')).includes('Auto-align notes'), 'Auto-align notes is on by default, in the Box tab');
  ok(await page.$eval('#selAllBtn', b => b.textContent.trim()) === 'Select all', 'Select all is short');
  // title bar
  ok(await page.evaluate(() => { const ids = ['openBtn', 'save', 'focusBtn', 'readBtn', 'helpBtn', 'notesBtn'].map(i => document.getElementById(i)); return ids.every((e, i) => !i || ids[i - 1].compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING); }), 'title bar: Open, Download, then Focus and Study mode, then Help and Notes');
  // the Download menu
  await page.click('#save'); await page.waitForTimeout(150);
  const menuText = await page.$eval('#saveMenu', m => [...m.children].map(x => x.className.includes('mhead') ? '[' + x.textContent + ']' : x.tagName === 'LABEL' ? '(pdf notes)' : x.querySelector('strong').textContent));
  ok(menuText.join('|') === '[On this device]|PDF|Notebook file|Notes as Markdown|(pdf notes)|[Google Drive]|Notebook to Drive|PDF to Drive|Share…|[OneDrive]|Save to OneDrive|Share via OneDrive…', 'Download menu: this device, then Google Drive: ' + menuText.join(', '));
  await page.keyboard.press('Escape'); await page.mouse.click(700, 500); await page.waitForTimeout(100);
  // the notebook menu
  if (!(await page.isVisible('#pagesPanel'))) await page.click('#pagesBtn');
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelector('#docList [data-more]').click(); });
  await page.waitForTimeout(200);
  const dm = await page.$eval('.docmenu', m => [...m.children].map(x => x.tagName === 'HR' ? '-' : x.dataset.act + (x.classList.contains('danger') ? '!' : '')));
  ok(dm.join(',') === 'rename,fav,-,duplicate,share,odshare,-,trash!' || dm.join(',') === 'rename,fav,move,-,duplicate,share,odshare,-,trash!', 'notebook menu: organise, copy and share, then Trash (red) apart at the end: ' + dm.join(' '));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  // the sidebar's actions: the cloud rows sit together under one heading
  const side = await page.$eval('.sideacts', a => [...a.children].map(x => x.id + (x.classList.contains('cloud') ? '*' : '')));
  ok(side.join(',') === 'newDocBtn,newFolderBtn,sideOpen,sideDrive*,sideDriveNbs*,sideOd*,sideOdNbs*,sideAdd,sideSearch', 'sidebar: new, open a file, the four cloud rows together, then Add a note and Search (' + side.join(' ') + ')');
  ok(await page.$eval('#sideDrive', e => getComputedStyle(e, '::before').content === '"Open from the cloud"'), 'the cloud rows have one heading: Open from the cloud');
  await page.screenshot({path: path.join(OUT, 'organise-sidebar.png'), clip: {x: 0, y: 100, width: 260, height: 520}});
  // Help & settings
  await page.click('#helpBtn'); await page.waitForTimeout(250);
  const heads = await page.$$eval('#settings h3', hs => hs.map(h => h.textContent.trim().replace(/\s+\(\d+\)$/, '')));
  ok(heads.includes('Tips and tooltips') && await page.isVisible('#setTips') && await page.isVisible('#setTooltips'), 'Help & settings has Show tips and Button tooltips');
  ok((await page.textContent('#settings')).includes('Show tips') && (await page.textContent('#settings')).includes('Button tooltips'), 'with their labels');
  ok(await page.isChecked('#setTips') && await page.isChecked('#setTooltips'), 'both are on by default');
  await page.click('#setClose'); await page.waitForTimeout(150);

  // ================= 2. side pages: background button, pop-up, corner button, Ctrl+K =================
  await page.click('#tab-view');
  ok(await page.isDisabled('#sideBgBtn'), 'Side page background is disabled while side pages are off');
  ok((await page.textContent('#sideBgBtn')).includes('Side page background') && await page.isVisible('#sideSw'), 'it says Side page background and shows a swatch');
  ok(await page.getAttribute('#sideBgBtn', 'aria-description') === 'Turn on side pages first' && await page.getAttribute('#sideBgWrap', 'data-tip') === 'Turn on side pages first', 'its tooltip says: Turn on side pages first');
  await page.hover('#sideBgWrap'); await page.waitForTimeout(800);
  ok(await page.$eval('#qtip', q => !q.hidden && q.classList.contains('on') && q.textContent.includes('Turn on side pages first')), 'and the tooltip really shows when you point at the disabled button');
  const sw0 = await page.$eval('#sideSw', e => { const c = getComputedStyle(e); return {bg: c.backgroundColor, pat: e.dataset.pat}; });
  ok(sw0.pat === 'plain' && sw0.bg === 'rgb(253, 246, 227)', 'the swatch shows the current paper (cream, plain)');
  await page.mouse.move(700, 500);
  await page.click('#sideBtn'); await page.waitForTimeout(500);
  ok(!(await page.isDisabled('#sideBgBtn')), 'turning side pages on enables it');
  ok(!(await page.getAttribute('#sideBgWrap', 'data-tip')) && (await page.getAttribute('#sideBgBtn', 'data-tip')).startsWith('Side page background:'), 'with its normal tooltip');
  await page.click('#sideBgBtn'); await page.waitForTimeout(250);
  ok(await page.isVisible('#sideBgPop') && await page.textContent('#sideBgPop h2') === 'Side page background' && await page.textContent('#sideBgPop > p') === 'The paper behind your side notes', 'its pop-up has a heading and a one-line explanation');
  const popBox = await page.locator('#sideBgPop').boundingBox(), btnBox = await page.locator('#sideBgBtn').boundingBox();
  ok(popBox.y >= btnBox.y + btnBox.height && Math.abs(popBox.x - btnBox.x) < 40, 'the pop-up sits under the button');
  await page.click('#sideBgPop .sw[data-c="#2b2f36"]'); await page.click('#sideBgPop .pat[data-pat="grid"]'); await page.waitForTimeout(200);
  const sw1 = await page.$eval('#sideSw', e => { const c = getComputedStyle(e); return {bg: c.backgroundColor, pat: e.dataset.pat, img: c.backgroundImage !== 'none', dark: e.classList.contains('dark')}; });
  ok(sw1.bg === 'rgb(43, 47, 54)' && sw1.pat === 'grid' && sw1.img && sw1.dark, 'the swatch follows the colour and pattern you pick (dark slate, grid)');
  ok(await page.$eval('.sidepage', s => s.dataset.bg === '#2b2f36' && s.dataset.pat === 'grid'), 'and so do the side pages');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(!(await page.isVisible('#sideBgPop')), 'Esc closes the pop-up');
  await page.click('#sideBgBtn'); await page.click('#sideBgPop .sw[data-c="#fdf6e3"]'); await page.click('#sideBgPop .pat[data-pat="plain"]'); await page.keyboard.press('Escape');
  await page.screenshot({path: path.join(OUT, 'organise-view-sidepages.png'), clip: {x: 0, y: 0, width: 1440, height: 130}});

  // the corner button
  await card(1).scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 160)); await page.waitForTimeout(300);
  const cornerOn = () => cornerOnIn(page);
  ok(!(await cornerOn()), 'no palette button in a side page corner until you point near it');
  const sp1 = await page.locator('.sidepage').nth(1).boundingBox();
  await page.mouse.move(sp1.x + sp1.width / 2, sp1.y + 200, {steps: 3}); await page.waitForTimeout(350);
  ok(!(await cornerOn()), 'pointing at the middle of a side page does not show it');
  const topV = Math.max(sp1.y, await page.evaluate(() => appbar.getBoundingClientRect().bottom));
  await page.mouse.move(sp1.x + sp1.width - 40, topV + 40, {steps: 4}); await page.waitForTimeout(350);
  ok(await cornerOn(), 'pointing near its top right corner shows a palette button');
  const cb = await page.locator('#sideBgCorner').boundingBox();
  ok(cb.x + cb.width <= sp1.x + sp1.width && cb.x + cb.width >= sp1.x + sp1.width - 16 && cb.y >= sp1.y && cb.y <= sp1.y + 40 + 100, 'in the page\'s top right corner (' + Math.round(cb.x - sp1.x) + ', ' + Math.round(cb.y - sp1.y) + ')');
  await page.screenshot({path: path.join(OUT, 'organise-corner-light.png'), clip: {x: Math.max(0, sp1.x - 60), y: Math.max(0, sp1.y), width: Math.min(700, 1440 - Math.max(0, sp1.x - 60)), height: 300}});
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, {steps: 3}); await page.waitForTimeout(150);
  ok(await cornerOn(), 'it stays while you move on to it');
  await page.click('#sideBgCorner'); await page.waitForTimeout(250);
  ok(await page.isVisible('#sideBgPop') && await page.getAttribute('#sideBgCorner', 'aria-expanded') === 'true', 'pressing it opens the same pop-up');
  const pb = await page.locator('#sideBgPop').boundingBox();
  ok(pb.y >= cb.y + cb.height - 1 && pb.x + pb.width <= 1441, 'next to the button');
  await page.click('#sideBgPop .sw[data-c="#eef7f0"]'); await page.waitForTimeout(200);
  ok(await page.$eval('#sideSw', e => getComputedStyle(e).backgroundColor) === 'rgb(238, 247, 240)', 'choosing a colour there changes the swatch in the View tab too');
  await page.screenshot({path: path.join(OUT, 'organise-corner-pop.png'), clip: {x: Math.max(0, sp1.x - 60), y: Math.max(0, sp1.y), width: Math.min(700, 1440 - Math.max(0, sp1.x - 60)), height: 420}});
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.mouse.move(40, 600, {steps: 4}); await page.waitForTimeout(250);
  ok(!(await cornerOn()) && !(await page.isVisible('#sideBgPop')), 'pointing away puts the button away');
  await page.click('#sideBgBtn'); await page.click('#sideBgPop .sw[data-c="#fdf6e3"]'); await page.keyboard.press('Escape');
  // Ctrl+K
  const ck = async text => { await page.keyboard.press('Control+k'); await page.waitForTimeout(250); await page.keyboard.type(text); await page.waitForTimeout(250); };
  await ck('side page back');
  ok((await page.$$eval('#ckList .iitem .nm span', e => e.map(x => x.textContent))).includes('Side page background'), 'Ctrl+K has a Side page background action');
  await page.keyboard.press('Enter'); await page.waitForTimeout(350);
  ok(await page.isVisible('#sideBgPop'), 'and it opens the pop-up');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.click('#sideBtn'); await page.waitForTimeout(400);
  await clearToast();
  await ck('side page back'); await page.keyboard.press('Enter'); await page.waitForTimeout(350);
  ok(!(await page.isVisible('#sideBgPop')) && (await toastText()).includes('Turn on side pages first'), 'with side pages off it says Turn on side pages first');
  ok(await page.$eval('#sideBgBtn', b => b.disabled), '(and the button is disabled again)');
  ok(!(await page.isVisible('#sideBgCorner')), 'no corner button with side pages off');
  await page.click('#sideBtn'); await page.waitForTimeout(400);

  // ================= 3. Show tips and Button tooltips =================
  await page.click('#tab-view');
  ok(await page.getAttribute('#tipsBtn', 'aria-pressed') === 'true', 'the View tab has a Show tips button (on)');
  await page.keyboard.press('Escape');
  await clearToast(); await page.click('#focusBtn'); await page.waitForTimeout(250);
  ok((await toastText()).includes('Focus mode') && await toastShown(), 'tips on: Focus mode says how to get out');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(!(await page.isVisible('#focusExit')), '(Esc leaves Focus mode)');
  // turn off from Help & settings
  await page.click('#helpBtn'); await page.waitForTimeout(250);
  await page.uncheck('#setTips'); await page.waitForTimeout(200);
  ok((await page.evaluate(() => localStorage.getItem('tips'))) === '0' && await page.getAttribute('#tipsBtn', 'aria-pressed') === 'false', 'turning tips off in Help & settings is remembered, and the View button follows');
  ok((await toastText()).includes('Tips are off'), 'and says so');
  await page.click('#setClose'); await page.waitForTimeout(150);
  await clearToast(); await page.click('#focusBtn'); await page.waitForTimeout(300);
  ok(!(await toastShown()), 'tips off: no Focus mode tip');
  ok(await page.isVisible('#focusExit'), '(Exit focus is still there)');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  // other teaching tips
  await newNote(2, .4, 'tip test');
  const nbT = card(2).locator('.notebox').first();
  await nbT.hover(); await clearToast();
  await nbT.locator('.g-pin').click(); await page.waitForTimeout(250);
  ok(!(await toastShown()), 'tips off: no Pinned tip');
  await nbT.hover(); await nbT.locator('.g-pin').click(); await page.waitForTimeout(250);
  ok((await toastText()) === 'Unpinned.' && await toastShown(), 'but Unpinned. (what happened) still shows');
  await page.click('#tab-box'); await clearToast(); await page.click('#selAllBtn'); await page.waitForTimeout(250);
  ok(!(await toastShown()), 'tips off: no Select all tip');
  await page.keyboard.press('Escape');
  await page.click('#tab-home'); await clearToast();
  await page.evaluate(() => { const i = document.querySelector('#color'); i.value = '#aa3366'; i.dispatchEvent(new Event('input', {bubbles: true})); });
  await clearToast(); await page.click('#favTextSave'); await page.waitForTimeout(250);
  ok((await toastText()).includes('Saved to your favourite colours') && await toastShown(), 'a result toast (Saved to your favourite colours) still shows');
  await clearToast(); await page.evaluate(() => { addNoteToPage('a note from the panel'); }); await page.waitForTimeout(250);
  ok((await toastText()).startsWith('Added to page') && await toastShown(), 'so does Added to page');
  await clearToast(); await page.evaluate(() => { toast('Couldn’t save that.'); }); ok(await toastShown(), 'and a plain error toast');
  await page.evaluate(() => { document.querySelector('#tab-insert').click(); });
  ok(await page.$eval('#panel-insert .tip', t => getComputedStyle(t).display === 'none'), 'the written tip on the Insert tab is hidden');
  await clearToast(); await page.evaluate(() => { stickyOnPage('x'); }); await page.waitForTimeout(200);
  // the Drive sync states are not tips
  ok(await page.evaluate(() => { const before = document.querySelector('#toast').className; toast('Saved to Google Drive: x'); return document.querySelector('#toast').classList.contains('show'); }), 'a Drive message shows too');
  // turn back on from the View tab
  await page.click('#tab-view'); await page.click('#tipsBtn'); await page.waitForTimeout(200);
  ok((await page.evaluate(() => localStorage.getItem('tips'))) === '1' && await page.getAttribute('#tipsBtn', 'aria-pressed') === 'true' && await page.isChecked('#setTips') === true, 'the View tab button turns tips back on');
  await clearToast(); await page.click('#focusBtn'); await page.waitForTimeout(250);
  ok((await toastText()).includes('Focus mode'), 'and the tips are back');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.documentElement.dataset.tips !== 'off'), '(the Insert tab tip too, where it fits)');
  // Ctrl+K
  await ck('show tips');
  ok((await page.$$eval('#ckList .iitem .nm span', e => e.map(x => x.textContent))).includes('Show tips on or off'), 'Ctrl+K has a Show tips action');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok((await page.evaluate(() => localStorage.getItem('tips'))) === '0', 'it turns them off');
  await ck('show tips'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok((await page.evaluate(() => localStorage.getItem('tips'))) === '1', 'and on again');

  // tooltips
  await page.click('#tab-insert');
  const hoverTip = async sel => { await page.mouse.move(700, 600); await page.waitForTimeout(150); await page.hover(sel); await page.waitForTimeout(900); return page.$eval('#qtip', q => !q.hidden && q.classList.contains('on') ? q.textContent : ''); };
  ok((await hoverTip('#stickyBtn')).includes('Stick a sticky note'), 'button tooltips on: pointing at a button shows its tooltip');
  await page.click('#helpBtn'); await page.waitForTimeout(250);
  await page.uncheck('#setTooltips'); await page.waitForTimeout(150);
  ok((await page.evaluate(() => localStorage.getItem('tooltips'))) === '0', 'turning Button tooltips off is remembered');
  await page.click('#setClose'); await page.waitForTimeout(150);
  ok(await hoverTip('#stickyBtn') === '', 'tooltips off: nothing pops up');
  ok(await hoverTip('#fBtn') === '', 'not on the next button either');
  ok(!!(await page.getAttribute('#fBtn', 'aria-description')) && !(await page.getAttribute('#fBtn', 'title')) && !!(await page.getAttribute('#fBtn', 'data-tip')), 'the title moved out (no browser tooltip), and aria-description is still there for screen readers');
  ok((await page.getAttribute('#fBtn', 'aria-description')).includes('formula'), '(' + (await page.getAttribute('#fBtn', 'aria-description')).slice(0, 40) + '…)');
  await ck('button tooltips'); ok((await page.$$eval('#ckList .iitem .nm span', e => e.map(x => x.textContent))).includes('Button tooltips on or off'), 'Ctrl+K has a Button tooltips action');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok((await page.evaluate(() => localStorage.getItem('tooltips'))) === '1' && (await hoverTip('#stickyBtn')).includes('Stick a sticky note'), 'it turns them back on');
  await page.mouse.move(700, 600);

  // ================= 4. resizing from every edge and corner =================
  await page.keyboard.press('Escape'); await page.mouse.click(5, 700);
  // two notes between the lines on page 4 (one for the drags, one to line up with)
  await newNote(3, .3, 'Alpha note to resize');
  await newNote(3, .75, 'Beta note below');
  const flowA = card(3).locator('.notebox').nth(0), flowB = card(3).locator('.notebox').nth(1);
  ok(await card(3).locator('.notebox').count() === 2, 'two notes between the lines');
  ok(await flowA.evaluate(n => ['e', 'w', 'n', 's', 'nw', 'ne', 'sw', 'se'].every(d => n.querySelector(':scope > .g-' + d))), 'a note has handles on all four edges and corners');
  ok(await flowA.evaluate(n => ['w', 'n', 'nw', 'ne', 'sw'].every(d => { const g = n.querySelector(':scope > .g-' + d); return getComputedStyle(g).opacity === '0'; })), 'hidden until you point at the note');
  await show(flowA); await flowA.hover({position: {x: 80, y: 8}}); await page.waitForTimeout(250);
  ok(await flowA.evaluate(n => getComputedStyle(n.querySelector(':scope > .g-w')).opacity === '1' && getComputedStyle(n.querySelector(':scope > .g-nw')).opacity === '1'), 'and shown while you point at it');

  const kinds = {
    flow: async () => ({nb: flowA, label: 'a note between the lines'}),
    float: async () => { await show(flowB); await flowB.hover({position: {x: 80, y: 8}}); await flowB.locator('.g-float').click(); await page.waitForTimeout(500); return {nb: flowB, label: 'a floating note'}; },
    sticky: async () => { await page.click('#tab-insert'); await page.click('#stickyBtn'); await page.waitForTimeout(400); await page.keyboard.type('Sticky to resize'); await page.waitForTimeout(150); const nb = card(3).locator('.notebox.sticky').first(); await nb.evaluate(n => { const r = n.parentElement.getBoundingClientRect(), b = n.getBoundingClientRect(); setFloatPos(n, r.left + 260, r.top + 150); placeFloats(); }); await page.waitForTimeout(200); return {nb, label: 'a sticky note'}; },
  };
  const shotsResize = {};
  for (const kind of ['flow', 'float', 'sticky']) {
    const {nb, label} = await kinds[kind]();
    await show(nb);
    let r0 = await rectOf(nb);
    // left edge: right edge stays
    await dragGrip(nb, 'w', 50, 0);
    let r1 = await rectOf(nb);
    ok(near(r1.l, r0.l + 50, 3) && near(r1.r, r0.r) && near(r1.t, r0.t) && near(r1.b, r0.b), `${label}: dragging the left edge in 50px moves the left, the right stays (left ${Math.round(r1.l - r0.l)}, right ${(r1.r - r0.r).toFixed(1)})`);
    await show(nb); r0 = await rectOf(nb); await dragGrip(nb, 'w', -30, 0); r1 = await rectOf(nb);
    ok(near(r1.l, r0.l - 30, 3) && near(r1.r, r0.r) && r1.w > r0.w + 25, `${label}: and out again (width ${Math.round(r0.w)} to ${Math.round(r1.w)})`);
    // top edge: bottom stays
    await show(nb); r0 = await rectOf(nb); await dragGrip(nb, 'n', 0, -40); r1 = await rectOf(nb);
    if (process.env.DBG) console.log(JSON.stringify(r0), JSON.stringify(r1), await nb.evaluate(n => n.getAttribute('style')), await card(3).evaluate(c => c.getBoundingClientRect().top));
    ok(near(r1.t, r0.t - 40, 3) && near(r1.b, r0.b) && near(r1.l, r0.l) && near(r1.r, r0.r), `${label}: dragging the top edge up 40px moves the top, the bottom stays (top ${Math.round(r1.t - r0.t)}, bottom ${(r1.b - r0.b).toFixed(1)})`);
    await show(nb); r0 = await rectOf(nb); await dragGrip(nb, 'n', 0, 25); r1 = await rectOf(nb);
    ok(near(r1.t, r0.t + 25, 3) && near(r1.b, r0.b) && r1.h < r0.h - 20, `${label}: and back down (height ${Math.round(r0.h)} to ${Math.round(r1.h)})`);
    // corners
    await show(nb); r0 = await rectOf(nb); await dragGrip(nb, 'nw', 20, -20); r1 = await rectOf(nb);
    ok(near(r1.l, r0.l + 20, 3) && near(r1.t, r0.t - 20, 3) && near(r1.r, r0.r) && near(r1.b, r0.b), `${label}: top left corner moves the left and top, bottom right stays`);
    await show(nb); r0 = await rectOf(nb); await dragGrip(nb, 'ne', -20, -20); r1 = await rectOf(nb);
    ok(near(r1.r, r0.r - 20, 3) && near(r1.t, r0.t - 20, 3) && near(r1.l, r0.l) && near(r1.b, r0.b), `${label}: top right corner moves the right and top, bottom left stays`);
    await show(nb); r0 = await rectOf(nb); await dragGrip(nb, 'sw', -20, 20); r1 = await rectOf(nb);
    if (process.env.DBG) console.log('sw', JSON.stringify(r0), JSON.stringify(r1));
    ok(near(r1.l, r0.l - 20, 3) && near(r1.b, r0.b + 20, 3) && near(r1.r, r0.r) && near(r1.t, r0.t), `${label}: bottom left corner moves the left and bottom, top right stays`);
    await show(nb); r0 = await rectOf(nb); await dragGrip(nb, 'se', 20, 20); r1 = await rectOf(nb);
    if (process.env.DBG) console.log('se', JSON.stringify(r0), JSON.stringify(r1), await card(3).evaluate(c => c.getBoundingClientRect().right));
    ok(near(r1.r, r0.r + 20, 3) && near(r1.b, r0.b + 20, 3) && near(r1.l, r0.l) && near(r1.t, r0.t), `${label}: bottom right corner moves the right and bottom, top left stays`);
    await show(nb); r0 = await rectOf(nb); await dragGrip(nb, 'e', -15, 0); r1 = await rectOf(nb);
    ok(near(r1.r, r0.r - 15, 3) && near(r1.l, r0.l), `${label}: right edge still works`);
    await show(nb); r0 = await rectOf(nb); await dragGrip(nb, 's', 0, 15); r1 = await rectOf(nb);
    if (process.env.DBG) console.log('s', JSON.stringify(r0), JSON.stringify(r1), await nb.evaluate(n => JSON.stringify(n.dataset) + n.getAttribute('style')), await card(3).evaluate(c => [...c.children].map(x => x.className + ':' + Math.round(x.getBoundingClientRect().top) + '-' + Math.round(x.getBoundingClientRect().bottom) + ' ' + (x.dataset.y0 || '') + '/' + (x.dataset.y1 || '')).join(' | ')));
    ok(near(r1.b, r0.b + 15, 3) && near(r1.t, r0.t), `${label}: bottom edge still works`);
    // too small? the minimum width holds, and the other side stays
    await show(nb); r0 = await rectOf(nb); await dragGrip(nb, 'w', r0.w + 200, 0); r1 = await rectOf(nb);
    ok(r1.w >= 55 * await page.evaluate(() => viewZoom) && near(r1.r, r0.r), `${label}: it stops at a small width (${Math.round(r1.w)}px), the right edge still fixed`);
    await dragGrip(nb, 'w', -(r1.w + 400), 0); r1 = await rectOf(nb);
    const cr = await card(3).evaluate(c => { const r = c.getBoundingClientRect(); return {l: r.left}; });
    ok(r1.l >= cr.l - 1, `${label}: and it can't be pulled off the page`);
    await page.screenshot({path: path.join(OUT, `organise-resize-${kind}.png`), clip: {x: Math.max(0, r1.l - 60), y: Math.max(0, r1.t - 50), width: Math.min(1000, 1440 - Math.max(0, r1.l - 60)), height: r1.h + 100}});
    // saved
    const html = await doc();
    ok(kind === 'flow' ? /margin-left|width:/.test(await nb.evaluate(n => n.getAttribute('style'))) : /left:|data-px/.test(await nb.evaluate(n => n.outerHTML.slice(0, 300))), `${label}: the size and place are stored`);
  }

  // ---- lostpointercapture ends a drag cleanly ----
  {
    const nb = flowA; await show(nb); await nb.hover({position: {x: 80, y: 8}});
    const g = await nb.locator('.g-e').boundingBox(); const x = g.x + g.width / 2, y = g.y + g.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 30, y, {steps: 4});
    const w1 = (await rectOf(nb)).w;
    await nb.locator('.g-e').evaluate(g => g.dispatchEvent(new PointerEvent('lostpointercapture', {pointerId: 1, bubbles: false})));
    await page.mouse.move(x - 80, y, {steps: 4});
    const w2 = (await rectOf(nb)).w;
    ok(near(w1, w2, 1) && await page.locator('.guide').count() === 0, 'when the pointer capture is lost the resize ends there, with no guides left');
    await page.mouse.up(); await page.waitForTimeout(150);
  }

  // ---- snapping and pink guides on the new edges ----
  await page.waitForTimeout(700);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(100);
  await newNote(4, .3, 'Left one');
  await newNote(4, .72, 'Right one');
  {
    const nbs = card(4).locator('.notebox');
    await nbs.nth(0).evaluate(n => { n.id = 'snapA'; }); await nbs.nth(1).evaluate(n => { n.id = 'snapB'; });
    const a = page.locator('#snapA'), b = page.locator('#snapB');
    await dragGrip(a, 'w', 70, 0);
    const ra = await rectOf(a); let rb = await rectOf(b);
    ok(ra.l - rb.l > 60, 'set-up: the first note starts 70px in');
    const mid = await dragGrip(b, 'w', ra.l - rb.l - 2, 0, async () => ({v: await page.locator('.guide.v').count()}));
    rb = await rectOf(b);
    ok(mid.v >= 1, 'dragging the left edge close to another note\'s left edge shows a pink guide');
    ok(near(rb.l, ra.l, .6), 'and it snaps (left edges ' + rb.l.toFixed(1) + ' / ' + ra.l.toFixed(1) + ')');
    ok(await page.locator('.guide').count() === 0, 'the guide goes when you let go');
    // Alt turns snapping off
    await show(b); await b.hover({position: {x: 80, y: 8}});
    const g = await b.locator('.g-w').boundingBox(), x = g.x + g.width / 2, y = g.y + g.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.keyboard.down('Alt'); await page.mouse.move(x + 12, y, {steps: 3}); await page.mouse.move(x + 1.8, y, {steps: 3});     // (a press becomes a drag once it has moved a few pixels)
    const free = (await rectOf(b)).l; await page.keyboard.up('Alt'); await page.mouse.up(); await page.waitForTimeout(150);
    ok(near(free, ra.l + 1.8, 1.2) || Math.abs(free - ra.l) >= 0.5, 'holding Alt does not snap');
    // the top edge, with two floating notes
    await b.hover({position: {x: 80, y: 8}}); await b.locator('.g-float').click(); await page.waitForTimeout(400);
    await a.hover({position: {x: 80, y: 8}}); await a.locator('.g-float').click(); await page.waitForTimeout(400);
    await show(b); const ra2 = await rectOf(a); let rb2 = await rectOf(b);
    const mid2 = await dragGrip(b, 'n', 0, (ra2.b + 2) - rb2.t, async () => ({h: await page.locator('.guide.h').count()}));
    rb2 = await rectOf(b);
    ok(mid2.h >= 1, 'dragging a top edge close to another note\'s bottom edge shows a guide');
    ok(near(rb2.t, ra2.b, .6), 'and snaps to it (' + rb2.t.toFixed(1) + ' / ' + ra2.b.toFixed(1) + ')');
    // the corner snaps both ways
    await show(b); const rb3 = await rectOf(b), ra3 = await rectOf(a);
    const mid3 = await dragGrip(b, 'nw', ra3.l - rb3.l + 2, 0, async () => ({v: await page.locator('.guide.v').count()}));
    ok(mid3.v >= 1 && near((await rectOf(b)).l, ra3.l, .6), 'a corner snaps too');
  }

  // ================= 5. Auto-align =================
  await page.click('#tab-box');
  await page.mouse.click(5, 700);
  await page.evaluate(() => scrollTo(0, 0));
  {
    await newNote(5, .25, 'First note');
    const nbs = card(5).locator('.notebox'), a = nbs.nth(0);
    const def = await rectOf(a);
    await dragGrip(a, 'w', 30, 0);
    const ra = await rectOf(a);
    ok(near(ra.l, def.l + 30, 3), 'set-up: a note 30px in from the page edge');
    await newNote(5, .55, 'Second note');
    const bb = card(5).locator('.notebox').nth(1), rb = await rectOf(bb);
    ok(near(rb.l, ra.l, 1), 'auto-align on: a new note below lines up with the left edge of the note above (' + rb.l.toFixed(1) + ' / ' + ra.l.toFixed(1) + ')');
    ok(near(rb.r, def.r, 1.5), '(its right edge stays where a new note would have it)');
    // far away: more than 40px
    await dragGrip(a, 'w', 100, 0);
    const ra3 = await rectOf(a);
    await newNote(5, .8, 'Third note');
    const cc = card(5).locator('.notebox').nth(2), rc = await rectOf(cc);
    // the second note is also an option (30px in), so the third lines up with it, the nearest within 40px
    ok(near(rc.l, rb.l, 1) || near(rc.l, def.l, 1.5), 'only a note within 40px counts (third note at ' + (rc.l - def.l).toFixed(0) + 'px from the edge)');
    // a note more than 40px away is left alone
    await newNote(0, .2, 'Far one');
    const far = card(0).locator('.notebox').first(), rfar = await rectOf(far);
    await dragGrip(far, 'w', 100, 0);
    await newNote(0, .6, 'Near default');
    const nd = card(0).locator('.notebox').nth(1), rnd = await rectOf(nd), rfar2 = await rectOf(far);
    ok(rfar2.l - rfar.l > 90 && near(rnd.l, rfar.l, 1.5), 'a note 100px in is too far: the new one keeps the page edge (' + (rnd.l - rfar.l).toFixed(1) + 'px, not ' + (rfar2.l - rfar.l).toFixed(0) + ')');
    // off
    await page.click('#tab-box');
    await page.uncheck('#autoAlign'); await page.waitForTimeout(200);
    ok((await page.evaluate(() => localStorage.getItem('auto-align'))) === '0' && (await toastText()).includes('Auto-align is off'), 'Auto-align can be turned off (remembered)');
    await newNote(5, .12, 'Fourth note');
    const dd = card(5).locator('.notebox').first(), rd = await rectOf(dd);
    ok(near(rd.l, def.l, 1.5) && !near(rd.l, ra3.l, 5), 'off: a new note keeps today\'s place (' + (rd.l - def.l).toFixed(1) + 'px from the edge)');
    await ck('auto-align'); ok((await page.$$eval('#ckList .iitem .nm span', e => e.map(x => x.textContent))).includes('Auto-align notes on or off'), 'Ctrl+K has an Auto-align action');
    await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    ok(await page.isChecked('#autoAlign') && (await page.evaluate(() => localStorage.getItem('auto-align'))) === '1', 'which turns it back on');
  }

  // ================= 6. the Align group =================
  // four floating-free notes on page 2, each with its own left edge and width
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(100);
  await page.uncheck('#autoAlign');
  await newNote(1, .15, 'one');
  await newNote(1, .4, 'two');
  await newNote(1, .65, 'three');
  await newNote(1, .85, 'four');
  const nbs = card(1).locator('.notebox');
  ok(await nbs.count() === 4, 'four notes on page 2');
  await dragGrip(nbs.nth(0), 'w', 40, 0); await dragGrip(nbs.nth(1), 'w', 120, 0); await dragGrip(nbs.nth(2), 'w', 10, 0);
  await dragGrip(nbs.nth(1), 'e', -90, 0); await dragGrip(nbs.nth(3), 'e', -220, 0);
  const lefts = async () => Promise.all([0, 1, 2, 3].map(async i => rectOf(nbs.nth(i))));
  const before = await lefts();
  ok(new Set(before.map(r => Math.round(r.l))).size === 4 && new Set(before.map(r => Math.round(r.w))).size >= 3, 'set-up: different left edges and widths (' + before.map(r => Math.round(r.l) + '/' + Math.round(r.w)).join(' ') + ')');
  // the undo helper: one step
  const step = async fn => {
    await page.waitForTimeout(700);
    const i0 = await page.evaluate(() => hist.i);
    await fn(); await page.waitForTimeout(900);
    const i1 = await page.evaluate(() => hist.i);
    return {i0, i1};
  };
  const undo = async () => { await page.click('#undoBtn'); await page.waitForTimeout(500); };       // (Back also ends the selection)
  const reselect = async () => { await page.click('#tab-box'); await page.click('#selAllBtn'); await page.waitForTimeout(250); };
  const sameAs = (a, b, tol = 1.5) => a.every((r, i) => near(r.l, b[i].l, tol) && near(r.r, b[i].r, tol) && near(r.t, b[i].t, tol + 1));
  await page.click('#tab-box'); await page.evaluate(() => { document.activeElement?.blur(); active = null; getSelection().removeAllRanges(); });
  await page.click('#alLeft'); await page.waitForTimeout(300);
  ok((await toastText()).includes('Select some notes first'), 'Align with nothing selected says to select some notes first');
  await page.click('#selAllBtn'); await page.waitForTimeout(300);
  ok(await page.isVisible('#multibar'), 'Select all selects them');
  let s = await step(() => page.click('#alLeft'));
  let after = await lefts();
  ok(s.i1 === s.i0 + 1, 'Align left is one undo step (history ' + s.i0 + ' to ' + s.i1 + ')');
  ok(after.every(r => near(r.l, Math.min(...before.map(b => b.l)), 1.5)), 'Align left: all start on the leftmost edge (' + after.map(r => r.l.toFixed(1)).join(' ') + ')');
  ok(after.every((r, i) => near(r.w, before[i].w, 1.5)), '(widths unchanged)');
  await undo(); ok(sameAs(await lefts(), before), 'Back puts them where they were');
  await reselect();
  s = await step(() => page.click('#alRight')); after = await lefts();
  if (false) console.log('right', JSON.stringify(before.map(r => [r.l, r.r])), JSON.stringify(after.map(r => [r.l, r.r])), await nbs.evaluateAll(es => es.map(e => e.getAttribute('style'))), await toastText());
  ok(s.i1 === s.i0 + 1 && after.every(r => near(r.r, Math.max(...before.map(b => b.r)), 1.5)), 'Align right: all end on the rightmost edge, one step (' + after.map(r => r.r.toFixed(1)).join(' ') + ')');
  await undo(); ok(sameAs(await lefts(), before), 'Back undoes it');
  await reselect();
  s = await step(() => page.click('#alCenter')); after = await lefts();
  const cx = (Math.min(...before.map(b => b.l)) + Math.max(...before.map(b => b.r))) / 2;
  ok(s.i1 === s.i0 + 1 && after.every(r => near(r.cx, cx, 1.5)), 'Align centre: all share one middle, one step (' + after.map(r => r.cx.toFixed(1)).join(' ') + ')');
  await undo(); ok(sameAs(await lefts(), before), 'Back undoes it');
  await reselect();
  s = await step(() => page.click('#alWidth')); after = await lefts();
  ok(s.i1 === s.i0 + 1 && after.every(r => near(r.w, Math.max(...before.map(b => b.w)), 1.5)), 'Same width: all as wide as the widest, one step (' + after.map(r => Math.round(r.w)).join(' ') + ')');
  ok(after.every((r, i) => near(r.l, before[i].l, 1.5) || r.r <= Math.max(...before.map(b => b.r)) + 40), '(they keep their left edges, unless that would run off the page)');
  await undo(); ok(sameAs(await lefts(), before) && (await lefts()).every((r, i) => near(r.w, before[i].w, 1.5)), 'Back undoes it');
  // Distribute with not enough floating notes
  await reselect(); await clearToast(); await page.click('#alDist'); await page.waitForTimeout(300);
  ok((await toastText()).includes('three or more floating notes'), 'Distribute with no floating notes explains what it needs');
  // Tidy page: nothing selected needed
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(!(await page.isVisible('#multibar')), '(selection ended)');
  await nbs.nth(1).locator('.mine').click({position: {x: 20, y: 10}});
  await page.click('#tab-box');
  s = await step(() => page.click('#alTidy')); after = await lefts();
  ok(s.i1 === s.i0 + 1 && after.every(r => near(r.l, Math.min(...before.map(b => b.l)), 1.5)), 'Tidy page: every note starts on the leftmost edge, one step (' + after.map(r => r.l.toFixed(1)).join(' ') + ')');
  ok(after.every((r, i) => i === 0 || r.t > after[i - 1].t), '(their order is the same)');
  ok((await toastText()).startsWith('Tidied 4 notes'), '(and it says what it did)');
  await undo(); ok(sameAs(await lefts(), before), 'Back undoes it');
  // Distribute: three sticky notes
  await page.evaluate(() => scrollTo(0, 0));
  await page.evaluate(() => {
    const c = document.querySelectorAll('.pagecard')[1], r = c.getBoundingClientRect();
    const tops = [r.top + 10, r.top + 50, r.top + 380];
    tops.forEach((t, i) => addSticky(c, r.left + 30 + i * 40, t, 'sticky ' + (i + 1)));
  });
  await page.waitForTimeout(800);
  const st = card(1).locator('.notebox.sticky');
  ok(await st.count() === 3, 'three sticky notes');
  const sticks = () => Promise.all([0, 1, 2].map(i => rectOf(st.nth(i))));
  const sb = (await sticks()).sort((a, b) => a.t - b.t);
  await page.evaluate(() => scrollBy(0, 0)); await page.click('#tab-box');
  await page.evaluate(() => { selectAllNotes(document.querySelectorAll('.pagecard')[1]); }); await page.waitForTimeout(300);
  s = await step(() => page.click('#alDist'));
  const sa = (await sticks()).sort((a, b) => a.t - b.t);
  const gap1 = sa[1].t - sa[0].b, gap2 = sa[2].t - sa[1].b;
  ok(s.i1 === s.i0 + 1, 'Distribute is one undo step');
  ok(near(gap1, gap2, 2) && near(sa[0].t, sb[0].t, 2) && near(sa[2].b, sb[2].b, 2), 'Distribute: the gaps are equal (' + gap1.toFixed(1) + ' / ' + gap2.toFixed(1) + '), the top and bottom ones stay');
  ok(!near(sb[1].t - sb[0].b, sb[2].t - sb[1].b, 5), '(they were not before: ' + (sb[1].t - sb[0].b).toFixed(0) + ' / ' + (sb[2].t - sb[1].b).toFixed(0) + ')');
  await undo();
  const su = (await sticks()).sort((a, b) => a.t - b.t);
  ok(su.every((r, i) => near(r.t, sb[i].t, 2)), 'Back puts the sticky notes back');
  // sticky notes align too (left)
  await page.evaluate(() => { selectAllNotes(document.querySelectorAll('.pagecard')[1]); }); await page.waitForTimeout(200);
  await page.click('#alLeft'); await page.waitForTimeout(500);
  const sl = await sticks(); const flows = await lefts();
  const minAll = Math.min(...sl.map(r => r.l), ...flows.map(r => r.l));
  ok(sl.every(r => near(r.l, sl[0].l, 1.5)), 'sticky notes line up on the left too (' + sl.map(r => r.l.toFixed(1)).join(' ') + ')');
  await page.keyboard.press('Escape');

  // the tooltips of the new controls read well
  const tipsOf = ids => Promise.all(ids.map(id => page.$eval('#' + id, b => (b.getAttribute('title') || b.dataset.tip || '').trim())));
  const al = await tipsOf(['alLeft', 'alCenter', 'alRight', 'alWidth', 'alDist', 'alTidy', 'selAllBtn', 'tipsBtn']);
  ok(al.every(t => /^[A-Z][^:]*: .{12,}/.test(t)), 'the new tooltips are all "Name: what it does" (' + al.map(t => t.split(':')[0]).join(', ') + ')');
  const allTips = await page.$$eval('[title], [data-tip]', els => els.map(e => (e.getAttribute('title') || e.dataset.tip || '').trim()).filter(Boolean));
  ok(allTips.every(t => !/undefined|\[object|NaN/.test(t)) && allTips.every(t => t.length < 330), 'no tooltip anywhere is broken (' + allTips.length + ' checked)');
  ok(!allTips.some(t => /Select all notes on this page|Side notes: the colour/.test(t)), 'and none still talks about the old place or name');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('no page errors (desktop)');

  // ================= 7. a finger and a pen =================
  {
    const r = await openIpad(APP, {width: 1024, height: 1366});
    const {browser, page, cdp, errors} = r;
    const card = i => page.locator('.pagecard').nth(i);
    const rectOf = loc => loc.evaluate(n => { const r = n.getBoundingClientRect(); return {l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height}; });
    ok(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), '(a touch device)');
    await page.evaluate(() => {
      const c = document.querySelectorAll('.pagecard')[1]; c.scrollIntoView({block: 'start', behavior: 'instant'}); scrollBy(0, -160);
      const s = c.querySelector('.strip'); const y0 = +s.dataset.y0, y1 = +s.dataset.y1;
      const {box, el} = insertAt(s, y0 + (y1 - y0) * .4); el.innerText = 'A note for a finger and a pen\nwith a few lines\nso that its edges are long\nenough to catch';  saveSoon();
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => { document.activeElement?.blur(); });
    const nb = card(1).locator('.notebox').first();
    await nb.evaluate(n => n.scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(200);
    let nr = await nb.boundingBox();
    await touch(cdp, 'touchStart', [[nr.x + nr.width / 2, nr.y + nr.height / 2]]); await touch(cdp, 'touchEnd', []); await page.waitForTimeout(500);
    ok(await nb.evaluate(n => n.classList.contains('touched')), 'tapping a note shows its handles');
    const dirs = ['e', 'w', 'n', 's', 'nw', 'ne', 'sw', 'se'];
    // the catching area of each handle reaches outwards and is at least 40px along the edge (never over the words)
    const reach = await nb.evaluate((n, dirs) => dirs.map(d => {
      const g = n.querySelector(':scope > .g-' + d), r = g.getBoundingClientRect(), b = getComputedStyle(g, '::before'), inset = ['top', 'right', 'bottom', 'left'].map(k => parseFloat(b[k]) || 0);
      return [d, Math.round(r.width - inset[1] - inset[3]), Math.round(r.height - inset[0] - inset[2]), getComputedStyle(g).opacity];
    }), dirs);
    ok(reach.every(([d, w, h, o]) => o === '1' && (d.length === 1 ? Math.max(w, h) >= 40 && Math.min(w, h) >= 24 : w >= 28 && h >= 28)), 'with a finger every edge handle has a catching area of at least 40px along it, and every corner one of about 30px (' + reach.map(x => x.slice(0, 3).join(':')).join(' ') + ')');
    ok(await nb.evaluate(n => { const probe = (d, dx, dy) => { const g = n.querySelector(':scope > .g-' + d).getBoundingClientRect(); const e = document.elementFromPoint(g.left + g.width / 2 + dx, g.top + g.height / 2 + dy); return !!e?.closest('.g-' + d); }; const res = {e: probe('e', 11, -12), w: probe('w', -11, 14), n: probe('n', 0, -11), s: probe('s', 0, 11), nw: probe('nw', -9, -9), ne: probe('ne', 9, -9), sw: probe('sw', -9, 9)}; return res; }).then(r => Object.values(r).every(Boolean)), 'and each can be caught from about 10px outside it');
    ok(await page.evaluate(() => { document.querySelectorAll('.notebox.touched').forEach(x => x.classList.remove('touched')); const n = document.querySelector('.pagecard .notebox'); const g = n.querySelector(':scope > .g-w').getBoundingClientRect(); const e = document.elementFromPoint(g.left + g.width / 2 - 11, g.top + g.height / 2); n.classList.add('touched'); return !e?.closest('.g-w'); }), 'on a note you have not tapped, there is no bigger catching area');
    // finger: drag the left edge
    const drag = async (x, y, dx, dy, n = 8) => { await touch(cdp, 'touchStart', [[x, y]]); for (let k = 1; k <= n; k++) await touch(cdp, 'touchMove', [[x + dx * k / n, y + dy * k / n]]); await touch(cdp, 'touchEnd', []); await page.waitForTimeout(350); };
    let r0 = await rectOf(nb), g = await nb.locator('.g-w').boundingBox();
    await drag(g.x + g.width / 2 - 9, g.y + g.height / 2 - 10, 60, 0);
    let r1 = await rectOf(nb);
    ok(near(r1.l, r0.l + 60, 8) && near(r1.r, r0.r, 2), 'a finger drags the left edge in; the right stays (left +' + Math.round(r1.l - r0.l) + ', right ' + (r1.r - r0.r).toFixed(1) + ')');
    await touch(cdp, 'touchStart', [[r1.l + 80, r1.t + r1.h / 2]]); await touch(cdp, 'touchEnd', []); await page.waitForTimeout(400);
    r0 = r1; g = await nb.locator('.g-n').boundingBox();
    await drag(g.x + g.width / 2, g.y + g.height / 2, 0, -40);
    r1 = await rectOf(nb);
    ok(near(r1.t, r0.t - 40, 8) && near(r1.b, r0.b, 2), 'a finger drags the top edge up; the bottom stays (top ' + Math.round(r1.t - r0.t) + ', bottom ' + (r1.b - r0.b).toFixed(1) + ')');
    await touch(cdp, 'touchStart', [[r1.l + 80, r1.t + r1.h / 2]]); await touch(cdp, 'touchEnd', []); await page.waitForTimeout(400);
    r0 = r1; g = await nb.locator('.g-ne').boundingBox();
    await drag(g.x + g.width / 2, g.y + g.height / 2, -30, -20);
    r1 = await rectOf(nb);
    ok(near(r1.r, r0.r - 30, 8) && near(r1.t, r0.t - 20, 8) && near(r1.l, r0.l, 2) && near(r1.b, r0.b, 2), 'a finger drags the top right corner; the bottom left stays');
    // pen
    await touch(cdp, 'touchStart', [[r1.l + 80, r1.t + r1.h / 2]]); await touch(cdp, 'touchEnd', []); await page.waitForTimeout(400);
    r0 = r1; g = await nb.locator('.g-sw').boundingBox();
    const px = g.x + g.width / 2, py = g.y + g.height / 2;
    await pen(cdp, 'mouseMoved', px, py);
    await pen(cdp, 'mousePressed', px, py);
    for (let k = 1; k <= 6; k++) await pen(cdp, 'mouseMoved', px - 6 * k, py + 4 * k, {down: true});
    await pen(cdp, 'mouseReleased', px - 36, py + 24, {force: 0}); await page.waitForTimeout(350);
    r1 = await rectOf(nb);
    ok(near(r1.l, r0.l, 2) && near(r1.b, r0.b, 2) && near(r1.r, r0.r, 2) && near(r1.t, r0.t, 2), 'the Pencil (which draws by itself) does not drag the note by its corner');
    await page.evaluate(() => pref.set('pen-auto', '0'));
    await page.evaluate(() => { document.querySelectorAll('.notebox').forEach(n => n.classList.add('touched')); });
    g = await nb.locator('.g-sw').boundingBox();
    const qx = g.x + g.width / 2, qy = g.y + g.height / 2;
    await pen(cdp, 'mouseMoved', qx, qy);
    await pen(cdp, 'mousePressed', qx, qy);
    for (let k = 1; k <= 6; k++) await pen(cdp, 'mouseMoved', qx - 6 * k, qy + 4 * k, {down: true});
    await pen(cdp, 'mouseReleased', qx - 36, qy + 24, {force: 0}); await page.waitForTimeout(350);
    r0 = r1; r1 = await rectOf(nb);
    ok(near(r1.l, r0.l - 36, 8) && near(r1.b, r0.b + 24, 8) && near(r1.r, r0.r, 2) && near(r1.t, r0.t, 2), 'with "Apple Pencil draws automatically" off it acts like a finger and drags the corner; the top right stays (left ' + Math.round(r1.l - r0.l) + ', bottom ' + Math.round(r1.b - r0.b) + ')');
    ok(await page.locator('.guide').count() === 0, 'no guide is left behind');
    // the corner button for the side page, by touch
    await page.evaluate(() => scrollTo(0, 0));
    await page.evaluate(() => { document.querySelector('#tab-view').click(); });
    await page.click('#sideBtn'); await page.waitForTimeout(600);
    await page.evaluate(() => { document.querySelector('.pagecard').scrollIntoView({block: 'start', behavior: 'instant'}); scrollBy(0, -170); });
    await page.waitForTimeout(300);
    ok(!(await cornerOnIn(page)), 'touch: no palette button yet');
    const sp = await page.locator('.sidepage').first().boundingBox();
    ok(!!sp && sp.width > 100, 'a side page is on screen (' + Math.round(sp.width) + 'x' + Math.round(sp.height) + ')');
    await touch(cdp, 'touchStart', [[sp.x + sp.width / 2, sp.y + 140]]); await touch(cdp, 'touchEnd', []); await page.waitForTimeout(500);
    ok(await cornerOnIn(page), 'tapping a side page shows the palette button');
    const cb = await page.locator('#sideBgCorner').boundingBox();
    ok(cb.width >= 40 && cb.height >= 40, 'at least 40px for a finger (' + cb.width + 'x' + cb.height + ')');
    await page.screenshot({path: path.join(OUT, 'organise-corner-touch.png'), clip: {x: Math.max(0, sp.x - 40), y: Math.max(0, sp.y), width: Math.min(700, 1024 - Math.max(0, sp.x - 40)), height: 320}});
    await touch(cdp, 'touchStart', [[cb.x + cb.width / 2, cb.y + cb.height / 2]]); await touch(cdp, 'touchEnd', []); await page.waitForTimeout(400);
    ok(await page.isVisible('#sideBgPop'), 'tapping it opens the pop-up');
    ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await browser.close();
    console.log('no page errors (touch)');
  }

  // ================= 8. every tab, light and dark, at three widths =================
  const problems = [];
  for (const scheme of ['light', 'dark']) {
    for (const w of [1440, 1100, 820]) {
      const r = await open(APP, {width: w, colorScheme: scheme});
      const p = r.page;
      await p.waitForTimeout(500);
      await p.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
      await p.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
      await p.waitForTimeout(600);
      for (const tab of ['home', 'insert', 'box', 'view']) {
        await p.click('#tab-' + tab); await p.waitForTimeout(150);
        const info = await p.evaluate(tab => {
          const panel = document.getElementById('panel-' + tab), pr = panel.getBoundingClientRect();
          const items = [...panel.querySelectorAll('.grp, .tip, .sep')].filter(e => e.getClientRects().length);
          const ctrls = [...panel.querySelectorAll('.btn, select, input, label.chk, .cap, .tip')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
          const out = {overlaps: [], clipped: [], scroll: panel.scrollWidth - panel.clientWidth};
          for (const e of ctrls) {
            if (e.matches('.btn, .cap, .tip, label.chk') && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') out.clipped.push(e.id || e.textContent.trim().slice(0, 20));
            const r = e.getBoundingClientRect(); if (r.width < 1) continue;
            if (r.top < pr.top - 1 || r.bottom > pr.bottom + 1) out.clipped.push('v:' + (e.id || e.textContent.trim().slice(0, 20)));
          }
          for (let i = 0; i < ctrls.length; i++) for (let j = i + 1; j < ctrls.length; j++) {
            const a = ctrls[i], b = ctrls[j]; if (a.contains(b) || b.contains(a)) continue;
            const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
            if (ra.left < rb.right - 0.5 && rb.left < ra.right - 0.5 && ra.top < rb.bottom - 0.5 && rb.top < ra.bottom - 0.5) out.overlaps.push((a.id || a.textContent.trim().slice(0, 14)) + ' x ' + (b.id || b.textContent.trim().slice(0, 14)));
          }
          return out;
        }, tab);
        const tag = `${scheme} ${w} ${tab}`;
        if (info.overlaps.length) problems.push(tag + ' overlaps: ' + info.overlaps.join(', '));
        if (info.clipped.length) problems.push(tag + ' clipped: ' + info.clipped.join(', '));
        if (w === 1440 && info.scroll > 0) problems.push(tag + ' scrolls sideways by ' + info.scroll + 'px');
        console.log(`    ${tag}: ${info.scroll > 0 ? 'scrolls ' + info.scroll + 'px' : 'fits'}`);
        const h = await p.$eval('#appbar', a => Math.round(a.getBoundingClientRect().bottom));
        await p.screenshot({path: path.join(OUT, `organise-${tab}-${scheme}-${w}.png`), clip: {x: 0, y: 0, width: w, height: h + 6}});
      }
      // the last thing on a long tab can be reached by scrolling
      await p.click('#tab-view');
      const reach = await p.evaluate(() => { const panel = document.getElementById('panel-view'); panel.scrollLeft = panel.scrollWidth; const cl = document.getElementById('clear').getBoundingClientRect(), pr = panel.getBoundingClientRect(); return cl.right <= pr.right + 1 && cl.left >= pr.left; });
      if (!reach) problems.push(`${scheme} ${w}: Clear this notebook can't be reached on the View tab`);
      await r.browser.close();
    }
  }
  ok(problems.length === 0, 'nothing overlaps or clips at 1440, 1100 and 820 px, light and dark' + (problems.length ? ': ' + problems.join(' | ') : ''));

  console.log('no page errors');
})().catch(e => { console.log(e.message); process.exit(1); });

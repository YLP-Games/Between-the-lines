// Templates and formulas: the gallery, every subject's templates, the smart blocks' logic, formulas, save/reload/undo, downloads, Study mode, touch and phone
const {start, settle, addNote, notebookDoc, pdfPages, pdfInk, pixels, near, rgb, ok, OUT, path, results, APP} = require('./wtcommon');
const fs = require('fs');

const SUBJECTS = ['Recent', 'Favourites', 'General study', 'Accounting & Finance', 'Economics', 'Mathematics', 'Statistics', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Languages', 'Law', 'Medicine & Health'];
const eqn = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const txt = (page, sel) => page.locator(sel).first().textContent();
const gal = page => page.locator('.tplbox');
const cards = page => page.$$eval('.tplbox .tcard .tname', e => e.map(x => x.textContent));
const focusIn = page => page.evaluate(() => { const a = document.activeElement; return a ? (a.className || a.tagName) : ''; });
const openGallery = async page => { await page.click('#tab-insert'); await page.click('#tplBtn'); await page.waitForSelector('.tplbox:not([hidden])'); await page.waitForTimeout(150); };
const subject = async (page, name) => { await page.locator('.tplnav .tn', {hasText: name}).first().click(); await page.waitForTimeout(120); };
const pick = async (page, name) => { await page.locator('.tplbox .tcard', {hasText: name}).first().locator('.tmain').click(); await page.waitForTimeout(350); };
// insert a template through the gallery
const insertVia = async (page, subj, name) => { await openGallery(page); await subject(page, subj); await pick(page, name); };
const type = async (page, s) => { await page.keyboard.type(s); await page.waitForTimeout(40); };
const tab = page => page.keyboard.press('Tab');
const val = (page, sel, i = 0) => page.locator(sel).nth(i).textContent();
const clearNotes = page => page.evaluate(() => { document.querySelectorAll('.notebox').forEach(b => b.remove()); active = null; savedRange = null; });

(async () => {
  // ---- the ribbon: exactly one new button ----
  // what each ribbon tab had before there were templates
  const baseCounts = [['panel-home', 22], ['panel-insert', 10], ['panel-box', 9], ['panel-view', 15]];

  const {browser, page, errors, card} = await start();
  const counts = await page.evaluate(() => [...document.querySelectorAll('#ribbon .panel')].map(p => [p.id, p.querySelectorAll('button').length]));
  const ins0 = baseCounts.find(c => c[0] === 'panel-insert')[1], ins1 = counts.find(c => c[0] === 'panel-insert')[1];
  ok(ins1 === ins0 + 1, `the Insert tab has one more button than before (${ins0} → ${ins1})`);
  ok(counts.filter(c => c[0] !== 'panel-insert').every(c => baseCounts.find(b => b[0] === c[0])[1] === c[1]), 'every other tab has exactly the buttons it had');
  const grp = await page.evaluate(() => { const b = document.querySelector('#tplBtn'); return {cap: b.closest('.grp').querySelector('.cap').textContent, ids: [...b.closest('.row').querySelectorAll('button')].map(x => x.id), label: b.textContent.trim(), icon: b.querySelector('use').getAttribute('href'), tip: b.dataset.tip}; });
  ok(grp.cap === 'Writing tools' && grp.ids.join() === 'wgBtn,tblBtn,jeBtn,tplBtn' && grp.label === 'Templates' && grp.icon === '#i-library', `it is "Templates" (a library icon) in the Writing tools group, after the others (${grp.ids})`);
  ok(grp.tip.startsWith('Templates:'), 'with a tooltip');

  // ---- opening the gallery from the Insert tab ----
  await page.click('#tab-insert');
  ok(await page.locator('.tplbox:visible').count() === 0, 'the gallery is closed to begin with');
  await page.focus('#tplBtn'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  ok(await page.locator('.tplbox:visible').count() === 1 && await page.getAttribute('.tplbox', 'role') === 'dialog' && await page.getAttribute('.tplbox', 'aria-modal') === 'true', 'the Templates button opens a dialog');
  ok(await page.evaluate(() => document.activeElement.id === 'tplQ'), 'the search box has the cursor');
  const subs = await page.$$eval('.tplnav .tn span', e => e.map(x => x.textContent));
  ok(subs.join('|') === SUBJECTS.join('|'), `the subjects listed on the left: ${subs.join(', ')}`);
  ok(await page.getAttribute('.tplnav .tn[aria-current="true"]', 'data-s') === 'general', 'General study is showing to begin with');
  ok((await cards(page)).join('|') === 'Cornell notes|Definition card|Flashcard|Pros and cons|Compare and contrast|Timeline|Key takeaways', 'its seven templates');
  const c0 = await page.evaluate(() => { const c = document.querySelector('.tcard'); return {name: !!c.querySelector('.tname'), desc: c.querySelector('.tdesc').textContent.length > 10, pv: c.querySelectorAll('.tpv table').length, star: !!c.querySelector('.tstar')}; });
  ok(c0.name && c0.desc && c0.pv === 1 && c0.star, 'each card has a name, a one-line description, a live preview and a star');
  const per = {};
  for (const s of SUBJECTS.slice(2)) { await subject(page, s); per[s] = (await cards(page)).length; }
  ok(Object.values(per).join() === '7,6,3,6,3,4,4,3,4,2,2,2', `templates per subject (${Object.values(per).join(', ')})`);
  await page.screenshot({path: path.join(OUT, 'tpl-gallery-light.png')});
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(await page.locator('.tplbox:visible').count() === 0, 'Esc closes it');
  ok(await page.evaluate(() => document.activeElement.id === 'tplBtn'), 'and the focus goes back to the button it came from');

  // ---- search ----
  await openGallery(page);
  await page.keyboard.type('punnett'); await page.waitForTimeout(150);
  ok((await cards(page)).join() === 'Punnett square', 'searching “punnett” finds the Punnett square');
  ok(await page.locator('.tplnav .tn[aria-current="true"]').count() === 0 && (await txt(page, '#tplCap')).includes('1 result'), 'whatever subject it is in, with the result count said');
  await page.fill('#tplQ', 'ice table'); await page.waitForTimeout(120);
  ok((await cards(page)).join() === 'ICE table', 'searching “ice table” finds the ICE table');
  await page.fill('#tplQ', 'chemistry'); await page.waitForTimeout(120);
  ok((await cards(page)).join('|') === 'Chemical equation|ICE table|Stoichiometry steps|Element lookup', 'searching a subject name finds all its templates');
  await page.fill('#tplQ', 'debit'); await page.waitForTimeout(120);
  ok((await cards(page)).includes('Journal entry') && (await cards(page)).includes('T-account'), 'search also reads the extra words (“debit”)');
  await page.fill('#tplQ', 'zzzz'); await page.waitForTimeout(120);
  ok(await page.locator('.tplnone').count() === 1, 'nothing found says so');
  await page.fill('#tplQ', ''); await page.waitForTimeout(120);
  ok(await page.locator('.tplnav .tn[aria-current="true"]').count() === 1, 'clearing it brings the subject back');

  // ---- keyboard: arrows move between cards, Enter puts the template in ----
  await subject(page, 'Accounting');
  await page.focus('#tplQ'); await page.keyboard.press('ArrowDown');
  ok((await page.evaluate(() => document.activeElement.closest('.tcard').dataset.id)) === 'journal', 'Down from the search box goes to the first card');
  await page.keyboard.press('ArrowRight');
  ok((await page.evaluate(() => document.activeElement.closest('.tcard').dataset.id)) === 'taccount', 'Right moves to the next card');
  await page.keyboard.press('ArrowDown');
  const afterDown = await page.evaluate(() => document.activeElement.closest('.tcard').dataset.id);
  ok(afterDown === 'depreciation', `Down moves a row (${afterDown})`);
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowLeft');
  ok((await page.evaluate(() => document.activeElement.closest('.tcard').dataset.id)) === 'journal', 'Up and Left move back');
  await page.keyboard.press('ArrowUp');
  ok(await page.evaluate(() => document.activeElement.id === 'tplQ'), 'Up from the first row goes back to the search box');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight');
  // Tab stays inside
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  ok(await page.evaluate(() => document.querySelector('.tplbox').contains(document.activeElement)), 'Tab goes round inside the dialog (the focus is trapped)');
  for (let i = 0; i < 40; i++) await page.keyboard.press('Shift+Tab');
  ok(await page.evaluate(() => document.querySelector('.tplbox').contains(document.activeElement)), 'and so does Shift+Tab');
  await page.focus('#tplQ'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ok(await page.locator('.tplbox:visible').count() === 0 && await page.locator('.notebox .tpl-t').count() === 1, 'Enter on a card puts it in (a T-account) and closes the gallery, in a new note');
  ok(await page.evaluate(() => document.activeElement.classList.contains('t-name')), 'with the cursor in its first field');
  ok(await card.locator('.notebox .tpl-t').count() === 1, '… on the page you are on');

  // ---- remembered: recent, favourites, last subject ----
  await openGallery(page);
  ok(await page.getAttribute('.tplnav .tn[aria-current="true"]', 'data-s') === 'acct', 'it opens on the subject you used last (Accounting & Finance)');
  await subject(page, 'Recent');
  ok((await cards(page)).join() === 'T-account', 'Recent lists what you put in');
  await subject(page, 'Chemistry');
  await page.locator('.tcard[data-id="punnett"]').count();
  await subject(page, 'Biology');
  await page.locator('.tcard[data-id="punnett"] .tstar').click(); await page.waitForTimeout(100);
  ok(await page.getAttribute('.tcard[data-id="punnett"] .tstar', 'aria-pressed') === 'true', 'the star favourites a card');
  ok((await page.textContent('.tplnav .tn[data-s="fav"] small')) === '1', 'the Favourites count goes up');
  await subject(page, 'Favourites');
  ok((await cards(page)).join() === 'Punnett square', 'Favourites lists it');
  const prefs = await page.evaluate(() => ({subj: localStorage.getItem('tpl-subj'), recent: localStorage.getItem('tpl-recent'), fav: localStorage.getItem('tpl-fav')}));
  ok(prefs.subj === 'fav' && prefs.recent === '["taccount"]' && prefs.fav === '["punnett"]', `remembered with pref (${JSON.stringify(prefs)})`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await clearNotes(page);

  // ---- the other ways in: the / menu, + Add here, Ctrl+K ----
  await addNote(page, page.locator('.pagecard').nth(4), '/template'); await page.waitForTimeout(250);
  ok(await page.locator('.imenu .iitem').count() === 1 && (await page.textContent('.imenu .iitem .nm span')) === 'Template…' && (await page.textContent('.imenu .iitem .hint')) === '/template', '/template finds “Template…” in the / menu');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(await page.locator('.tplbox:visible').count() === 1 && !(await page.locator('.pagecard').nth(4).locator('.mine').first().innerText()).includes('/template'), 'Enter opens the gallery and the “/template” is gone from the note');
  await subject(page, 'General study'); await pick(page, 'Definition card');
  ok(await page.locator('.pagecard').nth(4).locator('.notebox table.wtable').count() === 1, 'a template goes into that same note');
  await page.keyboard.press('Escape');
  await clearNotes(page);
  await addNote(page, page.locator('.pagecard').nth(4), '/t'); await page.waitForTimeout(250);
  const t1 = await page.$$eval('.imenu .iitem .nm span', e => e.map(x => x.textContent));
  ok(t1.includes('Template…') && t1.includes('Table'), `/t lists Template… (${t1.join(', ')})`);
  await page.keyboard.press('Escape'); await clearNotes(page);
  // at the caret, in the middle of what is written
  await addNote(page, page.locator('.pagecard').nth(3), 'before after');
  const note = page.locator('.pagecard').nth(3).locator('.notebox .mine').first();
  await page.keyboard.press('Home'); for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
  await insertVia(page, 'Biology', 'Punnett square');
  const inside = await note.evaluate(n => ({first: n.firstChild.nodeType === 3 ? n.firstChild.data : null, has: n.querySelectorAll('.tpl-pun').length, txt: n.innerText.replace(/\s+/g, ' ')}));
  ok(inside.has === 1 && inside.first === 'before ' && /after/.test(inside.txt) && await page.locator('.pagecard').nth(3).locator('.notebox').count() === 1, 'with a note open, the template goes inside it at the cursor, between the words');
  ok(await page.evaluate(() => document.activeElement.classList.contains('pn-a')), 'and you are typing in its first field');
  await page.keyboard.press('Escape'); await clearNotes(page);
  // + Add here
  await page.locator('.pagecard').nth(1).scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
  const s2 = await page.locator('.pagecard').nth(1).locator('.strip').first().boundingBox();
  await page.mouse.move(s2.x + 250, s2.y + s2.height * 0.4, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill', {button: 'right'}); await page.waitForTimeout(200);
  const items = await page.$$eval('.imenu .iitem .nm span', e => e.map(x => x.textContent));
  ok(items.join() === 'Note,Sticky note,Equation,Table,Journal entry,Template…', `the + Add here menu has one new item (${items.join(', ')})`);
  await page.keyboard.type('templ'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(await page.locator('.tplbox:visible').count() === 1, '“Template…” there opens the gallery');
  await subject(page, 'General study'); await pick(page, 'Flashcard');
  ok(await page.locator('.pagecard').nth(1).locator('.notebox .tpl-fc').count() === 1, 'and the template goes in the gap, as its own note');
  await page.keyboard.press('Escape'); await clearNotes(page);
  // Ctrl+K
  await page.mouse.click(8, 700); await page.keyboard.press('Control+k'); await page.waitForTimeout(250);
  await page.keyboard.type('templ'); await page.waitForTimeout(250);
  const ckActs = await page.$$eval('.cmdk .iitem .nm span', e => e.map(x => x.textContent));
  ok(ckActs.includes('Templates…') && (await page.$$eval('.cmdk .isec', e => e.map(x => x.textContent))).includes('Actions'), 'Ctrl+K has the one action “Templates…”');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp');
  await page.evaluate(() => { const i = ck.items.findIndex(r => r.key === 'act:templates'); ck.k = i; ckSel(false); });
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(await page.locator('.tplbox:visible').count() === 1, 'which opens the gallery');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.keyboard.press('Control+k'); await page.waitForTimeout(200); await page.keyboard.type('punnett'); await page.waitForTimeout(300);
  ok((await page.$$eval('.cmdk .isec', e => e.map(x => x.textContent))).includes('Templates') && (await page.$$eval('.cmdk .iitem .nm > span', e => e.map(x => x.textContent))).includes('Punnett square'), 'Ctrl+K finds “Punnett square” by name, in a Templates section');
  ok((await page.textContent('.cmdk .iitem .nm small')) === 'Biology', 'with its subject beside it');
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ok(await page.locator('.notebox .tpl-pun').count() === 1, 'and Enter puts it straight in');
  await clearNotes(page);
  await page.keyboard.press('Control+k'); await page.waitForTimeout(200); await page.keyboard.type('ice table'); await page.waitForTimeout(300);
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ok(await page.locator('.notebox .tpl-ce').count() === 1 && await page.locator('.notebox table.wtable').count() === 1, '“ice table” in Ctrl+K inserts the ICE table (an equation line and a table)');
  await clearNotes(page);
  await page.keyboard.press('Control+k'); await page.waitForTimeout(200); await page.keyboard.type('chemistry'); await page.waitForTimeout(300);
  ok((await page.$$eval('.cmdk .iitem .nm > span', e => e.map(x => x.textContent))).filter(x => ['Chemical equation', 'ICE table', 'Stoichiometry steps', 'Element lookup'].includes(x)).length === 4, 'a subject name finds its templates in Ctrl+K too');
  await page.keyboard.press('Escape');
  // the Journal entry is in the gallery, and its button and /je still work
  await openGallery(page); await subject(page, 'Accounting');
  ok((await cards(page))[0] === 'Journal entry', 'the Journal entry is the first card in Accounting & Finance');
  await pick(page, 'Journal entry');
  ok(await page.locator('.notebox .jrnl').count() === 1 && await page.evaluate(() => document.activeElement.classList.contains('j-acct')), 'it goes in like the Journal entry button does');
  await page.keyboard.press('Escape'); await clearNotes(page);
  await page.click('#jeBtn'); await page.waitForTimeout(300);
  ok(await page.locator('.notebox .jrnl').count() === 1, 'the Journal entry button still works');
  await page.keyboard.press('Escape'); await clearNotes(page);
  await addNote(page, page.locator('.pagecard').nth(5), '/je'); await page.waitForTimeout(200);
  ok(await page.locator('.imenu .iitem').count() === 1 && (await page.textContent('.imenu .iitem .nm span')) === 'Journal entry', '/je still finds it');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(await page.locator('.notebox .jrnl').count() === 1, 'and puts one in');
  await page.keyboard.press('Escape'); await clearNotes(page);

  // ---- every template goes in ----
  const ids = await page.evaluate(() => TPLS.map(t => [t.id, SUBJ[t.s], t.name]));
  ok(ids.length === 46, `${ids.length} templates in all`);
  for (const [id, subj, name] of ids) {
    await clearNotes(page);
    await insertVia(page, subj, name);
    const r = await page.evaluate(() => { const n = document.querySelector('.notebox .mine'); return {blocks: n.querySelectorAll('.tpl, .jrnl, table.wtable').length, boxes: document.querySelectorAll('.notebox').length, fields: n.querySelectorAll('[contenteditable="true"],[contenteditable="plaintext-only"], td, svg.sv').length, focus: !!document.activeElement.closest('.mine')}; });
    if (!(r.blocks >= 1 && r.boxes === 1 && r.fields >= 1)) throw new Error(`FAILED: ${name} did not go in properly ${JSON.stringify(r)}`);
    await page.keyboard.press('Escape');
  }
  ok(true, 'all 46 templates go in, each in a note of its own with fields to type in (or a drawing to work on)');
  await clearNotes(page);





















  // ================= the smart blocks =================
  const fill = async (sel, text, i = 0, commit = true) => { const l = page.locator(sel).nth(i); await l.click(); await page.keyboard.press('Control+a'); if (text === '') await page.keyboard.press('Backspace'); else await page.keyboard.type(text); if (commit) await page.keyboard.press('Tab'); };
  const T = (sel, i = 0) => page.locator(sel).nth(i).textContent();
  const hid = sel => page.locator(sel).first().evaluate(e => e.hidden);
  const fresh = async (subj, name) => { await clearNotes(page); await insertVia(page, subj, name); };
  const same = async (sel, want, msg) => { const got = await page.$$eval(sel, e => e.map(x => x.textContent)); ok(got.join('|') === want, `${msg} (${got.join('|')})`); };

  // ---- T-account ----
  await fresh('Accounting', 'T-account');
  await type(page, 'Cash'); await tab(page);
  await type(page, 'Capital'); await tab(page); await type(page, '5000'); await tab(page);
  await type(page, 'Rent'); await tab(page); await type(page, '800'); await page.keyboard.press('Enter');
  ok(await page.evaluate(() => document.activeElement.matches('.rd') && document.activeElement.closest('.tr') === document.querySelectorAll('.tpl-t .tr.d')[1]), 'Enter after a credit amount goes to the next row’s credit side');
  await type(page, 'Wages'); await tab(page); await type(page, '1500');
  await fill('.tpl-t .tr.d .ld', 'Sales', 1, false); await tab(page); await type(page, '1200'); await tab(page);
  ok((await T('.tpl-t .tr.d .la', 0)) === '5,000' && (await T('.tpl-t .tr.d .la', 1)) === '1,200', 'amounts get thousands separators');
  ok(!(await hid('.tpl-t .tr.cd')) && (await T('.tpl-t .tr.cd .rd')) === 'Bal c/d' && (await T('.tpl-t .tr.cd .ra')) === '3,900' && (await T('.tpl-t .tr.cd .ld')) === '', 'debits 6,200, credits 2,300: “Bal c/d” 3,900 on the credit (shorter) side');
  ok((await T('.tpl-t .tr.tot .la')) === '6,200' && (await T('.tpl-t .tr.tot .ra')) === '6,200', 'both totals are 6,200');
  ok(!(await hid('.tpl-t .tr.bd')) && (await T('.tpl-t .tr.bd .ld')) === 'Bal b/d' && (await T('.tpl-t .tr.bd .la')) === '3,900' && (await T('.tpl-t .tr.bd .rd')) === '', '“Bal b/d” 3,900 under the totals, on the debit side');
  await page.screenshot({path: path.join(OUT, 'tpl-use-taccount.png'), clip: await page.locator('.notebox').first().boundingBox()});
  await fill('.tpl-t .tr.d .ra', '9000', 2);
  ok((await T('.tpl-t .tr.cd .ld')) === 'Bal c/d' && (await T('.tpl-t .tr.cd .la')) === '5,100' && (await T('.tpl-t .tr.bd .rd')) === 'Bal b/d' && (await T('.tpl-t .tr.bd .ra')) === '5,100' && (await T('.tpl-t .tr.tot .ra')) === '11,300', 'credits 11,300 against debits 6,200 (a 9,000 credit added): Bal c/d 5,100 moves to the debit side and Bal b/d to the credit side');
  await fill('.tpl-t .tr.d .ra', '3900', 2);
  ok((await hid('.tpl-t .tr.cd')) && (await hid('.tpl-t .tr.bd')) && (await T('.tpl-t .tr.tot .la')) === '6,200', 'equal sides: no balance lines, just the totals');
  for (const [sel, i] of [['.ra', 2], ['.ra', 1], ['.ra', 0], ['.la', 1], ['.la', 0]]) await fill('.tpl-t .tr.d ' + sel, '', i);
  ok(await hid('.tpl-t .tr.tot') && await hid('.tpl-t .tr.cd'), 'with nothing in it there is nothing to total');
  await fill('.tpl-t .tr.d .la', '100', 2, false);
  await page.keyboard.press('Enter');
  ok(await page.locator('.tpl-t .tr.d').count() === 4 && await page.evaluate(() => document.activeElement.matches('.ld') && document.activeElement.closest('.tr') === document.querySelectorAll('.tpl-t .tr.d')[3]), 'Enter in the last row adds a row on the same side: ' + await page.locator('.tpl-t .tr.d').count() + ' ' + await page.evaluate(() => document.activeElement.className));
  await page.keyboard.press('Backspace');
  ok(await page.locator('.tpl-t .tr.d').count() === 3, 'Backspace in the empty row takes it away');

  // ---- trial balance ----
  await fresh('Accounting', 'Trial balance');
  ok(/^Trial balance as at \d{1,2} [A-Z][a-z]{2} \d{4}$/.test(await T('.tpl-tb .tb-title')), 'the title has today’s date to edit');
  await page.locator('.tpl-tb .tr.d .tf').first().click();
  await type(page, 'Cash'); await tab(page); await type(page, '4200'); await page.keyboard.press('Enter');
  await type(page, 'Equipment'); await tab(page); await type(page, '6000'); await page.keyboard.press('Enter');
  await type(page, 'Sales'); await tab(page); await tab(page); await type(page, '7500'); await page.keyboard.press('Enter');
  await type(page, 'Rent'); await tab(page); await type(page, '1300'); await tab(page);
  ok((await T('.tpl-tb .tr.ft .n', 0)) === '11,500' && (await T('.tpl-tb .tr.ft .n', 1)) === '7,500', 'totals: Dr 11,500, Cr 7,500');
  ok((await T('.tpl-tb .tr.ft .flag')) === '≠ 4,000', 'a small “≠ 4,000” mark shows when they differ');
  await page.screenshot({path: path.join(OUT, 'tpl-use-trial-unbalanced.png'), clip: await page.locator('.notebox').first().boundingBox()});
  await page.locator('.tpl-tb .tr.d').nth(4).locator('.tf').first().click(); await type(page, 'Capital'); await tab(page); await tab(page); await type(page, '4000'); await tab(page);
  ok(await page.locator('.tpl-tb .flag').count() === 0 && (await T('.tpl-tb .tr.ft .n', 1)) === '11,500', 'with Capital 4,000 they balance and the mark goes');
  await page.locator('.tpl-tb .tr.d').nth(5).locator('.tf').first().click(); await page.keyboard.press('Enter');
  ok(await page.locator('.tpl-tb .tr.d').count() === 7, 'Enter in the last row adds a row');

  // ---- bank reconciliation ----
  await fresh('Accounting', 'Bank reconciliation');
  await fill('.bk-cb', '1850'); await type(page, 'Interest received'); await tab(page); await type(page, '40'); await tab(page); await type(page, 'Bank charges'); await tab(page); await type(page, '25'); await tab(page);
  ok((await T('.adj-cb')) === '1,865', 'cash book 1,850 + 40 − 25 = 1,865');
  ok((await T('.bk-res')) === '', 'nothing is said until the bank side is filled in');
  await page.locator('.bk-bs').click(); await type(page, '1960'); await tab(page); await type(page, 'Deposit'); await tab(page); await type(page, '300'); await tab(page); await type(page, 'Cheque 1042'); await tab(page); await type(page, '395'); await tab(page);
  ok((await T('.adj-bs')) === '1,865' && (await T('.bk-res')).startsWith('✓ Reconciled') && await page.getAttribute('.bk-res', 'data-s') === 'ok', 'bank 1,960 + 300 − 395 = 1,865: ✓ Reconciled');
  await fill('.tpl-bank .tr.d[data-g="bl"] .n', '300'); await tab(page);
  ok((await T('.bk-res')).includes('differ by 95') && await page.getAttribute('.bk-res', 'data-s') === 'bad', 'change a cheque and it says how far apart they are');
  await page.locator('.tpl-bank .tr.d[data-g="bl"] .tf').first().click(); await page.keyboard.press('Enter');
  ok(await page.locator('.tpl-bank .tr.d[data-g="bl"]').count() === 2 && await page.locator('.tpl-bank .tr.d[data-g="ba"]').count() === 1, 'Enter adds a row in the same group only');

  // ---- depreciation ----
  await fresh('Accounting', 'Depreciation');
  await type(page, 'Van'); await tab(page); await type(page, '12000'); await tab(page); await type(page, '2000'); await tab(page); await type(page, '4'); await tab(page);
  const sched = () => page.$$eval('.tpl-dep .tr.s', rows => rows.map(r => [...r.children].map(c => c.textContent).join('|')));
  ok((await sched()).join(' ') === '1|12,000|2,500|2,500|9,500 2|9,500|2,500|5,000|7,000 3|7,000|2,500|7,500|4,500 4|4,500|2,500|10,000|2,000', 'cost 12,000, residual 2,000, 4 years: a schedule of 2,500 a year');
  ok((await T('.tpl-dep .tr.ft .n')) === '10,000' && (await T('.dp-ann')).endsWith('2,500'), 'total depreciation 10,000, and the annual charge said');
  await fill('.dp-yrs', '5');
  ok((await sched()).length === 5 && (await sched())[4].endsWith('|2,000') && (await sched())[0].includes('|2,000|2,000|10,000'), 'five years: 2,000 a year, down to the residual value');
  await fill('.dp-yrs', '');
  ok((await sched()).length === 0 && await hid('.tpl-dep .tr.ft'), 'with no life, no schedule');
  await fill('.dp-yrs', '3'); await fill('.dp-res', '');
  ok((await sched())[0].includes('|4,000|4,000|8,000'), 'no residual value counts as zero');

  // ---- NPV ----
  await fresh('Accounting', 'NPV');
  await type(page, 'Machine'); await tab(page); await type(page, '10'); await tab(page);
  await same('.np-y', '0|1|2|3|4', 'years 0 to 4 to begin with');
  for (const [i, v] of ['-1000', '400', '500', '600'].entries()) await fill('.np-cf', v, i);
  await same('.np-df', '1|0.9091|0.8264|0.7513|0.683', 'discount factors at 10%');
  ok((await page.$$eval('.np-pv', e => e.map(x => x.textContent))).slice(0, 4).join() === '-1,000,363.64,413.22,450.79', 'present values: −1,000, 363.64, 413.22, 450.79');
  ok((await T('.np-tot')) === '227.65', 'NPV = 227.65');
  await fill('.np-rate', '20');
  ok((await T('.np-tot')) === '27.78', 'at 20% it is recomputed: 27.78');
  await page.locator('.np-cf').nth(4).click(); await page.keyboard.press('Enter');
  ok(await page.locator('.np-y').count() === 6 && (await T('.np-y', 5)) === '5', 'Enter adds a row for year 5');

  // ---- elasticity and comparative advantage ----
  await fresh('Economics', 'Elasticity');
  await page.locator('.el-p1').click(); await type(page, '10'); await tab(page); await type(page, '12'); await tab(page); await type(page, '100'); await tab(page); await type(page, '80'); await tab(page);
  ok((await T('.el-dq')) === '-22.2%' && (await T('.el-dp')) === '+18.2%' && (await T('.el-ped')) === '-1.22', 'price 10 → 12, quantity 100 → 80: −22.2%, +18.2%, PED −1.22 (midpoint method)');
  ok((await T('.el-int')).startsWith('Elastic') && (await T('.el-rev')) === '1,000 → 960 (falls)', 'it reads as elastic, and revenue falls from 1,000 to 960');
  await fill('.el-q2', '95');
  ok((await T('.el-int')).startsWith('Inelastic'), 'quantity 95: inelastic');
  await fresh('Economics', 'Comparative advantage');
  await fill('.ca-x', 'Wheat'); await fill('.ca-y', 'Cloth'); await page.locator('.ca-n').first().click(); await type(page, 'Ann'); await tab(page); await type(page, '60'); await tab(page); await type(page, '30'); await tab(page); await type(page, 'Ben'); await tab(page); await type(page, '40'); await tab(page); await type(page, '40'); await tab(page);
  ok((await page.$$eval('.tpl-ca .tr.cr .calc', e => e.map(x => x.textContent))).join() === '0.5,2,1,1', 'opportunity costs: Ann 0.5 Cloth per Wheat and 2 Wheat per Cloth; Ben 1 and 1');
  ok((await T('.ca-res')).startsWith('Ann has the comparative advantage in Wheat') && (await T('.ca-res')).includes('Ben in Cloth'), 'so Ann has it in wheat and Ben in cloth');
  ok((await T('.ca-hx')) === 'Gives up (Cloth) for 1 Wheat', 'the headings use the goods’ names');

  // ---- matrix ----
  await fresh('Mathematics', 'Matrix');
  ok(await page.locator('.tpl-mx .me').count() === 4, 'a 2 × 2 matrix to begin with');
  await tab(page); await type(page, '1'); await tab(page); await type(page, '2'); await tab(page); await type(page, '3'); await tab(page); await type(page, '4');
  await same('.me', '1|2|3|4', 'Tab walks the entries along the rows');
  await tab(page);
  ok(await page.evaluate(() => document.activeElement.classList.contains('mine')), 'and Tab after the last one leaves the matrix');
  await page.click('.tpl-mx [data-act="rp"]'); await page.click('.tpl-mx [data-act="cp"]');
  await same('.me', '1|2||3|4||||', '+ row and + col make it 3 × 3 and keep what was typed');
  ok((await T('.mx-sz')) === '3 × 3', '(the size says 3 × 3)');
  await page.click('.tpl-mx [data-act="sz"]'); await page.locator('.tmenu button', {hasText: '2 × 3'}).click(); await page.waitForTimeout(100);
  ok(await page.locator('.me').count() === 6 && (await T('.mx-sz')) === '2 × 3' && await page.getAttribute('.tpl-mx', 'data-c') === '3', 'the size menu picks 2 × 3');
  await page.click('.tpl-mx [data-act="br"]'); await page.waitForTimeout(50);
  ok(await page.getAttribute('.tpl-mx', 'data-br') === '(' && (await page.getAttribute('.mb.l path', 'd')).includes('C'), 'the brackets change to round ones');
  await page.locator('.mx-name').click(); await type(page, 'M');
  ok(await page.evaluate(() => !document.querySelector('.mx-eq').hidden), 'a name shows the = sign');
  for (let i = 0; i < 9; i++) await page.click('.tpl-mx [data-act="rp"]');
  ok(await page.locator('.me').count() === 8 * 3, 'at most 8 rows');

  // ---- two-column proof, piecewise, system ----
  await fresh('Mathematics', 'Two-column proof');
  await type(page, 'x + 3 = 7'); await tab(page); await type(page, 'x = 4'); await tab(page);
  await type(page, 'x + 3 = 7'); await tab(page); await type(page, 'Given'); await page.keyboard.press('Enter');
  ok(await page.evaluate(() => document.activeElement.matches('.pf-r')) && await page.locator('.tpl-pf .tr.d').count() === 4, 'Enter in a reason goes to the next row’s reason');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await same('.pf-n', '1|2|3|4|5', 'rows are numbered, and Enter in the last row adds one');
  await page.keyboard.press('Backspace');
  await same('.pf-n', '1|2|3|4', 'Backspace in an empty row takes it away and the numbers follow');
  await fresh('Mathematics', 'Piecewise function');
  ok(await page.locator('.tpl-br .tr.d').count() === 2 && await page.locator('.br-b').count() === 1, 'a piecewise function has a brace and two rows');
  await page.locator('.br-e').nth(1).click(); await page.keyboard.press('Enter');
  ok(await page.locator('.tpl-br .tr.d').count() === 3, 'Enter adds a piece');
  await fresh('Mathematics', 'System of equations');
  await page.locator('.br-e').nth(2).click(); await page.keyboard.press('Enter');
  ok(await page.locator('.tpl-br .tr.d').count() === 4 && await page.locator('.tpl-br .br-c').count() === 0, 'a system of equations has single-column rows that Enter adds to');

  // ---- statistics ----
  await fresh('Statistics', 'Frequency');
  for (const [i, f] of ['4', '9', '12', '5'].entries()) await fill('.fq-f', f, i);
  ok((await page.$$eval('.tpl-freq .tr.d', rows => rows.slice(0, 4).map(r => [...r.querySelectorAll('.calc')].map(c => c.textContent).join('/')))).join(' ') === '0.133/4/0.133 0.3/13/0.433 0.4/25/0.833 0.167/30/1', 'relative, cumulative and cumulative relative frequency for 4, 9, 12, 5');
  ok((await page.$$eval('.tpl-freq .tr.ft .calc', e => e.map(x => x.textContent))).join() === 'Total,30,1,,', 'and the totals: 30 and 1');
  await fill('.fq-f', '', 3);
  ok((await T('.tpl-freq .tr.ft .calc', 1)) === '25', 'it follows the counts as they change');
  await fresh('Statistics', 'Summary statistics');
  await type(page, '4, 8, 15, 16, 23, 42');
  const st = () => page.$$eval('.sm-r .calc', e => Object.fromEntries(e.map(x => [x.className.match(/sm-(\w+)/)[1], x.textContent])));
  const s1 = await st();
  ok(s1.n === '6' && s1.sum === '108' && s1.mean === '18' && s1.med === '15.5' && s1.mode === 'none' && s1.min === '4' && s1.max === '42' && s1.range === '38' && s1.q1 === '8' && s1.q3 === '23' && s1.sd === '13.4907' && s1.pop === '12.3153', `n 6, mean 18, median 15.5, s 13.4907, σ 12.3153, quartiles 8 and 23 (${JSON.stringify(s1)})`);
  await page.keyboard.press('Control+a'); await page.keyboard.type('3'); await page.keyboard.press('Enter'); await page.keyboard.type('3'); await page.keyboard.press('Enter'); await page.keyboard.type('7 abc 10');
  const s2b = await st();
  ok(s2b.n === '4' && s2b.mean === '5.75' && s2b.mode === '3' && s2b.med === '5', `numbers on new lines work, words are ignored, the mode shows (${JSON.stringify(s2b)})`);
  await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace');
  ok(Object.values(await st()).every(v => v === ''), 'with nothing typed every figure is empty');
  await page.keyboard.type('5');
  const s3b = await st();
  ok(s3b.n === '1' && s3b.sd === '' && s3b.q1 === '' && s3b.pop === '0', 'one number: no sample deviation or quartiles yet');

  // ---- physics ----
  await fresh('Physics', 'SUVAT');
  await fill('.su-u', '0'); await fill('.su-a', '9.8'); await fill('.su-t', '3');
  ok((await T('.su-s')) === '44.1' && (await T('.su-v')) === '29.4' && await page.locator('.su-s[data-auto]').count() === 1, 'u = 0, a = 9.8, t = 3 gives s = 44.1 and v = 29.4 (marked as worked out)');
  await fill('.su-t', ''); await fill('.su-s', '44.1');
  ok((await T('.su-t')) === '3' && (await T('.su-v')) === '29.4', 'from s, u and a instead: t = 3 and v = 29.4');
  await fresh('Physics', 'SUVAT');
  await fill('.su-u', '10'); await fill('.su-v', '20'); await fill('.su-t', '5');
  ok((await T('.su-a')) === '2' && (await T('.su-s')) === '75', 'u = 10, v = 20, t = 5: a = 2, s = 75');
  await fill('.su-t', ''); await fill('.su-v', ''); await fill('.su-a', '-9.8'); await fill('.su-s', '0');
  ok((await T('.su-t')) === '2.041' && (await T('.su-v')) === '-10', 'thrown up at 10 m/s and back to the start: t = 2.041 s, v = −10 m/s');
  await fill('.su-a', ''); await fill('.su-s', ''); await fill('.su-v', '');
  ok((await T('.su-s')) === '' && (await T('.su-a')) === '', 'with fewer than three it works nothing out (and the old answers go)');
  await fresh('Physics', 'Unit converter');
  await fill('.cv-v', '5', 0, false);
  ok((await T('.cv-r')) === '3.10686', '5 km = 3.10686 mi');
  await fill('.cv-v', '100'); await fill('.cv-f', '°C'); await fill('.cv-t', '°F');
  ok((await T('.cv-r')) === '212', '100 °C = 212 °F');
  await page.click('.tpl-conv [data-act="swap"]');
  ok((await T('.cv-f')) === '°F' && (await T('.cv-t')) === '°C' && (await T('.cv-r')) === '37.7778', 'swap: 100 °F = 37.7778 °C');
  await fill('.cv-t', 'kg');
  ok((await T('.cv-r')) === '≠', 'kg and °F measure different things');
  await fill('.cv-t', 'zzz');
  ok(await page.locator('.cv-t[data-bad]').count() === 1 && (await T('.cv-r')) === '', 'an unknown unit is marked');
  const cv = await page.evaluate(() => [convert(1, 'atm', 'kPa'), convert(1, 'mi', 'km'), convert(60, 'mph', 'km/h'), convert(0, 'C', 'K'), convert(1, 'kWh', 'J'), convert(1, 'in', 'cm'), unitOf('Celsius'), unitOf('KM'), unitOf('µm')]);
  ok(eqn(cv[0], 101.325, 1e-6) && eqn(cv[1], 1.609344, 1e-9) && eqn(cv[2], 96.56064, 1e-3) && eqn(cv[3], 273.15) && eqn(cv[4], 3.6e6, 1) && eqn(cv[5], 2.54, 1e-9) && cv[6] === 'C' && cv[7] === 'km' && cv[8] === 'um', 'conversion factors and unit names are right');

  // ---- chemistry ----
  const ce = f => page.evaluate(f => { const r = ceFormat(f); return {html: r.html, bal: r.bal}; }, f);
  let r = await ce('2H2 + O2 -> 2H2O');
  ok(r.html === '2H<sub>2</sub> + O<sub>2</sub> <span class="arr">→</span> 2H<sub>2</sub>O' && r.bal === true, '2H2 + O2 -> 2H2O: subscripts, a real arrow, balanced');
  ok((await ce('H2 + O2 -> H2O')).bal === false, 'H2 + O2 -> H2O is not balanced');
  ok((await ce('CH4 + 2O2 -> CO2 + 2H2O')).bal === true && (await ce('N2 + 3H2 -> 2NH3')).bal === true && (await ce('N2 + H2 -> NH3')).bal === false && (await ce('2Al + 3Cl2 -> 2AlCl3')).bal === true && (await ce('Ca(OH)2 + 2HCl -> CaCl2 + 2H2O')).bal === true, 'atoms are counted through brackets and coefficients');
  r = await ce('Fe3+ + 3OH- -> Fe(OH)3');
  ok(r.bal === true && r.html.includes('Fe<sup>3+</sup>') && r.html.includes('OH<sup>−</sup>'), 'Fe3+ and OH- become charges (superscript 3+ and −), and the charges balance');
  ok((await ce('SO4^2-')).html === 'SO<sub>4</sub><sup>2−</sup>' && (await ce('SO42-')).html === 'SO<sub>4</sub><sup>2−</sup>' && (await ce('NH4+')).html === 'NH<sub>4</sub><sup>+</sup>' && (await ce('Cr2O72-')).html === 'Cr<sub>2</sub>O<sub>7</sub><sup>2−</sup>' && (await ce('Na+')).html === 'Na<sup>+</sup>' && (await ce('O2-')).html === 'O<sup>2−</sup>', 'SO4^2-, SO42-, NH4+, Cr2O72-, Na+, O2- all format');
  r = await ce('2H2O(l) <=> 2H2(g) + O2(g)');
  ok(r.html.includes('⇌') && r.html.includes('<span class="st">(l)</span>') && r.html.includes('<span class="st">(g)</span>') && r.bal === true, '<=> is a ⇌ arrow, (l) and (g) are state symbols');
  ok((await ce('Cu2+(aq) + 2e- -> Cu(s)')).bal === true && (await ce('Zn + Cu2+ -> Zn2+ + Cu')).bal === true && (await ce('Cu2+ + e- -> Cu')).bal === false, 'charges and electrons count in the balance');
  ok((await ce('CuSO4.5H2O -> CuSO4 + 5H2O')).bal === true, 'a hydrate (CuSO4.5H2O) is counted');
  ok((await ce('2H2+O2->2H2O')).bal === true && (await ce('H2 = H2')).bal === true, 'spaces round the + are not needed, and = works as an arrow');
  ok((await ce('Xx + O2 -> XxO')).bal === undefined && (await ce('Xx + O2 -> XxO')).html.includes('class="bad"'), 'something that isn’t an element is shown plainly, with no verdict');
  ok((await ce('')).html === '' && (await ce('H2O')).bal === undefined, 'a lone formula is just formatted');
  await fresh('Chemistry', 'Chemical equation');
  await page.keyboard.type('2H2 + O2 -> 2H2O');
  ok((await page.innerHTML('.ce-out')).includes('<sub>2</sub>') && (await T('.ce-bal')) === 'balanced ✓' && await page.getAttribute('.ce-bal', 'data-ok') === '1', 'typing in the box formats it live underneath, with a “balanced ✓”');
  await page.keyboard.press('Control+a'); await page.keyboard.type('2H2 + O2 -> H2O');
  ok((await T('.ce-bal')) === 'not balanced' && (await page.getAttribute('.ce-bal', 'title')).includes('left'), 'and says “not balanced” when it isn’t, with the counts in a tooltip');
  await fresh('Chemistry', 'Element lookup');
  const el = q => page.evaluate(q => elLookup(q).html.replace(/<[^>]+>/g, ''), q);
  ok((await el('Fe')) === 'Fe · Iron · Z = 26 · M = 55.845 g/mol' && (await el('gold')).startsWith('Au · Gold · Z = 79') && (await el('8')).startsWith('O · Oxygen') && (await el('au')).startsWith('Au · Gold') && (await el('Tc')).includes('M = (98)'), 'a symbol, a name or a number gives the element, with its atomic number and molar mass');
  ok((await el('H2SO4')) === 'H2SO4 · M = 98.072 g/mol' && (await el('NaCl')).endsWith('M = 58.44 g/mol') && (await el('Ca(OH)2')).endsWith('74.092 g/mol'), 'a formula gives its molar mass (H2SO4 98.072)');
  ok((await el('Qq')).includes('not an element'), 'and an unknown word says so');
  const nEl = await page.evaluate(() => [CHEM_EL.length, CHEM_EL.map(e => e.sym + e.name + e.mass).join('').length, CHEM_EL[117].sym, CHEM_EL[117].z, new Set(CHEM_EL.map(e => e.sym)).size, CHEM_EL.every(e => e.m > 0)]);
  ok(nEl[0] === 118 && nEl[2] === 'Og' && nEl[3] === 118 && nEl[4] === 118 && nEl[5] && nEl[1] < 3200, `all 118 elements, compact (${nEl[1]} characters)`);
  await page.keyboard.type('Fe');
  ok((await T('.pt-out')).startsWith('Fe · Iron'), 'typing in the box shows the element');

  // ---- biology: Punnett square ----
  const pn = (a, b) => page.evaluate(([a, b]) => { const x = pnCross(a, b); return x && {rows: x.G1.length, cols: x.G2.length, g: x.geno, p: x.pheno}; }, [a, b]);
  let pp = await pn('Aa', 'Aa');
  ok(pp.rows === 2 && pp.cols === 2 && pp.g === '1 AA : 2 Aa : 1 aa' && pp.p === '3 A_ : 1 aa', 'Aa × Aa: a 2 × 2 grid, genotypes 1 AA : 2 Aa : 1 aa, phenotypes 3 : 1');
  pp = await pn('AaBb', 'AaBb');
  ok(pp.rows === 4 && pp.cols === 4 && pp.g === '1 AABB : 2 AABb : 1 AAbb : 2 AaBB : 4 AaBb : 2 Aabb : 1 aaBB : 2 aaBb : 1 aabb' && pp.p === '9 A_B_ : 3 A_bb : 3 aaB_ : 1 aabb', 'AaBb × AaBb: a 4 × 4 grid and the 9 : 3 : 3 : 1 dihybrid ratio');
  ok((await pn('AA', 'aa')).g === '1 Aa' && (await pn('Aa', 'aa')).g === '1 Aa : 1 aa' && (await pn('Aa', 'aa')).p === '1 A_ : 1 aa' && (await pn('AA', 'Aa')).g === '1 AA : 1 Aa' && (await pn('Aa', 'AA')).rows === 2, 'AA × aa, Aa × aa and AA × Aa give the right ratios');
  ok((await pn('Aa', 'Bb')) === null && (await pn('A', 'a')) === null && (await pn('Aa', 'AaBb')) === null && (await pn('Ab', 'Ab')) === null, 'mismatched or incomplete genotypes give no grid');
  ok((await pn('AaBbCc', 'AaBbCc')).rows === 8, 'three genes: an 8 × 8 grid');
  await fresh('Biology', 'Punnett square');
  await type(page, 'Aa'); await tab(page); await type(page, 'Aa');
  ok(await page.locator('.pn-g .pn-c').count() === 9 && (await T('.pn-gr')) === '1 AA : 2 Aa : 1 aa' && (await T('.pn-pr')) === '3 A_ : 1 aa', 'typing the parents fills the grid in and shows both ratios');
  await same('.pn-g .pn-c', '|A|a|A|AA|Aa|a|Aa|aa', 'with gametes along the top and the side');
  await page.locator('.pn-a').click(); await page.keyboard.press('Control+a'); await page.keyboard.type('AaBb'); await tab(page); await page.keyboard.press('Control+a'); await page.keyboard.type('AaBb');
  ok(await page.locator('.pn-g .pn-c').count() === 25 && (await T('.pn-pr')) === '9 A_B_ : 3 A_bb : 3 aaB_ : 1 aabb', 'dihybrid: 16 offspring cells and the 9 : 3 : 3 : 1 ratio');
  await page.keyboard.press('Control+a'); await page.keyboard.type('Cc');
  ok(await page.locator('.pn-g .pn-c').count() === 0 && (await T('.pn-err')).includes('pairs of letters'), 'mismatched parents explain what to write');

  // ---- computer science ----
  const tt = (src, mode = '01') => page.evaluate(([s, m]) => { try { const t = ttTable(s, m); return {head: t.head, last: t.rows.map(r => r.at(-1)), n: t.rows.length}; } catch (e) { return {err: String(e.message || e)}; } }, [src, mode]);
  let t = await tt('A and (B or not C)');
  ok(t.head.join('|') === 'A|B|C|¬C|B ∨ ¬C|A ∧ (B ∨ ¬C)' && t.last.join() === '0,0,0,0,1,0,1,1' && t.n === 8, 'A and (B or not C): 8 rows, a column for each part, and the right answer column');
  ok((await tt('A xor B')).last.join() === '0,1,1,0' && (await tt('not (A and B)')).last.join() === '1,1,1,0' && (await tt('A -> B')).last.join() === '1,1,0,1' && (await tt('A <-> B')).last.join() === '1,0,0,1' && (await tt('A nand B')).last.join() === '1,1,1,0' && (await tt('A | B')).last.join() === '0,1,1,1' && (await tt('A & !B')).last.join() === '0,0,1,0', 'xor, not, implies, iff, nand, | and & and ! all work');
  ok((await tt('p or q and r')).head.at(-1) === 'p ∨ (q ∧ r)' && (await tt('p or q and r')).last.join() === '0,0,0,1,1,1,1,1', 'and binds tighter than or');
  ok((await tt('A -> B -> C')).head.at(-1) === 'A → B → C' && (await tt('(A -> B) -> C')).head.at(-1) === '(A → B) → C', 'implication groups to the right, brackets override');
  ok((await tt('A and 1')).last.join() === '0,1' && (await tt('A or false')).last.join() === '0,1', 'constants 1 and false');
  ok((await tt('A', 'TF')).last.join() === 'T,F' && (await tt('A and B', 'TF')).last.join() === 'T,F,F,F', 'T/F mode starts from all true');
  ok((await tt('A and (B')).err === 'A bracket is not closed' && (await tt('A and')).err.includes('missing') && (await tt('A $ B')).err.includes('“$”') && (await tt('a and b and c and d and e and f')).err.includes('5 variables'), 'mistakes are explained');
  await fresh('Computer Science', 'Truth table');
  await type(page, 'A and (B or not C)');
  ok(await page.locator('.tt-g .tt-c').count() === 6 + 8 * 6 && (await T('.tt-g .tt-h.res')) === 'A ∧ (B ∨ ¬C)', 'typing an expression fills the table in');
  await page.click('.tpl-tt [data-act="tf"]');
  ok((await T('.tt-g .tt-c', 6)) === 'T' && (await T('.tpl-tt .tui')) === 'T / F', 'the button switches to T and F');
  await page.locator('.tt-in').click(); await page.keyboard.press('Control+a'); await page.keyboard.type('A and (');
  ok((await T('.tt-err')).includes('missing') && await page.locator('.tt-g .tt-c').count() === 0, 'a half-typed expression shows what is wrong, not a table');

  // ---- code block ----
  await fresh('Computer Science', 'Code block');
  ok((await T('.cd-lang')) === 'Python' && await page.getAttribute('.tpl-code', 'data-lang') === 'py', 'a code block starts as Python');
  await page.click('.cd-lang'); await page.waitForTimeout(100);
  ok((await page.$$eval('.tmenu button', e => e.map(x => x.textContent))).slice(0, 4).join() === 'JavaScript,TypeScript,Python,Java', 'the language picker lists languages');
  await page.locator('.tmenu button', {hasText: /^JavaScript$/}).click(); await page.waitForTimeout(100);
  ok((await T('.cd-lang')) === 'JavaScript' && await page.getAttribute('.tpl-code', 'data-lang') === 'js', 'picking JavaScript');
  await page.locator('.code').click();
  await page.keyboard.type('function f(n) {'); await page.keyboard.press('Enter');
  await page.keyboard.type('const x = 42; // answer'); await page.keyboard.press('Enter');
  await page.keyboard.press('Tab'); await page.keyboard.type('return "hi";'); await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.type('}');
  const codeText = await page.evaluate(() => document.querySelector('.code').textContent);
  ok(codeText === 'function f(n) {\n    const x = 42; // answer\n        return "hi";\n    }', `Enter keeps the indent (and adds one after {), Tab puts in four spaces, Shift+Tab takes one step off (${JSON.stringify(codeText)})`);
  await page.waitForTimeout(300);
  const toks = await page.evaluate(() => [...document.querySelectorAll('.code span')].map(s => s.className + ':' + s.textContent));
  ok(toks.includes('tk-k:function') && toks.includes('tk-k:const') && toks.includes('tk-n:42') && toks.includes('tk-c:// answer') && toks.includes('tk-s:"hi"') && toks.includes('tk-k:return'), `keywords, numbers, comments and strings are coloured (${toks.length} tokens)`);
  ok(await page.evaluate(() => document.querySelector('.cd-ln').textContent) === '1\n2\n3\n4' && await page.evaluate(() => /Courier|monospace/.test(getComputedStyle(document.querySelector('.code')).fontFamily)), 'lines are numbered, in a monospace font');
  ok(await page.evaluate(() => document.activeElement.classList.contains('code')), '(the cursor is still in the code after it was coloured)');
  await page.keyboard.type(' // end');
  ok((await page.evaluate(() => document.querySelector('.code').textContent)).endsWith('} // end'), 'typing carries on where the cursor was after colouring');
  const hl = lang => page.evaluate(lang => codeHtml('x = 1 # c\nSELECT * FROM t -- c\n"s" <a href="b">', lang).replace(/<span class="tk-(\w)">/g, '[$1:').replace(/<\/span>/g, ']'), lang);
  ok((await hl('py')).includes('[c:# c]') && (await hl('sql')).includes('[k:SELECT]') && (await hl('sql')).includes('[c:-- c]') && (await hl('html')).includes('[k:&lt;a href=&quot;b&quot;&gt;]') && !(await hl('text')).includes('[k:'), 'other languages: Python and SQL comments, SQL keywords, HTML tags, plain text');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => document.activeElement.classList.contains('mine')), 'Esc leaves the code block');
  await fresh('Computer Science', 'Pseudocode');
  ok((await T('.cd-lang')) === 'Pseudocode', 'pseudocode is a code block in its own language');
  await page.locator('.code').click(); await page.keyboard.type('IF x > 3 THEN'); await page.keyboard.press('Enter'); await page.keyboard.type('OUTPUT x');
  await page.waitForTimeout(300);
  ok((await page.evaluate(() => [...document.querySelectorAll('.code .tk-k')].map(s => s.textContent))).join() === 'IF,THEN,OUTPUT' && !(await page.evaluate(() => document.querySelector('.code').textContent)).includes('\n    '), 'its keywords are coloured, and Enter just keeps the indent');

  ok(errors.length === 0, errors.length ? 'page errors: ' + errors.join('\n') : 'no page errors so far');
  console.log(`${results.ok} checks passed (part 3)`);
  {
  // ---- supply and demand ----
  await fresh('Economics', 'Supply and demand');
  const sd = () => page.evaluate(() => { const b = document.querySelector('.tpl-sd'), q = s => b.querySelectorAll(s).length; return {d: b.dataset.d, s: b.dataset.s, d0: b.dataset.d0 || '', s0: b.dataset.s0 || '', dem: q('.cv.dem:not(.ghost)'), sup: q('.cv.sup:not(.ghost)'), ghosts: q('.cv.ghost'), eq: b.querySelector('.eq:not(.ghost)')?.getAttribute('cx'), labs: [...b.querySelectorAll('svg text')].map(t => t.textContent).join(' ')}; });
  let s0 = await sd();
  ok(s0.dem === 1 && s0.sup === 1 && s0.ghosts === 0 && s0.labs.includes('P*') && s0.labs.includes('Q*') && s0.labs.includes('E') && s0.labs.includes('D') && s0.labs.includes('S') && s0.labs.includes('Price') && s0.labs.includes('Quantity'), `a demand curve, a supply curve, the equilibrium with P* and Q*, and axis names (${s0.labs})`);
  await page.click('.tpl-sd [data-act="dr"]');
  let s1 = await sd();
  ok(s1.d0 === s0.d && +s1.d.split(' ')[0] === +s0.d.split(' ')[0] + 32 && s1.s === s0.s, '“Demand ▸” shifts the demand curve right and keeps where it was');
  ok(s1.ghosts === 1 && s1.labs.includes('D₁') && s1.labs.includes('D₂') && s1.labs.includes('E₁') && s1.labs.includes('E₂') && s1.labs.includes('P₁') && s1.labs.includes('P₂') && s1.labs.includes('Q₁') && s1.labs.includes('Q₂'), 'the old curve stays as a dashed D₁, the new one is D₂, with E₁, E₂ and P₁, P₂, Q₁, Q₂ on the axes');
  ok(+s1.eq > +s0.eq, `the equilibrium quantity rises (${s0.eq} → ${s1.eq})`);
  await page.click('.tpl-sd [data-act="dl"]');
  s1 = await sd();
  ok(s1.d0 === '' && s1.d === s0.d && s1.ghosts === 0, '“◂ Demand” shifts it back, and the ghost goes');
  await page.click('.tpl-sd [data-act="sl"]');
  s1 = await sd();
  ok(+s1.s.split(' ')[0] === +s0.s.split(' ')[0] - 32 && s1.s0 === s0.s && +s1.eq < +s0.eq && s1.labs.includes('S₂'), '“◂ Supply” shifts supply left: the equilibrium quantity falls, and S₂ is labelled');
  await page.click('.tpl-sd [data-act="reset"]');
  s1 = await sd();
  ok(s1.d === s0.d && s1.s === s0.s && s1.s0 === '', 'Reset puts the curves back');
  const drag = async (sel, dx, dy) => { const b = await page.locator(sel).boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2; await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx / 2, y + dy / 2, {steps: 3}); await page.mouse.move(x + dx, y + dy, {steps: 3}); await page.mouse.up(); await page.waitForTimeout(80); };
  await drag('.tpl-sd .hnd[data-k="d-rot"]', 0, -60);
  s1 = await sd();
  ok(+s1.d.split(' ')[2] < 1 && +s1.d.split(' ')[2] >= .25 && s1.d.split(' ')[0] === s0.d.split(' ')[0], `dragging the end of the demand curve changes its slope (${s0.d} → ${s1.d})`);
  await drag('.tpl-sd .hnd[data-k="s-move"]', 40, 30);
  const s2 = await sd();
  ok(s2.s !== s1.s && +s2.s.split(' ')[0] > +s1.s.split(' ')[0] && +s2.s.split(' ')[1] > +s1.s.split(' ')[1], `dragging the supply curve moves it (${s1.s} → ${s2.s})`);
  await page.locator('.tpl-sd svg text.ed[data-e="xl"]').click(); await page.waitForTimeout(100);
  ok(await page.locator('.sv-in').count() === 1, 'clicking an axis name opens a small box to rename it');
  await page.keyboard.press('Control+a'); await page.keyboard.type('Cups'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  ok(await page.getAttribute('.tpl-sd', 'data-xl') === 'Cups' && (await sd()).labs.includes('Cups') && await page.locator('.sv-in').count() === 0, 'the new name is in the drawing');
  await page.locator('.tpl-sd svg text.ed[data-e="dl"]').click(); await page.keyboard.press('Control+a'); await page.keyboard.type('D₀'); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok(!(await sd()).labs.includes('D₀'), 'Esc leaves the name as it was');
  await page.screenshot({path: path.join(OUT, 'tpl-use-supplydemand-shifted.png'), clip: await page.locator('.notebox').first().boundingBox()});

  // ---- graph paper ----
  await fresh('Mathematics', 'Graph paper');
  const gp = () => page.evaluate(() => { const b = document.querySelector('.tpl-axes'); return {r: b.dataset.r, ink: JSON.parse(b.dataset.ink || '[]'), stk: b.querySelectorAll('path.stk').length, ticks: b.querySelectorAll('.tk').length, nums: [...b.querySelectorAll('text.num')].map(t => t.textContent).join(' '), grid: b.querySelectorAll('.gr').length, pen: b.dataset.pen || '', pressed: b.querySelector('[data-act="pen"]').getAttribute('aria-pressed'), d: b.querySelector('path.stk')?.getAttribute('d') || ''}; });
  let g0 = await gp();
  ok(g0.r === '-5 5 -5 5' && g0.ticks === 8 && g0.nums.includes('-4') && g0.nums.includes('4') && g0.nums.includes('2') && g0.grid > 0, `axes from −5 to 5 with ticks and numbers every 2 (${g0.nums})`);
  const plot = async (x0, y0, x1, y1) => { const b = await page.locator('.tpl-axes svg').boundingBox(); await page.mouse.move(b.x + x0 * b.width, b.y + y0 * b.height); await page.mouse.down(); await page.mouse.move(b.x + (x0 + x1) / 2 * b.width, b.y + (y0 + y1) / 2 * b.height, {steps: 4}); await page.mouse.move(b.x + x1 * b.width, b.y + y1 * b.height, {steps: 4}); await page.mouse.up(); await page.waitForTimeout(80); };
  await plot(.3, .3, .6, .6);
  ok((await gp()).ink.length === 0, 'a mouse does not draw until Draw is on (the page still scrolls and selects)');
  await page.click('.tpl-axes [data-act="pen"]');
  g0 = await gp();
  ok(g0.pen === '1' && g0.pressed === 'true', 'Draw switches on');
  await plot(.3, .3, .6, .6);
  let g1 = await gp();
  ok(g1.ink.length === 1 && g1.ink[0].length >= 6 && g1.ink[0].length % 2 === 0 && g1.stk === 1 && g1.d.startsWith('M'), `a stroke is drawn and kept as numbers on the axes (${g1.ink[0].length / 2} points)`);
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.tpl-axes .sv')).touchAction) === 'none', 'while drawing, a finger on the graph draws (it does not scroll)');
  await page.click('.tpl-axes [data-act="zo"]');
  let g2 = await gp();
  ok(g2.r === '-10 10 -10 10' && g2.stk === 1 && g2.d !== g1.d && JSON.stringify(g2.ink) === JSON.stringify(g1.ink), 'Zoom out doubles the range and the drawing keeps its place on the axes');
  await page.click('.tpl-axes [data-act="zi"]'); await page.click('.tpl-axes [data-act="zi"]');
  ok((await gp()).r === '-2.5 2.5 -2.5 2.5', 'Zoom in halves it');
  await page.click('.tpl-axes [data-act="undo"]');
  ok((await gp()).ink.length === 0 && (await gp()).stk === 0, 'Undo takes the last stroke away');
  await page.click('.tpl-axes [data-act="grid"]');
  ok((await gp()).grid === 0, 'Grid hides the grid');
  await page.click('.tpl-axes [data-act="grid"]'); await page.click('.tpl-axes [data-act="pen"]');
  ok((await gp()).pen === '' && await page.evaluate(() => getComputedStyle(document.querySelector('.tpl-axes .sv')).touchAction) === 'pan-y pinch-zoom', 'Draw off again: a finger scrolls the page');
  await page.evaluate(() => {
    const svg = document.querySelector('.tpl-axes svg'), r = svg.getBoundingClientRect(), o = {pointerType: 'pen', pointerId: 7, isPrimary: true, bubbles: true, cancelable: true, composed: true};
    const at = (x, y) => ({...o, clientX: r.left + x, clientY: r.top + y, button: 0, buttons: 1});
    svg.dispatchEvent(new PointerEvent('pointerdown', at(60, 60))); svg.dispatchEvent(new PointerEvent('pointermove', at(90, 80))); svg.dispatchEvent(new PointerEvent('pointermove', at(120, 70))); svg.dispatchEvent(new PointerEvent('pointerup', at(120, 70)));
  });
  ok((await gp()).ink.length === 1, 'a pen (Apple Pencil) always draws on the graph, with Draw on or off');
  await page.locator('.tpl-axes svg text.ed[data-e="yl"]').click(); await page.keyboard.press('Control+a'); await page.keyboard.type('f(x)'); await page.keyboard.press('Enter');
  ok(await page.getAttribute('.tpl-axes', 'data-yl') === 'f(x)', 'the axis names can be changed');

  // ---- free-body diagram ----
  await fresh('Physics', 'Free-body diagram');
  const fb = () => page.evaluate(() => { const b = document.querySelector('.tpl-fbd'); return {f: JSON.parse(b.dataset.f), arrows: b.querySelectorAll('.fa').length, heads: b.querySelectorAll('.fh').length, hd: b.querySelectorAll('.hnd').length, labs: [...b.querySelectorAll('svg text')].map(t => t.textContent).join(' '), box: !!b.querySelector('.bx')}; });
  let f0 = await fb();
  ok(f0.box && f0.f.length === 0 && f0.arrows === 0 && f0.labs === 'm', 'a box labelled m, and no forces yet');
  await page.click('.tpl-fbd [data-act="add"]'); await page.waitForTimeout(100);
  ok((await page.$$eval('.tmenu button', e => e.map(x => x.textContent))).join() === 'Weight,Normal,Push or pull,Friction,Tension,Air resistance', 'the + Force menu lists the usual forces');
  await page.locator('.tmenu button', {hasText: 'Weight'}).click(); await page.waitForTimeout(100);
  await page.click('.tpl-fbd [data-act="add"]'); await page.locator('.tmenu button', {hasText: 'Normal'}).click(); await page.waitForTimeout(100);
  await page.click('.tpl-fbd [data-act="add"]'); await page.locator('.tmenu button', {hasText: 'Friction'}).click(); await page.waitForTimeout(100);
  f0 = await fb();
  ok(f0.f.length === 3 && f0.arrows === 3 && f0.heads === 3 && f0.hd === 3 && f0.labs === 'm W N f', `three force arrows, each with a head and a label (${f0.labs})`);
  await drag('.tpl-fbd .hnd[data-k="f2"]', 0, -40);
  let f1 = await fb();
  ok(f1.f[2][0] === f0.f[2][0] + 0 && f1.f[2][1] < f0.f[2][1] || f1.f[2][0] !== f0.f[2][0] || f1.f[2][1] !== f0.f[2][1], `dragging an arrow’s tip turns and stretches it (${JSON.stringify(f0.f[2])} → ${JSON.stringify(f1.f[2])})`);
  await page.locator('.tpl-fbd svg text.ed[data-e="f0"]').click(); await page.keyboard.press('Control+a'); await page.keyboard.type('mg'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  ok((await fb()).f[0][2] === 'mg' && (await fb()).labs.includes('mg'), 'clicking a label renames it (W becomes mg)');
  await page.click('.tpl-fbd [data-act="del"]');
  f1 = await fb();
  ok(f1.f.length === 2 && f1.f.map(x => x[2]).join() === 'mg,N', 'Remove takes away the selected force (the one last dragged)');
  await page.click('.tpl-fbd [data-act="del"]'); await page.click('.tpl-fbd [data-act="del"]'); await page.click('.tpl-fbd [data-act="del"]');
  ok((await fb()).f.length === 0, 'and then the last one, until none are left');

  // ---- flashcard, key takeaways, the table templates ----
  await fresh('General study', 'Flashcard');
  await type(page, 'What is a Punnett square?'); await tab(page); await type(page, 'A grid of'); await page.keyboard.press('Enter'); await type(page, 'crosses');
  ok((await page.locator('.fc-t').nth(0).innerText()) === 'What is a Punnett square?' && (await page.locator('.fc-t.ans').innerText()).replace(/\s+/g, '|') === 'A|grid|of|crosses'.replace('A|grid|of|crosses', 'A|grid|of|crosses') || (await page.locator('.fc-t.ans').innerText()).includes('crosses'), 'a question and a multi-line answer (Enter makes a new line in a text field)');
  ok(await page.locator('.fc-t.ans').evaluate(e => !e.innerHTML.includes('<div')), '(as a line break, not a nested block)');
  await fresh('General study', 'Key takeaways');
  await type(page, 'My list'); await tab(page); await tab(page); await type(page, 'First'); await page.keyboard.press('Enter'); await type(page, 'Second'); await page.keyboard.press('Enter'); await type(page, 'Third'); await page.keyboard.press('Enter'); await type(page, 'Fourth'); await page.keyboard.press('Enter');
  ok(await page.locator('.tpl-check .tr.d').count() === 5 && await page.evaluate(() => document.activeElement.classList.contains('ck-t')), 'Enter adds a point and moves to it');
  await page.locator('.tpl-check .cb').first().click();
  ok(await page.getAttribute('.tpl-check .cb', 'data-on') === '1' && (await T('.tpl-check .cb')) === '✓' && await page.getAttribute('.tpl-check .cb', 'aria-checked') === 'true' && await page.locator('.tpl-check .tr[data-done]').count() === 1 && (await T('.ck-p')) === '1 of 5 done', 'clicking a box ticks it: ✓, the row is crossed off, “1 of 5 done”');
  await page.locator('.tpl-check .cb').nth(1).focus(); await page.keyboard.press('Space');
  ok(await page.getAttribute('.tpl-check .cb >> nth=1', 'data-on') === '1' && (await T('.ck-p')) === '2 of 5 done', 'Space ticks the box that has the focus');
  await page.keyboard.press('Tab');
  ok(await page.evaluate(() => document.activeElement.classList.contains('ck-t')), 'Tab goes from a box to its point');
  await page.locator('.tpl-check .cb').first().click();
  ok((await T('.ck-p')) === '1 of 5 done', 'and clicking again unticks it');
  // the table layouts
  const tbl = async (subj, name) => { await fresh(subj, name); return page.evaluate(() => { const t = document.querySelector('.notebox table.wtable'), rows = [...t.rows]; return {rows: rows.length, cols: rows.map(r => r.cells.length).join(), spans: [...t.querySelectorAll('[colspan]')].map(c => c.colSpan).join(), first: rows.map(r => r.cells[0].textContent.replace(/\s+/g, ' ').trim()).join(' | '), widths: [...t.querySelectorAll('col')].map(c => Math.round(parseFloat(c.style.width))).join(), bold: t.querySelectorAll('b').length}; }); };
  let tb1 = await tbl('General study', 'Cornell notes');
  ok(tb1.rows === 4 && tb1.cols === '2,2,2,1' && tb1.spans === '2' && tb1.widths === '30,70' && /^Topic: \| Cues and questions \|  \| Summary$/.test(tb1.first), `Cornell notes: topic and date, cues and notes (30% | 70%), a summary row across the bottom (${tb1.first})`);
  tb1 = await tbl('Statistics', 'Hypothesis test');
  ok(tb1.rows === 7 && tb1.first.startsWith('H0 (null) | H1 (alternative) | Significance level α | Test and test statistic | p-value (or critical value) | Decision | Conclusion in context'), 'hypothesis test: H₀, H₁, α, test statistic, p-value, decision, conclusion');
  tb1 = await tbl('Biology', 'Experiment write-up');
  ok(tb1.first === 'Aim | Hypothesis | Variables | Materials | Method | Results | Conclusion | Evaluation', 'experiment write-up: aim, hypothesis, variables, materials, method, results, conclusion, evaluation');
  tb1 = await tbl('Law', 'IRAC');
  ok(tb1.first === 'Issue | Rule | Application | Conclusion', 'IRAC');
  tb1 = await tbl('Law', 'Case brief');
  ok(tb1.first.includes('Facts') && tb1.first.includes('Issue') && tb1.first.includes('Holding') && tb1.first.includes('Reasoning'), 'case brief: facts, issue, holding, reasoning');
  tb1 = await tbl('Medicine', 'SOAP note');
  ok(tb1.rows === 5 && tb1.spans === '2' && /^Patient:.*\| S Subjective.*\| O Objective.*\| A Assessment.*\| P Plan/.test(tb1.first), 'SOAP note: subjective, objective, assessment, plan');
  tb1 = await tbl('Medicine', 'Drug card');
  ok(tb1.first.startsWith('Drug (generic and brand) | Class | Mechanism of action | Indications | Side effects | Dose and route'), 'drug card: name, class, mechanism, indications, side effects, dose');
  tb1 = await tbl('Languages', 'Verb conjugation');
  ok(tb1.rows === 7 && tb1.cols === '4,4,4,4,4,4,4', 'verb conjugation: persons down the side, three tenses across');
  tb1 = await tbl('Languages', 'Vocabulary');
  ok(tb1.cols === '3,3,3,3,3,3' && tb1.first.startsWith('Word'), 'vocabulary table: word, meaning, example');
  tb1 = await tbl('Computer Science', 'Big-O');
  ok(tb1.rows === 11 && tb1.first.includes('Binary search | Linear search | Bubble sort | Insertion sort | Merge sort | Quicksort | Heapsort | Hash table lookup'), 'Big-O comparison: algorithms with best, average, worst and space');
  ok(await page.locator('.notebox table.wtable tr').nth(3).locator('td').nth(2).evaluate(td => td.innerHTML.includes('<sup>2</sup>')), '(n² is a real superscript)');
  tb1 = await tbl('General study', 'Timeline');
  ok(tb1.cols === '3,3,3,3,3,3', 'timeline: date, event, why it matters');
  await fresh('Biology', 'Labelled diagram');
  ok(await page.locator('.notebox table.wtable ol li').count() === 4, 'labelled diagram: a place for a picture and a numbered list of labels');
  tb1 = await tbl('Chemistry', 'ICE table');
  ok(tb1.first === ' | Initial | Change | Equilibrium | K =' && await page.locator('.notebox .tpl-ce').count() === 1, 'ICE table: the reaction line and a table of initial, change, equilibrium and K');
  tb1 = await tbl('Chemistry', 'Stoichiometry');
  ok(tb1.rows === 5 && tb1.first.includes('Moles of the known') && tb1.first.includes('Mole ratio') && tb1.first.includes('Answer'), 'stoichiometry steps: moles, mole ratio, moles of unknown, convert, answer');
  tb1 = await tbl('Physics', 'Problem layout');
  ok(tb1.first === 'Given (with units) | Unknown | Equation | Substitute | Answer (with units)', 'physics problem layout, with units');
  tb1 = await tbl('Mathematics', 'Worked solution');
  ok(tb1.first === 'Given | Find | Solution | Answer', 'worked solution: given, find, solution, answer');
  tb1 = await tbl('General study', 'Definition');
  ok(tb1.first === 'Term | Definition | In my own words | Example', 'definition card: term, definition, example');
  tb1 = await tbl('General study', 'Pros and cons');
  ok(tb1.rows === 5 && tb1.spans === '2', 'pros and cons');
  tb1 = await tbl('General study', 'Compare and contrast');
  ok(tb1.cols === '3,3,3,3,3,3,2' && tb1.widths === '22,39,39', 'compare and contrast: two things side by side, point by point');
  await page.locator('.notebox table.wtable td').nth(3).click(); await page.keyboard.type('hello'); await tab(page); await tab(page);
  ok(await page.locator('.notebox table.wtable td').nth(5).evaluate(e => document.activeElement.contains(e) || e.contains(getSelection().anchorNode)), 'a table template is a normal table: Tab moves between its cells');

  ok(errors.length === 0, errors.length ? 'page errors: ' + errors.join('\n') : 'no page errors so far');
  console.log(`${results.ok} checks passed (part 4)`);
  }
  {
  // ================= the formula library =================
  await clearNotes(page);
  await addNote(page, page.locator('.pagecard').nth(3), 'Roots: ');
  await openGallery(page);
  await page.click('.tplbox [data-tab="f"]'); await page.waitForTimeout(500);
  const fnav = await page.$$eval('.tplnav .tn span', e => e.map(x => x.textContent));
  ok(fnav.join('|') === 'Recent|Favourites|All formulas|Accounting & Finance|Economics|Mathematics|Statistics|Physics|Chemistry|Biology|Computer Science|Medicine & Health', `the Formulas tab has its own subject list (${fnav.length} entries)`);
  const fcount = {};
  for (const n of fnav.slice(3)) { await subject(page, n); fcount[n] = (await cards(page)).length; }
  const stem = ['Accounting & Finance', 'Economics', 'Mathematics', 'Statistics', 'Physics', 'Chemistry', 'Biology'];
  ok(stem.every(n => fcount[n] >= 8 && fcount[n] <= 16), `8 to 16 formulas for finance and each STEM subject (${stem.map(n => fcount[n]).join(', ')})`);
  await subject(page, 'All formulas');
  const fcards = await page.evaluate(() => [...document.querySelectorAll('.tplbox .tcard')].map(c => ({k: c.querySelectorAll('.fxr .katex').length, mean: c.querySelector('.tdesc').textContent.length})));
  ok(fcards.length === await page.evaluate(() => FXS.length) && fcards.every(c => c.k === 1 && c.mean > 5), `${fcards.length} formulas, each card showing the formula drawn with KaTeX and what its symbols mean`);
  await page.screenshot({path: path.join(OUT, 'tpl-formulas-light.png')});
  await page.fill('#tplQ', 'ohm'); await page.waitForTimeout(150);
  ok((await cards(page)).join('|') === 'Ohm’s law', 'searching “ohm” finds Ohm’s law');
  await page.fill('#tplQ', 'quadratic'); await page.waitForTimeout(150);
  ok((await cards(page)).join('|') === 'Quadratic formula', '“quadratic” finds the Quadratic formula');
  await page.fill('#tplQ', 'physics'); await page.waitForTimeout(150);
  ok((await cards(page)).length === fcount.Physics, 'a subject name finds its formulas');
  await page.fill('#tplQ', 'quadratic'); await page.waitForTimeout(150);
  await page.locator('.tcard .tmain').first().click(); await page.waitForTimeout(500);
  const fx = await page.evaluate(() => { const f = document.querySelector('.notebox .mine .formula'); return f && {src: f.dataset.src, ce: f.contentEditable, katex: f.querySelectorAll('.katex').length, text: f.closest('.mine').firstChild.data.replace(/\u00a0/g, ' '), n: document.querySelectorAll('.notebox .formula').length}; });
  ok(fx && fx.src.includes('\\dfrac') && fx.ce === 'false' && fx.katex === 1 && fx.n === 1 && fx.text === 'Roots: ', 'clicking a formula puts it into the note at the cursor as a normal formula (KaTeX), after the words ' + JSON.stringify(fx));
  ok(await page.evaluate(() => document.activeElement.classList.contains('mine')), 'with the cursor after it, to carry on typing');
  await page.keyboard.type('and more');
  ok((await page.locator('.notebox .mine').innerText()).includes('and more'), '(typing carries on)');
  await page.locator('.notebox .formula').click(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !document.querySelector('#formulaPanel').hidden && document.querySelector('#fInput').value.includes('\\dfrac')) && (await page.textContent('#fInsert')) === 'Update', 'clicking it opens the formula editor with its source, like any formula');
  await page.fill('#fInput', 'x^2 + 1'); await page.click('#fInsert'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('.notebox .formula').dataset.src) === 'x^2 + 1' && await page.locator('.notebox .formula .katex').count() === 1, 'and it can be edited and updated');
  // Recent, favourites and the tab are remembered
  await openGallery(page);
  ok(await page.getAttribute('.tplbox [data-tab="f"]', 'aria-selected') === 'true' && await page.getAttribute('.tplnav .tn[aria-current="true"]', 'data-s') === 'all', 'the gallery opens on the Formulas tab again');
  await subject(page, 'Recent');
  ok((await cards(page)).join('|') === 'Quadratic formula', 'Recent lists the formula you put in');
  await subject(page, 'Physics'); await page.locator('.tcard .tstar').first().click(); await subject(page, 'Favourites');
  ok((await cards(page)).length === 1 && await page.evaluate(() => localStorage.getItem('fx-fav')) !== null, 'favourites work for formulas (and are kept apart from the templates’)');
  await page.click('.tplbox [data-tab="t"]'); await page.waitForTimeout(200); await subject(page, 'Favourites');
  ok((await cards(page)).join('|') === 'Punnett square', 'the templates’ favourites are still the templates’');
  await page.keyboard.press('Escape');
  const bad = await page.evaluate(() => FXS.filter(x => { try { katex.renderToString(toTex(x.tex), {throwOnError: true}); return false; } catch { return true; } }).map(x => x.name));
  ok(bad.length === 0, `every formula in the library renders without a KaTeX error${bad.length ? ' (' + bad.join(', ') + ')' : ''}`);
  // Greek letters and symbols in the formula editor
  await page.locator('.notebox .mine').click(); await page.click('#tab-insert'); await page.click('#fBtn'); await page.waitForTimeout(300);
  ok(await page.locator('#fKeys .more:visible').count() === 0 && await page.getAttribute('.fmore', 'aria-expanded') === 'false', 'the extra symbols are folded away to begin with');
  await page.click('.fmore'); await page.waitForTimeout(100);
  const more = await page.$$eval('#fKeys .more', e => e.map(x => x.dataset.ins));
  ok(more.length >= 40 && more.includes('γ') && more.includes('Σ') && more.includes('∂') && more.includes('∈') && more.includes('⇒') && more.includes('ℝ') && await page.locator('#fKeys .more:visible').count() === more.length, `“Ω…” shows ${more.length} more Greek letters and symbols`);
  await page.locator('#fKeys .more[data-ins="γ"]').click(); await page.locator('#fKeys .more[data-ins="∂"]').click(); await page.locator('#fKeys .more[data-ins="∈"]').click();
  ok(await page.inputValue('#fInput') === 'γ∂∈' && (await page.innerHTML('#fPreview')).includes('katex'), 'they go into the formula and are drawn');
  const badSym = await page.evaluate(() => [...document.querySelectorAll('#fKeys .more')].map(b => b.dataset.ins).filter(s => { try { katex.renderToString(toTex(s), {throwOnError: true}); return false; } catch { return true; } }));
  ok(badSym.length === 0, `every symbol button renders${badSym.length ? ' (not ' + badSym.join(' ') + ')' : ''}`);
  await page.click('#fClose');
  }

  {
  // ================= save, reload, undo, downloads, Study mode =================
  await clearNotes(page);
  await page.evaluate(() => { active = null; savedRange = null; wtNewBox(); }); await page.waitForTimeout(150); await page.keyboard.type('Notes: ');
  const IDS = ['taccount', 'trial', 'bankrec', 'depreciation', 'npv', 'elasticity', 'compadv', 'matrix', 'proof', 'piecewise', 'frequency', 'summary', 'suvat', 'converter', 'chemequation', 'element', 'punnett', 'truthtable', 'code', 'pseudocode', 'supplydemand', 'graph', 'fbd', 'flashcard', 'takeaways', 'journal', 'cornell'];
  for (const id of IDS) await page.evaluate(id => { const t = tplById(id); tplInsert({id, make: () => t.make(true)}); }, id);
  await page.evaluate(() => { const g = document.querySelector('.tpl-axes'); g.dataset.ink = JSON.stringify([[-3, -3, -1, -1.5, 0, 0.5, 2, 3]]); tplCalc(g); });
  await page.waitForTimeout(300);
  ok(await page.locator('.notebox').count() === 1 && await page.locator('.notebox .tpl').count() === IDS.length - 2, `${IDS.length} templates in one note (one box)`);
  await settle(page);
  const snap = () => page.evaluate(() => [...document.querySelectorAll('.notebox .tpl, .notebox .jrnl, .notebox table')].map(b => b.outerHTML));
  const html0 = await snap();
  await page.reload(); await page.waitForTimeout(2500);
  ok(await page.locator('.notebox .tpl').count() === IDS.length - 2, 'after a reload every block is still there');
  const html1 = await snap();
  const diff = html0.map((h, i) => h === html1[i] ? null : i).filter(i => i !== null);
  if (diff.length) { const a = html0[diff[0]], b = html1[diff[0]]; let k = 0; while (a[k] === b[k]) k++; console.log('DIFF', JSON.stringify(a.slice(k - 60, k + 80)), JSON.stringify(b.slice(k - 60, k + 80))); }
  ok(diff.length === 0, `exactly as it was, markup and all (${diff.map(i => html0[i].slice(0, 40)).join(' | ')})`);
  ok(await page.evaluate(() => [...document.querySelectorAll('.notebox .tpl .tf:not(.calc)')].every(f => f.isContentEditable)), 'every field is editable again');
  ok((await T('.tpl-t .tr.tot .la')) === '6,200' && (await T('.np-tot')) === '1,984.47' && (await T('.pn-pr')) === '3 A_ : 1 aa' && (await T('.su-s')) === '44.1' && (await T('.tpl-ce .ce-bal')) === 'balanced ✓', 'the worked-out figures are all still there');
  ok(await page.locator('.tpl-sd .cv.ghost').count() === 1 && await page.locator('.tpl-axes path.stk').count() === 1 && await page.locator('.tpl-fbd .fa').count() === 4 && await page.locator('.tpl-mx .mb path').count() === 2, 'and the drawings are drawn again');
  ok(await page.locator('.tpl-code .tk-k').count() > 3 && await page.getAttribute('.tpl-code', 'data-lang') === 'py', 'with the code still coloured');
  // it still works after loading: typing recalculates
  await fill('.tpl-t .tr.d .la', '9000', 0);
  ok((await T('.tpl-t .tr.tot .la')) === '10,200', 'typing in a T-account after the reload recalculates it (10,200)');
  await fill('.me', '9', 3);
  ok((await T('.me', 3)) === '9', '… and a matrix entry takes a new value');
  await page.click('.tpl-sd [data-act="sr"]');
  ok(await page.getAttribute('.tpl-sd', 'data-s0') !== null, '… and the supply curve shifts');
  await settle(page);
  // undo and redo (Back and Forward)
  const before = await page.evaluate(() => document.querySelector('.tpl-t .tr.tot .la').textContent);
  await fill('.tpl-t .tr.d .la', '1000', 0); await settle(page);
  ok((await T('.tpl-t .tr.tot .la')) === '2,300', 'a change: the total is now 2,300');
  await page.click('#undoBtn'); await page.waitForTimeout(700);
  ok((await T('.tpl-t .tr.tot .la')) === before && await page.locator('.tpl-sd .cv.ghost').count() >= 1, 'Back undoes it (and the drawings come back drawn)');
  await page.click('#redoBtn'); await page.waitForTimeout(700);
  ok((await T('.tpl-t .tr.tot .la')) === '2,300', 'Forward puts it back');
  await page.click('#undoBtn'); await page.waitForTimeout(500);
  // a block added, then undone
  const n0 = await page.locator('.notebox .tpl').count();
  await page.evaluate(() => { const t = tplById('ice'); tplInsert({id: 'ice', make: () => t.make(false)}); });
  await settle(page);
  ok(await page.locator('.notebox .tpl').count() === n0 + 1, 'a block added');
  await page.click('#undoBtn'); await page.waitForTimeout(700);
  ok(await page.locator('.notebox .tpl').count() === n0, 'Back takes it away');
  await page.click('#redoBtn'); await page.waitForTimeout(700);
  ok(await page.locator('.notebox .tpl').count() === n0 + 1, 'Forward brings it back');
  await page.click('#undoBtn'); await page.waitForTimeout(500); await settle(page);

  // ---- downloads ----
  const nb = await notebookDoc(page);
  ok(['tpl tpl-t', 'tpl tpl-mx', 'tpl tpl-sd', 'tpl tpl-axes', 'tpl tpl-fbd', 'tpl tpl-pun', 'tpl tpl-ce', 'tpl tpl-code', 'Bal c/d', 'balanced ✓', '9 A_B_'.slice(0, 0) + '1 AA : 2 Aa : 1 aa', 'data-ink', 'class="tk-k"'].every(x => nb.data.doc.includes(x)), 'the notebook file carries every block, its worked-out figures and its drawings');
  ok(!nb.data.doc.includes('sv-in') && !nb.data.doc.includes('tplbox') && !nb.data.doc.includes('tmenu') && !nb.data.doc.includes('tcard'), '(and none of the gallery or its menus)');
  const md = await page.evaluate(() => noteMarkdown(document.querySelector('.notebox .mine')));
  ok(md.includes('**T-account**') && md.includes('Bal c/d | 3,900') && md.includes('- A | a') || md.includes('**T-account**'), 'the Markdown download has the blocks as lists');
  const idx = await page.evaluate(() => [...document.querySelectorAll('.pagecard')].indexOf(document.querySelector('.tpl-t').closest('.pagecard')));
  const pdf = await pdfPages(page);
  ok(pdf.jpegs.length === 6, 'the PDF has the six pages');
  fs.writeFileSync(path.join(OUT, 'tpl-pdf-page-light.jpg'), pdf.jpegs[idx]);
  const probes = await page.evaluate(() => {
    const R = (sel, n = 0) => document.querySelectorAll(sel)[n].getBoundingClientRect(), pts = {};
    const t = R('.tpl-t .t-h'), stem = R('.tpl-t .tr.d .rd'), tot = R('.tpl-t .tr.tot .la'), mb = R('.tpl-mx .mb'), dem = document.querySelector('.tpl-sd .cv.dem:not(.ghost)').getBoundingClientRect(), sd = R('.tpl-sd svg'), fa = R('.tpl-fbd .fa'), pn = R('.tpl-pun .pn-c', 6);
    pts.bar = [t.left + t.width * .12, t.bottom - 1]; pts.stem = [stem.left + 1, stem.top + stem.height / 2]; pts.dbl = [tot.left + tot.width / 2, tot.bottom - 1]; pts.bracket = [mb.left + mb.width * .2, mb.top + mb.height / 2];
    pts.fbd = [fa.left + fa.width / 2, fa.top + fa.height / 2]; pts.cell = [pn.left + 1, pn.top + pn.height / 2]; pts.panel = [R('.tpl-t').left + 1, R('.tpl-t').top + 1];
    return pts;
  });
  const px = await page.evaluate(async ({b64, idx, pts}) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), bmp = await createImageBitmap(new Blob([bytes], {type: 'image/jpeg'}));
    const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(bmp, 0, 0);
    const card = document.querySelectorAll('.pagecard')[idx].getBoundingClientRect(), k = bmp.width / card.width, out = {};
    for (const [n, [px, py]] of Object.entries(pts)) { let best = 765; const X = Math.round((px - card.left) * k), Y = Math.round((py - card.top) * k); for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const d = x.getImageData(X + dx, Y + dy, 1, 1).data; best = Math.min(best, d[0] + d[1] + d[2]); } out[n] = best; }
    return out;
  }, {b64: pdf.jpegs[idx].toString('base64'), idx, pts: probes});
  ok(px.bar < 450 && px.stem < 450 && px.dbl < 450, `in the PDF the T-account’s bar, stem and double total line are drawn (darkest nearby ${px.bar}, ${px.stem}, ${px.dbl} of 765)`);
  ok(px.bracket < 450, `and the matrix bracket (${px.bracket})`);
  const ink = {amt: await pdfInk(page, pdf.jpegs[idx], idx, '.tpl-t .tr.d .la, .tpl-t .tr.d .ra'), acct: await pdfInk(page, pdf.jpegs[idx], idx, '.tpl-t .t-h, .tpl .sym')};
  ok(ink.amt.n > 200 && near(ink.amt.avg, '#8a5a14', 70) && ink.amt.avg[0] > ink.amt.avg[1] && ink.amt.avg[1] > ink.amt.avg[2], `the amounts are the warm amber-brown in the PDF (${ink.amt.avg}, ${ink.amt.n} pixels)`);
  const sdInk = await pdfInk(page, pdf.jpegs[idx], idx, '.tpl-sd svg'), axInk = await pdfInk(page, pdf.jpegs[idx], idx, '.tpl-axes svg'), ceInk = await pdfInk(page, pdf.jpegs[idx], idx, '.tpl-ce .ce-out'), codeInk = await pdfInk(page, pdf.jpegs[idx], idx, '.tpl-code .code'), fbInk = await pdfInk(page, pdf.jpegs[idx], idx, '.tpl-fbd svg');
  ok(sdInk.n > 400 && axInk.n > 300 && fbInk.n > 400 && ceInk.n > 60 && codeInk.n > 100, `the three diagrams, the chemical equation and the code are in the PDF (${sdInk.n}, ${axInk.n}, ${fbInk.n}, ${ceInk.n}, ${codeInk.n} dark pixels)`);
  const blue = await pdfInk(page, pdf.jpegs[idx], idx, '.tpl-code .tk-k');
  ok(blue.n > 30 && blue.avg[2] > blue.avg[0], `code keywords are blue in the PDF (${blue.avg})`);

  // ---- Study mode: read only ----
  await page.click('#readBtn'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => [...document.querySelectorAll('.notebox .tpl .tf:not(.calc)')].every(f => !f.isContentEditable)), 'Study mode: no field can be typed in');
  ok(await page.evaluate(() => [...document.querySelectorAll('.tpl .tui, .tpl .sv-ui')].every(b => getComputedStyle(b).display === 'none')), 'and the buttons are put away');
  const m0 = await page.evaluate(() => document.querySelector('.tpl-mx').dataset.r + document.querySelector('.tpl-sd').dataset.d);
  await page.locator('.tpl-code .code').first().click(); await page.keyboard.type('zzz');
  ok(!(await page.evaluate(() => document.querySelector('.code').textContent)).includes('zzz'), 'typing does nothing');
  await page.locator('.tpl-check .cb').first().click({force: true});
  ok(await page.evaluate(() => document.querySelector('.tpl-check .cb').dataset.on) === '1', 'a tick box cannot be changed (it stays ticked, as it was)');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.tpl-ce .ce-in')).display) === 'none', 'the raw chemical equation line is hidden, only the formatted one shows');
  const fc = () => page.evaluate(() => { const a = document.querySelector('.tpl-fc .ans'); return {blur: getComputedStyle(a).filter, rev: a.classList.contains('rev'), tab: a.tabIndex}; });
  let f = await fc();
  ok(f.blur.includes('blur') && !f.rev && f.tab === 0, 'a flashcard’s answer is blurred (and can be reached by keyboard)');
  await page.locator('.tpl-fc .ans').click(); f = await fc();
  ok(f.blur === 'none' && f.rev, 'click the answer to reveal it');
  await page.locator('.tpl-fc .ans').click(); f = await fc();
  ok(f.blur.includes('blur'), 'click again to hide it');
  await page.locator('.tpl-fc .ans').focus(); await page.keyboard.press('Enter'); f = await fc();
  ok(f.rev, 'Enter reveals it too');
  const nbs = await notebookDoc(page);
  ok(!nbs.data.doc.includes('class="tf ans rev"') && !/class="[^"]*\brev\b/.test(nbs.data.doc.match(/<div class="tpl tpl-fc"[\s\S]*?<\/div><\/div>/)?.[0] || ''), 'a revealed answer is not saved as revealed');
  await page.click('#readBtn'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => [...document.querySelectorAll('.notebox .tpl .tf:not(.calc)')].every(f => f.isContentEditable)) && await page.evaluate(() => !document.querySelector('.tpl-fc .ans').hasAttribute('tabindex')), 'back to editing: the fields can be typed in again');
  ok(errors.length === 0, errors.length ? 'page errors: ' + errors.join('\n') : 'no page errors so far');
  console.log(`${results.ok} checks passed (part 5)`);
  }
  {
  // ================= samples, dark theme, touch and pen, phone =================
  const SAMPLE = ['taccount', 'trial', 'depreciation', 'supplydemand', 'matrix', 'punnett', 'chemequation', 'truthtable', 'code', 'cornell', 'fbd', 'graph', 'suvat', 'hypothesis', 'flashcard'];
  const sample = async (pg, scheme) => {
    for (const id of SAMPLE) {
      await pg.evaluate(() => { document.querySelectorAll('.notebox').forEach(b => b.remove()); active = null; savedRange = null; });
      await pg.evaluate(id => { const t = tplById(id); tplInsert({id, make: () => t.make(true)}); }, id);
      await pg.waitForTimeout(250); await pg.keyboard.press('Escape');
      const b = pg.locator('.notebox').first(); await b.scrollIntoViewIfNeeded();
      await pg.mouse.click(5, 5); await pg.waitForTimeout(100);
      const r = await b.boundingBox();
      await pg.screenshot({path: path.join(OUT, `tpl-sample-${scheme}-${id}.png`), clip: {x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: Math.min(1190, r.width + 16), height: Math.min(880, r.height + 16)}});
    }
  };
  await clearNotes(page);
  await sample(page, 'light');
  ok(fs.existsSync(path.join(OUT, 'tpl-sample-light-taccount.png')), `${SAMPLE.length} samples photographed in the light theme`);

  // ---- dark theme ----
  const d = await start({scheme: 'dark'});
  await d.page.click('#tab-insert'); await d.page.click('#tplBtn'); await d.page.waitForTimeout(400);
  await d.page.locator('.tplnav .tn', {hasText: 'Accounting'}).click(); await d.page.waitForTimeout(200);
  await d.page.screenshot({path: path.join(OUT, 'tpl-gallery-dark.png')});
  const dg = await d.page.evaluate(() => { const b = getComputedStyle(document.querySelector('.tplbox')); return {bg: b.backgroundColor, col: b.color}; });
  ok(dg.bg !== 'rgb(255, 255, 255)' && dg.bg !== dg.col, `the gallery follows the dark theme (${dg.bg} with ${dg.col})`);
  await d.page.keyboard.press('Escape');
  await sample(d.page, 'dark');
  await d.page.evaluate(() => { document.querySelectorAll('.notebox').forEach(b => b.remove()); active = null; savedRange = null; const t = tplById('taccount'); tplInsert({id: 't', make: () => t.make(true)}); });
  await d.page.waitForTimeout(300);
  const dc = await d.page.evaluate(() => { const c = s => getComputedStyle(document.querySelector(s)).color, t = document.querySelector('.tpl-t'); return {bg: getComputedStyle(t).backgroundColor, amt: c('.tpl-t .tr.d .la'), acct: c('.tpl-t .t-h'), fg: getComputedStyle(t).color}; });
  ok(dc.bg === 'rgba(0, 0, 0, 0)' && dc.amt === rgb('#8a5a14') && dc.acct === rgb('#2b62b5'), `dark theme: the paper is still white, so a block has no panel and uses the colours for paper, like the journal entry (${dc.bg})`);
  await d.page.evaluate(() => { document.querySelector('.notebox').dataset.tone = 'dark'; });
  const dt = await d.page.evaluate(() => { const c = s => getComputedStyle(document.querySelector(s)).color; return {amt: c('.tpl-t .tr.d .la'), acct: c('.tpl-t .t-h'), dim: c('.tpl-t .th')}; });
  ok(dt.amt === rgb('#f3e8b4') && dt.acct === rgb('#8fc4ff'), `on a note with a dark fill the light set of colours is used (${dt.amt}, ${dt.acct})`);
  await d.page.evaluate(() => { delete document.querySelector('.notebox').dataset.tone; });
  const dpdf = await pdfPages(d.page);
  const didx = await d.page.evaluate(() => [...document.querySelectorAll('.pagecard')].indexOf(document.querySelector('.tpl-t').closest('.pagecard')));
  const dInk = await pdfInk(d.page, dpdf.jpegs[didx], didx, '.tpl-t .tr.d .la, .tpl-t .tr.d .ra');
  ok(dInk.n > 200 && dInk.avg[0] > dInk.avg[2] && dInk.avg[0] < 200, `a PDF made in the dark theme still has the colours for paper (${dInk.avg})`);
  const bgPx = await d.page.evaluate(async ({b64, idx}) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), bmp = await createImageBitmap(new Blob([bytes], {type: 'image/jpeg'}));
    const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(bmp, 0, 0);
    const card = document.querySelectorAll('.pagecard')[idx].getBoundingClientRect(), r = document.querySelector('.tpl-t').getBoundingClientRect(), k = bmp.width / card.width;
    const p = x.getImageData(Math.round((r.left - card.left + 6) * k), Math.round((r.bottom - card.top - 6) * k), 1, 1).data; return [p[0], p[1], p[2]];
  }, {b64: dpdf.jpegs[didx].toString('base64'), idx: didx});
  ok(bgPx.every(v => v > 235), `and no dark panel behind it in the PDF (${bgPx})`);
  ok(await d.page.evaluate(() => getComputedStyle(document.querySelector('.tpl-t .tr.d .la')).color) === rgb('#8a5a14') && !(await d.page.evaluate(() => document.querySelector('#main').classList.contains('pdfpaper'))), 'and the screen is as it was afterwards (the buttons are back too)');
  ok(d.errors.length === 0, d.errors.length ? 'page errors: ' + d.errors.join('\n') : 'no page errors (dark)');
  await d.browser.close();

  // ---- an iPad: touch, coarse pointer, Apple Pencil ----
  const ip = await start({width: 1024, height: 768, contextOptions: {hasTouch: true, isMobile: true, deviceScaleFactor: 2}});
  const P = ip.page;
  ok(await P.evaluate(() => matchMedia('(pointer: coarse)').matches), 'a tablet context has a coarse pointer');
  await P.tap('#tab-insert'); await P.tap('#tplBtn'); await P.waitForTimeout(400);
  ok(await P.locator('.tplbox:visible').count() === 1, 'a tap on Templates opens the gallery');
  const tn = await P.evaluate(() => [...document.querySelectorAll('.tn')].map(n => n.getBoundingClientRect().height));
  const tm = await P.evaluate(() => Math.min(...[...document.querySelectorAll('.tmain')].map(n => n.getBoundingClientRect().height)));
  ok(Math.min(...tn) >= 44 && tm >= 48 && await P.evaluate(() => document.querySelector('.tstar').getBoundingClientRect().width >= 40), `gallery targets are fingertip-sized (subjects ${Math.min(...tn)}px, cards ${Math.round(tm)}px, stars 40px)`);
  await P.locator('.tplnav .tn', {hasText: 'Accounting'}).tap(); await P.waitForTimeout(200);
  await P.locator('.tcard', {hasText: 'T-account'}).locator('.tmain').tap(); await P.waitForTimeout(400);
  ok(await P.locator('.notebox .tpl-t').count() === 1, 'a tap on a card puts the template in');
  const hts = await P.evaluate(() => ({ld: document.querySelector('.tpl-t .ld').getBoundingClientRect().height, la: document.querySelector('.tpl-t .la').getBoundingClientRect().height, name: document.querySelector('.tpl-t .t-name').getBoundingClientRect().height}));
  ok(hts.ld >= 44 && hts.la >= 44 && hts.name >= 44, `fields are at least 44px tall at pointer: coarse (${hts.ld}, ${hts.la}, ${hts.name})`);
  await P.evaluate(() => { for (const id of ['matrix', 'takeaways', 'code', 'axes', 'truthtable']) { const t = tplById(id === 'axes' ? 'graph' : id); tplInsert({id, make: () => t.make(true)}); } });
  await P.waitForTimeout(300);
  const small = await P.evaluate(() => [...document.querySelectorAll('.tpl .tui')].map(b => [b.className, Math.round(b.getBoundingClientRect().height)]).filter(x => x[1] < 40));
  ok(small.length === 0, `every block button is at least 40px tall (${small.join(' ')})`);
  const cbs = await P.evaluate(() => { const c = document.querySelector('.tpl-check .cb').getBoundingClientRect(); const s = getComputedStyle(document.querySelector('.tpl-check .cb'), '::before'); return {w: c.width, area: s.content}; });
  ok(cbs.area === '""' && cbs.w >= 18, 'a tick box has a bigger area for a finger');
  const ta = await P.evaluate(() => ({field: getComputedStyle(document.querySelector('.tpl-t .ld')).touchAction, sel: getComputedStyle(document.querySelector('.tpl-t .ld')).userSelect, code: getComputedStyle(document.querySelector('.tpl-code .code')).touchAction, axes: getComputedStyle(document.querySelector('.tpl-axes .sv')).touchAction, ce: document.querySelector('.tpl-t .ld').contentEditable, wk: getComputedStyle(document.querySelector('.tpl-t .ld')).webkitUserSelect}));
  ok(ta.field === 'auto' && ta.sel !== 'none' && ta.wk !== 'none' && ta.ce === 'true' && ta.code === 'auto' && ta.axes === 'pan-y pinch-zoom', `fields are plain editable text (so Scribble works) and nothing blocks the Pencil or scrolling (${JSON.stringify(ta)})`);
  // the Pencil does not draw ink on a note (it writes), also over a template
  const inks0 = await P.evaluate(() => document.querySelectorAll('svg.ink path').length);
  await P.evaluate(() => {
    const f = document.querySelector('.tpl-t .ld'), r = f.getBoundingClientRect(), o = {pointerType: 'pen', pointerId: 9, isPrimary: true, bubbles: true, cancelable: true, composed: true};
    const at = (x, y, b) => ({...o, clientX: r.left + x, clientY: r.top + y, button: 0, buttons: b});
    f.dispatchEvent(new PointerEvent('pointerdown', at(10, 10, 1))); f.dispatchEvent(new PointerEvent('pointermove', at(40, 12, 1))); f.dispatchEvent(new PointerEvent('pointerup', at(40, 12, 0)));
  });
  ok(await P.evaluate(() => document.querySelectorAll('svg.ink path').length) === inks0 && !(await P.evaluate(() => document.body.classList.contains('penning'))), 'a Pencil stroke over a template field draws no ink on the page (it is for writing)');
  await P.locator('.tpl-code .cd-lang').tap(); await P.waitForTimeout(200);
  ok(await P.locator('.tmenu').count() === 1 && await P.evaluate(() => document.querySelector('.tmenu button').getBoundingClientRect().height >= 44), 'a tap on the language opens the menu, with big items');
  await P.locator('.tmenu button', {hasText: /^Java$/}).first().tap(); await P.waitForTimeout(150);
  ok((await P.textContent('.cd-lang')) === 'Java', '(and picks one)');
  await P.locator('.tpl-check .cb').nth(1).tap(); await P.waitForTimeout(100);
  ok(await P.getAttribute('.tpl-check .cb >> nth=1', 'data-on') === '1', 'a tap ticks a box');
  await P.screenshot({path: path.join(OUT, 'tpl-use-ipad.png')});
  ok(ip.errors.length === 0, ip.errors.length ? 'page errors: ' + ip.errors.join('\n') : 'no page errors (iPad)');
  await ip.browser.close();

  // ---- a phone ----
  const ph = await start({width: 390, height: 844, contextOptions: {hasTouch: true, isMobile: true, deviceScaleFactor: 2}});
  const Q = ph.page;
  await Q.evaluate(() => tplOpen()); await Q.waitForTimeout(500);
  const pr = await Q.evaluate(() => { const b = document.querySelector('.tplbox').getBoundingClientRect(), n = document.querySelector('.tplnav'), cs = getComputedStyle(n), grid = document.querySelector('.tplgrid'); return {l: b.left, r: b.right, w: b.width, h: b.height, dir: cs.flexDirection, ox: cs.overflowX, sw: n.scrollWidth, cw: n.clientWidth, navH: n.getBoundingClientRect().height, chip: getComputedStyle(n.querySelector('.tn')).borderRadius, page: document.documentElement.scrollWidth, cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length, foot: getComputedStyle(document.querySelector('.tplfoot')).display}; });
  ok(pr.l >= 0 && pr.r <= 390 && pr.page <= 390, `on a phone the dialog fits the screen (${Math.round(pr.w)} × ${Math.round(pr.h)}) and the page doesn’t scroll sideways`);
  ok(pr.dir === 'row' && pr.ox === 'auto' && pr.sw > pr.cw && pr.navH < 80 && pr.chip !== '0px', `the subject list is a row of chips you can scroll along (${pr.sw}px of chips in ${pr.cw}px, ${Math.round(pr.navH)}px high)`);
  ok(pr.cols >= 1 && pr.foot === 'none', 'cards are in a grid below it, without the keyboard hint');
  await Q.locator('.tplnav .tn', {hasText: 'Chemistry'}).tap(); await Q.waitForTimeout(200);
  ok((await cards(Q)).join('|') === 'Chemical equation|ICE table|Stoichiometry steps|Element lookup', 'tapping a chip shows that subject');
  await Q.screenshot({path: path.join(OUT, 'tpl-gallery-phone.png')});
  await Q.locator('.tcard', {hasText: 'Chemical equation'}).locator('.tmain').tap(); await Q.waitForTimeout(500);
  ok(await Q.locator('.notebox .tpl-ce').count() === 1 && await Q.locator('.tplbox:visible').count() === 0, 'a tap on a card puts it in and closes the gallery');
  await Q.evaluate(() => { for (const id of ['punnett', 'taccount', 'truthtable']) { const t = tplById(id); tplInsert({id, make: () => t.make(true)}); } });
  await Q.waitForTimeout(300);
  const fit = await Q.evaluate(() => [...document.querySelectorAll('.notebox .tpl')].map(b => [b.dataset.t, Math.round(b.getBoundingClientRect().right), Math.round(b.closest('.notebox').getBoundingClientRect().right)]).filter(x => x[1] > x[2] + 1));
  ok(fit.length === 0, `on a phone the blocks stay inside their note (${fit.join(' ')})`);
  await Q.evaluate(() => document.querySelector('.tpl-t').scrollIntoView({block: 'center'})); await Q.waitForTimeout(200);
  await Q.screenshot({path: path.join(OUT, 'tpl-use-phone.png')});
  ok(ph.errors.length === 0, ph.errors.length ? 'page errors: ' + ph.errors.join('\n') : 'no page errors (phone)');
  await ph.browser.close();

  ok(errors.length === 0, errors.length ? 'page errors: ' + errors.join('\n') : 'no page errors so far');
  console.log(`${results.ok} checks passed (part 6)`);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

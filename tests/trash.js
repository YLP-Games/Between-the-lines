// Favourites, Duplicate and the Trash: starred notebooks, copies, soft delete with Restore / Delete for ever, the 30-day tidy
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const names = (p, list = '#docList') => p.$$eval(list + ' .docbtn .nm', els => els.map(e => e.textContent));
const trashNames = p => p.$$eval('#trashBox .trashrow .nm', els => els.map(e => e.textContent));
// every key in the browser's store, with a rough size (blob = a stored picture)
const store = p => p.evaluate(() => new Promise(res => { const r = indexedDB.open('between-slides-text', 1); r.onsuccess = () => { const t = r.result.transaction('kv').objectStore('kv'), out = {}; const c = t.openCursor(); c.onsuccess = () => { const x = c.result; if (!x) return res(out); out[x.key] = typeof x.value === 'string' ? x.value.length : x.value instanceof Blob ? 'blob' : 'other'; x.continue(); }; }; }));
const blobs = st => Object.values(st).filter(v => v === 'blob').length;
const pagesShow = p => p.evaluate(async () => { const urls = [...document.querySelectorAll('.pagecard')].map(c => (c.style.getPropertyValue('--pg').match(/url\(["']?(.*?)["']?\)$/) || [])[1]); for (const u of urls) { if (!u) return false; const r = await fetch(u); if (!r.ok || (await r.blob()).size < 1000) return false; } return urls.length > 0; });
const docsOf = p => p.evaluate(async () => (await get('docs')).map(d => ({id: d.id, name: d.name, fav: !!d.fav, trashed: !!d.trashed, copiedFrom: d.copiedFrom || null})));

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(800);
  const rowOf = (name, list = '#docList') => page.locator(list + ' .nb').filter({has: page.locator('.docbtn .nm', {hasText: new RegExp('^' + name.replace(/[()]/g, '\\$&') + '$')})});
  const menuOf = async (name, list = '#docList') => { const row = rowOf(name, list); await row.hover(); await row.locator('.more').click(); await page.waitForTimeout(100); };
  const toastText = () => page.textContent('#toast');
  const openTrash = async () => { if ((await page.getAttribute('#trashBox .trashhead', 'aria-expanded')) !== 'true') await page.click('#trashBox .trashhead'); await page.waitForTimeout(200); };
  const curName = () => page.$eval('.nb[aria-current] .docbtn .nm', e => e.textContent);

  // ---- three notebooks: a PDF with a note, a PowerPoint, and a blank one ----
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(900);
  const strip = page.locator('.pagecard').nth(1).locator('.strip').first();
  await strip.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
  const b = await strip.boundingBox();
  await page.mouse.move(b.x + 200, b.y + b.height * 0.5, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.keyboard.type('Lecture note'); await page.mouse.click(5, 700); await page.waitForTimeout(900);
  await page.evaluate(() => pref.set('pptx-mode', 'text'));      // this test counts stored pictures: the slides as text have none
  await page.setInputFiles('#file', path.join(__dirname, 'week2.pptx'));
  await page.waitForFunction(() => document.querySelectorAll('#docList .nb').length === 2, null, {timeout: 30000});
  await page.waitForTimeout(800);
  await page.click('#newDocBtn'); await page.waitForTimeout(800);
  await page.keyboard.type('My own revision notes'); await page.waitForTimeout(900);
  await page.hover('#docList .nb[aria-current] .docrow'); await page.click('#docList .nb[aria-current] .more'); await page.click('.docmenu [data-act=rename]');
  await page.keyboard.press('Control+A'); await page.keyboard.type('Revision'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ok((await names(page)).join() === 'Revision,week2,lecture', 'three notebooks: Revision, week2 and lecture');
  ok(!(await page.isVisible('#favSec')) && !(await page.isVisible('#favList')), 'no Favourites section until something is a favourite');
  ok(await page.isVisible('#trashBox .trashhead') && (await page.textContent('#trashBox .trashhead')).trim() === 'Trash', 'the Trash is there, with no count while empty');
  ok(!(await page.isVisible('#trashList')), 'the Trash starts folded');
  const dark = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);

  // ---- the ⋯ menu ----
  await menuOf('week2');
  const items = await page.$$eval('.docmenu button', els => els.map(e => e.textContent.trim()));
  ok(items.join('|') === 'Rename|Add to Favourites|Duplicate|Open beside|Share via Google Drive…|Share via OneDrive…|Move to Trash', 'the menu: ' + items.join(' | '));
  ok(await page.evaluate(() => document.activeElement.textContent.trim()) === 'Rename', 'the menu opens with Rename focused');
  await page.screenshot({path: path.join(OUT, 'trash-0-menu.png'), clip: {x: 0, y: 0, width: 560, height: 900}});
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok(!(await page.isVisible('.docmenu')) && await page.evaluate(() => document.activeElement.classList.contains('more')), 'Escape closes it and returns to the ⋯ button');

  // ---- favourites ----
  await menuOf('week2'); await page.click('.docmenu [data-act=fav]'); await page.waitForTimeout(300);
  ok(await page.isVisible('#favSec') && (await page.textContent('#favSec')).trim() === 'Favourites', 'a Favourites section appears');
  ok((await names(page, '#favList')).join() === 'week2', 'it lists the favourite');
  ok((await names(page)).join() === 'Revision,lecture', 'and the favourite is not repeated in Notebooks');
  ok(await page.evaluate(() => document.querySelector('#favSec').compareDocumentPosition(document.querySelector('#docCount')) & Node.DOCUMENT_POSITION_FOLLOWING), 'Favourites sits above Notebooks');
  await menuOf('week2', '#favList');
  ok((await page.textContent('.docmenu [data-act=fav]')).trim() === 'Remove from Favourites', 'the menu now offers Remove from Favourites');
  await page.keyboard.press('Escape');
  await page.click('#favList .docbtn'); await page.waitForTimeout(900);
  ok(await curName() === 'week2' && await page.locator('#favList .nb[aria-current]').count() === 1, 'clicking a favourite opens it and highlights it there');
  ok(await page.locator('#favList .nb[aria-current] #pageList .pg').count() === 2, 'the open favourite shows its pages under it');
  ok((await page.textContent('main')).includes('Equilibrium'), 'and its slides are on screen');
  await page.mouse.move(700, 500); await page.waitForTimeout(300);
  await page.locator('#pagesPanel').screenshot({path: path.join(OUT, 'trash-1-favourites.png')});
  // renaming a favourite works in place
  await menuOf('week2', '#favList'); await page.click('.docmenu [data-act=rename]');
  await page.keyboard.press('Control+A'); await page.keyboard.type('week2 slides'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok((await names(page, '#favList')).join() === 'week2 slides', 'a favourite can be renamed in the Favourites list');
  await page.reload(); await page.waitForTimeout(1800);
  ok((await names(page, '#favList')).join() === 'week2 slides' && (await names(page)).join() === 'Revision,lecture', 'favourites are kept after reload');
  await menuOf('week2 slides', '#favList'); await page.click('.docmenu [data-act=fav]'); await page.waitForTimeout(300);
  ok(!(await page.isVisible('#favSec')) && (await names(page)).includes('week2 slides'), 'removing the last favourite hides the section and returns it to Notebooks');
  await menuOf('week2 slides'); await page.click('.docmenu [data-act=fav]'); await page.waitForTimeout(300);

  // ---- duplicate ----
  await page.click('#docList .docbtn >> text=lecture'); await page.waitForTimeout(1200);
  ok(await curName() === 'lecture' && await page.locator('.pagecard').count() === 6, 'lecture is open');
  await page.click('.notebox .mine'); await page.keyboard.press('End'); await page.keyboard.type(' extra');      // typed a moment before the copy: the copy has it too
  await menuOf('lecture'); await page.click('.docmenu [data-act=duplicate]'); await page.waitForTimeout(700);
  ok((await names(page)).join() === 'Revision,lecture,lecture (copy)', 'the copy comes right after the original');
  ok((await toastText()).trim() === 'Made a copy: “lecture (copy)”.', 'a toast says so');
  ok(await curName() === 'lecture', 'the copy is not opened');
  const ds = await docsOf(page), orig = ds.find(d => d.name === 'lecture'), copy = ds.find(d => d.name === 'lecture (copy)');
  ok(copy.copiedFrom === orig.id && !copy.fav, 'the copy remembers what it was copied from');
  await page.click('#docList .docbtn >> text=lecture (copy)'); await page.waitForTimeout(1500);
  ok(await page.locator('.pagecard').count() === 6 && (await page.textContent('.notebox .mine')).includes('Lecture note extra'), 'the copy opens with the same pages and notes');
  ok(await pagesShow(page), 'and its page pictures show');
  ok((await page.textContent('#docTitle')).trim() === 'lecture (copy)', 'the title bar shows the copy’s name');
  await page.reload(); await page.waitForTimeout(2200);
  ok((await names(page)).includes('lecture (copy)') && await page.locator('.pagecard').count() === 6, 'the copy is kept after reload');

  // ---- Trash: a copy goes in, comes out of the Trash by emptying it, and the original keeps its pictures ----
  const picsBefore = blobs(await store(page));
  ok(picsBefore >= 6, `the PDF’s page pictures are stored (${picsBefore})`);
  await menuOf('lecture (copy)'); await page.click('.docmenu [data-act=trash]'); await page.waitForTimeout(700);
  ok((await toastText()).trim() === 'Moved “lecture (copy)” to the Trash.', 'Move to Trash says what it did');
  ok(!(await names(page)).includes('lecture (copy)') && await curName() !== 'lecture (copy)', 'the copy leaves the list, and another notebook opens in its place');
  ok((await page.textContent('#trashBox .trashhead')).replace(/\s+/g, ' ').trim() === 'Trash 1', 'the Trash shows a count: Trash 1');
  await openTrash();
  ok((await trashNames(page)).join() === 'lecture (copy)' && await page.locator('#trashBox .trashrow [data-t=restore]').count() === 1, 'unfolded, it lists the copy with Restore and Delete for ever');
  await page.click('#trashBox [data-t=empty]'); await page.waitForTimeout(200);
  ok((await trashNames(page)).length === 1 && (await page.textContent('#trashBox [data-t=empty]')).includes('Click again'), 'Empty the Trash needs a second click');
  await page.click('#trashBox [data-t=empty]'); await page.waitForTimeout(500);
  ok((await trashNames(page)).length === 0 && (await page.textContent('#trashList')).includes('Nothing in the Trash'), 'the second click empties it');
  ok((await page.textContent('#trashBox .trashhead')).trim() === 'Trash', 'and the count goes');
  ok(!(await store(page))['doc:' + copy.id], 'the copy’s pages are removed from the store');
  await page.reload(); await page.waitForTimeout(3000);
  ok(blobs(await store(page)) === picsBefore, 'the original’s pictures are still kept (the copy only shared them)');

  // ---- Trash: the open notebook (the PDF) goes in; another opens ----
  await page.click('#docList .docbtn >> text=lecture'); await page.waitForTimeout(1200);
  const lectureKey = 'doc:' + orig.id;
  ok(await curName() === 'lecture', 'lecture is open again');
  await menuOf('lecture'); await page.click('.docmenu [data-act=trash]'); await page.waitForTimeout(900);
  ok(!(await names(page)).includes('lecture') && (await curName()) !== 'lecture', 'moving the open notebook to the Trash opens another');
  ok((await page.textContent('#trashBox .trashhead')).replace(/\s+/g, ' ').trim() === 'Trash 1', 'Trash 1');
  ok(await page.locator('.pagecard').count() === 0 && !(await page.textContent('#docTitle')).includes('lecture'), 'the lecture’s pages are off the screen');
  let st = await store(page);
  ok(st[lectureKey] > 100, 'its pages are still stored');
  await page.reload(); await page.waitForTimeout(3000);
  ok((await page.textContent('#trashBox .trashhead')).replace(/\s+/g, ' ').trim() === 'Trash 1' && !(await names(page)).includes('lecture'), 'after reload it is still in the Trash');
  st = await store(page);
  ok(st[lectureKey] > 100 && blobs(st) === picsBefore, `its page pictures are still in the store (${blobs(st)})`);
  ok((await curName()) !== 'lecture', 'and the trashed notebook was not the one opened at start-up');

  // ---- look at the open Trash ----
  await openTrash();
  const row = page.locator('#trashBox .trashrow');
  ok((await row.locator('.nm').textContent()) === 'lecture' && (await row.locator('.when').textContent()).length > 3, 'the trashed notebook shows its name and the date');
  ok(/In the Trash since .*It goes for ever on/.test(await row.locator('.tname').evaluate(e => e.title || e.dataset.tip || '')), 'its tooltip says when it goes for ever');
  ok((await row.locator('.tbtn').allTextContents()).join('|') === 'Restore|Delete for ever', 'with Restore and Delete for ever');
  await page.locator('#pagesPanel').screenshot({path: path.join(OUT, 'trash-2-open.png')});
  await page.emulateMedia({colorScheme: 'dark'}); await page.waitForTimeout(300);
  await page.locator('#pagesPanel').screenshot({path: path.join(OUT, 'trash-3-dark.png')});
  await page.emulateMedia({colorScheme: dark ? 'dark' : 'light'}); await page.waitForTimeout(200);

  // ---- Restore: back in the list, not opened, and it opens with everything ----
  const was = await curName();
  await page.click('#trashBox [data-t=restore]'); await page.waitForTimeout(500);
  ok((await names(page)).includes('lecture') && (await trashNames(page)).length === 0, 'Restore puts it back in the list');
  ok((await toastText()).trim() === 'Restored “lecture”.', 'a toast says so');
  ok(await curName() === was, 'it is not opened');
  await page.click('#docList .docbtn >> text=lecture'); await page.waitForTimeout(1500);
  ok(await page.locator('.pagecard').count() === 6 && (await page.textContent('.notebox .mine')).includes('Lecture note extra') && await pagesShow(page), 'it opens with its pages, its notes and its page pictures');

  // ---- Delete for ever: two clicks ----
  await menuOf('lecture'); await page.click('.docmenu [data-act=trash]'); await page.waitForTimeout(800);
  await openTrash();
  await page.click('#trashBox [data-t=purge]'); await page.waitForTimeout(200);
  ok((await trashNames(page)).length === 1 && (await page.textContent('#trashBox [data-t=purge]')).includes('Click again'), 'Delete for ever asks for a second click');
  await page.waitForTimeout(4400);
  ok((await page.textContent('#trashBox [data-t=purge]')).trim() === 'Delete for ever', 'and relaxes again if you don’t');
  await page.click('#trashBox [data-t=purge]'); await page.click('#trashBox [data-t=purge]'); await page.waitForTimeout(600);
  ok((await trashNames(page)).length === 0 && (await toastText()).trim() === 'Deleted “lecture” for ever.', 'the second click deletes it');
  await page.reload(); await page.waitForTimeout(3000);
  st = await store(page);
  ok((await trashNames(page)).length === 0 && !st[lectureKey] && blobs(st) === 0, 'after reload it is gone, with its pictures');
  ok(!(await docsOf(page)).some(d => d.name === 'lecture'), 'and its record');

  // ---- 30 days ----
  await page.evaluate(async () => {
    const old = {id: 'dold1', name: 'Old one', named: true, pages: 0, notes: 0, updated: 0, trashed: Date.now() - 31 * 864e5};
    const recent = {id: 'dnew1', name: 'Recent one', named: true, pages: 0, notes: 0, updated: 0, trashed: Date.now() - 29 * 864e5};
    docs.push(old, recent);
    await putAll({docs, 'doc:dold1': '<p>old</p>', 'doc:dnew1': '<p>recent</p>'});
  });
  await page.reload(); await page.waitForTimeout(2500);
  st = await store(page);
  ok(!st['doc:dold1'] && !(await docsOf(page)).some(d => d.id === 'dold1'), 'a notebook trashed 31 days ago is deleted for ever at start-up');
  ok(st['doc:dnew1'] && (await docsOf(page)).some(d => d.id === 'dnew1' && d.trashed), 'one trashed 29 days ago is kept');
  await openTrash();
  ok((await trashNames(page)).join() === 'Recent one', 'and still listed in the Trash');

  // ---- everything in the Trash: a new empty notebook, and it survives a reload ----
  const live = [...(await names(page, '#favList')).map(n => [n, '#favList']), ...(await names(page)).map(n => [n, '#docList'])];
  for (const [n, l] of live) { await menuOf(n, l); await page.click('.docmenu [data-act=trash]'); await page.waitForTimeout(600); }
  ok((await names(page)).length === 1 && (await page.textContent('#docList .nb[aria-current] .nm')) === 'Untitled', 'with every notebook in the Trash, a new empty one opens');
  ok((await page.textContent('#trashBox .trashhead')).replace(/\s+/g, ' ').trim() === 'Trash 3', 'the Trash holds the other three');
  await page.reload(); await page.waitForTimeout(2000);
  ok((await names(page)).length === 1 && (await trashNames(page)).length === 0, 'after reload still one live notebook (the Trash is folded)');
  await openTrash();
  ok((await trashNames(page)).length === 3, 'and three in the Trash');
  // restoring one while the open notebook is empty leaves the open one alone
  await page.click('#trashBox [data-t=restore]'); await page.waitForTimeout(400);
  ok((await names(page)).length === 2 && await curName() === 'Untitled', 'restoring does not change which notebook is open');

  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

// Folders: a course > topic > notebooks tree. Create, rename, nest, drag and drop, Move to…, open states, delete, Trash and Restore
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
let n = 0;
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); n++; console.log('ok  ' + m); };

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(800);
  const rx = s => new RegExp('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
  const folder = name => page.locator('#docList li.fld').filter({has: page.locator('> .docrow .docbtn .nm', {hasText: rx(name)})}).first();
  const frow = name => folder(name).locator('> .docrow');
  const nb = name => page.locator('#docList li.nb').filter({has: page.locator('> .docrow .docbtn .nm', {hasText: rx(name)})}).first();
  const nbrow = name => nb(name).locator('> .docrow');
  // a tree as text: "Banking[Risk Management[Lecture 1]]" (folders first, then notebooks)
  const tree = () => page.evaluate(() => {
    const walk = ul => [...ul.children].map(li => li.classList.contains('fld') ? li.querySelector(':scope > .docrow .nm').textContent + (li.querySelector(':scope > .foldkids') ? '[' + walk(li.querySelector(':scope > .foldkids')).join(',') + ']' : '')
      : li.classList.contains('nb') ? li.querySelector(':scope > .docrow .nm').textContent : '…');
    return walk(document.querySelector('#docList')).join(',');
  });
  const stored = () => page.evaluate(async () => ({folders: await get('folders'), docs: (await get('docs')).map(d => ({name: d.name, folder: d.folder || null, trashed: !!d.trashed}))}));
  const folderIn = async name => (await stored()).docs.find(d => d.name === name)?.folder;
  const folderNamed = async name => (await stored()).folders.find(f => f.name === name);
  const toastText = () => page.textContent('#toast');
  const curName = () => page.$eval('.nb[aria-current] > .docrow .nm', e => e.textContent);
  const menu = async row => { await row.hover(); await row.locator('.more').click(); await page.waitForTimeout(100); };
  const dragTo = async (src, dst, {release = true, hold = 0, dx = 60} = {}) => {
    await src.scrollIntoViewIfNeeded(); await dst.scrollIntoViewIfNeeded();          // the sidebar's list is short now that it has more rows above it
    const a = await src.boundingBox(), b = await dst.boundingBox();
    await page.mouse.move(a.x + dx, a.y + a.height / 2); await page.mouse.down();
    await page.mouse.move(a.x + dx, a.y + a.height / 2 + 8, {steps: 3});
    await page.mouse.move(b.x + dx, b.y + b.height / 2, {steps: 8});
    if (hold) await page.waitForTimeout(hold);
    if (release) { await page.mouse.up(); await page.waitForTimeout(250); }
  };
  const rename = async (row, to) => { await menu(row); await page.click('.docmenu [data-act=rename]'); await page.keyboard.press('Control+A'); await page.keyboard.type(to); await page.keyboard.press('Enter'); await page.waitForTimeout(250); };
  const newBook = async (name, text) => {
    await page.click('#newDocBtn'); await page.waitForTimeout(700);
    await page.keyboard.type(text); await page.waitForTimeout(700);
    await rename(page.locator('#docList .nb[aria-current] > .docrow'), name);
  };

  // ---- three notebooks, and the New folder row ----
  await newBook('Lecture 1', 'Interest rates'); await newBook('Lecture 2', 'Capital rules'); await newBook('Spare', 'Spare thoughts');
  ok(await tree() === 'Spare,Lecture 2,Lecture 1', 'three notebooks, no folders yet');
  const acts = await page.$$eval('.sideacts .srow', els => els.slice(0, 3).map(e => e.textContent.trim()));
  ok(acts.join('|') === 'New notebook|New folder|Open a file', 'New folder sits right after New notebook');
  ok(await page.evaluate(() => document.querySelector('#newFolderBtn').title.length > 10), 'it has a tooltip');

  // ---- make a folder and name it ----
  await page.click('#newFolderBtn'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => document.activeElement.tagName === 'INPUT' && document.activeElement.value === 'Untitled folder' && document.activeElement.closest('#docList')), 'a new folder starts renaming at once, in place');
  await page.keyboard.type('Banking'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  ok(await tree() === 'Banking,Spare,Lecture 2,Lecture 1', 'the folder is named Banking and sits above the notebooks');
  ok((await folderNamed('Banking')).parent === null, 'saved at the top level');
  // Esc while naming keeps the default name
  await page.click('#newFolderBtn'); await page.waitForTimeout(200); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(await tree() === 'Banking,Untitled folder,Spare,Lecture 2,Lecture 1', 'Esc while naming keeps “Untitled folder”');
  await rename(frow('Untitled folder'), 'Archive');
  ok(await tree() === 'Archive,Banking,Spare,Lecture 2,Lecture 1', 'folders sort A to Z; renamed from its ⋯ menu to Archive');

  // ---- the folder menu ----
  await menu(frow('Banking'));
  const items = await page.$$eval('.docmenu button', els => els.map(e => e.textContent.trim()));
  ok(items.join('|') === 'Rename|New folder inside|New notebook here|Move to…|Delete folder', 'folder menu: ' + items.join(' | '));
  await page.click('.docmenu [data-act=sub]'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => document.activeElement.tagName === 'INPUT'), 'New folder inside starts naming');
  await page.keyboard.press('Control+A'); await page.keyboard.type('Risk Management'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  ok(await tree() === 'Archive,Banking[Risk Management],Spare,Lecture 2,Lecture 1', 'Risk Management is inside Banking, which opened to show it: ' + await tree());
  ok((await folderNamed('Risk Management')).parent === (await folderNamed('Banking')).id, 'its parent is saved');

  // ---- drag a notebook into the subfolder ----
  await menu(frow('Risk Management'));
  await page.click('.docmenu [data-act=here]'); await page.waitForTimeout(900);
  const rid = (await folderNamed('Risk Management')).id;
  ok((await stored()).docs.some(d => d.folder === rid), 'New notebook here makes a notebook in the folder');
  ok(await page.evaluate(() => !!document.querySelector('.nb[aria-current]') && !!document.querySelector('.nb[aria-current]').closest('.foldkids')), 'and it is open, inside the folder');
  await page.keyboard.type('Bank notes'); await page.waitForTimeout(800);
  await rename(page.locator('#docList .nb[aria-current] > .docrow'), 'Bank notes');
  ok((await tree()).includes('Risk Management[Bank notes]'), 'Bank notes sits in Risk Management');
  // pick Lecture 1 up and drop it on Risk Management
  await dragTo(nbrow('Lecture 1'), frow('Risk Management'), {release: false});
  ok(await page.locator('.dragghost').count() === 1 && await page.locator('.docrow.droptarget').count() === 1, 'dragging shows a ghost and highlights the target folder');
  ok(await page.locator('.dropline').isVisible() && await page.evaluate(() => getComputedStyle(document.querySelector('.dropline')).backgroundColor !== 'rgba(0, 0, 0, 0)'), 'and an accent line where it will land');
  await page.screenshot({path: path.join(OUT, 'folders-0-dragging.png'), clip: {x: 0, y: 0, width: 520, height: 700}});
  await page.mouse.up(); await page.waitForTimeout(300);
  ok((await tree()).includes('Risk Management[Bank notes,Lecture 1]') && await page.locator('.dragghost').count() === 0 && await page.locator('.dropline').count() === 0, 'dropping puts Lecture 1 in Risk Management and clears the drag marks');
  ok((await folderIn('Lecture 1')) === (await folderNamed('Risk Management')).id, 'saved');
  ok(await curName() === 'Bank notes', 'dragging did not switch the open notebook');

  // ---- a plain click still works, and a tiny wobble is not a drag ----
  await nbrow('Lecture 1').locator('.docbtn').click(); await page.waitForTimeout(700);
  ok(await curName() === 'Lecture 1', 'a plain click opens a notebook');
  const bb = await nbrow('Spare').boundingBox();
  await page.mouse.move(bb.x + 60, bb.y + 10); await page.mouse.down(); await page.mouse.move(bb.x + 63, bb.y + 12); await page.mouse.up(); await page.waitForTimeout(600);
  ok(await curName() === 'Spare' && await page.locator('.dragghost').count() === 0, 'a 3px wobble is still a click');

  // ---- collapse and expand, counts ----
  await page.click('#docList li.fld:has(> .docrow .nm:text-is("Banking")) > .docrow .caret'); await page.waitForTimeout(250);
  ok(await tree() === 'Archive,Banking,Spare,Lecture 2', 'closing Banking hides what is inside');
  ok((await frow('Banking').locator('.fcount').textContent()) === '2' && await frow('Banking').locator('.caret').getAttribute('aria-expanded') === 'false', 'a closed folder shows how many notebooks it holds (2, counting subfolders)');
  ok(await frow('Archive').locator('.fcount').count() === 0, 'an empty folder shows no count');
  await frow('Banking').locator('.docbtn').click(); await page.waitForTimeout(250);
  ok((await tree()).startsWith('Archive,Banking[Risk Management') && await frow('Banking').locator('.fcount').count() === 0, 'clicking the name opens it again, and the count goes');
  await page.locator('#docList li.fld:has(> .docrow .nm:text-is("Risk Management")) > .docrow .caret').click(); await page.waitForTimeout(250);
  ok((await tree()) === 'Archive,Banking[Risk Management],Spare,Lecture 2', 'Risk Management closed inside an open Banking');
  ok(await page.evaluate(() => { const li = document.querySelector('#docList li.fld .foldkids'); return getComputedStyle(li).borderLeftWidth === '1px' && parseFloat(getComputedStyle(li).marginLeft) > 8; }), 'children are indented with a guide line');

  // ---- reload: tree, open states and membership are kept ----
  await page.reload(); await page.waitForTimeout(2200);
  ok((await tree()) === 'Archive,Banking[Risk Management],Spare,Lecture 2', 'after reload: same tree, same open states');
  let st = await stored();
  ok(st.folders.length === 3 && st.folders.find(f => f.name === 'Banking').open === true && st.folders.find(f => f.name === 'Risk Management').open === false, 'folders and open flags are in the store');

  // ---- opening a notebook inside closed folders opens them ----
  await nbrow('Lecture 2').locator('.docbtn').click(); await page.waitForTimeout(700);
  await page.evaluate(() => switchDoc(docs.find(d => d.name === 'Lecture 1').id)); await page.waitForTimeout(700);
  ok((await tree()).includes('Risk Management[Bank notes,Lecture 1'), 'switching to a notebook in a closed folder opens its folders: ' + await tree());
  ok(await curName() === 'Lecture 1', 'and it is the highlighted one');
  st = await stored();
  ok(st.folders.find(f => f.name === 'Risk Management').open === true, 'the opened state is saved');
  // and after a reload with it open
  await page.reload(); await page.waitForTimeout(2200);
  ok(await curName() === 'Lecture 1' && (await tree()).includes('Risk Management[Bank notes,Lecture 1'), 'after reload the open notebook is still on view');
  await page.mouse.move(700, 500); await page.waitForTimeout(200);
  await page.locator('#pagesPanel').screenshot({path: path.join(OUT, 'folders-1-tree-light.png')});

  // ---- Move to… from the menu ----
  await menu(nbrow('Lecture 2'));
  const mitems = await page.$$eval('.docmenu button', els => els.map(e => e.textContent.trim()));
  ok(mitems.join('|') === 'Rename|Add to Favourites|Move to…|Duplicate|Open beside|Share via Google Drive…|Share via OneDrive…|Move to Trash', 'notebook menu: ' + mitems.join(' | '));
  await page.click('.docmenu [data-act=move]'); await page.waitForTimeout(150);
  const opts = await page.$$eval('.docmenu .movelist button', els => els.map(e => e.textContent.trim() + (e.disabled ? '*' : '')));
  ok(opts.join('|') === 'Top level (here)*|Archive|Banking|Risk Management', 'the list: Top level, then the folders as a tree: ' + opts.join(' | '));
  await page.screenshot({path: path.join(OUT, 'folders-2-moveto.png'), clip: {x: 0, y: 0, width: 560, height: 700}});
  await page.locator('.docmenu .movelist button', {hasText: 'Archive'}).click(); await page.waitForTimeout(250);
  ok((await tree()).includes('Archive[Lecture 2]'), 'Move to… Archive puts Lecture 2 there, and opens Archive: ' + await tree());
  await menu(nbrow('Lecture 2')); await page.click('.docmenu [data-act=move]');
  await page.locator('.docmenu .movelist button', {hasText: 'Top level'}).click(); await page.waitForTimeout(250);
  ok((await tree()).includes('Spare,Lecture 2') && await folderIn('Lecture 2') === null, 'and Top level brings it back');
  // keyboard: Escape closes the menu
  await menu(nbrow('Lecture 2')); await page.keyboard.press('Escape');
  ok(!(await page.isVisible('.docmenu')), 'Esc closes the menu');

  // ---- drag a folder into another; refuse a folder into itself or its own child ----
  await dragTo(frow('Risk Management'), frow('Archive'));
  ok((await tree()).startsWith('Archive[Risk Management[') && (await folderNamed('Risk Management')).parent === (await folderNamed('Archive')).id, 'dragging Risk Management onto Archive nests it: ' + await tree());
  ok(await tree() !== '' && (await tree()).includes('Banking'), 'Banking is still there, now without it');
  await dragTo(frow('Archive'), frow('Risk Management'), {release: false});
  ok(await page.locator('.dragghost.nodrop').count() === 1 && await page.locator('.docrow.droptarget').count() === 0 && !(await page.locator('.dropline').isVisible()), 'dragging Archive over its own child shows no drop target');
  await page.mouse.up(); await page.waitForTimeout(300);
  ok((await folderNamed('Archive')).parent === null && (await folderNamed('Risk Management')).parent === (await folderNamed('Archive')).id, 'and nothing moved');
  await dragTo(frow('Archive'), frow('Archive'), {release: false});
  ok(await page.locator('.docrow.droptarget').count() === 0, 'a folder over itself is no target');
  await page.mouse.up(); await page.waitForTimeout(250);
  await menu(frow('Archive')); await page.click('.docmenu [data-act=move]');
  const aopts = await page.$$eval('.docmenu .movelist button', els => els.map(e => e.textContent.trim()));
  ok(aopts.join('|') === 'Top level (here)|Banking', 'Move to… for Archive leaves out Archive and what is inside it: ' + aopts.join(' | '));
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => { moveFolder(folders.find(f => f.name === 'Archive').id, folders.find(f => f.name === 'Risk Management').id); return document.getElementById('toast').textContent; }) === 'A folder can’t go inside itself.', 'and a move that would loop is refused with a message');
  ok((await folderNamed('Archive')).parent === null, 'nothing changed');
  // a third level: Banking > Risk Management? Archive > Risk Management > Credit
  await menu(frow('Risk Management')); await page.click('.docmenu [data-act=sub]'); await page.keyboard.press('Control+A'); await page.keyboard.type('Credit'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  ok((await tree()).includes('Archive[Risk Management[Credit'), 'three levels deep: Archive > Risk Management > Credit');

  // ---- Esc cancels a drag; empty space and the heading mean top level ----
  await dragTo(nbrow('Lecture 1'), frow('Banking'), {release: false});
  ok(await page.locator('.docrow.droptarget').count() === 1, 'drag started');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(await page.locator('.dragghost').count() === 0 && await page.locator('.docrow.droptarget').count() === 0, 'Esc cancels: ghost and highlight gone');
  await page.mouse.up(); await page.waitForTimeout(300);
  ok(await folderIn('Lecture 1') === (await folderNamed('Risk Management')).id, 'and the notebook stayed where it was');
  const a1 = await nbrow('Lecture 1').boundingBox();
  await page.mouse.move(a1.x + 60, a1.y + a1.height / 2); await page.mouse.down(); await page.mouse.move(a1.x + 60, a1.y + a1.height / 2 + 9, {steps: 3});
  // aim at the Notebooks heading
  const hd = await page.locator('.sidesec', {hasText: 'Notebooks'}).boundingBox();
  await page.mouse.move(hd.x + 60, hd.y + hd.height / 2, {steps: 6});
  ok(await page.locator('.docrow.droptarget').count() === 0 && await page.locator('.dropline').isVisible(), 'over the Notebooks heading the line shows for the top level');
  await page.mouse.up(); await page.waitForTimeout(300);
  ok(await folderIn('Lecture 1') === null, 'dropping on the heading moves Lecture 1 to the top level: ' + await tree());
  // dragging a notebook to the empty space below the list
  await dragTo(nbrow('Bank notes'), nbrow('Spare'), {release: false});
  await page.mouse.up(); await page.waitForTimeout(250);
  ok(await folderIn('Bank notes') === null, 'dropping on a top-level notebook means top level too');
  await dragTo(nbrow('Bank notes'), frow('Banking')); await dragTo(nbrow('Lecture 1'), frow('Banking'));

  // ---- hover over a closed folder for 600ms and it opens ----
  await page.locator('#docList li.fld:has(> .docrow .nm:text-is("Banking")) > .docrow .caret').click(); await page.waitForTimeout(250);
  ok(!(await tree()).includes('Banking['), 'Banking closed for the hover test');
  await dragTo(nbrow('Lecture 2'), frow('Banking'), {release: false, hold: 300});
  ok((await folderNamed('Banking')).open === false, 'not yet open after 300ms');
  await page.waitForTimeout(500);
  ok((await folderNamed('Banking')).open === true && (await tree()).includes('Banking['), 'resting on a closed folder for 600ms opens it');
  ok(await page.locator('.docrow.droptarget').count() === 1, 'and it stays highlighted as the target');
  await page.mouse.up(); await page.waitForTimeout(300);
  ok(await folderIn('Lecture 2') === (await folderNamed('Banking')).id, 'then the drop lands in it');
  await page.screenshot({path: path.join(OUT, 'folders-3-after.png'), clip: {x: 0, y: 0, width: 520, height: 800}});

  // ---- trash and restore a notebook that is in a folder ----
  const tfolder = await folderIn('Bank notes');
  await menu(nbrow('Bank notes')); await page.click('.docmenu [data-act=trash]'); await page.waitForTimeout(500);
  ok(!(await tree()).includes('Bank notes') && (await stored()).docs.find(d => d.name === 'Bank notes').folder === tfolder, 'a trashed notebook leaves the tree but keeps its folder');
  await page.click('#trashBox .trashhead'); await page.waitForTimeout(250);
  await page.click('#trashBox [data-t=restore]'); await page.waitForTimeout(300);
  ok(await folderIn('Bank notes') === tfolder && (await tree()).includes('Bank notes') && await nb('Bank notes').evaluate(li => !!li.closest('.foldkids')), 'Restore puts it back in its folder');
  // trash, then delete its folder: it is restored to the folder around it
  await menu(nbrow('Lecture 2')); await page.click('.docmenu [data-act=trash]'); await page.waitForTimeout(500);
  await menu(frow('Banking')); await page.click('.docmenu [data-act=rmfolder]'); await page.waitForTimeout(150);
  ok((await page.textContent('.docmenu [data-act=rmfolder]')).includes('Sure? Click again') && await page.isVisible('.docmenu'), 'Delete folder asks for a second click');
  await page.click('.docmenu [data-act=rmfolder]'); await page.waitForTimeout(300);
  ok(!(await tree()).includes('Banking') && (await tree()).includes('Bank notes') && !(await page.isVisible('.docmenu')), 'then it goes, and its notebook moves up: ' + await tree());
  ok((await toastText()).includes('moved up'), 'with a message');
  ok((await folderIn('Bank notes')) === null && (await stored()).folders.every(f => f.name !== 'Banking'), 'the notebook is at the top level and the folder is gone');
  await page.click('#trashBox [data-t=restore]'); await page.waitForTimeout(300);
  ok(await folderIn('Lecture 2') === null && (await tree()).split(',').includes('Lecture 2'), 'a notebook trashed in a deleted folder is restored at the top level');
  // delete a folder with a folder in it: contents move up one level, not to the top
  const cnt = (await stored()).folders.length;
  await menu(frow('Risk Management')); await page.click('.docmenu [data-act=rmfolder]'); await page.click('.docmenu [data-act=rmfolder]'); await page.waitForTimeout(300);
  ok((await tree()).startsWith('Archive[Credit') && (await folderNamed('Credit')).parent === (await folderNamed('Archive')).id && (await stored()).folders.length === cnt - 1, 'deleting Risk Management moves Credit up into Archive: ' + await tree());
  // a menu that is left alone relaxes: Delete folder needs two clicks again after reopening
  await menu(frow('Credit')); await page.click('.docmenu [data-act=rmfolder]'); await page.keyboard.press('Escape');
  await menu(frow('Credit'));
  ok((await page.textContent('.docmenu [data-act=rmfolder]')).trim() === 'Delete folder', 'reopening the menu starts again from “Delete folder”');
  await page.keyboard.press('Escape');

  // ---- both colour schemes ----
  await page.mouse.move(700, 500); await page.waitForTimeout(200);
  await page.locator('#pagesPanel').screenshot({path: path.join(OUT, 'folders-4-tree-light.png')});
  await page.emulateMedia({colorScheme: 'dark'}); await page.waitForTimeout(900);
  await dragTo(nbrow('Lecture 1'), frow('Archive'), {release: false});
  await page.screenshot({path: path.join(OUT, 'folders-5-dragging-dark.png'), clip: {x: 0, y: 0, width: 520, height: 800}});
  await page.mouse.up(); await page.waitForTimeout(250);
  await page.mouse.move(700, 500); await page.waitForTimeout(200);
  await page.locator('#pagesPanel').screenshot({path: path.join(OUT, 'folders-6-tree-dark.png')});
  await page.emulateMedia({colorScheme: 'light'});

  // ---- files without folders still behave: a damaged store is tidied ----
  await page.evaluate(async () => { const f = await get('folders'); f.push({id: 'fx1', name: 'Loop A', parent: 'fx2', open: true}, {id: 'fx2', name: 'Loop B', parent: 'fx1', open: true}, {id: 'fx3', name: 'Lost', parent: 'nope', open: true}, null); await putAll({folders: f}); const d = await get('docs'); d[0].folder = 'gone'; await putAll({docs: d}); });
  await page.reload(); await page.waitForTimeout(2200);
  const t2 = await tree();
  ok(t2.includes('Loop A') && t2.includes('Loop B') && t2.includes('Lost'), 'folders in a loop or with a lost parent still show (at the top level): ' + t2);
  ok((await page.$$eval('#docList > .nb', els => els.length)) >= 1 && (await page.$$eval('#docList .nb', els => els.length)) === (await page.evaluate(() => liveDocs().filter(d => !d.fav).length)), 'every notebook still shows, including the one whose folder is gone');

  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(n + ' ok');
})().catch(e => { console.error(e.message); process.exit(1); });

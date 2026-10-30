// Insert › File after: a file's pages go between the current page and the next one (as Blank page after does), for PDF,
// PowerPoint, Word and pictures; every page keeps its notes, the rest of the file gets its heading again, and Back takes it out in one step
const {open} = require('./harness'); const path = require('path');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  // what each page is (a PDF page by its stored picture, else its words) and the notes on it, in the notebook's order
  const pages = () => page.evaluate(() => [...document.querySelectorAll('#main .slide')].map(s => ({
    id: (u => u && 'pic:' + (assetOf.get(u) || u))((s.style.getPropertyValue('--pg').match(/url\(["']?(.*?)["']?\)$/) || [])[1]) || s.className.replace(/ target-page/, '') + ':' + s.textContent.slice(0, 40),
    notes: [...s.querySelectorAll('.notebox .mine')].map(m => m.textContent.trim()).filter(Boolean).sort().join('|'),
    side: [...(sideOf(s)?.querySelectorAll('.notebox .mine') || [])].map(m => m.textContent.trim()).filter(Boolean).join('|')})));
  // in the stored notebook, each side page right after its own page
  const sidesStored = () => page.evaluate(() => {
    const kids = [...new DOMParser().parseFromString(currentDoc(), 'text/html').body.children], slides = kids.filter(k => k.classList.contains('slide'));
    return slides.length > 0 && slides.every(s => s.nextElementSibling?.classList.contains('sidepage') && s.nextElementSibling.dataset.for === s.dataset.sid);
  });
  const heads = () => page.$$eval('#main .file-head', hs => hs.map(h => h.textContent));
  // wait until the file has been read: the page count stops changing
  const settle = async () => {
    let last = -1, same = 0;
    for (let k = 0; k < 120 && same < 3; k++) {
      await page.waitForTimeout(500);
      const n = await page.evaluate(() => document.querySelectorAll('#main .slide').length + (/^Opening/.test(document.querySelector('#toast').textContent) && document.querySelector('#toast').classList.contains('show') ? 1000 : 0));
      same = n === last ? same + 1 : 0; last = n;
    }
    await page.waitForTimeout(700);
  };
  const clickPage = async n => { const c = page.locator('#main .slide').nth(n); await c.scrollIntoViewIfNeeded(); await c.click({position: {x: 30, y: 30}}).catch(() => {}); };
  const addNote = async (n, text) => {
    const strip = page.locator('#main .slide').nth(n).locator('.strip').first(); await strip.scrollIntoViewIfNeeded();
    const b = await strip.boundingBox(); await page.mouse.move(b.x + 200, b.y + b.height / 2, {steps: 3}); await page.waitForTimeout(200);
    await page.click('.gappill'); await page.keyboard.type(text); await page.waitForTimeout(150);
    await page.mouse.click(5, 700); await page.waitForTimeout(300);
  };
  // pick page n (0-based), check the button points at it, and add a file after it
  const insertAfter = async (n, file) => {
    await clickPage(n); await page.click('#tab-insert');
    await page.hover('#addFileAfterBtn'); await page.waitForTimeout(150);
    const marked = await page.evaluate(n => document.querySelectorAll('#main .slide')[n].classList.contains('target-page') && document.querySelectorAll('#main .target-page').length === 1, n);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFileAfterBtn')]);
    await fc.setFiles(path.join(__dirname, file)); await settle();
    return marked;
  };
  // the pages before are unchanged, the new ones follow page n, then the rest come back in order, each with its notes
  const check = async (before, n, label) => {
    const now = await pages(), added = now.length - before.length;
    ok(added > 0, `${label}: its pages are added (${added})`);
    ok(JSON.stringify(now.slice(0, n + 1)) === JSON.stringify(before.slice(0, n + 1)), `${label}: pages 1–${n + 1} are as they were`);
    ok(JSON.stringify(now.slice(n + 1 + added)) === JSON.stringify(before.slice(n + 1)), `${label}: the pages that came after page ${n + 1} follow the new ones, each with its own notes`);
    ok(now.slice(n + 1, n + 1 + added).every(p => !before.some(b => b.id === p.id && !p.id.startsWith('slide'))), `${label}: the new pages sit right after page ${n + 1}`);
    return added;
  };

  // a 6-page PDF, with notes on pages 3, 4 and 6 and a sticky note on page 5
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('#main .pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(1200);
  await addNote(2, 'Note on page three'); await addNote(3, 'Note on page four'); await addNote(5, 'Note on page six');
  await clickPage(4); await page.click('#tab-insert'); await page.click('#stickyBtn'); await page.keyboard.type('Sticky on page five'); await page.mouse.click(5, 700); await page.waitForTimeout(800);
  // and side notes, with a note on page 4's side page
  await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(500);
  const sp4 = page.locator('#main .sidepage').nth(3); await sp4.scrollIntoViewIfNeeded();
  const sb = await sp4.boundingBox(); await page.mouse.click(sb.x + 50, sb.y + 140); await page.waitForTimeout(250);
  await page.keyboard.type('Side note for page four'); await page.mouse.click(5, 700); await page.waitForTimeout(800);
  const start = await pages();
  ok(start.length === 6 && start[2].notes === 'Note on page three' && start[4].notes === 'Sticky on page five' && start[3].side === 'Side note for page four', 'the PDF has its notes, sticky note and side note on the right pages');

  // PDF after page 2
  ok(await insertAfter(1, 'numbers.pdf'), 'pointing at File after marks the page it will follow');
  const pdfAdded = await check(start, 1, 'a PDF after page 2');
  let hs = await heads();
  ok(hs.length === 3 && hs[1] === 'numbers' && hs[2] === hs[0], `the new file has its heading, and the rest of the first file gets its own again (${hs.join(' / ')})`);
  ok(await page.evaluate(() => { const s = [...document.querySelectorAll('#main .slide')]; return (sideOf(s[1]) || s[1]).nextElementSibling?.classList.contains('file-head'); }), 'the heading sits between page 2 (and its side page) and the first new page');
  ok(/Added after page 2/.test(await page.textContent('#toast')), 'it says where the file went');
  ok(await sidesStored(), 'the new pages get side pages too, and each side page is stored right after its own page');
  ok(await page.evaluate(() => [...document.querySelectorAll('#main .slide')].every((s, i) => sideOf(s)?.dataset.label === 'Page ' + (i + 1))), 'the side pages are numbered again');
  // the sidebar's page list shows the pages in the same order, under the right headings
  const groups = await page.$$eval('#pageList li', ls => ls.map(l => l.classList.contains('group') ? 'H' : 'p').join(''));
  ok(groups === 'Hpp' + 'H' + 'p'.repeat(pdfAdded) + 'Hpppp', `the page list follows (${groups})`);

  // one step for Back, and Forward puts it back
  const inserted = await pages();
  await page.click('#tab-home'); await page.click('#undoBtn'); await page.waitForTimeout(800);
  ok(JSON.stringify(await pages()) === JSON.stringify(start) && (await heads()).length === 1, 'one Back takes the whole file out again, notes untouched');
  await page.click('#redoBtn'); await page.waitForTimeout(800);
  ok(JSON.stringify(await pages()) === JSON.stringify(inserted), 'Forward puts it back');

  // it is saved that way
  await page.waitForTimeout(1200); await page.reload(); await page.waitForTimeout(2500);
  ok(JSON.stringify(await pages()) === JSON.stringify(inserted), 'after a reload every page and note is where it was');
  // and the PDF download has every page, in this order
  const pdfCount = await page.evaluate(async () => { const f = await pdfFile(); return ((await f.blob.text()).match(/\/Type\s*\/Page[^s]/g) || []).length; });
  ok(pdfCount === inserted.length, `the downloaded PDF has every page (${pdfCount} of ${inserted.length})`);

  // a PowerPoint (as slides), a Word file and a picture, each in the middle somewhere
  let before = await pages();
  ok(await insertAfter(0, 'week2.pptx'), 'File after works from page 1');
  await check(before, 0, 'a PowerPoint after page 1');
  before = await pages();
  await page.evaluate(() => pref.set('pptx-mode', 'text'));
  await insertAfter(3, 'fid-rich.pptx');
  await check(before, 3, 'a PowerPoint as editable text after page 4');
  await page.evaluate(() => pref.set('pptx-mode', 'look'));
  before = await pages();
  const last = before.length - 2;
  await insertAfter(last, 'reading.docx');
  await check(before, last, `a Word file after page ${last + 1}`);
  before = await pages();
  await insertAfter(5, 'pic.png');
  ok(await check(before, 5, 'a picture after page 6') === 1, 'a picture is one page');
  // the first file's notes are still on their pages
  const fin = await pages(), noted = fin.filter(p => p.notes).map(p => p.notes);
  ok(JSON.stringify(noted) === JSON.stringify(['Note on page three', 'Note on page four', 'Sticky on page five', 'Note on page six']), 'every note is still on its own page, in order');
  // after the last page it is the same as Add a file here: at the end, with no extra heading
  before = await pages(); const h0 = (await heads()).length;
  await insertAfter(before.length - 1, 'pic.png');
  const end = await pages();
  ok(end.length === before.length + 1 && JSON.stringify(end.slice(0, -1)) === JSON.stringify(before) && (await heads()).length === h0 + 1, 'after the last page it goes at the end');
  await page.screenshot({path: path.join(__dirname, 'shots', 'insertfile.png')});

  // in A4 layout (pages on sheets) it goes in the same place
  await page.click('#tab-view'); await page.locator('select:has(option[value="a4-portrait"])').first().selectOption('a4-portrait'); await page.waitForTimeout(1200);
  before = await pages();
  await insertAfter(2, 'pic.png');
  await check(before, 2, 'a picture after page 3 in A4 layout');
  ok(await page.evaluate(() => [...document.querySelectorAll('#main .sheet')].every(s => s.querySelectorAll('.slide').length <= 1)), 'and every page has its own sheet');
  await page.click('#tab-view'); await page.locator('select:has(option[value="a4-portrait"])').first().selectOption('default'); await page.waitForTimeout(500);

  // a new notebook starts with a blank page (no file heading above it): the file goes after it, with only its own heading
  await page.click('#newDocBtn'); await page.waitForTimeout(600);
  await page.click('#tab-insert');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFileAfterBtn')]);
  await fc.setFiles(path.join(__dirname, 'pic.png')); await settle();
  const nb = await page.evaluate(() => [...document.querySelectorAll('#main .file-head, #main .slide')].map(e => e.matches('.file-head') ? 'H' : e.matches('.blankpage') ? 'b' : e.matches('.pagecard') ? 'p' : '').join(''));
  ok(nb === 'bHp', `in a new notebook the file goes after its blank page (${nb})`);
  // and another after that blank page goes between it and the first file's heading, with no extra heading
  await insertAfter(0, 'pic.png');
  const nb2 = await page.evaluate(() => [...document.querySelectorAll('#main .file-head, #main .slide')].map(e => e.matches('.file-head') ? 'H' : e.matches('.blankpage') ? 'b' : 'p').join(''));
  ok(nb2 === 'bHpHp', `a second file after the blank page goes before the first one (${nb2})`);

  // Ctrl+K has it too
  await page.keyboard.press('Control+k'); await page.waitForTimeout(300); await page.keyboard.type('file after'); await page.waitForTimeout(300);
  ok(/Insert a file after this page/.test(await page.textContent('#ckList')), 'Ctrl+K offers Insert a file after this page');
  await page.keyboard.press('Escape');
  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });

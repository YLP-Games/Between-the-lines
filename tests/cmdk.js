// Command search (Ctrl+K), notes as Markdown, Markdown files as pages, and the offline badge
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'md-'));
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, context, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);

  const pointAt = async (pi, frac, x = 260) => {
    const strip = page.locator('.pagecard').nth(pi).locator('.strip').first();
    await strip.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 120)); await page.waitForTimeout(300);
    const b = await strip.boundingBox();
    await page.mouse.move(b.x + x, b.y + b.height * frac, {steps: 4}); await page.waitForTimeout(250);
  };
  const away = async () => { await page.mouse.click(5, 700); await page.waitForTimeout(300); };

  // ---- set up: notes in the lecture (words, a bold word, a formula, a sticky note), then a second notebook ----
  await pointAt(2, 0.5);
  await page.click('.gappill'); await page.waitForTimeout(200);
  await page.keyboard.type('Quokka demand shifts right'); await away();
  await pointAt(3, 0.5);
  await page.click('.gappill'); await page.waitForTimeout(200);
  await page.keyboard.type('Revenue peaks where '); await page.keyboard.press('Control+b'); await page.keyboard.type('marginal'); await page.keyboard.press('Control+b');
  await page.keyboard.type(' cost meets it'); await away();
  await pointAt(1, 0.5);
  await page.click('.gappill', {button: 'right'}); await page.keyboard.type('eq'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  await page.keyboard.type('MR = (dTR)/(dQ)'); await page.waitForTimeout(300); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await away();
  await pointAt(4, 0.45, 420);
  await page.click('.gappill', {button: 'right'}); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await page.keyboard.type('Ask Zorro in the tutorial'); await away(); await page.waitForTimeout(900);
  ok(await page.locator('.notebox').count() === 4, 'four notes in the lecture');

  await page.setInputFiles('#file', path.join(__dirname, 'week2.pptx'));
  await page.waitForFunction(() => document.querySelectorAll('#docList .nb').length === 2, null, {timeout: 30000});
  await page.waitForTimeout(1000);
  ok((await page.textContent('#docTitle')).trim() === 'week2', 'week2 is open, as a second notebook');

  const shown = () => page.$$eval('.cmdk .iitem', els => els.map(e => e.querySelector('.nm > span').textContent));
  const secs = () => page.$$eval('.cmdk .isec', els => els.map(e => e.textContent));
  const picked = () => page.$eval('.cmdk .iitem[aria-selected="true"] .nm > span', e => e.textContent).catch(() => null);
  const settled = () => page.waitForFunction(() => !document.querySelector('.cmdk .iempty')?.textContent.startsWith('Looking'), null, {timeout: 10000});
  const search = async text => { await page.fill('.cmdk input', text); await settled(); await page.waitForTimeout(100); };
  const isOpen = () => page.isVisible('.cmdk');

  // ---- opening it ----
  ok(!(await isOpen()), 'closed to begin with');
  await page.keyboard.press('Control+k'); await page.waitForTimeout(200);
  ok(await isOpen(), 'Ctrl+K opens the search');
  ok(await page.evaluate(() => document.activeElement.matches('.cmdk input')), 'the search box has the cursor');
  ok(await page.getAttribute('.cmdk input', 'placeholder') === 'Search notebooks, pages and notes…', 'the box says what to search');
  ok((await secs()).join() === 'Recent notebooks,Actions', 'with nothing typed: Recent notebooks and Actions');
  const first = await shown();
  ok(first[0] === 'week2' && first[1] === 'lecture', 'recent notebooks: the one you just opened first');
  ok(first.includes('New notebook') && first.includes('Focus mode'), 'and a list of actions');
  ok((await page.textContent('.cmdk .ifoot')).trim() === '↑↓ to choose · Enter to open · Esc to close', 'the footer says which keys to use');
  ok(await picked() === 'week2', 'the first one is picked');
  const bx = await page.locator('.cmdk').boundingBox();
  ok(Math.abs(bx.x + bx.width / 2 - 720) < 2 && bx.width === 560 && bx.y > 40 && bx.y < 300, 'centred, 560 wide, in the top third');
  await page.screenshot({path: path.join(OUT, 'cmdk-1-start.png')});
  await page.keyboard.press('Control+k'); await page.waitForTimeout(150);
  ok(!(await isOpen()), 'Ctrl+K again closes it');
  await page.keyboard.press('Control+p'); await page.waitForTimeout(150);
  ok(await isOpen(), 'Ctrl+P opens it too');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(!(await isOpen()), 'Esc closes it');
  await page.click('#sideSearch'); await page.waitForTimeout(150);
  ok(await isOpen(), 'the sidebar’s Search opens it');
  await page.keyboard.press('Escape');

  // ---- keys and pointer ----
  await page.keyboard.press('Control+k'); await page.waitForTimeout(150);
  const n = (await shown()).length, idx = () => page.$eval('.cmdk .iitem[aria-selected="true"]', e => +e.dataset.i);
  await page.keyboard.press('ArrowDown'); ok(await idx() === 1, 'arrow down');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); ok(await idx() === n - 1, 'arrow up from the top wraps to the last');
  await page.keyboard.press('ArrowDown'); ok(await idx() === 0, 'arrow down from the last wraps to the first');
  await page.hover('.cmdk .iitem >> nth=3'); await page.waitForTimeout(100);
  ok(await idx() === 3, 'pointing at one highlights it');
  await page.keyboard.press('Escape');

  // ---- notes, in another notebook ----
  await page.keyboard.press('Control+k'); await page.waitForTimeout(100);
  await search('quokka');
  ok((await secs()).join() === 'Notes', 'a word from a note finds it under Notes');
  ok((await shown())[0] === 'Quokka demand shifts right', 'with the note’s words');
  ok((await page.textContent('.cmdk .iitem small')).trim() === 'lecture · Page 3', 'and its notebook and page');
  ok((await page.textContent('.cmdk mark')) === 'Quokka', 'the match is marked');
  await page.screenshot({path: path.join(OUT, 'cmdk-2-notes.png')});
  await page.emulateMedia({colorScheme: 'dark'}); await page.waitForTimeout(200);
  await page.screenshot({path: path.join(OUT, 'cmdk-3-dark.png')});
  await page.emulateMedia({colorScheme: 'light'});
  await search('uokka'); ok((await shown()).length === 0 && (await page.textContent('.cmdk .iempty')) === 'No results', 'a word has to match from its start');
  await search('quok dem'); ok((await shown()).length === 1, 'every typed word has to match');
  await search('quok zzz'); ok((await shown()).length === 0, 'and all of them');
  await search('QUOKKA'); ok((await shown()).length === 1, 'capital letters do not matter');
  await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
  ok(!(await isOpen()), 'Enter closes it');
  ok((await page.textContent('#docTitle')).trim() === 'lecture', 'Enter on a note in another notebook switches to that notebook');
  const note = page.locator('.notebox', {hasText: 'Quokka'});
  const nb = await note.boundingBox();
  ok(nb && nb.y > 90 && nb.y + nb.height < 900, 'and the note is in view');
  ok(await note.evaluate(b => b.classList.contains('flash') || b.contains(document.activeElement)), 'and marked');
  await away();

  // ---- notebooks and pages ----
  await page.keyboard.press('Control+k'); await page.waitForTimeout(100);
  await search('wee');
  ok((await secs()).join() === 'Notebooks' && (await shown()).join() === 'week2', 'typing a notebook’s name finds it');
  await page.keyboard.press('Enter'); await page.waitForTimeout(1000);
  ok((await page.textContent('#docTitle')).trim() === 'week2', 'Enter opens that notebook');
  await page.keyboard.press('Control+k'); await page.waitForTimeout(100);
  await search('equil');
  ok((await secs()).join() === 'Pages', 'a page title in the open notebook is found under Pages');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k'); await page.waitForTimeout(100);
  await page.click('.cmdk .iitem >> text=lecture'); await page.waitForTimeout(1000);
  ok(!(await isOpen()) && (await page.textContent('#docTitle')).trim() === 'lecture', 'clicking a recent notebook opens it');
  const titles = await page.evaluate(() => [...document.querySelectorAll('.slide')].map(pageTitle));
  console.log('    page titles: ' + JSON.stringify(titles));
  await page.keyboard.press('Control+k'); await page.waitForTimeout(100);
  await search('page 5');
  ok((await secs()).includes('Pages') && (await page.textContent('.cmdk .iitem small')).includes('Page 5'), 'typing page 5 finds page 5');
  await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
  const p5 = await page.locator('.slide').nth(4).boundingBox();
  ok(p5.y < 400 && p5.y + p5.height > 100, 'Enter scrolls to that page');

  // ---- limits: 6 in a section, 20 in all ----
  const caps = await page.evaluate(() => {
    const d0 = docs.length, fake = Array.from({length: 8}, (_, i) => ({id: 'fake' + i, name: 'note book ' + i, pages: 1, notes: 0, updated: 1}));
    docs.push(...fake);
    ck.pages = Array.from({length: 8}, (_, i) => ({i, title: 'note page ' + i, w: ckWords('note page ' + i)}));
    ck.cache.set(curId, {stamp: curDoc().updated, notes: Array.from({length: 9}, (_, i) => ({nth: i, page: 1, text: 'note ' + i}))});
    const r = ckBuild('note').map(s => [s.title, s.rows.length]);
    docs.length = d0; ck.cache.clear(); ck.pages = null;
    return r;
  });
  console.log('    ' + JSON.stringify(caps));
  ok(caps.every(([, k]) => k <= 6) && caps.reduce((a, [, k]) => a + k, 0) === 20 && caps.length === 4, 'at most 6 in a section and 20 in all');

  // ---- actions ----
  await page.keyboard.press('Control+k'); await page.waitForTimeout(100);
  await search('focus');
  ok((await secs()).join() === 'Actions' && (await shown()).join() === 'Focus mode', 'actions are found by name');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.body.classList.contains('focus')), 'Focus mode turns on');
  await page.keyboard.press('Control+k'); await page.waitForTimeout(100);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(!(await isOpen()) && await page.evaluate(() => document.body.classList.contains('focus')), 'Esc closes the search first and leaves focus mode on');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(!(await page.evaluate(() => document.body.classList.contains('focus'))), 'and the next Esc leaves focus mode');
  await page.keyboard.press('Control+k'); await search('study');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('#readBtn').getAttribute('aria-pressed') === 'true'), 'Study mode turns on');
  await page.click('#readBtn'); await page.waitForTimeout(200);
  await page.keyboard.press('Control+k'); await search('new note');
  ok((await shown()).join() === 'New notebook', 'New notebook is an action');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k'); await search('open a');
  const chp = page.waitForEvent('filechooser', {timeout: 5000}); await page.waitForTimeout(300); await page.keyboard.press('Enter'); const chooser = await chp;
  ok(!!chooser, 'Open a file asks for a file');
  await page.keyboard.press('Control+k'); await search('notes');
  ok((await shown()).join() === 'Quokka' || (await secs()).includes('Actions'), 'Notes list, and hide or show notes, are actions');
  ok((await page.$$eval('.cmdk .iitem .nm > span', els => els.map(e => e.textContent))).some(t => t === 'Hide or show notes'), 'Hide or show notes is listed');
  await page.keyboard.press('Escape');

  // ---- Markdown out ----
  await page.click('#save'); await page.waitForTimeout(150);
  const items = await page.$$eval('#saveMenu button[data-kind]', els => els.map(e => [e.dataset.kind, e.querySelector('strong').textContent, e.querySelector('small').textContent]));
  ok(items.length === 3 && items[2][0] === 'markdown' && items[2][1] === 'Notes as Markdown' && items[2][2] === 'Every note, by page, to paste into Notion or anywhere', 'the Download menu has Notes as Markdown after Notebook file');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#saveMenu [data-kind=markdown]')]);
  ok(dl.suggestedFilename() === 'lecture (notes).md', 'it downloads <notebook> (notes).md: ' + dl.suggestedFilename());
  const md = fs.readFileSync(await dl.path(), 'utf8');
  console.log(md.split('\n').map(l => '    | ' + l).join('\n'));
  ok(md.startsWith('# lecture\n\n'), 'starts with the notebook name');
  ok(/^## Page 2( · .+)?$/m.test(md) && /^## Page 3( · .+)?$/m.test(md) && /^## Page 5( · .+)?$/m.test(md) && !/^## Page 1\b/m.test(md), 'a heading for each page that has notes');
  ok(md.includes('Quokka demand shifts right'), 'the note text');
  ok(md.includes('Revenue peaks where **marginal** cost meets it'), 'bold');
  ok(md.includes('$MR = (dTR)/(dQ)$'), 'a formula as $…$');
  ok(/^> Ask Zorro in the tutorial$/m.test(md), 'a sticky note is quoted');
  ok(md.indexOf('Page 2') < md.indexOf('Page 3') && md.indexOf('Page 3') < md.indexOf('Page 4') && md.indexOf('Page 4') < md.indexOf('Page 5'), 'in page order');
  // from the search too
  await page.keyboard.press('Control+k'); await search('notes as markdown');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  ok(dl2.suggestedFilename() === 'lecture (notes).md', 'Download notes as Markdown works from the search');
  // the converter on lists, line breaks, pictures
  const conv = await page.evaluate(() => {
    const m = document.createElement('div');
    m.innerHTML = 'Intro<br>second line<ul><li>one<ul><li>deep</li></ul></li><li><i>two</i></li></ul><ol><li>a</li><li>b</li></ol><div>after</div>x <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="> y <span class="formula" data-src="x^2"><span>junk</span></span>';
    return noteMarkdown(m);
  });
  console.log(conv.split('\n').map(l => '    | ' + l).join('\n'));
  ok(/^Intro {2}\nsecond line\n- one\n {2}- deep\n- \*two\*\n\n1\. a\n2\. b\n/.test(conv) && conv.includes('(picture)') && conv.includes('$x^2$') && !conv.includes('junk'), 'lists, line breaks, pictures and formulas');

  // ---- Markdown in ----
  const mdFile = path.join(TMP, 'study-notes.md');
  fs.writeFileSync(mdFile, '# Study sheet\n\nSome **bold** words, *italic* ones, `code` and [a link](https://example.org).\nA second line.\n\n- first item\n- second item\n  - nested\n\n1. one\n2. two\n\n## Next <script>window.__x=1</script>\n\n> a quote\n\n```\nlet a = 1 < 2;\n```\n\nLast paragraph.\n');
  const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#openBtn')]);
  ok((await chooser2.isMultiple()), 'the file picker is open');
  await chooser2.setFiles(mdFile);
  await page.waitForFunction(() => document.querySelectorAll('#docList .nb').length === 3, null, {timeout: 30000});
  await page.waitForTimeout(800);
  ok((await page.textContent('#docTitle')).trim() === 'study-notes', 'a .md file opens as its own notebook');
  const content = page.locator('.slide .content').first();
  ok(await page.getAttribute('#file', 'accept').then(a => /\.md/.test(a) && /\.markdown/.test(a) && /\.txt/.test(a)), 'the file input accepts .md, .markdown and .txt');
  ok(await content.locator('h1').textContent() === 'Study sheet' && await content.locator('h2').count() === 1, 'headings');
  ok(await content.locator('b').textContent() === 'bold' && await content.locator('i').textContent() === 'italic' && await content.locator('p code').textContent() === 'code', 'bold, italic and code');
  ok((await content.locator('p').first().textContent()).includes('a link (https://example.org)') && await content.locator('a').count() === 0, 'a link is plain text');
  ok(await content.locator('ul > li').count() === 3 && await content.locator('ol > li').count() === 2, 'bullet and numbered lists');
  ok(await content.locator('ul ul > li').count() === 1, 'a nested list');
  ok(await content.locator('h2').textContent() === 'Next <script>window.__x=1</script>' && await page.evaluate(() => !window.__x && !document.querySelector('.slide script')), 'raw HTML in the file is shown as text, never kept');
  ok(await content.locator('pre code').textContent() === 'let a = 1 < 2;' && await content.locator('blockquote').count() === 1, 'a code block and a quote');
  ok(await content.evaluate(c => [...c.children].every(e => e.classList.contains('blk'))), 'every top-level piece is a blk');
  ok(await content.locator('li.blk').count() === 5, 'and so is every list item');
  ok(await content.locator('p').first().evaluate(p => p.innerHTML.includes('<br>')) === false, 'two lines in a paragraph are joined');
  await page.waitForTimeout(300);
  // a note can be added between two pieces
  const para = page.locator('.slide .content p.blk').first();
  const pb = await para.boundingBox();
  await page.mouse.click(pb.x + pb.width - 6, pb.y + 4); await page.waitForTimeout(400);
  ok(await para.evaluate(p => p.nextElementSibling?.classList.contains('notebox')), 'a click beside a paragraph adds a note after it');
  await page.keyboard.type('Remember this'); await away(); await page.waitForTimeout(900);
  ok((await page.textContent('.notebox .mine')).includes('Remember this'), 'and you can write in it');
  await page.keyboard.press('Control+k'); await search('study');
  ok((await secs()).join().startsWith('Notebooks'), 'the new notebook is found by name');
  ok((await page.textContent('.cmdk .iitem small')).trim() === '1 page · 1 note', 'with its page and note counts');
  await page.keyboard.press('Escape');

  // a plain text file keeps its lines
  const txt = path.join(TMP, 'plain.txt');
  fs.writeFileSync(txt, 'First line\nSecond line\n\nThird after a gap\n');
  await page.setInputFiles('#file', txt);
  await page.waitForFunction(() => document.querySelectorAll('#docList .nb').length === 4, null, {timeout: 30000});
  await page.waitForTimeout(500);
  ok(await page.locator('.slide .content p.blk').count() === 3, 'a .txt file: a paragraph for each line');
  // an empty file says so
  const empty = path.join(TMP, 'empty.md'); fs.writeFileSync(empty, '\n\n');
  await page.setInputFiles('#file', empty); await page.waitForTimeout(800);
  ok((await page.textContent('#toast')).includes('empty.md'), 'an empty file gets a message');

  // ---- help list ----
  await page.click('#helpBtn'); await page.waitForTimeout(200);
  ok((await page.textContent('.keys')).includes('Ctrl K / Ctrl P'), 'the shortcut is in the Help list');
  const dts = await page.$$eval('.keys dt', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(dts.indexOf('Ctrl K / Ctrl P') === dts.indexOf('/') - 1, 'just before the / row');
  await page.keyboard.press('Escape');

  // ---- offline ----
  ok(!(await page.isVisible('#offline')), 'no offline badge while online');
  ok((await page.$eval('#offline', e => e.previousElementSibling.id)) === 'saveState', 'the badge sits right after the saved note');
  await context.setOffline(true); await page.waitForTimeout(300);
  ok(await page.isVisible('#offline') && (await page.textContent('#offline')).trim() === 'Offline', 'offline: the badge shows');
  ok(await page.evaluate(() => (document.querySelector('#offline').title || document.querySelector('#offline').dataset.tip) === 'Offline: your notes still save in this browser. Opening a file for the first time and spell check need the internet.'), 'with its explanation');
  await page.screenshot({path: path.join(OUT, 'cmdk-4-offline.png'), clip: {x: 0, y: 0, width: 1440, height: 60}});
  await page.setViewportSize({width: 1000, height: 800}); await page.waitForTimeout(300);
  ok(await page.isVisible('#offline') && !(await page.isVisible('#offline span')), 'under 1100px only the icon shows');
  await page.setViewportSize({width: 1440, height: 900});
  await context.setOffline(false); await page.waitForTimeout(300);
  ok(!(await page.isVisible('#offline')), 'back online: the badge goes');
  // at start-up
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'onLine', {get: () => false, configurable: true}));
  await page.reload(); await page.waitForTimeout(1500);
  ok(await page.isVisible('#offline'), 'offline at start-up: the badge shows');

  // ---- a phone ----
  await page.setViewportSize({width: 390, height: 800}); await page.waitForTimeout(400);
  await page.keyboard.press('Control+k'); await page.waitForTimeout(250);
  const pb2 = await page.locator('.cmdk').boundingBox();
  ok(pb2.x >= 15 && pb2.x + pb2.width <= 376, 'on a phone the search fits the screen');
  await page.screenshot({path: path.join(OUT, 'cmdk-5-phone.png')});
  await page.keyboard.press('Escape');

  await browser.close();
  fs.rmSync(TMP, {recursive: true, force: true});
  const errs = errors.filter(e => !/ERR_FAILED|net::|nothing in it|readMarkdown|openFiles/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

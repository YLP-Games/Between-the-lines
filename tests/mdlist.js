// Markdown-style lists: "1. ", "- " or "* " at the start of a line starts a list in a note
const {open} = require('./harness'); const path = require('path');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(600);
  const newNote = async i => {
    await page.mouse.click(5, 700); await page.waitForTimeout(300);
    const strip = page.locator('.pagecard').nth(i).locator('.strip').last(); await strip.scrollIntoViewIfNeeded();
    const b = await strip.boundingBox(); await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2, {steps: 3}); await page.waitForTimeout(200);
    await page.click('.gappill'); await page.waitForTimeout(200);
    return page.locator('.pagecard').nth(i).locator('.mine').last();
  };
  const shape = note => note.evaluate(n => ({html: n.innerHTML, lists: [...n.querySelectorAll('ul, ol')].map(l => l.tagName + (l.start > 1 ? '@' + l.start : '') + ':' + [...l.children].filter(c => c.tagName === 'LI').map(li => li.firstChild?.textContent.replace(/ /g, ' ') ?? '').join('|')), caretLi: !!getSelection().anchorNode?.parentElement?.closest('li') || getSelection().anchorNode?.nodeName === 'LI'}));

  // ---- "- " starts a bulleted list; the dash and space go, the cursor is in the new item ----
  let note = await newNote(1);
  await page.keyboard.type('- ');
  let s = await shape(note);
  ok(s.lists.length === 1 && s.lists[0].startsWith('UL:') && s.caretLi, '"- " makes a bulleted list with the cursor in it (' + s.html + ')');
  ok(!/^[-*]|>-/.test(s.html.replace(/<[^>]+>/g, m => m === '<li>' ? '>' : '')), 'the "- " itself is gone');
  await page.keyboard.type('apples'); await page.keyboard.press('Enter'); await page.keyboard.type('pears');
  s = await shape(note);
  ok(s.lists[0] === 'UL:apples|pears', 'Enter adds the next item (' + s.lists + ')');
  await page.keyboard.press('Tab'); await page.waitForTimeout(100);
  const nested = await note.evaluate(n => { const li = [...n.querySelectorAll('ul ul li')].pop(); return li && {text: li.textContent, style: getComputedStyle(li.parentElement).listStyleType}; });
  ok(nested?.text === 'pears' && nested.style === 'circle', 'Tab indents it to the next level, which has its own bullet (' + JSON.stringify(nested) + ')');
  await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(100);
  ok(await note.evaluate(n => !n.querySelector('ul ul') && [...n.querySelectorAll('li')].map(l => l.textContent).join('|') === 'apples|pears'), 'Shift+Tab brings it back');

  // ---- Enter on an empty item leaves the list; "1. " then starts a numbered one ----
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await page.keyboard.type('1. '); await page.keyboard.type('first'); await page.keyboard.press('Enter'); await page.keyboard.type('second');
  s = await shape(note);
  ok(s.lists.length === 2 && s.lists[1] === 'OL:first|second', '"1. " on a new line makes a numbered list (' + s.lists + ')');
  ok(!/1\.\s/.test(await note.textContent()), 'the "1. " itself is gone');
  await page.mouse.click(5, 700); await page.waitForTimeout(700);

  // ---- "* " too; "3. " counts from 3; only the line it is typed on becomes the list ----
  note = await newNote(2);
  await page.keyboard.type('Shopping'); await page.keyboard.press('Enter'); await page.keyboard.type('* milk');
  s = await shape(note);
  ok(s.lists.join() === 'UL:milk' && /^Shopping/.test(await note.textContent()) && await note.evaluate(n => !n.querySelector('li')?.textContent.includes('Shopping')), '"* " after a line of text lists only its own line (' + s.html + ')');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.type('3. third');
  s = await shape(note);
  ok(s.lists[1] === 'OL@3:third', '"3. " starts the numbering at 3 (' + s.lists + ')');
  await page.mouse.click(5, 700); await page.waitForTimeout(700);

  // ---- not in the middle of a line, and not for "1." without a space ----
  note = await newNote(3);
  await page.keyboard.type('pros - cons * maybe 1. no');
  ok(await note.evaluate(n => !n.querySelector('ul, ol')), 'a dash, star or number in the middle of a line stays as text');
  await page.keyboard.press('Enter'); await page.keyboard.type('1.5 litres');
  ok(await note.evaluate(n => !n.querySelector('ul, ol')), '"1.5" is not a list');
  await page.mouse.click(5, 700); await page.waitForTimeout(700);

  // ---- Back undoes the list but keeps what you typed ----
  note = await newNote(4);
  await page.keyboard.type('- ');
  ok(await note.evaluate(n => !!n.querySelector('ul')), 'a list again');
  await page.waitForTimeout(700);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(700);
  const back = await page.locator('.pagecard').nth(4).locator('.mine').last().evaluate(n => ({list: !!n.querySelector('ul'), text: n.textContent.replace(/ /g, ' ')}));
  ok(!back.list && back.text.startsWith('- '), 'Back turns it back into the "- " you typed (' + JSON.stringify(back) + ')');
  await page.mouse.click(5, 700); await page.waitForTimeout(400);

  // ---- never inside a journal entry or a table ----
  await page.click('#tab-insert'); await page.locator('.pagecard').nth(5).scrollIntoViewIfNeeded();
  const strip = page.locator('.pagecard').nth(5).locator('.strip').last();
  const sb = await strip.boundingBox(); await page.mouse.move(sb.x + sb.width * 0.6, sb.y + sb.height / 2, {steps: 3}); await page.waitForTimeout(200);
  await page.click('#jeBtn'); await page.waitForTimeout(400);
  await page.keyboard.type('- Cash');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await page.evaluate(() => document.querySelector('.jrnl .j-desc')?.focus());
  await page.keyboard.type('1. note * this');
  const j = await page.evaluate(() => { const b = document.querySelector('.jrnl'); return {lists: b.closest('.mine').querySelectorAll('ul, ol').length, acct: b.querySelector('.j-acct').textContent.replace(/ /g, ' '), desc: b.querySelector('.j-desc').textContent.replace(/ /g, ' ')}; });
  ok(j.lists === 0 && j.acct === '- Cash' && j.desc === '1. note * this', 'a journal entry keeps "- " and "1. " as text (' + JSON.stringify(j) + ')');
  await page.mouse.click(5, 700); await page.waitForTimeout(400);
  await page.locator('.pagecard').nth(0).scrollIntoViewIfNeeded();
  const b0 = await page.locator('.pagecard').nth(0).locator('.strip').last().boundingBox();
  await page.mouse.move(b0.x + b0.width * 0.6, b0.y + b0.height / 2, {steps: 3}); await page.waitForTimeout(200);
  await page.click('#tblBtn'); await page.waitForSelector('.tblpick'); await page.click('.tp-g > i >> nth=11'); await page.waitForTimeout(400);
  await page.keyboard.type('- a'); await page.keyboard.press('Tab'); await page.keyboard.type('1. b');
  const t = await page.evaluate(() => ({lists: document.querySelectorAll('.wtable ul, .wtable ol').length, cells: [...document.querySelectorAll('.wtable td')].slice(0, 2).map(c => c.textContent.replace(/\u00a0/g, ' '))}));
  ok(t.lists === 0 && t.cells.join('|') === '- a|1. b', 'table cells keep "- " and "1. " as text (' + JSON.stringify(t) + ')');
  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

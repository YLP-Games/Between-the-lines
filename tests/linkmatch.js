// Link to side note asks how the colours match: the note takes the highlight's colour, or the highlight takes the note's; Always do this, and Help & settings
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const GREEN = '#a7e3a1';

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);
  await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(800);
  const ink = () => page.evaluate(() => JSON.parse(document.querySelectorAll('.pagecard')[2].dataset.ink || '[]').filter(x => x.k === 'mark'));
  const select = async txt => {
    await page.evaluate(txt => [...document.querySelectorAll('.pagecard')[2].querySelectorAll('.tl')].find(s => s.textContent.includes(txt)).scrollIntoView({block: 'center'}), txt);
    await page.waitForTimeout(300);
    const b = await page.evaluate(txt => { const r = [...document.querySelectorAll('.pagecard')[2].querySelectorAll('.tl')].find(s => s.textContent.includes(txt)).getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; }, txt);
    await page.mouse.move(b.x + b.w * .5, b.y + b.h / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.w * .98, b.y + b.h / 2, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(250);
  };
  const away = async () => { await page.mouse.click(5, 700); await page.waitForTimeout(400); };
  const noteLook = t => page.evaluate(t => { const b = [...document.querySelectorAll('.sidepage .notebox')].find(x => x.textContent.includes(t)); return b && {color: toHex(getComputedStyle(b.querySelector('.mine')).color), chip: chipOf(b)}; }, t);

  // the Box tab has no presets now
  await page.click('#tab-box'); await page.waitForTimeout(150);
  ok(!(await page.$('#bPreset')) && !(await page.$('#bPresetEdit')), 'the Box tab has no presets list');
  ok(await page.evaluate(() => localStorage.getItem('link-match')) === null && await page.$eval('#setLinkMatch', s => s.value) === 'ask', 'Link to side note asks each time, to begin with');

  // a green highlight, and Link to side note: the question
  await page.evaluate(c => { hlCol = c; }, GREEN);
  await select('economic profit');
  await page.click('#annoBar [data-side]'); await page.waitForTimeout(250);
  ok(await page.isVisible('#linkAsk') && await page.locator('#linkAsk .lkopt').count() === 3, 'Link to side note asks how the colours should match (three choices)');
  ok((await page.textContent('#linkAsk')).includes('Note matches the highlight') && (await page.textContent('#linkAsk')).includes('Highlight matches the note'), 'the note matches the highlight, or the highlight matches the note');
  ok((await ink()).length === 0 && (await page.evaluate(() => getSelection().toString())).includes('profit'), 'nothing is highlighted yet, and the words stay selected');
  await page.screenshot({path: path.join(OUT, 'linkmatch-1-ask.png')});
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(!(await page.isVisible('#linkAsk')) && (await ink()).length === 0, 'Esc closes it without highlighting');

  // Note matches the highlight
  await select('economic profit');
  await page.click('#annoBar [data-side]'); await page.waitForTimeout(250);
  await page.click('#linkAsk .lkopt[data-m="note"]'); await page.waitForTimeout(500);
  let marks = await ink();
  ok(marks.length === 1 && marks[0].c === GREEN, 'the words are highlighted green');
  ok(await page.evaluate(() => document.activeElement.matches('.sidepage .mine')), 'and a side note opens with the cursor in it');
  await page.keyboard.type('Green words'); await away();
  let l = await noteLook('Green words');
  const ink1 = await page.evaluate(c => hlInk(c), GREEN);
  ok(l.color === ink1 && l.chip === ink1, `its words and pencil icon are a deeper green (${l.color})`);
  ok(/^#[0-9a-f]{6}$/.test(ink1) && parseInt(ink1.slice(3, 5), 16) > parseInt(ink1.slice(1, 3), 16), 'a green you can read');

  // Highlight matches the note
  await select('identical products');
  await page.click('#annoBar [data-side]'); await page.waitForTimeout(250);
  await page.click('#linkAsk .lkopt[data-m="hl"]'); await page.waitForTimeout(500);
  await page.keyboard.type('Blue words'); await away();
  l = await noteLook('Blue words');
  marks = await ink();
  const tint = await page.evaluate(c => hlTint(c), l.color);
  ok(l.color === '#1f4fd1' && l.chip === '#1f4fd1', 'the note keeps the style for new notes (blue words), and its pencil icon is blue too');
  ok(marks.length === 2 && marks[1].c === tint, `the highlight is a light blue to match (${tint})`);
  ok(await page.evaluate(() => hlCol) === GREEN, 'and the colour for the next highlight is still green');
  await page.screenshot({path: path.join(OUT, 'linkmatch-2-both.png')});

  // Always do this
  await select('Short run');
  await page.click('#annoBar [data-side]'); await page.waitForTimeout(250);
  await page.check('#linkAsk [data-remember]');
  await page.click('#linkAsk .lkopt[data-m="note"]'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => localStorage.getItem('link-match')) === 'note' && await page.$eval('#setLinkMatch', s => s.value) === 'note', 'Always do this is kept, and Help & settings shows it');
  await page.keyboard.type('Third'); await away();
  await select('Each firm');
  await page.click('#annoBar [data-side]'); await page.waitForTimeout(500);
  ok(!(await page.isVisible('#linkAsk')) && (await ink()).length === 4, 'next time it does not ask');
  await page.keyboard.type('Fourth'); await away();
  ok((await noteLook('Fourth')).color === ink1, 'and the note matches the highlight');
  // Help & settings: back to asking
  await page.evaluate(() => { const s = document.getElementById('setLinkMatch'); s.value = 'ask'; s.dispatchEvent(new Event('change')); });
  await select('Long run');
  await page.click('#annoBar [data-side]'); await page.waitForTimeout(250);
  ok(await page.isVisible('#linkAsk'), 'Ask each time in Help & settings brings the question back');
  await page.click('#linkAsk .lkopt[data-m="none"]'); await page.waitForTimeout(500);
  await page.keyboard.type('Plain'); await away();
  ok((await noteLook('Plain')).color === '#1f4fd1' && (await ink()).at(-1).c === GREEN, 'Keep both as they are: a blue note, a green highlight');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

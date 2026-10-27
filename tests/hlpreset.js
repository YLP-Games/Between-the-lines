// Highlight shortcuts (Help & settings › Box presets): a preset joined to a highlight colour; with the setting on, a side note linked to a highlight
// of that colour takes that preset (made from it, or joined to it as its first link), and follows the highlight to a new colour
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const GREEN = '#a7e3a1', BLUE = '#a5d8ff';

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.evaluate(() => localStorage.setItem('link-match', 'none'));      // (Link to side note: no question, both keep their colours)
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);
  await page.click('#tab-view'); await page.click('#sideBtn'); await page.waitForTimeout(800);
  const wordsAt = async txt => {
    const get = () => page.evaluate(txt => {
      const sp = [...document.querySelectorAll('.pagecard')[2].querySelectorAll('.tl')].find(s => s.textContent.includes(txt));
      sp.scrollIntoView({block: 'center'});
      const r = sp.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height};
    }, txt);
    await get(); await page.waitForTimeout(250); return get();
  };
  const select = async txt => {
    const b = await wordsAt(txt);
    await page.mouse.move(b.x + b.w * .5, b.y + b.h / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.w * .98, b.y + b.h / 2, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(250);
  };
  const away = async () => { await page.mouse.click(5, 700); await page.waitForTimeout(400); };
  // highlight the words in a colour and open a side note for them
  const sideNote = async (txt, col, text) => {
    await page.evaluate(c => { hlCol = c; }, col);
    await select(txt);
    await page.click('#annoBar [data-side]'); await page.waitForTimeout(500);
    await page.keyboard.type(text);
  };
  const note = t => page.locator('.sidepage').nth(2).locator('.notebox').filter({hasText: t});
  const look = t => note(t).evaluate(b => { const l = lookOf(b), m = b.querySelector('.mine'); return {...l, cs: getComputedStyle(m).color, fw: getComputedStyle(m).fontWeight}; });
  const card = id => `#presetList .preset[data-id="${id}"]`;
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('box-presets') || 'null'));

  // ================= 1. Help & settings › Box presets =================
  await page.evaluate(() => openSettings()); await page.waitForTimeout(300);
  ok(await page.isVisible('#setHlPreset') && !(await page.isChecked('#setHlPreset')), 'Highlight shortcuts is in Box presets, off to start with');
  ok(await page.locator('#presetList .phlsel').count() === 4, 'every preset card has a Highlight list');
  const opts = await page.$$eval(card('key') + ' .phlsel option', o => o.map(x => x.textContent));
  ok(opts.join() === 'None,Yellow,Green,Blue,Pink,Orange,Purple', 'None and the six highlight colours: ' + opts.join(', '));
  ok(await page.$eval(card('key') + ' .phlsel', s => s.value) === '', 'joined to none at first');

  await page.selectOption(card('ask') + ' .phlsel', GREEN); await page.waitForTimeout(200);
  ok((await stored()).find(p => p.id === 'ask').hl === GREEN, 'joining Question to green is kept');
  ok((await page.textContent('#toast')).includes('Turn on Highlight shortcuts'), 'with the setting off, the message says to turn it on');
  ok((await page.$$eval(card('key') + ' .phlsel option', o => o.map(x => x.textContent))).includes('Green · Question'), 'another card shows that green is Question\'s');
  // a colour goes to one preset only
  await page.selectOption(card('key') + ' .phlsel', GREEN); await page.waitForTimeout(200);
  let st = await stored();
  ok(st.find(p => p.id === 'key').hl === GREEN && st.find(p => p.id === 'ask').hl === null, 'giving green to Important takes it from Question');
  ok(await page.$eval(card('ask') + ' .phlsel', s => s.value) === '' && await page.$eval(card('key') + ' .phdot', d => getComputedStyle(d).backgroundColor) === 'rgb(167, 227, 161)', 'the cards show it, with a green dot');
  await page.selectOption(card('ask') + ' .phlsel', BLUE); await page.waitForTimeout(200);
  ok((await page.$$('#presetList.hloff')).length === 1, 'the Highlight lists are faded while the setting is off');
  await page.screenshot({path: path.join(OUT, 'hlpreset-1-settings.png')});
  await page.click('#setClose'); await page.waitForTimeout(300);

  // ================= 2. off: side notes start as usual =================
  await sideNote('economic profit', GREEN, 'Off note'); await away();
  let l = await look('Off note');
  ok(l.color === '#1f4fd1' && l.chip !== '#ef5350', 'with the setting off, a note for a green highlight starts in the style for new notes');

  // ================= 3. on =================
  await page.evaluate(() => openSettings()); await page.waitForTimeout(200);
  await page.check('#setHlPreset'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => localStorage.getItem('hl-preset')) === '1' && (await page.$$('#presetList.hloff')).length === 0, 'turning it on is kept');
  await page.click('#setClose'); await page.waitForTimeout(300);

  await sideNote('identical products', GREEN, 'Green note');
  await page.click('#tab-box'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => sameLook(presets.find(p => p.id === 'key'), lookOf(active.closest('.notebox')))), 'a new note for a green highlight is Important');
  await away();
  l = await look('Green note');
  ok(l.color === '#c62828' && l.cs === 'rgb(198, 40, 40)' && l.b && +l.fw >= 600 && l.chip === '#ef5350', 'its words are red and bold, its pencil icon red');
  await page.screenshot({path: path.join(OUT, 'hlpreset-2-green.png')});

  await sideNote('Perfect', '#ffe066', 'Yellow note'); await away();
  l = await look('Yellow note');
  ok(l.color === '#1f4fd1' && !l.b, 'a yellow highlight (no shortcut) gives the style for new notes');

  // ================= 4. the highlight changes colour: its note follows =================
  let w = await wordsAt('identical products');
  await page.mouse.click(w.x + w.w * .8, w.y + w.h / 2); await page.waitForTimeout(300);
  await page.click(`#annoPop .hcrow .hdot[data-c="${BLUE}"]`); await page.waitForTimeout(300);
  await away();
  l = await look('Green note');
  ok(l.color === '#7b1fa2' && !l.b && l.chip === '#ab47bc', 'made blue, the highlight\'s note becomes Question');
  // a note you've styled yourself stays as it is
  await note('Green note').evaluate(b => { b.querySelector('.mine').style.color = '#123456'; });
  w = await wordsAt('identical products');
  await page.mouse.click(w.x + w.w * .8, w.y + w.h / 2); await page.waitForTimeout(300);
  await page.click(`#annoPop .hcrow .hdot[data-c="${GREEN}"]`); await page.waitForTimeout(300);
  await away();
  ok((await look('Green note')).color === '#123456', 'a note restyled by hand keeps its look when the colour changes');

  // ================= 5. joining a note you already wrote =================
  const sp = await page.locator('.sidepage').nth(2).boundingBox();
  await page.mouse.click(sp.x + 60, sp.y + sp.height - 120); await page.waitForTimeout(400);
  await page.keyboard.type('Older note'); await away();
  ok((await look('Older note')).color === '#1f4fd1', 'a note written on the side page starts as usual');
  await page.evaluate(() => { const sp = [...document.querySelectorAll('.pagecard')[2].querySelectorAll('.tl')].find(s => s.textContent.includes('barriers')), r = document.createRange(); r.selectNodeContents(sp); getSelection().removeAllRanges(); getSelection().addRange(r); checkSelection(); });      // (a drag there lands on the gap between lines)
  await page.click(`#annoBar .hdot[data-c="${BLUE}"]`); await page.waitForTimeout(300);      // (a blue highlight with no note)
  await away();
  w = await wordsAt('barriers');
  await page.mouse.click(w.x + w.w * .8, w.y + w.h / 2); await page.waitForTimeout(300);
  await page.click('#annoPop [data-a=sidepick]'); await page.waitForTimeout(300);
  let nb = await note('Older note').boundingBox();
  await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2); await page.waitForTimeout(400);
  await away();
  l = await look('Older note');
  ok(await note('Older note').getAttribute('data-link') && l.color === '#7b1fa2' && l.chip === '#ab47bc', 'joining it (its first link) to a blue highlight makes it Question');
  // a second link leaves it be
  w = await wordsAt('identical products');
  await page.mouse.click(w.x + w.w * .8, w.y + w.h / 2); await page.waitForTimeout(300);
  await page.click('#annoPop [data-a=sidepick]'); await page.waitForTimeout(300);
  nb = await note('Older note').boundingBox();
  await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2); await page.waitForTimeout(400);
  await away();
  l = await look('Older note');
  ok((await note('Older note').getAttribute('data-link')).split(' ').length === 2 && l.color === '#7b1fa2', 'a second line (to a green highlight) doesn\'t change it');

  // ================= 6. the command palette, and Reset =================
  await page.evaluate(() => setHlPreset(!hlPresetOn())); await page.waitForTimeout(200);
  ok(await page.evaluate(() => localStorage.getItem('hl-preset')) === '0', 'it can be turned off again');
  await page.evaluate(() => openSettings()); await page.waitForTimeout(200);
  ok(!(await page.isChecked('#setHlPreset')), 'and the box in settings follows');
  await page.click('#presetReset'); await page.click('#presetReset'); await page.waitForTimeout(200);
  ok((await stored()).every(p => p.hl === null), 'Reset clears the shortcuts');

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

// Box presets: a note's font, size, bold / italic / underline, text colour and pencil icon colour in one go, from the Box tab;
// changed, added, removed and reset in Help & settings › Box presets; PowerPoint speaker notes arrive as the Speaker notes preset
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

// fid-rich.pptx with speaker notes on its first slide
async function makeDeck(){
  const z = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, 'fid-rich.pptx')));
  const P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  z.file('ppt/notesSlides/notesSlide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes ${P}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="3" name="body 3"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Ask about the </a:t></a:r><a:r><a:rPr b="1"/><a:t>kinked</a:t></a:r><a:r><a:t> curve.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`);
  z.file('ppt/notesSlides/_rels/notesSlide1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide1.xml"/></Relationships>`);
  const rp = 'ppt/slides/_rels/slide1.xml.rels';
  z.file(rp, (await z.file(rp).async('string')).replace('</Relationships>', '<Relationship Id="rIdN9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>'));
  z.file('[Content_Types].xml', (await z.file('[Content_Types].xml').async('string')).replace('</Types>', '<Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/></Types>'));
  const f = path.join(OUT, 'preset-deck.pptx');
  fs.writeFileSync(f, await z.generateAsync({type: 'nodebuffer'}));
  return f;
}

(async () => {
  const deck = await makeDeck();
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);

  const newNote = async (pi, frac, text) => {
    const strip = page.locator('.pagecard').nth(pi).locator('.strip').first();
    await strip.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 120)); await page.waitForTimeout(300);
    const b = await strip.boundingBox();
    await page.mouse.move(b.x + 260, b.y + b.height * frac, {steps: 4}); await page.waitForTimeout(250);
    await page.click('.gappill'); await page.waitForTimeout(250);
    if (text) await page.keyboard.type(text);
    await page.waitForTimeout(150);
  };
  const leave = async () => { await page.mouse.click(5, 700); await page.waitForTimeout(300); };
  // the note you're in (or the last note made): its look, as the presets see it
  const look = sel => page.evaluate(s => { const b = s ? document.querySelector(s) : active.closest('.notebox'); const l = lookOf(b), m = b.querySelector('.mine'); return {...l, cs: getComputedStyle(m).color, fw: getComputedStyle(m).fontWeight}; }, sel);
  const picked = () => page.$eval('#bPreset', s => s.value);
  const optNames = () => page.$$eval('#bPreset option', o => o.map(x => x.textContent));
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('box-presets') || 'null'));
  const card = id => `#presetList .preset[data-id="${id}"]`;
  const setVal = (sel, v) => page.evaluate(([s, v]) => { const i = document.querySelector(s); i.value = v; i.dispatchEvent(new Event('input', {bubbles: true})); i.dispatchEvent(new Event('change', {bubbles: true})); }, [sel, v]);

  // ================= 1. the Box tab =================
  await page.click('#tab-box'); await page.waitForTimeout(200);
  ok(await page.isVisible('#bPreset') && await page.isVisible('#bPresetEdit'), 'the Box tab has a Presets list and an Edit button');
  ok((await optNames()).join() === 'Custom,My notes,Important,Question,Speaker notes', 'four presets to start with: ' + (await optNames()).join(', '));
  ok(await picked() === 'mine', 'with no note, it shows the preset new notes look like (My notes)');
  ok((await page.getAttribute('#bPreset', 'title')).includes('new notes'), 'and its tip says it is for new notes');

  await newNote(0, 0.5, 'Oligopoly');
  await page.click('#tab-box'); await page.waitForTimeout(150);
  ok(await picked() === 'mine' && (await page.getAttribute('#bPreset', 'title')).includes('the note you\'re in'), 'in a new note it shows My notes, for the note you\'re in');
  await page.selectOption('#bPreset', 'key'); await page.waitForTimeout(250);
  let l = await look();
  ok(l.color === '#c62828' && l.b && l.fw === '700' && l.font === 'Caveat' && l.size === 24, `Important makes the note red and bold (${l.color}, ${l.fw})`);
  ok(l.chip.toLowerCase() === '#ef5350', 'and its pencil icon red');
  ok(await picked() === 'key' && await page.$eval('#bChip', i => i.value) === '#ef5350' && await page.$eval('#color', i => i.value) === '#c62828', 'the Box and Home tabs show it');
  ok(await page.evaluate(() => document.activeElement === active || active.contains(getSelection().anchorNode)), 'you are still in the note');
  await page.keyboard.type(' markets'); await page.waitForTimeout(800);
  ok((await page.evaluate(() => active.textContent)) === 'Oligopoly markets', 'and can keep typing in it');
  // a few words in their own colour lose it, but bold words stay bold
  await page.selectOption('#bPreset', 'ask'); await page.waitForTimeout(200);
  l = await look();
  ok(l.color === '#7b1fa2' && !l.b && l.fw === '400' && l.chip.toLowerCase() === '#ab47bc', 'Question: purple, not bold, a purple icon');
  // Back undoes it
  await page.waitForTimeout(700); await page.click('#undoBtn'); await page.waitForTimeout(400);
  l = await page.evaluate(() => { const b = [...document.querySelectorAll('#main .notebox')].find(x => x.textContent.includes('Oligopoly')); return b ? lookOf(b) : null; });
  ok(l && l.color === '#c62828' && l.b, 'Back takes the preset off again');

  // ================= 2. new notes =================
  await leave(); await page.click('#tab-box'); await page.waitForTimeout(150);
  ok(await picked() === 'mine', 'out of the note, the list shows new notes again');
  await page.selectOption('#bPreset', 'ask'); await page.waitForTimeout(200);
  ok((await page.textContent('#toast')).includes('New notes will start as Question.'), 'with no note, a preset is for new notes and says so');
  await newNote(1, 0.5, 'Why?');
  l = await look();
  ok(l.color === '#7b1fa2' && l.chip.toLowerCase() === '#ab47bc' && !l.b, 'a new note starts as Question, with a purple icon');
  await leave();
  await page.selectOption('#bPreset', 'key'); await page.waitForTimeout(150);
  await newNote(2, 0.5, 'Key');
  l = await look();
  ok(l.b && l.fw === '700' && l.color === '#c62828', 'and as Important, new notes start bold');
  await leave(); await page.selectOption('#bPreset', 'mine'); await page.waitForTimeout(150);

  // ================= 3. several selected notes =================
  await page.locator('.pagecard').nth(0).scrollIntoViewIfNeeded();
  await newNote(0, 0.75, 'Second');
  await page.click('#tab-box'); await page.click('#selAllBtn'); await page.waitForTimeout(250);
  const nSel = await page.evaluate(() => multi.size);
  ok(nSel >= 2, `Select all picks the page's notes (${nSel})`);
  ok(await picked() === '', 'notes that look different show Custom');
  await page.selectOption('#bPreset', 'spk'); await page.waitForTimeout(200);
  const all = await page.evaluate(() => [...multi].map(b => { const l = lookOf(b); return l.font + l.size + l.color + l.chip; }));
  ok(all.every(x => x === 'Arial16#000000#263238'), 'a preset styles every selected note: ' + all.join(' | '));
  ok(await picked() === 'spk', 'and the list shows it');
  await page.keyboard.press('Escape'); await leave();

  // ================= 4. Help & settings › Box presets =================
  await page.click('#tab-box'); await page.click('#bPresetEdit'); await page.waitForTimeout(300);
  ok(await page.isVisible('#settings') && await page.isVisible('#presetSec'), 'Edit opens Help & settings at Box presets');
  ok(await page.locator('#presetList .preset').count() === 4, 'a card for each preset');
  ok(await page.locator(card('spk') + ' .x').count() === 0 && await page.locator(card('key') + ' .x').count() === 1, 'Speaker notes can\'t be removed; the others can');
  ok(await page.$eval(card('key') + ' .pname', e => getComputedStyle(e).fontWeight === '700' && getComputedStyle(e).color === 'rgb(198, 40, 40)' && /Caveat/.test(getComputedStyle(e).fontFamily)), 'each name is written in its own look');
  ok(await page.$eval(card('spk') + ' .pfont', e => e.value) === 'Arial' && await page.$eval(card('key') + ' .psize', e => e.value) === '24', 'the font and size show');
  ok(await page.getAttribute(card('key') + ' .tg[data-k="b"]', 'aria-pressed') === 'true' && await page.getAttribute(card('key') + ' .tg[data-k="i"]', 'aria-pressed') === 'false', 'and which of B, I, U are on');
  await page.screenshot({path: path.join(OUT, 'presets-settings.png')});

  // change Important: italic, 30 px, another colour, another icon colour, another font, a new name
  await page.click(card('key') + ' .tg[data-k="i"]'); await page.waitForTimeout(100);
  await page.fill(card('key') + ' .psize', '30'); await page.press(card('key') + ' .psize', 'Enter');
  await setVal(card('key') + ' .pcolor', '#0b7a3e');
  await setVal(card('key') + ' .pchip', '#123456');
  await page.selectOption(card('key') + ' .pfont', 'Kalam');
  await page.fill(card('key') + ' .pname', 'Key point'); await page.press(card('key') + ' .pname', 'Enter');
  await page.waitForTimeout(150);
  let s = (await stored()).find(p => p.id === 'key');
  ok(s && s.i && s.b && s.size === 30 && s.color === '#0b7a3e' && s.chip === '#123456' && s.font === 'Kalam' && s.name === 'Key point', 'every change is kept: ' + JSON.stringify(s));
  ok(await page.$eval(card('key') + ' .pname', e => getComputedStyle(e).fontStyle === 'italic' && getComputedStyle(e).color === 'rgb(11, 122, 62)' && /Kalam/.test(getComputedStyle(e).fontFamily)), 'its name shows the new look');
  ok((await optNames()).includes('Key point') && !(await optNames()).includes('Important'), 'the Box tab lists it by its new name');
  // an empty name: it is called Preset
  await page.fill(card('ask') + ' .pname', '   '); await page.press(card('ask') + ' .pname', 'Enter'); await page.waitForTimeout(100);
  ok((await stored()).find(p => p.id === 'ask').name === 'Preset' && await page.$eval(card('ask') + ' .pname', e => e.value) === 'Preset', 'a name left empty becomes “Preset”');
  await page.fill(card('ask') + ' .pname', 'Question'); await page.press(card('ask') + ' .pname', 'Enter');
  // a size out of range is brought into it
  await page.fill(card('ask') + ' .psize', '900'); await page.press(card('ask') + ' .psize', 'Enter'); await page.waitForTimeout(100);
  ok((await stored()).find(p => p.id === 'ask').size === 200, 'a size over 200 becomes 200');
  await page.fill(card('ask') + ' .psize', '24'); await page.press(card('ask') + ' .psize', 'Enter');
  // the note made Important earlier keeps its look, and now shows Custom
  await page.click('#setClose'); await page.waitForTimeout(150);
  await page.locator('.pagecard').nth(2).locator('.notebox .mine').first().click(); await page.waitForTimeout(200);
  await page.click('#tab-box'); await page.waitForTimeout(100);
  l = await look();
  ok(l.color === '#c62828' && l.size === 24 && await picked() === '', 'a note styled before keeps its look (it shows Custom now)');
  await page.selectOption('#bPreset', 'key'); await page.waitForTimeout(200);
  l = await look();
  ok(l.color === '#0b7a3e' && l.size === 30 && l.i && l.b && l.font === 'Kalam' && l.chip === '#123456', 'and picking Key point gives it the changed preset');
  // + New preset, from the note you're in
  await page.click('#helpBtn'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => !!noteActive()), 'opening Help & settings keeps you in the note');
  await page.click('#presetAdd'); await page.waitForTimeout(200);
  const np = (await stored()).at(-1);
  ok(np.name === 'Preset 5' && np.font === 'Kalam' && np.size === 30 && np.color === '#0b7a3e' && np.chip === '#123456', '+ New preset copies the note you\'re in: ' + JSON.stringify(np));
  ok(await page.evaluate(() => document.activeElement.classList.contains('pname') && document.activeElement.value === 'Preset 5'), 'and puts you in its name, to type a new one');
  await page.keyboard.type('Exam'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  ok((await stored()).at(-1).name === 'Exam' && (await optNames()).at(-1) === 'Exam', 'named Exam, it is at the end of the Box tab\'s list');
  // remove one
  await page.click(card(np.id) + ' .x'); await page.waitForTimeout(150);
  ok(!(await stored()).some(p => p.id === np.id) && (await page.textContent('#toast')).includes('Removed the preset Exam'), '× removes a preset');

  // ================= 5. speaker notes arrive as the Speaker notes preset =================
  await setVal(card('spk') + ' .psize', '18');
  await setVal(card('spk') + ' .pcolor', '#334455');
  await page.click(card('spk') + ' .tg[data-k="u"]');
  await page.click('#setClose'); await page.waitForTimeout(150);
  await page.setInputFiles('#file', deck);
  await page.waitForFunction(() => document.querySelector('#main .file-head')?.textContent === 'preset-deck' && document.querySelector('#main .sidepage .notebox[data-spk]'), null, {timeout: 60000});
  await page.waitForTimeout(600);
  l = await look('#main .sidepage .notebox[data-spk]');
  ok(l.font === 'Arial' && l.size === 18 && l.color === '#334455' && l.u && l.chip === '#263238', `speaker notes arrive in the Speaker notes preset as changed (${l.font} ${l.size} ${l.color}, underlined)`);
  ok(await page.evaluate(() => document.querySelector('#main .sidepage .notebox[data-spk] .mine b')?.textContent === 'kinked'), 'their own bold words stay bold');

  // ================= 6. kept after a reload, and Reset =================
  await page.reload(); await page.waitForTimeout(1200);
  ok((await page.$$eval('#bPreset option', o => o.map(x => x.textContent))).join() === 'Custom,My notes,Key point,Question,Speaker notes', 'the presets are kept after a reload');
  await page.click('#helpBtn'); await page.waitForTimeout(250);
  await page.click('#presetReset'); await page.waitForTimeout(100);
  ok((await page.textContent('#presetReset')).includes('Click again') && (await stored()).find(p => p.id === 'key').name === 'Key point', 'Reset asks you to click again first');
  await page.click('#presetReset'); await page.waitForTimeout(150);
  s = await stored();
  ok(s.map(p => p.name).join() === 'My notes,Important,Question,Speaker notes' && s.find(p => p.id === 'spk').size === 16, 'and then goes back to the four starting presets');
  ok(await page.locator('#presetList .preset').count() === 4, 'their cards show again');

  // ================= 7. a phone: the cards fit =================
  await page.setViewportSize({width: 375, height: 800}); await page.waitForTimeout(400);
  const fit = await page.evaluate(() => [...document.querySelectorAll('#presetList .preset')].every(c => c.scrollWidth <= c.clientWidth + 1 && c.getBoundingClientRect().right <= innerWidth));
  ok(fit, 'on a phone each card fits, nothing sticks out');
  await page.screenshot({path: path.join(OUT, 'presets-phone.png')});

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });

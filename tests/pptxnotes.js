// A PowerPoint file's speaker notes go on each slide's side page (a setting in Help & settings, on by default), in both ways of opening it
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

// fid-rich.pptx (4 slides) with notes pages: slide 1 has two paragraphs (one word bold) and a slide number, header and slide picture placeholder;
// slide 2 has none; slide 3 has an empty notes page; slide 4 has notes like a lecturer's: a line, a blank line, a paragraph, a lead-in, and bullets (PowerPoint's and typed ones, with and without bold)
const P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const shape = (id, type, body) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${type} ${id}"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}"${type === 'body' ? ' idx="1"' : ''}/></p:nvPr></p:nvSpPr><p:spPr/>${body == null ? '' : `<p:txBody><a:bodyPr/><a:lstStyle/>${body}</p:txBody>`}</p:sp>`;
const notesXml = shapes => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes ${P}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld></p:notes>`;
const NOTES = {
  1: notesXml(shape(2, 'sldImg') + shape(3, 'body', '<a:p><a:r><a:t>Start with the </a:t></a:r><a:r><a:rPr b="1"/><a:t>kinked</a:t></a:r><a:r><a:t> demand curve.</a:t></a:r></a:p><a:p><a:endParaRPr/></a:p><a:p><a:r><a:t>Then ask the class about price wars.</a:t></a:r></a:p>') +
    shape(4, 'sldNum', '<a:p><a:fld id="{1}" type="slidenum"><a:t>SLIDENUM7</a:t></a:fld></a:p>') + shape(5, 'hdr', '<a:p><a:r><a:t>HEADERX</a:t></a:r></a:p>')),
  3: notesXml(shape(2, 'sldImg') + shape(3, 'body', '<a:p><a:endParaRPr/></a:p><a:p><a:r><a:t>   </a:t></a:r></a:p>')),
  4: notesXml(shape(2, 'sldImg') + shape(3, 'body', '<a:p><a:r><a:t>95% chance that losses will not exceed 2.97%</a:t></a:r></a:p><a:p><a:endParaRPr/></a:p><a:p><a:r><a:t>By plotting daily returns into a histogram, the distribution of returns can be observed.</a:t></a:r></a:p><a:p><a:r><a:t>Key limitations of Historical Simulation include:</a:t></a:r></a:p><a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:t>High Data Dependency: Requires a large amount of data.</a:t></a:r></a:p><a:p><a:r><a:t>- Reliance on Past Patterns: Assumes past behaviour will repeat.</a:t></a:r></a:p><a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:rPr b="1"/><a:t>Given</a:t></a:r><a:r><a:t>: the author’s bold stays, </a:t></a:r><a:r><a:rPr i="1"/><a:t>italic</a:t></a:r><a:r><a:t> and </a:t></a:r><a:r><a:rPr u="sng"/><a:t>underlined</a:t></a:r><a:r><a:t> too</a:t></a:r></a:p><a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:t>Remember the quiz on Friday</a:t></a:r></a:p><a:p><a:r><a:t>-2.97% is not a bullet</a:t></a:r></a:p><a:p><a:r><a:t>* This is a long sentence that only reaches its colon much later on: no bold</a:t></a:r></a:p>')),
};
async function makeDeck(){
  const z = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, 'fid-rich.pptx')));
  let ct = await z.file('[Content_Types].xml').async('string');
  for (const [n, xml] of Object.entries(NOTES)) {
    z.file(`ppt/notesSlides/notesSlide${n}.xml`, xml);
    z.file(`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${n}.xml"/></Relationships>`);
    const rp = `ppt/slides/_rels/slide${n}.xml.rels`;
    z.file(rp, (await z.file(rp).async('string')).replace('</Relationships>', `<Relationship Id="rIdN9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/></Relationships>`));
    ct = ct.replace('</Types>', `<Override PartName="/ppt/notesSlides/notesSlide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/></Types>`);
  }
  z.file('[Content_Types].xml', ct);
  const f = path.join(OUT, 'notes-deck.pptx');
  fs.writeFileSync(f, await z.generateAsync({type: 'nodebuffer'}));
  return f;
}

(async () => {
  const deck = await makeDeck();
  const {browser, page, errors} = await open(APP, {width: 1440, height: 900});
  await page.waitForTimeout(600);
  const openDeck = async (sel = '#main .slide') => {
    await page.setInputFiles('#file', deck);
    await page.waitForFunction(sel => document.querySelector('#main .file-head')?.textContent === 'notes-deck' && document.querySelectorAll(sel).length >= 4 && !(document.querySelector('#toast.show')?.textContent || '').startsWith('Reading'), sel, {timeout: 60000});
    await page.waitForTimeout(900);
  };
  // each slide's side notes: how many, and their text (with lines kept)
  const notes = () => page.evaluate(() => [...document.querySelectorAll('#main .slide')].map(s => [...(sideOf(s)?.querySelectorAll(':scope > .notebox') || [])].map(b => b.querySelector('.mine').innerText.trim())));
  // the pencil icon colour of every side note, in page order
  const chips = () => page.evaluate(() => [...document.querySelectorAll('#main .sidepage .notebox')].map(b => chipOf(b).toLowerCase()));
  const sideOn = () => page.evaluate(() => [side.on, document.getElementById('main').classList.contains('side-on'), document.getElementById('sideBtn').getAttribute('aria-pressed')]);

  // ---- the setting: on by default ----
  ok(await page.evaluate(() => pptxNotesOn()) && await page.isChecked('#setPptxNotes'), 'Help & settings: “PowerPoint speaker notes on side pages” is on by default');
  ok((await page.textContent('label[for="setPptxNotes"]')).includes('PowerPoint speaker notes on side pages') && (await page.evaluate(() => document.querySelector('label[for="setPptxNotes"]').nextElementSibling.textContent)).includes('speaker notes go on each slide'), 'with its label and hint');
  ok(await page.evaluate(() => CK_ACTIONS.some(a => a.id === 'pptxnotes' && /speaker notes/i.test(a.label))), 'and in Ctrl+K');

  // ---- slides as they look ----
  await openDeck('#main .pagecard');
  ok(await page.locator('.pagecard').count() === 4, 'the deck opens as 4 slide pictures');
  let n = await notes();
  ok(n.map(x => x.length).join() === '1,0,0,1', 'side notes on slides 1 and 4 only, not on 2 (no notes) or 3 (empty notes): ' + n.map(x => x.length).join());
  ok(n[0][0].includes('Start with the kinked demand curve.') && n[0][0].includes('Then ask the class about price wars.') && /curve\.\n+Then/.test(n[0][0]), 'slide 1’s note has both paragraphs, on lines of their own');
  ok(!n[0][0].includes('SLIDENUM7') && !n[0][0].includes('HEADERX'), 'without the slide number or header');
  ok(await page.evaluate(() => sideOf(document.querySelector('.pagecard')).querySelector('.mine b')?.textContent === 'kinked'), 'bold words stay bold');
  ok(n[3][0].split('\n').includes('• Remember the quiz on Friday'), 'slide 4’s bulleted line keeps its bullet');
  ok((await sideOn()).join() === 'true,true,true', 'Side notes turned on by itself');
  ok((await page.textContent('#toast')).includes('speaker notes are on the side pages'), 'and a message says where the notes are');
  const geo = await page.evaluate(() => { const sp = sideOf(document.querySelector('.pagecard')), b = sp.querySelector('.notebox'), r = sp.getBoundingClientRect(), q = b.getBoundingClientRect(), z = zoomOf(sp) || 1; return {dx: (q.left - r.left) / z, dy: (q.top - r.top) / z, w: b.offsetWidth, sw: sp.clientWidth, right: q.right <= r.right + 1, floating: b.classList.contains('floating'), sid: sp.dataset.for === document.querySelector('.pagecard').dataset.sid}; });
  ok(geo.floating && geo.sid && geo.dx < 60 && geo.dy < 60 && geo.right, `the note sits at the top left of slide 1’s own side page (${Math.round(geo.dx)}, ${Math.round(geo.dy)})`);
  ok(geo.dx < 12 && geo.dy < 14 && geo.w >= geo.sw - 24, `across the whole side page, from its top (${Math.round(geo.dx)}, ${Math.round(geo.dy)}, ${geo.w} of ${geo.sw}px)`);

  // ---- formatted like printed notes: plain black Arial, the paragraphs and blank lines kept, a • for each bullet, bold terms ----
  const fmt = await page.evaluate(() => {
    const el = sideOf(document.querySelectorAll('#main .pagecard')[3]).querySelector('.mine'), cs = getComputedStyle(el);
    return {font: cs.fontFamily, size: cs.fontSize, color: cs.color, lines: [...el.children].map(d => d.innerHTML), b: [...el.querySelectorAll('b')].map(x => x.textContent), i: [...el.querySelectorAll('i')].map(x => x.textContent), u: [...el.querySelectorAll('u')].map(x => x.textContent)};
  });
  ok(/^"?Arial/.test(fmt.font) && fmt.size === '16px' && fmt.color === 'rgb(0, 0, 0)', `in plain black print, not handwriting (${fmt.font}, ${fmt.size}, ${fmt.color})`);
  const L = fmt.lines;
  ok(L[0].startsWith('95% chance') && L[1] === '<br>' && L[2].startsWith('By plotting') && L[3] === 'Key limitations of Historical Simulation include:', 'the paragraphs keep their own lines, with the blank line between: ' + L.slice(0, 4).join(' | '));
  ok(L[4] === '• <b>High Data Dependency</b>: Requires a large amount of data.', 'a PowerPoint bullet becomes “• ” with its term in bold: ' + L[4]);
  ok(L[5] === '• <b>Reliance on Past Patterns</b>: Assumes past behaviour will repeat.', 'a line typed with “- ” becomes a • bullet too: ' + L[5]);
  ok(L[6] === '• <b>Given</b>: the author’s bold stays, <i>italic</i> and <u>underlined</u> too', 'bold, italic and underline from the notes are kept, and no more bold added: ' + L[6]);
  ok(L[7] === '• Remember the quiz on Friday' && L[8] === '-2.97% is not a bullet' && L[9] === '• This is a long sentence that only reaches its colon much later on: no bold', 'a bullet without a term stays as it is, “-2.97%” is no bullet: ' + L.slice(7).join(' | '));
  ok(fmt.b.join() === 'High Data Dependency,Reliance on Past Patterns,Given' && fmt.i.join() === 'italic' && fmt.u.join() === 'underlined', 'and nothing else is bold, italic or underlined');
  await page.click('#notesBtn').catch(() => {}); await page.waitForTimeout(400);
  ok((await page.textContent('#noteList')).includes('Side note') && (await page.textContent('#noteList')).includes('kinked'), 'the Notes list shows them as side notes');
  await page.screenshot({path: path.join(OUT, 'pptxnotes-look.png')});

  // ---- their pencil icon is black (the Black of Box › Icon colours); a note you add keeps the usual one ----
  ok((await chips()).join() === '#263238,#263238', 'both speaker notes get the black pencil icon: ' + (await chips()).join());
  ok(await page.evaluate(() => CHIP_COLORS.some(([c, n]) => c === SPK_CHIP && n === 'Black') && colourName(SPK_CHIP) === 'Black'), 'the Black of the icon colours');
  ok(await page.evaluate(() => chipOf(makeBox().box) === (boxStyle.chip || CHIP)), 'a note you add still gets the usual icon colour');
  const chipLook = await page.evaluate(() => {
    const b = sideOf(document.querySelector('.pagecard')).querySelector('.notebox'); setCollapsed(b, true);
    const c = b.querySelector(':scope > .note-chip'), cs = getComputedStyle(c);
    return {bg: cs.backgroundColor, ink: cs.color};
  });
  ok(chipLook.bg === 'rgb(38, 50, 56)' && chipLook.ink === 'rgb(255, 255, 255)', `minimised, the icon is black with a white pencil (${chipLook.bg}, ${chipLook.ink})`);
  // on the Dark slate side page the black icon still shows: its ring turns light, like the notes' corner mark there
  const dark = await page.evaluate(() => {
    const was = side.bg; sideSet({bg: '#2b2f36'});
    const sp = sideOf(document.querySelector('.pagecard')), c = sp.querySelector('.note-chip');
    const x = document.createElement('canvas').getContext('2d', {willReadFrequently: true});      // (a mixed colour reads back as color(srgb …))
    const lum = s => { x.clearRect(0, 0, 1, 1); x.fillStyle = s; x.fillRect(0, 0, 1, 1); const [r, g, b] = x.getImageData(0, 0, 1, 1).data; return 0.299 * r + 0.587 * g + 0.114 * b; };
    const words = () => lum(getComputedStyle(sp.querySelector('.mine')).color);
    const out = {dark: sp.classList.contains('dark'), ring: lum(getComputedStyle(c).borderTopColor), paper: lum(getComputedStyle(sp).backgroundColor), words: words()};
    sideSet({bg: was}); out.back = lum(getComputedStyle(c).borderTopColor); out.wordsBack = words();
    return out;
  });
  ok(dark.dark && dark.ring - dark.paper > 60, `on a dark side page the black icon's ring is light enough to see (ring ${Math.round(dark.ring)} on paper ${Math.round(dark.paper)})`);
  ok(dark.words - dark.paper > 120, `and the note's black words turn light there (${Math.round(dark.words)} on ${Math.round(dark.paper)})`);
  ok(dark.back < 40 && dark.wordsBack === 0, 'both dark again on light paper');
  await page.evaluate(() => { const b = sideOf(document.querySelector('.pagecard')).querySelector('.notebox'); setCollapsed(b, false); });
  // it's an icon colour like any other: you can change it, and the Notes panel filters by it
  const filt = await page.evaluate(() => {
    const b = sideOf(document.querySelectorAll('#main .pagecard')[3]).querySelector('.notebox');
    setChipColor(b, '#42a5f5', true); renderNotes();
    const names = [...document.querySelectorAll('#noteFilters .fchip')].map(f => f.textContent);
    setChipColor(b, SPK_CHIP, true); renderNotes();
    return names;
  });
  ok(filt.includes('Black') && filt.includes('Blue'), 'you can change it, and the Notes panel’s colour filter lists Black: ' + filt.join(', '));

  // ---- only speaker notes are black: notes you make keep the usual icon colour, even right after you've been in a speaker note ----
  const spkMine = page.locator('.sidepage .notebox[data-spk] .mine').first();
  const intoSpeaker = async () => { await spkMine.scrollIntoViewIfNeeded(); await spkMine.click(); await page.waitForTimeout(200); };
  const clickAway = async () => { await page.mouse.click(700, 880); await page.waitForTimeout(200); };
  await intoSpeaker();
  ok(await page.inputValue('#bChip') === '#263238', 'in a speaker note, the Box tab shows its black icon colour');
  await clickAway();
  ok(await page.evaluate(() => !noteActive()) && await page.inputValue('#bChip') === '#ffd54a', 'clicking away shows the colour for new notes again (yellow)');
  const made = await page.evaluate(() => {
    const s = document.querySelectorAll('#main .pagecard');
    addNoteToPage('a note from the Notes panel');
    const st = s[1].querySelector('.strip'); insertAt(st, (+st.dataset.y0 + +st.dataset.y1) / 2);      // + Add here
    sideAddBox(sideOf(s[0]), 40, 300, 200);                                                           // a click on a side page
    addSticky(s[2], 100, 100, 'a sticky note');
    const mine = [...document.querySelectorAll('#main .notebox:not([data-spk])')], out = {mine: mine.map(chipOf), spk: [...document.querySelectorAll('#main .notebox[data-spk]')].map(chipOf)};
    mine.forEach(b => b.remove()); return out;
  });
  ok(made.mine.length === 4 && made.mine.every(c => c === '#ffd54a'), 'notes you add (Notes panel, + Add here, side page, sticky) get the usual yellow icon: ' + made.mine.join());
  ok(made.spk.join() === '#263238,#263238', 'while the speaker notes stay black');
  // a colour picker opened on a speaker note and closed by clicking away (as on an iPad) colours that note, never new notes
  await intoSpeaker();
  await page.dispatchEvent('#bChip', 'pointerdown');
  await clickAway();
  await page.evaluate(() => { const i = document.getElementById('bChip'); i.value = '#ef5350'; i.dispatchEvent(new Event('input', {bubbles: true})); });
  let race = await page.evaluate(() => ({spk: chipOf(document.querySelector('.sidepage .notebox[data-spk]')), nb: boxStyle.chip, saved: pref.json('box-style', {}).chip || '#ffd54a', fresh: chipOf(makeBox().box)}));
  ok(race.spk === '#ef5350' && race.nb === '#ffd54a' && race.saved === '#ffd54a' && race.fresh === '#ffd54a', `Box tab icon colour sent after clicking away goes to the speaker note, not to new notes (${JSON.stringify(race)})`);
  await page.evaluate(() => { const b = document.querySelector('.sidepage .notebox[data-spk]'); setChipColor(b, SPK_CHIP, true); setCollapsed(b, true); const c = b.querySelector('.note-chip').getBoundingClientRect(); openChipPop(b, c.left, c.top); });
  await page.dispatchEvent('.chippop input', 'pointerdown');
  await clickAway();
  ok(await page.evaluate(() => chipPop.hidden), 'clicking away closes the pencil icon’s colour menu');
  await page.evaluate(() => { const i = chipPop.querySelector('input'); i.value = '#42a5f5'; i.dispatchEvent(new Event('input', {bubbles: true})); });
  race = await page.evaluate(() => ({spk: chipOf(document.querySelector('.sidepage .notebox[data-spk]')), nb: boxStyle.chip, saved: pref.json('box-style', {}).chip || '#ffd54a'}));
  ok(race.spk === '#42a5f5' && race.nb === '#ffd54a' && race.saved === '#ffd54a', `and so does its “Any colour” picker (${JSON.stringify(race)})`);
  await page.evaluate(() => { const b = document.querySelector('.sidepage .notebox[data-spk]'); setChipColor(b, SPK_CHIP, true); setCollapsed(b, false); saveSoon(); });

  // ---- opened again the other way, from the tip: the notes come along (they aren't counted as your writing) ----
  const swap = page.locator('.pptx-tip button', {hasText: 'editable text'});
  if (await swap.count()) {
    await swap.click();
    await page.waitForFunction(() => document.querySelectorAll('#main .slide:not(.pagecard)').length === 4, null, {timeout: 60000}); await page.waitForTimeout(800);
    n = await notes();
    ok(await page.locator('.pagecard').count() === 0 && n.map(x => x.length).join() === '1,0,0,1', 'reopened as editable text from the tip, with the notes on the same slides');
    ok((await chips()).join() === '#263238,#263238', 'still with black pencil icons');
  } else throw new Error('FAILED: no tip with its reopen link');

  // ---- kept: reload, and the notebook file ----
  await page.mouse.click(5, 500); await page.waitForTimeout(1500);
  await page.reload(); await page.waitForTimeout(2500);
  n = await notes();
  ok(n.map(x => x.length).join() === '1,0,0,1' && n[0][0].includes('price wars') && n[3][0].includes('quiz'), 'after a reload the notes are on the same side pages');
  ok((await sideOn()).join() === 'true,true,true', 'and Side notes is still on');
  await page.click('#save'); const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-kind=notebook]')]);
  const file = fs.readFileSync(await dl.path(), 'utf8');
  ok((await chips()).join() === '#263238,#263238', 'and keep their black icons');
  ok(file.includes('kinked') && file.includes('price wars') && file.includes('sidepage'), 'Download notebook carries the speaker notes');
  ok((file.match(/--chip:\s*#263238/g) || []).length === 2, 'with their black icon colour');
  await page.keyboard.press('Escape');

  // ---- editable text ----
  await page.evaluate(() => pref.set('pptx-mode', 'text'));
  await page.evaluate(() => { boxStyle.chip = '#42a5f5'; });       // (a colour chosen for new notes doesn't change them)
  await openDeck('#main .slide:not(.pagecard)');
  ok((await chips()).join() === '#263238,#263238', 'black icons there too, even with another colour chosen for new notes');
  await page.evaluate(() => { delete boxStyle.chip; });
  ok(await page.locator('#main .slide:not(.pagecard)').count() === 4 && await page.locator('.pagecard').count() === 0, 'as editable text: 4 slides rebuilt as text, in a new notebook');
  n = await notes();
  ok(n.map(x => x.length).join() === '1,0,0,1' && n[0][0].includes('kinked demand curve') && n[3][0].includes('quiz'), 'the notes are on slides 1 and 4’s side pages there too');
  ok((await sideOn()).join() === 'true,true,true', 'and Side notes is on');
  await page.screenshot({path: path.join(OUT, 'pptxnotes-text.png')});

  // ---- switched off: nothing added, Side notes stays off, no message ----
  await page.evaluate(() => { const c = document.getElementById('setPptxNotes'); c.checked = false; c.dispatchEvent(new Event('change', {bubbles: true})); });
  ok(await page.evaluate(() => pref.get('pptx-notes')) === '0' && !(await page.evaluate(() => pptxNotesOn())), 'switching it off is remembered');
  await page.reload(); await page.waitForTimeout(2000);
  ok(!(await page.isChecked('#setPptxNotes')), 'and still off after a reload');
  await page.evaluate(() => pref.set('pptx-mode', 'look'));
  await openDeck('#main .pagecard');
  n = await notes();
  ok(n.every(x => !x.length) && await page.locator('.sidepage .notebox').count() === 0, 'with it off, opening the deck adds no side notes');
  ok((await sideOn()).join() === 'false,false,false', 'and leaves Side notes off');
  ok(!(await page.evaluate(() => document.querySelector('#toast.show')?.textContent || '')).includes('speaker notes'), 'and says nothing about speaker notes');

  // ---- on again from Ctrl+K ----
  await page.evaluate(() => CK_ACTIONS.find(a => a.id === 'pptxnotes').run());
  ok(await page.evaluate(() => pptxNotesOn()) && await page.isChecked('#setPptxNotes'), 'Ctrl+K’s action turns it back on');

  // ---- a browser where the bug above already made black the colour for new notes: it goes back to yellow, once ----
  await page.evaluate(() => { localStorage.setItem('box-style', JSON.stringify({outline: true, border: '#9aa3b2', fill: '', chip: '#263238'})); localStorage.removeItem('spk-chip-fixed'); });
  await page.reload(); await page.waitForTimeout(2000);
  ok(await page.evaluate(() => boxStyle.chip === CHIP && pref.json('box-style', {}).chip === CHIP && chipOf(makeBox().box) === CHIP), 'black left as the colour for new notes goes back to yellow');
  await page.evaluate(() => { openChipPop(null, 100, 100); pickChip('#263238'); closeChipPop(); });
  await page.reload(); await page.waitForTimeout(2000);
  ok(await page.evaluate(() => boxStyle.chip === '#263238'), 'but Black chosen for new notes after that stays');
  await page.evaluate(() => localStorage.removeItem('box-style'));

  await browser.close();
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(errors.length ? errors.join('\n') : 'no page errors');
})().catch(e => { console.error(e); process.exit(1); });

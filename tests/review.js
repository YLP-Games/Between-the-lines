// The Editor (Review tab, F7), grammar lines and Autocorrect: the grammar rules on their own, then the blue lines, right-click fixes,
// going through the mistakes in the Editor (fix, Ignore, a kind at a time, Fix all, Back), and Autocorrect as you type, like a person would
const {open} = require('./harness');
const path = require('path');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const tx = async l => (await l.textContent()).replace(/\u00a0/g, ' ');      // (a space at the end of a line is a no-break space)
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(400);
  await page.waitForFunction(() => typeof spellDict !== 'undefined' && !!spellDict, null, {timeout: 120000});

  // ---- the rules
  const scan = s => page.evaluate(s => grammarScan(s).map(x => `${x.rule}:${s.substr(x.at, x.len)}>${x.fixes[0]}`), s);
  let g = await scan('We could of gone to the the shop.');
  ok(g.includes('of:could of>could have') && g.includes('repeat:the the>the'), '“could of” and a repeated word: ' + g.join(' | '));
  g = await scan('a apple and an book, a university, an hour, a one-off, a European, an MRI. Part A is done and a is a number.');
  ok(g.join() === 'an:a>an,an:an>a', '“a” and “an” go by the sound of the next word, and leave acronyms, letters and labels alone: ' + g.join(' | '));
  g = await scan('yesterday i went and i\'m here; for i in range, where i is the index');
  ok(g.join() === 'i:i>I,i:i\'m>I\'m', 'a lone “i” is a capital, but not the maths letter: ' + g.join(' | '));
  g = await scan('It ended. then it began. See e.g. the notes, etc. and Dr. smith, the U.S. economy... and so on. 3. item');
  ok(g.join() === 'cap:then>Then', 'a sentence starts with a capital (abbreviations, ellipses and numbers left alone): ' + g.join(' | '));
  g = await scan('one , two this,that and three  four');
  ok(g.join() === 'spb: ,>,,spa:,>, ,dbl:  > ', 'a space before a comma, none after it, and two spaces: ' + JSON.stringify(g));
  g = await scan('Its a fact that it\'s own price is more then that. They was late, he don\'t care and she have gone; does it have one? Between you and I, your welcome.');
  ok(['its', 'itsown', 'than', 'agree', 'me', 'your'].every(r => g.some(x => x.startsWith(r + ':'))) && g.filter(x => x.startsWith('agree:')).length === 3, 'it\'s / its, then / than, they was, he don\'t, she have (not "does it have"), between you and I: ' + g.join(' | '));
  const clean = await page.evaluate(() => [
    'The price of a unit is an hour\'s wage. Investors use the model, i.e. a regression, for all i in N.',
    'Visit www.example.com/a?b=1,c=2 or mail a.b@c.co.za. See notes_v2.pdf, 3.5 m/s and 1,000 units.',
    'What it is is a question. He had had enough. An honest answer: a unique, useful one.',
    'Rational investors adjust; the market price falls. Q: why? A: because demand drops!',
  ].map(s => grammarScan(s).map(x => s.substr(x.at, x.len))).flat());
  ok(!clean.length, 'ordinary lecture-note text gets no blue lines: ' + clean.join(' | '));

  // ---- in a note
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(600);
  const newNote = async i => {
    await page.mouse.click(5, 700); await page.waitForTimeout(300);
    const strip = page.locator('.pagecard').nth(i).locator('.strip').last(); await strip.scrollIntoViewIfNeeded();
    const b = await strip.boundingBox(); await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2, {steps: 3}); await page.waitForTimeout(200);
    await page.click('.gappill'); await page.waitForTimeout(200);
    return page.locator('.pagecard').nth(i).locator('.mine').last();
  };
  const settle = async () => { await page.mouse.click(5, 700); await page.waitForTimeout(900); };
  const gram = () => page.evaluate(() => [...gramRanges.values()].flat().map(x => x.word));
  let note = await newNote(1);
  await page.keyboard.type('We could of seen the the recieve list. it was a apple , really. ');
  await settle();
  g = await gram();
  ok(['could of', 'the the', 'it', 'a', ' ,'].every(w => g.includes(w)), 'grammar and punctuation slips get a line as you write: ' + JSON.stringify(g));
  ok(await page.evaluate(() => gramHl.size >= 5 && [...spellRanges.values()].flat().some(x => x.word === 'recieve')), 'blue lines (Highlight API) beside the red spelling line');

  // right-click a blue line
  const centre = w => page.evaluate(w => { for (const l of gramRanges.values()) for (const h of l) if (h.word === w) { const r = h.range.getClientRects()[0]; return {x: r.left + r.width / 2, y: r.top + r.height / 2}; } return null; }, w);
  let c = await centre('could of'); await page.mouse.click(c.x, c.y, {button: 'right'}); await page.waitForTimeout(250);
  const menu = await page.evaluate(() => { const m = document.querySelector('.spellmenu:not(.wtmenu)'); return m && !m.hidden ? [...m.children].map(b => b.className + ':' + b.textContent) : null; });
  ok(menu && /^gmsg:/.test(menu[0]) && menu[1] === 'sug:could have' && menu.includes(':Ignore'), 'right-click on a blue line: what\'s wrong, the fix and Ignore (' + menu + ')');
  await page.locator('.spellmenu .sug').first().click(); await page.waitForTimeout(500);
  ok(/We could have seen/.test(await note.textContent()), 'choosing the fix puts it in');

  // ---- the Editor
  await page.click('#tab-review'); await page.click('#editorBtn'); await page.waitForTimeout(400);
  const pane = () => page.evaluate(() => ({open: !document.getElementById('editorPane').hidden, n: ed.list.length, kinds: ed.list.map(x => x.kind + ':' + x.text), card: document.querySelector('#edCard').textContent, lit: reviewHl.size}));
  let p = await pane();
  ok(p.open && p.n >= 4, 'the Editor opens and lists every mistake: ' + p.kinds.join(', '));
  ok(p.kinds.includes('spelling:recieve') && p.kinds.includes('grammar:the the') && p.kinds.includes('punct: ,') && p.lit === 1 && /Repeated word/.test(p.card), 'spelling, grammar and punctuation, the first one shown and lit up on the page');
  await page.click('#edCard .edsugs button'); await page.waitForTimeout(500);
  p = await pane();
  ok(/seen the recieve/.test(await note.textContent()) && !p.kinds.includes('grammar:the the') && /spelling/i.test(p.card), 'a suggestion fixes it and the Editor moves on to the next (' + p.kinds.join(', ') + ')');
  ok(/receive/.test(p.card) && /Add to dictionary/.test(p.card), 'a spelling mistake shows its suggestions and Add to dictionary');
  await page.click('#edCats [data-cat="punct"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => edShown().every(x => x.kind === 'punct') && edShown().length === 1), 'one kind at a time');
  await page.click('#edCard [data-act="once"]'); await page.waitForTimeout(400);
  p = await pane();
  ok(!p.kinds.includes('punct: ,') && /None of this kind/.test(p.card) && await page.evaluate(() => ![...gramRanges.values()].flat().some(x => x.word === ' ,')), 'Ignore leaves it alone, in the Editor and on the page');
  await page.click('#edCats [data-cat="all"]'); await page.waitForTimeout(200);
  const before = await note.textContent();
  await page.click('#edFixAll'); await page.waitForTimeout(700);
  p = await pane();
  ok(p.n === 0 && /No mistakes found/.test(p.card) && /receive list\. It was an apple/.test(await note.textContent()), 'Fix all gives each mistake its first suggestion: ' + (await note.textContent()) + JSON.stringify(p));
  await page.waitForTimeout(800);
  await page.click('#undoBtn'); await page.waitForTimeout(900);
  ok((await page.locator('.pagecard').nth(1).locator('.mine').last().textContent()) === before, 'Back puts them all back in one step');
  await page.keyboard.press('F7'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.getElementById('editorPane').hidden && reviewHl.size === 0), 'F7 closes the Editor');
  await page.keyboard.press('F7'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !document.getElementById('editorPane').hidden && ed.list.length > 0 && document.activeElement.closest('#editorPane')), 'and opens it, ready for the keyboard');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.getElementById('editorPane').hidden), 'Esc closes it');

  // ---- Check grammar off and on
  await page.click('#grammarBtn'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => gramHl.size === 0 && localStorage.getItem('grammar') === '0' && !document.getElementById('setGrammar').checked && spellHl.size > 0), 'Check grammar off: no blue lines (red ones stay), remembered, and the same in settings');
  await page.click('#grammarBtn'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => gramHl.size > 0), 'and back on');

  // ---- Autocorrect
  note = await newNote(2);
  await page.keyboard.type('teh cat ');
  ok((await tx(note)).startsWith('teh cat'), 'Autocorrect is off to begin with');
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete');
  await page.click('#tab-review'); await page.click('#autoBtn'); await note.click(); await page.waitForTimeout(200);
  ok(await page.evaluate(() => localStorage.getItem('autocorrect') === '1' && document.getElementById('autoBtn').getAttribute('aria-pressed') === 'true'), 'the Autocorrect button turns it on');
  await page.keyboard.type('teh cat dont know. i think so, adn TWo dogs. e.g. this ');
  ok(await tx(note) === 'The cat don\'t know. I think so, and Two dogs. e.g. this ', 'slips are put right as each word ends (typos, a sentence\'s capital, I, TWo CApitals; e.g. left alone): ' + await tx(note));
  await page.keyboard.type('adn ');
  ok((await tx(note)).endsWith('this and '), 'adn becomes and');
  await page.keyboard.press('Backspace');
  ok((await tx(note)).endsWith('this adn'), 'Backspace straight after puts back what you typed: ' + JSON.stringify(await tx(note)));
  await page.keyboard.type(' more ');
  ok((await tx(note)).endsWith('this adn more '), 'and that word is left alone after');
  await page.click('#helpBtn'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.getElementById('setAuto').checked && document.getElementById('acCaps').checked && !document.getElementById('acSpell').checked), 'Help & settings shows Autocorrect and its choices');
  await page.click('label[for="acCaps"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await note.click(); await page.keyboard.press('End');
  await page.keyboard.type('stop. here ');
  ok((await tx(note)).endsWith('stop. here '), 'with Capital letter off, a new sentence is left as typed');
  await page.click('#helpBtn'); await page.click('label[for="setAuto"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => localStorage.getItem('autocorrect') === '0' && document.getElementById('autoBtn').getAttribute('aria-pressed') === 'false'), 'turning it off in settings turns off the button too');

  // ---- Study mode closes the Editor
  await page.keyboard.press('F7'); await page.waitForTimeout(200);
  await page.click('#readBtn'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.getElementById('editorPane').hidden && gramHl.size === 0), 'Study mode: the Editor closes and the lines go');
  await page.click('#readBtn'); await page.waitForTimeout(400);

  await page.screenshot({path: path.join(__dirname, 'shots', 'review.png')});
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('no page errors');
})().catch(e => { console.error(e); process.exit(1); });

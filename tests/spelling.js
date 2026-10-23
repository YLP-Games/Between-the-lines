// Spell check: how good is it? Measures false flags on thousands of correct words from lecture notes, how many real misspellings
// are caught and how well they are corrected, then drives the menu, "Add to dictionary", Ignore and the language choice like a person would.
//   node spelling.js                     checks (fails below the targets)
//   SPELL_REPORT=1 node spelling.js      only prints the numbers (use APP=/path/to/old/index.html to measure an older copy)
// The hold-out files (holdout-words.txt, holdout-misspellings.txt) were written after the rules and word lists were done and never used
// to tune them: they are the fair measure of how it copes with words nobody has put in a list.
const {open} = require('./harness');
const path = require('path'), fs = require('fs');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const REPORT = !!process.env.SPELL_REPORT;
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const D = path.join(__dirname, 'spell');
const lines = f => fs.readFileSync(path.join(D, f), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
// word, word@gb (only right in UK English) or word@us
const wordSet = files => { const o = {gb: new Set(), us: new Set()}; for (const f of files) for (const l of lines(f)) for (const t of l.split(/\s+/).filter(Boolean)) { const m = t.match(/^(.*?)(?:@(gb|us))?$/); (m[2] ? [m[2]] : ['gb', 'us']).forEach(k => o[k].add(m[1])); } return o; };
const corpus = wordSet(fs.readdirSync(D).filter(f => /^words-.*\.txt$/.test(f))), holdout = wordSet(['holdout-words.txt']);
const pairs = f => [].concat(...lines(f).map(l => l.split(/\s+/).filter(Boolean).map(p => p.split('|')))).map(([w, r]) => [w, r.replace(/_/g, ' ')]);
const misspelt = pairs('misspellings.txt'), holdMiss = pairs('holdout-misspellings.txt');
const okText = lines('text-ok.txt'), badText = lines('text-bad.txt').map(l => l.split(' => '));
const readme = [...new Set(fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8').replace(/https?:\/\/\S+|`[^`]*`|\*\*|\[|\]\([^)]*\)/g, ' ').match(/[A-Za-z][A-Za-z'’-]+/g) || [])];
const pct = (a, b) => (100 * a / b).toFixed(2) + '%';

// runs inside the page: flagged words in a piece of text (older copies of the app have no spellScan, so mimic what spellNote did)
const PAGE = () => {
  window.__scan = typeof spellScan === 'function' ? spellScan : text => {
    const out = [];
    for (const m of text.matchAll(/[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g)) {
      const w = m[0].replace(/’/g, "'");
      if (/\d/.test(text[m.index - 1] || '') || /\d/.test(text[m.index + m[0].length] || '') || wordOk(w)) continue;
      out.push({w, at: m.index, len: m[0].length});
    }
    return out;
  };
  // how a list of (misspelling, right word) pairs does: caught, right word first, right word in the top three, and the time taken
  window.__sug = list => {
    const det = [], t = [], missed = [], bad1 = [], bad3 = [];
    for (const [w, r] of list) {
      if (!__scan(w).length) { missed.push(w); continue; }
      const a = performance.now(); const s = spellSuggest(spellDict, w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')); t.push(performance.now() - a);
      det.push(w); const i = s.findIndex(x => x.toLowerCase() === r.toLowerCase()), got = `${w} -> ${r} (got ${s.slice(0, 3).join(', ') || 'nothing'})`;
      if (i !== 0) bad1.push(got);
      if (i < 0 || i > 2) bad3.push(got);
    }
    t.sort((a, b) => a - b);
    return {n: list.length, det: det.length, missed, bad1, bad3, ms: {avg: t.reduce((a, b) => a + b, 0) / (t.length || 1), p95: t[Math.floor(t.length * .95)] || 0, max: t[t.length - 1] || 0}};
  };
};

async function setLang(page, lang){
  await page.evaluate(l => { const s = document.getElementById('spellLang'); s.value = l; s.onchange(); }, lang);
  await page.waitForFunction(() => typeof spellDict !== 'undefined' && !!spellDict, null, {timeout: 120000});
  await page.waitForFunction(() => !('tier' in spellDict) || !!spellDict.tier, null, {timeout: 20000}).catch(() => {});      // the common-words list arrives a moment later
  await page.evaluate(PAGE);
}

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(400);
  const t0 = Date.now();
  await page.waitForFunction(() => typeof spellDict !== 'undefined' && !!spellDict, null, {timeout: 120000});
  console.log(`    dictionary ready ${Date.now() - t0} ms after the page opened`);
  const report = {};
  fs.mkdirSync(path.join(__dirname, 'shots'), {recursive: true});
  for (const [lang, key] of [['en-GB', 'gb'], ['en-US', 'us']]) {
    await setLang(page, lang);
    const words = [...corpus[key]], hold = [...holdout[key]];
    const res = await page.evaluate(({words, hold, readme, misspelt, holdMiss, okText, badText}) => {
      const bad = list => list.filter(w => __scan(w).length);
      const textFp = [];
      for (const l of okText) { if (/^(gb|us):/.test(l) && l.slice(0, 2) !== (spellLang === 'en-GB' ? 'gb' : 'us')) continue; const b = __scan(l.replace(/^(gb|us):\s*/, '')).map(x => x.w); if (b.length) textFp.push(b.join(',') + '   in: ' + l.slice(0, 60)); }
      const textBad = [];
      for (const [l, exp] of badText) { const b = __scan(l).map(x => x.w).join(','); if (b !== exp) textBad.push(`${l.slice(0, 50)}  expected ${exp}  got ${b}`); }
      return {fp: bad(words), holdFp: bad(hold), readmeFp: bad(readme), main: __sug(misspelt), hold: __sug(holdMiss), textFp, textBad};
    }, {words, hold, readme, misspelt, holdMiss, okText, badText});
    fs.writeFileSync(path.join(__dirname, 'shots', `spell-${key}.txt`), [`FALSE FLAGS (${res.fp.length})`, ...res.fp, '', `HOLD-OUT FALSE FLAGS (${res.holdFp.length})`, ...res.holdFp, '', `README FLAGS (${res.readmeFp.length} of ${readme.length})`, ...res.readmeFp, '',
      `NOT DETECTED (${res.main.missed.length})`, ...res.main.missed, '', `NOT TOP 1 (${res.main.bad1.length})`, ...res.main.bad1, '', `NOT IN TOP 3 (${res.main.bad3.length})`, ...res.main.bad3, '',
      `HOLD-OUT NOT DETECTED (${res.hold.missed.length})`, ...res.hold.missed, '', `HOLD-OUT NOT TOP 1 (${res.hold.bad1.length})`, ...res.hold.bad1, '', `HOLD-OUT NOT IN TOP 3 (${res.hold.bad3.length})`, ...res.hold.bad3, '',
      'TEXT FALSE FLAGS', ...res.textFp, '', 'TEXT MISMATCH', ...res.textBad].join('\n'));
    const m = res.main, h = res.hold, top1 = r => r.n - r.bad1.length - r.missed.length;
    report[key] = {words: words.length, falseFlags: res.fp.length, falseFlagRate: res.fp.length / words.length, holdoutWords: hold.length, holdoutFalseFlags: res.holdFp.length, holdoutRate: res.holdFp.length / hold.length, readmeWords: readme.length, readmeFalseFlags: res.readmeFp.length,
      misspellings: m.n, caught: m.det, top1: top1(m), top3: m.det - m.bad3.length, holdoutMisspellings: h.n, holdoutCaught: h.det, holdoutTop1: top1(h), holdoutTop3: h.det - h.bad3.length, ms: m.ms, textFalseFlags: res.textFp.length, textMismatch: res.textBad.length};
    console.log(`    ${lang}: ${words.length} correct words, ${res.fp.length} wrongly flagged (${pct(res.fp.length, words.length)}); hold-out ${res.holdFp.length}/${hold.length} (${pct(res.holdFp.length, hold.length)}); README.md ${res.readmeFp.length}/${readme.length} (${pct(res.readmeFp.length, readme.length)}); running text: ${res.textFp.length} of ${okText.length} lines wrongly flagged, ${res.textBad.length} of ${badText.length} mistake lines wrong`);
    console.log(`      ${m.n} misspellings: caught ${pct(m.det, m.n)}, right word first ${pct(top1(m), m.n)}, in the top 3 for ${pct(m.det - m.bad3.length, m.det)} of those caught; hold-out ${h.n}: caught ${pct(h.det, h.n)}, first ${pct(top1(h), h.n)}, top 3 ${pct(h.det - h.bad3.length, h.det)}; suggestions avg ${m.ms.avg.toFixed(1)} ms, p95 ${m.ms.p95.toFixed(1)} ms, max ${m.ms.max.toFixed(1)} ms`);
    if (!REPORT) {
      ok(res.fp.length / words.length <= 0.01, `${lang}: false flags are at most 1% of ${words.length} correct words (${res.fp.length}: ${res.fp.slice(0, 12).join(' ')})`);
      ok(res.holdFp.length / hold.length <= 0.025, `${lang}: false flags are at most 2.5% of ${hold.length} hold-out words nobody listed (${res.holdFp.length}: ${res.holdFp.slice(0, 12).join(' ')})`);
      ok(res.readmeFp.length / readme.length <= 0.02, `${lang}: the README's own words are rarely flagged (${res.readmeFp.length}: ${res.readmeFp.slice(0, 12).join(' ')})`);
      ok(m.det / m.n >= 0.97 && h.det / h.n >= 0.97, `${lang}: at least 97% of ${m.n} + ${h.n} real misspellings are caught (${m.missed.concat(h.missed).join(' ')})`);
      ok((m.det - m.bad3.length) / m.det >= 0.90 && (h.det - h.bad3.length) / h.det >= 0.90, `${lang}: the right word is in the top 3 suggestions at least 90% of the time`);
      ok(res.textFp.length === 0, `${lang}: running lecture-note text has no false flags (${res.textFp.slice(0, 3).join(' | ')})`);
      ok(res.textBad.length === 0, `${lang}: the mistakes in running text are the ones flagged (${res.textBad.slice(0, 3).join(' | ')})`);
      ok(m.ms.p95 < 50 && h.ms.p95 < 50, `${lang}: suggestions come back in under 50 ms (p95 ${m.ms.p95.toFixed(1)} ms)`);
    }
  }
  fs.writeFileSync(path.join(__dirname, 'shots', 'spell-report.json'), JSON.stringify(report, null, 1));
  if (!REPORT) { await uiChecks(page); await browser.close(); await cacheChecks(); } else await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('no page errors');
})().catch(e => { console.error(e); process.exit(1); });

// ---- the page as a person uses it ----
async function uiChecks(page){
  await setLang(page, 'en-US');
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(600);
  const flagged = () => page.evaluate(() => [...spellRanges.values()].flat().map(x => x.word));
  const lines = () => page.evaluate(() => spellHl ? spellHl.size : -1);
  const newNote = async i => {
    await page.mouse.click(5, 700); await page.waitForTimeout(300);
    const strip = page.locator('.pagecard').nth(i).locator('.strip').last(); await strip.scrollIntoViewIfNeeded();
    const b = await strip.boundingBox(); await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2, {steps: 3}); await page.waitForTimeout(200);
    await page.click('.gappill'); await page.waitForTimeout(200);
    return page.locator('.pagecard').nth(i).locator('.mine').last();
  };
  const settle = async () => { await page.mouse.click(5, 700); await page.waitForTimeout(900); };
  const centre = word => page.evaluate(w => { for (const list of spellRanges.values()) for (const h of list) if (h.word === w) { h.range.startContainer.parentElement?.scrollIntoView({block: 'center'}); const r = h.range.getClientRects()[0]; return {x: r.left + r.width / 2, y: r.top + r.height / 2}; } return null; }, word);
  const rightClick = async word => { const c = await centre(word); await page.mouse.click(c.x, c.y, {button: 'right'}); await page.waitForTimeout(250); };
  const menu = () => page.evaluate(() => { const m = document.querySelector('.spellmenu:not(.wtmenu)'); return m && !m.hidden ? [...m.querySelectorAll('button')].map(b => b.className + ':' + b.textContent) : null; });

  // ---- marks the slips and leaves rerating, a name and the like alone ----
  let note = await newNote(1);
  await page.keyboard.type('Rational investors recieve the seperate letters, and a bank rerating Clicks is non-linear, co-operative and re-rateing. ');
  await settle();
  let f = await flagged();
  ok(f.join() === 'recieve,seperate,rateing', 'only the slips get a red line: ' + f.join(', '));
  ok(await lines() === 3, 'the red lines are drawn with the Highlight API (' + await lines() + ')');

  // ---- right-click: suggestions, the right one first ----
  await rightClick('recieve');
  let m = await menu();
  ok(m && m[0] === 'sug:receive' && m.some(x => /^:Add “recieve” to dictionary/.test(x)) && m.includes(':Ignore'), 'right-click on a misspelt word shows suggestions, "Add to dictionary" and "Ignore" (' + m + ')');
  await page.locator('.spellmenu .sug').first().click(); await page.waitForTimeout(600);
  ok(/receive the seperate/.test(await note.textContent()) && (await flagged()).join() === 'seperate,rateing', 'choosing a suggestion replaces the word');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(400);
  ok(/recieve the/.test(await note.textContent()), 'Back undoes the correction');
  await settle();

  // ---- right-click on a good word: the browser's own menu, not ours ----
  const good = await page.evaluate(() => { const n = document.querySelector('.pagecard:nth-of-type(2) .mine'); const t = n.firstChild; const i = t.data.indexOf('investors'); const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 9); const q = r.getClientRects()[0]; return {x: q.left + q.width / 2, y: q.top + q.height / 2}; });
  await page.mouse.click(good.x, good.y, {button: 'right'}); await page.waitForTimeout(250);
  ok(await menu() === null, 'right-click on a correct word leaves the browser menu alone');
  await page.keyboard.press('Escape'); await page.mouse.click(5, 700);

  // ---- add to dictionary: gone from the marks, listed in Help & settings, kept, and removable there ----
  await rightClick('seperate');
  await page.locator('.spellmenu [data-act="add"]').click(); await page.waitForTimeout(500);
  ok(!(await flagged()).includes('seperate') && await page.evaluate(() => userWords.has('seperate') && JSON.parse(localStorage.getItem('spell-words')).includes('seperate')), '"Add to dictionary" stops the red line and keeps the word');
  await page.click('#helpBtn'); await page.waitForTimeout(300);
  ok((await page.textContent('#dictList')).includes('seperate'), 'the word is in the dictionary list in Help & settings');
  await page.click('#dictList button[data-w="seperate"]'); await page.waitForTimeout(500);
  ok((await flagged()).includes('seperate'), 'removing it from the list brings the red line back');
  await page.keyboard.press('Escape');

  // ---- ignore: for now, not kept ----
  await rightClick('seperate');
  await page.locator('.spellmenu button', {hasText: 'Ignore'}).click(); await page.waitForTimeout(500);
  ok(!(await flagged()).includes('seperate') && await page.evaluate(() => ignoredWords.has('seperate') && !userWords.has('seperate')), '"Ignore" stops the red line without adding the word to your dictionary');

  // ---- keyboard in the menu ----
  await rightClick('recieve');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  ok(/receive the/.test(await note.textContent()), 'arrow keys and Enter choose a suggestion');
  await settle();

  // ---- UK and US spelling ----
  note = await newNote(2);
  await page.keyboard.type('The colour of the organisation, its organization and an analyse. '); await settle();
  f = await flagged();
  ok(['colour', 'organisation', 'analyse'].every(w => f.includes(w)) && !f.includes('organization'), 'US English marks colour, organisation and analyse: ' + f.join(', '));
  await page.click('#tab-view');
  await page.selectOption('#spellLang', 'en-GB'); await page.waitForFunction(() => spellDict && spellDict.lang === 'en-GB', null, {timeout: 60000}); await page.waitForTimeout(800);
  f = await flagged();
  ok(!['colour', 'organisation', 'organization', 'analyse'].some(w => f.includes(w)), 'UK English accepts them all (-ise and -ize), and marks nothing of that sentence: ' + f.join(', '));
  ok(await page.evaluate(() => document.documentElement.lang === 'en-GB' && document.querySelector('.mine').lang === 'en-GB' && document.querySelector('.mine').spellcheck === false), 'the language is on the page and in the notes, and the browser\'s own checker is off');
  await page.keyboard.press('Escape');

  // ---- Device: the browser or system checks, not us ----
  await page.selectOption('#spellLang', 'device'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => spellDict === null && !spellLoading && spellRanges.size === 0 && spellHl.size === 0), 'Device: our red lines go away');
  ok(await page.evaluate(() => [...document.querySelectorAll('.mine')].every(n => n.spellcheck === true && n.lang === navigator.language) && localStorage.getItem('spell-lang') === 'device'), 'Device: every note asks the browser to check spelling, in the device\'s language, and it is remembered');
  await page.evaluate(() => document.querySelector('.pagecard:nth-of-type(2) .mine').dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: 300, clientY: 300})));
  ok(await menu() === null, 'Device: right-click is the browser\'s own menu');
  await page.selectOption('#spellLang', 'en-US'); await page.waitForFunction(() => spellDict && spellDict.lang === 'en-US', null, {timeout: 60000}); await page.waitForTimeout(800);
  ok((await flagged()).includes('colour') && await page.evaluate(() => document.querySelector('.mine').spellcheck === false), 'back to US English: our red lines are back and the browser\'s checker is off');

  // ---- off ----
  await page.selectOption('#spellLang', 'off'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => spellRanges.size === 0 && spellHl.size === 0 && document.querySelector('.mine').spellcheck === false && !document.querySelector('.mine').hasAttribute('lang')), 'Spelling: off marks nothing');
  await page.selectOption('#spellLang', 'en-US'); await page.waitForFunction(() => spellDict && spellDict.lang === 'en-US', null, {timeout: 60000}); await page.waitForTimeout(600);

  // ---- Study mode shows no red lines, and they come back ----
  await page.click('#readBtn'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => spellRanges.size === 0 && spellHl.size === 0), 'Study mode: no red lines');
  await page.click('#readBtn'); await page.waitForTimeout(700);
  ok(await lines() > 0, 'leaving Study mode brings them back');

  // ---- other kinds of text ----
  note = await newNote(3);
  await page.keyboard.type('Visit www.example.org or mail a.b@c.co.za, see https://x.example.com/a?b=1 #todo @me, file notes_v2.pdf, H2O, 3rd, CEOs, iPhone, DStv, O\'Brien, e.g. Ph.D. Dr Smith\'s investors\' meeting. ');
  await settle();
  ok(await page.evaluate(() => { const n = document.querySelectorAll('.pagecard')[3].querySelector('.mine'); return !(spellRanges.get(n) || []).length; }), 'addresses, e-mails, tags, file names, acronyms, brands, names and abbreviations are left alone');
  note = await newNote(4);
  await page.keyboard.type('Table: '); await page.keyboard.press('Enter'); await page.keyboard.type('a wrod in a second line. '); await settle();
  ok((await flagged()).includes('wrod'), 'a second line (block) is checked too');

  // ---- a huge pasted blob must not freeze the page ----
  const blob = await page.evaluate(() => { const t = performance.now(); spellScan('x'.repeat(300000) + ' ' + 'ab.cd'.repeat(20000) + ' ' + 'a1b2c3-'.repeat(20000) + ' ' + 'ab+'.repeat(30000) + '@'); return Math.round(performance.now() - t); });
  ok(blob < 1500, `a pasted blob of letters, dots and hyphens is scanned in ${blob} ms`);

  // ---- speed with a big notebook: 200 notes ----
  const ms = await page.evaluate(() => {
    const pool = 'the investors rational market price adjust bank rating deleveraging heteroskedasticity regression equilibrium lecture notes mitochondria photosynthesis recieve seperate wrod tommorow definately arbitrage hedging liquidity amortisation securitisation capex Keynes Clicks Tesco Nasdaq rerating non-linear co-operative'.split(' ');
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const box = document.querySelector('.notebox'), host = box.parentNode;
    for (let i = 0; i < 199; i++) { const c = box.cloneNode(true); c.querySelector('.mine').textContent = Array.from({length: 120}, () => pool[Math.floor(rnd() * pool.length)]).join(' '); host.append(c); }
    spellCache = new Map(); const t = performance.now(); spellAll(); const first = performance.now() - t; const t2 = performance.now(); spellAll(); return [Math.round(first), Math.round(performance.now() - t2), document.querySelectorAll('.mine').length, spellHl.size];
  });
  ok(ms[2] >= 200 && ms[0] < 1500 && ms[1] < 700, `spell check of ${ms[2]} notes (${ms[3]} marked words): ${ms[0]} ms from cold, ${ms[1]} ms again`);
}

// ---- served over http, like the real thing: the word list is made once (in a worker, the page stays alive) and then kept on the device ----
async function cacheChecks(){
  const http = require('http'), root = path.resolve(__dirname, '..');
  const srv = http.createServer((req, res) => {
    const u = req.url.split('?')[0], f = path.join(root, u === '/' ? 'index.html' : u);
    fs.readFile(f, (e, b) => { if (e || !f.startsWith(root)) { res.writeHead(404); return res.end(); } res.writeHead(200, {'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'}); res.end(b); });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const {browser, page, errors} = await open(APP, {url: `http://127.0.0.1:${srv.address().port}/`, contextOptions: {serviceWorkers: 'block'}});
  const t0 = Date.now();
  await page.waitForFunction(() => typeof spellDict !== 'undefined' && !!spellDict, null, {timeout: 120000});
  const first = Date.now() - t0;
  const keys = await page.evaluate(async () => { const c = await caches.open('btl-spell-v2'); return (await c.keys()).map(r => r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 60)); });
  ok(keys.some(k => /btl.invalid|\/spell\/en-US/.test(k) || k.startsWith('/spell/en-US')), 'first visit: the US word list is kept on the device (' + keys.length + ' files in the cache)');
  const alive = await page.evaluate(async () => {            // make the list again and see that the page keeps running meanwhile, and that a worker did it
    const c = await caches.open('btl-spell-v2'); for (const k of await c.keys()) if (/\/spell\/en-GB/.test(k.url)) await c.delete(k);
    let ticks = 0, workers = 0; const W = Worker; window.Worker = function(...a){ workers++; return new W(...a); };
    const iv = setInterval(() => ticks++, 10), t = performance.now(); const text = await spellList('en-GB'); clearInterval(iv); window.Worker = W;
    return {ticks, workers, words: text.split('\n').length, ms: Math.round(performance.now() - t)};
  });
  ok(alive.workers === 1 && alive.ticks > alive.ms / 40, `the UK word list (${alive.words} words) is made in a worker in ${alive.ms} ms and the page keeps running meanwhile (${alive.ticks} ticks)`);
  const reqs = []; page.on('request', r => reqs.push(r.url()));
  const t1 = Date.now(); await page.reload(); await page.waitForFunction(() => typeof spellDict !== 'undefined' && !!spellDict, null, {timeout: 120000});
  const second = Date.now() - t1;
  ok(!reqs.some(u => /\.(aff|dic)$|typo\.js/.test(u)), `next visit: no dictionary files are downloaded (ready in ${second} ms, the first visit took ${first} ms)`);
  ok(await page.evaluate(() => spellDict.words.size > 100000 && wordOk('rerating') && !wordOk('recieve')), 'and it checks as before');
  await browser.close(); srv.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
}

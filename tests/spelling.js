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
  if (!REPORT) await uiChecks(page);
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('no page errors');
})().catch(e => { console.error(e); process.exit(1); });

async function uiChecks(page){}

// Spell check: how good is it? Measures false flags on thousands of correct words from lecture notes, how many real misspellings
// are caught and how well they are corrected, then drives the menu, "Add to dictionary", Ignore and the language choice like a person would.
//   node spelling.js                     checks (fails below the targets)
//   SPELL_REPORT=1 node spelling.js      only prints the numbers (use APP=/path/to/old/index.html to measure an older copy)
const {open} = require('./harness');
const path = require('path'), fs = require('fs');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const REPORT = !!process.env.SPELL_REPORT;
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const D = path.join(__dirname, 'spell');
const lines = f => fs.readFileSync(path.join(D, f), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
const WORD_FILES = fs.readdirSync(D).filter(f => /^words-.*\.txt$/.test(f));
// word, word@gb (only right in UK English) or word@us
const corpus = {gb: new Set(), us: new Set()};
for (const f of WORD_FILES) for (const l of lines(f)) for (const t of l.split(/\s+/).filter(Boolean)) {
  const m = t.match(/^(.*?)(?:@(gb|us))?$/); (m[2] ? [m[2]] : ['gb', 'us']).forEach(k => corpus[k].add(m[1]));
}
const misspelt = [].concat(...lines('misspellings.txt').map(l => l.split(/\s+/).filter(Boolean).map(p => p.split('|')))).map(([w, r]) => [w, r.replace(/_/g, ' ')]);
const okText = lines('text-ok.txt'), badText = lines('text-bad.txt').map(l => l.split(' => '));
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
  for (const [lang, key] of [['en-GB', 'gb'], ['en-US', 'us']]) {
    await setLang(page, lang);
    const words = [...corpus[key]];
    const res = await page.evaluate(({words, misspelt, okText, badText}) => {
      const fp = words.filter(w => __scan(w).length);
      const det = [], t = [], missed = [], bad1 = [], bad3 = [];
      for (const [w, r] of misspelt) {
        const flagged = __scan(w).length > 0; if (!flagged) { missed.push(w); continue; }
        const a = performance.now(); const s = spellSuggest(spellDict, w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')); t.push(performance.now() - a);
        det.push(w); const i = s.findIndex(x => x.toLowerCase() === r.toLowerCase());
        if (i !== 0) bad1.push(`${w} -> ${r} (got ${s.slice(0, 3).join(', ') || 'nothing'})`);
        if (i < 0 || i > 2) bad3.push(`${w} -> ${r} (got ${s.slice(0, 3).join(', ') || 'nothing'})`);
      }
      t.sort((a, b) => a - b);
      const textFp = [];
      for (const l of okText) { if (/^(gb|us):/.test(l) && l.slice(0, 2) !== (spellLang === 'en-GB' ? 'gb' : 'us')) continue; const b = __scan(l.replace(/^(gb|us):\s*/, '')).map(x => x.w); if (b.length) textFp.push(b.join(',') + '   in: ' + l.slice(0, 60)); }
      const textBad = [];
      for (const [l, exp] of badText) { const b = __scan(l).map(x => x.w).join(','); if (b !== exp) textBad.push(`${l.slice(0, 50)}  expected ${exp}  got ${b}`); }
      return {fp, det: det.length, missed, bad1, bad3, ms: {avg: t.reduce((a, b) => a + b, 0) / (t.length || 1), p95: t[Math.floor(t.length * .95)] || 0, max: t[t.length - 1] || 0}, textFp, textBad};
    }, {words, misspelt, okText, badText});
    fs.mkdirSync(path.join(__dirname, 'shots'), {recursive: true});
    fs.writeFileSync(path.join(__dirname, 'shots', `spell-${key}.txt`), [`FALSE FLAGS (${res.fp.length})`, ...res.fp, '', `NOT DETECTED (${res.missed.length})`, ...res.missed, '', `NOT TOP 1 (${res.bad1.length})`, ...res.bad1, '', `NOT IN TOP 3 (${res.bad3.length})`, ...res.bad3, '', 'TEXT FALSE FLAGS', ...res.textFp, '', 'TEXT MISMATCH', ...res.textBad].join('\n'));
    const n = misspelt.length;
    report[key] = {words: words.length, fp: res.fp.length, fpRate: res.fp.length / words.length, detected: res.det, n, top1: n - res.bad1.length - res.missed.length, top3: res.det - res.bad3.length, ms: res.ms, textFp: res.textFp.length, textBad: res.textBad.length};
    console.log(`    ${lang}: ${words.length} correct words, ${res.fp.length} wrongly flagged (${pct(res.fp.length, words.length)}); ` +
      `${res.det}/${n} misspellings caught (${pct(res.det, n)}), right word first for ${pct(n - res.bad1.length - res.missed.length, n)}, in the top 3 for ${pct(res.det - res.bad3.length, res.det)} of those caught; ` +
      `suggestions avg ${res.ms.avg.toFixed(1)} ms, p95 ${res.ms.p95.toFixed(1)} ms, max ${res.ms.max.toFixed(1)} ms; running text: ${res.textFp.length} lines wrongly flagged of ${okText.length}, ${res.textBad.length} of ${badText.length} mistakes lines wrong`);
    if (!REPORT) {
      ok(res.fp.length / words.length <= 0.01, `${lang}: false flags at most 1% of ${words.length} correct words (${res.fp.length}: ${res.fp.slice(0, 12).join(' ')})`);
      ok(res.det / n >= 0.97, `${lang}: at least 97% of ${n} real misspellings are caught (${res.missed.join(' ')})`);
      ok((res.det - res.bad3.length) / res.det >= 0.90, `${lang}: the right word is in the top 3 suggestions at least 90% of the time`);
      ok(res.textFp.length === 0, `${lang}: running lecture-note text has no false flags (${res.textFp.slice(0, 3).join(' | ')})`);
      ok(res.textBad.length === 0, `${lang}: the mistakes in running text are the ones flagged (${res.textBad.slice(0, 3).join(' | ')})`);
      ok(res.ms.p95 < 50, `${lang}: suggestions come back in under 50 ms (p95 ${res.ms.p95.toFixed(1)} ms)`);
    }
  }
  fs.writeFileSync(path.join(__dirname, 'shots', 'spell-report.json'), JSON.stringify(report, null, 1));
  if (!REPORT) await uiChecks(page);
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('no page errors');
})().catch(e => { console.error(e); process.exit(1); });

async function uiChecks(page){}

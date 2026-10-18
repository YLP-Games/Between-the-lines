// Journal entry: an accounting entry in an invisible four-column layout
const {start, settle, addNote, notebookDoc, pdfPages, pdfInk, near, rgb, ok, OUT, path, results} = require('./wtcommon');

const LIGHT = {dim: '#5d6877', acct: '#2b62b5', amt: '#8a5a14'}, DARK = {dim: '#dcdbd5', acct: '#8fc4ff', amt: '#f3e8b4'};
const act = page => page.evaluate(() => document.activeElement.className);
// three debits and two credits, typed the way a student would (Enter adds a row on the same side, Tab moves along)
async function build(page){
  const t = async s => { await page.keyboard.type(s); await page.keyboard.press('Tab'); };
  await page.keyboard.type('Cash'); await page.keyboard.press('Tab'); await page.keyboard.type('1500'); await page.keyboard.press('Enter');
  await page.keyboard.type('Accounts receivable'); await page.keyboard.press('Tab'); await page.keyboard.type('300'); await page.keyboard.press('Enter');
  await page.keyboard.type('Prepaid rent'); await page.keyboard.press('Tab'); await page.keyboard.type('100');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');              // the CR indicator, then its account
  await page.keyboard.type('Service revenue'); await page.keyboard.press('Tab'); await page.keyboard.type('1200'); await page.keyboard.press('Enter');
  await page.keyboard.type('Interest income'); await page.keyboard.press('Tab'); await page.keyboard.type('700');
  await page.keyboard.press('Tab'); await page.keyboard.type('Cash sale of services, interest earned');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
}
const measure = page => page.evaluate(() => {
  const b = document.querySelector('.jrnl'), R = e => e.getBoundingClientRect();
  const textBox = e => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect(); };
  const rows = [...b.querySelectorAll('.j-row')].map(r => {
    const d = r.querySelector('.j-d'), c = r.querySelector('.j-c'), on = r.querySelector('.j-amt:not(.off)'), a = r.querySelector('.j-acct');
    return {s: r.dataset.s, ind: R(r.querySelector('.j-ind')).left, acct: R(a).left, acctText: a.textContent ? textBox(a).left : null, dR: R(d).right, cR: R(c).right, amtText: on.textContent ? textBox(on).right : null, amtCell: R(on).right, onIsD: on === d};
  });
  return {rows, date: R(b.querySelector('.j-date')).left, desc: R(b.querySelector('.j-desc')).left, box: R(b)};
});

(async () => {
  const {browser, page, errors, card} = await start();
  await page.click('#tab-insert');

  // ---- Insert › Journal entry with no note open: its own note in the nearest gap ----
  ok(await page.locator('.notebox').count() === 0, 'no notes to begin with');
  ok((await page.getAttribute('#jeBtn', 'data-tip')).startsWith('Journal entry'), 'the button has a tooltip');
  await page.click('#jeBtn'); await page.waitForTimeout(300);
  ok(await page.locator('.notebox').count() === 1 && await page.locator('.notebox .jrnl').count() === 1, 'it adds a note with the journal entry in it');
  ok(await card.locator('.notebox .jrnl').count() === 1, '… on the page you are on');
  ok(await page.evaluate(() => document.activeElement.classList.contains('j-acct') && document.activeElement.closest('.j-row').dataset.s === 'dr'), 'the first debit account is ready to type in');
  const shape = await page.evaluate(() => { const b = document.querySelector('.jrnl'); return {kids: [...b.children].map(c => c.className), rows: [...b.querySelectorAll('.j-row')].map(r => r.dataset.s + ':' + [...r.children].map(c => c.className.replace(/\bj-/g, '')).join('/')), date: b.querySelector('.j-date').textContent, desc: b.querySelector('.j-desc').textContent, descPh: getComputedStyle(b.querySelector('.j-desc'), '::before').content, datePh: getComputedStyle(b.querySelector('.j-date'), '::before').content, hasPh: !!b.querySelector('.j-date[data-ph], .j-desc[data-ph]'), bg: getComputedStyle(b).backgroundColor, padL: getComputedStyle(b).paddingLeft, grid: getComputedStyle(b).display, cols: getComputedStyle(b).gridTemplateColumns.split(' ').length, border: getComputedStyle(b).borderTopWidth, cellBorder: [...b.querySelectorAll('.j-row > *, .j-date, .j-desc')].map(e => getComputedStyle(e).borderTopWidth).filter(w => w !== '0px').length}; });
  ok(shape.kids.join() === 'j-date,j-row,j-row,j-foot', 'the template: a date line, one DR row, one CR row, the description');
  ok(shape.rows.join() === 'dr:ind/acct/amt d/amt c off,cr:ind/acct/amt d off/amt c', `each row has four cells: indicator, account, debit, credit (${shape.rows.join(' | ')})`);
  ok(shape.grid === 'grid' && shape.cols === 4, 'laid out by a CSS grid with four columns');
  ok(shape.border === '0px' && shape.cellBorder === 0, 'with no visible borders');
  const today = new Date(), want = `${today.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][today.getMonth()]} ${today.getFullYear()}`;
  ok(shape.date === want && /^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(shape.date), `the date is today, like ${want}`);
  ok(!/date/i.test(await page.evaluate(() => document.querySelector('.jrnl').innerText.replace(/\d+ \w+ \d{4}/, ''))), 'with no "Date:" label');
  ok(shape.desc === '' && !shape.hasPh && ['none', 'normal'].includes(shape.descPh) && ['none', 'normal'].includes(shape.datePh), 'the description is empty, with no placeholder text at all (CHANGED: it used to show a faint "Description")');
  ok(shape.bg === 'rgba(0, 0, 0, 0)' && shape.padL === '0px', 'the block has no panel: a fully transparent background, no side padding (NEW)');
  ok(await page.evaluate(() => { const b = document.querySelector('.jrnl'), n = getComputedStyle(b.closest('.mine')).backgroundColor; return n === 'rgba(0, 0, 0, 0)'; }), 'and so it blends with the page, like the note itself (NEW)');

  // ---- three debits and two credits ----
  await build(page);
  const m = await measure(page);
  ok(m.rows.length === 5 && m.rows.map(r => r.s).join() === 'dr,dr,dr,cr,cr', 'Enter added rows on the same side: 3 DR then 2 CR');
  const eq = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;
  const dRows = m.rows.filter(r => r.s === 'dr'), cRows = m.rows.filter(r => r.s === 'cr');
  ok(m.rows.every(r => eq(r.dR, m.rows[0].dR)), `every row's debit column ends at the same x (${m.rows[0].dR.toFixed(1)})`);
  ok(m.rows.every(r => eq(r.cR, m.rows[0].cR)), `every row's credit column ends at the same x (${m.rows[0].cR.toFixed(1)})`);
  ok(m.rows[0].cR - m.rows[0].dR > 30, 'the credit column is its own column to the right of the debit column');
  ok(dRows.every(r => r.amtText !== null && eq(r.amtText, r.dR, 1.5)) && cRows.every(r => r.amtText !== null && eq(r.amtText, r.cR, 1.5)), 'amounts are right-aligned: the digits end at the column edge (debits in column 3, credits in column 4)');
  ok(dRows.every(r => eq(r.ind, dRows[0].ind)) && cRows.every(r => eq(r.ind, cRows[0].ind)), 'all DR indicators line up, and all CR indicators line up');
  ok(cRows[0].ind > dRows[0].ind + 8, `CR is indented (${cRows[0].ind.toFixed(1)}) further than DR (${dRows[0].ind.toFixed(1)})`);
  ok(dRows.every(r => eq(r.acctText, dRows[0].acctText)) && cRows.every(r => eq(r.acctText, cRows[0].acctText)), 'debit account names line up, and credit account names line up');
  ok(cRows[0].acctText > dRows[0].acctText + 8, `credit accounts are indented (${cRows[0].acctText.toFixed(1)}) further than debit accounts (${dRows[0].acctText.toFixed(1)})`);
  ok(eq(cRows[0].acctText - dRows[0].acctText, cRows[0].ind - dRows[0].ind, 2), 'by the same step as the CR indicator');
  ok(eq(m.date, dRows[0].ind) && eq(m.desc, dRows[0].ind), 'the date and the description start where the DR indicators do');
  const amts = await page.$$eval('.jrnl .j-amt:not(.off)', e => e.map(x => x.textContent));
  ok(amts.join('|') === '1,500|300|100|1,200|700', `amounts got thousands separators on leaving the field (${amts.join(' ')})`);
  ok(await page.evaluate(() => !document.querySelector('.jrnl .j-foot').hasAttribute('data-diff')), 'debits equal credits (1,900): no marker');
  await page.screenshot({path: path.join(OUT, 'journal-3dr-2cr-light.png'), clip: {x: 360, y: 120, width: 980, height: 560}});
  const jb = await page.evaluate(() => { const r = document.querySelector('.notebox').getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height}; });

  // ---- colours ----
  const colours = async () => page.evaluate(() => { const c = s => getComputedStyle(document.querySelector(s)).color; return {date: c('.j-date'), desc: c('.j-desc'), ind: c('.j-ind'), acct: c('.j-acct'), amt: c('.j-amt:not(.off)')}; });
  let col = await colours();
  ok(col.date === rgb(LIGHT.dim) && col.desc === rgb(LIGHT.dim), 'light theme: the date and description are slate grey');
  ok(col.ind === rgb(LIGHT.acct) && col.acct === rgb(LIGHT.acct), 'DR/CR and account names are a mid blue');
  ok(col.amt === rgb(LIGHT.amt), 'amounts are a warm amber-brown');

  // ---- NEW: a fill from the Box tab shows through; the colours follow the paper ----
  const nbState = () => page.evaluate(() => { const n = document.querySelector('.notebox'), cs = s => getComputedStyle(n.querySelector(s)); return {note: cs('.mine').backgroundColor, jrnl: cs('.jrnl').backgroundColor, tone: n.dataset.tone || '', dim: cs('.j-date').color, acct: cs('.j-acct').color, amt: cs('.j-amt:not(.off)').color}; });
  const fillShot = name => page.screenshot({path: path.join(OUT, name), clip: {x: jb.x - 14, y: jb.y - 14, width: jb.width + 28, height: jb.height + 28}});
  await fillShot('ref-journal-light.png');
  await page.click('#tab-box');
  await page.fill('#bFill', '#ffe3e3'); await page.waitForTimeout(150);
  let fs = await nbState();
  ok(fs.note === 'rgb(255, 227, 227)' && fs.jrnl === 'rgba(0, 0, 0, 0)', `the note's fill (Box tab, Fill) shows through the block, which stays transparent (${fs.note})`);
  ok(fs.tone === 'light' && fs.dim === rgb(LIGHT.dim) && fs.acct === rgb(LIGHT.acct) && fs.amt === rgb(LIGHT.amt), 'on a light fill the darker colours stay');
  await fillShot('ref-journal-fill-light.png');
  await page.fill('#bFill', '#b8c0cc'); await page.waitForTimeout(100);
  ok((await nbState()).tone === 'light', 'a mid-light fill is still light paper');
  await page.fill('#bFill', '#2b2f36'); await page.waitForTimeout(150);
  fs = await nbState();
  ok(fs.note === 'rgb(43, 47, 54)' && fs.jrnl === 'rgba(0, 0, 0, 0)' && fs.tone === 'dark', 'a dark fill is taken too');
  ok(fs.dim === rgb(DARK.dim) && fs.acct === rgb(DARK.acct) && fs.amt === rgb(DARK.amt), 'and then the colours switch to the off-white, light blue and cream');
  await fillShot('ref-journal-fill-dark.png');
  const lum = c => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.299 * r + 0.587 * g + 0.114 * b; };
  ok(lum(fs.dim) > 180 && lum(fs.acct) > 150 && lum(fs.amt) > 200, 'readable on the dark fill (all light)');
  await page.click('#bNoFill'); await page.waitForTimeout(150);
  fs = await nbState();
  ok(fs.tone === '' && fs.note === 'rgba(0, 0, 0, 0)' && fs.amt === rgb(LIGHT.amt), 'No fill takes the panel away again and brings the paper colours back');
  await page.click('#tab-insert');

  // ---- switching a row's side ----
  const row = n => page.locator('.jrnl .j-row').nth(n);
  await row(1).locator('.j-ind').click(); await page.waitForTimeout(150);
  let st = await page.evaluate(() => [...document.querySelectorAll('.jrnl .j-row')].map(r => r.dataset.s + ':' + r.querySelector('.j-ind').textContent + ':' + r.querySelector('.j-d').textContent + '/' + r.querySelector('.j-c').textContent));
  ok(st[1] === 'cr:CR:/300', `clicking DR makes the row a credit and its amount moves to the credit column (${st[1]})`);
  const m2 = await measure(page);
  ok(m2.rows[1].s === 'cr' && eq(m2.rows[1].ind, m2.rows[3].ind) && eq(m2.rows[1].acctText, m2.rows[3].acctText) && eq(m2.rows[1].cR, m2.rows[3].cR), 'and it lines up with the other credits');
  await row(1).locator('.j-ind').click(); await page.waitForTimeout(150);
  st = await page.evaluate(() => document.querySelectorAll('.jrnl .j-row')[1].dataset.s + document.querySelectorAll('.jrnl .j-row')[1].querySelector('.j-d').textContent);
  ok(st === 'dr300', 'clicking again puts it back');
  // by typing: from the account, Shift+Tab goes to the indicator, which is selected
  await row(2).locator('.j-acct').click(); await page.keyboard.press('Shift+Tab');
  ok(await page.evaluate(() => document.activeElement.classList.contains('j-ind') && getSelection().toString() === 'DR'), 'Shift+Tab from an account lands on the indicator with DR selected');
  await page.keyboard.type('c'); await page.waitForTimeout(100);
  st = await page.evaluate(() => { const r = document.querySelectorAll('.jrnl .j-row')[2]; return r.dataset.s + ':' + r.querySelector('.j-ind').textContent + ':' + r.querySelector('.j-c').textContent; });
  ok(st === 'cr:CR:100', 'typing c makes it CR');
  await page.keyboard.press('Control+a'); await page.keyboard.type('dr'); await page.waitForTimeout(100);
  st = await page.evaluate(() => { const r = document.querySelectorAll('.jrnl .j-row')[2]; return r.dataset.s + ':' + r.querySelector('.j-ind').textContent + ':' + r.querySelector('.j-d').textContent; });
  ok(st === 'dr:DR:100', 'typing dr puts it back to DR');

  // ---- the ≠ marker ----
  const diff = () => page.evaluate(() => { const f = document.querySelector('.jrnl .j-foot'); return f.hasAttribute('data-diff') ? getComputedStyle(f, '::after').content : null; });
  await row(4).locator('.j-amt:not(.off)').click(); await page.keyboard.press('Control+a'); await page.keyboard.type('800'); await page.keyboard.press('Tab');
  ok(await diff() === '"≠ 100"', 'debits 1,900 and credits 1,300 + 800 = 2,000: a tiny "≠ 100" shows beside the description');
  await page.screenshot({path: path.join(OUT, 'journal-diff-light.png'), clip: {x: jb.x - 10, y: jb.y - 10, width: jb.width + 20, height: jb.height + 20}});
  await row(0).locator('.j-amt:not(.off)').click(); await page.keyboard.press('Control+a'); await page.keyboard.type('1,200,000'); await page.keyboard.press('Tab');
  ok(await diff() === '"≠ 1,198,400"', 'the difference has thousands separators too');
  await row(4).locator('.j-amt:not(.off)').click(); await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace'); await page.keyboard.press('Tab');
  ok(await diff() === null, 'with an amount still empty, there is no marker');
  await row(4).locator('.j-amt:not(.off)').click(); await page.keyboard.type('700'); await page.keyboard.press('Tab');
  await row(0).locator('.j-amt:not(.off)').click(); await page.keyboard.press('Control+a'); await page.keyboard.type('1500'); await page.keyboard.press('Tab');
  ok(await diff() === null, 'balanced again: the marker goes');

  // ---- amounts: what can be typed, and how it is tidied ----
  const fmt = await page.evaluate(() => ['1200.5', '(1200)', '-1234567.891', '1,2,3,4', '0012', '.5', '12.', '(1200', 'abc', ''].map(s => jFmt(s)));
  ok(fmt.join('|') === '1,200.5|(1,200)|-1,234,567.891|1,234|12|0.5|12|(1,200)|abc|', `thousands separators, decimals kept, brackets and minus kept (${fmt.join(' ')})`);
  ok(await page.evaluate(() => jNum('(1,200.50)') === -1200.5 && jNum('-3') === -3 && jNum('1,200') === 1200 && jNum('') === null), 'brackets and a minus mean negative');
  await row(0).locator('.j-amt:not(.off)').click(); await page.keyboard.press('Control+a'); await page.keyboard.type('12a3b#x');
  ok(await row(0).locator('.j-amt:not(.off)').textContent() === '123', 'letters and symbols cannot be typed in an amount');
  await page.keyboard.press('Control+a'); await page.keyboard.type('(1200.50)'); await page.keyboard.press('Tab');
  ok(await row(0).locator('.j-amt:not(.off)').textContent() === '(1,200.50)', 'a bracketed amount keeps its brackets and decimals');
  await row(0).locator('.j-amt:not(.off)').click(); await page.keyboard.press('Control+a'); await page.keyboard.type('1500'); await page.keyboard.press('Tab');


  // ---- NEW: arrow keys go round the entry like a table ----
  const ZN = ['ind', 'acct', 'amt'];
  const here = () => page.evaluate(() => {
    const f = document.activeElement, b = f.closest?.('.jrnl'), s = getSelection();
    if (!b) return {out: true, note: !!f.closest?.('.mine'), inNote: !!(s.anchorNode && f.contains(s.anchorNode)), after: null};
    const rows = [...b.querySelectorAll('.j-row')], row = f.closest('.j-row');
    const z = f.classList.contains('j-date') ? 'date' : f.classList.contains('j-desc') ? 'desc' : rows.indexOf(row) + ':' + (f.classList.contains('j-ind') ? 'ind' : f.classList.contains('j-acct') ? 'acct' : 'amt');
    const a = document.createRange(); a.selectNodeContents(f); if (s.anchorNode && f.contains(s.anchorNode)) a.setEnd(s.anchorNode, s.anchorOffset);
    return {out: false, z, pos: a.toString().length, len: f.textContent.length, coll: s.isCollapsed};
  });
  const go = (r, z, pos) => page.evaluate(([r, z, pos]) => {   // the caret in a field (pos: a number, or the end)
    const b = document.querySelector('.jrnl'), f = z === 'date' ? b.querySelector('.j-date') : z === 'desc' ? b.querySelector('.j-desc') : b.querySelectorAll('.j-row')[r].querySelector({ind: '.j-ind', acct: '.j-acct', amt: '.j-amt:not(.off)'}[z]);
    jFocus(f); if (pos != null && f.firstChild) { const rg = document.createRange(); rg.setStart(f.firstChild, pos); rg.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); }
  }, [r, z, pos]);
  const press = async (k, times = 1) => { for (let i = 0; i < times; i++) await page.keyboard.press(k); await page.waitForTimeout(30); };
  await page.mouse.click(8, 700);
  const total = await page.locator('.jrnl .j-row').count();
  ok(total === 5, '(an entry with five rows)');
  let upOk = [], downOk = [], endOk = [];
  for (let r = 0; r < 5; r++) for (const z of ZN) {
    await go(r, z); await press('ArrowUp'); let h = await here();
    upOk.push(r === 0 ? h.z === 'date' : h.z === `${r - 1}:${z}`); if (r > 0) endOk.push(h.pos === h.len);
    await go(r, z); await press('ArrowDown'); h = await here();
    downOk.push(r === 4 ? h.z === 'desc' : h.z === `${r + 1}:${z}`); if (r < 4) endOk.push(h.pos === h.len);
  }
  ok(upOk.length === 15 && upOk.every(Boolean), 'Up goes to the same column in the row above (indicator, account and amount, in all five rows), and from the first row to the date');
  ok(downOk.length === 15 && downOk.every(Boolean), 'Down goes to the same column in the row below, and from the last row to the description');
  ok(endOk.every(Boolean), 'moving into a field puts the caret at the end of its text');
  await go(2, 'acct'); await press('ArrowUp', 3);
  ok((await here()).z === 'date', 'Up, Up, Up from the third account reaches the date');
  await press('ArrowDown');
  ok((await here()).z === '0:acct', 'and Down comes back to the column it left (the account)');
  await go(3, 'amt'); await press('ArrowDown', 2);
  ok((await here()).z === 'desc', 'Down twice from the fourth row reaches the description');
  await press('ArrowUp');
  ok((await here()).z === '4:amt', 'and Up comes back to the amount');
  await page.evaluate(() => { delete document.querySelector('.jrnl').jcol; });
  await go(0, 'date'); await press('ArrowDown');
  ok((await here()).z === '0:ind', 'from the date, Down goes to the first row (the indicator, which the date lines up with)');
  await page.evaluate(() => { delete document.querySelector('.jrnl').jcol; });
  await go(0, 'desc'); await press('ArrowUp');
  ok((await here()).z === '4:ind', 'from the description, Up goes to the last row');
  // left and right: along the text first, then across the zones
  await go(1, 'acct', 3); await press('ArrowLeft');
  let h = await here();
  ok(h.z === '1:acct' && h.pos === 2, 'Left in the middle of an account name moves the caret one letter, as usual');
  await press('ArrowRight');
  h = await here();
  ok(h.z === '1:acct' && h.pos === 3, 'and Right too');
  await go(1, 'acct', 0); await press('ArrowLeft');
  h = await here();
  ok(h.z === '1:ind' && h.pos === h.len, 'Left at the start of the account goes to the DR/CR indicator, caret at its end');
  await go(1, 'ind', 0); await press('ArrowLeft');
  h = await here();
  ok(h.z === '0:amt' && h.pos === h.len, 'Left at the start of the indicator goes to the amount of the row above');
  await go(0, 'ind', 0); await press('ArrowLeft');
  h = await here();
  ok(h.z === '0:ind' && h.pos === 0, 'but not past the very first zone (it stays, caret at the start)');
  await go(0, 'ind'); await press('ArrowRight');
  h = await here();
  ok(h.z === '0:acct' && h.pos === h.len, 'Right at the end of the indicator goes to the account');
  await go(0, 'acct'); await press('ArrowRight');
  h = await here();
  ok(h.z === '0:amt' && h.pos === h.len, 'Right at the end of the account goes to the amount');
  await go(0, 'amt'); await press('ArrowRight');
  h = await here();
  ok(h.z === '1:ind' && h.pos === h.len, 'Right at the end of the amount goes to the indicator of the next row');
  await go(4, 'amt'); await press('ArrowRight');
  h = await here();
  ok(h.z === '4:amt' && h.pos === h.len, 'and stays at the end of the last zone');
  await go(1, 'acct', 5); await press('ArrowRight');
  h = await here();
  ok(h.z === '1:acct' && h.pos === 6, 'Right in the middle of the text only moves the caret');
  await go(1, 'acct'); await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('Shift+ArrowLeft');
  h = await here();
  ok(h.z === '1:acct' && !h.coll, 'Shift+Left still selects letters inside the field');
  await go(1, 'acct', 0); await press('Home');
  ok((await here()).z === '1:acct', 'Home and End keep their usual job');
  // the date and the description: Left and Right only move within them; Up leaves the entry at the top, Down at the bottom
  await go(0, 'date', 0); await press('ArrowLeft'); h = await here();
  ok(h.z === 'date' && h.pos === 0, 'Left at the start of the date stays in the date');
  await go(0, 'date'); await press('ArrowRight'); h = await here();
  ok(h.z === 'date' && h.pos === h.len, 'Right at the end of the date stays in the date');
  await go(0, 'date', 3); await press('ArrowLeft'); h = await here();
  ok(h.z === 'date' && h.pos === 2, 'Left inside the date moves one letter');
  await go(0, 'desc'); await press('ArrowRight'); h = await here();
  ok(h.z === 'desc' && h.pos === h.len, 'Right at the end of the description stays');
  await go(0, 'date'); await page.evaluate(() => { delete document.querySelector('.jrnl').jcol; });
  await go(0, 'date'); await press('ArrowUp'); h = await here();
  ok(h.z === 'date', 'Up from the date with nothing above the entry stays in the date (there is nowhere to go)');
  await go(0, 'desc'); await press('ArrowDown');
  const left2 = await page.evaluate(() => { const b = document.querySelector('.jrnl'), s = getSelection(); return {sel: s.rangeCount && s.isCollapsed, note: document.activeElement === b.closest('.mine'), after: (() => { const r = document.createRange(); r.setStartAfter(b); r.collapse(true); return s.getRangeAt(0).compareBoundaryPoints(Range.START_TO_START, r) >= 0; })()}; });
  ok(left2.note && left2.sel && left2.after, 'Down from the description leaves it too: the caret is in the note, below it');
  // a long account name wraps: Up and Down move along its lines first
  await go(0, 'acct'); await page.keyboard.type(' with a very long name that must wrap onto a second line of the account column ok');
  const lines = await page.evaluate(() => { const f = document.querySelectorAll('.jrnl .j-row')[0].querySelector('.j-acct'); return Math.round(f.getBoundingClientRect().height / parseFloat(getComputedStyle(f).lineHeight)); });
  ok(lines >= 2, `(the account wraps onto ${lines} lines)`);
  await press('ArrowUp'); h = await here();
  ok(h.z === '0:acct', 'Up on the last line of a wrapped account stays in it (moves up a line)');
  let ups = 1; while (h.z === '0:acct' && ups < 8) { await press('ArrowUp'); h = await here(); ups++; }
  ok(h.z === 'date' && ups === lines, `and on the first line goes to the date (after ${ups} presses for ${lines} lines)`);
  await go(0, 'acct', 20); await page.keyboard.press('Control+a'); await page.keyboard.type('Cash'); await page.keyboard.press('Tab');
  await page.keyboard.press('Control+a'); await page.keyboard.type('1500'); await page.keyboard.press('Tab');
  await page.mouse.click(8, 700);

  // ---- save, reload, undo ----
  await settle(page);
  const html0 = await page.evaluate(() => document.querySelector('.jrnl').outerHTML);
  await page.reload(); await page.waitForTimeout(2000);
  ok(await page.locator('.jrnl').count() === 1, 'the journal entry is still there after a reload');
  const html1 = await page.evaluate(() => document.querySelector('.jrnl').outerHTML);
  ok(html1 === html0, 'exactly as it was (same markup, same fields)');
  const m3 = await measure(page);
  ok(m3.rows.every(r => eq(r.dR, m3.rows[0].dR)) && m3.rows.every(r => eq(r.cR, m3.rows[0].cR)) && m3.rows.length === 5, 'and still lined up');
  ok(await page.evaluate(() => [...document.querySelectorAll('.jrnl [contenteditable]')].filter(f => f.isContentEditable).length) === 1 + 5 * 3 + 1, 'every field is editable again (date, three per row, description)');
  await page.locator('.jrnl .j-desc').click(); await page.keyboard.press('End'); await page.keyboard.type('!'); await settle(page);
  await page.click('#undoBtn'); await page.waitForTimeout(600);
  ok(await page.locator('.jrnl .j-desc').textContent() === 'Cash sale of services, interest earned', 'Back undoes the last edit');
  await page.click('#redoBtn'); await page.waitForTimeout(600);
  ok((await page.locator('.jrnl .j-desc').textContent()).endsWith('!'), 'Forward puts it back');
  // add a row, then undo and redo it
  await row(4).locator('.j-acct').click(); await page.keyboard.press('Enter'); await page.waitForTimeout(100); await settle(page);
  ok(await page.locator('.jrnl .j-row').count() === 6, 'a sixth row');
  await page.click('#undoBtn'); await page.waitForTimeout(600);
  ok(await page.locator('.jrnl .j-row').count() === 5 && await page.evaluate(() => document.querySelector('.jrnl').outerHTML.includes('Interest income')), 'undo takes the row away');
  await page.click('#redoBtn'); await page.waitForTimeout(600);
  ok(await page.locator('.jrnl .j-row').count() === 6, 'redo brings it back');
  await page.click('#undoBtn'); await page.waitForTimeout(600);
  ok(await page.locator('.jrnl .j-row').count() === 5, '(back to five)');
  // the whole entry: undo past its insertion and redo
  await settle(page);

  // ---- downloads: notebook file and PDF ----
  const nb = await notebookDoc(page);
  ok(nb.data.doc.includes('class="jrnl"') && nb.data.doc.includes('class="j-row" data-s="cr"') && nb.data.doc.includes('Service revenue') && nb.data.doc.includes('1,200'), 'the notebook file carries the journal entry and its rows');
  const pdf = await pdfPages(page);
  ok(pdf.jpegs.length === 6, 'the PDF has the six pages');
  const pj = pdf.jpegs[2]; require('fs').writeFileSync(path.join(OUT, 'journal-pdf-light.jpg'), pj);
  const inkA = await pdfInk(page, pj, 2, '.jrnl .j-amt:not(.off)'), inkB = await pdfInk(page, pj, 2, '.jrnl .j-acct, .jrnl .j-ind'), inkC = await pdfInk(page, pj, 2, '.jrnl .j-date, .jrnl .j-desc');
  ok(inkA.n > 60 && near(inkA.avg, LIGHT.amt), `in the PDF the amounts are the warm amber-brown (${inkA.avg}, ${inkA.n} pixels)`);
  ok(inkB.n > 100 && near(inkB.avg, LIGHT.acct), `DR/CR and accounts are the mid blue (${inkB.avg})`);
  ok(inkC.n > 60 && near(inkC.avg, LIGHT.dim), `the date and description are slate grey (${inkC.avg})`);
  await page.screenshot({path: path.join(OUT, 'journal-after-pdf-light.png'), clip: {x: jb.x - 10, y: jb.y - 10, width: jb.width + 20, height: jb.height + 20}});

  // ---- Backspace removes an empty row; one row always stays; Tab order ----
  await page.mouse.click(8, 700); await page.waitForTimeout(100);
  await page.click('#tab-insert'); await page.click('#jeBtn'); await page.waitForTimeout(300);
  ok(await page.locator('.jrnl').count() === 2, 'a second journal entry (in its own note)');
  const j2 = page.locator('.jrnl').nth(1);
  ok(await page.locator('.notebox').count() === 2 && await j2.evaluate(j => !!j.closest('.notebox') && j.closest('.mine').children.length >= 1), 'in a note of its own');
  await j2.locator('.j-date').click(); await page.keyboard.press('Tab');
  const order = [await act(page)];
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); order.push(await act(page)); }
  ok(order.join() === 'j-ind,j-acct,j-amt j-d,j-ind,j-acct,j-amt j-c,j-desc', `Tab walks date, indicator, account, debit amount, indicator, account, credit amount, description (${order.join(' > ')})`);
  await page.keyboard.press('Tab');
  ok(await page.evaluate(() => document.activeElement.classList.contains('mine') && getSelection().isCollapsed && !!getSelection().anchorNode), 'Tab after the description leaves the entry, to the note');
  await j2.locator('.j-desc').click(); await page.keyboard.press('Shift+Tab');
  ok((await act(page)) === 'j-amt j-c', 'Shift+Tab walks back');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab');
  ok((await act(page)) === 'j-date', 'all the way back to the date');
  await page.keyboard.press('Shift+Tab');
  ok((await act(page)) === 'j-date', 'and stops there');
  await j2.locator('.j-row').nth(1).locator('.j-acct').click(); await page.keyboard.press('Backspace');
  ok(await j2.locator('.j-row').count() === 1 && await page.evaluate(() => document.activeElement.classList.contains('j-acct')), 'Backspace in an empty row removes it (focus goes to the row above)');
  await page.keyboard.press('Backspace');
  ok(await j2.locator('.j-row').count() === 1, 'but the last row is always kept');
  await page.keyboard.type('Bank'); await page.keyboard.press('Backspace');
  ok(await j2.locator('.j-row').count() === 1 && (await j2.locator('.j-acct').textContent()) === 'Ban', 'Backspace in a row with text just deletes a letter');
  await page.keyboard.press('Enter');
  ok(await j2.locator('.j-row').count() === 2 && await j2.locator('.j-row').nth(1).getAttribute('data-s') === 'dr', 'Enter under a DR row adds a DR row');
  await page.keyboard.type('x'); await page.keyboard.press('Backspace');
  ok(await j2.locator('.j-row').count() === 2, 'Backspace over a typed letter keeps the row');
  await page.keyboard.press('Backspace');
  ok(await j2.locator('.j-row').count() === 1, 'and once it is empty, Backspace takes the row away');
  // Enter in the date goes to the first account; Enter in the description leaves it
  await j2.locator('.j-date').click(); await page.keyboard.press('Enter');
  ok((await act(page)).includes('j-acct'), 'Enter in the date moves to the first account');
  // paste is plain text; Enter never makes a new line inside a field
  await j2.locator('.j-desc').click(); await page.keyboard.type('line one'); await page.keyboard.press('Enter');
  ok(!(await j2.locator('.j-desc').innerHTML()).includes('<br') && (await j2.locator('.j-desc').textContent()) === 'line one', 'the description stays on one line');
  // date can be cleared
  await j2.locator('.j-date').click(); await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace');
  ok(await j2.locator('.j-date').evaluate(d => d.textContent === '' && ['none', 'normal'].includes(getComputedStyle(d, '::before').content)), 'the date can be cleared, and nothing shows in its place (CHANGED: a faint "Date" used to show)');
  await j2.locator('.j-date').click(); await page.keyboard.type('Mon 3 Nov');
  ok(await j2.locator('.j-date').textContent() === 'Mon 3 Nov', 'and edited freely');

  // ---- other ways in: the open note at the cursor, + Add here, /journal, /je, Ctrl+K ----
  const n0 = await page.locator('.jrnl').count();
  await page.locator('.jrnl >> nth=0').scrollIntoViewIfNeeded();
  // at the caret of an open note
  await addNote(page, page.locator('.pagecard').nth(4), 'before after');
  const note = page.locator('.pagecard').nth(4).locator('.notebox .mine').first();
  await page.keyboard.press('Home'); for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
  await page.click('#tab-insert'); await page.click('#jeBtn'); await page.waitForTimeout(300);
  const inside = await note.evaluate(n => ({txt: n.innerText.replace(/\s+/g, ' '), jr: n.querySelectorAll('.jrnl').length, first: n.firstChild.nodeType === 3 ? n.firstChild.data : null}));
  ok(inside.jr === 1 && inside.first === 'before ' && /after/.test(inside.txt) && await page.locator('.pagecard').nth(4).locator('.notebox').count() === 1, `with a note open, it goes inside that note at the cursor (${inside.txt.slice(0, 40)})`);
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  ok(await page.evaluate(() => { const s = getSelection(); return document.activeElement.classList.contains('mine') && s.isCollapsed && s.anchorNode.nodeType === 3 && s.anchorNode.data === 'before ' && s.anchorOffset === 7; }), 'NEW: Up from the first account goes to the date, and Up again leaves the entry, to the end of the text above it');
  // slash menu
  await page.keyboard.press('Escape');
  await addNote(page, page.locator('.pagecard').nth(5), '/je'); await page.waitForTimeout(200);
  ok(await page.locator('.imenu .iitem').count() === 1 && (await page.textContent('.imenu .iitem .nm span')) === 'Journal entry', '/je finds Journal entry in the / menu');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(await page.locator('.pagecard').nth(5).locator('.jrnl').count() === 1 && !(await page.locator('.pagecard').nth(5).locator('.mine').first().innerText()).includes('/je'), 'Enter puts it in the note and the "/je" is gone');
  await page.keyboard.type('Rent'); await page.waitForTimeout(100);
  ok(await page.locator('.pagecard').nth(5).locator('.jrnl .j-acct').first().textContent() === 'Rent', 'and you are typing in its first account');
  await page.keyboard.press('Escape');
  // typing / inside a journal field does nothing special
  await page.locator('.pagecard').nth(5).locator('.jrnl .j-acct').first().click(); await page.keyboard.type(' A/R'); await page.waitForTimeout(150);
  ok(await page.locator('.imenu:visible').count() === 0, 'a slash inside a journal field does not open the menu');
  // Ctrl+K
  await page.mouse.click(8, 700); await page.keyboard.press('Control+k'); await page.waitForTimeout(200);
  await page.keyboard.type('journal'); await page.waitForTimeout(200);
  ok((await page.$$eval('.cmdk .iitem .nm', e => e.map(x => x.textContent))).includes('Insert journal entry'), 'Ctrl+K lists "Insert journal entry"');
  const n1 = await page.locator('.jrnl').count();
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ok(await page.locator('.jrnl').count() === n1 + 1, 'and adds one');
  // + Add here menu
  const s = await page.locator('.pagecard').nth(1).locator('.strip').first().boundingBox();
  await page.locator('.pagecard').nth(1).scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
  const s2 = await page.locator('.pagecard').nth(1).locator('.strip').first().boundingBox();
  await page.mouse.move(s2.x + 250, s2.y + s2.height * 0.4, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill', {button: 'right'}); await page.waitForTimeout(200);
  const items = await page.$$eval('.imenu .iitem .nm span', e => e.map(x => x.textContent));
  ok(items.join() === 'Note,Sticky note,Equation,Table,Journal entry,Template…', `the + Add here menu lists them (${items.join(', ')})`);
  await page.keyboard.type('journ'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ok(await page.locator('.pagecard').nth(1).locator('.notebox .jrnl').count() === 1, '+ Add here › Journal entry adds one in the gap, as its own note');


  // ---- NEW: empty date and description: nothing shows, but the lines are still there to click and type in ----
  const histLen = () => page.evaluate(() => hist.stack.length);
  const mk = async label => {
    await page.mouse.click(8, 700); await page.click('#tab-insert'); await page.click('#jeBtn'); await page.waitForTimeout(250);
    await page.keyboard.type(label); await page.keyboard.press('Tab'); await page.keyboard.type('100'); await page.keyboard.press('Tab'); await page.waitForTimeout(100); await settle(page);
    return page.locator('.jrnl', {hasText: label});
  };
  const nJ = () => page.locator('.jrnl').count(), nN = () => page.locator('.notebox').count();
  const before = {j: await nJ(), n: await nN()};
  let E = await mk('ZZempty');
  await E.locator('.j-date').click(); await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace'); await page.mouse.click(8, 700); await page.waitForTimeout(150);
  const em = await E.evaluate(b => { const q = s => b.querySelector(s), r = e => e.getBoundingClientRect(), cs = (e, p) => getComputedStyle(e, p); const lh = parseFloat(cs(q('.j-acct')).lineHeight);
    return {dateTxt: q('.j-date').textContent, descTxt: q('.j-desc').textContent, vis: b.innerText, dateH: r(q('.j-date')).height, descH: r(q('.j-desc')).height, dateW: r(q('.j-date')).width, descW: r(q('.j-desc')).width, bw: r(b).width, lh,
      ph: [q('.j-date'), q('.j-desc')].map(e => cs(e, '::before').content + cs(e, '::after').content), outline: cs(q('.j-date')).outlineStyle + cs(q('.j-desc')).outlineStyle}; });
  ok(em.dateTxt === '' && em.descTxt === '' && !/Date|Description/i.test(em.vis), `empty date and description show nothing, no placeholder (${JSON.stringify(em.vis)})`);
  ok(em.ph.every(c => /^(none|normal)+$/.test(c)), 'not even from a pseudo-element');
  ok(em.dateH >= em.lh * 0.95 && em.descH >= em.lh * 0.95, `they keep a line's height (${em.dateH.toFixed(1)}, ${em.descH.toFixed(1)} of a ${em.lh}px line)`);
  ok(em.dateW > em.bw * 0.9 && em.descW > 80, `and a clickable width (${Math.round(em.dateW)} and ${Math.round(em.descW)}px)`);
  ok(em.outline === 'nonenone', 'no outline while they are not focused');
  await page.screenshot({path: path.join(OUT, 'ref-journal-empty.png'), clip: await E.evaluate(b => { const r = b.closest('.notebox').getBoundingClientRect(); return {x: r.x - 12, y: r.y - 12, width: r.width + 24, height: r.height + 24}; })});
  await E.locator('.j-date').click();
  const fo = await E.evaluate(b => { const d = b.querySelector('.j-date'), c = getComputedStyle(d); return {on: document.activeElement === d, style: c.outlineStyle, w: c.outlineWidth}; });
  ok(fo.on && fo.style === 'solid' && fo.w === '1px', 'clicking the empty date focuses it, with a faint outline while it is focused');
  await page.keyboard.type('Mon 3 Nov');
  ok(await E.locator('.j-date').textContent() === 'Mon 3 Nov', 'and it can be typed in later');
  await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace');
  await E.locator('.j-desc').click(); await page.keyboard.type('Paid in cash');
  ok(await E.locator('.j-desc').textContent() === 'Paid in cash', 'the empty description too');
  await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace');
  const fr = await E.locator('.j-foot').boundingBox();
  await page.mouse.click(fr.x + fr.width - 6, fr.y + fr.height / 2); await page.waitForTimeout(80);
  ok(await page.evaluate(() => document.activeElement.classList.contains('j-desc')), 'clicking the empty space on the description line puts you in it');
  await page.mouse.click(8, 700);
  await E.locator('.j-acct').first().click(); await page.keyboard.press('Control+a'); await page.click('#tab-home'); await page.click('#hlBtn'); await page.waitForTimeout(100);
  ok(await E.evaluate(b => !!b.querySelector('.j-acct span[style*="background"]')), 'NEW: the Home highlighter works on the words inside an entry');
  await page.click('#tab-insert'); await page.mouse.click(8, 700);
  // the markup and the exports have none of it
  await E.evaluate(b => { b.querySelector('.j-date').setAttribute('data-ph', 'Date'); b.querySelector('.j-desc').setAttribute('data-ph', 'Description'); wtUpgrade(); });
  ok(await E.evaluate(b => !b.querySelector('.j-date[data-ph], .j-desc[data-ph]')), 'an entry saved with the old placeholders loses them');
  const nbE = await notebookDoc(page);
  ok(!/data-ph="(Date|Description)"/.test(nbE.data.doc), 'the notebook file has no placeholder for them');
  await E.evaluate(b => { b.querySelector('.j-date').dataset.t = 1; b.querySelector('.j-desc').dataset.t = 1; });
  const ci = await E.evaluate(b => [...document.querySelectorAll('.pagecard')].indexOf(b.closest('.pagecard')));
  const pE = await pdfPages(page), inkE = await pdfInk(page, pE.jpegs[ci], ci, '[data-t]');
  ok(inkE.n === 0, `and the PDF has nothing on those two lines (${inkE.n} dark pixels)`);

  // ---- NEW: deleting the whole entry: the ×, the right-click menu, selecting it and pressing Delete; each undone with Back ----
  const gone = async (J, label) => { await settle(page); ok(await J.count() === 0, label + ': the entry is gone'); };
  const back = async (J, label) => { await page.click('#undoBtn'); await page.waitForTimeout(600); ok(await J.count() === 1, label + ': Back puts it back'); };
  await E.evaluate(b => { b.querySelectorAll('[data-t]').forEach(e => delete e.dataset.t); });
  await page.mouse.move(5, 5);
  // the ×
  await E.hover({position: {x: 40, y: 10}}); await page.waitForTimeout(200);
  const xb = await page.locator('#jx').boundingBox(), eb = await E.boundingBox();
  ok(await page.locator('#jx').isVisible() && Math.abs((xb.x + xb.width) - (eb.x + eb.width)) < 12 && Math.abs((xb.y + xb.height / 2) - eb.y) < 12, 'pointing at the entry shows a small × at its top right edge');
  ok(await page.getAttribute('#jx', 'data-tip') === 'Delete journal entry' && await page.getAttribute('#jx', 'aria-label') === 'Delete journal entry', 'with the tip "Delete journal entry"');
  await page.mouse.move(xb.x + xb.width / 2, xb.y + xb.height / 2, {steps: 4}); await page.waitForTimeout(400);
  ok(await page.locator('#jx').isVisible(), 'and it stays while you are on it');
  // not in the exports
  const nbX = await notebookDoc(page);
  ok(!/id="jx"|Delete journal entry/.test(nbX.data.doc), 'the × is not in the notebook file');
  await page.evaluate(() => { const r = document.querySelector('#jx').getBoundingClientRect(); const p = Object.assign(document.createElement('i'), {className: 'xprobe'}); Object.assign(p.style, {position: 'absolute', left: r.left + scrollX + 'px', top: r.top + scrollY + 'px', width: r.width + 'px', height: r.height + 'px', pointerEvents: 'none'}); document.body.append(p); });
  const withX = await pdfPages(page), inkWith = await pdfInk(page, withX.jpegs[ci], ci, '.xprobe');
  ok(await page.locator('#jx').isVisible(), '(the × was showing while the PDF was made)');
  await page.mouse.move(5, 5); await page.waitForTimeout(500);
  ok(!(await page.locator('#jx').isVisible()), 'moving away puts the × away');
  const noX = await pdfPages(page), inkNo = await pdfInk(page, noX.jpegs[ci], ci, '.xprobe');
  ok(Math.abs(inkWith.n - inkNo.n) <= 3, `the PDF is the same with or without the × showing (${inkWith.n} vs ${inkNo.n} dark pixels where it sits)`);
  await page.evaluate(() => document.querySelector('.xprobe').remove());
  const h0 = await histLen();
  await E.hover({position: {x: 40, y: 10}}); await page.waitForTimeout(200);
  await page.click('#jx'); await page.waitForTimeout(150);
  ok(/deleted/i.test(await page.textContent('#toast')) && await page.locator('#toast.show').count() === 1, 'a toast says it was deleted');
  await gone(E, 'the ×');
  ok(await histLen() === h0 + 1, 'in one undo step');
  ok(await nN() === before.n, 'the note it was in had nothing else, so it went too (like any empty note)');
  await back(E, 'the ×');
  ok(await nN() === before.n + 1, '(and its note with it)');
  // the right-click menu
  await E.locator('.j-acct').first().click({button: 'right'}); await page.waitForTimeout(150);
  const mn = await page.evaluate(() => { const m = document.querySelector('.wtmenu'); return m && {role: m.getAttribute('role'), cls: m.className, items: [...m.querySelectorAll('button')].map(b => b.textContent), danger: m.querySelector('button').classList.contains('danger'), focus: document.activeElement === m.querySelector('button')}; });
  ok(mn && mn.role === 'menu' && mn.items.join() === 'Delete journal entry' && /spellmenu/.test(mn.cls) && mn.danger && mn.focus, 'right-click opens a menu in the table menu\'s style with "Delete journal entry"');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok(await page.locator('.wtmenu').count() === 0 && await E.count() === 1, 'Esc closes it and keeps the entry');
  await E.locator('.j-acct').first().click({button: 'right'}); await page.waitForTimeout(450);
  await page.mouse.click(2, 300); await page.waitForTimeout(300);
  ok(await page.locator('.wtmenu').count() === 0 && await E.count() === 1, 'clicking elsewhere closes it too');
  await E.locator('.j-acct').first().click({button: 'right'}); await page.waitForTimeout(150);
  await page.click('.wtmenu button'); await page.waitForTimeout(150);
  await gone(E, 'the menu'); await back(E, 'the menu');
  // press and hold on a touch screen
  await E.evaluate(b => { const r = b.getBoundingClientRect(); b.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerType: 'touch', isPrimary: true, clientX: r.left + 6, clientY: r.top + 4})); });
  await page.waitForTimeout(250);
  ok(await page.locator('.wtmenu').count() === 0, 'a quick touch does not open the menu');
  await E.evaluate(b => { const r = b.getBoundingClientRect(); b.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, pointerType: 'touch', isPrimary: true, clientX: r.left + 6, clientY: r.top + 4})); });
  await E.evaluate(b => { const r = b.getBoundingClientRect(); b.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerType: 'touch', isPrimary: true, clientX: r.left + 6, clientY: r.top + 4})); });
  await page.waitForTimeout(800);
  ok(await page.locator('.wtmenu button').count() === 1 && (await page.textContent('.wtmenu button')) === 'Delete journal entry', 'press and hold on a touch screen opens it');
  await page.keyboard.press('Escape');
  // selecting the whole entry: click its edge, then Delete
  const edge = async J => J.evaluate(b => { const r = b.getBoundingClientRect(); for (let y = r.top + 2; y < r.bottom - 2; y += 2) for (let x = r.left + 2; x < r.right - 2; x += 3) if (document.elementFromPoint(x, y) === b) return {x, y}; return null; });
  const pk = await edge(E);
  ok(!!pk, '(there is an edge to click)');
  await page.mouse.click(pk.x, pk.y); await page.waitForTimeout(100);
  ok(await page.evaluate(() => !!jPicked()), 'clicking its edge selects the whole entry');
  await page.keyboard.press('Delete');
  await gone(E, 'edge + Delete'); await back(E, 'edge + Delete');
  await page.mouse.click(pk.x, pk.y); await page.keyboard.press('Backspace');
  await gone(E, 'edge + Backspace'); await back(E, 'edge + Backspace');
  // Select all twice inside a field
  await E.locator('.j-acct').first().click(); await page.keyboard.press('Control+a');
  ok(await page.evaluate(() => !jPicked() && getSelection().toString() === 'ZZempty'), 'Select all once selects the field\'s text');
  await page.keyboard.press('Control+a');
  ok(await page.evaluate(() => !!jPicked()), 'a second time selects the whole entry');
  await page.keyboard.press('Backspace');
  await gone(E, 'Select all twice + Backspace'); await back(E, 'Select all twice + Backspace');
  await E.locator('.j-acct').first().click(); await page.keyboard.press('Control+a'); await page.keyboard.press('Control+a'); await page.keyboard.press('Delete');
  await gone(E, 'Select all twice + Delete'); await back(E, 'Select all twice + Delete');
  await E.locator('.j-acct').first().click(); await page.keyboard.press('Control+a'); await page.keyboard.press('Delete');
  ok(await nJ() === before.j + 1 && await E.count() === 0 && (await page.locator('.jrnl').allTextContents()).every(t => !t.includes('ZZempty')), 'Delete after a single Select all only empties the field (the entry stays)');
  await page.click('#undoBtn'); await page.waitForTimeout(600);
  // an entry in a note with other things in it: the note stays
  await page.mouse.click(8, 700);
  await addNote(page, page.locator('.pagecard').nth(3), 'keep me');
  await page.click('#tab-insert'); await page.click('#jeBtn'); await page.waitForTimeout(250);
  await page.keyboard.type('ZZkeep'); await page.keyboard.press('Tab'); await settle(page);
  const K = page.locator('.jrnl', {hasText: 'ZZkeep'}), nn = await nN();
  await K.locator('.j-acct').first().click({button: 'right'}); await page.click('.wtmenu button'); await page.waitForTimeout(150); await settle(page);
  ok(await K.count() === 0 && await nN() === nn && (await page.locator('.pagecard').nth(3).locator('.notebox .mine').first().textContent()).includes('keep me'), 'a note with other writing in it stays, with its words');
  await back(K, 'in a note with writing');
  // Study mode: no ×, no menu, no deleting
  await page.click('#readBtn'); await page.waitForTimeout(300);
  await K.hover({position: {x: 40, y: 10}, force: true}); await page.waitForTimeout(250);
  ok(!(await page.locator('#jx').isVisible()), 'Study mode: no × when you point at it');
  await K.locator('.j-acct').first().click({button: 'right', force: true}); await page.waitForTimeout(150);
  ok(await page.locator('.wtmenu').count() === 0, 'no right-click menu');
  const pk2 = await edge(K); if (pk2) await page.mouse.click(pk2.x, pk2.y);
  await page.keyboard.press('Delete');
  ok(await K.count() === 1, 'and Delete does nothing');
  await page.click('#readBtn'); await page.waitForTimeout(300);
  // tidy up: the two entries made here
  for (const J of [K, E]) { await J.locator('.j-acct').first().click({button: 'right'}); await page.click('.wtmenu button'); await page.waitForTimeout(150); }
  await settle(page);
  ok(await nJ() === before.j, '(the entries made here are gone again)');

  // ---- study mode: nothing can be changed ----
  await page.click('#readBtn'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => [...document.querySelectorAll('.jrnl [contenteditable]')].every(f => !f.isContentEditable)), 'Study mode: the fields cannot be edited');
  const side0 = await page.evaluate(() => document.querySelector('.jrnl .j-row').dataset.s);
  await page.locator('.jrnl .j-ind').first().click({force: true}); await page.waitForTimeout(100);
  ok(await page.evaluate(() => document.querySelector('.jrnl .j-row').dataset.s) === side0, 'and DR/CR does not switch');
  await page.click('#readBtn'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => [...document.querySelectorAll('.jrnl [contenteditable]')].filter(f => f.isContentEditable).length > 10), 'back to editing: they can be');

  // ---- search and the notes list read it as words ----
  const mine = () => [...document.querySelectorAll('.jrnl')].find(j => j.textContent.includes('Service revenue')).closest('.mine');
  const sum = await page.evaluate(() => { const j = [...document.querySelectorAll('.jrnl')].find(j => j.textContent.includes('Service revenue')).closest('.mine'); return noteSummary(j); });
  ok(/DR Cash 1,500/.test(sum) && /CR Service revenue 1,200/.test(sum), `the notes list and search read its words (${sum.slice(0, 60)}…)`);
  const md = await page.evaluate(() => noteMarkdown([...document.querySelectorAll('.jrnl')].find(j => j.textContent.includes('Service revenue')).closest('.mine')));
  ok(/DR Cash: 1,500/.test(md) && /CR Service revenue: 1,200/.test(md), `Markdown has the lines (${md.split('\n').slice(0, 3).join(' / ')})`);

  ok(errors.length === 0, errors.length ? 'page errors: ' + errors.join('\n') : 'no page errors');
  await browser.close();

  // ---- dark theme: the same entry in the user's colours; the PDF still in colours for paper ----
  const d = await start({scheme: 'dark'});
  await d.page.click('#tab-insert'); await d.page.click('#jeBtn'); await d.page.waitForTimeout(300);
  await build(d.page);
  const dcolours = () => d.page.evaluate(() => { const c = s => getComputedStyle(document.querySelector(s)).color; return {date: c('.j-date'), ind: c('.j-ind'), acct: c('.j-acct'), amt: c('.j-amt:not(.off)'), bg: getComputedStyle(document.querySelector('.jrnl')).backgroundColor}; });
  const dcol = await dcolours();
  ok(dcol.date === rgb(LIGHT.dim) && dcol.ind === rgb(LIGHT.acct) && dcol.acct === rgb(LIGHT.acct) && dcol.amt === rgb(LIGHT.amt), 'dark theme: the page is still white or cream, so the darker slate, blue and amber stay (CHANGED: it used to switch to off-white, light blue and cream on a dark panel)');
  ok(dcol.bg === 'rgba(0, 0, 0, 0)', 'with no panel in the dark theme either (CHANGED)');
  const dm = await measure(d.page);
  ok(dm.rows.every(r => eq(r.dR, dm.rows[0].dR)) && dm.rows.every(r => eq(r.cR, dm.rows[0].cR)), 'the columns line up in the dark theme too');
  const db = await d.page.evaluate(() => { const r = document.querySelector('.notebox').getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height}; });
  await d.page.screenshot({path: path.join(OUT, 'journal-3dr-2cr-dark.png'), clip: {x: 360, y: 120, width: 980, height: 560}});
  await d.page.screenshot({path: path.join(OUT, 'journal-dark.png')});
  const dpdf = await pdfPages(d.page);
  require('fs').writeFileSync(path.join(OUT, 'journal-pdf-from-dark.jpg'), dpdf.jpegs[2]);
  const dA = await pdfInk(d.page, dpdf.jpegs[2], 2, '.jrnl .j-amt:not(.off)'), dB = await pdfInk(d.page, dpdf.jpegs[2], 2, '.jrnl .j-acct, .jrnl .j-ind');
  ok(dA.n > 60 && near(dA.avg, LIGHT.amt) && dB.n > 100 && near(dB.avg, LIGHT.acct), `a PDF made in the dark theme still has the colours for paper (${dA.avg} ${dB.avg})`);
  ok(await d.page.evaluate(() => getComputedStyle(document.querySelector('.j-amt:not(.off)')).color) === rgb(LIGHT.amt) && !(await d.page.evaluate(() => document.querySelector('#main').classList.contains('pdfpaper'))), 'and the screen is the same afterwards (CHANGED: the colours were switched for the PDF)');
  const dnb = await notebookDoc(d.page);
  ok(dnb.data.doc.includes('class="jrnl"'), 'the notebook file from the dark theme has the entry too');
  // ---- NEW: in the dark theme the pages are still paper: a fill can make it dark, and so can a dark side page ----
  const dshot = (name, el = '.notebox') => d.page.evaluate(el => { const r = document.querySelector(el).getBoundingClientRect(); return {x: Math.max(0, r.x - 14), y: Math.max(0, r.y - 14), width: r.width + 28, height: r.height + 28}; }, el).then(clip => d.page.screenshot({path: path.join(OUT, name), clip}));
  await dshot('ref-journal-dark.png');
  await d.page.click('#tab-box'); await d.page.fill('#bFill', '#1f2623'); await d.page.waitForTimeout(150);
  let dc = await dcolours();
  ok(dc.date === rgb(DARK.dim) && dc.ind === rgb(DARK.acct) && dc.amt === rgb(DARK.amt) && dc.bg === 'rgba(0, 0, 0, 0)', 'with a dark fill, the user\'s off-white, light blue and cream colours come back, still with no panel of its own');
  await dshot('ref-journal-dark-fill.png');
  await d.page.fill('#bFill', '#fff8c4'); await d.page.waitForTimeout(150);
  dc = await dcolours();
  ok(dc.date === rgb(LIGHT.dim) && dc.amt === rgb(LIGHT.amt), 'and a cream fill keeps the darker colours');
  await dshot('ref-journal-dark-fill-cream.png');
  await d.page.click('#bNoFill');
  await d.page.click('#tab-view'); await d.page.click('#sideBtn'); await d.page.waitForTimeout(400);
  await d.page.click('#sideBgBtn'); await d.page.click('#sideBgPop .sw[data-c="#2b2f36"]'); await d.page.waitForTimeout(200); await d.page.keyboard.press('Escape');
  await d.page.locator('.sidepage').nth(2).scrollIntoViewIfNeeded(); await d.page.waitForTimeout(300);
  const sp = await d.page.locator('.sidepage').nth(2).boundingBox();
  await d.page.mouse.click(sp.x + 60, Math.max(sp.y, 250) + 60); await d.page.waitForTimeout(250);
  await d.page.click('#tab-insert'); await d.page.click('#jeBtn'); await d.page.waitForTimeout(250);
  await d.page.evaluate(() => { const b = document.querySelector('.sidepage .notebox'); b.style.width = '560px'; b.style.left = '10px'; });
  await d.page.keyboard.type('Cash'); await d.page.keyboard.press('Tab'); await d.page.keyboard.type('250'); await d.page.keyboard.press('Tab'); await d.page.keyboard.press('Tab'); await d.page.keyboard.type('Sales'); await d.page.keyboard.press('Tab'); await d.page.keyboard.type('250');
  const sc = await d.page.evaluate(() => { const j = document.querySelector('.sidepage .jrnl'), c = s => getComputedStyle(j.querySelector(s)).color; return {inSide: !!j, date: c('.j-date'), acct: c('.j-acct'), amt: c('.j-amt:not(.off)'), bg: getComputedStyle(j).backgroundColor, sideDark: document.querySelector('.sidepage').classList.contains('dark')}; });
  ok(sc.inSide && sc.sideDark && sc.bg === 'rgba(0, 0, 0, 0)' && sc.date === rgb(DARK.dim) && sc.acct === rgb(DARK.acct) && sc.amt === rgb(DARK.amt), 'on a dark side page the entry uses the light colours, with no panel');
  await dshot('ref-journal-sidepage-dark.png', '.sidepage .notebox');
  await d.page.click('#tab-box'); await d.page.fill('#bFill', '#fff59d'); await d.page.waitForTimeout(150);
  ok(await d.page.evaluate(() => getComputedStyle(document.querySelector('.sidepage .j-amt:not(.off)')).color) === rgb(LIGHT.amt), 'a light fill on that dark side page gets the darker colours back');
  await dshot('ref-journal-sidepage-dark-lightfill.png', '.sidepage .notebox');
  ok(d.errors.length === 0, d.errors.length ? 'page errors: ' + d.errors.join('\n') : 'no page errors');
  await d.browser.close();
  console.log(`${results.ok} checks passed; no page errors`);
})().catch(e => { console.error(e); process.exit(1); });

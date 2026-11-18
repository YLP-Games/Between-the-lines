// Exam Desk: a marked answer posted from Exam Desk is filed in a course folder, one notebook per paper and one page per required,
// in the paper's order; a re-marked answer replaces its page; other sites are ignored
const {open} = require('./harness');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
let n = 0;
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); n++; console.log('ok  ' + m); };

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(800);
  const post = (m, origin = 'https://tax2-examiner.vercel.app') => page.evaluate(([m, origin]) => dispatchEvent(new MessageEvent('message', {data: {type: 'exam-desk-answer', ...m}, origin})), [m, origin]);
  const base = {course: 'Banking', paper: '2025 Exam', paperId: 'b-exam2025', question: 'Calculate the cost of funding.', marks: 5, at: Date.now()};
  const stored = () => page.evaluate(async () => ({folders: await get('folders') || [], docs: await get('docs') || []}));
  const pagesOf = name => page.evaluate(async name => { const d = (await get('docs')).find(x => x.name === name); const box = document.createElement('div'); box.innerHTML = d.id === curId ? main.innerHTML : await get('doc:' + d.id) || ''; return [...box.querySelectorAll('.slide[data-ed]')].map(s => s.dataset.ed + ':' + s.textContent.replace(/\s+/g, ' ').trim()); }, name);

  await post({...base, part: 'C4.4', order: 2, answer: 'LCR falls.', score: 3, feedback: ['Link it to HQLA.']});
  await page.waitForTimeout(400);
  await post({...base, part: 'C4.3', order: 1, answer: 'X = 7.25%/12 × 5/30\n<b>R245 349</b>', score: 4, feedback: ['State the day count.']});
  await page.waitForTimeout(400);
  let s = await stored();
  const f = s.folders.find(x => x.name === 'Banking');
  ok(f, 'a Banking folder is made');
  const nb = s.docs.find(x => x.name === '2025 Exam');
  ok(nb && nb.folder === f.id && nb.named, 'a "2025 Exam" notebook is made in it');
  let p = await pagesOf('2025 Exam');
  ok(p.length === 2 && p[0].startsWith('C4.3:') && p[1].startsWith('C4.4:'), 'one page per required, in the paper\'s order: ' + p.map(x => x.split(':')[0]));
  ok(p[0].includes('4 / 5') && p[0].includes('My answer') && p[0].includes('<b>R245 349</b>') && p[0].includes('State the day count'), 'the page has the mark, the answer (as text, not HTML) and the feedback');
  ok(await page.locator('#docList li.fld .nm', {hasText: 'Banking'}).count() === 1, 'the folder shows in the sidebar');

  await post({...base, part: 'C4.3', order: 1, answer: 'Second try', score: 5, feedback: []});
  await page.waitForTimeout(400);
  p = await pagesOf('2025 Exam');
  ok(p.length === 2 && p[0].includes('Second try') && p[0].includes('5 / 5') && !p[0].includes('R245'), 're-marking replaces the page, not adds one');

  await post({...base, paper: '2023 Exam', paperId: 'b-exam2023', part: 'C3.5', order: 1, answer: 'R97.5m', score: 5});
  await page.waitForTimeout(400);
  s = await stored();
  ok(s.docs.filter(x => x.folder === f.id).length === 2 && s.folders.filter(x => x.name === 'Banking').length === 1, 'another paper gets its own notebook in the same folder');

  await post({...base, course: 'Tax II', paper: 'Exam 2024', paperId: 't-2024', part: '1', order: 1, answer: 'x', score: 1}, 'https://evil.example.com');
  await page.waitForTimeout(400);
  s = await stored();
  ok(!s.folders.some(x => x.name === 'Tax II'), 'a message from another site is ignored');

  // the notebook that is open gets its page live
  await page.evaluate(async () => { const d = (await get('docs')).find(x => x.name === '2023 Exam'); await switchDoc(d.id); });
  await page.waitForTimeout(300);
  await post({...base, paper: '2023 Exam', paperId: 'b-exam2023', part: 'C3.6', order: 2, answer: 'R58 907.50', score: 2});
  await page.waitForTimeout(1200);
  ok(await page.locator('#main .slide[data-ed="C3.6"]').count() === 1, 'the open notebook shows the new page at once');
  p = await pagesOf('2023 Exam');
  ok(p.length === 2 && p[1].includes('R58 907.50'), 'and it is saved');
  await page.screenshot({path: require('path').join(__dirname, 'shots', 'examdesk.png')});

  // opened by Exam Desk (window.opener set): the app still starts, and says it is ready
  const ctx = page.context(), [pop] = await Promise.all([ctx.waitForEvent('page'), page.evaluate(() => { window.__ready = 0; addEventListener('message', e => { if (e.data?.type === 'btl-ready') window.__ready++; }); window.open(location.href, '_blank'); })]);
  const perr = []; pop.on('pageerror', e => perr.push(e.message));
  await pop.waitForLoadState(); await page.waitForFunction(() => window.__ready > 0, null, {timeout: 15000});
  ok(!perr.length && await pop.evaluate(() => !!document.querySelector('#main') && typeof wgSet === 'function'), 'a tab opened by another page starts up fully and posts btl-ready');
  await pop.close();
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(n + ' checks passed');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

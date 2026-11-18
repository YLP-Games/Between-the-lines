// axe-core on the main views, in light and dark: no critical or serious problems
const {open} = require('./harness'); const path = require('path');
const AxeBuilder = require('@axe-core/playwright').default;
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
// known problems, left for now: rule id -> why
const KNOWN = {};
(async () => {
  for (const scheme of ['light', 'dark']) {
    const {browser, page, errors} = await open(APP, {colorScheme: scheme}); await page.waitForTimeout(700);
    const bad = [];
    const scan = async name => {
      const r = await new AxeBuilder({page}).analyze();
      const v = r.violations.filter(x => ['critical', 'serious'].includes(x.impact) && !KNOWN[x.id]);
      v.forEach(x => bad.push(`${scheme} ${name}: ${x.id} (${x.impact}) ${x.nodes.length} nodes, e.g. ${x.nodes[0].target.join(' ')}`));
      console.log(`ok  ${scheme}: ${name}: ${v.length ? v.length + ' problems' : 'clean'}`);
    };
    await scan('start screen');
    await page.click('#helpBtn'); await page.waitForTimeout(400); await scan('Help and settings (start)'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
    await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(900);
    await scan('notebook');
    await page.click('#helpBtn'); await page.waitForTimeout(400); await scan('Help and settings'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    for (const t of ['home', 'insert', 'box', 'review', 'view']) { await page.click('#tab-' + t); await page.waitForTimeout(250); await scan(t + ' tab'); }
    await page.click('#tab-insert'); await page.click('#drawBtn'); await page.waitForTimeout(300); await scan('drawing toolbar');
    await browser.close();
    ok(!bad.length, `${scheme}: no critical or serious problems` + (bad.length ? '\n  ' + bad.join('\n  ') : ''));
    ok(!errors.length, `${scheme}: no page errors ${errors.join(';')}`);
  }
  console.log('no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

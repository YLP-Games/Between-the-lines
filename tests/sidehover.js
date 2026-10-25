// Open sidebar on hover: off unless switched on (the hidden sidebar opens only with its button or Ctrl+\); on, pointing at the left edge peeks it in.
// Switched in Help & settings, View › Show and Ctrl+K, and remembered.
const {open} = require('./harness'); const path = require('path');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(800);
  const peeking = () => page.evaluate(() => document.getElementById('pagesPanel').classList.contains('peeking'));
  const shown = () => page.isVisible('#pagesPanel');
  const hide = async () => { if (await shown()) { await page.keyboard.press('Control+Backslash'); await page.waitForTimeout(300); } };
  // point at the left edge, then away
  const toEdge = async () => { await page.mouse.move(500, 450); await page.mouse.move(3, 450, {steps: 5}); await page.waitForTimeout(400); };
  const away = async () => { await page.mouse.move(900, 450, {steps: 5}); await page.waitForTimeout(400); };
  const state = () => page.evaluate(() => ({pref: localStorage.getItem('side-hover'), box: document.getElementById('setSideHover').checked, btn: document.getElementById('sideHoverBtn').getAttribute('aria-pressed'), zone: !document.getElementById('peekZone').hidden}));
  const cmdk = async () => { await page.keyboard.press('Control+k'); await page.waitForTimeout(200); await page.fill('.cmdk input', 'open sidebar on hover'); await page.waitForTimeout(250); await page.keyboard.press('Enter'); await page.waitForTimeout(300); };

  // ---- off to begin with ----
  let s = await state();
  ok(s.pref === null && !s.box && s.btn === 'false', 'off to begin with: the setting is unticked and the View button is not pressed');
  await hide();
  ok(!(await shown()), 'the sidebar hides');
  ok(!(await state()).zone, 'off: there is no hot zone at the left edge');
  await toEdge();
  ok(!(await shown()) && !(await peeking()), 'off: pointing at the left edge does not open the hidden sidebar');
  await page.mouse.move(0, 300, {steps: 3}); await page.waitForTimeout(400);
  ok(!(await shown()), 'off: not even at the very edge');
  ok(!(await page.getAttribute('#sideHide', 'title')).includes('left edge'), 'off: the « tip does not mention the left edge');
  await page.keyboard.press('Control+Backslash'); await page.waitForTimeout(300);
  ok(await shown() && !(await peeking()), 'off: Ctrl+\\ still opens it');
  await hide(); await away();

  // ---- on, from the View tab ----
  await page.click('#tab-view'); await page.click('#sideHoverBtn'); await page.waitForTimeout(300);
  s = await state();
  ok(s.pref === '1' && s.box && s.btn === 'true' && s.zone, 'the View tab turns it on (remembered, ticked in settings, button pressed)');
  ok((await page.textContent('#toast')).includes('left edge'), 'and a message says what it does');
  await toEdge();
  ok(await shown() && await peeking(), 'on: pointing at the left edge peeks the sidebar in');
  ok(await page.getAttribute('#sideHide', 'aria-label') === 'Keep the sidebar open', 'the peeking sidebar offers to stay open');
  await away();
  ok(!(await shown()) && !(await peeking()), 'on: moving away hides it again');

  // a finger at the edge is a tap, not pointing
  await page.evaluate(() => document.getElementById('peekZone').dispatchEvent(new PointerEvent('pointerenter', {pointerType: 'touch'})));
  await page.waitForTimeout(200);
  ok(!(await shown()), 'on: a touch at the edge does not peek');

  // Focus mode: no peeking
  await page.keyboard.press('Control+Shift+F'); await page.waitForTimeout(400);
  await toEdge();
  ok(!(await shown()) && !(await peeking()), 'on, in Focus mode: the left edge does not peek');
  await page.keyboard.press('Control+Shift+F'); await page.waitForTimeout(400); await away();

  // remembered after a reload
  await page.reload(); await page.waitForTimeout(800);
  await hide(); await away();
  s = await state();
  ok(s.pref === '1' && s.box && s.btn === 'true', 'on is remembered after a reload');
  await toEdge();
  ok(await peeking(), 'and the left edge still peeks after the reload');

  // turning it off while the sidebar peeks puts it away, and the edge stays quiet
  await page.click('#helpBtn'); await page.waitForTimeout(300);
  await page.click('#setSideHover'); await page.waitForTimeout(300);
  ok(!(await page.evaluate(() => document.getElementById('pagesPanel').classList.contains('peeking'))), 'unticking it in Help & settings ends the peek');
  s = await state();
  ok(s.pref === '0' && !s.box && s.btn === 'false' && !s.zone, 'and it is off everywhere');
  await page.click('#setClose'); await page.waitForTimeout(200);
  await away(); await toEdge();
  ok(!(await shown()), 'off again: the left edge does nothing');

  // Ctrl+K switches it too
  await away(); await cmdk();
  ok((await state()).pref === '1', 'Ctrl+K "Open sidebar on hover" turns it on');
  await toEdge(); ok(await peeking(), 'and the edge peeks');
  await away(); await cmdk();
  ok((await state()).pref === '0', 'and Ctrl+K turns it off again');
  await toEdge(); ok(!(await shown()), 'and the edge is quiet');

  // a narrow window (the sidebar is a drawer): never peeks, even when on
  await page.evaluate(() => setSideHover(true)); await away();
  await page.setViewportSize({width: 800, height: 900}); await page.waitForTimeout(500);
  await page.evaluate(() => setPanel('pages', false)); await page.waitForTimeout(300);
  await toEdge();
  ok(!(await shown()) && !(await peeking()), 'a narrow window: the drawer does not peek at the left edge');
  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

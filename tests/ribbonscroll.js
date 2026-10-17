// The toolbar scrolls sideways when it doesn't fit: the bar shows only on hover or while scrolling, and a fade marks the side with more
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  for (const scheme of ['light', 'dark']) {
    const {browser, page, errors} = await open(APP, {width: 1600, height: 900, colorScheme: scheme});
    await page.waitForTimeout(600);
    await page.click('#tab-view'); await page.waitForTimeout(400);
    const info = () => page.evaluate(() => { const p = document.getElementById('panel-view'), c = getComputedStyle(p); return {over: p.scrollWidth - p.clientWidth, left: p.scrollLeft, color: c.scrollbarColor, l: p.classList.contains('more-l'), r: p.classList.contains('more-r'), fl: +getComputedStyle(p, '::before').opacity, fr: +getComputedStyle(p, '::after').opacity, scrolling: p.classList.contains('scrolling')}; });
    const clear = c => /rgba\(0, 0, 0, 0\) rgba\(0, 0, 0, 0\)|transparent transparent/.test(c);
    await page.mouse.move(800, 500); await page.waitForTimeout(500);
    let i = await info();
    ok(i.over > 20, scheme + ': the View tab does not fit at 1600px (' + i.over + 'px over)');
    ok(clear(i.color), scheme + ': at rest the scroll bar is clear (' + i.color + ')');
    ok(i.r && !i.l && i.fr === 1 && i.fl === 0, scheme + ': a fade on the right only, where there is more');
    await page.screenshot({path: path.join(OUT, `fix-ribbon-rest-${scheme}.png`), clip: {x: 0, y: 0, width: 1600, height: 160}});
    await page.mouse.move(800, 100); await page.waitForTimeout(500);
    i = await info();
    ok(!clear(i.color), scheme + ': pointing at the ribbon shows it (' + i.color + ')');
    await page.screenshot({path: path.join(OUT, `fix-ribbon-hover-${scheme}.png`), clip: {x: 0, y: 0, width: 1600, height: 160}});
    await page.mouse.move(800, 500); await page.waitForTimeout(500);
    ok(clear((await info()).color), scheme + ': and it goes again when you move off');
    // trackpad / sideways wheel
    await page.mouse.move(800, 100); await page.mouse.wheel(200, 0); await page.waitForTimeout(250);
    i = await info();
    ok(i.left > 100 && i.scrolling && i.l, scheme + ': a sideways wheel scrolls it (' + Math.round(i.left) + 'px), shows it, and fades the left too');
    await page.mouse.move(800, 500); await page.waitForTimeout(1300);
    i = await info();
    ok(!i.scrolling && clear(i.color), scheme + ': it clears a moment after scrolling stops');
    await page.mouse.move(800, 100); await page.mouse.wheel(900, 0); await page.waitForTimeout(500);
    i = await info();
    ok(i.l && !i.r && i.fr === 0 && i.fl === 1, scheme + ': at the far end only the left fade is left (' + Math.round(i.left) + ')');
    await page.screenshot({path: path.join(OUT, `fix-ribbon-end-${scheme}.png`), clip: {x: 0, y: 0, width: 1600, height: 160}});
    // shift + wheel (a mouse)
    await page.keyboard.down('Shift'); await page.mouse.wheel(0, -300); await page.keyboard.up('Shift'); await page.waitForTimeout(300);
    ok((await info()).left < i.left, scheme + ': Shift + wheel scrolls it back');
    // a swipe by touch: the panel still takes horizontal pans
    ok(await page.evaluate(() => { const p = document.getElementById('panel-view'), c = getComputedStyle(p); return c.overflowX === 'auto' && (c.touchAction === 'auto' || /pan-x/.test(c.touchAction)); }), scheme + ': touch swipes are left to the browser (overflow auto, touch-action auto)');
    // a tab that fits has no fades
    await page.click('#tab-home'); await page.waitForTimeout(400);
    const h = await page.evaluate(() => { const p = document.getElementById('panel-home'); return {over: p.scrollWidth - p.clientWidth, l: p.classList.contains('more-l'), r: p.classList.contains('more-r')}; });
    ok(h.over > 0 ? h.r || h.l : !h.l && !h.r, scheme + ': the Home tab: fades only if it overflows (' + h.over + 'px)');
    // at a wider window the View tab fits, and the fade goes
    await page.setViewportSize({width: 2200, height: 900}); await page.waitForTimeout(500); await page.click('#tab-view'); await page.waitForTimeout(500);
    i = await info();
    ok(i.over <= 0 && !i.l && !i.r && i.fl === 0 && i.fr === 0, scheme + ': at 2200px it fits, so no fade');
    ok(errors.length === 0, scheme + ': no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await browser.close();
  }
  console.log('no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

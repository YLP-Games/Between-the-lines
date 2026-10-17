// An iPad-like Chromium: touch on, not mobile, iPad Safari user agent
const {open} = require('./harness');
const path = require('path');
const UA = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
async function openIpad(file, {width = 1024, height = 1366, pdf = true, storage} = {}){
  const r = await open(file, {width, height, storage, contextOptions: {hasTouch: true, isMobile: false, deviceScaleFactor: 2, userAgent: UA}});
  await r.page.waitForTimeout(500);
  if (pdf) {
    await r.page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
    await r.page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 3, null, {timeout: 60000});
    await r.page.waitForTimeout(800);
  }
  r.cdp = await r.context.newCDPSession(r.page);
  return r;
}
// a pen (Apple Pencil) event through the browser, as a real pen would send it: pressure is `force`
const pen = (cdp, type, x, y, o = {}) => cdp.send('Input.dispatchMouseEvent', {
  type, x, y, button: type === 'mouseMoved' && !o.down ? 'none' : 'left', buttons: type === 'mouseMoved' && !o.down ? 0 : (o.eraser ? 32 : 1),
  clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'pen', force: o.force ?? 0.5, tiltX: o.tiltX ?? 20, tiltY: o.tiltY ?? 10, ...(o.extra || {})});
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: pts.map((p, i) => ({x: p[0], y: p[1], id: p[2] ?? i, force: 0.5, radiusX: 8, radiusY: 8}))});
// CDP cannot send the pen's eraser button, so a PointerEvent with button 5 / buttons 32 is dispatched straight at the page
const synthPen = (page, pts, o = {}) => page.evaluate(async ([pts, o]) => {
  const el = document.elementFromPoint(pts[0][0], pts[0][1]), mk = (type, [x, y], down) => new PointerEvent(type, {bubbles: true, cancelable: true, composed: true, pointerType: 'pen', pointerId: 77, isPrimary: true,
    clientX: x, clientY: y, button: type === 'pointermove' && !down ? -1 : (o.eraser ? 5 : 0), buttons: type === 'pointerup' ? 0 : (o.eraser ? 32 : 1), pressure: type === 'pointerup' ? 0 : .5});
  el.dispatchEvent(mk('pointerdown', pts[0], true));
  for (const p of pts.slice(1)) { el.dispatchEvent(mk('pointermove', p, true)); await new Promise(r => setTimeout(r, 16)); }
  el.dispatchEvent(mk('pointerup', pts.at(-1)));
}, [pts, o]);
module.exports = {openIpad, pen, touch, synthPen, UA};

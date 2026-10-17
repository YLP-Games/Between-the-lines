// shared by layoutscale.js and the before/after screenshots: opens the lecture, adds the notes, measures them
const {open} = require('./harness');
const path = require('path');

async function setup(APP, {width = 1600, height = 900, pages = [1]} = {}){
  const o = await open(APP, {width, height});
  const {page} = o;
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);
  const card = i => page.locator('.pagecard').nth(i);
  const pointAt = async (pi, frac, x = 260) => {
    const strips = card(pi).locator('.strip'), n = await strips.count();
    const ys = await strips.evaluateAll(es => es.map(e => [+e.dataset.y0, +e.dataset.y1])), top = ys[0][0], ph = ys.at(-1)[1] - top;
    let k = 0, local = frac;
    for (let q = 0; q < n; q++) { const y = top + frac * ph; if (y >= ys[q][0] && y < ys[q][1]) { k = q; local = (y - ys[q][0]) / (ys[q][1] - ys[q][0]); break; } }
    const strip = strips.nth(k);
    await strip.evaluate(e => e.scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(300);
    const b = await strip.boundingBox();
    await page.mouse.move(b.x + Math.min(x, b.width * .4), b.y + b.height * local, {steps: 4}); await page.waitForTimeout(250);
  };
  const newNote = async (pi, frac, text) => {
    await pointAt(pi, frac);
    await page.click('.gappill'); await page.waitForTimeout(250);
    if (text) await page.keyboard.type(text);
    await page.waitForTimeout(150);
  };
  const LONG = 'The kinked demand curve explains why prices in an oligopoly stay sticky: a firm that raises its price loses customers, while one that cuts it is matched at once by its rivals.';
  for (const pi of pages) {
    await newNote(pi, .2, 'Short flow note: remember this one.');
    await newNote(pi, .45, LONG);
    await newNote(pi, .7, LONG + ' ' + LONG);
    await page.mouse.click(5, 700); await page.waitForTimeout(300);
  }
  // a floating note beside the slide text, on the first of those pages
  const pi = pages[0];
  const nb0 = card(pi).locator('.notebox').nth(1); await nb0.evaluate(n => n.dataset.t = 'fl');
  const nb = page.locator('.notebox[data-t=fl]');
  await nb.evaluate(n => n.scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(150);
  await nb.hover({position: {x: 80, y: 8}}); await nb.locator('.g-float').click(); await page.waitForTimeout(500);
  await page.mouse.click(5, 700); await page.waitForTimeout(400);
  // (set straight: x as a fraction across the page, y in page units, width in pixels)
  await nb.evaluate(n => { const c = n.parentElement; n.dataset.px = '0.62'; n.dataset.py = String(Math.round(+c.dataset.h * .16)); n.style.width = '290px'; delete n.dataset.oy; placeFloats(); }); await page.waitForTimeout(300);
  return {...o, card};
}

// every note's rectangle as fractions of its card (a slide, or a side page), keyed by order in the notebook
function measure(page){
  return page.evaluate(() => [...main.querySelectorAll('.notebox')].filter(b => !b.classList.contains('collapsed')).map((b, i) => {
    const c = b.closest('.slide, .sidepage'), cr = c.getBoundingClientRect(), r = b.getBoundingClientRect();
    return {i, side: c.classList.contains('sidepage'), card: [...main.querySelectorAll('.slide, .sidepage')].indexOf(c), x: (r.left - cr.left) / cr.width, y: (r.top - cr.top) / cr.height, w: r.width / cr.width, h: r.height / cr.height, txt: (b.querySelector('.mine')?.textContent || '').slice(0, 20), fl: b.classList.contains('floating')};
  }));
}
module.exports = {setup, measure};

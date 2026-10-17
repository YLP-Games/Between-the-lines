// Shared bits for guide.js, table.js and journal.js: open a PDF, tidy checks, PDF pages as pictures
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const results = {ok: 0};
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); results.ok++; console.log('ok  ' + m); };

async function start({scheme = 'light', width = 1440, height = 900, contextOptions, storage} = {}){
  const r = await open(APP, {width, height, colorScheme: scheme, contextOptions, storage});
  const {page} = r;
  page.on('console', async m => { if (m.type() === 'error') { try { console.log('STACK', await m.args()[0]?.evaluate(e => e && e.stack)); } catch {} } });
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);
  const card = page.locator('.pagecard').nth(2);
  await card.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 150)); await page.waitForTimeout(300);
  return {...r, card};
}
// the app's own save has run (it waits half a second after a change)
const settle = page => page.waitForFunction(() => document.querySelector('#saveState')?.dataset.s === 'saved', null, {timeout: 15000}).then(() => page.waitForTimeout(100));
// a note between the lines, written in
async function addNote(page, card, text){
  await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
  const s = await card.locator('.strip').first().boundingBox();
  await page.mouse.move(s.x + 200, s.y + s.height * 0.3, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); if (text) await page.keyboard.type(text); await page.waitForTimeout(150);
}
// the downloaded notebook file: its stored notes, as the HTML a reader would get
async function notebookDoc(page){
  const text = await page.evaluate(async () => (await notebookFile()).blob.text());
  const m = text.match(/<script id="notebook-data" type="application\/json">([\s\S]*?)<\/script>/);
  return {text, data: JSON.parse(m[1])};
}
// the PDF's pages as JPEG pictures
async function pdfPages(page){
  const b64 = await page.evaluate(async () => { const f = await pdfFile(); const u = new Uint8Array(await f.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); });
  const buf = Buffer.from(b64, 'base64'), s = buf.toString('latin1'), jpegs = [];
  for (const m of s.matchAll(/\/DCTDecode \/Length (\d+) >>\nstream\n/g)) jpegs.push(buf.subarray(m.index + m[0].length, m.index + m[0].length + +m[1]));
  return {buf, jpegs};
}
// how many pixels of a picture are close to each colour (hex), and how many are not white
async function pixels(page, jpeg, hexes, tol = 60){
  return page.evaluate(async ({b64, hexes, tol}) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], {type: 'image/jpeg'}));
    const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
    const d = x.getImageData(0, 0, bmp.width, bmp.height).data, want = hexes.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
    const out = hexes.map(() => 0);
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < want.length; k++) if (Math.abs(d[i] - want[k][0]) + Math.abs(d[i + 1] - want[k][1]) + Math.abs(d[i + 2] - want[k][2]) < tol) out[k]++;
    return {w: bmp.width, h: bmp.height, counts: out};
  }, {b64: jpeg.toString('base64'), hexes, tol});
}
// the average colour of the solid ink (the darker pixels) inside some elements of a page, as it is in the PDF's picture of that page
async function pdfInk(page, jpeg, cardIdx, sel){
  return page.evaluate(async ({b64, cardIdx, sel}) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], {type: 'image/jpeg'}));
    const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(bmp, 0, 0);
    const card = document.querySelectorAll('.pagecard')[cardIdx].getBoundingClientRect(), k = bmp.width / card.width;
    let n = 0; const sum = [0, 0, 0];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect(); if (!r.width) continue;
      const x0 = Math.max(0, Math.floor((r.left - card.left) * k)), y0 = Math.max(0, Math.floor((r.top - card.top) * k)), w = Math.max(1, Math.round(r.width * k)), h = Math.max(1, Math.round(r.height * k));
      const d = x.getImageData(x0, y0, Math.min(w, bmp.width - x0), Math.min(h, bmp.height - y0)).data;
      for (let i = 0; i < d.length; i += 4) if (Math.min(d[i], d[i + 1], d[i + 2]) < 150) { n++; sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
    }
    return {n, avg: sum.map(v => Math.round(v / (n || 1)))};
  }, {b64: jpeg.toString('base64'), cardIdx, sel});
}
const near = (avg, hex, tol = 45) => [1, 3, 5].every((i, k) => Math.abs(avg[k] - parseInt(hex.slice(i, i + 2), 16)) <= tol);
const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
module.exports = {start, settle, addNote, notebookDoc, pdfPages, pixels, pdfInk, near, rgb, ok, OUT, path, results, APP};

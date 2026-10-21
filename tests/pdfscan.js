// A scanned PDF (handwritten notes saved as one picture per page, as a scanner or "Microsoft: Print to PDF" makes them) shows
// its picture: it isn't taken for a slide background and left out, which left the page blank. The same with hidden words from
// text recognition on top, or a small stamp in words. A slide's background picture behind its words is still left out.
const {open} = require('./harness');
const path = require('path');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);

  // each case is a one-page PDF made here: a picture as big as the page, then (maybe) words drawn on top of it,
  // and (maybe) `box`: a text box typed onto the page in a PDF editor (a FreeText annotation, drawn from its own stream)
  const run = (kind, text, box = '') => page.evaluate(async ([kind, text, box]) => {
    const slide = kind === 'slide', pw = slide ? 720 : 595, ph = slide ? 540 : 842, iw = pw * 2, ih = ph * 2;
    const c = document.createElement('canvas'); c.width = iw; c.height = ih;
    const x = c.getContext('2d');
    if (slide) { const g = x.createLinearGradient(0, 0, iw, ih); g.addColorStop(0, '#1d4fb8'); g.addColorStop(1, '#6a2bb0'); x.fillStyle = g; x.fillRect(0, 0, iw, ih); }
    else {
      // a scan: off-white paper, faint rules, handwriting on the first lines, a blank stretch, then more, and grey specks
      x.fillStyle = '#f6f3ea'; x.fillRect(0, 0, iw, ih);
      x.fillStyle = '#bcd0e8'; for (let y = 160; y < ih; y += 56) x.fillRect(80, y, iw - 160, 2);
      x.fillStyle = '#1f2f6b'; x.font = 'italic 40px cursive';
      ['Estate duty: Ash Ketchum', 'Question 1', 'Donation of painting', 's58 inadequate consideration', '80 000 - 40 000 = 40 000', 'Not a registered PBO']
        .forEach((t, i) => x.fillText(t, 110, 205 + i * 56));
      ['Total dutiable amount', 'Less s4A abatement'].forEach((t, i) => x.fillText(t, 110, 1213 + i * 56));
      let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      x.fillStyle = '#8a8a8a'; for (let i = 0; i < 600; i++) x.fillRect(Math.floor(rnd() * iw), Math.floor(rnd() * ih), 2, 2);
    }
    const jpeg = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9))).arrayBuffer());
    // the PDF: the picture fills the page, and `text` (PDF text operators) is drawn after it, on top
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q\n${text}`;
    const enc = new TextEncoder(), chunks = [], offs = []; let len = 0;
    const push = d => { const b = typeof d === 'string' ? enc.encode(d) : d; chunks.push(b); len += b.length; };
    const obj = (n, ...parts) => { offs[n] = len; push(`${n} 0 obj\n`); parts.forEach(push); push('\nendobj\n'); };
    push('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 5 0 R >> /Font << /F1 6 0 R >> >> /Contents 4 0 R${box ? ' /Annots [7 0 R]' : ''} >>`);
    obj(4, `<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`);
    obj(5, `<< /Type /XObject /Subtype /Image /Width ${iw} /Height ${ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream');
    obj(6, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    if (box) {
      obj(7, '<< /Type /Annot /Subtype /FreeText /Rect [40 30 580 150] /Contents (typed) /DA (/F1 20 Tf 0 g) /F 4 /AP << /N 8 0 R >> >>');
      obj(8, `<< /Type /XObject /Subtype /Form /BBox [0 0 540 120] /Resources << /Font << /F1 6 0 R >> >> /Length ${enc.encode(box).length} >>\nstream\n${box}\nendstream`);
    }
    const xref = len, size = offs.length;
    push(`xref\n0 ${size}\n0000000000 65535 f \n` + offs.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
    push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    await openFiles([new File(chunks, kind + '.pdf', {type: 'application/pdf'})]);
    // what the page shows: its stored picture
    const card = [...document.querySelectorAll('.pagecard')].pop();
    const im = await loadImg(card.style.getPropertyValue('--pg').match(/url\(["']?(.*?)["']?\)$/)[1]);
    const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data, at = (fx, fy) => { const i = (Math.floor(fy * cv.height) * cv.width + Math.floor(fx * cv.width)) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    let blue = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 2] - d[i] > 60 && d[i] + d[i + 1] + d[i + 2] < 400) blue++;
    return {pages: document.querySelectorAll('.pagecard').length, w: +card.dataset.w, h: +card.dataset.h, blue: blue / (d.length / 4),
      paper: at(0.5, 0.6), words: JSON.parse(card.dataset.text).map(t => t[0]).join(' '), gaps: JSON.parse(card.dataset.gaps), ink: at(0.9, 0.5)};
  }, [kind, text, box]);
  const paper = c => Math.abs(c[0] - 246) < 10 && Math.abs(c[1] - 243) < 10 && Math.abs(c[2] - 234) < 10;
  // between the two lots of handwriting (page units 255 to 585) only the paper's rules cross the page: a gap between each two
  const blankStretch = gaps => gaps.filter(([a, b]) => a >= 255 && b <= 585 && b - a > 15).length >= 8;

  // ---- a scan with nothing else on it (the PDF the bug was found with: "Microsoft: Print to PDF" of a scanner's picture) ----
  const plain = await run('scan', '');
  ok(plain.pages === 1 && plain.w === 595 && plain.h === 842, `a scanned PDF opens as one A4 page (${plain.w} × ${plain.h})`);
  ok(plain.blue > 0.001, `its handwriting shows (${(plain.blue * 100).toFixed(2)}% of the page is ink), not a blank page`);
  ok(paper(plain.paper), `on its own paper colour (${plain.paper})`);
  ok(blankStretch(plain.gaps), `+ Add here finds the blank rows between the paper's rules, specks and all (${plain.gaps.length} gaps)`);

  // ---- a scan with text recognition: its words are hidden (drawn invisibly) on top of the picture ----
  const ocr = await run('ocr', 'BT 3 Tr /F1 20 Tf 55 740 Td (Estate duty: Ash Ketchum) Tj 0 -28 Td (Question 1) Tj ET');
  ok(ocr.blue > 0.001 && paper(ocr.paper), 'a scan with hidden recognised words shows its handwriting');
  ok(/Estate duty: Ash Ketchum/.test(ocr.words) && /Question 1/.test(ocr.words), `and its recognised words can be selected (“${ocr.words}”)`);

  // ---- a scan with a small stamp in words on top (as some scanner apps add) ----
  const stamp = await run('stamp', 'BT /F1 7 Tf 230 14 Td (Scanned with a scanner app) Tj ET');
  ok(stamp.blue > 0.001 && paper(stamp.paper), 'a scan with a small stamp in words on top shows its handwriting');

  // ---- a scan with a text box typed onto it in a PDF editor: the box doesn't hide the scan ----
  const typed = await run('typed', '', 'BT 0 g /F1 22 Tf 4 92 Td (My answer: R3.5 million abatement) Tj 0 -28 Td (applies only once per estate) Tj'
    + ' 0 -28 Td (check s4q for the surviving spouse) Tj 0 -28 Td (deduction comes before the abatement) Tj ET');
  ok(typed.blue > 0.001 && paper(typed.paper), 'a scan with a text box typed onto it still shows its handwriting');

  // ---- a slide: a background picture behind its words is still left out ----
  const slide = await run('slide', 'BT 0 g /F1 34 Tf 50 470 Td (Tax 2: estate duty) Tj /F1 26 Tf 0 -60 Td (Property of the deceased) Tj 0 -45 Td (Deemed property: s3\\(3\\)) Tj'
    + ' 0 -45 Td (Deductions: s4) Tj 0 -45 Td (Abatement: s4A, R3.5 million) Tj 0 -45 Td (Rate: 20% then 25%) Tj 0 -45 Td (Due within a year of death) Tj ET');
  ok(slide.blue < 0.001 && slide.ink.every(v => v > 235), `a slide's full-page background picture is still left out behind its words (${slide.ink})`);
  ok(/Tax 2: estate duty/.test(slide.words), 'and its words are kept');

  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });

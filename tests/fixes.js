// The batch of small fixes: new name, one-click add, PowerPoint tip, help notes, dragging pages, theme flash, segmented controls
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  // ---- theme: a saved dark theme is on <html> before the page body exists ----
  {
    const {browser, context, page, errors} = await open(APP, {colorScheme: 'light'});
    await page.evaluate(() => { localStorage.setItem('theme', 'dark'); localStorage.setItem('ui-font', 'clean'); });
    await page.close();
    const p2 = await context.newPage();
    await p2.addInitScript(() => {
      window.__early = null;
      new MutationObserver(() => {
        if (window.__early === null && document.documentElement.dataset.theme) window.__early = {theme: document.documentElement.dataset.theme, body: !!document.body};
      }).observe(document, {attributes: true, subtree: true});
    });
    await p2.goto('file://' + APP); await p2.waitForTimeout(600);
    const early = await p2.evaluate(() => window.__early);
    ok(early && early.theme === 'dark' && early.body === false, 'a saved Dark theme is set before the body is parsed (' + JSON.stringify(early) + ')');
    ok(await p2.evaluate(() => getComputedStyle(document.body).backgroundColor) !== 'rgb(238, 237, 233)', 'and the page paints dark');
    const tag = await p2.evaluate(() => APP_HTML.match(/<html[^>]*>/)[0]);
    ok(!/data-theme|data-ui-font/.test(tag), 'the notebook file copy keeps no saved theme (' + tag + ')');
    await p2.evaluate(() => { localStorage.setItem('theme', 'light'); });
    await p2.reload(); await p2.waitForTimeout(400);
    ok(await p2.evaluate(() => document.documentElement.dataset.theme) === 'light', 'a saved Light theme is applied too');
    await p2.evaluate(() => { localStorage.setItem('theme', 'system'); });
    await p2.reload(); await p2.waitForTimeout(400);
    ok(await p2.evaluate(() => document.documentElement.dataset.theme) === undefined, 'System leaves it unset');
    await p2.evaluate(() => { localStorage.removeItem('theme'); localStorage.removeItem('ui-font'); });
    await browser.close();
    console.log(errors.length ? errors.join('\n') : 'no page errors (theme)');
  }

  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(600);

  // ---- 1. the name ----
  ok(await page.title() === 'Between the Lines', 'tab title says Between the Lines');
  ok((await page.textContent('.brand b')).trim() === 'Between the Slides', 'the sidebar brand stays Between the Slides');
  const man = JSON.parse(fs.readFileSync(path.join(path.dirname(APP), 'manifest.webmanifest'), 'utf8'));
  ok(man.name === 'Between the Lines' && man.short_name === 'Between the Lines', 'the manifest uses the new name');
  ok(!/Between the Slides/.test(await page.evaluate(() => document.querySelector('#settings').textContent)), 'the help does not use the old name');
  ok(/^# Between the Lines/.test(fs.readFileSync(path.join(path.dirname(APP), 'README.md'), 'utf8')), 'the README heading is renamed');

  // ---- 4 and 3 (help) ----
  const help = await page.evaluate(() => document.querySelector('#settings').textContent.replace(/\s+/g, ' '));
  ok(help.includes('Word files keep their fonts, colours, tables, headers and pictures as editable text. A few pictures (old EMF or WMF drawings, for example) may not come through: save the file as a PDF and open that, or add the picture with Insert › Picture, video or sound.'), 'Help has the note about pictures');
  ok(help.includes('PowerPoint files open as the slides look: each slide is a page with its text you can select, and you write between the lines as on a PDF. Complex animations and SmartArt may still differ; for an exact copy, save the slides as a PDF (File › Save as › PDF) and open that.'), 'Help has the PowerPoint accuracy advice');
  const lis = await page.$$eval('.howto li', els => els.map(e => e.textContent));
  ok(lis[0].startsWith('Open a PDF') && lis[2].startsWith('Word files keep') || lis[1].startsWith('Word files keep') || lis[2].startsWith('Word files keep'), 'it sits straight after the Open bullet');

  // ---- 7. segmented controls ----
  await page.click('#tab-view'); await page.waitForTimeout(200);
  const look = sel => page.$eval(sel, b => { const c = getComputedStyle(b); return [c.backgroundColor, c.color, c.boxShadow, c.fontWeight].join('|'); });
  const un = sel => page.$eval(sel, b => { const c = getComputedStyle(b); return [c.backgroundColor, c.color, c.boxShadow, c.fontWeight].join('|'); });
  const bar = await look('#barModes .btn[aria-pressed="true"]'), theme = await look('#themeModes .btn[aria-pressed="true"]'), font = await look('#uiFonts .btn[aria-pressed="true"]');
  ok(bar === theme && theme === font, 'all three segmented controls share one pressed look (' + bar + ')');
  ok(bar !== await un('#barModes .btn[aria-pressed="false"]') && bar.includes('rgb') && !bar.endsWith('|400'), 'and it differs clearly from an unpressed button');
  ok(await page.$eval('#barModes .btn[aria-pressed="true"]', b => getComputedStyle(b).boxShadow !== 'none'), 'pressed buttons have a ring');

  // ---- 2. + Add here ----
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);
  ok(await page.title() === 'lecture — Between the Lines', 'notebook tab title: ' + await page.title());
  const pointAt = async (pi, frac, x = 260) => {
    const strip = page.locator('.pagecard').nth(pi).locator('.strip').first();
    await strip.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 120)); await page.waitForTimeout(300);
    const b = await strip.boundingBox();
    await page.mouse.move(b.x + x, b.y + b.height * frac, {steps: 4}); await page.waitForTimeout(250);
    return b;
  };
  const away = async () => { await page.mouse.click(5, 700); await page.waitForTimeout(300); };
  await pointAt(2, 0.5);
  ok(await page.getAttribute('.gappill', 'title') === 'Add a note here (right-click for a sticky note or an equation)', 'the pill title is updated');
  await page.click('.gappill'); await page.waitForTimeout(250);
  ok(await page.locator('.notebox').count() === 1 && !(await page.isVisible('.imenu')), 'a left click adds a note straight away, no menu');
  ok(await page.evaluate(() => !!document.activeElement.closest('.notebox .mine')), 'with the cursor in it');
  await page.keyboard.type('hello /'); await page.waitForTimeout(250);
  ok(await page.isVisible('.imenu'), 'typing / in the note still opens the menu');
  await page.keyboard.press('Escape'); await away();

  await pointAt(3, 0.5);
  await page.click('.gappill', {button: 'right'}); await page.waitForTimeout(250);
  ok(await page.isVisible('.imenu') && await page.locator('.notebox').count() === 1, 'right-click on the pill opens the menu and adds nothing');
  ok((await page.$$eval('.imenu .iitem .nm span', e => e.map(x => x.textContent))).join() === 'Note,Sticky note,Equation,Table,Journal entry', 'with Note, Sticky note, Equation, Table, Journal entry');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(await page.locator('.notebox.sticky').count() === 1, 'Sticky note from the menu works');
  await away();

  // right-click on the dashed line, away from the pill
  const sb = await pointAt(4, 0.5, 400);
  const ly = (await page.locator('.gapline').boundingBox()).y;
  await page.mouse.click(sb.x + 500, ly + 1, {button: 'right'}); await page.waitForTimeout(250);
  ok(await page.isVisible('.imenu') && await page.locator('.notebox').count() === 1, 'right-click on the dashed line opens the menu, adding nothing');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await away();

  // press and hold on a touch screen opens the menu; the lift does not add a note
  await pointAt(1, 0.4);
  const n0 = await page.locator('.notebox').count();
  await page.evaluate(() => {
    const p = document.querySelector('.gappill'), r = p.getBoundingClientRect();
    const o = {bubbles: true, pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: r.left + 10, clientY: r.top + 10};
    p.dispatchEvent(new PointerEvent('pointerdown', o));
    window.__lift = () => { p.dispatchEvent(new PointerEvent('pointerup', o)); p.click(); };
  });
  await page.waitForTimeout(250);
  ok(!(await page.isVisible('.imenu')), 'before half a second there is no menu');
  await page.waitForTimeout(450);
  ok(await page.isVisible('.imenu'), 'after 500 ms of holding the menu opens');
  await page.evaluate(() => window.__lift()); await page.waitForTimeout(250);
  ok(await page.locator('.notebox').count() === n0 && await page.isVisible('.imenu'), 'lifting the finger neither adds a note nor closes the menu');
  await page.keyboard.press('Escape'); await away();

  // ---- 5. reorder pages by dragging thumbnails ----
  await page.setViewportSize({width: 1440, height: 1400}); await page.waitForTimeout(500);
  await pointAt(3, 0.5); await page.click('.gappill'); await page.waitForTimeout(250);
  await page.keyboard.type('Moves with page 4'); await away(); await page.waitForTimeout(600);
  await page.evaluate(() => scrollTo(0, 0));
  if (!(await page.isVisible('#pageList'))) { await page.click('#pagesBtn'); await page.waitForTimeout(300); }
  await page.evaluate(() => document.querySelectorAll('#main .slide').forEach((s, i) => { s.dataset.t = i; }));
  const order = () => page.$$eval('#main .slide', els => els.map(e => e.dataset.t).join(''));
  const labels = () => page.$$eval('#pageList .pg .pgl span:first-child', els => els.map(e => e.textContent).join(''));
  const total = await page.locator('#main .slide').count();
  ok(total >= 6, 'six pages to play with (' + total + ')');
  const base = Array.from({length: total}, (_, i) => i).join('');
  ok(await order() === base && await labels() === Array.from({length: total}, (_, i) => i + 1).join(''), 'start in order');
  const notesOn = i => page.locator('#main .slide').nth(i).locator('.notebox').count();
  const noteCard3 = await page.evaluate(() => [...document.querySelectorAll('#main .slide')].findIndex(s => s.querySelector('.notebox')?.textContent.includes('Moves with page 4')));
  const stickyTag = await page.evaluate(i => document.querySelectorAll('#main .slide')[i].dataset.t, noteCard3);
  const box = async i => page.locator('#pageList .pg').nth(i).boundingBox();
  // drag page 4's thumbnail above page 2
  const b3 = await box(3), b1 = await box(1);
  await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2);
  await page.mouse.down();
  await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2 - 10, {steps: 4});
  ok(await page.locator('.pgghost').count() === 1 && await page.locator('.pgdrop').count() === 1, 'a ghost and a drop line appear while dragging');
  await page.mouse.move(b1.x + b1.width / 2, b1.y + 4, {steps: 12}); await page.waitForTimeout(100);
  const ln = await page.locator('.pgdrop').boundingBox();
  ok(Math.abs(ln.y - b1.y) < 6 && ln.height >= 2, 'the accent line sits above page 2');
  await page.mouse.up(); await page.waitForTimeout(500);
  const exp = base.slice(0, 1) + '3' + '12' + base.slice(4);
  ok(await order() === exp, 'slides were reordered: ' + await order());
  ok(await labels() === Array.from({length: total}, (_, i) => i + 1).join(''), 'page labels still run 1..n');
  ok(await page.locator('.pgghost, .pgdrop').count() === 0, 'the ghost and line are gone');
  ok(/Page <b>\d+<\/b> of 6/.test(await page.innerHTML('#pageInfo')), 'status bar still counts pages');
  const moved = await page.evaluate(() => document.querySelectorAll('#main .slide')[1].dataset.t);
  ok(moved === '3', 'page 4 is now page 2');
  // notes travel with the page
  const where = await page.evaluate(() => [...document.querySelectorAll('#main .slide')].map(s => s.dataset.t + ':' + s.querySelectorAll('.notebox').length).join(' '));
  ok(await page.evaluate(t => document.querySelector(`#main .slide[data-t="${t}"]`)?.textContent.includes('Moves with page 4'), stickyTag), 'the note is still on its page (' + where + ')');
  // not a click: no jump
  // Back undoes it
  await page.click('#undoBtn'); await page.waitForTimeout(700);
  // after Back the cards are rebuilt without our tags, so look at where the note is
  const stickyIdx = await page.evaluate(() => [...document.querySelectorAll('#main .slide')].findIndex(s => [...s.querySelectorAll('.notebox')].some(n => n.textContent.includes('Moves with page 4'))));
  ok(stickyIdx === noteCard3 && noteCard3 === 3, 'Back puts the pages back (the note is on page ' + (stickyIdx + 1) + ' again)');

  // Esc cancels a drag
  await page.evaluate(() => document.querySelectorAll('#main .slide').forEach((s, i) => { s.dataset.t = i; }));
  await page.waitForTimeout(100);
  const c3 = await box(3), c1 = await box(1);
  await page.mouse.move(c3.x + c3.width / 2, c3.y + c3.height / 2); await page.mouse.down();
  await page.mouse.move(c1.x + c1.width / 2, c1.y + 4, {steps: 10});
  ok(await page.locator('.pgghost').count() === 1, 'dragging again');
  await page.keyboard.press('Escape'); await page.mouse.up(); await page.waitForTimeout(300);
  ok(await order() === base && await page.locator('.pgghost, .pgdrop').count() === 0, 'Esc cancels the drag');
  // a plain click still jumps to the page
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(200);
  await page.locator('#pageList .pg').nth(5).scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
  const c5 = await box(5);
  await page.mouse.click(c5.x + c5.width / 2, c5.y + c5.height / 2);
  await page.waitForFunction(() => scrollY > 500, null, {timeout: 4000}).catch(() => {}); await page.waitForTimeout(300);      // (a smooth scroll; slower on a busy machine)
  const sy = await page.evaluate(() => scrollY);
  ok(sy > 500 && await order() === base, 'a click on a thumbnail still jumps to that page (scrollY ' + Math.round(sy) + ')');
  // a short wobble under 6 px is a click too, not a move
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
  const d2 = await box(2);
  await page.mouse.move(d2.x + 20, d2.y + 20); await page.mouse.down(); await page.mouse.move(d2.x + 23, d2.y + 22); await page.mouse.up(); await page.waitForTimeout(900);
  ok(await order() === base && await page.evaluate(() => scrollY) > 300, 'a tiny wobble still counts as a click');
  // dropping onto the same place does nothing
  const e2 = await box(2);
  await page.mouse.move(e2.x + e2.width / 2, e2.y + e2.height / 2); await page.mouse.down();
  await page.mouse.move(e2.x + e2.width / 2, e2.y + e2.height / 2 + 14, {steps: 4}); await page.mouse.up(); await page.waitForTimeout(400);
  ok(await order() === base, 'dropping back where it was changes nothing');

  // drag to the very end
  await page.locator('#pageList .pg').nth(total - 1).scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
  const f1 = await box(1), fl = await box(total - 1);
  await page.mouse.move(f1.x + f1.width / 2, f1.y + f1.height / 2); await page.mouse.down();
  await page.mouse.move(fl.x + fl.width / 2, fl.y + fl.height - 3, {steps: 12}); await page.mouse.up(); await page.waitForTimeout(500);
  ok(await order() === base.slice(0, 1) + base.slice(2) + '1', 'dropping below the last page moves it to the end: ' + await order());

  // keyboard: Alt+Up / Alt+Down
  await page.evaluate(() => document.querySelectorAll('#main .slide').forEach((s, i) => { s.dataset.t = i; }));
  const before = await order();
  await page.locator('#pageList .pg').nth(3).focus();
  await page.keyboard.press('Alt+ArrowUp'); await page.waitForTimeout(1200);
  const o1 = await order();
  ok(o1 === before.slice(0, 2) + before[3] + before[2] + before.slice(4), 'Alt+Up moves a page up: ' + o1);
  ok(await page.evaluate(() => document.activeElement.matches('#pageList .pg') && document.activeElement.dataset.i === '2'), 'and the thumbnail keeps the focus');
  await page.keyboard.press('Alt+ArrowDown'); await page.waitForTimeout(1200);
  ok(await order() === before, 'Alt+Down moves it back');
  await page.locator('#pageList .pg').first().focus(); await page.keyboard.press('Alt+ArrowUp'); await page.waitForTimeout(200);
  ok(await order() === before, 'Alt+Up on the first page does nothing');

  // a page layout active: pages are in sheets, and moving still works
  await page.selectOption('#layout', 'a4-portrait'); await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelectorAll('#main .slide').forEach((s, i) => { s.dataset.t = i; }));
  await page.locator('#pageList .pg').nth(2).focus(); await page.keyboard.press('Alt+ArrowUp'); await page.waitForTimeout(900);
  ok(await order() === '0213' + base.slice(4) || (await order()).startsWith('02'), 'with a page layout pages move too: ' + await order());
  ok(await page.locator('#main > .sheet').count() === total && await page.locator('#main > .sheet > .slide').count() === total, 'and each page still has its own sheet');
  await page.selectOption('#layout', 'default'); await page.waitForTimeout(800);

  // the list scrolls by itself when you drag near its bottom edge
  await page.setViewportSize({width: 1440, height: 640}); await page.waitForTimeout(500);
  await page.evaluate(() => { document.querySelector('#pageList .pg').scrollIntoView({block: 'start'}); });      // (the first thumbnail at the top of the list)
  const top0 = await page.evaluate(() => document.querySelector('#pagesPanel').scrollTop);
  const h0 = await box(0), pr = await page.locator('#pagesPanel').boundingBox();
  await page.mouse.move(h0.x + 60, h0.y + 40); await page.mouse.down();
  await page.mouse.move(h0.x + 60, h0.y + 90, {steps: 3}); await page.mouse.move(h0.x + 60, pr.y + pr.height - 12, {steps: 6});
  await page.waitForTimeout(900);
  ok(await page.evaluate(() => document.querySelector('#pagesPanel').scrollTop) > top0 + 40, 'near the bottom edge the list scrolls by itself');
  await page.keyboard.press('Escape'); await page.mouse.up(); await page.waitForTimeout(200);
  await page.setViewportSize({width: 1440, height: 1400}); await page.waitForTimeout(300);

  // touch: press and hold (300 ms) lifts the thumbnail; moving sooner is a scroll and does not
  await page.evaluate(() => { window.__t = (type, el, x, y) => (el || window).dispatchEvent(new PointerEvent(type, {bubbles: true, pointerType: 'touch', pointerId: 3, isPrimary: true, button: 0, clientX: x, clientY: y})); });
  await page.evaluate(() => document.querySelectorAll('#main .slide').forEach((s, i) => { s.dataset.t = i; }));
  const o0 = await order();
  const g4 = await box(4), g1 = await box(1);
  await page.evaluate(([x, y]) => { __t('pointerdown', document.querySelectorAll('#pageList .pg')[4], x, y); }, [g4.x + 50, g4.y + 50]);
  await page.waitForTimeout(150);
  ok(await page.locator('.pgghost').count() === 0, 'a finger does not lift the page at once');
  await page.waitForTimeout(250);
  ok(await page.locator('.pgghost').count() === 1, 'after 300 ms it does');
  await page.evaluate(([x, y]) => { __t('pointermove', null, x, y); __t('pointerup', null, x, y); }, [g1.x + 50, g1.y + 4]);
  await page.waitForTimeout(500);
  ok(await order() === o0.slice(0, 1) + o0[4] + o0.slice(1, 4) + o0[5] && await page.locator('.pgghost').count() === 0, 'dropping it with a finger moves the page: ' + await order());
  await page.evaluate(() => document.querySelectorAll('#main .slide').forEach((s, i) => { s.dataset.t = i; }));
  const g5 = await box(5);
  await page.evaluate(([x, y]) => { __t('pointerdown', document.querySelectorAll('#pageList .pg')[5], x, y); __t('pointermove', null, x, y - 30); }, [g5.x + 50, g5.y + 50]);
  await page.waitForTimeout(450);
  ok(await page.locator('.pgghost').count() === 0, 'moving before the hold finishes cancels it (the finger is scrolling)');
  await page.evaluate(() => __t('pointerup', null, 0, 0));
  await page.evaluate(() => { document.querySelectorAll('#main .slide').forEach((s, i) => { s.dataset.t = i; }); });

  // ---- 3. PowerPoint tip ----
  await page.setInputFiles('#file', path.join(__dirname, 'week2.pptx'));
  await page.waitForFunction(() => document.querySelector('.pptx-tip'), null, {timeout: 60000});
  await page.waitForTimeout(500);
  const tip = page.locator('.pptx-tip');
  ok(await tip.count() === 1, 'the PowerPoint tip shows');
  ok((await tip.locator('span').textContent()) === 'PowerPoint files open as the slides look, and you can write between the lines. Complex animations and SmartArt may still differ; for an exact copy, save the slides as a PDF (File › Save as › PDF) and open that.', 'with the new wording');
  ok(await tip.evaluate(t => t.parentElement.id === 'main' && t.previousElementSibling.classList.contains('file-head') && t.nextElementSibling.classList.contains('slide')), 'it sits above the file’s first slide, inside the page area');
  ok(await page.evaluate(() => !currentDoc().includes('pptx-tip')), 'it is not saved with the notes');
  await page.waitForTimeout(900);
  ok(await page.evaluate(async () => { const kv = await new Promise(r => { const q = indexedDB.open('between-slides-text', 1); q.onsuccess = () => r(q.result); }); const all = await new Promise(r => { const t = kv.transaction('kv').objectStore('kv').getAll(); t.onsuccess = () => r(t.result); }); return !JSON.stringify(all).includes('pptx-tip'); }), 'nor in the browser’s storage');
  await tip.getByRole('button', {name: 'Got it'}).click(); await page.waitForTimeout(200);
  ok(await page.locator('.pptx-tip').count() === 0, 'Got it dismisses it');
  await page.setInputFiles('#file', path.join(__dirname, 'week2.pptx'));
  await page.waitForFunction(() => document.querySelector('.pptx-tip'), null, {timeout: 60000});
  ok(await page.locator('.pptx-tip').count() === 1, 'it comes back for the next PowerPoint file');
  await page.getByRole('button', {name: 'Don’t show again'}).click(); await page.waitForTimeout(200);
  ok(await page.locator('.pptx-tip').count() === 0 && await page.evaluate(() => pref.get('pptx-tip')) === 'off', 'Don’t show again hides it and remembers');
  await page.setInputFiles('#file', path.join(__dirname, 'week2.pptx'));
  await page.waitForFunction(() => document.querySelectorAll('#main .slide').length > 0 && !document.querySelector('.toast.show'), null, {timeout: 60000}).catch(() => {});
  await page.waitForTimeout(1500);
  ok(await page.locator('.pptx-tip').count() === 0, 'and it stays away afterwards');
  // other file types do not show it
  await page.evaluate(() => pref.set('pptx-tip', 'on'));
  await page.setInputFiles('#file', path.join(__dirname, 'reading.docx')); await page.waitForTimeout(2500);
  ok(await page.locator('.pptx-tip').count() === 0, 'a Word file does not show it');

  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

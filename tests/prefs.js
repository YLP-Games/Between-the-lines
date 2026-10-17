// Preferences: unfavourite colours, your own default note style, the interface font, and the light / dark theme
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

(async () => {
  const {browser, context, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await page.waitForTimeout(800);

  const pointAt = async (pi, frac, x = 260) => {
    const strip = page.locator('.pagecard').nth(pi).locator('.strip').first();
    await strip.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 120)); await page.waitForTimeout(300);
    const b = await strip.boundingBox();
    await page.mouse.move(b.x + x, b.y + b.height * frac, {steps: 4}); await page.waitForTimeout(250);
  };
  // a new note between the lines of a page, with the cursor in it
  const newNote = async (pi, frac, text) => {
    await pointAt(pi, frac);
    await page.click('.gappill'); await page.waitForTimeout(250);
    if (text) await page.keyboard.type(text);
    await page.waitForTimeout(150);
  };
  const setColor = (sel, c) => page.evaluate(([s, c]) => { const i = document.querySelector(s); i.value = c; i.dispatchEvent(new Event('input', {bubbles: true})); }, [sel, c]);
  const toastText = () => page.textContent('#toast');
  const pressed = sel => page.getAttribute(sel, 'aria-pressed');
  const favsNow = () => page.evaluate(() => favs.slice());
  const opacity = sel => page.$eval(sel, e => +getComputedStyle(e).opacity);
  const openSettings = async () => { if (!(await page.isVisible('#settings'))) { await page.click('#helpBtn'); await page.waitForTimeout(250); } };
  const closeSettings = async () => { if (await page.isVisible('#settings')) { await page.click('#setClose'); await page.waitForTimeout(150); } };

  // ================= 1. unfavourite colours where they are =================
  await setColor('#color', '#aa3366'); await page.waitForTimeout(100);
  ok(await pressed('#favTextSave') === 'false', 'the star is hollow for a colour that is not a favourite');
  await page.click('#favTextSave'); await page.waitForTimeout(150);
  ok((await favsNow()).join() === '#aa3366' && await page.locator('#favText .fav').count() === 1, 'the star adds the colour to your favourites');
  ok(await pressed('#favTextSave') === 'true' && (await page.$eval('#favTextSave .i', e => getComputedStyle(e).fill)) !== 'none', 'and is filled in (pressed) once it is one');
  ok((await page.$eval('#favTextSave', e => getComputedStyle(e).color)) === (await page.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--accent)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; })), 'the filled star is in the accent colour');
  ok((await toastText()).includes('Saved to your favourite colours'), 'and says so');
  await page.click('#favTextSave'); await page.waitForTimeout(150);
  ok((await favsNow()).length === 0 && await page.locator('#favText .fav').count() === 0, 'pressing the star again removes it');
  ok(await pressed('#favTextSave') === 'false' && (await toastText()) === 'Removed from your favourites.', 'the star is hollow again and a toast says Removed from your favourites.');
  ok(await page.getAttribute('#favTextSave', 'title') === 'Favourite: save the current text colour to your favourites', 'its tip says what it does');

  // several favourites, and the star follows the colour in use
  for (const c of ['#aa3366', '#22aa44', '#2255cc']) { await setColor('#color', c); await page.click('#favTextSave'); await page.waitForTimeout(80); }
  ok((await favsNow()).join() === '#aa3366,#22aa44,#2255cc', 'three favourites saved');
  ok(await pressed('#favTextSave') === 'true', 'the star is filled for the colour in use');
  await setColor('#color', '#112233'); await page.waitForTimeout(100);
  ok(await pressed('#favTextSave') === 'false', 'and hollow after picking a colour that is not a favourite');

  // the x badge
  const sw0 = page.locator('#favText .fvw').nth(0);
  await page.mouse.move(5, 300); await page.waitForTimeout(250);
  ok(await opacity('#favText .fvw:nth-child(1) .favx') === 0, 'the x badge is hidden until you point at a swatch');
  await sw0.locator('.fav').hover(); await page.waitForTimeout(250);
  ok(await opacity('#favText .fvw:nth-child(1) .favx') === 1 && await opacity('#favText .fvw:nth-child(2) .favx') === 0, 'pointing at a swatch shows its x badge (only that one)');
  const sb = await sw0.locator('.fav').boundingBox(), xb = await sw0.locator('.favx').boundingBox();
  ok(xb.x + xb.width / 2 > sb.x + sb.width / 2 && xb.y + xb.height / 2 < sb.y + sb.height / 2, 'the badge is in the top-right corner');
  await page.screenshot({path: path.join(OUT, 'prefs-1-badge.png'), clip: {x: 0, y: 0, width: 1100, height: 160}});
  // keyboard focus shows it too
  await page.mouse.move(5, 300); await page.waitForTimeout(250);
  await page.locator('#favText .fvw').nth(1).locator('.fav').focus(); await page.waitForTimeout(250);
  ok(await opacity('#favText .fvw:nth-child(2) .favx') === 1, 'keyboard focus on a swatch shows its x badge');
  await page.keyboard.press('Tab'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => document.activeElement.classList.contains('favx')) && await opacity('#favText .fvw:nth-child(2) .favx') === 1, 'Tab reaches the x badge, which stays visible');
  await page.mouse.move(5, 300);
  // clicking the swatch itself uses the colour
  await sw0.locator('.fav').click(); await page.waitForTimeout(150);
  ok(await page.inputValue('#color') === '#aa3366' && (await favsNow()).length === 3, 'clicking the swatch uses the colour and keeps it');
  // clicking the x removes it
  await sw0.hover(); await page.waitForTimeout(250);
  await sw0.locator('.favx').click(); await page.waitForTimeout(150);
  ok((await favsNow()).join() === '#22aa44,#2255cc' && await page.locator('#favText .fav').count() === 2, 'clicking the x removes that favourite');
  ok((await toastText()) === 'Removed from your favourites.', 'with the toast');
  ok(await page.inputValue('#color') === '#aa3366', 'and does not change the colour in use');
  ok(await pressed('#favTextSave') === 'false', 'the star is hollow now that colour is not a favourite');
  // right-click removes
  await page.locator('#favText .fav').nth(0).click({button: 'right'}); await page.waitForTimeout(150);
  ok((await favsNow()).join() === '#2255cc' && (await toastText()) === 'Removed from your favourites.', 'right-click on a swatch removes it, with the toast');
  // the Settings list stays in step
  await openSettings();
  ok(await page.locator('#favManage .fm').count() === 1, 'the Settings list shows what is left');
  // (a click outside closes the panel, so these use .click() on the element to keep it open)
  await page.evaluate(() => document.querySelector('#favText .favx').click()); await page.waitForTimeout(150);
  ok(await page.locator('#favManage .fm').count() === 0 && (await page.textContent('#favManage')).includes('No favourite colours yet'), 'removing from the toolbar updates the open Settings list');
  await setColor('#color', '#cc3300'); await page.evaluate(() => document.querySelector('#favTextSave').click()); await page.waitForTimeout(100);
  ok(await page.locator('#favManage .fm').count() === 1, 'saving one adds it to the Settings list');
  await page.click('#favManage .x'); await page.waitForTimeout(150);
  ok(await page.locator('#favText .fav').count() === 0 && await pressed('#favTextSave') === 'false', 'removing from Settings updates the toolbar and the star');
  await closeSettings();

  // the icon-colour menu of a minimised note
  for (const c of ['#aa3366', '#22aa44']) { await setColor('#color', c); await page.click('#favTextSave'); await page.waitForTimeout(80); }
  await newNote(2, 0.5, 'A note to minimise');
  const box = page.locator('.notebox:not(.sticky)').first();
  await box.hover(); await page.click('.notebox:not(.sticky) >> nth=0 >> .g-min'); await page.waitForTimeout(300);
  await box.locator('.note-chip').click({button: 'right'}); await page.waitForTimeout(250);
  ok(await page.isVisible('.chippop') && await page.locator('.chippop .favrow .fvw').count() === 2, 'the icon-colour menu lists the favourites');
  ok(await opacity('.chippop .fvw:nth-child(1) .favx') === 0, 'their x badges are hidden at first');
  await page.locator('.chippop .fvw').nth(0).locator('.cc').hover(); await page.waitForTimeout(250);
  ok(await opacity('.chippop .fvw:nth-child(1) .favx') === 1, 'pointing at one shows its x badge');
  await page.screenshot({path: path.join(OUT, 'prefs-2-chipmenu.png'), clip: {x: 0, y: 0, width: 1440, height: 900}});
  await page.locator('.chippop .fvw').nth(0).locator('.favx').click(); await page.waitForTimeout(200);
  ok((await favsNow()).join() === '#22aa44' && await page.locator('.chippop .favrow .fvw').count() === 1 && await page.isVisible('.chippop'), 'the x removes it there too, and the menu stays open');
  ok((await toastText()) === 'Removed from your favourites.' && await page.locator('#favText .fav').count() === 1, 'with the toast, and the toolbar list follows');
  await page.locator('.chippop .fvw').nth(0).locator('.cc').click({button: 'right'}); await page.waitForTimeout(200);
  ok((await favsNow()).length === 0 && await page.locator('.chippop .favrow .fvw').count() === 0, 'right-click removes there as well');
  ok(await page.isVisible('.chippop'), 'and the icon-colour menu stays open');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.mouse.click(5, 700); await page.waitForTimeout(300);

  // ================= 2. your own default fonts =================
  await openSettings();
  const heads = await page.$$eval('#settings h3', hs => hs.map(h => h.textContent.trim().replace(/\s+\(\d+\)$/, '')));
  ok(heads.includes('New notes') && heads.indexOf('New notes') < heads.indexOf('Custom dictionary'), 'Help & settings has a New notes section before Custom dictionary');
  ok((await page.textContent('#settings')).includes('New notes start in this style. You can still change any note.'), 'with its hint');
  ok(await page.$$eval('#setFont option', o => o.length) === await page.$$eval('#font option', o => o.length), 'the font list is the same as the Home tab');
  const cur = await page.evaluate(() => ({...style}));
  ok(await page.inputValue('#setFont') === cur.font && +await page.inputValue('#setSize') === cur.size && await page.inputValue('#setColor') === cur.color && cur.font === 'Caveat' && cur.size === 24, `it shows the style new notes start in (${JSON.stringify(cur)})`);
  ok(await page.getAttribute('#setSize', 'min') === '4' && await page.getAttribute('#setSize', 'max') === '200', 'the size allows 4 to 200');
  ok(await page.isDisabled('#setFromNote'), 'the copy button is off while you are not in a note');
  await page.selectOption('#setFont', 'Georgia'); await page.waitForTimeout(100);
  ok(await page.inputValue('#font') === 'Georgia', 'the font takes effect at once (the Home tab follows)');
  await page.fill('#setSize', '36'); await page.waitForTimeout(100);
  ok(await page.inputValue('#size') === '36', 'the size takes effect as you type');
  await setColor('#setColor', '#c62828'); await page.waitForTimeout(100);
  ok(await page.inputValue('#color') === '#c62828', 'the colour takes effect at once');
  await page.fill('#setSize', '500'); await page.press('#setSize', 'Enter'); await page.waitForTimeout(100);
  ok(await page.inputValue('#setSize') === '200' && await page.inputValue('#size') === '200', 'a size that is too big is brought back to 200');
  await page.fill('#setSize', '2'); await page.press('#setSize', 'Enter'); await page.waitForTimeout(100);
  ok(await page.inputValue('#setSize') === '4', 'and one that is too small to 4');
  await page.fill('#setSize', '30'); await page.press('#setSize', 'Enter'); await page.waitForTimeout(100);
  await page.screenshot({path: path.join(OUT, 'prefs-3-settings-light.png')});
  await closeSettings();
  await newNote(3, 0.5, 'Made in my style');
  const made = page.locator('.pagecard').nth(3).locator('.notebox .mine').first();
  const cs = await made.evaluate(m => { const c = getComputedStyle(m); return [c.fontFamily, c.fontSize, c.color]; });
  ok(/Georgia/.test(cs[0]) && cs[1] === '30px' && cs[2] === 'rgb(198, 40, 40)', `a new note starts in the chosen font, size and colour (${cs.join(' | ')})`);
  await page.mouse.click(5, 700); await page.waitForTimeout(700);
  // saved: still there after a reload
  await page.reload(); await page.waitForTimeout(1500);
  ok(await page.inputValue('#font') === 'Georgia' && await page.inputValue('#size') === '30' && await page.inputValue('#color') === '#c62828', 'the default style is still there after a reload');
  await openSettings();
  ok(await page.inputValue('#setFont') === 'Georgia' && await page.inputValue('#setSize') === '30' && await page.inputValue('#setColor') === '#c62828', 'and so are the settings');
  await closeSettings();

  // copy the style of the note you're in
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}).catch(() => {});
  await page.waitForTimeout(500);
  await newNote(4, 0.5, 'Style me');
  await page.selectOption('#font', 'Kalam'); await page.fill('#size', '40'); await page.press('#size', 'Enter'); await setColor('#color', '#2e7d32'); await page.waitForTimeout(200);
  const mineCs = await page.evaluate(() => { const c = getComputedStyle(active); return [c.fontFamily, c.fontSize, c.color]; });
  ok(/Kalam/.test(mineCs[0]) && mineCs[1] === '40px', `the note itself is now Kalam 40 (${mineCs.join(' | ')})`);
  ok(await page.evaluate(() => style.font) === 'Georgia', 'the default style is not touched by that');
  await page.click('#helpBtn'); await page.waitForTimeout(250);
  ok(!(await page.isDisabled('#setFromNote')), 'the copy button is on when the panel opens inside a note');
  ok(await page.inputValue('#setFont') === 'Georgia', 'the fields still show the default for new notes, not the note');
  await page.click('#setFromNote'); await page.waitForTimeout(250);
  const st = await page.evaluate(() => ({...style}));
  ok(st.font === 'Kalam' && st.size === 40 && st.color === '#2e7d32', `it copies the note's font, size and colour (${JSON.stringify(st)})`);
  ok(await page.inputValue('#setFont') === 'Kalam' && await page.inputValue('#setSize') === '40' && await page.inputValue('#setColor') === '#2e7d32', 'and the fields follow');
  ok(!(await page.isDisabled('#setFromNote')), 'you are still in the note after pressing it');
  ok(await page.inputValue('#font') === 'Kalam', 'the Home tab still shows the note');
  // you leave the note some way that gives no selection change (e.g. Back): pressing the button says so and turns it off
  await page.evaluate(() => { window.__n = active; active = null; });
  await page.click('#setFromNote'); await page.waitForTimeout(200);
  ok((await toastText()) === 'Click inside a note first.' && await page.isDisabled('#setFromNote'), 'pressing it when there is no note says so, and turns it off');
  // and when the cursor goes back into a note (e.g. with the keyboard) the selection change turns it on
  await page.evaluate(() => { getSelection().removeAllRanges(); }); await page.waitForTimeout(100);
  await page.evaluate(() => { const n = window.__n, r = document.createRange(); r.selectNodeContents(n); r.collapse(false); n.focus(); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await page.waitForTimeout(300);
  ok(!(await page.isDisabled('#setFromNote')), 'it turns on again when the cursor is back in a note (with the panel still open)');
  await page.mouse.click(5, 700); await page.waitForTimeout(300);
  ok(!(await page.isVisible('#settings')), 'clicking out on the page closes the panel');
  await openSettings();
  ok(await page.isDisabled('#setFromNote'), 'and it opens with the button off when you are not in a note');
  await closeSettings();
  await newNote(5, 0.5, 'Next one');
  const cs2 = await page.evaluate(() => { const c = getComputedStyle(active); return [c.fontFamily, c.fontSize, c.color]; });
  ok(/Kalam/.test(cs2[0]) && cs2[1] === '40px' && cs2[2] === 'rgb(46, 125, 50)', `the next new note uses the copied style (${cs2.join(' | ')})`);
  await page.mouse.click(5, 700); await page.waitForTimeout(300);

  // ================= 3. interface font =================
  await openSettings();
  const ff = sel => page.$eval(sel, e => getComputedStyle(e).fontFamily);
  ok(/Patrick Hand/.test(await ff('#tab-home')) && await pressed('#uiFonts [data-pick=hand]') === 'true' && await pressed('#uiFonts [data-pick=clean]') === 'false', 'Handwritten is the default');
  ok((await page.$$eval('#uiFonts .btn', b => b.map(x => x.textContent.trim()))).join() === 'Handwritten,Clean', 'with the two choices Handwritten and Clean');
  const measure = scope => page.evaluate(scope => {
    // anything in the app bar, panels or settings whose text runs past its box
    const bad = [];
    document.querySelectorAll(scope).forEach(e => {
      if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return;
      const cs = getComputedStyle(e);
      if (['auto', 'scroll'].includes(cs.overflowX) || e.matches('select, input, option, optgroup, svg, svg *')) return;
      if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && e.children.length === 0) bad.push((e.id || e.className || e.tagName) + ' ' + e.scrollWidth + '>' + e.clientWidth + ' "' + (e.textContent || '').trim().slice(0, 24) + '"');
    });
    return bad;
  }, scope);
  const tabs = ['home', 'insert', 'box', 'view'];
  const sweep = async () => {
    await closeSettings();
    const all = [];
    for (const t of tabs) { await page.click('#tab-' + t); await page.waitForTimeout(150); all.push(...(await measure('.appbar *, .side *, .statusbar *')).map(x => t + ': ' + x)); }
    await page.click('#tab-home');
    await openSettings(); all.push(...(await measure('#settings *')).map(x => 'settings: ' + x));
    return all;
  };
  if (await pressed('#pagesBtn') !== 'true') await page.click('#pagesBtn');
  if (await pressed('#notesBtn') !== 'true') await page.click('#notesBtn');
  await page.waitForTimeout(400);
  const before = await sweep();
  await page.click('#uiFonts [data-pick=clean]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.documentElement.dataset.uiFont) === 'clean', 'Clean sets data-ui-font on the page');
  const f2 = await ff('#tab-home');
  ok(/system-ui/.test(f2) && !/Patrick Hand/.test(f2), `a toolbar tab now uses the clean font (${f2})`);
  ok(!/Patrick Hand/.test(await ff('#undoBtn')) && !/Kalam/.test(await ff('.doc-title')), 'buttons and the title follow');
  ok(await pressed('#uiFonts [data-pick=clean]') === 'true' && await pressed('#uiFonts [data-pick=hand]') === 'false', 'the choice shows as pressed');
  ok(/Kalam|Georgia|Caveat/.test(await page.$eval('.pagecard >> nth=4 >> .notebox .mine', e => getComputedStyle(e).fontFamily)), 'notes keep their own fonts');
  const after = await sweep();
  console.log('   overflowing with Handwritten:', before.length ? before.join(' ; ') : 'none');
  console.log('   overflowing with Clean:', after.length ? after.join(' ; ') : 'none');
  const key = x => x.replace(/ \d+>\d+/, '');
  ok(after.filter(x => !before.map(key).includes(key(x))).length === 0, 'nothing overflows with the clean font that did not already overflow');
  await page.screenshot({path: path.join(OUT, 'prefs-4-settings-clean.png')});
  await page.click('#tab-view'); await page.waitForTimeout(200);
  await page.screenshot({path: path.join(OUT, 'prefs-5-view-clean.png'), clip: {x: 0, y: 0, width: 1440, height: 130}});
  await page.click('#tab-home');
  await closeSettings();
  await page.reload(); await page.waitForTimeout(1200);
  ok(await page.evaluate(() => document.documentElement.dataset.uiFont) === 'clean' && /system-ui/.test(await ff('#tab-home')), 'Clean is remembered after a reload');
  await openSettings();
  ok(await pressed('#uiFonts [data-pick=clean]') === 'true', 'and shown as chosen');
  await page.click('#uiFonts [data-pick=hand]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.documentElement.dataset.uiFont) === undefined && /Patrick Hand/.test(await ff('#tab-home')), 'Handwritten brings the sketchy font back');
  await page.reload(); await page.waitForTimeout(1200);
  ok(await page.evaluate(() => document.documentElement.dataset.uiFont) === undefined, 'and that is remembered too');

  // ================= 4. light / dark =================
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === undefined, 'System is the default: no data-theme is set');
  await page.click('#tab-view'); await page.waitForTimeout(200);
  const names = await page.$$eval('#themeModes .btn', b => b.map(x => x.textContent.trim()));
  ok(names.join() === 'System,Light,Dark' && (await page.textContent('#panel-view')).includes('Theme'), 'the View tab has a Theme group: System, Light, Dark');
  ok(await page.evaluate(() => !!document.querySelector('#panel-view #themeModes') && (document.querySelector('#themeModes').compareDocumentPosition(document.querySelector('#barModes')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'in the View tab, before the Toolbar group');
  ok(await pressed('#themeModes [data-pick=system]') === 'true', 'System is pressed');
  ok(await page.$$eval('#themeModes .btn svg use', u => u.map(x => x.getAttribute('href')).join()) === '#i-monitor,#i-sun,#i-moon', 'with monitor, sun and moon icons');
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const metaColor = () => page.getAttribute('meta[name=theme-color]', 'content');
  ok(await bg() === 'rgb(238, 237, 233)' && await metaColor() === '#eeede9', 'the device is light, so the page and theme-color are light');
  await page.emulateMedia({colorScheme: 'dark'}); await page.waitForTimeout(250);
  ok(await bg() === 'rgb(29, 35, 32)' && await metaColor() === '#1d2320', 'System follows the device going dark, and theme-color follows');
  await page.emulateMedia({colorScheme: 'light'}); await page.waitForTimeout(250);
  ok(await metaColor() === '#eeede9', 'and going light again');
  await page.click('#themeModes [data-pick=dark]'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark' && await bg() === 'rgb(29, 35, 32)', 'Dark sets data-theme=dark even though the device is light');
  ok(await metaColor() === '#1d2320', 'the theme-color meta turns dark');
  ok(await pressed('#themeModes [data-pick=dark]') === 'true' && await pressed('#themeModes [data-pick=system]') === 'false', 'Dark shows as pressed');
  ok(await page.evaluate(() => { const t = APP_HTML.match(/<html[^>]*>/)[0]; return !t.includes('data-theme') && !t.includes('data-ui-font') && document.documentElement.outerHTML.match(/<html[^>]*>/)[0].includes('data-theme'); }), 'the theme is not baked into the downloadable notebook file');
  await page.reload(); await page.waitForTimeout(1200);
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark' && await bg() === 'rgb(29, 35, 32)' && await metaColor() === '#1d2320', 'Dark survives a reload');
  await page.click('#tab-view'); await page.waitForTimeout(200);
  ok(await pressed('#themeModes [data-pick=dark]') === 'true', 'and is shown as chosen');
  await page.screenshot({path: path.join(OUT, 'prefs-6-dark-view.png')});
  await openSettings();
  await page.screenshot({path: path.join(OUT, 'prefs-7-settings-dark.png')});
  await closeSettings();
  await page.emulateMedia({colorScheme: 'dark'}); await page.click('#themeModes [data-pick=light]'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'light' && await bg() === 'rgb(238, 237, 233)' && await metaColor() === '#eeede9', 'Light stays light even when the device is dark');
  await page.screenshot({path: path.join(OUT, 'prefs-8-light-on-dark-device.png')});
  await page.click('#themeModes [data-pick=system]'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === undefined && await bg() === 'rgb(29, 35, 32)' && await metaColor() === '#1d2320', 'System takes data-theme off again and follows the (dark) device');
  await page.emulateMedia({colorScheme: 'light'}); await page.waitForTimeout(250);
  ok(await bg() === 'rgb(238, 237, 233)', 'then light again');

  // Ctrl+Shift+L cycles System -> Light -> Dark -> System
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme || 'system');
  await page.mouse.click(5, 700);
  await page.keyboard.press('Control+Shift+L'); await page.waitForTimeout(150);
  ok(await theme() === 'light' && (await toastText()) === 'Theme: Light', 'Ctrl+Shift+L: System to Light, with a toast');
  await page.keyboard.press('Control+Shift+L'); await page.waitForTimeout(150);
  ok(await theme() === 'dark' && (await toastText()) === 'Theme: Dark' && await metaColor() === '#1d2320', 'then Dark');
  await page.keyboard.press('Control+Shift+L'); await page.waitForTimeout(150);
  ok(await theme() === 'system' && (await toastText()) === 'Theme: System', 'then back to System');
  ok(await pressed('#themeModes [data-pick=system]') === 'true', 'the buttons follow the shortcut');
  // works while writing in a note, and does not type anything
  await newNote(1, 0.5, 'abc');
  await page.keyboard.press('Control+Shift+L'); await page.waitForTimeout(150);
  ok(await theme() === 'light' && (await page.evaluate(() => active.textContent)) === 'abc', 'it also works in a note, without typing anything');
  await page.keyboard.press('Control+Shift+L'); await page.keyboard.press('Control+Shift+L'); await page.waitForTimeout(100);
  await page.mouse.click(5, 700); await page.waitForTimeout(300);
  ok((await page.textContent('#settings')).includes('Change the theme: System, Light or Dark'), 'the shortcut is in the Help list');
  const dts = await page.$$eval('.keys dt', d => d.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  ok(dts.indexOf('Ctrl Shift L') === dts.indexOf('Ctrl Shift F') - 1, 'right before Ctrl Shift F');

  // screenshots in dark and light with the settings open
  await page.click('#themeModes [data-pick=dark]'); await page.click('#tab-home'); await page.waitForTimeout(200);
  await setColor('#color', '#e0b84a'); await page.click('#favTextSave'); await setColor('#color', '#7fd1ff'); await page.click('#favTextSave');
  await page.locator('#favText .fav').nth(0).hover(); await page.waitForTimeout(250);
  await page.screenshot({path: path.join(OUT, 'prefs-9-dark-home.png'), clip: {x: 0, y: 0, width: 1100, height: 160}});

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

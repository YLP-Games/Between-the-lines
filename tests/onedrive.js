// OneDrive and Microsoft 365: sign-in, the file picker, open (with PDF conversion), save, share, errors. MSAL and Microsoft Graph are faked.
const {open} = require('./harness');
const {MSAL, graph, CATALOG} = require('./odmock');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ROOT = path.dirname(APP);
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

const src = fs.readFileSync(APP, 'utf8');
const LINE = /const ONEDRIVE = \{[^}]*\};/;          // whatever the site has filled in, the test uses its own
if (!LINE.test(src)) throw new Error('FAILED: ONEDRIVE config line not found');
const CONF = path.join(__dirname, 'index.od.html');
fs.writeFileSync(CONF, src.replace(LINE, () => "const ONEDRIVE = {clientId: 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb'};"));
const BLANK = path.join(__dirname, 'index.nood.html');          // the same page with OneDrive not set up
fs.writeFileSync(BLANK, src.replace(LINE, () => "const ONEDRIVE = {clientId: ''};"));
const MSAL_URL = /cdn\.jsdelivr\.net\/npm\/@azure\/msal-browser@3\.28\.1\/lib\/msal-browser\.min\.js/;
const CORS = {'access-control-allow-origin': '*'};

(async () => {
  // ---------- not set up for this site ----------
  {
    const b = await open(BLANK), p = b.page;
    let asked = 0;
    b.context.on('request', r => { if (/jsdelivr.*msal|graph\.microsoft|login\.microsoftonline/.test(r.url())) asked++; });
    await p.waitForTimeout(500);
    const toast = re => p.waitForFunction(s => new RegExp(s).test(document.querySelector('#toast').textContent), re.source, {timeout: 10000});
    ok(await p.isVisible('.welcome [data-od-open]') && /OneDrive/.test(await p.textContent('.welcome [data-od-open]')), 'the welcome screen has an "open from OneDrive" link');
    await p.hover('.welcome [data-od-open]');
    await p.click('.welcome [data-od-open]');
    await toast(/OneDrive isn’t set up for this site yet/);
    ok(true, 'unconfigured: clicking the welcome link explains it');
    ok(await p.evaluate(() => document.querySelector('#sideOd').previousElementSibling.id === 'sideDriveNbs'), 'a sidebar row follows the Google Drive ones');
    await p.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
    await p.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
    await p.click('#sideOd');
    await toast(/OneDrive isn’t set up/);
    ok(true, 'unconfigured: the sidebar row explains it');
    await p.evaluate(() => { document.querySelector('#toast').textContent = ''; });
    await p.click('#save');
    ok(await p.isVisible('#saveMenu [data-od="save"]') && await p.isVisible('#saveMenu [data-od="share"]'), 'unconfigured: the OneDrive entries still show in the Download menu');
    await p.click('#saveMenu [data-od="save"]');
    await toast(/OneDrive isn’t set up/);
    ok(true, 'unconfigured: Save to OneDrive explains it');
    await p.evaluate(() => { document.querySelector('#toast').textContent = ''; });
    const row = p.locator('#docList .nb[aria-current]'); await row.hover(); await row.locator('.more').click();
    await p.click('.docmenu [data-act="odshare"]');
    await toast(/OneDrive isn’t set up/);
    ok(true, 'unconfigured: Share via OneDrive… explains it');
    await p.click('#helpBtn');
    ok(await p.isVisible('#odHint') && /README/.test(await p.textContent('#odHint')) && /client ID/.test(await p.textContent('#odHint')), 'unconfigured: Help & settings says what the site owner needs to do');
    ok((await p.textContent('#odStatus')) === 'Not connected' && await p.isDisabled('#odOff'), 'unconfigured: Not connected, Sign out off');
    ok(asked === 0 && await p.evaluate(() => !window.msal), 'unconfigured: nothing is loaded from Microsoft');
    ok(b.errors.length === 0, 'no page errors (unconfigured): ' + b.errors.join(' / '));
    await b.browser.close();
  }

  // ---------- configured ----------
  const {browser, context, page, errors} = await open(CONF);
  const g = await graph(context);
  const {reqs, uploads, st} = g;
  let msalLoads = [];
  await context.route(MSAL_URL, r => { msalLoads.push(r.request().url()); r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: MSAL}); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__toasts = []; new MutationObserver(() => __toasts.push(document.querySelector('#toast').textContent)).observe(document.querySelector('#toast'), {childList: true, characterData: true, subtree: true}); });

  const toastText = () => page.textContent('#toast');
  const waitToast = (re, ms = 20000) => page.waitForFunction(s => new RegExp(s).test(document.querySelector('#toast').textContent), re.source, {timeout: ms});
  const sawToast = re => page.evaluate(s => __toasts.some(t => new RegExp(s).test(t)), re.source);
  const pagecards = n => page.waitForFunction(k => document.querySelectorAll('.pagecard').length >= k, n, {timeout: 60000});
  const docsNow = () => page.evaluate(() => docs.map(d => ({id: d.id, name: d.name, odNb: d.odNb, odDrive: d.odDrive})));
  const listIdle = () => page.waitForFunction(() => document.querySelector('#odpList').getAttribute('aria-busy') === 'false', null, {timeout: 15000});
  const rows = () => page.$$eval('#odpList .odrow', els => els.map(e => e.querySelector('b').textContent));
  const crumbs = async () => (await page.$$eval('#odpCrumbs > *', els => els.map(e => e.textContent))).join('|');
  const dlg = () => page.waitForSelector('.odbox:not([hidden])', {timeout: 15000}).then(listIdle);
  const row = name => page.locator('#odpList .odrow', {has: page.locator('b', {hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')})});
  const waitSaw = (re, ms = 20000) => page.waitForFunction(s => __toasts.some(t => new RegExp(s).test(t)), re.source, {timeout: ms});
  const saveAnd = async (what, re, ms) => { await page.evaluate(() => { __toasts.length = 0; }); await saveMenu(what); await waitSaw(re, ms); };
  const saveMenu = async what => { await page.click('#save'); await page.click(`#saveMenu [data-od="${what}"]`); };
  const switchTo = name => page.evaluate(async n => { await switchDoc(docs.find(d => d.name === n).id); }, name);
  const puts = () => reqs.filter(r => r.method === 'PUT');
  const shSay = () => page.textContent('#shSay');
  const waitSay = (re, ms = 15000) => page.waitForFunction(s => new RegExp(s).test(document.querySelector('#shSay').textContent), re.source, {timeout: ms});
  const shIdle = () => page.waitForFunction(() => !document.querySelector('.sharebox').classList.contains('busy'), null, {timeout: 15000});
  const perms = () => reqs.filter(r => /\/permissions|\/invite|\/createLink/.test(r.url));
  const msalState = () => page.evaluate(() => JSON.parse(JSON.stringify({...__msal, accts: __msal.accts})));

  // ---- before anything ----
  ok(await page.evaluate(() => !window.msal), 'Microsoft’s library is not loaded until wanted');
  ok(await page.evaluate(() => document.querySelector('#saveMenu').textContent.includes('Save to OneDrive')), 'the Download menu has a OneDrive section');
  await page.click('#helpBtn');
  ok((await page.textContent('#odStatus')) === 'Not connected' && await page.isDisabled('#odOff') && !(await page.isVisible('#odHint')), 'settings: Not connected, Sign out off, no "not set up" note');
  ok(/OneDrive and Microsoft 365/.test(await page.textContent('#odSec h3')), 'settings: a OneDrive and Microsoft 365 section');
  await page.click('#setClose');

  // ---- pointing loads MSAL; clicking signs in and opens the picker ----
  await page.hover('.welcome [data-od-open]');
  await page.waitForFunction(() => window.msal && window.__msal.inits === 1, null, {timeout: 5000});
  ok(msalLoads.length === 1 && msalLoads[0].includes('@azure/msal-browser@3.28.1/lib/msal-browser.min.js'), 'pointing at a OneDrive button loads the pinned MSAL file from jsdelivr');
  ok((await msalState()).logins === 0, 'pointing does not sign in');
  await page.evaluate(() => { const b = document.querySelector('.welcome [data-od-open]'); b.click(); b.click(); });          // two clicks at once
  await dlg();
  ok(await page.locator('.odbox').count() === 1, 'two quick clicks open one picker');
  let ms = await msalState();
  ok(ms.logins === 1 && ms.reqs.find(r => r.k === 'login').scopes.join() === 'User.Read,Files.ReadWrite.All' && ms.reqs.find(r => r.k === 'login').prompt === 'select_account', 'sign-in is a popup login for User.Read and Files.ReadWrite.All');
  ok(ms.cfg.auth.clientId === 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb' && ms.cfg.auth.authority === 'https://login.microsoftonline.com/common' && /\/msal-redirect\.html$/.test(ms.cfg.auth.redirectUri), 'MSAL is set up with the client ID, the common authority and msal-redirect.html: ' + ms.cfg.auth.redirectUri);
  ok(fs.existsSync(path.join(ROOT, 'msal-redirect.html')) && !/<script/i.test(fs.readFileSync(path.join(ROOT, 'msal-redirect.html'), 'utf8')), 'msal-redirect.html exists and has no script in it');
  ok(await page.evaluate(() => document.activeElement.id) === 'odpList', 'the picker puts focus in the file list');
  ok(await page.getAttribute('.odbox', 'role') === 'dialog' && await page.getAttribute('.odbox', 'aria-modal') === 'true', 'the picker is a modal dialog');

  // ---- My files: folders first, only files we open, breadcrumbs ----
  const R0 = ['Courses', 'Many', 'Diagram.png', 'Lecture 1.pdf', 'My notebook (notes).html', "O'Brien notes.pdf", 'Reading.docx', 'Week 2 slides.pptx'];
  ok(JSON.stringify(await rows()) === JSON.stringify(R0), 'My files: folders first, then pdf/pptx/docx/pictures/notebooks only: ' + (await rows()).join(', '));
  ok((await crumbs()) === 'My files', 'breadcrumbs start at "My files"');
  ok(reqs.some(r => /^\/me\/drive\/root\/children/.test(r.url) && r.auth === 'Bearer tok1'), 'the list is asked of Graph v1.0 with the token');
  await row('Courses').click();
  await listIdle();
  ok(JSON.stringify(await rows()) === JSON.stringify(['Year 2', 'Deep dive.pdf']) && (await crumbs()) === 'My files|›|Courses', 'a folder opens, with a breadcrumb: ' + await crumbs());
  ok(reqs.some(r => /^\/drives\/D1\/items\/F1\/children/.test(r.url)), 'folders are read by drive and item id');
  await row('Year 2').click(); await listIdle();
  ok((await crumbs()) === 'My files|›|Courses|›|Year 2' && JSON.stringify(await rows()) === '["Exam.pdf"]', 'two levels deep');
  await page.click('#odpCrumbs [data-crumb="1"]'); await listIdle();
  ok((await crumbs()) === 'My files|›|Courses', 'clicking a crumb goes back up to it');
  await page.click('#odpCrumbs [data-crumb="0"]'); await listIdle();
  ok(JSON.stringify(await rows()) === JSON.stringify(R0), 'clicking "My files" goes back to the top');
  // keyboard
  await page.keyboard.press('ArrowDown');
  ok(await page.getAttribute('#odpList', 'aria-activedescendant') === 'odr1' && await page.getAttribute('#odr1', 'data-cur') === '1', 'ArrowDown moves down the list');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('End');
  ok(await page.getAttribute('#odpList', 'aria-activedescendant') === 'odr7', 'End goes to the last row');
  await page.keyboard.press('Home'); await page.keyboard.press('Enter'); await listIdle();
  ok((await crumbs()) === 'My files|›|Courses', 'Enter on a folder goes in');
  await page.keyboard.press('Backspace'); await listIdle();
  ok((await crumbs()) === 'My files' && (await rows()).length === R0.length, 'Backspace goes up a level');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await listIdle();
  ok((await crumbs()) === 'My files|›|Many' && (await rows()).length === 30, 'a long folder shows its first page');
  ok(await page.isVisible('#odpMore') && /30 items so far/.test(await page.textContent('#odpSay')), '"Show more" is offered, and the count says "so far"');
  await page.click('#odpMore'); await listIdle();
  ok((await rows()).length === 45 && !(await page.isVisible('#odpMore')), 'Show more brings the rest');
  await page.click('#odpCrumbs [data-crumb="0"]'); await listIdle();

  // ---- the other tabs ----
  ok((await page.$$eval('#odpBox [role=tab], .odtabs [role=tab]', t => t.map(x => x.textContent))).join('|') === 'My files|Shared with me|Recent', 'tabs: My files, Shared with me, Recent');
  await page.click('#odt-shared'); await listIdle();
  ok(JSON.stringify(await rows()) === JSON.stringify(['Team folder', 'Shared lecture.pdf', 'Shared notebook (notes).html']), 'Shared with me lists what others shared: ' + (await rows()).join(', '));
  ok(reqs.some(r => /^\/me\/drive\/sharedWithMe/.test(r.url)), 'it uses /me/drive/sharedWithMe');
  ok(/Shared by Grace Hopper/.test(await row('Shared lecture.pdf').textContent()), 'who shared each file is shown');
  await row('Team folder').click(); await listIdle();
  ok(reqs.some(r => /^\/drives\/DX\/items\/RF\/children/.test(r.url)) && JSON.stringify(await rows()) === '["Team notes.pdf"]' && (await crumbs()) === 'Shared with me|›|Team folder', 'a shared folder opens in the other person’s drive');
  await page.click('#odpCrumbs [data-crumb="0"]'); await listIdle();
  st.sharedFail = true; await page.click('#odt-mine'); await page.click('#odt-shared'); await listIdle();
  ok(/“Shared with me” couldn’t be loaded/.test(await page.textContent('#odpList')) && await page.isVisible('#odpList [data-retry]'), 'if Shared with me can’t load, the dialog says so and offers Try again');
  st.sharedFail = false; await page.click('#odpList [data-retry]'); await listIdle();
  ok((await rows()).length === 3, 'Try again loads it');
  await page.focus('#odt-shared'); await page.keyboard.press('ArrowRight'); await listIdle();
  ok(await page.getAttribute('#odt-recent', 'aria-selected') === 'true' && await page.evaluate(() => document.activeElement.id) === 'odt-recent', 'arrow keys move between the tabs');
  ok(reqs.some(r => /^\/me\/drive\/recent/.test(r.url)) && JSON.stringify(await rows()) === JSON.stringify(['Lecture 1.pdf', 'Shared lecture.pdf']), 'Recent lists recent files: ' + (await rows()).join(', '));
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await listIdle();
  ok(await page.getAttribute('#odt-mine', 'aria-selected') === 'true', 'and back to My files');

  // ---- search ----
  await page.fill('#odpQ', "o'brien");
  await page.waitForFunction(() => document.querySelector('#odpCrumbs').textContent.includes('Results for'), null, {timeout: 5000}); await listIdle();
  ok(reqs.some(r => r.raw.includes("/me/drive/root/search(q='o''brien')")), 'search uses /me/drive/root/search(q=…) and doubles a quote');
  ok(JSON.stringify(await rows()) === '["O\'Brien notes.pdf"]' && (await crumbs()).startsWith('Results for “o\'brien”'), 'search results: ' + (await rows()).join(', '));
  await page.click('#odpCrumbs [data-crumb="clear"]'); await listIdle();
  ok((await page.inputValue('#odpQ')) === '' && (await rows()).length === R0.length, 'Clear search goes back to the folder');
  await page.fill('#odpQ', 'lecture'); await page.press('#odpQ', 'Enter'); await listIdle();
  ok(JSON.stringify(await rows()) === '["Lecture 1.pdf"]', 'Enter searches at once');
  await page.fill('#odpQ', 'zzzz'); await page.press('#odpQ', 'Enter'); await listIdle();
  ok(/Nothing found for “zzzz”/.test(await page.textContent('#odpList')), 'no results says so');
  await page.press('#odpQ', 'ArrowDown');
  ok(await page.evaluate(() => document.activeElement.id) === 'odpList', 'ArrowDown in the search box goes to the list');
  await page.fill('#odpQ', ''); await page.press('#odpQ', 'Enter'); await listIdle();

  // ---- a folder that fails to load says so inside the dialog ----
  st.listFail = true;
  await row('Courses').click(); await listIdle();
  ok(/Microsoft said: Something broke at Microsoft/.test(await page.textContent('#odpList')) && await page.isVisible('#odpList [data-retry]'), 'a failed folder shows Microsoft’s reason and Try again (no stuck spinner)');
  ok(await page.getAttribute('#odpList', 'aria-busy') === 'false', 'the list is not left busy');
  st.listFail = false; await page.click('#odpList [data-retry]'); await listIdle();
  ok((await rows()).length === 2, 'Try again loads the folder');
  await page.click('#odpCrumbs [data-crumb="0"]'); await listIdle();

  // ---- open a PDF ----
  ok(await page.isChecked('#odpPdf') && /Open PowerPoint\/Word as it looks \(PDF\)/.test(await page.textContent('.odpdf')), 'the "as it looks (PDF)" box is on by default');
  ok(await page.isDisabled('#odpGo'), 'Open is off until something is ticked');
  await row('Lecture 1.pdf').click();
  ok(await row('Lecture 1.pdf').getAttribute('aria-selected') === 'true' && !(await page.isDisabled('#odpGo')), 'clicking a file ticks it and turns Open on');
  await page.click('#odpGo');
  await page.waitForSelector('.odbox', {state: 'hidden'});
  await pagecards(6);
  const dl = reqs.find(r => /^\/drives\/D1\/items\/I1\/content$/.test(r.url));
  ok(dl && dl.auth === 'Bearer tok1', 'the PDF is downloaded from /drives/{drive}/items/{id}/content with the token');
  ok((await msalState()).logins === 1, 'one sign-in so far');
  await page.waitForFunction(() => docs.some(d => d.name === 'Lecture 1'), null, {timeout: 20000});
  ok(true, 'it opened as a notebook named after the file');

  // ---- Esc, focus, the scrim, focus trap ----
  await page.click('#sideOd'); await dlg();
  let inside = true;
  for (let i = 0; i < 20; i++) { await page.keyboard.press('Tab'); inside = inside && await page.evaluate(() => !!document.activeElement.closest('.odbox')); }
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Tab'); inside = inside && await page.evaluate(() => !!document.activeElement.closest('.odbox')); }
  ok(inside, 'Tab and Shift+Tab stay inside the picker');
  await page.keyboard.press('Escape');
  ok(await page.isHidden('.odbox') && await page.evaluate(() => document.activeElement.id) === 'sideOd', 'Esc closes the picker and puts focus back on the button that opened it');
  ok(await page.evaluate(() => document.querySelectorAll('.pagecard').length >= 6 && docs.filter(d => !d.trashed).length === 1), 'closing opens nothing');
  await page.click('#sideOd'); await dlg();
  await page.mouse.click(4, 4);
  ok(await page.isHidden('.odbox'), 'clicking outside closes the picker');
  await page.click('#sideOd'); await dlg(); await page.click('#odpCancel');
  ok(await page.isHidden('.odbox') && await page.evaluate(() => document.activeElement.id) === 'sideOd', 'Cancel closes it too, focus back on the button');

  // ---- PowerPoint as a PDF (on), the fallback, and the remembered choice ----
  await page.click('#sideOd'); await dlg();
  await row('Week 2 slides.pptx').click(); await page.click('#odpGo');
  await page.waitForSelector('.odbox', {state: 'hidden'}); await pagecards(6);
  ok(reqs.some(r => /^\/drives\/D1\/items\/I2\/content\?format=pdf$/.test(r.url)) && !reqs.some(r => r.url === '/drives/D1/items/I2/content'), 'a .pptx is asked of Graph as a PDF (?format=pdf), not as the original');
  await page.waitForFunction(() => docs.some(d => d.name === 'Week 2 slides'), null, {timeout: 20000});
  ok(await page.evaluate(() => document.querySelectorAll('.pagecard').length >= 6 && !document.querySelector('.pptx-tip')), 'it opens as PDF pages, named after the file');
  st.pdfFail = true;
  await page.click('#sideOd'); await dlg();
  await row('Reading.docx').click(); await page.click('#odpGo');
  await page.waitForSelector('.odbox', {state: 'hidden'});
  await page.waitForFunction(() => docs.some(d => d.name === 'Reading') && !!document.querySelector('.file-head'), null, {timeout: 30000});
  const ord = reqs.filter(r => /\/I4\/content/.test(r.url)).map(r => r.url);
  ok(JSON.stringify(ord) === '["/drives/D1/items/I4/content?format=pdf","/drives/D1/items/I4/content"]', 'when the conversion fails, the original file is fetched instead: ' + ord.join(' then '));
  ok(await sawToast(/Couldn’t make a PDF of “Reading\.docx”, so its original file is being opened instead/), 'and a short toast says so');
  ok(await page.evaluate(() => /./.test(document.querySelector('#main').textContent)), 'the Word file opened as text');
  st.pdfFail = false;
  await page.click('#sideOd'); await dlg();
  await page.click('#odpPdf');
  ok(await page.evaluate(() => localStorage.getItem('od-pdf')) === '0', 'unticking the box is remembered');
  const n0 = reqs.length;
  await row('Week 2 slides.pptx').click(); await page.click('#odpGo');
  await page.waitForSelector('.odbox', {state: 'hidden'});
  await page.waitForFunction(() => docs.filter(d => d.name === 'Week 2 slides').length === 2, null, {timeout: 30000});
  ok(reqs.slice(n0).some(r => r.url === '/drives/D1/items/I2/content') && !reqs.slice(n0).some(r => /format=pdf/.test(r.url)), 'with the box off the original .pptx is fetched');
  await page.click('#sideOd'); await dlg();
  ok(!(await page.isChecked('#odpPdf')), 'the picker remembers the box is off');
  await page.click('#odpPdf');
  ok(await page.evaluate(() => localStorage.getItem('od-pdf')) === '1', 'and on again');

  // ---- several at once with the keyboard, and a notebook file ----
  await page.keyboard.press('Escape'); await page.click('#sideOd'); await dlg();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Space');     // Diagram.png
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Space');     // My notebook (notes).html
  ok((await page.textContent('#odpGo')) === 'Open (2)' && /2 ticked/.test(await page.textContent('#odpSay')), 'Space ticks files; Open says how many');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.odbox', {state: 'hidden'});
  await page.waitForFunction(() => docs.some(d => d.odNb === 'NB1') && docs.some(d => d.name === 'Diagram'), null, {timeout: 60000});
  const nb1 = (await docsNow()).find(d => d.odNb === 'NB1');
  ok(nb1.odDrive === 'D1', 'a notebook file opened from OneDrive remembers its item id and drive');
  ok(reqs.some(r => r.url === '/drives/D1/items/I5/content') && reqs.some(r => r.url === '/drives/D1/items/NB1/content'), 'both files were downloaded');

  // ---- save: a new file, then the same one ----
  await switchTo('Week 2 slides');
  await page.waitForTimeout(500);
  await saveAnd('save', /Saved to OneDrive: Week 2 slides \(notes\)\.html \(\d\d:\d\d\)/);
  let p1 = puts().find(r => /root:/.test(r.url));
  ok(p1 && p1.raw.includes('/me/drive/root:/Between%20the%20Lines/Week%202%20slides%20(notes).html:/content'), 'first save: PUT /me/drive/root:/Between the Lines/<name>.html:/content');
  ok(p1.conflict === 'rename' && p1.auth === 'Bearer tok1' && p1.body.includes('notebook-data') && /text\/html/.test(p1.type), 'first save: never overwrites another file, authorised, body is the notebook');
  let d1 = (await docsNow()).find(d => d.odNb === 'new1');
  ok(d1 && d1.odDrive === 'D1', 'the notebook remembers its OneDrive item id and drive: ' + JSON.stringify(d1));
  const before = puts().length;
  await saveAnd('save', /Saved to OneDrive: kept name/);
  const p2 = puts()[before];
  ok(puts().length === before + 1 && p2.url === '/drives/D1/items/new1/content', 'second save: PUT to the same item id');
  st.put404 = true;
  await saveMenu('save');
  await page.waitForFunction(() => docs.some(d => d.odNb === 'new2'), null, {timeout: 20000});
  const p3 = puts().slice(-2);
  ok(p3[0].url === '/drives/D1/items/new1/content' && /root:/.test(p3[1].url), 'a file that is gone from OneDrive is made again');
  st.put404 = false;

  // ---- a large file goes up through an upload session ----
  await switchTo('Lecture 1');
  await page.waitForTimeout(400);
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'bigtext'; d.className = 'blk'; d.textContent = 'x'.repeat(5e6); main.append(d); });
  await saveAnd('save', /Saved to OneDrive: Lecture 1 \(notes\)\.html/, 60000);
  const ses = reqs.find(r => r.session && r.target === 'path');
  ok(ses && ses.raw.includes('/me/drive/root:/Between%20the%20Lines/Lecture%201%20(notes).html:/createUploadSession') && ses.sessionBody.item['@microsoft.graph.conflictBehavior'] === 'rename', 'over 4 MB: createUploadSession on the path');
  ok(uploads.length >= 2 && uploads.every(u => u.method === 'PUT' && !u.auth), 'the pieces go to the upload address with no token: ' + uploads.length + ' pieces');
  const tot = +uploads[0].range.split('/')[1];
  let pos = 0, fine = tot > 4e6;
  for (const u of uploads) { const [a, b] = u.range.match(/bytes (\d+)-(\d+)/).slice(1).map(Number); fine = fine && a === pos && (b + 1 === tot || (b + 1 - a) % (320 * 1024) === 0) && u.size === b + 1 - a; pos = b + 1; }
  ok(fine && pos === tot && uploads[0].range === 'bytes 0-3276799/' + tot, 'in 320 KiB multiples, in order, with Content-Range: ' + uploads.map(u => u.range).join(' ; '));
  ok(!puts().some(r => r.body.length > 4e6), 'no single request over 4 MB');
  const lec = (await docsNow()).find(d => d.name === 'Lecture 1');
  ok(/^big/.test(lec.odNb) && lec.odDrive === 'D1', 'the large file’s item id is remembered');
  uploads.length = 0;
  await saveAnd('save', /Saved to OneDrive/, 60000);
  const ses2 = reqs.filter(r => r.session).pop();
  ok(ses2.target === 'item' && ses2.url === `/drives/D1/items/${lec.odNb}/createUploadSession` && ses2.sessionBody.item['@microsoft.graph.conflictBehavior'] === 'replace', 'a later large save opens a session on the same item');
  await page.evaluate(() => document.querySelector('#bigtext').remove());

  // ---- a notebook shared with you to view only: 403 saves a copy in your own OneDrive ----
  await page.click('#sideOd'); await dlg();
  await page.click('#odt-shared'); await listIdle();
  await row('Shared notebook (notes).html').click(); await page.click('#odpGo');
  await page.waitForFunction(() => docs.some(d => d.odNb === 'R2'), null, {timeout: 60000});
  ok((await docsNow()).find(d => d.odNb === 'R2').odDrive === 'DX', 'a shared notebook remembers the other person’s drive and item');
  await page.waitForTimeout(400);
  st.forbid.add('R2');
  const nPut = puts().length;
  await saveAnd('save', /You can only view the original, so a copy was saved in your own OneDrive: .*\(my copy\)\.html/);
  const cp = puts().slice(nPut);
  ok(cp.length === 2 && cp[0].url === '/drives/DX/items/R2/content' && /root:.*\(my copy\)\.html:\/content/.test(cp[1].url) && cp[1].conflict === 'rename', 'the 403 on the shared file is followed by "<name> (my copy).html" in your own OneDrive: ' + cp[1].name);
  const mine = (await docsNow()).find(d => d.odNb === 'new' + st.n);
  ok(mine && mine.odDrive === 'D1', 'the notebook now points at its own copy');
  await saveAnd('save', /Saved to OneDrive: kept name/);
  ok(puts().pop().url === `/drives/D1/items/new${st.n}/content`, 'saving again updates the copy');
  ok(reqs.filter(r => r.url === '/drives/DX/items/R2/content' && r.method === 'PUT').length === 1, 'the original is not tried again');

  // ---- share ----
  const wkId = (await docsNow()).find(d => d.odNb === 'new2');
  ok(!!wkId, 'the notebook to share has a OneDrive file');
  await page.evaluate(id => switchDoc(id), wkId.id);
  await page.waitForTimeout(500);
  reqs.length = 0;
  await page.click('#save');
  ok(await page.isVisible('#saveMenu [data-od="share"]') && /Share via OneDrive…/.test(await page.textContent('#saveMenu [data-od="share"]')), 'the Download menu has "Share via OneDrive…"');
  await page.evaluate(() => document.activeElement.blur());          // the toolbar keeps focus where it was, so start from nowhere in particular
  await page.click('#saveMenu [data-od="share"]');
  await page.waitForSelector('.sharebox:not([hidden])', {timeout: 30000});
  await page.waitForSelector('#shPeople li', {timeout: 10000}); await shIdle();
  const iPut = reqs.findIndex(r => r.method === 'PUT'), iPerm = reqs.findIndex(r => /\/permissions$/.test(r.url));
  ok(iPut >= 0 && iPerm > iPut, 'Share saves the notebook to OneDrive first, then lists who has access');
  ok((await page.textContent('#shTitle')) === 'Share via OneDrive' && !(await page.isVisible('.shwhat')), 'the dialog is titled "Share via OneDrive" (no notebook/PDF choice)');
  ok((await page.$$eval('#shRole option', o => o.map(x => x.textContent))).join() === 'Viewer,Editor', 'people can be Viewers or Editors');
  ok((await page.$$eval('#shGeneral option', o => o.map(x => x.textContent))).join('|') === 'Restricted|Anyone with the link: Viewer|Anyone with the link: Editor', 'general access: Restricted, or anyone with the link as Viewer or Editor');
  ok(await page.evaluate(() => document.activeElement.id) === 'shEmails', 'focus starts in the email box');
  ok(/Open › From OneDrive/.test(await page.textContent('#shHow')) && /saved in your OneDrive/.test(await page.textContent('#shFile')), 'the dialog explains how people open the notebook file');
  ok((await page.textContent('#shPeople')).includes('Ada Lovelace') && (await page.textContent('#shPeople')).includes('Owner') && (await page.locator('#shPeople .x').count()) === 0, 'the owner is listed, with no remove button');
  ok(await page.inputValue('#shLink') === 'https://contoso-my.sharepoint.com/personal/ada/new2', 'the link is the file’s own address');
  ok(await page.getAttribute('#shOpen', 'href') === 'https://contoso-my.sharepoint.com/personal/ada/new2' && /Open in OneDrive/.test(await page.textContent('#shOpen')) && await page.getAttribute('#shOpen', 'target') === '_blank', '"Open in OneDrive" opens it in a new tab');
  inside = true;
  for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); inside = inside && await page.evaluate(() => !!document.activeElement.closest('.sharebox')); }
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Tab'); inside = inside && await page.evaluate(() => !!document.activeElement.closest('.sharebox')); }
  ok(inside, 'Tab and Shift+Tab stay inside the dialog');
  // invite
  await page.fill('#shEmails', 'bob@example.com, cy@example.com');
  await page.selectOption('#shRole', 'writer');
  await page.fill('#shMsg', 'Here are my notes');
  await page.click('#shAdd');
  await waitSay(/Shared with bob@example\.com, cy@example\.com/); await shIdle();
  const inv = reqs.filter(r => /\/invite$/.test(r.url));
  ok(inv.length === 1 && inv[0].url === '/drives/D1/items/new2/invite', 'one POST to /drives/{d}/items/{id}/invite');
  ok(JSON.stringify(inv[0].invite) === JSON.stringify({requireSignIn: true, sendInvitation: true, roles: ['write'], recipients: [{email: 'bob@example.com'}, {email: 'cy@example.com'}], message: 'Here are my notes'}), 'body: requireSignIn, sendInvitation, roles write, recipients, message: ' + inv[0].body);
  ok((await page.locator('#shPeople li').count()) === 3 && (await page.locator('#shPeople .x').count()) === 2 && (await page.textContent('#shPeople')).includes('Editor'), 'three people listed, a remove button for the two added, role Editor');
  await page.fill('#shEmails', 'dee@example.com'); await page.selectOption('#shRole', 'reader'); await page.uncheck('#shNotify');
  await page.click('#shAdd'); await waitSay(/Shared with dee@example\.com\.$/); await shIdle();
  const inv2 = reqs.filter(r => /\/invite$/.test(r.url)).pop().invite;
  ok(inv2.roles[0] === 'read' && inv2.sendInvitation === false && inv2.message === undefined, 'Viewer is "read"; with "Notify" off no invitation or message is sent');
  await page.check('#shNotify');
  // remove
  await page.click('#shPeople [aria-label="Remove bob@example.com"]');
  await waitSay(/Removed bob@example\.com/); await shIdle();
  const del = reqs.filter(r => r.method === 'DELETE');
  ok(del.length === 1 && del[0].url === '/drives/D1/items/new2/permissions/p1', 'removing sends a DELETE for that permission');
  ok(!(await page.textContent('#shPeople')).includes('bob@'), 'the list updates');
  // bad input and a refusal
  const nBefore = reqs.length;
  await page.fill('#shEmails', 'not-an-email, dee@example.com'); await page.click('#shAdd');
  ok(/“not-an-email” doesn’t look like an email address/.test(await shSay()) && reqs.length === nBefore, 'an invalid email is explained and nothing is sent');
  await page.fill('#shEmails', 'eve@blocked.org'); await page.click('#shAdd');
  await waitSay(/Sharing outside contoso\.com is not allowed/); await shIdle();
  ok(/Couldn’t share with eve@blocked\.org\. OneDrive said: Sharing outside contoso\.com/.test(await shSay()) && await page.inputValue('#shEmails') === 'eve@blocked.org', 'a refusal shows Microsoft’s reason, and the address stays in the box');
  await page.fill('#shEmails', '');
  // anyone with the link
  await page.selectOption('#shGeneral', 'reader');
  await waitSay(/Anyone with the link can now view it/); await shIdle();
  let lk = reqs.filter(r => /createLink$/.test(r.url)).pop();
  ok(lk.link.type === 'view' && lk.link.scope === 'anonymous', 'Anyone with the link: Viewer is createLink type view, scope anonymous');
  ok(await page.inputValue('#shGeneral') === 'reader' && /without signing in/.test(await page.textContent('#shGenNote')) && await page.inputValue('#shLink') === 'https://1drv.test/anonymous/view/new2', 'the link shown is the sharing link');
  await page.selectOption('#shGeneral', 'writer');
  await waitSay(/open and change it/); await shIdle();
  lk = reqs.filter(r => /createLink$/.test(r.url)).pop();
  const dels = reqs.filter(r => r.method === 'DELETE');
  ok(lk.link.type === 'edit' && dels.length === 2 && /permissions\/lk/.test(dels[1].url) && await page.inputValue('#shLink') === 'https://1drv.test/anonymous/edit/new2', 'switching to Editor makes an edit link and removes the view link');
  await page.selectOption('#shGeneral', 'none');
  await waitSay(/only the people listed/); await shIdle();
  ok(reqs.filter(r => r.method === 'DELETE').length === 3 && await page.inputValue('#shGeneral') === 'none' && await page.inputValue('#shLink') === 'https://contoso-my.sharepoint.com/personal/ada/new2', 'Restricted removes the link, and the file’s own address is shown again');
  // the organisation forbids anonymous links
  st.noAnon = true;
  await page.selectOption('#shGeneral', 'reader');
  await waitSay(/Links for anyone aren’t allowed here/); await shIdle();
  const links = reqs.filter(r => /createLink$/.test(r.url)).slice(-2);
  ok(links[0].link.scope === 'anonymous' && links[1].link.scope === 'organization' && links[1].link.type === 'view', 'if anonymous links are refused, an organisation link is made instead');
  ok(/\(Anonymous links are disabled by your administrator\.\)/.test(await shSay()) && /people in your organisation with the link can open it/.test(await shSay()) && await page.getAttribute('#shSay', 'data-bad') === '1', 'and the reason is shown: ' + await shSay());
  ok(/Anyone at your organisation/.test(await page.textContent('#shPeople')) && await page.inputValue('#shGeneral') === 'none', 'the organisation link is listed; "anyone" stays off');
  ok(await page.inputValue('#shLink') === 'https://1drv.test/organization/view/new2', 'Copy link would copy the organisation link');
  st.noAnon = false;
  // copy link
  await page.evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async t => { window.__copied = t; }}}); });
  await page.click('#shCopy');
  await page.waitForFunction(() => document.querySelector('#shCopy').textContent.includes('Copied'));
  ok(await page.evaluate(() => window.__copied) === 'https://1drv.test/organization/view/new2', 'Copy link copies the link and says Copied');
  await page.locator('#shPeople .x').last().click();
  await shIdle();
  // Esc and focus
  await page.keyboard.press('Escape');
  ok(await page.isHidden('.sharebox') && await page.evaluate(() => document.activeElement.id) === 'save', 'Esc closes the dialog and focus goes back to the Download button: ' + await page.evaluate(() => (document.activeElement.id || document.activeElement.tagName) + ' hidden=' + document.querySelector('.sharebox').hidden));
  // the ⋯ menu
  const nb = page.locator('#docList .nb[aria-current]');
  await nb.hover(); await nb.locator('.more').click();
  const items = (await page.$$eval('.docmenu button', b => b.map(x => x.textContent.trim()))).join('|');
  ok(/Share via Google Drive…\|Share via OneDrive…\|Move to Trash$/.test(items), 'the notebook ⋯ menu: …|Share via Google Drive…|Share via OneDrive…|Move to Trash');
  await page.click('.docmenu [data-act="odshare"]');
  await page.waitForSelector('.sharebox:not([hidden])', {timeout: 30000}); await shIdle();
  ok(/contoso-my\.sharepoint\.com\/personal\/ada\/new2/.test(await page.inputValue('#shLink')), 'it opens the same dialog for the notebook');
  await page.keyboard.press('Escape');
  ok(await page.isHidden('.sharebox') && await page.evaluate(() => document.activeElement.hasAttribute('data-more')), 'Esc puts focus back on the ⋯ button');
  // the people list can be hidden from an editor
  st.shareList403 = true;
  await page.click('#save'); await page.click('#saveMenu [data-od="share"]');
  await page.waitForSelector('.sharebox:not([hidden])', {timeout: 30000}); await shIdle();
  ok(/doesn’t let you see who else has access/.test(await shSay()), 'if Microsoft hides the list of people, the dialog says so');
  st.shareList403 = false;
  await page.keyboard.press('Escape');
  // duplicate gets no OneDrive file of its own
  const dupOf = (await docsNow()).find(d => d.odNb === 'new2').id;
  await page.evaluate(id => duplicateDoc(id), dupOf);
  await page.waitForTimeout(400);
  const dupes = await page.evaluate(() => docs.filter(d => /\(copy\)$/.test(d.name)).map(d => ({odNb: d.odNb, odDrive: d.odDrive})));
  ok(dupes.length >= 1 && dupes.every(d => !d.odNb && !d.odDrive), 'a duplicate does not share the original’s OneDrive file');

  // ---- a 401 renews the token once ----
  await switchTo('Lecture 1');
  await page.waitForTimeout(400);
  const tokBefore = await page.evaluate(() => od.token);
  st.reject = tokBefore;
  const rBefore = reqs.length;
  await saveAnd('save', /Saved to OneDrive/);
  const tries = reqs.slice(rBefore).filter(r => r.method === 'PUT' || /createUploadSession/.test(r.url));
  ms = await msalState();
  ok(tries.length === 2 && tries[0].auth === 'Bearer ' + tokBefore && tries[1].auth !== tries[0].auth && !/Invalid|Couldn/.test(await toastText()), 'a 401 asks for a fresh token and tries once more: ' + tries.map(t => t.auth).join(' -> '));
  ok(ms.reqs.filter(r => r.k === 'silent').pop().force === true, 'the new token is asked for with forceRefresh');
  st.reject = '';
  await page.evaluate(() => { __toasts.length = 0; });

  // ---- slow down (429) ----
  st.throttle = 1; st.retryAfter = 1;
  const t0 = Date.now(), pBefore = puts().length;
  await saveAnd('save', /Saved to OneDrive/, 30000);
  ok(puts().length === pBefore + 2 && Date.now() - t0 >= 900 && await sawToast(/Microsoft asked us to wait a moment \(1 s\)/), 'a 429 waits for Retry-After, says so, and tries again');
  st.throttle = 9;
  await saveAnd('save', /asking for a short break/, 30000);
  ok(puts().length === pBefore + 2 + 3, 'if Microsoft keeps saying no it stops after two waits, with a calm message');
  st.throttle = 0;

  // ---- offline ----
  await context.setOffline(true); st.down = true;
  await saveAnd('save', /Couldn’t reach OneDrive/);
  ok(true, 'offline, with a valid token: ' + await toastText());
  await page.evaluate(() => { od.expires = 0; });
  const lg = (await msalState()).logins;
  await saveAnd('save', /Couldn’t reach OneDrive \(you appear to be offline\)/);
  ok((await msalState()).logins === lg, 'offline, token expired: says it is offline and does not open a sign-in window');
  await page.evaluate(() => { __toasts.length = 0; });
  await page.click('#sideOd');
  await waitSaw(/Couldn’t reach OneDrive/);
  ok(await page.isHidden('.odbox'), 'offline, opening the picker explains it and shows no dialog');
  await context.setOffline(false); st.down = false;
  await page.click('#sideOd'); await dlg();
  await context.setOffline(true); st.down = true;
  await row('Courses').click(); await listIdle();
  ok(/Couldn’t reach OneDrive/.test(await page.textContent('#odpList')) && await page.isVisible('#odpList [data-retry]') && await page.getAttribute('#odpList', 'aria-busy') === 'false', 'offline inside the picker: a message and Try again, no stuck spinner');
  await context.setOffline(false); st.down = false;
  await page.click('#odpList [data-retry]'); await listIdle();
  ok((await rows()).length === 2, 'back online, Try again works');
  await page.keyboard.press('Escape');

  // ---- settings, then sign out ----
  await page.click('#helpBtn');
  await page.waitForFunction(() => /Connected as Ada Lovelace \(ada@contoso\.com\)/.test(document.querySelector('#odStatus').textContent));
  ok(!(await page.isDisabled('#odOff')), 'settings: Connected as Ada Lovelace (ada@contoso.com), Sign out on');
  await page.click('#odOff');
  ms = await msalState();
  ok(ms.cleared.join() === 'ada@contoso.com' && (await page.textContent('#odStatus')) === 'Not connected' && await page.isDisabled('#odOff'), 'Sign out clears the account and shows Not connected');
  ok(/Signed out of OneDrive/.test(await toastText()) && await page.evaluate(() => !od.token && !od.account), 'a toast says so, and the token is gone from memory');
  await page.click('#setClose');
  const logins = ms.logins;

  // ---- sign-in problems: friendly, and nothing is lost ----
  const slides = await page.evaluate(() => document.querySelectorAll('.slide').length);
  for (const [mode, re, what] of [['closed', /sign-in window was closed/, 'a closed pop-up'], ['blocked', /browser blocked Microsoft’s sign-in window/, 'a blocked pop-up'], ['admin', /needs an administrator to approve/, 'a school or work account that needs an administrator'], ['denied', /OneDrive access wasn’t allowed/, 'a refusal'], ['inprogress', /sign-in window is already open/, 'a sign-in already in progress']]) {
    await page.evaluate(m => { __msal.mode = m; }, mode);
    await saveAnd('save', re);
    ok(true, `${what} gives a calm toast`);
  }
  await page.evaluate(() => { __msal.mode = 'ok'; sessionStorage.removeItem('msal.interaction.status'); });
  ok(await page.evaluate(() => document.querySelectorAll('.slide').length) === slides && (await msalState()).logins > logins, 'the pages are untouched after the errors');
  await page.evaluate(() => { __msal.mode = 'closed'; __toasts.length = 0; });
  await page.click('#sideOd');
  await waitSaw(/sign-in window was closed/);
  ok(await page.isHidden('.odbox'), 'a closed pop-up when opening the picker leaves no dialog behind');
  // a stale "interaction in progress" mark is cleared and the sign-in goes through
  await page.evaluate(() => { __msal.mode = 'ok'; __msal.once = 'inprogress'; });
  await saveAnd('save', /Saved to OneDrive/);
  ok(await page.evaluate(() => sessionStorage.getItem('msal.interaction.status')) === null, 'a stuck "interaction in progress" is cleared and the sign-in is tried again');
  ok(await page.evaluate(() => !!od.account), 'signed in again');

  // ---- the service worker ----
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const fetched = [];
  const handlers = {};
  const ctx = {self: {addEventListener: (n, f) => { handlers[n] = f; }, location: {origin: 'https://ylp-games.github.io'}, skipWaiting() {}, clients: {claim() {}}}, location: {origin: 'https://ylp-games.github.io'}, caches: {open: async () => ({put: () => fetched.push('cached'), match: async () => undefined, addAll: async () => {}, add: async () => {}}), keys: async () => [], delete: async () => {}}, fetch: async () => ({ok: true, clone() { return this; }}), URL, Response, Promise};
  vm.createContext(ctx); vm.runInContext(sw, ctx);
  const tryUrl = (u, mode) => { let responded = false; handlers.fetch({request: {url: u, method: 'GET', mode: mode || 'cors'}, respondWith: () => { responded = true; }}); return responded; };
  ok(!tryUrl('https://graph.microsoft.com/v1.0/me/drive/root/children') && !tryUrl('https://login.microsoftonline.com/common/oauth2/v2.0/token') && !tryUrl('https://login.live.com/oauth20_authorize.srf') && !tryUrl('https://xyz.graph.microsoft.com/x'), 'the service worker never touches graph.microsoft.com, login.microsoftonline.com or login.live.com');
  ok(!tryUrl('https://ylp-games.github.io/Between-the-lines/msal-redirect.html', 'navigate'), 'nor the sign-in pop-up’s return page (it must not replace the cached app)');
  ok(tryUrl('https://ylp-games.github.io/Between-the-lines/index.html', 'navigate') && tryUrl('https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.28.1/lib/msal-browser.min.js'), 'the app and the on-demand MSAL file (jsdelivr) are handled like the other libraries');

  const real = errors.filter(e => !/Failed to load resource|OdError|ERR_INTERNET_DISCONNECTED/.test(e));
  ok(real.length === 0, 'no page errors' + (real.length ? ': ' + real.join(' / ') : ''));
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e.message || e); process.exit(1); });

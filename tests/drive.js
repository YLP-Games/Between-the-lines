// Google Drive: open from Drive, save to Drive, settings, errors. Google itself is mocked.
const {open} = require('./harness');
const path = require('path');
const fs = require('fs');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

// a copy of the app with a client ID and API key filled in
const src = fs.readFileSync(APP, 'utf8');
const LINE = /const GDRIVE = \{[^}]*\};/;          // whatever the site has filled in, the test uses its own
if (!LINE.test(src)) throw new Error('FAILED: GDRIVE config line not found');
const CONF = path.join(__dirname, 'index.drive.html');
fs.writeFileSync(CONF, src.replace(LINE, () => "const GDRIVE = {clientId: '123456789-abc.apps.googleusercontent.com', apiKey: 'KEY123'};"));
const BLANK = path.join(__dirname, 'index.nodrive.html');          // the same page with Drive not set up
fs.writeFileSync(BLANK, src.replace(LINE, () => "const GDRIVE = {clientId: '', apiKey: ''};"));

const PDF = fs.readFileSync(path.join(__dirname, 'lecture.pdf'));
const NB = fs.readFileSync(path.join(__dirname, 'nbfile.html'));

const {GSI, GAPI} = require('./drivemock');

(async () => {
  const {browser, context, page, errors} = await open(CONF);
  const reqs = [], state = {patch404: false, uploadFail: false, n: 0};
  const CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'};
  const json = (route, body, status = 200) => route.fulfill({status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body)});
  await context.route(/accounts\.google\.com\/gsi\/client/, r => r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: GSI}));
  await context.route(/apis\.google\.com\/js\/api\.js/, r => r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: GAPI}));
  await context.route(/www\.googleapis\.com\//, async route => {
    const rq = route.request(), url = rq.url(), method = rq.method();
    if (method === 'OPTIONS') return route.fulfill({status: 204, headers: CORS});
    const rec = {method, url, auth: rq.headers()['authorization'], body: rq.postDataBuffer() ? rq.postDataBuffer().toString('latin1') : ''};
    reqs.push(rec);
    if (url.includes('/upload/') && state.uploadFail) return route.abort('failed');
    if (/\/drive\/v3\/about/.test(url)) return json(route, {user: {displayName: 'Ada Lovelace', emailAddress: 'ada@example.com'}});
    if (/fields=capabilities/.test(url)) return json(route, {capabilities: {canEdit: true}});
    let m;
    if ((m = url.match(/\/drive\/v3\/files\/([^/?]+)\?fields=parents/))) return json(route, {parents: [{f1: 'folderA', f2: 'folderB', nbx: 'folderC'}[m[1]] || 'folderZ']});
    if (/\/drive\/v3\/files\/[^/?]+\?fields=version/.test(url)) return json(route, {version: "1", trashed: false});
    if (/\/drive\/v3\/files\/f1\?alt=media/.test(url)) return route.fulfill({status: 200, contentType: 'application/pdf', headers: CORS, body: PDF});
    if (/\/drive\/v3\/files\/f2\/export\?mimeType=application%2Fpdf/.test(url)) return route.fulfill({status: 200, contentType: 'application/pdf', headers: CORS, body: PDF});
    if (/\/drive\/v3\/files\/nbx\?alt=media/.test(url)) return route.fulfill({status: 200, contentType: 'text/html', headers: CORS, body: NB});
    if (/\/upload\/drive\/v3\/files(\?|$)/.test(url) && method === 'POST') {
      const meta = JSON.parse(rec.body.split('\r\n\r\n')[1].split('\r\n--')[0]); rec.meta = meta;
      return json(route, {id: 'new' + (++state.n), name: meta.name, parents: meta.parents || ['root']});
    }
    if ((m = url.match(/\/upload\/drive\/v3\/files\/([^/?]+)\?/)) && method === 'PATCH') {
      rec.meta = JSON.parse(rec.body.split('\r\n\r\n')[1].split('\r\n--')[0]);
      if (state.patch404) return json(route, {error: {code: 404, message: 'File not found'}}, 404);
      return json(route, {id: m[1], name: 'kept name'});
    }
    return json(route, {error: {code: 400, message: 'unexpected ' + url}}, 400);
  });

  const toastText = () => page.textContent('#toast');
  const waitToast = (re, ms = 20000) => page.waitForFunction(s => new RegExp(s).test(document.querySelector('#toast').textContent), re.source, {timeout: ms});
  const pdfOpened = n => page.waitForFunction(k => document.querySelectorAll('.pagecard').length >= k, n, {timeout: 60000});
  const docsNow = () => page.evaluate(() => docs.map(d => ({name: d.name, driveFolder: d.driveFolder, driveNb: d.driveNb, drivePdf: d.drivePdf})));
  await page.waitForTimeout(600);

  // ---- before anything: the welcome link, the sidebar row, the Download menu ----
  ok(await page.isVisible('.welcome [data-drive-open]'), 'the welcome screen has an "open from Google Drive" link');
  ok((await page.textContent('.welcome .private')).includes('unless you save it to Google Drive'), 'the privacy line mentions Google Drive');
  ok(await page.evaluate(() => !!document.querySelector('#sideDrive') && document.querySelector('#sideDrive').previousElementSibling.id === 'sideOpen'), 'a sidebar row follows "Open a file"');
  ok(await page.evaluate(() => !window.google), 'Google\'s scripts are not loaded until wanted');

  // ---- settings before connecting ----
  await page.click('#helpBtn');
  ok((await page.textContent('#driveStatus')) === 'Not connected', 'settings: Not connected');
  ok(await page.isDisabled('#driveOff'), 'settings: Disconnect is off while not connected');
  ok(!(await page.isVisible('#driveHint')), 'settings: no "not set up" note when configured');
  await page.click('#setClose');

  // ---- open from Drive: PDF and Google Slides ----
  await page.hover('.welcome [data-drive-open]');
  await page.waitForFunction(() => window.google && window.google.accounts && window.google.picker, null, {timeout: 5000});
  ok(true, 'pointing at a Drive button loads Google\'s scripts before the click');
  ok(await page.evaluate(() => window.__tokenRequests === 0), 'pointing does not sign in');
  await page.evaluate(() => { window.__picked = {action: 'picked', docs: [
    {id: 'f1', name: 'Lecture 1.pdf', mimeType: 'application/pdf'},
    {id: 'f2', name: 'Week 2 slides', mimeType: 'application/vnd.google-apps.presentation'}]}; });
  await page.click('.welcome [data-drive-open]');
  await pdfOpened(6);
  await page.waitForFunction(() => docs.filter(d => !d.trashed).length >= 2 && docs.some(d => d.driveFolder === 'folderB'), null, {timeout: 30000});
  const log = await page.evaluate(() => window.__pickerLog.join(' | '));
  ok(/mime .*application\/pdf.*vnd\.google-apps\.presentation.*vnd\.google-apps\.document/.test(log) && /text\/html/.test(log) && /image\/png/.test(log) && /text\/markdown/.test(log), 'the picker is filtered to PDF, Office, Markdown/text, pictures, notebook .html, Slides and Docs');
  ok(/feature multi/.test(log) && /token tok1/.test(log) && /key KEY123/.test(log) && /app 123456789\b/.test(log), 'multi-select, token, API key and the project number as app id');
  const r1 = reqs.find(r => /files\/f1\?alt=media/.test(r.url)), r2 = reqs.find(r => /files\/f2\/export/.test(r.url));
  ok(r1 && r1.auth === 'Bearer tok1', 'the PDF is downloaded with the Authorization header');
  ok(r2 && /mimeType=application%2Fpdf/.test(r2.url) && r2.auth === 'Bearer tok1', 'Google Slides are exported as PDF with the Authorization header');
  ok(await page.evaluate(() => window.__tokenRequests) === 1, 'one sign-in for the whole session so far');
  await page.waitForTimeout(900);
  const ds = await docsNow();
  ok(ds.length === 2, 'two notebooks: ' + JSON.stringify(ds));
  ok(ds.find(d => d.name === 'Lecture 1').driveFolder === 'folderA' && ds.find(d => d.name === 'Week 2 slides').driveFolder === 'folderB', 'each notebook remembers its Drive folder');

  // ---- settings after connecting ----
  await page.click('#helpBtn');
  await page.waitForFunction(() => /Connected as Ada Lovelace \(ada@example\.com\)/.test(document.querySelector('#driveStatus').textContent));
  ok(true, 'settings: Connected as Ada Lovelace (ada@example.com)');
  ok(!(await page.isDisabled('#driveOff')), 'settings: Disconnect is on');
  await page.click('#setClose');

  // ---- Notebook to Drive: first a POST into the source folder, then PATCH of the same file ----
  const up = () => reqs.filter(r => r.url.includes('/upload/'));
  await page.click('#save');
  ok((await page.$$eval('#saveMenu .mhead', hs => hs.filter(h => h.getClientRects().length).map(h => h.textContent.trim()))).includes('Google Drive'), 'the Download menu has a Google Drive section');
  await page.click('#saveMenu [data-drive="notebook"]');
  await waitToast(/Saved to Google Drive: Week 2 slides \(notes\)\.html \(\d\d:\d\d\)/);
  let u = up();
  ok(u.length === 1 && u[0].method === 'POST' && /uploadType=multipart/.test(u[0].url), 'first save: POST multipart');
  ok(JSON.stringify(u[0].meta.parents) === '["folderB"]' && u[0].meta.name === 'Week 2 slides (notes).html', 'first save: named "<name> (notes).html" in the source folder');
  ok(u[0].auth === 'Bearer tok1' && u[0].body.includes('notebook-data'), 'first save: authorised, and the body holds the notebook');
  ok((await docsNow()).find(d => d.name === 'Week 2 slides').driveNb === 'new1', 'the notebook remembers its Drive file');
  await page.click('#save');
  await page.click('#saveMenu [data-drive="notebook"]');
  await page.waitForFunction(() => /kept name/.test(document.querySelector('#toast').textContent), null, {timeout: 20000});
  u = up();
  ok(u.length === 2 && u[1].method === 'PATCH' && /\/files\/new1\?uploadType=multipart/.test(u[1].url), 'second save: PATCH multipart of the same file id');
  ok(u[1].meta.parents === undefined, 'second save: no parents sent on an update');
  ok(/Saved to Google Drive: kept name \(\d\d:\d\d\)/.test(await toastText()), 'toast shows the saved name and time');

  // ---- a 404 on PATCH creates a new file ----
  state.patch404 = true;
  await page.click('#save'); await page.click('#saveMenu [data-drive="notebook"]');
  await page.waitForFunction(() => /Saved to Google Drive: Week 2 slides/.test(document.querySelector('#toast').textContent) && docs.some(d => d.driveNb === 'new2'), null, {timeout: 20000});
  u = up();
  ok(u[2].method === 'PATCH' && u[3].method === 'POST' && (await docsNow()).find(d => d.name === 'Week 2 slides').driveNb === 'new2', 'a 404 on update makes a new file and remembers it');
  state.patch404 = false;

  // ---- PDF to Drive ----
  await page.click('#save'); await page.click('#saveMenu [data-drive="pdf"]');
  await page.waitForFunction(() => /Saved to Google Drive: Week 2 slides \(notes\)\.pdf/.test(document.querySelector('#toast').textContent), null, {timeout: 60000});
  u = up();
  const pdfPost = u[u.length - 1];
  ok(pdfPost.method === 'POST' && pdfPost.meta.mimeType === 'application/pdf' && JSON.stringify(pdfPost.meta.parents) === '["folderB"]' && pdfPost.body.includes('%PDF-'), 'PDF to Drive: POST of a real PDF into the source folder');
  const pid = (await docsNow()).find(d => d.name === 'Week 2 slides').drivePdf;
  ok(!!pid, 'the notebook remembers its Drive PDF: ' + pid);
  await page.evaluate(() => { document.querySelector('#pdfNotes').value = 'comments'; });
  await page.click('#save'); await page.click('#saveMenu [data-drive="pdf"]');
  await page.waitForFunction(() => /kept name/.test(document.querySelector('#toast').textContent), null, {timeout: 60000});
  u = up();
  ok(u[u.length - 1].method === 'PATCH' && u[u.length - 1].url.includes('/files/' + pid + '?'), 'PDF to Drive again: PATCH of the same file');
  await page.evaluate(() => { document.querySelector('#pdfNotes').value = 'page'; });

  // ---- open a notebook .html from Drive, then save back over it ----
  await page.evaluate(() => { window.__picked = {action: 'picked', docs: [{id: 'nbx', name: 'My notebook (notes).html', mimeType: 'text/html'}]}; });
  await page.click('#sideDrive');
  await page.waitForFunction(() => docs.some(d => d.driveNb === 'nbx'), null, {timeout: 30000});
  ok((await docsNow()).find(d => d.driveNb === 'nbx').driveFolder === 'folderC', 'a notebook file opened from Drive remembers its file id and folder');
  await page.waitForTimeout(500);
  await page.click('#save'); await page.click('#saveMenu [data-drive="notebook"]');
  await page.waitForFunction(() => /kept name/.test(document.querySelector('#toast').textContent), null, {timeout: 30000});
  u = up();
  ok(u[u.length - 1].method === 'PATCH' && u[u.length - 1].url.includes('/files/nbx?'), 'saving it back updates the original Drive file');

  // ---- an expired token is asked for again ----
  const before = await page.evaluate(() => window.__tokenRequests);
  await page.evaluate(() => { drive.expires = Date.now() - 1000; });
  await page.click('#save'); await page.click('#saveMenu [data-drive="notebook"]');
  await page.waitForFunction(n => window.__tokenRequests > n, before, {timeout: 20000});
  await page.waitForFunction(() => /kept name/.test(document.querySelector('#toast').textContent), null, {timeout: 30000});
  ok(await page.evaluate(() => window.__tokenRequests) === before + 1 && (await page.evaluate(() => window.__lastReq.prompt)) === '', 'an expired token is asked for again (quietly)');

  // ---- disconnect ----
  await page.click('#helpBtn');
  await page.waitForFunction(() => /Connected as/.test(document.querySelector('#driveStatus').textContent));
  await page.click('#driveOff');
  ok((await page.evaluate(() => window.__revoked)).length === 1 && /^tok/.test((await page.evaluate(() => window.__revoked))[0]), 'Disconnect revokes the token');
  ok((await page.textContent('#driveStatus')) === 'Not connected' && await page.isDisabled('#driveOff'), 'settings: Not connected again after Disconnect');
  await page.click('#setClose');
  const early = errors.filter(e => !/Failed to load resource.*404/.test(e));      // the 404 is the one the test made on purpose
  ok(early.length === 0, 'no page errors so far: ' + early.join(' / '));

  // ---- errors are calm and nothing is lost ----
  const slides = await page.evaluate(() => document.querySelectorAll('.slide').length);
  await page.evaluate(() => { window.__mode = 'closed'; });
  await page.click('#save'); await page.click('#saveMenu [data-drive="notebook"]');
  await waitToast(/sign-in window was closed/);
  ok(true, 'closing the sign-in window gives a calm toast');
  await page.evaluate(() => { window.__mode = 'denied'; });
  await page.click('#save'); await page.click('#saveMenu [data-drive="notebook"]');
  await waitToast(/access wasn’t allowed/);
  ok(true, 'denying access gives a calm toast');
  await page.evaluate(() => { window.__mode = 'ok'; });
  state.uploadFail = true;
  await page.click('#save'); await page.click('#saveMenu [data-drive="pdf"]');
  await waitToast(/Couldn’t reach Google Drive/);
  ok(true, 'a network error says why: ' + (await toastText()));
  state.uploadFail = false;
  ok(await page.evaluate(() => document.querySelectorAll('.slide').length) === slides, 'the notes and pages are untouched after errors');
  errors.length = 0;

  // ---- not set up for this site ----
  const b2 = await open(BLANK);
  const p2 = b2.page; await p2.waitForTimeout(500);
  let asked = 0;
  b2.context.on('request', r => { if (/google\.com|googleapis/.test(r.url())) asked++; });
  await p2.hover('.welcome [data-drive-open]');
  await p2.click('.welcome [data-drive-open]');
  await p2.waitForFunction(() => /isn’t set up for this site yet/.test(document.querySelector('#toast').textContent));
  ok(true, 'unconfigured: clicking Open from Google Drive explains it');
  await p2.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await p2.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await p2.click('#save');
  ok(await p2.isVisible('#saveMenu [data-drive="notebook"]'), 'unconfigured: the Drive buttons still show');
  await p2.click('#saveMenu [data-drive="notebook"]');
  await p2.waitForFunction(() => /isn’t set up for this site yet/.test(document.querySelector('#toast').textContent));
  ok(true, 'unconfigured: Notebook to Drive explains it');
  await p2.click('#helpBtn');
  ok(await p2.isVisible('#driveHint') && /README/.test(await p2.textContent('#driveHint')), 'unconfigured: settings say what the site owner needs');
  ok(asked === 0 && await p2.evaluate(() => !window.google), 'unconfigured: nothing is loaded from Google');
  ok(b2.errors.length === 0, 'no page errors (unconfigured): ' + b2.errors.join(' / '));
  await b2.browser.close();

  const real = errors.filter(e => !/Failed to load resource|DriveError/.test(e));
  ok(real.length === 0, 'no page errors' + (real.length ? ': ' + real.join(' / ') : ''));
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e.message || e); process.exit(1); });

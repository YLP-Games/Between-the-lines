// Start on a laptop, carry on on an iPad: notebooks keep in sync through (a fake) OneDrive shared by two browsers.
// Modelled on sync.js. MSAL is faked per device (odmock.MSAL); Microsoft Graph is one stateful fake that both devices talk to.
const {open} = require('./harness');
const {MSAL} = require('./odmock');
const {GSI, GAPI} = require('./drivemock');
const path = require('path'); const fs = require('fs');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const src = fs.readFileSync(APP, 'utf8');
const CONF = path.join(__dirname, 'index.odsync.html');
fs.writeFileSync(CONF, src
  .replace(/const ONEDRIVE = \{[^}]*\};/, () => "const ONEDRIVE = {clientId: 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb'};")
  .replace(/const GDRIVE = \{[^}]*\};/, () => "const GDRIVE = {clientId: '123456789-abc.apps.googleusercontent.com', apiKey: 'KEY123'};"));
const CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'Retry-After'};
const MSAL_URL = /cdn\.jsdelivr\.net\/npm\/@azure\/msal-browser@3\.28\.1\/lib\/msal-browser\.min\.js/;

// the one OneDrive both devices use
const one = {files: {}, n: 0, c: 0, log: [], throttle: 0, dirItems: true};
const bump = f => { f.c = ++one.c; f.cTag = `"c:{${f.id}},${f.c}"`; f.eTag = `"{${f.id}},${f.c}"`; f.when = new Date().toISOString(); };
const item = f => ({id: f.id, name: f.name, cTag: f.cTag, eTag: f.eTag, size: f.body.length, file: {}, lastModifiedDateTime: f.when, webUrl: 'https://contoso-my.sharepoint.com/personal/ada/' + f.id, parentReference: {driveId: 'D1', path: '/drive/root:/Between the Lines'}});
const gdrive = {files: {}, n: 0, log: []};          // Google Drive, for switching between the clouds

async function device(name, size){
  const d = await open(CONF, size), {context} = d;
  const json = (r, b, status = 200, headers = {}) => r.fulfill({status, contentType: 'application/json', headers: {...CORS, ...headers}, body: JSON.stringify(b)});
  const err = (r, status, code, message, headers) => json(r, {error: {code, message}}, status, headers);
  d.msalLoads = [];
  await context.route(MSAL_URL, r => { d.msalLoads.push(1); r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: MSAL}); });
  await context.route(/accounts\.google\.com\/gsi\/client/, r => r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: GSI}));
  await context.route(/apis\.google\.com\/js\/api\.js/, r => r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: GAPI}));
  await context.route(/graph\.microsoft\.com/, async route => {
    const rq = route.request(), method = rq.method();
    if (method === 'OPTIONS') return route.fulfill({status: 204, headers: CORS});
    const url = decodeURIComponent(rq.url().replace('https://graph.microsoft.com/v1.0', ''));
    one.log.push(`${name} ${method} ${url.slice(0, 110)}`);
    let m;
    if (/^\/me\/drive\?\$select=id$/.test(url)) return json(route, {id: 'D1'});
    if (/^\/me\/drive\/root:\/Between the Lines:\/children/.test(url)) {
      if (!Object.keys(one.files).length) return err(route, 404, 'itemNotFound', 'The resource could not be found.');
      return json(route, {value: Object.values(one.files).filter(f => !f.gone).map(item)});
    }
    if ((m = url.match(/^\/me\/drive\/root:\/Between the Lines\/(.*):\/content\?@microsoft\.graph\.conflictBehavior=(\w+)$/)) && method === 'PUT') {
      let nm = m[1]; if (Object.values(one.files).some(f => !f.gone && f.name === nm)) nm = nm.replace(/(\.html)$/, ' 1$1');
      const f = one.files['it' + (++one.n)] = {id: 'it' + one.n, name: nm, body: rq.postDataBuffer().toString('utf8'), by: name}; bump(f);
      return json(route, item(f), 201);
    }
    if ((m = url.match(/^\/drives\/([^/]+)\/items\/([^/]+)\/content$/)) && method === 'PUT') {
      const f = one.files[m[2]]; if (!f || f.gone) return err(route, 404, 'itemNotFound', 'The resource could not be found.');
      if (f.locked) return err(route, 403, 'accessDenied', 'You do not have permission to change this item.');
      if (one.throttle > 0) { one.throttle--; return err(route, 429, 'activityLimitReached', 'Too many requests.', {'retry-after': '1'}); }
      f.body = rq.postDataBuffer().toString('utf8'); f.by = name; bump(f);
      return json(route, item(f));
    }
    if ((m = url.match(/^\/drives\/([^/]+)\/items\/([^/]+)\/content$/)) && method === 'GET') {
      const f = one.files[m[2]]; if (!f || f.gone) return err(route, 404, 'itemNotFound', 'The resource could not be found.');
      return route.fulfill({status: 200, contentType: 'text/html', headers: CORS, body: f.body});
    }
    if ((m = url.match(/^\/drives\/([^/]+)\/items\/([^/]+)\?\$select=cTag,eTag,deleted$/))) {
      const f = one.files[m[2]]; if (!f || f.gone === 404) return err(route, 404, 'itemNotFound', 'The resource could not be found.');
      return json(route, f.gone ? {id: f.id, deleted: {state: 'deleted'}} : {id: f.id, cTag: f.cTag, eTag: f.eTag});
    }
    return err(route, 400, 'badRequest', 'unexpected ' + method + ' ' + url);
  });
  await context.route(/www\.googleapis\.com\//, async route => {
    const rq = route.request(), url = rq.url(), method = rq.method();
    if (method === 'OPTIONS') return route.fulfill({status: 204, headers: CORS});
    gdrive.log.push(`${name} ${method} ${url.replace(/https:\/\/www\.googleapis\.com/, '').slice(0, 90)}`);
    let m;
    if (/\/drive\/v3\/about/.test(url)) return json(route, {user: {displayName: 'Ada', emailAddress: 'ada@example.com'}});
    const upload = () => { const ct = rq.headers()['content-type'], edge = ct.split('boundary=')[1], parts = rq.postDataBuffer().toString('utf8').split('--' + edge); return {meta: JSON.parse(parts[1].split('\r\n\r\n')[1].trim()), body: parts[2].slice(parts[2].indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '')}; };
    if (/\/upload\/drive\/v3\/files\?/.test(url) && method === 'POST') {
      const {meta, body} = upload(), id = 'g' + (++gdrive.n); gdrive.files[id] = {id, name: meta.name, body, version: 1};
      return json(route, {id, name: meta.name, parents: ['root'], version: '1'});
    }
    if ((m = url.match(/\/upload\/drive\/v3\/files\/([^/?]+)\?/)) && method === 'PATCH') {
      const f = gdrive.files[m[1]]; if (!f) return json(route, {error: {message: 'File not found'}}, 404);
      f.body = upload().body; f.version++;
      return json(route, {id: f.id, name: f.name, parents: ['root'], version: String(f.version)});
    }
    if ((m = url.match(/\/drive\/v3\/files\/([^/?]+)\?fields=/))) {
      const f = gdrive.files[m[1]]; if (!f) return json(route, {error: {message: 'File not found'}}, 404);
      return json(route, {version: String(f.version), trashed: false, parents: ['root'], capabilities: {canEdit: true}});
    }
    return json(route, {error: {message: 'unexpected ' + url}}, 400);
  });
  await d.page.waitForTimeout(800);
  return d;
}
const state = p => p.evaluate(() => { const b = document.querySelector('#driveSync'); return b.hidden ? '' : b.dataset.s; });
const label = p => p.evaluate(() => { const b = document.querySelector('#driveSync'); return b.hidden ? '' : b.textContent; });
const waitState = (p, s, ms = 15000) => p.waitForFunction(s => { const b = document.querySelector('#driveSync'); return !b.hidden && b.dataset.s === s; }, s, {timeout: ms});
const text = p => p.evaluate(() => document.querySelector('main').innerText);
const puts = who => one.log.filter(l => l.startsWith(who + ' PUT /drives')).length;
const checks = who => one.log.filter(l => l.startsWith(who + ' GET') && /cTag,eTag,deleted/.test(l)).length;
const popups = p => p.evaluate(() => __msal.logins + __msal.popups);
const silents = p => p.evaluate(() => __msal.silent);
const file = () => Object.values(one.files).find(f => !f.gone && !/my copy/.test(f.name) && f.id === 'it1');
let nth = 0;
async function addNote(page, words){
  const strip = page.locator('.pagecard').nth(nth++ % 6).locator('.strip').last(); await strip.scrollIntoViewIfNeeded();
  const b = await strip.boundingBox(); await page.mouse.move(b.x + b.width * 0.62, b.y + b.height / 2, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.keyboard.type(words); await page.waitForTimeout(100); await page.mouse.click(5, 700);
}
const sleeping = p => p.waitForFunction(() => ['waiting', 'syncing'].includes(document.querySelector('#driveSync').dataset.s), null, {timeout: 5000});

(async () => {
  const L = await device('laptop'), lp = L.page;
  // ---- the laptop: open slides, write, save to OneDrive once ----
  await lp.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await lp.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await addNote(lp, 'Started on the laptop'); await lp.waitForTimeout(800);
  ok(await state(lp) === '', 'a notebook that is not in OneDrive shows no sync status');
  await lp.hover('#save'); await lp.click('#save'); await lp.click('[data-od=save]');
  await waitState(lp, 'synced');
  ok(Object.keys(one.files).length === 1 && file().body.includes('Started on the laptop') && file().name === 'lecture (notes).html', 'Save to OneDrive saves it once…');
  ok(/keeps in sync/.test(await lp.textContent('#toast')), '…and says it keeps in sync from now on');
  ok(await label(lp) === 'Synced to OneDrive', 'the status button says "Synced to OneDrive"');
  ok(await lp.evaluate(() => { const d = curDoc(); return d.odNb === 'it1' && d.odDrive === 'D1'; }), 'the notebook remembers its item and drive');
  const v1 = await lp.evaluate(() => curDoc().odVer);
  ok(v1 === file().cTag, 'it keeps the cTag the upload gave back: ' + v1);
  // more writing goes up by itself, once, a few seconds after stopping
  const pops = await popups(lp), pu0 = puts('laptop'), ck0 = checks('laptop');
  await addNote(lp, 'More from the laptop');
  await waitState(lp, 'waiting', 3000);
  ok(puts('laptop') === pu0, 'not straight away while you are still writing');
  await waitState(lp, 'synced', 15000);
  ok(puts('laptop') === pu0 + 1 && file().body.includes('More from the laptop'), 'a few seconds later the change is in OneDrive, in one upload');
  const log = one.log.filter(l => l.startsWith('laptop')), lastPut = log.map(l => /PUT \/drives/.test(l)).lastIndexOf(true), lastCheck = log.map(l => /cTag,eTag,deleted/.test(l)).lastIndexOf(true);
  ok(checks('laptop') === ck0 + 1 && lastCheck < lastPut, 'the version is checked just before the upload');
  ok(await lp.evaluate(() => curDoc().odVer) === file().cTag, 'and the new version is remembered');
  await lp.waitForTimeout(7000);
  ok(puts('laptop') === pu0 + 1, 'nothing changed, nothing uploaded');
  ok(await popups(lp) === pops, 'no sign-in window opened by the background upload');
  await lp.screenshot({path: path.join(__dirname, 'shots', 'odsync-1-laptop.png'), clip: {x: 0, y: 0, width: 900, height: 60}}).catch(() => {});

  // ---- the iPad: carry on from another device ----
  const I = await device('ipad', {width: 1024, height: 1366}), ip = I.page;
  await ip.click('#pagesBtn');
  ok(await ip.isVisible('#sideOdNbs') && /Your OneDrive notebooks/.test(await ip.textContent('#sideOdNbs')), 'the sidebar has a "Your OneDrive notebooks" row');
  await ip.hover('#sideOdNbs'); await ip.click('#sideOdNbs');
  await ip.waitForSelector('.nbsrow', {timeout: 10000});
  ok((await ip.textContent('.nbslist')).includes('lecture') && /OneDrive/.test(await ip.textContent('#nbsTitle')), 'the iPad lists the notebooks in your OneDrive');
  await ip.screenshot({path: path.join(__dirname, 'shots', 'odsync-2-ipad-list.png')}).catch(() => {});
  await ip.click('.nbsrow');
  await ip.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 30000});
  await ip.waitForTimeout(800);
  ok((await text(ip)).includes('More from the laptop'), 'picking it opens it with everything written on the laptop');
  ok(await state(ip) === 'synced' && await ip.evaluate(() => curDoc().odNb === 'it1' && curDoc().odVer) === file().cTag, 'and it is in sync, with the version it read');
  const ipPu = puts('ipad');
  await addNote(ip, 'Carried on on the iPad');
  await sleeping(ip); await waitState(ip, 'synced', 15000); await ip.waitForTimeout(300);
  ok(puts('ipad') === ipPu + 1 && file().body.includes('Carried on on the iPad'), 'the iPad’s writing goes to OneDrive by itself');
  // picking it again doesn't make a second copy
  await ip.evaluate(() => cloudNotebooks(CLOUD.onedrive));
  await ip.waitForSelector('.nbsrow'); ok(/On this device/.test(await ip.textContent('.nbsrow')), 'the list says which notebooks are already on this device');
  await ip.click('.nbsrow'); await ip.waitForTimeout(800);
  ok(await ip.evaluate(() => docs.filter(d => !d.trashed).length) === 1, 'picking it again opens the same notebook, not a second copy');
  // and so does the file picker
  await ip.evaluate(() => odOpenOne && cloudOpen(CLOUD.onedrive, {id: 'it1', drive: 'D1', name: 'lecture (notes).html'}));
  await ip.waitForTimeout(800);
  ok(await ip.evaluate(() => docs.filter(d => !d.trashed).length) === 1, 'opening the same file any other way does not make a copy either');

  // ---- back on the laptop: it picks up the iPad's changes ----
  const before = puts('laptop');
  await lp.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await lp.waitForFunction(() => document.querySelector('main').innerText.includes('Carried on on the iPad'), null, {timeout: 15000});
  ok(true, 'coming back to the laptop, the iPad’s changes appear');
  ok(await lp.waitForFunction(() => /latest changes from OneDrive/.test(document.querySelector('#toast').textContent), null, {timeout: 5000}).then(() => true, () => false), 'with a short note saying so');
  await lp.waitForTimeout(7500);
  ok(puts('laptop') === before && await state(lp) === 'synced', 'fetching changes does not send them straight back (no ping-pong)');
  ok(await lp.evaluate(() => curDoc().odVer) === file().cTag, 'the laptop now holds the version it fetched');
  ok(await lp.evaluate(() => !document.querySelector('#undoBtn').disabled), 'Back can still bring the earlier version back');

  // ---- both changed: choose ----
  await addNote(ip, 'iPad edit at the same time');
  await sleeping(ip); await waitState(ip, 'synced', 15000);
  await lp.evaluate(() => { sync.checked = Date.now(); });
  await addNote(lp, 'Laptop edit at the same time');
  await waitState(lp, 'changed', 15000);
  ok(file().body.includes('iPad edit at the same time') && !file().body.includes('Laptop edit at the same time'), 'changed in two places: nothing is written over');
  ok(await label(lp) === 'Changed in two places', 'and the button says so');
  await lp.click('#driveSync'); await lp.waitForSelector('.syncpop:not([hidden])');
  ok(/changed here and in OneDrive/.test(await lp.textContent('.syncpop p')) && /OneDrive’s version/.test(await lp.textContent('.syncpop')), 'the chooser speaks of OneDrive');
  await lp.screenshot({path: path.join(__dirname, 'shots', 'odsync-3-choose.png'), clip: {x: 0, y: 0, width: 900, height: 320}}).catch(() => {});
  await lp.click('.syncpop [data-k=both]');
  await lp.waitForFunction(() => document.querySelector('main').innerText.includes('iPad edit at the same time'), null, {timeout: 15000}); await lp.waitForTimeout(800);
  ok(await lp.evaluate(() => docs.filter(d => !d.trashed).length) === 2, 'Keep both: this version becomes a separate notebook…');
  ok(!(await text(lp)).includes('Laptop edit at the same time') && await state(lp) === 'synced', '…and this one has OneDrive’s version, in sync again');
  ok(await lp.evaluate(async () => { const c = docs.find(d => d.id !== curId && !d.trashed); return !c.odNb && !c.odVer && (await get('doc:' + c.id)).includes('Laptop edit at the same time'); }), 'the kept copy has the laptop edit and is not tied to the OneDrive file');
  // "This version" writes over the cloud's
  await addNote(ip, 'iPad edit, round two');
  await sleeping(ip); await waitState(ip, 'synced', 15000);
  await lp.evaluate(() => { sync.checked = Date.now(); });
  await addNote(lp, 'Laptop wins this time');
  await waitState(lp, 'changed', 15000);
  await lp.click('#driveSync'); await lp.waitForSelector('.syncpop:not([hidden])'); await lp.click('.syncpop [data-k=mine]');
  await waitState(lp, 'synced', 15000);
  ok(file().body.includes('Laptop wins this time') && await lp.evaluate(() => curDoc().odVer) === file().cTag, 'This version: the laptop’s notebook replaces the file in OneDrive');
  await ip.evaluate(() => { sync.checked = 0; document.dispatchEvent(new Event('visibilitychange')); });
  await ip.waitForFunction(() => document.querySelector('main').innerText.includes('Laptop wins this time'), null, {timeout: 15000});

  // ---- offline, and back ----
  await I.context.setOffline(true); await ip.evaluate(() => dispatchEvent(new Event('offline')));
  await addNote(ip, 'Written offline');
  await waitState(ip, 'offline', 5000);
  ok(true, 'offline: it says it syncs when online');
  await I.context.setOffline(false); await ip.evaluate(() => dispatchEvent(new Event('online')));
  await ip.waitForTimeout(500); await waitState(ip, 'synced', 15000);
  ok(file().body.includes('Written offline'), 'back online, it syncs by itself');

  // ---- the sign-in runs out ----
  const s0 = await silents(ip), p0 = await popups(ip);
  await ip.evaluate(() => { od.expires = 0; });
  await addNote(ip, 'After the token ran out');
  await sleeping(ip); await waitState(ip, 'synced', 15000);
  ok(file().body.includes('After the token ran out') && await silents(ip) > s0 && await popups(ip) === p0, 'a token that has run out is renewed quietly, with no window');
  await ip.evaluate(() => { od.expires = 0; __msal.silentMode = 'interaction'; });
  await addNote(ip, 'After sign-in ran out');
  await waitState(ip, 'signin', 15000);
  ok(!file().body.includes('After sign-in ran out') && await popups(ip) === p0, 'quiet sign-in failed: it waits instead of opening a window');
  ok(await label(ip) === 'Sign in to sync' && /Microsoft sign-in has run out/.test(await ip.getAttribute('#driveSync', 'data-tip')), 'the button says "Sign in to sync"');
  await ip.waitForTimeout(6000);
  ok(await state(ip) === 'signin' && await popups(ip) === p0, 'and keeps waiting, still without a window');
  await ip.click('#driveSync'); await waitState(ip, 'synced', 15000);
  await ip.evaluate(() => { __msal.silentMode = 'ok'; });
  ok(file().body.includes('After sign-in ran out') && await popups(ip) === p0 + 1, 'a click signs in (one window) and syncs');

  // ---- a busy Microsoft ----
  one.throttle = 1; const pt = puts('ipad');
  await addNote(ip, 'Written while throttled');
  await sleeping(ip); await waitState(ip, 'synced', 20000);
  ok(puts('ipad') === pt + 2 && file().body.includes('Written while throttled'), '429 with Retry-After: it waits and tries again, once');
  ok(!/asked us to wait/.test(await ip.textContent('#toast')), 'without a message while it syncs in the background');

  // ---- switching to Google Drive and back ----
  await ip.hover('#save'); await ip.click('#save'); await ip.click('[data-drive=notebook]');
  await ip.waitForFunction(() => curDoc().driveNb && !curDoc().odNb, null, {timeout: 15000});
  await waitState(ip, 'synced', 10000);
  ok(await label(ip) === 'Synced to Drive' && await ip.evaluate(() => !curDoc().odDrive && !curDoc().odVer), 'saving to Google Drive moves the link there (one cloud at a time)');
  ok(/It used to sync with OneDrive/.test(await ip.textContent('#toast')), 'and a toast says so');
  const pu = puts('ipad'), g0 = gdrive.log.filter(l => /PATCH/.test(l)).length;
  await addNote(ip, 'Now going to Google Drive');
  await sleeping(ip); await waitState(ip, 'synced', 15000);
  ok(puts('ipad') === pu && gdrive.log.filter(l => /PATCH/.test(l)).length === g0 + 1 && Object.values(gdrive.files)[0].body.includes('Now going to Google Drive') && !file().body.includes('Now going to Google Drive'), 'changes now go to Drive and no longer to OneDrive');
  await ip.hover('#save'); await ip.click('#save'); await ip.click('[data-od=save]');
  await ip.waitForFunction(() => curDoc().odNb && !curDoc().driveNb, null, {timeout: 15000});
  await waitState(ip, 'synced', 10000);
  ok(await label(ip) === 'Synced to OneDrive' && /It used to sync with Google Drive/.test(await ip.textContent('#toast')) && await ip.evaluate(() => !curDoc().driveVer), 'saving to OneDrive moves it back, and says so');
  ok(await ip.evaluate(() => curDoc().odNb) !== 'it1', 'as a new file in OneDrive (the old link was dropped)');
  const it = await ip.evaluate(() => curDoc().odNb);

  // ---- can't change the file any more ----
  one.files[it].locked = true;
  await addNote(ip, 'Written to a locked file');
  await waitState(ip, 'locked', 15000);
  ok(await label(ip) === 'Can’t sync' && !one.files[it].body.includes('Written to a locked file'), '403: it stops and says it can’t sync');
  await ip.click('#driveSync');
  await ip.waitForFunction(old => curDoc().odNb !== old, it, {timeout: 15000}); await waitState(ip, 'synced', 10000);
  const copy = one.files[await ip.evaluate(() => curDoc().odNb)];
  ok(/\(my copy\)\.html$/.test(copy.name) && copy.body.includes('Written to a locked file'), 'a click saves a copy in your own OneDrive and syncs that');
  const it2 = await ip.evaluate(() => curDoc().odNb);

  // ---- deleted in OneDrive ----
  one.files[it2].gone = 404;
  await ip.evaluate(() => { sync.checked = 0; document.dispatchEvent(new Event('visibilitychange')); });
  await waitState(ip, 'gone', 10000);
  ok(await label(ip) === 'Not in OneDrive', 'a notebook deleted in OneDrive says "Not in OneDrive"');
  const pg = puts('ipad'); await addNote(ip, 'Written after it went'); await ip.waitForTimeout(7000);
  ok(puts('ipad') === pg && await state(ip) === 'gone', 'and nothing more is sent');
  await ip.click('#driveSync'); await ip.waitForFunction(old => curDoc().odNb !== old, it2, {timeout: 15000}); await waitState(ip, 'synced', 10000);
  const re = one.files[await ip.evaluate(() => curDoc().odNb)];
  ok(re.body.includes('Written after it went'), 'a click saves it to OneDrive again as a new file');
  // the deleted flag Graph can also send
  re.gone = true;
  await ip.evaluate(() => { sync.checked = 0; document.dispatchEvent(new Event('visibilitychange')); });
  await waitState(ip, 'gone', 10000);
  ok(true, 'an item marked "deleted" counts as gone as well');

  // ---- a new tab has no Microsoft sign-in to renew ----
  const m0 = L.msalLoads.length;
  await lp.reload(); await lp.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await lp.waitForTimeout(1500);
  ok(await lp.evaluate(() => !!curDoc().odNb), 'after a reload the notebook is still tied to its OneDrive file');
  await addNote(lp, 'After a reload'); await lp.waitForTimeout(500); await addNote(lp, 'And once more');
  await waitState(lp, 'signin', 15000);
  ok(L.msalLoads.length === m0 && !file().body.includes('And once more'), 'no sign-in to renew: it waits, and does not even load Microsoft’s script');
  await lp.click('#driveSync'); await waitState(lp, 'synced', 15000);
  ok(file().body.includes('And once more') && L.msalLoads.length === m0 + 1, 'a click signs in and syncs');

  for (const d of [L, I]) await d.browser.close();
  const errs = [...L.errors, ...I.errors].filter(e => !/ERR_FAILED|net::|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); console.error(one.log.slice(-14).join('\n')); process.exit(1); });

// Data safety: the same notebooks open in two tabs, switching notebooks before a change has gone to Google Drive or OneDrive,
// and notebooks synced to Drive by an older version of the app. Each part runs on its own and they all run, so `node syncsafe.js`
// lists every failure; `node syncsafe.js tabs` (or tablist, switch, opened, legacy, legacyedit) runs only those.
const {open} = require('./harness');
const {GSI, GAPI, appData: appDataMock} = require('./drivemock');
const {MSAL} = require('./odmock');
const path = require('path'); const fs = require('fs');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const CONF = path.join(__dirname, 'index.syncsafe.html');
fs.writeFileSync(CONF, fs.readFileSync(APP, 'utf8')
  .replace(/const ONEDRIVE = \{[^}]*\};/, () => "const ONEDRIVE = {clientId: 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb'};")
  .replace(/const GDRIVE = \{[^}]*\};/, () => "const GDRIVE = {clientId: '123456789-abc.apps.googleusercontent.com', apiKey: 'KEY123'};"));
const CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'Retry-After'};
const until = (p, fn, arg, ms = 15000) => p.waitForFunction(fn, arg, {timeout: ms}).then(() => true, () => false);
// (for something on this side, the fake cloud: true once fn() is, or false after ms)
const poll = (fn, ms = 15000) => new Promise(r => { const t0 = Date.now(), i = setInterval(() => { const y = fn(); if (y || Date.now() - t0 > ms) { clearInterval(i); r(!!y); } }, 200); });
const state = p => p.evaluate(() => { const b = document.querySelector('#driveSync'); return b.hidden ? '' : b.dataset.s; });
const waitState = (p, s, ms = 15000) => until(p, s => { const b = document.querySelector('#driveSync'); return !b.hidden && b.dataset.s === s; }, s, ms);
const text = p => p.evaluate(() => document.querySelector('main').innerText);
let nth = 0;
async function addNote(page, words){
  const strip = page.locator('.pagecard').nth(nth++ % 6).locator('.strip').last(); await strip.scrollIntoViewIfNeeded();
  const b = await strip.boundingBox(); await page.mouse.move(b.x + b.width * 0.62, b.y + b.height / 2, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.keyboard.type(words); await page.waitForTimeout(100); await page.mouse.click(5, 700);
}
// a fake Google Drive and OneDrive (one each, shared by every page of the browser)
async function clouds(context){
  const drive = {files: {}, n: 0, log: []}, one = {files: {}, n: 0, c: 0, log: []}, appData = appDataMock();
  const json = (r, b, status = 200) => r.fulfill({status, contentType: 'application/json', headers: CORS, body: JSON.stringify(b)});
  await context.route(/accounts\.google\.com\/gsi\/client/, r => r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: GSI}));
  await context.route(/apis\.google\.com\/js\/api\.js/, r => r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: GAPI}));
  await context.route(/cdn\.jsdelivr\.net\/npm\/@azure\/msal-browser/, r => r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: MSAL}));
  await context.route(/www\.googleapis\.com\//, async route => {
    const rq = route.request(), url = rq.url(), method = rq.method();
    if (method === 'OPTIONS') return route.fulfill({status: 204, headers: CORS});
    const app = appData(route, rq); if (app) return app;
    drive.log.push(`${method} ${url.replace(/https:\/\/www\.googleapis\.com/, '').slice(0, 90)}`);
    let m;
    if (/\/drive\/v3\/about/.test(url)) return json(route, {user: {displayName: 'Ada', emailAddress: 'ada@example.com'}});
    const upload = () => { const edge = rq.headers()['content-type'].split('boundary=')[1], parts = rq.postDataBuffer().toString('utf8').split('--' + edge); return {meta: JSON.parse(parts[1].split('\r\n\r\n')[1].trim()), body: parts[2].slice(parts[2].indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '')}; };
    if (/\/upload\/drive\/v3\/files\?/.test(url) && method === 'POST') {
      const {meta, body} = upload(), id = 'nb' + (++drive.n), f = drive.files[id] = {id, name: meta.name, body, version: 1, rev: 1};
      setTimeout(() => f.version++, 300);          // like the real Drive: it works on the file after an upload, and its version goes up again
      return json(route, {id, name: meta.name, parents: ['root'], version: '1', headRevisionId: 'rev1'});
    }
    if ((m = url.match(/\/upload\/drive\/v3\/files\/([^/?]+)\?/)) && method === 'PATCH') {
      const f = drive.files[m[1]]; if (!f) return json(route, {error: {message: 'File not found'}}, 404);
      f.body = upload().body; f.version++; f.rev++; f.patches = (f.patches || 0) + 1;
      setTimeout(() => f.version++, 300);
      return json(route, {id: f.id, name: f.name, parents: ['root'], version: String(f.version), headRevisionId: 'rev' + f.rev});
    }
    if ((m = url.match(/\/drive\/v3\/files\/([^/?]+)\?alt=media/))) return route.fulfill({status: 200, contentType: 'text/html', headers: CORS, body: drive.files[m[1]].body});
    if ((m = url.match(/\/drive\/v3\/files\/([^/?]+)\?fields=/))) {
      const f = drive.files[m[1]]; if (!f) return json(route, {error: {message: 'File not found'}}, 404);
      return json(route, {version: String(f.version), headRevisionId: 'rev' + f.rev, trashed: false, parents: ['root'], capabilities: {canEdit: true}});
    }
    return json(route, {error: {message: 'unexpected ' + url}}, 400);
  });
  const item = f => ({id: f.id, name: f.name, cTag: f.cTag, eTag: f.eTag, size: f.body.length, file: {}, parentReference: {driveId: 'D1'}});
  const bump = f => { f.c = ++one.c; f.cTag = `"c:{${f.id}},${f.c}"`; f.eTag = `"{${f.id}},${f.c}"`; };
  await context.route(/graph\.microsoft\.com/, async route => {
    const rq = route.request(), method = rq.method();
    if (method === 'OPTIONS') return route.fulfill({status: 204, headers: CORS});
    const url = decodeURIComponent(rq.url().replace('https://graph.microsoft.com/v1.0', ''));
    one.log.push(`${method} ${url.slice(0, 110)}`);
    let m;
    if (/^\/me\/drive\?\$select=id$/.test(url)) return json(route, {id: 'D1'});
    if ((m = url.match(/^\/me\/drive\/root:\/Between the Lines\/(.*):\/content\?@microsoft\.graph\.conflictBehavior=(\w+)$/)) && method === 'PUT') {
      const f = one.files['it' + (++one.n)] = {id: 'it' + one.n, name: m[1], body: rq.postDataBuffer().toString('utf8')}; bump(f);
      return json(route, item(f), 201);
    }
    if ((m = url.match(/^\/drives\/([^/]+)\/items\/([^/]+)\/content$/)) && method === 'PUT') {
      const f = one.files[m[2]]; f.body = rq.postDataBuffer().toString('utf8'); bump(f); f.puts = (f.puts || 0) + 1;
      return json(route, item(f));
    }
    if ((m = url.match(/^\/drives\/([^/]+)\/items\/([^/]+)\/content$/)) && method === 'GET') return route.fulfill({status: 200, contentType: 'text/html', headers: CORS, body: one.files[m[2]].body});
    if ((m = url.match(/^\/drives\/([^/]+)\/items\/([^/]+)\?\$select=cTag,eTag,deleted$/))) { const f = one.files[m[2]]; return json(route, {id: f.id, cTag: f.cTag, eTag: f.eTag}); }
    return json(route, {error: {code: 'badRequest', message: 'unexpected ' + method + ' ' + url}}, 400);
  });
  return {drive, one};
}
// a notebook made from lecture.pdf, with a note, saved to Google Drive once
async function lectureInDrive(page, words){
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await addNote(page, words); await page.waitForTimeout(800);
  await page.click('#save'); await page.click('[data-drive=notebook]');
  ok(await waitState(page, 'synced'), 'a notebook saved to Google Drive is in sync');
  return page.evaluate(() => curId);
}
// the app in two tabs of one browser, both on a notebook X with a few words in it
async function twoTabs(){
  const {browser, context, page: a, errors} = await open(CONF);
  await a.waitForTimeout(800);
  await a.click('#newDocBtn'); await a.waitForTimeout(400);
  await a.keyboard.type('Alpha from tab A'); await a.waitForTimeout(900);
  const b = await context.newPage(); b.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await b.goto('file://' + CONF); await b.waitForTimeout(1200);
  const X = await a.evaluate(() => curId);
  ok(await b.evaluate(X => curId === X, X) && (await text(b)).includes('Alpha from tab A'), 'a second tab opens on the same notebook');
  return {browser, a, b, X, errors};
}
// that, and a second notebook (a blank page) saved to Drive as its own file
async function twoInDrive(p){
  const A = await lectureInDrive(p, 'Lecture A start');
  await p.click('#newDocBtn'); await p.waitForTimeout(400); await p.keyboard.type('Notebook B words'); await p.waitForTimeout(900);
  await p.click('#save'); await p.click('[data-drive=notebook]');
  ok(await waitState(p, 'synced'), 'a second notebook is saved to Drive as its own file');
  return {A, B: await p.evaluate(() => curId)};
}
// a notebook in Drive that remembers the version the old way: legacy() sets it to the file's version now, elsewhere() changes the file as another device would
async function oldStyle(){
  const {browser, context, page: p, errors} = await open(CONF);
  const {drive} = await clouds(context); await p.waitForTimeout(800);
  await lectureInDrive(p, 'Lecture start');
  await p.waitForTimeout(600);           // (Drive's own version bump after the upload)
  const f = drive.files.nb1;
  const legacy = () => p.evaluate(v => { curDoc().driveVer = v; putAll({docs}); }, String(f.version));
  const elsewhere = (from, to) => { f.body = f.body.replace(from, to); f.rev++; f.version++; };
  return {browser, p, f, legacy, elsewhere, errors};
}
const toDoc = (page, id) => page.click(`#docList [data-doc="${id}"]`);

const PARTS = {
  // ---- 1. two tabs on the same notebook ----
  async tabs(){
    const {browser, a, b, X, errors} = await twoTabs();
    const stored = () => a.evaluate(async X => await get('doc:' + X), X);
    // one tab saves, then the other: the second takes the newer copy before it saves, so it doesn't write over the first
    await a.bringToFront(); await a.keyboard.type(' and more from A'); await a.waitForTimeout(900);
    await b.bringToFront(); await b.waitForTimeout(300); await b.click('.mine'); await b.keyboard.press('End'); await b.keyboard.type(' Beta from B'); await b.waitForTimeout(900);
    const s1 = await stored();
    ok(s1.includes('and more from A') && s1.includes('Beta from B'), 'tab B’s save keeps the words tab A saved (it doesn’t write over them)');
    ok((await text(b)).includes('and more from A'), 'tab B showed tab A’s words before it saved');
    ok(await until(a, () => document.querySelector('main').innerText.includes('Beta from B'), null, 4000), 'and tab A shows tab B’s words');
    ok(await a.evaluate(() => !document.querySelector('#undoBtn').disabled), 'Back can still bring back what tab A had');
    // both tabs change it before either has saved (each one's save is held back here): neither tab's words are written over
    const hold = (p, on) => p.evaluate(on => { if (on) { window.__save = saveNow; saveNow = () => { timer = setTimeout(saveNow, 300); }; } else saveNow = window.__save; }, on);
    await hold(a, 1); await hold(b, 1);
    await a.bringToFront(); await a.click('.mine'); await a.keyboard.press('End'); await a.keyboard.type(' A racing');
    await b.bringToFront(); await b.click('.mine'); await b.keyboard.press('End'); await b.keyboard.type(' B racing');
    await hold(a, 0); await a.waitForTimeout(1200); await hold(b, 0); await a.waitForTimeout(1500);
    const all = await a.evaluate(async () => { const list = await get('docs'); return Promise.all(list.filter(d => !d.trashed).map(async d => ({id: d.id, name: d.name, html: (await get('doc:' + d.id)) || ''}))); });
    ok(all.some(d => d.html.includes('A racing')) && all.some(d => d.html.includes('B racing')), 'changed in both tabs at once: every word is still saved');
    ok(all.length === 2 && all.find(d => d.id === X).html.includes('A racing'), 'the notebook keeps the words saved first; the other tab’s go into a copy');
    ok(/another tab/.test(await b.textContent('#toast')) && await b.evaluate(X => curId !== X && (document.querySelector('main').innerText.includes('B racing')), X), 'that tab says so, and carries on in the copy with what is on its screen');
    ok(await until(a, n => document.querySelectorAll('#docList .nb').length === n, all.length, 4000), 'the other tab’s sidebar lists the copy too');
    // left alone, the two tabs don't keep writing to each other
    await a.waitForTimeout(1500);
    const count = p => p.evaluate(() => { window.__puts = 0; const was = putAll; putAll = (...x) => { window.__puts++; return was(...x); }; });
    await count(a); await count(b); await a.waitForTimeout(3000);
    ok(await a.evaluate(() => __puts) === 0 && await b.evaluate(() => __puts) === 0, 'two tabs left alone write nothing');
    await browser.close();
    return errors;
  },
  // ---- 1b. two tabs: the list of notebooks ----
  async tablist(){
    const {browser, a, b, errors} = await twoTabs();
    // a notebook made in one tab is not lost when the other saves
    await a.bringToFront(); await a.click('#newDocBtn'); await a.waitForTimeout(400); await a.keyboard.type('Gamma notebook from A'); await a.waitForTimeout(900);
    const G = await a.evaluate(() => curId);
    await b.bringToFront(); await b.click('.mine'); await b.keyboard.press('End'); await b.keyboard.type(' and B goes on'); await b.waitForTimeout(900);
    const list = await a.evaluate(async () => (await get('docs')).map(d => d.id));
    ok(list.includes(G) && (await a.evaluate(async G => await get('doc:' + G), G) || '').includes('Gamma notebook from A'), 'a notebook made in tab A stays in the list after tab B saves');
    ok(await b.evaluate(G => docs.some(d => d.id === G) && !!document.querySelector(`#docList [data-doc="${G}"]`), G), 'and tab B’s sidebar shows it');
    await b.reload(); await b.waitForTimeout(1200);
    ok(await b.evaluate(n => docs.filter(d => !d.trashed).length === n, list.length) && list.length === 2, 'after a reload, both notebooks are still there');
    await browser.close();
    return errors;
  },

  // ---- 2. switching notebooks before a change has gone to the cloud ----
  async switch(){
    const {browser, context, page: p, errors} = await open(CONF);
    const {drive, one} = await clouds(context); await p.waitForTimeout(800);
    const {A, B} = await twoInDrive(p);
    await toDoc(p, A); await p.waitForTimeout(1200);
    await addNote(p, 'Warm-up in notebook A'); await p.waitForTimeout(900);
    await waitState(p, 'synced');
    const patches = () => Object.fromEntries(Object.values(drive.files).map(f => [f.id, f.patches || 0]));
    const before = patches();
    await addNote(p, 'Written just before switching');
    ok(await waitState(p, 'waiting', 3000) && !drive.files.nb1.body.includes('Written just before switching'), 'a change in notebook A is waiting to go to Drive');
    await toDoc(p, B);
    ok(await until(p, B => curId === B, B, 3000), 'switched to notebook B before it went');
    ok(await poll(() => drive.files.nb1.body.includes('Written just before switching')), 'notebook A’s change still goes to Drive after switching away');
    ok(!drive.files.nb2.body.includes('Written just before switching') && (patches().nb2 || 0) === (before.nb2 || 0), 'to its own file, not notebook B’s');
    ok(await p.evaluate(A => !docs.find(d => d.id === A).driveDirty, A) && await p.evaluate(async A => !(await get('docs')).find(d => d.id === A).driveDirty, A), 'and it is marked as in sync');
    await p.waitForTimeout(6000);
    ok(patches().nb1 === before.nb1 + 1 && await state(p) === 'synced', 'once, and notebook B stays in sync');
    await toDoc(p, A); await p.waitForTimeout(1500);
    ok(await state(p) === 'synced' && (await text(p)).includes('Written just before switching'), 'back in notebook A: in sync, with the change');

    // the same with OneDrive
    await p.click('#newDocBtn'); await p.waitForTimeout(400); await p.keyboard.type('Notebook C words'); await p.waitForTimeout(900);
    await p.hover('#save'); await p.click('#save'); await p.click('[data-od=save]');
    ok(await waitState(p, 'synced'), 'a third notebook is saved to OneDrive');
    const C = await p.evaluate(() => curId), it = await p.evaluate(() => curDoc().odNb);
    await p.click('.mine'); await p.keyboard.press('End'); await p.keyboard.type(' and C before leaving'); await p.waitForTimeout(800);
    ok(await waitState(p, 'waiting', 3000), 'a change in the OneDrive notebook is waiting to go');
    await toDoc(p, A);
    ok(await poll(() => one.files[it].body.includes('and C before leaving')) && !drive.files.nb1.body.includes('and C before leaving'), 'a OneDrive notebook’s change still goes to its own file after switching away');
    ok(await p.evaluate(C => !docs.find(d => d.id === C).driveDirty, C), 'and it is marked as in sync');
    await browser.close();
    return errors;
  },

  // ---- 2b. the first change after opening a notebook goes up too (opening it alone sends nothing) ----
  async opened(){
    const {browser, context, page: p, errors} = await open(CONF);
    const {drive} = await clouds(context); await p.waitForTimeout(800);
    const {A, B} = await twoInDrive(p);
    const n1 = drive.files.nb1.patches || 0, n2 = drive.files.nb2.patches || 0;
    await toDoc(p, A); await p.waitForTimeout(1200); await toDoc(p, B); await p.waitForTimeout(1200); await toDoc(p, A); await p.waitForTimeout(7000);
    ok((drive.files.nb1.patches || 0) === n1 && (drive.files.nb2.patches || 0) === n2 && await state(p) === 'synced', 'switching between notebooks in Drive sends nothing by itself');
    await addNote(p, 'First change after opening A');
    ok(await waitState(p, 'waiting', 3000), 'the first change after opening a notebook is waiting to go to Drive');
    ok(await poll(() => drive.files.nb1.body.includes('First change after opening A')) && await waitState(p, 'synced'), 'and it goes up');
    await browser.close();
    return errors;
  },

  // ---- 3. a notebook synced to Drive by an older version of the app (it remembers Drive's plain version number) ----
  async legacy(){
    const {browser, p, f, legacy, elsewhere, errors} = await oldStyle();
    // nothing changed here: the change made on another device comes in
    await legacy();
    elsewhere('Lecture start', 'Changed on another device');
    await p.evaluate(() => { sync.checked = 0; document.dispatchEvent(new Event('visibilitychange')); });
    ok(await until(p, () => document.querySelector('main').innerText.includes('Changed on another device'), null, 10000), 'old-style version, changed in Drive: the change is fetched');
    ok(await until(p, () => /^r:/.test(curDoc().driveVer) && document.querySelector('#driveSync').dataset.s === 'synced', null, 5000), 'and the version is remembered the new way from then on');
    await browser.close();
    return errors;
  },
  async legacyedit(){
    const {browser, p, f, legacy, elsewhere, errors} = await oldStyle();
    // changed here too: it is not written over, the usual "Changed in two places" asks which to keep
    await legacy();
    elsewhere('Lecture start', 'Changed on another device');
    await p.evaluate(() => { sync.checked = Date.now(); });
    await addNote(p, 'Written here on the old version');
    ok(await waitState(p, 'changed', 15000), 'old-style version, changed in both places: it says “Changed in two places”');
    ok(f.body.includes('Changed on another device') && !f.body.includes('Written here on the old version'), 'and the copy in Drive is not written over');
    await p.click('#driveSync'); await p.click('.syncpop [data-k=both]');
    ok(await until(p, () => document.querySelector('main').innerText.includes('Changed on another device'), null, 15000) && await waitState(p, 'synced'), 'Keep both takes Drive’s version…');
    ok(await p.evaluate(async () => { const c = docs.find(d => d.id !== curId && !d.trashed); return (await get('doc:' + c.id)).includes('Written here on the old version'); }), '…and keeps this one as a copy');
    // unchanged in Drive: it just syncs, with no false alarm
    await p.waitForTimeout(600); await legacy();
    const n = f.rev;
    await addNote(p, 'Old version, nothing changed in Drive');
    ok(await poll(() => f.body.includes('Old version, nothing changed in Drive')) && await waitState(p, 'synced') && f.rev === n + 1, 'old-style version, unchanged in Drive: the change goes up as usual');
    ok(await p.evaluate(() => /^r:/.test(curDoc().driveVer)), 'and the version is remembered the new way');
    await browser.close();
    return errors;
  },
};

(async () => {
  const pick = process.argv.slice(2).filter(a => PARTS[a]), errs = [], fails = [];
  for (const k of pick.length ? pick : Object.keys(PARTS)) {
    try { errs.push(...await PARTS[k]()); }
    catch (e) { fails.push(e.message); console.log(e.message.startsWith('FAILED') ? e.message : 'FAILED: ' + k + ': ' + e.message); }
  }
  const real = errs.filter(e => !/ERR_FAILED|net::|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
  console.log(real.length ? 'ERRORS:\n' + real.join('\n') : 'no page errors');
  process.exit(fails.length || real.length ? 1 : 0);
})();

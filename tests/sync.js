// Start on a laptop, carry on on an iPad: notebooks keep in sync through (a fake) Google Drive shared by two browsers
const {open} = require('./harness');
const {GSI, GAPI} = require('./drivemock');
const path = require('path'); const fs = require('fs');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const src = fs.readFileSync(APP, 'utf8');
const CONF = path.join(__dirname, 'index.sync.html');
fs.writeFileSync(CONF, src.replace(/const GDRIVE = \{[^}]*\};/, () => "const GDRIVE = {clientId: '123456789-abc.apps.googleusercontent.com', apiKey: 'KEY123'};"));
const CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'};

const drive = {files: {}, n: 0, log: []};          // the one Google Drive both devices use
async function device(name, size){
  const d = await open(CONF, size);
  const {context} = d;
  const json = (r, b, status = 200) => r.fulfill({status, contentType: 'application/json', headers: CORS, body: JSON.stringify(b)});
  await context.route(/accounts\.google\.com\/gsi\/client/, r => r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: GSI}));
  await context.route(/apis\.google\.com\/js\/api\.js/, r => r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: GAPI}));
  await context.route(/www\.googleapis\.com\//, async route => {
    const rq = route.request(), url = rq.url(), method = rq.method();
    if (method === 'OPTIONS') return route.fulfill({status: 204, headers: CORS});
    drive.log.push(`${name} ${method} ${url.replace(/https:\/\/www\.googleapis\.com/, '').slice(0, 90)}`);
    let m;
    if (/\/drive\/v3\/about/.test(url)) return json(route, {user: {displayName: 'Ada', emailAddress: 'ada@example.com'}});
    const upload = () => { const ct = rq.headers()['content-type'], edge = ct.split('boundary=')[1], raw = rq.postDataBuffer().toString('utf8'); const parts = raw.split('--' + edge); const meta = JSON.parse(parts[1].split('\r\n\r\n')[1].trim()); const body = parts[2].slice(parts[2].indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''); return {meta, body}; };
    if (/\/upload\/drive\/v3\/files\?/.test(url) && method === 'POST') {
      const {meta, body} = upload(); const id = 'nb' + (++drive.n);
      drive.files[id] = {id, name: meta.name, body, version: 1, modifiedTime: new Date().toISOString()};
      return json(route, {id, name: meta.name, parents: ['root'], version: '1'});
    }
    if ((m = url.match(/\/upload\/drive\/v3\/files\/([^/?]+)\?/)) && method === 'PATCH') {
      const f = drive.files[m[1]]; if (!f) return json(route, {error: {message: 'File not found'}}, 404);
      f.body = upload().body; f.version++; f.modifiedTime = new Date().toISOString(); f.by = name;
      return json(route, {id: f.id, name: f.name, parents: ['root'], version: String(f.version)});
    }
    if ((m = url.match(/\/drive\/v3\/files\/([^/?]+)\?alt=media/))) return route.fulfill({status: 200, contentType: 'text/html', headers: CORS, body: drive.files[m[1]].body});
    if ((m = url.match(/\/drive\/v3\/files\/([^/?]+)\?fields=/))) {
      const f = drive.files[m[1]]; if (!f) return json(route, {error: {message: 'File not found'}}, 404);
      return json(route, {version: String(f.version), trashed: !!f.trashed, parents: ['root'], capabilities: {canEdit: true}});
    }
    if (/\/drive\/v3\/files\?q=/.test(url)) return json(route, {files: Object.values(drive.files).filter(f => !f.trashed).map(f => ({id: f.id, name: f.name, modifiedTime: f.modifiedTime}))});
    return json(route, {error: {message: 'unexpected ' + url}}, 400);
  });
  await d.page.waitForTimeout(800);
  return d;
}
const state = p => p.evaluate(() => { const b = document.querySelector('#driveSync'); return b.hidden ? '' : b.dataset.s; });
const waitState = (p, s, ms = 15000) => p.waitForFunction(s => { const b = document.querySelector('#driveSync'); return !b.hidden && b.dataset.s === s; }, s, {timeout: ms});
const text = p => p.evaluate(() => document.querySelector('main').innerText);
const patches = who => drive.log.filter(l => l.startsWith(who + ' PATCH')).length;
let nth = 0;
async function addNote(page, words){
  const strip = page.locator('.pagecard').nth(nth++ % 6).locator('.strip').last(); await strip.scrollIntoViewIfNeeded();
  const b = await strip.boundingBox(); await page.mouse.move(b.x + b.width * 0.62, b.y + b.height / 2, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.keyboard.type(words); await page.waitForTimeout(100); await page.mouse.click(5, 700);
}

(async () => {
  const L = await device('laptop'), lp = L.page;
  // ---- the laptop: open slides, write, save to Drive once ----
  await lp.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await lp.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  await addNote(lp, 'Started on the laptop'); await lp.waitForTimeout(800);
  ok(await state(lp) === '', 'a notebook that is not in Drive shows no sync status');
  await lp.click('#save'); await lp.click('[data-drive=notebook]');
  await waitState(lp, 'synced');
  ok(Object.keys(drive.files).length === 1 && drive.files.nb1.body.includes('Started on the laptop'), 'Notebook to Drive saves it once…');
  ok(/keeps in sync/.test(await lp.textContent('#toast')), '…and says it keeps in sync from now on');
  // more writing goes up by itself, once, a few seconds after stopping
  await addNote(lp, 'More from the laptop');
  await waitState(lp, 'waiting', 3000);
  ok(patches('laptop') === 0, 'not straight away while you are still writing');
  await waitState(lp, 'synced', 15000);
  ok(patches('laptop') === 1 && drive.files.nb1.body.includes('More from the laptop') && drive.files.nb1.version === 2, 'a few seconds later the change is in Drive, in one upload');
  await lp.waitForTimeout(7000);
  ok(patches('laptop') === 1, 'nothing changed, nothing uploaded');
  await lp.screenshot({path: path.join(__dirname, 'shots', 'sync-1-laptop.png'), clip: {x: 0, y: 0, width: 900, height: 60}});

  // ---- the iPad: carry on from another device ----
  const I = await device('ipad', {width: 1024, height: 1366}), ip = I.page;
  await ip.click('.welcome [data-drive-nbs]');
  await ip.waitForSelector('.nbsrow', {timeout: 10000});
  ok((await ip.textContent('.nbslist')).includes('lecture'), 'the iPad lists the notebooks in your Drive');
  await ip.screenshot({path: path.join(__dirname, 'shots', 'sync-2-ipad-list.png')});
  await ip.click('.nbsrow');
  await ip.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 30000});
  await ip.waitForTimeout(800);
  ok((await text(ip)).includes('More from the laptop'), 'picking it opens it with everything written on the laptop');
  ok(await state(ip) === 'synced', 'and it is in sync');
  await addNote(ip, 'Carried on on the iPad');
  await ip.waitForFunction(() => ['waiting', 'syncing'].includes(document.querySelector('#driveSync').dataset.s), null, {timeout: 5000});
  await waitState(ip, 'synced', 15000); await ip.waitForTimeout(300);
  ok(patches('ipad') === 1 && drive.files.nb1.version === 3 && drive.files.nb1.body.includes('Carried on on the iPad'), 'the iPad’s writing goes to Drive by itself');
  // picking it again doesn't make a second copy
  await ip.click('#sideDriveNbs').catch(async () => { await ip.evaluate(() => driveNotebooks()); });
  await ip.waitForSelector('.nbsrow'); ok(/On this device/.test(await ip.textContent('.nbsrow')), 'the list says which notebooks are already on this device');
  await ip.click('.nbsrow'); await ip.waitForTimeout(800);
  ok(await ip.evaluate(() => docs.filter(d => !d.trashed).length) === 1, 'picking it again opens the same notebook, not a second copy');

  // ---- back on the laptop: it picks up the iPad's changes ----
  const before = patches('laptop');
  await lp.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await lp.waitForFunction(() => document.querySelector('main').innerText.includes('Carried on on the iPad'), null, {timeout: 15000});
  ok(true, 'coming back to the laptop, the iPad’s changes appear');
  ok(await lp.waitForFunction(() => /latest changes from Google Drive/.test(document.querySelector('#toast').textContent), null, {timeout: 5000}).then(() => true, () => false), 'with a short note saying so');
  await lp.waitForTimeout(7500);
  ok(patches('laptop') === before && await state(lp) === 'synced', 'fetching changes does not send them straight back (no ping-pong)');
  // Back undoes the fetch
  ok(await lp.evaluate(() => !document.querySelector('#undoBtn').disabled), 'Back can still bring the earlier version back');

  // ---- both changed: choose ----
  await addNote(ip, 'iPad edit at the same time');
  await ip.waitForFunction(() => ['waiting', 'syncing'].includes(document.querySelector('#driveSync').dataset.s), null, {timeout: 5000});
  await waitState(ip, 'synced', 15000);
  await lp.evaluate(() => { sync.checked = Date.now(); });
  await addNote(lp, 'Laptop edit at the same time');
  await waitState(lp, 'changed', 15000);
  ok(drive.files.nb1.body.includes('iPad edit at the same time') && !drive.files.nb1.body.includes('Laptop edit at the same time'), 'changed in two places: nothing is written over');
  await lp.click('#driveSync'); await lp.waitForSelector('.syncpop:not([hidden])');
  await lp.screenshot({path: path.join(__dirname, 'shots', 'sync-3-choose.png'), clip: {x: 0, y: 0, width: 900, height: 320}});
  await lp.click('.syncpop [data-k=both]');
  await lp.waitForFunction(() => document.querySelector('main').innerText.includes('iPad edit at the same time'), null, {timeout: 15000}); await lp.waitForTimeout(800);
  const both = await lp.evaluate(() => docs.filter(d => !d.trashed).length);
  ok(both === 2, 'Keep both: this version becomes a separate notebook…');
  ok(!(await text(lp)).includes('Laptop edit at the same time') && await state(lp) === 'synced', '…and this one has Drive’s version, in sync again');
  ok(await lp.evaluate(async () => { const c = docs.find(d => d.id !== curId && !d.trashed); return !c.driveNb && (await get('doc:' + c.id)).includes('Laptop edit at the same time'); }), 'the kept copy has the laptop edit and is not tied to the Drive file');

  // ---- offline, and sign-in running out ----
  await I.context.setOffline(true); await ip.evaluate(() => dispatchEvent(new Event('offline')));
  await addNote(ip, 'Written offline');
  await waitState(ip, 'offline', 5000);
  ok(true, 'offline: it says it syncs when online');
  await I.context.setOffline(false); await ip.evaluate(() => dispatchEvent(new Event('online')));
  await ip.waitForFunction(() => window.__nb1 || true); await ip.waitForTimeout(500); await waitState(ip, 'synced', 15000);
  ok(drive.files.nb1.body.includes('Written offline'), 'back online, it syncs by itself');
  await ip.evaluate(() => { drive.expires = 0; });
  await addNote(ip, 'After sign-in ran out');
  await waitState(ip, 'signin', 8000);
  ok(!drive.files.nb1.body.includes('After sign-in ran out'), 'sign-in ran out: it waits instead of opening a pop-up');
  await ip.click('#driveSync'); await ip.waitForTimeout(500); await waitState(ip, 'synced', 15000);
  ok(drive.files.nb1.body.includes('After sign-in ran out'), 'a click signs in again and syncs');
  // deleted in Drive
  drive.files.nb1.trashed = true;
  await ip.evaluate(() => { sync.checked = 0; document.dispatchEvent(new Event('visibilitychange')); });
  await waitState(ip, 'gone', 10000);
  ok(true, 'a notebook moved to the bin in Drive says so, and nothing more is sent');

  for (const d of [L, I]) await d.browser.close();
  const errs = [...L.errors, ...I.errors].filter(e => !/ERR_FAILED|net::|ERR_INTERNET_DISCONNECTED/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); console.error(drive.log.slice(-12).join('\n')); process.exit(1); });

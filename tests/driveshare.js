// Google Drive sharing: Picker tabs, Share dialog, general access, copy link, read-only shared notebooks. Google is mocked.
const {open} = require('./harness');
const {GSI, GAPI} = require('./drivemock');
const path = require('path');
const fs = require('fs');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };

const src = fs.readFileSync(APP, 'utf8');
const LINE = /const GDRIVE = \{[^}]*\};/;          // whatever the site has filled in, the test uses its own
if (!LINE.test(src)) throw new Error('FAILED: GDRIVE config line not found');
const CONF = path.join(__dirname, 'index.drive.html');
fs.writeFileSync(CONF, src.replace(LINE, () => "const GDRIVE = {clientId: '123456789-abc.apps.googleusercontent.com', apiKey: 'KEY123'};"));
const PDF = fs.readFileSync(path.join(__dirname, 'lecture.pdf'));
const NB = fs.readFileSync(path.join(__dirname, 'nbfile.html'));

(async () => {
  const {browser, context, page, errors} = await open(CONF);
  const reqs = [];
  const files = {};          // id -> permissions
  const st = {n: 0, p: 0};
  const CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'};
  const json = (route, body, status = 200) => route.fulfill({status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body)});
  await context.route(/accounts\.google\.com\/gsi\/client/, r => r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: GSI}));
  await context.route(/apis\.google\.com\/js\/api\.js/, r => r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: GAPI}));
  await context.route(/www\.googleapis\.com\//, async route => {
    const rq = route.request(), url = rq.url(), method = rq.method();
    if (method === 'OPTIONS') return route.fulfill({status: 204, headers: CORS});
    const rec = {method, url, body: rq.postDataBuffer() ? rq.postDataBuffer().toString('latin1') : ''};
    reqs.push(rec);
    if (/\/drive\/v3\/about/.test(url)) return json(route, {user: {displayName: 'Ada Lovelace', emailAddress: 'ada@example.com'}});
    let m;
    if ((m = url.match(/\/drive\/v3\/files\/([^/?]+)\?fields=capabilities/))) return json(route, {capabilities: {canEdit: m[1] !== 'nbro'}});
    if ((m = url.match(/\/drive\/v3\/files\/([^/?]+)\?fields=parents/))) return json(route, {parents: [m[1] === 'f1' ? 'folderA' : 'sharedFolder']});
    if (/\/drive\/v3\/files\/f1\?alt=media/.test(url)) return route.fulfill({status: 200, contentType: 'application/pdf', headers: CORS, body: PDF});
    if (/\/drive\/v3\/files\/nbro\?alt=media/.test(url)) return route.fulfill({status: 200, contentType: 'text/html', headers: CORS, body: NB});
    if (/\/upload\/drive\/v3\/files(\?|$)/.test(url) && method === 'POST') {
      const meta = JSON.parse(rec.body.split('\r\n\r\n')[1].split('\r\n--')[0]); rec.meta = meta;
      const id = 'new' + (++st.n);
      files[id] = [{id: 'own' + id, emailAddress: 'ada@example.com', displayName: 'Ada Lovelace', role: 'owner', type: 'user'}];
      return json(route, {id, name: meta.name, parents: meta.parents || ['root']});
    }
    if ((m = url.match(/\/upload\/drive\/v3\/files\/([^/?]+)\?/)) && method === 'PATCH') {
      rec.meta = JSON.parse(rec.body.split('\r\n\r\n')[1].split('\r\n--')[0]);
      return json(route, {id: m[1], name: 'kept name'});
    }
    if ((m = url.match(/\/drive\/v3\/files\/([^/?]+)\/permissions\/([^/?]+)/))) {            // one permission
      const list = files[m[1]] || [];
      if (method === 'DELETE') { const i = list.findIndex(p => p.id === m[2]); if (i >= 0) list.splice(i, 1); return route.fulfill({status: 204, headers: CORS}); }
      if (method === 'PATCH') { const p = list.find(x => x.id === m[2]); Object.assign(p, JSON.parse(rec.body)); return json(route, p); }
    }
    if ((m = url.match(/\/drive\/v3\/files\/([^/?]+)\/permissions/))) {
      const list = files[m[1]] || [];
      if (method === 'POST') {
        const b = JSON.parse(rec.body); rec.perm = b;
        if (/blocked\.org$/.test(b.emailAddress || '')) return json(route, {error: {code: 403, message: 'Sharing outside example.com is not allowed by your administrator.'}}, 403);
        const p = {...b, id: b.type === 'anyone' ? 'anyoneWithLink' : 'p' + (++st.p), displayName: (b.emailAddress || '').split('@')[0]};
        list.push(p); return json(route, p);
      }
      return json(route, {permissions: list});
    }
    if ((m = url.match(/\/drive\/v3\/files\/([^/?]+)\?fields=webViewLink/))) return json(route, {webViewLink: `https://drive.google.com/file/d/${m[1]}/view?usp=drivesdk`});
    return json(route, {error: {code: 400, message: 'unexpected ' + url}}, 400);
  });

  const waitToast = (re, ms = 20000) => page.waitForFunction(s => new RegExp(s).test(document.querySelector('#toast').textContent), re.source, {timeout: ms});
  const say = () => page.textContent('#shSay');
  const waitSay = (re, ms = 15000) => page.waitForFunction(s => new RegExp(s).test(document.querySelector('#shSay').textContent), re.source, {timeout: ms});
  const idle = () => page.waitForFunction(() => !document.querySelector('.sharebox').classList.contains('busy'), null, {timeout: 15000});
  const perms = () => reqs.filter(r => /\/permissions/.test(r.url));
  const docsNow = () => page.evaluate(() => docs.map(d => ({name: d.name, driveFolder: d.driveFolder, driveNb: d.driveNb, driveNbRO: d.driveNbRO})));
  await page.waitForTimeout(2000);          // let start-up finish (it redraws the welcome screen once)

  // ---- the Picker's tabs ----
  await page.hover('.welcome [data-drive-open]');
  await page.waitForFunction(() => window.google && window.google.picker, null, {timeout: 5000});
  await page.click('.welcome [data-drive-open]');
  await page.waitForFunction(() => window.__lastViews, null, {timeout: 10000});
  const views = await page.evaluate(() => window.__lastViews);
  ok(views.map(v => v.label).join('|') === 'My Drive|Shared with me|Recent|Starred', 'the picker has tabs: ' + views.map(v => v.label).join(', '));
  ok(views[0].id === 'docs' && views[0].drives === true && views[0].folders === true && views[0].selFolder === false, 'My Drive: folders to browse, Shared drives on');
  ok(views[1].owned === false, 'Shared with me: files not owned by you');
  ok(views[2].id === 'recent', 'Recent: the recently picked view');
  ok(views[3].starred === true, 'Starred: starred files');
  ok(views.every(v => /application\/pdf/.test(v.mime) && /text\/html/.test(v.mime) && /vnd\.google-apps\.presentation/.test(v.mime)), 'every tab has the same file-type filter');
  ok((await page.evaluate(() => window.__pickerLog.join(' '))).includes('feature drives'), 'the Shared drives feature is on');

  await page.waitForTimeout(1000);
  // ---- open a PDF, then Share… from the Download menu ----
  await page.evaluate(() => { window.__picked = {action: 'picked', docs: [{id: 'f1', name: 'Lecture 1.pdf', mimeType: 'application/pdf'}]}; });
  await page.click('.welcome [data-drive-open]');
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6 && docs.some(d => d.driveFolder === 'folderA'), null, {timeout: 60000});
  await page.waitForTimeout(600);
  ok(reqs.some(r => /files\/f1\?alt=media&supportsAllDrives=true/.test(r.url)), 'downloads ask for Shared drive files too (supportsAllDrives)');
  await page.click('#save');
  ok(await page.isVisible('#saveMenu [data-drive="share"]'), 'the Download menu has Share… in its Google Drive section');
  await page.click('#saveMenu [data-drive="share"]');
  await page.waitForSelector('.sharebox:not([hidden])', {timeout: 30000});
  await page.waitForSelector('#shPeople li', {timeout: 10000});
  await idle();
  const firstPerm = reqs.findIndex(r => /\/permissions/.test(r.url)), firstUp = reqs.findIndex(r => /\/upload\//.test(r.url));
  ok(firstUp >= 0 && firstPerm > firstUp && reqs[firstUp].method === 'POST' && /\(notes\)\.html$/.test(reqs[firstUp].meta.name), 'Share saves the notebook to Drive first, then lists who has access');
  ok(/fields=permissions\(id,emailAddress,displayName,role,type/.test(decodeURIComponent(reqs[firstPerm].url)) && /supportsAllDrives=true/.test(reqs[firstPerm].url), 'the access list is asked for with the right fields');
  ok(await page.evaluate(() => document.activeElement.id) === 'shEmails', 'the dialog puts focus in the email box');
  ok(/Open › From Google Drive/.test(await page.textContent('#shHow')), 'the dialog explains how people open the notebook file');
  ok((await page.textContent('#shPeople')).includes('Ada Lovelace') && (await page.textContent('#shPeople')).includes('Owner') && (await page.locator('#shPeople .x').count()) === 0, 'the owner is listed, with no remove button');
  ok(await page.inputValue('#shLink') === 'https://drive.google.com/file/d/new1/view?usp=drivesdk', 'the link is the file\'s webViewLink');

  // ---- focus trap ----
  let inside = true;
  for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); inside = inside && await page.evaluate(() => !!document.activeElement.closest('.sharebox')); }
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Tab'); inside = inside && await page.evaluate(() => !!document.activeElement.closest('.sharebox')); }
  ok(inside, 'Tab and Shift+Tab stay inside the dialog');

  // ---- add two people as Commenter ----
  await page.fill('#shEmails', 'bob@example.com, cy@example.com');
  await page.selectOption('#shRole', 'commenter');
  await page.fill('#shMsg', 'Here are my notes');
  await page.click('#shAdd');
  await waitSay(/Shared with bob@example\.com, cy@example\.com/);
  await idle();
  const posts = perms().filter(r => r.method === 'POST');
  ok(posts.length === 2, 'two permission POSTs: ' + posts.length);
  ok(posts.every(r => r.perm.type === 'user' && r.perm.role === 'commenter') && posts[0].perm.emailAddress === 'bob@example.com' && posts[1].perm.emailAddress === 'cy@example.com', 'bodies: type user, role commenter, each email');
  ok(posts.every(r => /files\/new1\/permissions\?/.test(r.url) && /supportsAllDrives=true/.test(r.url) && /sendNotificationEmail=true/.test(r.url) && /emailMessage=Here%20are%20my%20notes/.test(r.url)), 'query: supportsAllDrives, notify and the message');
  ok((await page.locator('#shPeople li').count()) === 3 && (await page.locator('#shPeople .x').count()) === 2, 'three people listed, a remove button for the two added');
  ok((await page.textContent('#shPeople')).includes('Commenter'), 'their role shows as Commenter');

  // ---- remove one ----
  await page.click('#shPeople [aria-label="Remove bob@example.com"]');
  await waitSay(/Removed bob@example\.com/);
  await idle();
  const del = perms().filter(r => r.method === 'DELETE');
  ok(del.length === 1 && /files\/new1\/permissions\/p1\?/.test(del[0].url), 'removing sends one DELETE for that permission');
  ok((await page.locator('#shPeople li').count()) === 2 && !(await page.textContent('#shPeople')).includes('bob@'), 'the list updates');

  // ---- general access ----
  await page.selectOption('#shGeneral', 'reader');
  await waitSay(/can now view it/); await idle();
  let last = perms().filter(r => r.method === 'POST').pop();
  ok(last.perm.type === 'anyone' && last.perm.role === 'reader', 'Anyone with the link (Viewer) creates the anyone permission');
  ok(await page.inputValue('#shGeneral') === 'reader' && /without signing in/.test(await page.textContent('#shGenNote')), 'the dialog shows the link is open');
  await page.selectOption('#shGeneral', 'commenter');
  await waitSay(/comment on it/); await idle();
  const patch = perms().filter(r => r.method === 'PATCH').pop();
  ok(patch && /permissions\/anyoneWithLink/.test(patch.url) && JSON.parse(patch.body).role === 'commenter', 'changing Viewer to Commenter updates the same permission');
  const delsBefore = perms().filter(r => r.method === 'DELETE').length;
  await page.selectOption('#shGeneral', 'none');
  await waitSay(/only the people listed/); await idle();
  const dels = perms().filter(r => r.method === 'DELETE');
  ok(dels.length === delsBefore + 1 && /permissions\/anyoneWithLink/.test(dels.pop().url), 'Restricted deletes the anyone permission');
  ok(await page.inputValue('#shGeneral') === 'none', 'the dialog is back to Restricted');

  // ---- copy link, open in Drive ----
  await page.evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async t => { window.__copied = t; }}}); });
  await page.click('#shCopy');
  await page.waitForFunction(() => document.querySelector('#shCopy').textContent.includes('Copied'));
  ok(await page.evaluate(() => window.__copied) === 'https://drive.google.com/file/d/new1/view?usp=drivesdk', 'Copy link copies the webViewLink and says Copied');
  ok(await page.getAttribute('#shOpen', 'href') === 'https://drive.google.com/file/d/new1/view?usp=drivesdk' && await page.getAttribute('#shOpen', 'target') === '_blank', 'Open in Drive points at the link in a new tab');

  // ---- invalid email: nothing is sent ----
  const before = reqs.length;
  await page.fill('#shEmails', 'not-an-email, dee@example.com');
  await page.click('#shAdd');
  ok(/“not-an-email” doesn’t look like an email address/.test(await say()) && /Nothing was shared/.test(await say()), 'an invalid email is explained: ' + await say());
  ok(reqs.length === before, 'and nothing is sent');
  await page.fill('#shEmails', '');
  await page.click('#shAdd');
  ok(/Type an email address first/.test(await say()) && reqs.length === before, 'an empty box asks for an address, sends nothing');

  // ---- Drive refuses: calm message with Drive's reason ----
  await page.fill('#shEmails', 'eve@blocked.org');
  await page.click('#shAdd');
  await waitSay(/Sharing outside example\.com is not allowed/);
  await idle();
  ok(/Couldn’t share with eve@blocked\.org\. Google Drive said: Sharing outside/.test(await say()), 'a Drive refusal is shown calmly: ' + await say());
  ok(await page.inputValue('#shEmails') === 'eve@blocked.org', 'the address stays in the box so it can be changed');

  // ---- Esc closes, focus goes back ----
  await page.keyboard.press('Escape');
  ok(await page.isHidden('.sharebox'), 'Esc closes the dialog');
  ok(await page.evaluate(() => document.activeElement.id) === 'save', 'focus goes back to the Download button');
  ok(await page.evaluate(() => !!document.querySelector('.slide')), 'the notebook is untouched');

  // ---- share the PDF instead ----
  await page.click('#save'); await page.click('#saveMenu [data-drive="share"]');
  await page.waitForSelector('.sharebox:not([hidden])'); await idle();
  ok(await page.inputValue('#shLink') === 'https://drive.google.com/file/d/new1/view?usp=drivesdk', 'sharing again updates the same notebook file');
  ok(reqs.filter(r => r.method === 'PATCH' && /\/upload\//.test(r.url)).length >= 1, 'the file in Drive was updated first');
  await page.selectOption('#shWhat', 'pdf');
  await page.waitForFunction(() => /\(notes\)\.pdf/.test(document.querySelector('#shFile').textContent), null, {timeout: 60000}); await idle();
  const pdfUp = reqs.filter(r => /\/upload\//.test(r.url) && r.method === 'POST').pop();
  ok(pdfUp.meta.mimeType === 'application/pdf' && pdfUp.body.includes('%PDF-'), 'choosing PDF saves a real PDF to Drive');
  ok(/drive\.google\.com\/file\/d\/new2\//.test(await page.inputValue('#shLink')) && /open the PDF in Google Drive/.test(await page.textContent('#shHow')), 'the dialog now shares the PDF');
  await page.keyboard.press('Escape');

  // ---- the notebook's ⋯ menu ----
  const row = page.locator('#docList .nb[aria-current]');
  await row.hover(); await row.locator('.more').click();
  ok(await page.isVisible('.docmenu [data-act="share"]') && /Share via Google Drive…/.test(await page.textContent('.docmenu [data-act="share"]')), 'the ⋯ menu has "Share via Google Drive…"');
  await page.click('.docmenu [data-act="share"]');
  await page.waitForSelector('.sharebox:not([hidden])', {timeout: 30000}); await idle();
  ok(/drive\.google\.com\/file\/d\/new1\//.test(await page.inputValue('#shLink')), 'it opens the same dialog for the notebook file');
  await page.mouse.click(5, 5);
  ok(await page.isHidden('.sharebox'), 'clicking outside closes the dialog');

  // ---- a notebook shared with you to view only ----
  await page.evaluate(() => { window.__picked = {action: 'picked', docs: [{id: 'nbro', name: 'Shared notebook (notes).html', mimeType: 'text/html'}]}; });
  await page.click('#sideDrive');
  await page.waitForFunction(() => docs.some(d => d.driveNbRO === 'nbro'), null, {timeout: 30000});
  let d = (await docsNow()).find(x => x.driveNbRO === 'nbro');
  ok(d && !d.driveNb && !d.driveFolder, 'a view-only notebook is remembered as such, not as a file to save over');
  ok(reqs.some(r => /files\/nbro\?fields=capabilities\(canEdit\)/.test(decodeURIComponent(r.url))), 'the app asked whether the file can be edited');
  await waitToast(/shared with you to view only/);
  ok(true, 'a toast says it is view only');
  await page.waitForTimeout(500);
  const upsBefore = reqs.filter(r => /\/upload\//.test(r.url)).length;
  await page.click('#save'); await page.click('#saveMenu [data-drive="notebook"]');
  await waitToast(/copy was saved in your own Drive/);
  const ups = reqs.filter(r => /\/upload\//.test(r.url));
  const cp = ups[ups.length - 1];
  ok(ups.length === upsBefore + 1 && cp.method === 'POST' && /\(my copy\)\.html$/.test(cp.meta.name) && cp.meta.parents === undefined, 'Notebook to Drive saves "<name> (my copy).html" into your own Drive: ' + cp.meta.name);
  d = (await docsNow()).find(x => /^new/.test(x.driveNb || '') && x.driveNb === 'new' + st.n);
  ok(d && !d.driveNbRO && d.driveFolder === 'root', 'the notebook now points at its own copy');
  await page.click('#save'); await page.click('#saveMenu [data-drive="notebook"]');
  await page.waitForFunction(() => /kept name/.test(document.querySelector('#toast').textContent), null, {timeout: 20000});
  const again = reqs.filter(r => /\/upload\//.test(r.url)).pop();
  ok(again.method === 'PATCH' && again.url.includes('/files/new' + st.n + '?'), 'saving again updates the copy');

  const real = errors.filter(e => !/Failed to load resource|DriveError/.test(e));
  ok(real.length === 0, 'no page errors' + (real.length ? ': ' + real.join(' / ') : ''));
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e.message || e); process.exit(1); });

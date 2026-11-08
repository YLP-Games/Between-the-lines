// Settings follow your Google account: kept in settings.json in Drive's hidden app folder, and back after the browser's data is wiped. Google is mocked.
const {open} = require('./harness');
const {GSI, GAPI, appData: appDataMock} = require('./drivemock');
const path = require('path'); const fs = require('fs');
const APP = process.env.APP || path.resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const src = fs.readFileSync(APP, 'utf8');
const CONF = path.join(__dirname, 'index.prefsync.html');
fs.writeFileSync(CONF, src.replace(/const GDRIVE = \{[^}]*\};/, () => "const GDRIVE = {clientId: '123456789-abc.apps.googleusercontent.com', apiKey: 'KEY123'};"));
const CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'};

(async () => {
  const {browser, context, page, errors} = await open(CONF);
  const store = {file: null, log: []}, appData = appDataMock(store), other = [];
  await context.route(/accounts\.google\.com\/gsi\/client/, r => r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: GSI}));
  await context.route(/apis\.google\.com\/js\/api\.js/, r => r.fulfill({status: 200, contentType: 'text/javascript', headers: CORS, body: GAPI}));
  await context.route(/www\.googleapis\.com\//, route => {
    const rq = route.request(), url = rq.url();
    if (rq.method() === 'OPTIONS') return route.fulfill({status: 204, headers: CORS});
    const app = appData(route, rq); if (app) return app;
    if (/\/drive\/v3\/about/.test(url)) return route.fulfill({status: 200, contentType: 'application/json', headers: CORS, body: '{"user":{"displayName":"Ada","emailAddress":"ada@example.com"}}'});
    other.push(url);
    return route.fulfill({status: 400, contentType: 'application/json', headers: CORS, body: '{"error":{"message":"unexpected"}}'});
  });
  const cloud = () => store.file ? JSON.parse(store.file.body).prefs : {};
  const line = () => page.textContent('#prefCloudLine');
  const signIn = () => page.evaluate(() => driveToken().then(() => true));
  const waitCloud = (test, what) => (async () => { for (let i = 0; i < 100; i++) { if (store.file && test(cloud())) return; await page.waitForTimeout(100); } throw new Error('FAILED: ' + what); })();
  await page.waitForTimeout(500);

  // ---- before signing in ----
  await page.click('#helpBtn');
  ok(/Connect to Google Drive and your settings are saved there too/.test(await line()), 'settings: the line says connecting keeps your settings in Drive');
  await page.click('#setClose');

  // ---- change some settings on this device, then sign in ----
  await page.evaluate(() => {
    setTheme('dark'); addFav('#123456'); setGrammar(false); setBar('compact'); setLineClick(false);
    pref.set('side-line', '#00aa88'); pref.setJson('hl-favs', ['#abcdef']); pref.set('hl-colour', '#a5d8ff');
    pref.set('page-zoom', '1.5');                                  // (not a setting that travels: it suits one screen)
  });
  ok(await page.evaluate(() => window.__tokenRequests === undefined), 'changing settings doesn\'t sign in by itself');
  await signIn();
  ok(await page.evaluate(() => window.__lastReq.scope.includes('drive.file') && window.__lastReq.scope.includes('drive.appdata')), 'sign-in asks for drive.file and the app folder (drive.appdata)');
  await waitCloud(p => p.theme, 'settings.json is made in the app folder');
  ok(store.file.meta.name === 'settings.json' && store.file.meta.parents[0] === 'appDataFolder', 'settings.json goes in the hidden app folder');
  const c1 = cloud();
  ok(c1.theme.v === 'dark' && c1['side-line'].v === '#00aa88' && c1.grammar.v === '0' && c1['bar-mode'].v === 'compact' && JSON.parse(c1['fav-colors'].v).includes('#123456') && JSON.parse(c1['hl-favs'].v)[0] === '#abcdef' && c1['hl-colour'].v === '#a5d8ff', 'theme, favourite and highlight colours, side note line, grammar and toolbar are in it');
  ok(c1.theme.t > 0, 'each setting carries when it was changed');
  ok(!c1['page-zoom'] && !c1['pref-stamps'] && !Object.keys(c1).some(k => /drive|msal|^beside|^panel-/.test(k)), 'page zoom, panels, sign-ins and the time stamps stay out of it');
  await page.click('#helpBtn');
  await page.waitForFunction(() => document.querySelector('#prefCloudLine').textContent === 'Settings saved to your Google Drive.');
  ok(true, 'settings: "Settings saved to your Google Drive."');
  await page.click('#setClose');

  // ---- a change while signed in goes up a few seconds later ----
  const patches = store.log.filter(x => x === 'patch').length;
  await page.evaluate(() => setTips(false));
  await waitCloud(p => p.tips?.v === '0', 'a later change is sent to Drive');
  ok(store.log.filter(x => x === 'patch').length > patches, 'it updates the same settings.json (no second file)');
  ok(store.log.filter(x => x === 'create').length === 1, 'settings.json was made once');

  // ---- wipe this browser's data, reload: defaults until Drive is signed in to again ----
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForTimeout(800);
  ok(await page.evaluate(() => !document.documentElement.dataset.theme && pref.get('theme') === null), 'after wiping site data, the theme is back to System');
  await page.evaluate(() => pref.set('tooltips', '0'));             // changed here, after the copy in Drive
  const before = JSON.stringify(cloud());
  await signIn();
  await page.waitForFunction(() => /Your settings came back from your Google Drive/.test(document.querySelector('#toast').textContent), null, {timeout: 10000});
  ok(true, 'signing in again says "Your settings came back from your Google Drive."');
  const got = await page.evaluate(() => ({theme: document.documentElement.dataset.theme, themeBtn: document.querySelector('#themeModes [data-pick="dark"]').getAttribute('aria-pressed'),
    favs, hlFavs, hlCol, grammar: $('#setGrammar').checked, grammarBtn: $('#grammarBtn').getAttribute('aria-pressed'), bar: barMode, compact: ribbon.classList.contains('compact'),
    line: lineDefault(), lineClick: lineClickOn(), lineBox: $('#setLineClick').checked, tips: tipsOn(), tipsOff: document.documentElement.dataset.tips, tooltips: pref.get('tooltips'), zoom: pref.get('page-zoom')}));
  ok(got.theme === 'dark' && got.themeBtn === 'true', 'the dark theme is back, and shown in Settings');
  ok(got.favs.includes('#123456') && got.hlFavs[0] === '#abcdef' && got.hlCol === '#a5d8ff', 'favourite colours, favourite highlights and the highlight colour are back');
  ok(!got.grammar && got.grammarBtn === 'false', 'Check grammar is off again (the box and the Review button)');
  ok(got.bar === 'compact' && got.compact, 'the toolbar is compact again');
  ok(got.line === '#00aa88', 'the side note line colour is back');
  ok(!got.lineClick && !got.lineBox, "Clickable lines is off again (a default the page writes as it opens doesn't win over Drive)");
  ok(!got.tips && got.tipsOff === 'off', 'tips are off again');
  ok(got.tooltips === '0', 'a setting changed here since the copy in Drive keeps this device\'s choice');
  ok(got.zoom === null, 'the page zoom didn\'t come back (it isn\'t a setting that travels)');
  await waitCloud(p => p.tooltips?.v === '0', 'the newer choice from this device goes to Drive');
  const c2 = cloud();
  ok(c2.theme.v === 'dark' && JSON.parse(c2['fav-colors'].v).includes('#123456') && JSON.parse(before).theme.t === c2.theme.t, 'Drive\'s copy wasn\'t written over with the fresh browser\'s defaults');
  ok(!other.length, 'no other Drive requests: ' + other.join(', '));

  // ---- offline: fails quietly ----
  await context.setOffline(true);
  await page.evaluate(() => { dispatchEvent(new Event('offline')); setTheme('light'); });
  await page.waitForTimeout(3500);
  ok(cloud().theme.v === 'dark', 'offline, nothing is sent');
  await page.click('#helpBtn');
  ok(/You’re offline/.test(await line()), 'settings: the line says it goes to Drive when you\'re back online');
  await context.setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await waitCloud(p => p.theme.v === 'light', 'back online, the change goes to Drive');
  ok(true, 'back online, the waiting change goes to Drive');
  await page.click('#setClose');

  // ---- the app folder turned down: asked for once, then never again on this device ----
  await page.evaluate(() => $('#driveOff').click());
  await page.evaluate(() => { google.accounts.oauth2.hasGrantedAllScopes = (r, ...s) => !s.some(x => x.includes('appdata')); });
  await signIn();
  ok(await page.evaluate(() => pref.get('drive-appdata') === 'no' && !drive.appdata), 'turning the app folder down is remembered');
  await page.click('#helpBtn');
  ok(/kept on this device only/.test(await line()), 'settings: the line says settings stay on this device');
  await page.click('#setClose');
  await page.evaluate(() => $('#driveOff').click());
  await signIn();
  ok(await page.evaluate(() => !window.__lastReq.scope.includes('appdata') && window.__lastReq.scope.includes('drive.file')), 'the next sign-in doesn\'t ask for it again');

  ok(!errors.length, 'no page errors: ' + errors.join(' / '));
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });

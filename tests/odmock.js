// Microsoft's MSAL.js and Microsoft Graph, faked for the OneDrive tests (shared by onedrive.js and odshots.js)
const fs = require('fs');
const path = require('path');

// served in place of the MSAL library from jsdelivr: window.msal, and window.__msal to steer and inspect it
exports.MSAL = `(() => {
class AuthErr extends Error { constructor(code, msg){ super(msg || code); this.errorCode = code; this.errorMessage = msg || code; this.name = 'BrowserAuthError'; } }
class InteractionRequiredAuthError extends AuthErr {}
const M = window.__msal = {logins: 0, silent: 0, popups: 0, cleared: [], reqs: [], mode: 'ok', silentMode: 'ok', n: 0, ttl: 3600e3, accts: [], inits: 0, once: ''};
window.msal = {
  InteractionRequiredAuthError,
  PublicClientApplication: class {
    constructor(cfg){ M.cfg = cfg; }
    async initialize(){ M.inits++; }
    getAllAccounts(){ return M.accts; }
    tok(){ return {accessToken: 'tok' + (++M.n), expiresOn: new Date(Date.now() + M.ttl), account: M.accts[0]}; }
    async acquireTokenSilent(req){ M.silent++; M.reqs.push({k: 'silent', force: !!req.forceRefresh, scopes: req.scopes}); if (M.silentMode === 'interaction') throw new InteractionRequiredAuthError('interaction_required'); return this.tok(); }
    async acquireTokenPopup(req){ M.popups++; M.reqs.push({k: 'popup', scopes: req.scopes}); return this.pop(); }
    async loginPopup(req){ M.logins++; M.reqs.push({k: 'login', scopes: req.scopes, prompt: req.prompt}); return this.pop(); }
    async pop(){
      await new Promise(r => setTimeout(r, 10));
      const m = M.once || M.mode;
      if (M.once) M.once = '';
      if (m === 'closed') throw new AuthErr('user_cancelled', 'User cancelled the flow.');
      if (m === 'blocked') throw new AuthErr('popup_window_error', 'Error opening popup window.');
      if (m === 'inprogress') { try { sessionStorage.setItem('msal.interaction.status', 'interaction_in_progress'); } catch {} throw new AuthErr('interaction_in_progress', 'Interaction is currently in progress.'); }
      if (m === 'admin') throw new AuthErr('invalid_request', 'AADSTS90094: The grant requires admin permission. Trace ID: 1234');
      if (m === 'denied') throw new AuthErr('access_denied', 'AADSTS65004: The user declined to consent.');
      try { if (sessionStorage.getItem('msal.interaction.status')) throw new AuthErr('interaction_in_progress', 'stale'); } catch (e) { if (e.errorCode) throw e; }
      M.accts = [{name: 'Ada Lovelace', username: 'ada@contoso.com', homeAccountId: 'h1'}];
      return this.tok();
    }
    async clearCache(r){ M.cleared.push(r && r.account && r.account.username); M.accts = []; }
  },
};
})();`;

const D = path.join(__dirname);
const PDF = fs.readFileSync(path.join(D, 'lecture.pdf'));
const PPTX = fs.readFileSync(path.join(D, 'week2.pptx'));
const DOCX = fs.readFileSync(path.join(D, 'reading.docx'));
const PNG = fs.readFileSync(path.join(D, 'pic.png'));
const NB = fs.readFileSync(path.join(D, 'nbfile.html'));
const CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'Retry-After'};

const own = (id, name, extra = {}) => ({id, name, size: 120000, lastModifiedDateTime: '2026-03-12T10:00:00Z', parentReference: {driveId: 'D1', path: '/drive/root:'}, file: {}, ...extra});
const folder = (id, name, p = '/drive/root:') => ({id, name, folder: {childCount: 2}, parentReference: {driveId: 'D1', path: p}, lastModifiedDateTime: '2026-03-01T10:00:00Z'});
const remote = (sid, id, name, extra = {}) => ({id: sid, name, lastModifiedDateTime: '2026-02-02T10:00:00Z', remoteItem: {id, name, file: {}, size: 5000, parentReference: {driveId: 'DX'}, shared: {owner: {user: {displayName: 'Grace Hopper'}}}, ...extra}});
const MANY = Array.from({length: 45}, (_, i) => own('M' + i, `Part ${String(i + 1).padStart(2, '0')}.pdf`, {parentReference: {driveId: 'D1', path: '/drive/root:/Many'}}));
exports.CATALOG = {
  root: [own('I2', 'Week 2 slides.pptx'), folder('F1', 'Courses'), own('I1', 'Lecture 1.pdf'), own('I3', 'budget.xlsx'), own('I4', 'Reading.docx'), own('I5', 'Diagram.png'), own('NB1', 'My notebook (notes).html'),
    own('PK', 'Class notebook', {package: {type: 'oneNote'}, file: undefined}), folder('F3', 'Many'), own('I8', "O'Brien notes.pdf")],
  F1: [folder('F2', 'Year 2', '/drive/root:/Courses'), own('I6', 'Deep dive.pdf', {parentReference: {driveId: 'D1', path: '/drive/root:/Courses'}})],
  F2: [own('I7', 'Exam.pdf', {parentReference: {driveId: 'D1', path: '/drive/root:/Courses/Year 2'}})],
  shared: [remote('S1', 'R1', 'Shared lecture.pdf'), remote('S2', 'R2', 'Shared notebook (notes).html'), {id: 'S3', name: 'Team folder', remoteItem: {id: 'RF', name: 'Team folder', folder: {childCount: 1}, parentReference: {driveId: 'DX'}}}],
  RF: [{id: 'R3', name: 'Team notes.pdf', file: {}, size: 2048, parentReference: {driveId: 'DX', path: '/drives/DX/root:/Team'}, lastModifiedDateTime: '2026-01-05T10:00:00Z'}],
  MANY,
};

// Microsoft Graph and the upload address, with every request recorded. state steers the failures.
exports.graph = async function(context){
  const reqs = [], uploads = [], st = {pdfFail: false, noAnon: false, forbid: new Set(), put404: false, reject: '', throttle: 0, retryAfter: 1, n: 0, perm: 0, sessions: 0, shareList403: false};
  const perms = {};          // item id -> permissions
  const ownerPerm = {id: 'own', roles: ['owner'], grantedToV2: {user: {displayName: 'Ada Lovelace', email: 'ada@contoso.com'}}};
  const json = (route, body, status = 200, headers = {}) => route.fulfill({status, contentType: 'application/json', headers: {...CORS, ...headers}, body: JSON.stringify(body)});
  const err = (route, status, code, message, headers) => json(route, {error: {code, message}}, status, headers);
  await context.route(/upload\.example\.test/, async route => {
    const rq = route.request();
    if (st.down) return route.abort('internetdisconnected');
    if (rq.method() === 'OPTIONS') return route.fulfill({status: 204, headers: CORS});
    const rec = {method: rq.method(), url: rq.url(), auth: rq.headers()['authorization'], range: rq.headers()['content-range'], size: rq.postDataBuffer() ? rq.postDataBuffer().length : 0};
    uploads.push(rec);
    if (rq.method() === 'DELETE') return route.fulfill({status: 204, headers: CORS});
    const m = rec.range.match(/bytes (\d+)-(\d+)\/(\d+)/);
    if (+m[2] + 1 < +m[3]) return json(route, {nextExpectedRanges: [`${+m[2] + 1}-`]}, 202);
    return json(route, {id: 'big' + (++st.n), name: st.lastName || 'big.html', webUrl: 'https://contoso-my.sharepoint.com/big', parentReference: {driveId: 'D1'}}, 201);
  });
  await context.route(/graph\.microsoft\.com/, async route => {
    const rq = route.request(), method = rq.method();
    if (st.down) return route.abort('internetdisconnected');
    if (method === 'OPTIONS') return route.fulfill({status: 204, headers: CORS});
    const url = decodeURIComponent(rq.url().replace('https://graph.microsoft.com/v1.0', '')), auth = rq.headers()['authorization'];
    const rec = {method, url, raw: rq.url(), auth, type: rq.headers()['content-type'], body: rq.postDataBuffer() ? rq.postDataBuffer().toString('latin1') : ''};
    reqs.push(rec);
    if (st.reject && auth === 'Bearer ' + st.reject) return err(route, 401, 'InvalidAuthenticationToken', 'Access token has expired.');
    if (st.throttle > 0 && method !== 'GET') { st.throttle--; return err(route, 429, 'activityLimitReached', 'Too many requests.', {'retry-after': String(st.retryAfter)}); }
    let m;
    if (/^\/me\/drive\?\$select=id$/.test(url)) return json(route, {id: 'D1'});
    // lists
    if (/^\/me\/drive\/root\/children/.test(url)) return json(route, {value: exports.CATALOG.root});
    if (/^\/me\/drive\/sharedWithMe/.test(url)) return st.sharedFail ? err(route, 400, 'invalidRequest', 'sharedWithMe is no longer available.') : json(route, {value: exports.CATALOG.shared});
    if (/^\/me\/drive\/recent/.test(url)) return json(route, {value: [exports.CATALOG.root[2], remote('RC2', 'R1', 'Shared lecture.pdf')]});
    if ((m = url.match(/^\/me\/drive\/root\/search\(q='(.*)'\)/))) {
      const q = m[1].replace(/''/g, "'").toLowerCase(), all = [...exports.CATALOG.root, ...exports.CATALOG.F1, ...exports.CATALOG.F2];
      return json(route, {value: all.filter(x => x.name.toLowerCase().includes(q))});
    }
    if ((m = url.match(/^\/drives\/([^/]+)\/items\/([^/]+)\/children/))) {
      if (m[2] === 'F3') return /skiptoken/.test(url) ? json(route, {value: exports.CATALOG.MANY.slice(30)}) : json(route, {value: exports.CATALOG.MANY.slice(0, 30), '@odata.nextLink': 'https://graph.microsoft.com/v1.0/drives/D1/items/F3/children?$skiptoken=2'});
      if (st.listFail && m[2] === 'F1') return err(route, 500, 'generalException', 'Something broke at Microsoft.');
      return json(route, {value: exports.CATALOG[m[2]] || []});
    }
    // downloads
    if ((m = url.match(/^\/drives\/([^/]+)\/items\/([^/]+)\/content(\?format=pdf)?$/)) && method === 'GET') {
      const id = m[2];
      if (m[3]) return st.pdfFail ? err(route, 406, 'notSupported', 'Conversion is not supported for this file.') : route.fulfill({status: 200, contentType: 'application/pdf', headers: CORS, body: PDF});
      const f = {I1: [PDF, 'application/pdf'], I2: [PPTX, 'application/octet-stream'], I4: [DOCX, 'application/octet-stream'], I5: [PNG, 'application/octet-stream'], I6: [PDF, 'application/pdf'], I7: [PDF, 'application/pdf'], R1: [PDF, 'application/pdf'], R2: [NB, 'text/html'], NB1: [NB, 'text/html'], R3: [PDF, 'application/pdf']}[id];
      if (f) return route.fulfill({status: 200, contentType: f[1], headers: CORS, body: f[0]});
    }
    // saves
    if ((m = url.match(/^\/me\/drive\/root:\/(.*):\/content\?@microsoft\.graph\.conflictBehavior=(\w+)$/)) && method === 'PUT') {
      rec.name = decodeURIComponent(m[1]); rec.conflict = m[2];
      const id = 'new' + (++st.n); perms[id] = [ownerPerm];
      return json(route, {id, name: rec.name.split('/').pop(), webUrl: `https://contoso-my.sharepoint.com/personal/ada/${id}`, parentReference: {driveId: 'D1'}}, 201);
    }
    if ((m = url.match(/^\/drives\/([^/]+)\/items\/([^/]+)\/content$/)) && method === 'PUT') {
      if (st.forbid.has(m[2])) return err(route, 403, 'accessDenied', 'You do not have permission to change this item.');
      if (st.put404 && m[2].startsWith('new')) return err(route, 404, 'itemNotFound', 'The resource could not be found.');
      return json(route, {id: m[2], name: 'kept name', webUrl: `https://contoso-my.sharepoint.com/personal/ada/${m[2]}`, parentReference: {driveId: m[1]}});
    }
    if ((m = url.match(/^(?:\/me\/drive\/root:\/(.*):|\/drives\/([^/]+)\/items\/([^/]+))\/createUploadSession$/)) && method === 'POST') {
      rec.session = true; rec.target = m[1] ? 'path' : 'item'; rec.sessionBody = JSON.parse(rec.body); st.lastName = m[1] ? decodeURIComponent(m[1]).split('/').pop() : 'kept name'; st.sessions++;
      return json(route, {uploadUrl: 'https://upload.example.test/session/s' + st.sessions, expirationDateTime: '2026-12-01T00:00:00Z'});
    }
    // the version check that syncing makes before it uploads or fetches
    if ((m = url.match(/^\/drives\/([^/]+)\/items\/([^/]+)\?\$select=cTag,eTag,deleted$/))) return json(route, {id: m[2], cTag: '"c:' + m[2] + ',1"', eTag: '"' + m[2] + ',1"'});
    // sharing
    if ((m = url.match(/^\/drives\/([^/]+)\/items\/([^/]+)\?\$select=id,webUrl$/))) return json(route, {id: m[2], webUrl: `https://contoso-my.sharepoint.com/personal/ada/${m[2]}`});
    if ((m = url.match(/^\/drives\/([^/]+)\/items\/([^/]+)\/permissions\/([^/]+)$/)) && method === 'DELETE') {
      const l = perms[m[2]] || []; const i = l.findIndex(p => p.id === m[3]); if (i >= 0) l.splice(i, 1); return route.fulfill({status: 204, headers: CORS});
    }
    if ((m = url.match(/^\/drives\/([^/]+)\/items\/([^/]+)\/permissions$/)) && method === 'GET') {
      if (st.shareList403) return err(route, 403, 'accessDenied', 'Access denied');
      return json(route, {value: perms[m[2]] || (perms[m[2]] = [ownerPerm])});
    }
    if ((m = url.match(/^\/drives\/([^/]+)\/items\/([^/]+)\/invite$/)) && method === 'POST') {
      const b = JSON.parse(rec.body); rec.invite = b;
      if (b.recipients.some(r => /blocked\.org$/.test(r.email))) return err(route, 403, 'accessDenied', 'Sharing outside contoso.com is not allowed by your administrator.');
      const list = perms[m[2]] || (perms[m[2]] = [ownerPerm]), out = b.recipients.map(r => ({id: 'p' + (++st.perm), roles: b.roles, grantedToV2: {user: {displayName: r.email.split('@')[0], email: r.email}}}));
      list.push(...out); return json(route, {value: out});
    }
    if ((m = url.match(/^\/drives\/([^/]+)\/items\/([^/]+)\/createLink$/)) && method === 'POST') {
      const b = JSON.parse(rec.body); rec.link = b;
      if (b.scope === 'anonymous' && st.noAnon) return err(route, 403, 'accessDenied', 'Anonymous links are disabled by your administrator.');
      const list = perms[m[2]] || (perms[m[2]] = [ownerPerm]);
      let p = list.find(x => x.link && x.link.scope === b.scope && x.link.type === b.type);
      if (!p) { p = {id: 'lk' + (++st.perm), roles: [b.type === 'edit' ? 'write' : 'read'], link: {type: b.type, scope: b.scope, webUrl: `https://1drv.test/${b.scope}/${b.type}/${m[2]}`}}; list.push(p); }
      return json(route, p, 201);
    }
    return err(route, 400, 'badRequest', 'unexpected ' + method + ' ' + url);
  });
  return {reqs, uploads, st, perms};
};

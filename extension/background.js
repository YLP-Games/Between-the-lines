// Between the Lines extension: PDFs you open in the browser, and documents you download, go straight into the app
importScripts('common.js');

// ---------- handing a file to the app ----------
// the app's tab: the one already open (in this window if there is one), else this tab turned into it, else a new one
async function appTab(app, here){
  const tabs = await chrome.tabs.query({url: app.replace(/[?#].*$/, '') + '*'});
  return tabs.find(t => here && t.windowId === here.windowId) || tabs[0] || null;
}
function loaded(tabId){
  return new Promise(res => {
    const done = () => { clearTimeout(t); chrome.tabs.onUpdated.removeListener(on); res(); };
    const on = (id, ch) => { if (id === tabId && ch.status === 'complete') done(); };
    const t = setTimeout(done, 30000);
    chrome.tabs.onUpdated.addListener(on);
    chrome.tabs.get(tabId).then(t => { if (t.status === 'complete' && !/^(about:|chrome:)/.test(t.url || '')) done(); }, done);
  });
}
// the pieces go into the page one at a time, then the page puts them together and opens the file (window.btlReceive, in the app)
async function hand(tabId, parts, meta){
  const run = (func, args) => chrome.scripting.executeScript({target: {tabId}, world: 'MAIN', func, args}).then(r => r[0]?.result);
  await run(n => { window.__btlIn = new Array(n); }, [parts.length]);
  for (let i = 0; i < parts.length; i++) await run((i, p) => { window.__btlIn[i] = p; }, [i, parts[i]]);
  return run(async meta => {
    for (let i = 0; i < 300 && !window.btlReceive; i++) await new Promise(r => setTimeout(r, 100));
    if (!window.btlReceive) return 'not-ready';
    const parts = window.__btlIn; delete window.__btlIn;
    await window.btlReceive({...meta, parts}); return 'ok';
  }, [meta]);
}
// srcTab: the tab the file came from (a PDF tab, which then becomes the app, or goes back to where it was)
async function deliver(parts, meta, srcTab){
  const s = await BTL.settings();
  let tab = await appTab(s.app, srcTab), leave = null;
  if (tab) leave = srcTab && srcTab.id !== tab.id ? srcTab : null;
  else if (srcTab) tab = await chrome.tabs.update(srcTab.id, {url: s.app});
  else tab = await chrome.tabs.create({url: s.app});
  await chrome.tabs.update(tab.id, {active: true}); await chrome.windows.update(tab.windowId, {focused: true}).catch(() => {});
  await loaded(tab.id);
  const r = await hand(tab.id, parts, meta);
  if (leave) await chrome.tabs.goBack(leave.id).catch(() => chrome.tabs.remove(leave.id).catch(() => {}));
  if (r !== 'ok') note('Between the Lines didn’t open in time', `Open ${meta.name} from the app instead (Open, or drop the file on the page).`);
  return r;
}
// a document at an address: fetched again (with your sign-ins, as the browser would), then handed over
async function openUrl(url, srcTab, name){
  const s = await BTL.settings();
  let res;
  try { res = await fetch(url, {credentials: 'include'}); } catch (e) { res = null; }
  if (!res || !res.ok) return note('Couldn’t fetch the file', 'Download it, then open it in Between the Lines (Open, or drop it on the page).'), 'failed';
  const type = res.headers.get('content-type') || '', disp = res.headers.get('content-disposition') || '';
  const kind = BTL.kind(type, name || BTL.name(url, disp, ''));
  if (!kind) return note('Not a PDF, PowerPoint or Word file', 'Between the Lines opens PDF, PowerPoint (.pptx) and Word (.docx) files.'), 'not-a-document';
  const buf = await res.arrayBuffer();
  return deliver(BTL.pieces(buf, s.chunk), {name: name || BTL.name(url, disp, kind), type: BTL.TYPES[kind], from: host(url)}, srcTab);
}
const host = url => { try { const u = new URL(url); return u.protocol === 'file:' ? 'your computer' : u.hostname.replace(/^www\./, ''); } catch { return 'your browser'; } };
const note = (title, message, id = '') => chrome.notifications.create(id, {type: 'basic', iconUrl: 'icons/128.png', title, message, ...(id ? {buttons: [{title: 'Open in Between the Lines'}], requireInteraction: true} : {})});

// ---------- a PDF opened in the browser (viewer.html takes over from Chrome's own viewer and sends its bytes here) ----------
// Chrome tells the PDF page only the response's type, so its name (the Content-Disposition header) is noted here on the way in
chrome.webRequest.onHeadersReceived.addListener(d => {
  const cd = d.responseHeaders?.find(h => /^content-disposition$/i.test(h.name));
  if (cd && /pdf/i.test(d.responseHeaders.find(h => /^content-type$/i.test(h.name))?.value || '')) chrome.storage.session.set({['cd:' + d.url]: cd.value});
}, {urls: ['<all_urls>'], types: ['main_frame', 'sub_frame']}, ['responseHeaders']);
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'file') return;
  let meta = null; const parts = [];
  port.onMessage.addListener(async m => {
    if (m.meta) meta = m.meta;
    else if ('part' in m) parts.push(m.part);
    else if (m.end) {
      const src = meta.tabId != null ? await chrome.tabs.get(meta.tabId).catch(() => null) : null;
      const {tabId, ...rest} = meta;
      deliver(parts, rest, src).catch(e => { console.error('Between the Lines:', e); note('Couldn’t open the PDF', e.message); });
    }
  });
});

// ---------- the app's page learns the extension is there (mark.js): on the web address in the manifest, or on the one set in the pop-up ----------
async function markApp(){
  const {app} = await BTL.settings(); let m;
  try { const u = new URL(app); m = `${u.protocol}//${u.hostname}${u.pathname.replace(/[^/]*$/, '')}*`; } catch { return; }
  await chrome.scripting.unregisterContentScripts({ids: ['mark']}).catch(() => {});
  if (m !== 'https://ylp-games.github.io/Between-the-lines/*') await chrome.scripting.registerContentScripts([{id: 'mark', matches: [m], js: ['mark.js'], runAt: 'document_start'}]).catch(() => {});
}
chrome.runtime.onStartup.addListener(markApp);
chrome.storage.onChanged.addListener(c => { if (c.app) markApp(); });

// ---------- right-click a link, the toolbar button, the keyboard shortcut ----------
chrome.runtime.onInstalled.addListener(() => {
  markApp();
  chrome.contextMenus.create({id: 'link', title: 'Open link in Between the Lines', contexts: ['link']});
  chrome.contextMenus.create({id: 'page', title: 'Open this PDF in Between the Lines', contexts: ['page', 'frame'], documentUrlPatterns: ['*://*/*.pdf*', 'file:///*.pdf', '*://*/*.PDF*']});
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'link') openUrl(info.linkUrl, null);
  else if (info.menuItemId === 'page') openUrl(info.frameUrl || info.pageUrl, tab);
});
chrome.commands.onCommand.addListener(async cmd => {
  if (cmd !== 'open-tab') return;
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (tab?.url) openUrl(tab.url, tab);
});
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m.openUrl) { openUrl(m.openUrl, m.tab || null).then(reply); return true; }
  if (m.fromNote) { fromNote(m.fromNote).then(() => reply('ok')); return true; }
});

// ---------- a PDF, PowerPoint or Word file you download ----------
chrome.downloads.onChanged.addListener(async d => {
  if (d.state?.current !== 'complete') return;
  const [it] = await chrome.downloads.search({id: d.id}); if (!it) return;
  const kind = BTL.kind(it.mime, it.filename), url = it.finalUrl || it.url;
  if (!kind || !/^(https?|file):/.test(url)) return;
  // its name as saved (or, if that isn't a document's name, the one the server gives when it is fetched again)
  const s = await BTL.settings(), file = it.filename.split(/[\\/]/).pop(), name = BTL.kind('', file) ? file : '', label = name || BTL.name(url, '', kind);
  if (s.downloads === 'open') openUrl(url, null, name || undefined);
  else if (s.downloads === 'ask') { const id = 'dl' + it.id; await chrome.storage.session.set({[id]: {url, name, label, at: Date.now()}}); note(`Open ${label} in Between the Lines?`, 'Take notes between its lines, beside its slides.', id); }      // (also listed in the pop-up, where notifications are off)
});
const fromNote = async id => { const w = (await chrome.storage.session.get(id))[id]; if (!w) return; await chrome.storage.session.remove(id); chrome.notifications.clear(id); return openUrl(w.url, null, w.name || undefined); };      // (kept in session storage: the background script may have been stopped in between)
chrome.notifications.onClicked.addListener(fromNote);
chrome.notifications.onButtonClicked.addListener(fromNote);

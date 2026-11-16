(async () => {
  const $ = s => document.querySelector(s), s = await BTL.settings();
  for (const k of ['pdf', 'downloads']) {
    const r = document.querySelector(`input[name=${k}][value=${s[k]}]`); if (r) r.checked = true;
    document.querySelectorAll(`input[name=${k}]`).forEach(i => i.onchange = () => chrome.storage.sync.set({[k]: i.value}));
  }
  const v = +(navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || 0); $('#old').hidden = !v || v >= 151;
  $('#appUrl').value = s.app;
  $('#appUrl').onchange = e => { try { const u = new URL(e.target.value); chrome.storage.sync.set({app: u.href}); } catch { e.target.value = s.app; } };
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  $('#thisTab').disabled = !tab || !/^(https?|file):/.test(tab.url || '') || (tab.url || '').startsWith(s.app);
  $('#thisTab').onclick = async () => { $('#thisTab').disabled = true; $('#thisTab').textContent = 'Opening…'; await chrome.runtime.sendMessage({openUrl: tab.url, tab}); window.close(); };
  const {last} = await chrome.storage.session.get('last');
  if (last) { $('#viewLast').hidden = false; $('#viewLast').textContent = `View “${last.name}” in the browser’s viewer`;
    $('#viewLast').onclick = async () => { await chrome.storage.session.set({skip: last.url}); await chrome.tabs.create({url: last.url}); window.close(); }; }
  // downloads waiting to be opened (from the notifications, in case they don't show)
  const offers = Object.entries(await chrome.storage.session.get(null)).filter(([k]) => /^dl\d+$/.test(k)).sort((a, b) => b[1].at - a[1].at).slice(0, 5);
  for (const [id, o] of offers) {
    const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.dataset.dl = id; b.textContent = `Open the download “${o.label}”`;
    b.onclick = async () => { b.disabled = true; await chrome.runtime.sendMessage({fromNote: id}); window.close(); };
    $('#offers').append(b); $('#offers').hidden = false;
  }
  $('#app').onclick = async () => {
    const [t] = await chrome.tabs.query({url: s.app.replace(/[?#].*$/, '') + '*'});
    if (t) { await chrome.tabs.update(t.id, {active: true}); await chrome.windows.update(t.windowId, {focused: true}); } else await chrome.tabs.create({url: s.app});
    window.close();
  };
})();

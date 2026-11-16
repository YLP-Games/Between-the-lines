// Chrome hands this page any PDF you open (instead of its own viewer): it goes straight into Between the Lines, or asks first
(async () => {
  const $ = s => document.querySelector(s);
  let info;
  try { info = await chrome.mimeHandler.getStreamInfo(); } catch { $('#state').textContent = 'This PDF could not be read.'; return; }
  const native = () => chrome.mimeHandler.abortAndFallbackToNativeHandler();
  const s = await BTL.settings(), {skip} = await chrome.storage.session.get('skip');
  if (skip === info.originalUrl) { await chrome.storage.session.remove('skip'); return native(); }        // "View in Chrome" from the pop-up
  if (s.pdf === 'chrome' || info.embedded) return native();
  const key = 'cd:' + info.originalUrl, named = /\.pdf$/i.test(new URL(info.originalUrl).pathname); let cd = '';
  for (let i = 0; i < (named ? 1 : 30) && !cd; i++) { cd = (await chrome.storage.session.get(key))[key] || ''; if (!cd && !named) await new Promise(r => setTimeout(r, 50)); }      // (an address like …/download?id=7 waits up to 1.5 s for its name)
  if (cd) chrome.storage.session.remove(key);
  const name = BTL.name(info.originalUrl, cd, 'pdf');
  let from = 'your browser'; try { const u = new URL(info.originalUrl); from = u.protocol === 'file:' ? 'your computer' : u.hostname.replace(/^www\./, ''); } catch {}
  $('#name').textContent = name; $('#from').textContent = 'from ' + from; document.title = name + ' · Between the Lines';
  const go = async () => {
    $('#ask').hidden = $('#rem').hidden = true; $('#state').textContent = 'Opening it in Between the Lines…';
    try {
      const buf = await (await fetch(info.streamUrl)).arrayBuffer();
      await chrome.storage.session.set({last: {url: info.originalUrl, name}});
      const port = chrome.runtime.connect({name: 'file'});
      port.postMessage({meta: {name, type: 'application/pdf', from, tabId: info.tabId}});
      for (const part of BTL.pieces(buf, s.chunk)) port.postMessage({part});
      port.postMessage({end: true});
    } catch (e) { $('#state').textContent = 'It could not be opened: ' + e.message; $('#ask').hidden = false; $('#open').hidden = true; }
  };
  if (s.pdf !== 'ask') return go();
  $('#state').textContent = 'Take notes on it in Between the Lines, or read it in Chrome?';
  $('#ask').hidden = $('#rem').hidden = false; $('#open').focus();
  const keep = v => $('#remember').checked && chrome.storage.sync.set({pdf: v});
  $('#open').onclick = async () => { await keep('open'); go(); };
  $('#native').onclick = async () => { await keep('chrome'); native(); };
})();

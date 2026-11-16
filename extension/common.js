// shared by the background script, the PDF page and the pop-up
const BTL = {
  DEF: {app: 'https://ylp-games.github.io/Between-the-lines/', pdf: 'open', downloads: 'ask', chunk: 8 << 20},
  async settings(){ return {...BTL.DEF, ...await chrome.storage.sync.get(Object.keys(BTL.DEF))}; },
  TYPES: {pdf: 'application/pdf', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},
  // the kind of file (pdf, pptx, docx) from its type or name, or '' when the app can't open it
  kind(type, name){ const t = (type || '').split(';')[0].trim().toLowerCase(), k = Object.keys(BTL.TYPES).find(k => BTL.TYPES[k] === t); return k || ((name || '').match(/\.(pdf|pptx|docx)$/i)?.[1].toLowerCase() ?? ''); },
  // the file's name: from the Content-Disposition header, else the last part of the address
  name(url, disp, kind){
    let n = '';
    const m = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(disp || '') || /filename\s*=\s*"?([^";]+)"?/i.exec(disp || '');
    if (m) try { n = decodeURIComponent(m[1].trim()); } catch { n = m[1].trim(); }
    if (!n) try { n = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || ''); } catch {}
    n = n.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 120) || 'Document';
    return kind && !n.toLowerCase().endsWith('.' + kind) ? n + '.' + kind : n;
  },
  // bytes as base64 text, in pieces of at most `size` characters (messages between parts of the browser have a size limit)
  pieces(buf, size){
    const u = new Uint8Array(buf), out = []; let s = '';
    for (let i = 0; i < u.length; i += 0x8000) { s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); if (s.length >= size * 3 / 4) { out.push(btoa(s)); s = ''; } }
    if (s || !out.length) out.push(btoa(s));
    return out;
  },
};

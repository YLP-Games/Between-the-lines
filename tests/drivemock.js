// Google's sign-in and Picker, stubbed: scripts served to the page under test (shared by drive.js and driveshare.js)
exports.GSI = `
window.google = window.google || {};
window.__tokenRequests = 0; window.__mode = 'ok'; window.__revoked = [];
google.accounts = {oauth2: {
  initTokenClient(cfg){ window.__cfg = cfg; return {requestAccessToken(o){
    window.__tokenRequests++; window.__lastReq = o;
    const n = window.__tokenRequests;
    setTimeout(() => {
      if (window.__mode === 'closed') return cfg.error_callback({type: 'popup_closed'});
      if (window.__mode === 'denied') return cfg.callback({error: 'access_denied'});
      cfg.callback({access_token: 'tok' + n, expires_in: 3600, scope: cfg.scope});
    }, 10);
  }}; },
  revoke(t, cb){ window.__revoked.push(t); cb && cb({successful: true}); },
}};`;
exports.GAPI = `
window.gapi = {load(name, opts){ setTimeout(() => {
  window.google = window.google || {};
  const log = window.__pickerLog = [];
  google.picker = {
    ViewId: {DOCS: 'docs', RECENTLY_PICKED: 'recent'}, Feature: {MULTISELECT_ENABLED: 'multi', SUPPORT_DRIVES: 'drives'}, Response: {ACTION: 'action', DOCUMENTS: 'docs'}, Action: {PICKED: 'picked', CANCEL: 'cancel', LOADED: 'loaded'}, Document: {ID: 'id', NAME: 'name', MIME_TYPE: 'mimeType'},
    DocsView: class { constructor(v){ this.o = {id: v}; (window.__views = window.__views || []).push(this.o); log.push('view ' + v); }
      setMimeTypes(m){ log.push('mime ' + m); this.o.mime = m; return this; } setIncludeFolders(v){ this.o.folders = v; return this; } setSelectFolderEnabled(v){ this.o.selFolder = v; return this; }
      setEnableDrives(v){ this.o.drives = v; return this; } setOwnedByMe(v){ this.o.owned = v; return this; } setStarred(v){ this.o.starred = v; return this; } setLabel(l){ this.o.label = l; return this; } },
    PickerBuilder: class {
      addView(v){ (this.views = this.views || []).push(v.o); return this; } enableFeature(f){ log.push('feature ' + f); return this; } setTitle(){ return this; }
      setOAuthToken(t){ log.push('token ' + t); return this; } setDeveloperKey(k){ log.push('key ' + k); return this; } setAppId(a){ log.push('app ' + a); return this; } setOrigin(o){ log.push('origin ' + o); return this; }
      setCallback(cb){ this.cb = cb; return this; }
      setSize(w, h){ this.size = [w, h]; window.__pickerSize = [w, h]; return this; }
      build(){
        const cb = this.cb, [w, h] = this.size || [1051, 650]; window.__lastViews = this.views;
        // like Google's: a page-sized backdrop and a dialog placed absolutely against the page, once
        let bg, dlg; const gone = () => { bg?.remove(); dlg?.remove(); };
        const fin = d => { gone(); cb(d); };
        window.__pickerFinish = fin;
        return {setVisible(v){
          if (!v) return gone();
          bg = Object.assign(document.createElement('div'), {className: 'picker-dialog-bg'});
          bg.style.cssText = 'position:absolute;left:0;top:0;background:#fff;opacity:.5;z-index:1000;width:' + document.documentElement.scrollWidth + 'px;height:' + document.documentElement.scrollHeight + 'px';
          dlg = Object.assign(document.createElement('div'), {className: 'picker-dialog'});
          dlg.style.cssText = 'position:absolute;z-index:1001;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.2);left:' + Math.round((innerWidth - w) / 2) + 'px;top:' + (scrollY + 40) + 'px;width:' + w + 'px;height:' + h + 'px';
          dlg.innerHTML = '<div class="picker-dialog-content" style="width:100%;height:100%"><iframe style="width:100%;height:100%;border:0" src="about:blank"></iframe></div>';
          document.body.append(bg, dlg);
          if (window.__pickerHang) return;
          setTimeout(() => { cb({action: 'loaded'}); if (!window.__pickerStay) fin(window.__picked || {action: 'cancel'}); }, 20);
        }, dispose(){ gone(); window.__pickerDisposed = true; }};
      }
    },
  };
  (opts.callback || opts)();
}, 5); }};`;

// Android "Share to Between the Lines": the manifest's share_target, sw.js keeping the shared files, and the page opening them
const {open} = require('./harness');
const http = require('http'), path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const APP = process.env.APP || path.join(ROOT, 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
const TYPES = {html: 'text/html', js: 'text/javascript', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml'};

(async () => {
  const appDir = path.dirname(APP);
  const server = http.createServer((q, r) => {
    const f = path.join(appDir, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(appDir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }      // (a POST to /share-target that reaches here is a 404, as on GitHub Pages)
    r.writeHead(200, {'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;

  const man = JSON.parse(fs.readFileSync(path.join(appDir, 'manifest.webmanifest'), 'utf8')), st = man.share_target || {};
  ok(st.method === 'POST' && st.enctype === 'multipart/form-data' && st.action && st.params?.files?.[0]?.name === 'files', 'the manifest has a share_target: a multipart POST with a files field');
  const acc = st.params?.files?.[0]?.accept || [];
  ok(['application/pdf', '.pdf', '.pptx', '.docx', 'image/*'].every(a => acc.includes(a)), 'it accepts PDF, PowerPoint, Word and pictures');

  const {browser, context, page, errors} = await open(APP, {width: 1100, height: 800, contextOptions: {serviceWorkers: 'allow'}});
  await page.goto(base + 'index.html'); await page.waitForTimeout(500);
  await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(500);
  // the worker's own fetches skip the test's local library routes, so the libraries go into its cache by hand
  const NM = path.join(__dirname, 'node_modules'), LIBS = {'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js': 'pdfjs-dist/build/pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js': 'jszip/dist/jszip.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js': 'katex/dist/katex.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css': 'katex/dist/katex.min.css', 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js': 'mammoth/mammoth.browser.min.js', 'https://cdn.jsdelivr.net/npm/docx-preview@0.3.7/dist/docx-preview.min.js': 'docx-preview/dist/docx-preview.min.js'};
  for (const [u, f] of Object.entries(LIBS)) await page.evaluate(async ([u, b, t]) => (await caches.open('bts-v4')).put(u, new Response(b, {headers: {'content-type': t}})), [u, fs.readFileSync(path.join(NM, f), 'utf8'), f.endsWith('css') ? 'text/css' : 'text/javascript']);
  await page.reload(); await page.waitForTimeout(500);
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the service worker is running');
  const names = () => page.evaluate(async () => { const c = await caches.open('bts-share'); return (await c.keys()).length; });

  // share a PDF: a top-level POST to the share-target address, as Android does
  const share = async (files, extra = {}) => {
    await page.evaluate(({action, extra}) => {
      const f = document.createElement('form'); f.method = 'post'; f.enctype = 'multipart/form-data'; f.action = action; f.id = 'sh';
      f.innerHTML = '<input type=file name=files multiple>' + Object.keys(extra).map(k => `<input name=${k}>`).join('');
      for (const k in extra) f.querySelector(`[name=${k}]`).value = extra[k];
      document.body.append(f);
    }, {action: st.action, extra});
    if (files.length) await page.setInputFiles('#sh input[type=file]', files);
    await Promise.all([page.waitForNavigation({waitUntil: 'load'}), page.evaluate(() => document.getElementById('sh').submit())]);
  };
  await share([path.join(__dirname, 'lecture.pdf')]);
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000});
  ok(true, 'a shared PDF opens as a notebook (its pages are there)');
  ok(new URL(page.url()).pathname === '/' && !page.url().includes('shared'), 'and the address is tidied to ./ with no ?shared= left');
  ok(await names() === 0, 'the share store is emptied once the file is opened');
  ok(await page.evaluate(() => document.querySelectorAll('#docList .nb').length >= 1), 'it is in the notebook list');

  // a PowerPoint
  await share([path.join(__dirname, 'week2.pptx')]);
  await page.waitForFunction(n => document.querySelectorAll('.slide').length === 2 && /Equilibrium/.test(document.querySelector('main').textContent), null, {timeout: 60000});
  ok(await page.evaluate(() => document.querySelectorAll('.slide').length) === 2, 'a shared PowerPoint opens (its two slides are there)');
  ok(!page.url().includes('shared') && await names() === 0, 'and again nothing is left behind');

  // a link or text, no file: nothing opens, and it says so
  await share([], {title: 'A page', text: 'hello', url: 'https://example.com/'});
  await page.waitForTimeout(800);
  ok(/Only files/.test(await page.evaluate(() => document.querySelector('#toast')?.innerText || '')), 'a shared link with no file says that only files can be opened');
  ok(!page.url().includes('shared') && await names() === 0 && await page.evaluate(() => document.querySelectorAll('.file-head').length) < 2, 'and opens nothing');

  // other requests are unaffected
  ok(await page.evaluate(async () => (await fetch('./manifest.webmanifest')).ok), 'ordinary requests still work');
  await browser.close(); server.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::|404/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.log(e.message); process.exit(1); });

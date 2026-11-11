#!/usr/bin/env python3
"""Builds ios/web: the app's own copy of the web app (../index.html), with the libraries it uses beside it, so the
app works with no connection. Xcode runs this on every build; it can also be run by hand. Needs `npm install` in ../tests once."""
import hashlib, json, os, re, shutil, sys, urllib.request

IOS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(IOS)
OUT = os.path.join(IOS, 'web')
NM = os.path.join(ROOT, 'tests', 'node_modules')
DICT = os.path.join(ROOT, 'tests', 'dict')

# (the library's web address in index.html, the app's copy, where the files come from, which files, the npm package and version it must be)
LIBS = [
    ('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/', 'libs/pdfjs/build/', NM + '/pdfjs-dist/build', ['pdf.min.js', 'pdf.worker.min.js'], 'pdfjs-dist', '3.11.174'),
    ('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/', 'libs/pdfjs/', NM + '/pdfjs-dist', ['cmaps', 'standard_fonts'], 'pdfjs-dist', '3.11.174'),
    ('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/', 'libs/jszip/', NM + '/jszip/dist', ['jszip.min.js'], 'jszip', '3.10.1'),
    ('https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/', 'libs/katex/', NM + '/katex/dist', ['katex.min.js', 'katex.min.css', 'fonts'], 'katex', '0.16.9'),
    ('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/', 'libs/mammoth/', NM + '/mammoth', ['mammoth.browser.min.js'], 'mammoth', '1.6.0'),
    ('https://cdn.jsdelivr.net/npm/docx-preview@0.3.7/dist/', 'libs/docx-preview/', NM + '/docx-preview/dist', ['docx-preview.min.js'], 'docx-preview', '0.3.7'),
    ('https://cdn.jsdelivr.net/npm/typo-js@1.2.4/', 'libs/typo-js/', NM + '/typo-js', ['typo.js'], 'typo-js', '1.2.4'),
    ('https://cdn.jsdelivr.net/npm/dictionary-en@4.0.0/', 'libs/dictionary-en/', NM + '/dictionary-en', ['index.aff', 'index.dic'], 'dictionary-en', '4.0.0'),
    ('https://cdn.jsdelivr.net/gh/LibreOffice/dictionaries@libreoffice-26.2.7.1/en/', 'libs/dict/', DICT, ['en_GB.aff', 'en_GB.dic'], None, None),
    ('https://cdn.jsdelivr.net/npm/wordlist-english@1.2.1/', 'libs/dict/', DICT, [d + '-words-' + n + '.json' for d in ('english', 'british', 'american') for n in ('10', '20', '35')], None, None),
]
# (an address index.html puts together from pieces is looked for by its pieces)
PARTS = {'https://cdn.jsdelivr.net/gh/LibreOffice/dictionaries@libreoffice-26.2.7.1/en/': ['https://cdn.jsdelivr.net/gh/LibreOffice/dictionaries@', "'libreoffice-26.2.7.1/en/'"]}
UA = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

def warn(m): print('warning: make-web: ' + m, file=sys.stderr)

def put(src, dst):
    """copy a file or a folder, unless the copy is already there and the same size"""
    if os.path.isdir(src):
        for n in os.listdir(src): put(os.path.join(src, n), os.path.join(dst, n))
    elif not os.path.exists(dst) or os.path.getsize(dst) != os.path.getsize(src) or os.path.getmtime(dst) < os.path.getmtime(src):
        os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(src, dst)

def fonts(url):
    """the handwriting and interface fonts, fetched from Google Fonts once and kept; with no connection the first time, they stay on the web"""
    d = os.path.join(OUT, 'libs', 'fonts'); css = os.path.join(d, 'fonts.css'); mark = os.path.join(d, 'from.txt')
    if os.path.exists(css) and os.path.exists(mark) and open(mark).read() == url: return True
    try:
        get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA}), timeout=30).read()
        text = get(url.replace('&amp;', '&')).decode()
        os.makedirs(d, exist_ok=True)
        for u in sorted(set(re.findall(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', text))):
            name = hashlib.sha1(u.encode()).hexdigest()[:16] + os.path.splitext(u)[1]
            if not os.path.exists(os.path.join(d, name)): open(os.path.join(d, name), 'wb').write(get(u))
            text = text.replace(u, name)
        open(css, 'w').write(text); open(mark, 'w').write(url)
        return True
    except Exception as e:
        warn('the fonts could not be fetched (%s): the app will load them from the web' % e); return False

def main():
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf8').read()
    pairs = []
    for web, own, src, names, pkg, ver in LIBS:
        if not all(part in html for part in PARTS.get(web, [web])): warn('index.html no longer uses ' + web + ' (update LIBS in make-web.py): that library will load from the web'); continue
        if pkg:
            try: have = json.load(open(os.path.join(NM, pkg, 'package.json')))['version']
            except Exception: sys.exit('error: make-web: ' + pkg + ' is missing. Run `npm install` in the tests folder first.')
            if have != ver: warn('%s is %s here, but index.html uses %s: it will load from the web' % (pkg, have, ver)); continue
        for n in names: put(os.path.join(src, n), os.path.join(OUT, own, n))
        pairs.append([web, own])
    m = re.search(r'href="(https://fonts\.googleapis\.com/css2[^"]+)"', html)
    if m and fonts(m.group(1)): pairs.append([m.group(1), 'libs/fonts/fonts.css'])
    for web, own in pairs:                                  # the libraries the page itself asks for, in its head and at the end
        html = html.replace('="' + web, '="' + own)
    html, n = re.subn(r'<head>', lambda _: '<head><script id="btl-libs">window.BTL_LIBS=' + json.dumps(pairs).replace('<', '\\u003c') + '</script>', html, count=1)
    if n != 1: sys.exit('error: make-web: no <head> in index.html')
    os.makedirs(OUT, exist_ok=True)
    put(os.path.join(ROOT, 'icons'), os.path.join(OUT, 'icons'))
    dst = os.path.join(OUT, 'index.html')
    if not os.path.exists(dst) or open(dst, encoding='utf8').read() != html: open(dst, 'w', encoding='utf8').write(html)
    print('make-web: %d libraries in the app, index.html %d KB' % (len(pairs), len(html) // 1024))

main()

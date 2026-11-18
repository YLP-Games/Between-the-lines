# Prompt: a complete test sweep and analysis of Between the Lines

Paste everything below the line into a coding agent (opencode or similar) that is running in a clone of this repository, on a computer with Node 18+ and, ideally, Google Chrome 151 or newer.

---

You are doing a complete test sweep and analysis of **Between the Lines**, a note-taking web app/PWA for students: you open lecture slides (PDF, PowerPoint, Word, scans and photos) and write notes between their lines and on side pages. It is live at https://ylp-games.github.io/Between-the-lines/ (GitHub Pages, served from `main`). Your job is to **find and prove problems, not to rewrite the app**. Report first; only fix something if it is a clear, small bug and you add a test that fails before your fix and passes after.

## What is where

- `index.html`: the whole app (about 15,000 lines of inline HTML, CSS and JavaScript, no build step). Code is grouped under `// ================= <section> =================` banners; search for them to get your bearings.
- `sw.js` (service worker: offline copy, Android Share hand-off), `manifest.webmanifest` (install, file handlers, share target), `msal-redirect.html` (OneDrive sign-in).
- `extension/`: a Manifest V3 browser extension. From Chrome 151 it takes over PDFs the browser would show (`mime_types_handler` + `chrome.mimeHandler`) and hands them to the app's tab (`window.btlReceive`). It also offers PDF, PowerPoint and Word downloads, adds a right-click item and Alt+Shift+B, and marks the app's page with its version (`mark.js`). See `extension/README.md`.
- `ios/`: a native iPad app (Swift, Xcode) that wraps the page, with Pencil double tap, Open with and Share. `ios/README.md` explains it.
- `tests/`: about 80 Playwright test files, one per feature (`tests/run.js` lists them in `ALL`; `CHROMIUM_ONLY` marks the ones that need Chromium). `tests/README.md` explains how they work. Each test prints `ok …` per check and ends with `no page errors`.

## 1. Get oriented (read before running anything)

1. Read `README.md`, `tests/README.md`, `extension/README.md`, `ios/README.md`.
2. Read the history of what changed: `git log --since=2026-10-01 --format='%h %ad %s' --date=short` (about 200 commits). Group the changes into feature areas and keep that list: you will check each area later. Areas include, at least:
   - notes (handles, resizing, floating, minimised pencil icons, auto-fit, Markdown lists, bullets following text colour, copy and paste of notes);
   - side pages (link lines, equal heights, sync scrolling, speaker notes);
   - highlights and box presets;
   - drawing (the toolbar, pen, pencil, highlighter, text, eraser with partial mode, favourites, the minimised purple button);
   - templates and the formula library;
   - journal entries and tables;
   - spell check (LibreOffice dictionaries, Review tab, Editor, Autocorrect);
   - PDF reading (pdf.js in a worker, maths and repeated-picture handling, page numbers, scans and photos);
   - PowerPoint and Word import (fidelity, security fixes);
   - pictures (Picture Format tab);
   - Google Drive and OneDrive sync (and settings synced to Drive);
   - iPad and touch (two-finger and three-finger taps, zoom, Pencil);
   - install (Add to Home Screen card, file handlers, Android Share);
   - the browser extension, and the in-app card that suggests it;
   - printing, contrast, layout at every width, split view.
3. Note what the app stores and where: IndexedDB `between-slides-text` (store `kv`: `docs`, `cur`, `doc:<id>`, `asset:<id>`), `localStorage` preferences (`pref`), the `bts-*` caches.

## 2. Run every automated test

```sh
cd tests
npm install
npx playwright install chromium webkit firefox
node run.js                         # all tests in Chromium
node run.js --browser=webkit        # everything that can run in WebKit (Safari's engine)
node run.js --browser=firefox       # and in Firefox
```

- The extension test needs Chrome 151 or newer (Playwright's own Chromium is older, so the test skips), and it must be **Chrome for Testing** or Chromium: Google Chrome itself (137 and newer) refuses to load an extension from the command line, so with it the test skips and says why. Get Chrome for Testing with `npx @puppeteer/browsers install chrome@stable`, then `CHROME_PATH=<the chrome it prints> node run.js extension extprompt`. Test the extension in your everyday Google Chrome by hand instead (Load unpacked, section 3).
- `CHROME_PATH` works for every test, and is the way to run the whole suite in a real Chrome too:
  - macOS: `CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node run.js`
  - Windows: `CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"`
- **Known failures**, so you don't chase them blindly. Do confirm them and say whether they are bugs in the app or in the test:
  - `pdfscan`: a photo of a hand-drawn table has no blank row between two of its rows of writing.
  - `audit2`: at 820 px the toolbar's right-hand scroll arrow covers part of a button ("btn under rsl").
- If any other test fails, run it alone (`node <name>.js` prints every check), then run it twice more. Say whether it fails every time or only sometimes. For a flaky test, find the race. Check whether it also fails on the commit before the one that last touched that feature (`git log -- <file>`, then `git show <commit>^:index.html > tests/index.old.html` and `APP=$PWD/tests/index.old.html node <name>.js`).
- Record for every test: pass or fail, checks count, time taken, and browser.

## 3. Test the things automated tests can't reach

Use a real browser where you can, or Playwright with `headless: false`, and take screenshots into `tests/shots/`.

- **The extension in real Chrome**:
  1. Load `extension/` unpacked (`chrome://extensions`, Developer mode, Load unpacked), or build it the user's way: in the app, Help & settings → Get the browser extension → Download the extension.
  2. Then try:
     - a PDF from a real website, and from a site that needs a login if you have one;
     - a PDF that downloads instead of showing (`Content-Disposition: attachment`);
     - a `file://` PDF, with "Allow access to file URLs" off, then on;
     - a 50 MB+ PDF;
     - two PDFs opened quickly one after the other;
     - the app tab closed versus open, and in another window;
     - each of the three PDF settings and the three download settings;
     - "View … in the browser's viewer", the right-click item and Alt+Shift+B;
     - a PowerPoint and a Word download.
  3. Check that the app's card no longer suggests the extension once it is installed, and offers an update when `EXT_VER` in `index.html` is newer than `extension/manifest.json`'s version.
- **Service worker and offline**: install the app, go offline, reload, open a notebook and a PDF. Check that `sw.js` never caches an error page and that a new deploy reaches users (network-first for the app).
- **iPad**:
  - If you are on a Mac with Xcode, build `ios/` for an iPad simulator, and test Open with and Share from Files and Safari.
  - In Safari (or `BROWSER=webkit`), check: the Add to Home Screen card; two-finger tap (Back); three-finger tap (Forward); pinch zoom; that inputs don't zoom in on focus.
- **Cloud sync** (the tests fake Google and Microsoft): read the sync code (`syncNow`, `syncCheck`, `syncPull`, `CLOUD`) for conflict handling, lost writes, two tabs or devices editing at once, a token expiring mid-upload, and offline then online. Write a test with the fakes in `tests/drivemock.js` / `tests/odmock.js` for any case that isn't covered.
- **Printing and PDF export**:
  - Ctrl+P / Cmd+P on a notebook with slides, side pages, minimised notes, drawings, a table, a journal entry and a formula.
  - Download → PDF of the same notebook, with "Notes in the PDF" set each way.

## 4. Analyse the code

- **Security** (highest priority):
  - Anything from a file or the network that reaches `innerHTML`, `style` strings, `href`/`src` or `eval`-like sinks. This covers PPTX/DOCX/Markdown/notebook-file import, spell-check suggestions, template fields, Drive/OneDrive file names, and the extension's `btlReceive` and `mark.js`.
  - The extension's permissions (`<all_urls>`, downloads, scripting, webRequest): can a web page make it fetch or deliver something the user didn't choose? Can another site call `window.btlReceive`? (It is same-origin only, but check.)
  - OAuth: no client secrets in the repo; token handling; redirect page.
- **Data safety**: places where a notebook could be lost or overwritten:
  - saving while switching notebooks;
  - two tabs open;
  - an import that fails halfway;
  - Back and Forward after a large import;
  - quota errors in IndexedDB.
- **Performance**:
  - opening `tests/long.pdf` and a 100-page PDF (make one with pdf-lib or Chrome's `page.pdf()`);
  - typing in a note on a notebook with 200 notes;
  - scrolling with side pages and link lines on;
  - the spell check on a long note.

  Use the Chrome DevTools Performance panel or `performance.now()` around key functions. Report numbers.
- **Accessibility**: run axe-core (`npm i -D @axe-core/playwright`) on the main views (start screen, a notebook, Help & settings, the add menu, each ribbon tab, the drawing toolbar, the templates gallery, the extension card) in light and dark themes. Check keyboard-only use: open a file, add a note, format it, use Ctrl+K, close every pop-up with Esc.
- **Compatibility**:
  - Chrome, Edge, Firefox and Safari on a computer; Safari on iPad (iPadOS 16 and 17+).
  - Widths 320, 390, 820, 1100, 1440 and 1920 px.
  - Light, dark and Windows high-contrast (`forced-colors`).
- **Code health**:
  - dead code;
  - functions defined twice;
  - listeners added again on every call;
  - timers never cleared;
  - `localStorage` keys never read;
  - TODOs;
  - places where `index.html`'s inline comments no longer match the code.

  Keep the house style if you change anything: terse code, short names, sparse comments, British spelling in anything a user reads.

## 5. Report

Write `tests/SWEEP-REPORT.md` with:

1. **Summary**: overall health, the five most important findings, and the test totals by browser.
2. **Test results**: a table of every test (pass/fail, checks, time, browser), the known failures confirmed or not, any flaky tests with their cause.
3. **Findings**: one entry each, ordered by severity (critical / high / medium / low). Each entry gives:
   - the area;
   - what happens and what should happen;
   - exact steps to reproduce;
   - the file and line, or the function;
   - evidence (test output, screenshot, timing);
   - a suggested fix.
4. **Coverage gaps**: features with no test, or tests that would pass even if the feature broke. Suggest the checks to add.
5. **Fixes made** (if any): what, why, the test that proves it, and that the full suite still passes.

Work on a branch named `sweep-<date>`. Commit the report, any new tests and any fixes there, with clear messages. Don't push to `main` and don't change anything outside this repository. If you run out of time, write the report with what you have and list what you didn't get to.

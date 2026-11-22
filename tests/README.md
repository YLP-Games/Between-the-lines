# Tests

Browser tests for Between the Lines, written with [Playwright](https://playwright.dev). The app needs no build; these tests open `../index.html` in a real browser and use it the way a person would: opening PDFs, PowerPoint and Word files, writing notes, drawing, side notes, tables, journal entries, Google Drive / OneDrive (with Google and Microsoft faked), iPad touch and Apple Pencil, and so on. Each test prints one `ok …` line per check and ends with `no page errors`.

## Run them

```sh
cd tests
npm install
npx playwright install chromium webkit   # Chromium, plus WebKit (Safari's engine)
npm test                                 # everything, in Chromium
npm run test:webkit                      # everything that can run in WebKit
node run.js tablet sideink               # just some tests
node tablet.js                           # one test on its own (prints every check)
BROWSER=webkit node e2e.js               # one test in WebKit
CHROME_PATH=/path/to/chrome node run.js  # use an installed Chrome (the extension test needs Chrome 151+)
```

The extension test needs **Chrome for Testing** or **Chromium** 151 or newer. Google Chrome itself (137 and newer) refuses to load an extension from the command line, so with it the test says so and skips. Get Chrome for Testing with `npx @puppeteer/browsers install chrome@stable` and point `CHROME_PATH` at the `chrome` it prints.

`SWEEP-PROMPT.md` is a prompt for a coding agent to do a complete test sweep and analysis of the app.

Screenshots that tests take go to `tests/shots/` (not saved in git).

## Notes

- The CDN libraries the app loads (pdf.js, JSZip, KaTeX, mammoth, docx-preview, spell-check dictionaries, fonts) are served from `node_modules`, so the tests run offline.
- The UK English spell-check list (LibreOffice's `en_GB`, by Marco A.G. Pinto, LGPL; see `dict/README_en_GB.txt`) and the common-word lists (SCOWL, from `wordlist-english`) are saved in `dict/`; the US list and Typo.js come from `node_modules`. `spelling.js` measures the spell checker on the word lists in `spell/` (see the top of that file; the `holdout-*` files are the ones never used for tuning) and drives the menu, the language choice and the word-list cache. `SPELL_REPORT=1 node spelling.js` only prints the numbers, and `APP=/path/to/older/index.html` measures an older copy.
- `assets.js` writes `nbfile.html`, which `driveshare.js` and `trash.js` read: `run.js` runs it first.
- `prefsync.js` checks that settings follow your Google account: they go to `settings.json` in Drive's hidden app folder (faked by `appData` in `drivemock.js`, which the other Drive tests use too) and come back after the browser's data is wiped.
- `syncsafe.js` checks that no words are lost: with the same notebooks open in two tabs, when you switch notebooks before a change has gone to Google Drive or OneDrive, and with a notebook synced to Drive by an older version of the app. Its parts all run even if one fails; `node syncsafe.js tabs` (or `tablist`, `switch`, `opened`, `legacy`, `legacyedit`) runs only those.
- `tablet.js`, `sideink.js`, `hover.js`, `guide.js`, `guides.js`, `table.js`, `organise.js`, `blankshape.js`, `ios.js` and `audit2.js` use Chrome DevTools features (touch and Apple Pencil emulation, CPU throttling, PDF printing), so they only run in Chromium.
- `ios.js` serves the app on a local web address (the Add to Home Screen card only shows on the web), pretends to be Safari on an iPad, an iPhone or an older iOS, and checks the card, Install as an app, the iPad layout and two-finger undo.
- WebKit in Playwright is the engine behind Safari, but not Safari itself: for the real iPad, also try the iOS Simulator (Xcode) and Safari's Web Inspector.
- Where Playwright's WebKit behaves unlike Safari, `harness.js` makes up for it (in WebKit only): a Blob request body goes as bytes so the fake Drive and OneDrive can read it, going offline is done by hand (Playwright's own offline also blocks the page's `blob:` addresses), and the menu WebKit opens for a right-click the page leaves alone is kept closed (it would take all mouse input after it). `clipText(page)` reads the clipboard and `copyKeys(page)` presses Ctrl+C in a way that works in both engines. `copynotes.js` runs only in Chromium: Playwright's WebKit fires no paste event for Ctrl+V with nothing editable in focus. A WebKit context is like a private window: Blobs can't be stored in IndexedDB there (the app keeps their bytes instead), and the spell checker's cache is gone after a reload.
- `audit2.js` checks one fix per section (`node audit2.js worker print` runs only those): pdf.js in a Web Worker, measureStrip's layout work, the ribbon's spare strip, the Show toolbar pill, the writing guide under drawers, the phone title bar, invisible note handles, contrast of the app's text in both themes, the split-view pane, and Ctrl+P. It reads the printouts with poppler's `pdftotext`, `pdfinfo` and `pdfimages`, and skips that part if they are not installed.
- `a11y.js` runs axe-core (`@axe-core/playwright`) on the start screen, a notebook, Help and settings, each ribbon tab and the drawing toolbar, in light and dark, and fails on any critical or serious problem. `narrow.js` checks the page never scrolls sideways at 320 and 390px (start screen, notebook, ribbon tabs, Help and settings, drawing toolbar, add menu); `SHOT=name` sets the prefix of its 320px screenshots in `shots/`.

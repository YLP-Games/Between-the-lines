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
```

Screenshots that tests take go to `tests/shots/` (not saved in git).

## Notes

- The CDN libraries the app loads (pdf.js, JSZip, KaTeX, mammoth, docx-preview, spell-check dictionaries, fonts) are served from `node_modules`, so the tests run offline.
- `assets.js` writes `nbfile.html`, which `driveshare.js` and `trash.js` read: `run.js` runs it first.
- `tablet.js`, `sideink.js`, `hover.js`, `guide.js`, `guides.js`, `table.js`, `organise.js`, `blankshape.js` and `ios.js` use Chrome DevTools features (touch and Apple Pencil emulation, CPU throttling, PDF printing), so they only run in Chromium.
- `ios.js` serves the app on a local web address (the Add to Home Screen card only shows on the web), pretends to be Safari on an iPad, an iPhone or an older iOS, and checks the card, Install as an app, the iPad layout and two-finger undo.
- WebKit in Playwright is the engine behind Safari, but not Safari itself: for the real iPad, also try the iOS Simulator (Xcode) and Safari's Web Inspector.

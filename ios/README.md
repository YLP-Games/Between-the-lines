# Between the Lines for iPad

The iPad app is the web app (`../index.html`) in a window of its own, with what a web page can't do added around it.
Nothing is written twice: the app carries a copy of the page and of the libraries it uses, made on every build by `make-web.py`.

## What the app adds

- **Works with no connection, from the first start.** The page, the PDF, PowerPoint and Word readers, the maths, the spelling
  dictionaries and the fonts are all inside the app.
- **Apple Pencil double tap and squeeze.** They do what is chosen in Settings › Apple Pencil: swap with the eraser, go back to
  the last tool, or show the drawing tools.
- **Open with.** PDFs, PowerPoint and Word files, pictures, Markdown, text and notebook files can be sent to the app from the Files app
  or from another app's Share sheet.
- **Download goes to the Share sheet**: Save to Files, AirDrop, Print, or another app.
- **Its own storage.** Notebooks are kept in the app, apart from Safari's, and are not cleared with Safari's website data.
- The strip behind the clock takes the page's colour (light or dark, as chosen in the app), and links in notes open in Safari.

Google Drive and OneDrive sign-in are not shown in the app: Google and Microsoft don't allow signing in from a page inside an
app. Both are in the iPad's own file picker (Open) and in the Share sheet (Download) once their apps are installed.

## Put it on your iPad

You need a Mac with Xcode, and an Apple ID (a free one is enough to start).

1. Once: in the `tests` folder run `npm install` (the app's libraries are copied from there).
2. Open `ios/BetweenTheLines.xcodeproj` in Xcode.
3. Click **BetweenTheLines** at the top of the left column, then the **BetweenTheLines** target › **Signing & Capabilities**.
   Under **Team**, choose your Apple ID (Add an Account… if it isn't listed). If Xcode says the bundle identifier is taken,
   change `com.ylpgames.betweenthelines` to something of your own.
4. Plug the iPad into the Mac (or use the same Wi-Fi once it has been plugged in before), unlock it and tap **Trust**.
   On the iPad turn on Settings › Privacy & Security › **Developer Mode** (it restarts).
5. In Xcode pick the iPad next to the play button at the top, and press **Run** (▶).
6. The first time, on the iPad: Settings › General › VPN & Device Management › your Apple ID › **Trust**.

With a free Apple ID the app stops opening after 7 days: press Run again to renew it (your notebooks stay).
With the Apple Developer Program (paid, yearly) it lasts a year, and it can go to other people through TestFlight or the App Store.

To update the app after `index.html` changes, press Run again.

## How it is put together

| File | What it does |
| --- | --- |
| `make-web.py` | Builds `web/` (not in git): `index.html` with the libraries' web addresses pointed at copies in `web/libs` |
| `App/App.swift` | Starts the app and passes on files opened with it |
| `App/WebViewController.swift` | The page, the Pencil, Download, links, the status bar's colour |
| `App/AppFiles.swift` | Serves `web/` to the page at `btl://app/` |

The page knows it is in the app by `window.webkit.messageHandlers.btl`, and the app calls `btlApp.open(…)` and
`btlApp.pencil(…)` in it (see "the iPad app" in `index.html`). `tests/app.js` checks the page's side of this in a browser.

## Checking it in the simulator

A debug build takes these when started (for example with `xcrun simctl launch <device> com.ylpgames.betweenthelines …`):

- `-btlOpen <file>` hands the page a file, as the Files app would
- `-btlPencil eraser|previous|palette` does what a double tap of the Pencil set to that would
- `-btlRunJS <file>` runs a script in the page and writes what it returns to the app's `Documents/btl-result.txt`
- `-btlAutoSave YES` writes a download's name and size to `Documents/btl-saved.txt` instead of showing the Share sheet

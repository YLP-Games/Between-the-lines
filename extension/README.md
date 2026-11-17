# Between the Lines for Chrome (and Edge, Brave, Arc, Opera)

A small browser extension that sends documents to [Between the Lines](https://ylp-games.github.io/Between-the-lines/) so you can take notes on them straight away.

- **PDFs you open in the browser** (from your course website, an email, a search result, or a PDF on your computer) open in Between the Lines instead of the browser's own PDF viewer. If Between the Lines is already open, the PDF goes into that tab as a new notebook, and the PDF's tab goes back to where you were. Needs Chrome 151 or newer (Edge and other Chromium browsers once they reach the same version); older browsers keep their viewer, and you use the button or the right-click menu instead.
- **PDF, PowerPoint and Word files you download** are offered with a notification (and in the extension's pop-up): one click opens them in Between the Lines. Or set them to open straight away, or to be left alone.
- **Right-click a link** → *Open link in Between the Lines*, or press **Alt+Shift+B** (or the toolbar button → *Open this tab in Between the Lines*) on a tab showing a document.
- In the pop-up: choose **Open them in Between the Lines**, **Ask me each time**, or **Keep the browser’s own viewer**; and **View “…” in the browser’s viewer** shows the last PDF the browser's way, just that once.

Files are fetched with your browser's own sign-ins (so course websites work), handed to the Between the Lines tab, and saved there like a file you opened with **Open**. Nothing is sent anywhere else.

## Install it (no store needed)

The easy way: in Between the Lines, open **Help & settings → Get the browser extension** (or press Ctrl+K and type "extension"). It downloads the extension as one zip and shows these steps.

1. Download it: **Download the extension** in Between the Lines (or, on GitHub, **Code → Download ZIP** and use its `extension` folder). Unzip it and keep the folder somewhere permanent.
2. Open `chrome://extensions` (Edge: `edge://extensions`), switch on **Developer mode** (top right), and press **Load unpacked**.
3. Choose the `extension` folder. Pin **Between the Lines** to the toolbar (the puzzle-piece menu → pin).
4. For PDFs on your own computer (`file://…`), open the extension's **Details** and switch on **Allow access to file URLs**.

To update it, replace the folder's files and press the reload arrow on its card in `chrome://extensions`.

## Put it in the Chrome Web Store (optional, for other people)

Zip the contents of this folder (`manifest.json` at the top level of the zip) and upload it at the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) (a one-off US$5 registration). The review asks why it needs each permission:
- *access to all sites*: to fetch the document you chose, with your sign-ins, and to hand it to the Between the Lines tab;
- *downloads*: to offer the PDF, PowerPoint and Word files you download;
- *notifications*: to ask whether to open a download;
- *tabs*, *scripting*: to find the Between the Lines tab and give it the file;
- *webRequest*: to read a PDF's name from the server's reply (Chrome gives the PDF page only its type);
- *contextMenus*, *storage*: the right-click item and your settings.

Edge Add-ons (free) takes the same zip.

## Other ways in, without this extension

- **Install the app** (Chrome or Edge: the install icon in the address bar, or Help & settings → Install as an app). The installed app is then in **Open with** for PDF, PowerPoint and Word files on Windows, macOS, Linux and ChromeOS. To make it the default for PDFs: Windows *Settings → Apps → Default apps*; macOS *Get Info → Open with → Change All*. If you also set `chrome://settings/content/pdfDocuments` to **Download PDFs**, every PDF you click downloads and opens in Between the Lines.
- **Android**: install the app from Chrome, then **Share** a PDF (from Chrome's downloads, Files or Gmail) to Between the Lines.
- **iPad**: the Between the Lines iPad app (the `ios` folder) appears in **Open in…** and the Share sheet in Safari, Chrome and Files.

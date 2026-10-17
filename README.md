# Between the Lines

A simple web page for taking notes on lecture slides.

## The workspace

- **Notebooks**, Notion style: every file you open becomes its own notebook in the **sidebar** (left), with its own notes, Back / Forward history and place on the page. Click a notebook to switch; the one you're in shows thumbnails of its pages. **New notebook** starts one with a blank page, and each notebook's **⋯** renames or deletes it (double-click the name in the title bar to rename too). **Insert › Add a file here** adds a file to the notebook you're in instead of opening a new one. Hide the sidebar with **«** (Ctrl+\\) and point at the left edge of the window to peek at it.
- **Split view**: read a second notebook beside the one you're writing in. Use **Open beside** in a notebook's **⋯** menu, drag the notebook onto the right half of the page, or press Ctrl+K and choose **Open beside…** (Alt+Enter on a notebook result). The notebook beside is read-only: you can scroll it, jump to a page, point at its pencil icons and copy its text. Drag the divider to resize the two halves; **Swap** switches which notebook you write in, and **×** closes it. On a narrow screen it opens as a drawer.
- **Title bar**: the notebook's name and a *Saved in this browser* indicator, Back / Forward (undo and redo), **Focus**, **Study mode**, **Open**, **Download** and Help. The buttons at each end show or hide the sidebar and the **Notes** panel.
- **Toolbar tabs**, like Word's ribbon:
  - **Home**: font, text size (type any size and press Enter, or pick one), colours and favourite colours, bold / italic / underline / strikethrough, superscript and subscript, highlighter, clear formatting, bullet and numbered lists (bullet style and indent size menus) and alignment.
  - **Insert**: a sticky note, formulas, pictures / videos / sound, a blank page after the current page, or remove a page.
  - **Box**: a note box's outline and fill, the colour of its minimised icon, and **Select all notes on this page**.
  - **View**: page layout (Default, A4 or A3, portrait or landscape), Hide / Show notes, the side panels, spell check language, **Open PowerPoint as** (Slides as they look or Editable text), toolbar size (**Full**, **Tabs only** or **Hidden**) and **Clear everything**.
- **Notes panel** (right): write a note at the top and press **Add note** (or Enter) to put it at the bottom of the page you're on, or **Sticky** to stick it on that page; drag **Sticky** onto any page to put it exactly there. Below that, every note in the notebook, listed by page: search them, filter by icon colour, and click one to jump to it (a minimised note opens). **Add a note** in the sidebar opens it ready to write.
- **Status bar**: which page you're on, how many notes there are (pinned, minimised), and Hide / Show notes.
- **Focus mode** (**Focus** in the title bar, or Ctrl+Shift+F) hides the toolbar, both side panels and the status bar so only your pages and notes are on screen. **Exit focus** (top right) or **Esc** brings everything back. You can also close each panel on its own with its ×, or shrink the toolbar to tabs only with the arrow at the end of the tabs.
- The look is pencil on paper: hand-drawn borders, a handwritten interface font and a dotted paper background (a chalkboard in dark mode). Your slides stay exactly as they are.
- On a phone the panels open as drawers over the page, and the toolbar tabs scroll sideways.

## Taking notes

- **Open** a **PDF**, or drop it anywhere on the page. Each page shows exactly as it is, with background graphics, side bands and slide numbers removed. You can select and copy text from the pages.
- Point at a spot on a page and press **+ Add here** to add a **Note** there: the page opens up at the nearest gap between lines for you to type in your own font, size and colour (handwriting styles and standard fonts). **Right-click** the button (or the dashed line; press and hold the button on a touch screen) for a menu like Notion's: **Note**, **Sticky note** (put on top of the page there) or **Equation** (a formula in the gap). Point at an option or use the arrow keys, type to search, Enter to add, Esc to close.
- In a note, type **/** (at the start, or after a space) for the same menu at the cursor: add an equation, or turn the note into a sticky note and back. What you type after the slash searches it.
- **Sticky notes** are yellow paper on top of the page. Drag one by its tape to move it anywhere, even onto another page; it shows in the Notes panel as a sticky note and in the PDF as you see it.
- **PowerPoint (.pptx)** files open as the slides look: each slide is drawn with its positioned text, theme colours and fonts, backgrounds, pictures, shapes, tables, charts, grouped shapes and SmartArt, then shown like a PDF page (a picture with its text on top you can select and copy), so notes go between the lines exactly as on a PDF. Complex animations and SmartArt may still differ, and fonts that aren't on your device are replaced by similar ones; for an exact copy, save the slides as a PDF (File › Save as › PDF) and open that. Choose **Open PowerPoint as › Editable text** (View tab, Help & settings or the welcome page) to rebuild the slides as text you can type inside, as before; the tip under a file you've just opened can reopen it the other way. A slide that can't be drawn is rebuilt as text on its own.
- **Word (.docx)** files open as editable text that keeps their fonts, colours, tables, lists, headers and pictures, one page for each page break, and you can type inside sentences too. They are drawn with [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) (loaded the first time you open a Word file, then kept for offline use); if it can't load, the plainer reader is used. A few pictures (old EMF or WMF drawings) may not come through. Pictures open as pages.
- Notes sit in boxes. A box's handles show only when you point at it (or tap it on a touch screen), so the page stays clear. Drag a box's edges to resize it, or its move handle to move it across the page or between other lines. Pink guide lines show when it lines up with other notes; it gently snaps only within a few pixels, and holding **Alt** or **Shift** turns snapping off.
- Each note's handles: **float** it on top of the page (like "in front of text" in Word), **minimise** it to a small pencil icon (it shows the note when you point at it, opens when clicked, and can be dragged aside), and **pin** it so it stays open.
- **Colour-code** the pencil icons by topic: right-click one (press and hold on a touch screen), or use **Box › Icon colours**. Save **favourite colours** with the star next to the text colour.
- **Formula** inserts a formula: type it plainly, e.g. `w_i = (P_i)/(sum_(i=1)^N P_i)`, or use the symbol buttons, with a live preview. Click a formula to edit it.
- **Picture, video or sound** inserts media into a note; you can also paste or drop pictures straight into a note. Click a picture or video to resize it, add a note under it, or remove it.
- **Spell check**: misspelt words get a red wavy line; right-click one (or tap it) for suggestions, **Add to dictionary** or **Ignore**. Your dictionary and favourite colours are in **Help & settings**.
- **Select all** (Ctrl+A outside a note) selects every note on the page to restyle, move (drag or arrow keys) or delete together.
- **Back / Forward** (Ctrl+Z / Ctrl+Y) undo and redo any change.
- **Study mode** makes everything read-only while you revise; the editing tabs are put away and notes can still be opened and minimised.

## Saving

- Everything is saved automatically in your browser; the title bar says if the browser's storage is full or blocked.
- **Download** a **PDF** (in the layout you picked, with notes on the page, as clickable PDF comments, or left out) or a **notebook file** (one .html file you can open later on any device, or with Open, to keep editing). Ctrl+S opens the Download menu. The same menu can also save them to Google Drive (see below).

## Google Drive

Notebooks can be opened from, saved to, and shared through Google Drive. The site owner registers the site with Google once (see the set-up below); after that, every visitor signs in with their own Google account, and their files stay in their own Drive. It only works on the hosted site (https://ylp-games.github.io/Between-the-lines/, or `http://localhost:8000` while testing), not on a file opened from disk and not in a preview. The page asks for the `drive.file` permission only: it can reach files you pick with Google's file picker and files it saves itself, never the rest of your Drive. With that permission the page can also share files it saved or that you picked. Until the site owner does the set-up below, the Drive buttons show a message saying Drive isn't set up yet.

- **Open from Google Drive** (the sidebar, or the link on the welcome screen): pick one or more PDF, PowerPoint, Word, Markdown or text files, pictures, notebook `.html` files, Google Slides (opened as a PDF) or Google Docs (opened as a Word file). Each becomes its own notebook. The picker has tabs for **My Drive** (open folders to browse, and Shared drives), **Shared with me**, **Recent** and **Starred**, so files other people have shared with you can be opened too.
- **Download › Notebook to Drive** and **PDF to Drive**: the first time this makes `<name> (notes).html` (or `.pdf`) in the folder the file was opened from; after that it updates that same file. If the file has been deleted from Drive, a new one is made.
- **Download › Share…** (or **Share via Google Drive…** in a notebook's ⋯ menu in the sidebar): saves the notebook file to Drive first (or the PDF, if you choose that in the dialog), then opens a small dialog. **Add people** by email (several, separated by commas) as Viewer, Commenter or Editor, with an optional email notice and message; see **People with access** and remove anyone but the owner; set **General access** to Restricted or Anyone with the link (Viewer or Commenter); **Copy link** or **Open in Drive**. People you share the notebook file with can open it in Between the Lines (**Open › From Google Drive**) to see your notes, or download it. If Drive refuses (for example, your organisation doesn't allow sharing outside it), the dialog says why.
- **A notebook shared with you to view only**: opening its `.html` file from **Shared with me** works as normal. Since you can't change the original, **Notebook to Drive** saves a copy called `<name> (my copy).html` in your own Drive instead, and says so.
- **Help & settings › Google Drive** shows who is connected and has a **Disconnect** button.

### Set-up (for the site owner, once)

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project.
2. Under **APIs & Services › Library**, enable the **Google Drive API** and the **Google Picker API**.
3. Under **OAuth consent screen**, choose **External**, fill in the app name and your email, and add the scope `https://www.googleapis.com/auth/drive.file`. Then decide who can sign in: while the app's publishing status is *Testing*, only the Google accounts listed as **test users** (at most 100) can sign in, and everyone else is turned away. To let anyone sign in, press **Publish app** so that it shows **In production**. `drive.file` is a non-sensitive scope, so Google does not ask for its full security review; you only need the app name, a support email and the consent-screen details filled in.
4. Under **Credentials › Create credentials › OAuth client ID**, choose **Web application** and add these **Authorised JavaScript origins**: `https://ylp-games.github.io` (and `http://localhost:8000` for testing). No redirect URIs are needed.
5. Under **Credentials › Create credentials › API key**, restrict it to **Websites** (HTTP referrer) `https://ylp-games.github.io/*` (and `http://localhost:8000/*` for testing), and under **API restrictions** to the **Google Picker API**.
6. Paste both into `GDRIVE` at the top of the script in `index.html`, then push:

   ```js
   const GDRIVE = {clientId: '1234567890-abc….apps.googleusercontent.com', apiKey: 'AIza…'};
   ```

Both values are public by design (they are in every page that uses Google sign-in); the origin and referrer restrictions are what protect them. The Picker's app id is worked out from the client ID (the number before the first dash).

## Use it

Open it at **https://ylp-games.github.io/Between-the-lines/**, or open `index.html` in a browser. The app is a single file with no build step.

**Install it as a desktop app**: in Chrome or Edge, press **Install as an app** at the bottom of the sidebar (or the install icon in the address bar). It then opens in its own window, works offline, and appears in "Open with" for PDF, PowerPoint and Word files. `manifest.webmanifest`, `sw.js` (the offline cache) and `icons/` make this work; they are only used when the site is served from the web.

Pushing to `main` publishes the site to GitHub Pages automatically (`.github/workflows/static.yml`).

# Between the Slides

A simple web page for taking notes on lecture slides.

## The workspace

- **Title bar**: the file's name and a *Saved in this browser* indicator, Back / Forward (undo and redo), **Focus**, **Study mode**, **Open**, **Download** and Help. The buttons at each end show or hide the **Pages** and **Notes** panels.
- **Toolbar tabs**, like Word's ribbon:
  - **Home**: font, text size (type any size and press Enter, or pick one), colours and favourite colours, bold / italic / underline / strikethrough, superscript and subscript, highlighter, clear formatting, bullet and numbered lists (bullet style and indent size menus) and alignment.
  - **Insert**: formulas, pictures / videos / sound, a blank page after the current page, or remove a page.
  - **Box**: a note box's outline and fill, the colour of its minimised icon, and **Select all notes on this page**.
  - **View**: page layout (Default, A4 or A3, portrait or landscape), Hide / Show notes, the side panels, spell check language, toolbar size (**Full**, **Tabs only** or **Hidden**) and **Clear everything**.
- **Pages panel** (left): a thumbnail of every page with its title and how many notes it has. Click one to jump there; the page you're on is marked.
- **Notes panel** (right): every note listed by page. Search them, filter by icon colour, and click one to jump to it (a minimised note opens).
- **Status bar**: which page you're on, how many notes there are (pinned, minimised), and Hide / Show notes.
- **Focus mode** (**Focus** in the title bar, or Ctrl+Shift+F) hides the toolbar, both side panels and the status bar so only your pages and notes are on screen. **Exit focus** (top right) or **Esc** brings everything back. You can also close each panel on its own with its ×, or shrink the toolbar to tabs only with the arrow at the end of the tabs.
- On a phone the panels open as drawers over the page, and the toolbar tabs scroll sideways.

## Taking notes

- **Open** a **PDF**, or drop it anywhere on the page. Each page shows exactly as it is, with background graphics, side bands and slide numbers removed. You can select and copy text from the pages.
- Point at a spot on a page and press **+ Add note here**. The page opens up at the nearest gap between lines, and you type in your own font, size and colour (handwriting styles and standard fonts).
- **PowerPoint (.pptx)** and **Word (.docx)** files open as text with their formatting, and you can type inside sentences too. Pictures open as pages.
- Notes sit in boxes. Drag a box's edges to resize it, or its move handle to move it across the page or between other lines. Pink guide lines show when it lines up with other notes; it gently snaps only within a few pixels, and holding **Alt** or **Shift** turns snapping off.
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
- **Download** a **PDF** (in the layout you picked, with notes on the page, as clickable PDF comments, or left out) or a **notebook file** (one .html file you can open later on any device, or with Open, to keep editing). Ctrl+S opens the Download menu.

## Use it

Open it at **https://ylp-games.github.io/Between-the-lines/**, or open `index.html` in a browser. It is a single file with no build step.

Pushing to `main` publishes the site to GitHub Pages automatically (`.github/workflows/static.yml`).

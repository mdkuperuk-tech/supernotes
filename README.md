# SuperNotes

Handwritten notebooks, a daily journal and a daily to-do — installable on iPad, MacBook and
Android, working offline, syncing to your own Google Drive.

Everything runs in your browser. There is no SuperNotes server and no SuperNotes account:
your notes live in the browser's local database on each device, and Drive is the only place
they ever leave it — a folder you own, using a permission scope that lets the app see nothing
in your Drive except the files it created itself.

---

## 1. Put it online (once, ~5 minutes)

The app has to live at an `https://` address for two reasons: iPadOS will only install a web app
from one, and Google will only authorize sign-in from one.

### Option A — GitHub Pages (free, permanent)

1. Create a free account at [github.com](https://github.com) if you don't have one.
2. Click **+ → New repository**. Name it `supernotes`. Set it to **Public**. Create it.
3. On the empty repo page, click **uploading an existing file**.
4. Unzip `supernotes.zip` and drag **everything inside it** — `index.html`, `sw.js`,
   `manifest.webmanifest`, and the `css`, `js` and `icons` folders — into the upload area.
   Drag the folders themselves, not their contents one at a time.
5. Click **Commit changes**.
6. Go to **Settings → Pages**. Under *Build and deployment*, set Source = **Deploy from a branch**,
   Branch = **main**, folder = **/ (root)**. Save.
7. Wait about a minute, then refresh. Your address appears at the top, in the form
   `https://YOURNAME.github.io/supernotes/`.

Write that address down — step 2 needs it.

### Option B — Netlify Drop

Go to [app.netlify.com/drop](https://app.netlify.com/drop), drag the unzipped folder onto the page,
and sign up with a free account when prompted to keep the site. You get a random address you can
rename in **Site settings → Change site name**.

---

## 2. Connect Google Drive (one tap per device)

The Google project is already set up and its OAuth client ID is compiled into `drive.js`, so
**every device just opens Settings and taps Connect Google Drive** — nothing to paste, nothing
to configure. A browser OAuth client ID is public by design; it travels in every sign-in request
the page makes. What protects it is the authorised-JavaScript-origin restriction on the project,
which only accepts it from this site.

The steps below are only needed if you ever rebuild this against a different Google account.

1. Go to [console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate),
   signed in as **mdkuper.uk@gmail.com**. Name the project **SuperNotes**. Create.
2. **APIs & Services → Library**. Search **Google Drive API** → Enable. Nothing else —
   no other API is used and no billing account is attached.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create
   - App name: `SuperNotes`, support email and developer email: your Gmail
   - **Scopes**: Add `https://www.googleapis.com/auth/drive.file` (search "drive.file")
   - **Test users**: add `mdkuper.uk@gmail.com`
   - Save through to the end.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `SuperNotes web`
   - **Authorised JavaScript origins → Add URI**: paste your address from step 1, with **no
     trailing slash and no path** — for example `https://yourname.github.io`
     (origin only: scheme + host, nothing after it)
   - Create. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).
5. Open SuperNotes → **gear icon → Settings**, paste the Client ID into *OAuth client ID*,
   click **Save keys**, then **Connect Google Drive** and approve.

Google will warn that the app "isn't verified" — that's expected for an app only you use.
Click **Advanced → Go to SuperNotes (unsafe)**. It's your own project; there is nothing on the
other side but the code in this folder.

### Handwriting → text

Deliberately not built in. Every handwriting-recognition engine a browser can reach — Google
Cloud Vision, MyScript, Azure Read — is a paid cloud service, and this app is built to cost
nothing to run.

On iPad there is a free alternative that is arguably better: tap into any text box and write
with the Apple Pencil. iPadOS **Scribble** converts it on-device, instantly, with no network
call, no API key and no account.

---

## 3. Install it on your devices

- **iPad / iPhone (Safari):** open the address → Share button → **Add to Home Screen**.
- **MacBook (Safari):** File → **Add to Dock**. In Chrome: the install icon in the address bar.
- **Huawei / Android (Chrome):** menu → **Add to Home screen** / **Install app**.

After installing, it opens full-screen with its own icon and runs with no connection.

---

## What's in it

**Writing.** Eleven pens — pen, ballpoint, gel, fountain, quill, brush, felt-tip, pencil, crayon,
pastel and marker — plus a highlighter, each with five widths and a custom size slider. Tap the
pen slot when it is already active to switch nib; each entry previews its own stroke. Apple Pencil pressure and tilt drive line weight; strokes are smoothed and
tapered so handwriting comes out cleaner than raw input. Stroke eraser, lasso select with
move/scale/duplicate/recolour, text boxes, photo import with resize handles, voice notes.

**Shape straightening.** Draw a rough circle, box, triangle, line or arrow and hold the pen still
for half a second before lifting — it snaps to a clean shape. The Shape tool does it on every stroke.

**Paper.** Blank, lined, narrow, college, grid, graph, dot grid, isometric, Cornell, day planner,
music staff, storyboard, journal and to-do templates, in six paper colours including a dark one.
Change one page or the whole notebook.

**Journal.** Dated pages with a gratitude block, highlight-of-the-day, open notes and a mood
strip. Voice notes and photos drop straight onto the page.

**Daily to-do.** Top 3 personal, top 3 business, everything else, with real tappable checkboxes.
*Carry unfinished to a new day* copies the rows you didn't tick onto a fresh dated page.

**Daily planner.** A fuller dated page: top-3 personal and business, everything else, an open
schedule where you write your own times, eight tappable water glasses, a meals block for
breakfast/lunch/dinner/snacks, *remember today*, and free notes. Ticks and filled glasses carry
through to the exported PDF.

**Erasing.** Three modes, on the eraser's own popover along with five sizes. *Precision* rubs out
only the part you touch, splitting a line rather than deleting it. *Whole stroke* removes the
entire line. *Stroke + photo* also removes photos. A ring shows the eraser's true size as you work.

**Swapping to the eraser.** Apple exposes the Apple Pencil double-tap only to native apps
(`UIPencilInteraction`); there is no JavaScript API for it, so no web app can catch that gesture.
Two substitutes are wired instead: **tap the page with two fingers** to flip between your pen and
the eraser and back, or press **E** on a keyboard. Tapping the eraser slot while it is already
selected opens its size and mode picker, the same way the pen slot works.

**Selecting.** With the Select tool, tap an image to grab it — move it, scale it from the corners,
duplicate or delete it. Tap writing to grab the nearby ink, or draw a loop around a group.

**Covers.** Sixteen designs — linen, leather, aurora, marble, arcs, minimal, blueprint, waves,
terrazzo, dune, noir, folio, ridge, bloom, spine, sunset — in twelve colours. They're vector,
so they stay sharp as the shelf thumbnail and as page 1 of an exported PDF.

**Sharing.** Any page or whole notebook exports to PDF; the share sheet hands it to WhatsApp,
Mail, Files or anywhere else. Page-as-image export goes to Photos via **Save Image**. Selections
can be shared on their own. PDFs can also be dropped straight into your Drive folder.

**Sync.** Each notebook is one JSON file in a `SuperNotes` folder in your Drive, with images and
audio embedded. Newest edit wins per notebook. Everything saves locally the instant you write it;
Drive catches up when there's a connection.

---

## What this costs

Nothing, and there is no path by which it can start costing something.

- **Hosting** — GitHub Pages is free for public repositories. Limits are 1 GB of site size and
  100 GB/month of bandwidth; this site is about 250 KB.
- **Google** — only the Drive API is enabled, which is free. No billing account is attached to
  the Cloud project and no card is on file, so a runaway call fails rather than charges.
- **The one real ceiling** is your Google account's free 15 GB of Drive storage, shared with
  Gmail and Photos. Notebook files are small; embedded photos and voice recordings are what
  would eventually add up.

## About iCloud

No third-party app — web or native — can write into your personal iCloud Drive folders. Apple's
only web route is [CloudKit JS](https://developer.apple.com/documentation/cloudkitjs), which
reaches an app's own private container, requires a paid Apple Developer membership, and still
never touches the iCloud Drive folders you see in Files.

What does work: export a PDF or image and use **Share → Save to Files → iCloud Drive**. That copy
then syncs through iCloud like any other file. If you want that automatic, Google Drive is the
route the app takes.

## About the App Store

A real App Store listing needs a native iOS build (Xcode on the Mac, a $99/yr Apple Developer
account, and App Review). Installed as a home-screen app, this behaves the same way day to day —
own icon, full screen, offline — and it also runs on the MacBook and the Huawei, which a native
iPad build would not. If you later want the native version, the design here is the specification
for it, and PencilKit would take over the ink engine.

---

## Files

```
index.html               shell
manifest.webmanifest     install metadata
sw.js                    service worker (offline)
style.css                all styling
app.js                   shelf, notebook creation, settings, sync orchestration
editor.js                the page canvas: input, tools, selection, export
ink.js                   stroke smoothing, pressure/velocity width, shape recognition
papers.js                paper and template rendering
covers.js                the sixteen cover designs
store.js                 IndexedDB persistence + portable backup bundles
drive.js                 Google Drive sync + Cloud Vision OCR
pdfout.js                dependency-free PDF writer and share helpers
ui.js                    icons, modals, popovers, toasts
icon-*.png               app icons
```

No build step, no dependencies, no bundler. Edit a file, reload.

## Backups

**Notebook menu → Export backup** writes a `.snb.json` containing the notebook, its pages, and
every embedded image and recording. **Settings → Restore from a backup file** reads it back.
Worth doing occasionally even with Drive sync on.

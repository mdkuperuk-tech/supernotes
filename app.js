/* app.js — shell: library shelf, notebook creation, settings, sync orchestration */

import * as S from './store.js';
import * as Drive from './drive.js';
import { Editor } from './editor.js';
import { COVER_IDS, coverDataURI, HUES } from './covers.js';
import { PAPER_KINDS, drawPaper, PAGE } from './papers.js';
import { icon, el, toast, modal, confirmDialog, promptDialog, popover, fmtDate, fmtShort, todayKey } from './ui.js';

class App {
  constructor() {
    this.root = document.getElementById('app');
    this.tool = { name: 'pen', color: '#1b1f27', size: 3, prevTool: 'pen', pen: 'pen', eraserSize: 30, eraseMode: 'precise' };
    this.settings = { fingerDraw: false, autoSync: true, pdfCover: true, railPos: 'left', twoFingerSwap: false };
    this.editor = null;
  }

  async start() {
    document.getElementById('boot')?.remove();
    const t = await S.setting('tool'); if (t) this.tool = { ...this.tool, ...t };
    const s = await S.setting('settings'); if (s) this.settings = { ...this.settings, ...s };

    await Drive.init();
    Drive.onChange(() => this.paintSyncChip());

    const nbs = await S.listNotebooks();
    if (!nbs.length) await this.seed();

    this.showShelf();
    this.startSyncLoop();

    window.addEventListener('online', () => this.syncNow(true));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.syncNow(true); });
    window.addEventListener('beforeunload', e => { if (this._dirty) Drive.syncAll().catch(() => {}); });
  }

  saveTool() { S.setting('tool', this.tool); }
  saveSettings() { S.setting('settings', this.settings); }
  notePen() { if (!this._penSeen) { this._penSeen = true; } }
  markDirty() { this._dirty = true; this.paintSyncChip(); }

  /* ---------- first run ---------- */

  async seed() {
    await this.createNotebook({ title: 'Daily Journal', type: 'journal', cover: { design: 'dune', hue: 26, title: 'Daily Journal', subtitle: 'Mark Kuper' }, paper: 'journal' }, false);
    await this.createNotebook({ title: 'Daily To-Do', type: 'todo', cover: { design: 'minimal', hue: 200, title: 'Daily To-Do', subtitle: 'Personal · Business' }, paper: 'todo' }, false);
    await this.createNotebook({ title: 'Notes', type: 'notes', cover: { design: 'aurora', hue: 214, title: 'Notes', subtitle: '' }, paper: 'lined' }, false);
  }

  /* ---------- shelf ---------- */

  async showShelf() {
    this.editor?.destroy(); this.editor = null;
    const nbs = await S.listNotebooks();
    this.root.innerHTML = `
      <div class="shelf">
        <header class="shelf-top">
          <div class="brand"><span class="logo">SN</span><div><h1>SuperNotes</h1><p>Your notebooks, everywhere</p></div></div>
          <div class="spacer"></div>
          <button class="chip sync-chip" data-a="sync"></button>
          <button class="icon-btn" data-a="settings" title="Settings">${icon('gear')}</button>
        </header>

        <div class="quick">
          <button class="qcard j" data-a="quick-journal">${icon('journal')}<div><strong>Today's journal</strong><span>${fmtDate(new Date())}</span></div></button>
          <button class="qcard t" data-a="quick-todo">${icon('todo')}<div><strong>Today's to-do</strong><span>Top 3 personal · Top 3 business</span></div></button>
          <button class="qcard p" data-a="quick-planner">${icon('grid')}<div><strong>Today's planner</strong><span>Schedule · water · meals · notes</span></div></button>
        </div>

        <div class="shelf-head"><h2>Notebooks</h2><button class="primary" data-a="new">${icon('plus')} New notebook</button></div>
        <div class="grid" data-el="grid"></div>
        <p class="foot">Everything is saved on this device the moment you write it${Drive.state.signedIn ? ', then synced to Google Drive' : ''}.</p>
      </div>`;

    const grid = this.root.querySelector('[data-el="grid"]');
    for (const nb of nbs) grid.appendChild(this.card(nb));

    this.root.querySelector('.shelf').addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'new') this.newNotebookFlow();
      if (a === 'settings') this.settingsPanel();
      if (a === 'sync') this.syncNow();
      if (a === 'quick-journal') this.openToday('journal');
      if (a === 'quick-todo') this.openToday('todo');
      if (a === 'quick-planner') this.openToday('planner');
    });
    this.paintSyncChip();
  }

  card(nb) {
    const c = el(`<div class="card">
      <button class="cover" data-open>
        <img alt="" src="${coverDataURI(nb.cover || {}, { title: nb.title })}">
        <span class="type">${{ journal: 'Journal', todo: 'To-do', planner: 'Planner', tabbed: 'Tabs', notes: 'Notes' }[nb.type] || 'Notes'}</span>
      </button>
      <div class="meta"><strong></strong><span>${fmtShort(nb.updatedAt || Date.now())}</span></div>
      <button class="icon-btn tiny more" data-more>${icon('more')}</button>
    </div>`);
    c.querySelector('strong').textContent = nb.title;
    c.querySelector('[data-open]').onclick = () => this.openNotebook(nb);
    c.querySelector('[data-more]').onclick = e => { e.stopPropagation(); this.cardMenu(nb, e.currentTarget); };
    return c;
  }

  cardMenu(nb, btn) {
    const w = el(`<div class="menu">
      <button data-m="rename">${icon('text')}<span>Rename</span></button>
      <button data-m="cover">${icon('book')}<span>Change cover</span></button>
      <button data-m="dup">${icon('copy')}<span>Duplicate</span></button>
      <button data-m="export">${icon('share')}<span>Export backup</span></button>
      <hr>
      <button data-m="del" class="danger">${icon('trash')}<span>Delete</span></button></div>`);
    const p = popover(btn, w);
    w.addEventListener('click', async e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      p.remove();
      if (b.dataset.m === 'rename') { await this.renameNotebook(nb); this.showShelf(); }
      if (b.dataset.m === 'cover') this.coverPicker(nb, () => this.showShelf());
      if (b.dataset.m === 'dup') {
        const bundle = await S.exportNotebook(nb.id);
        bundle.notebook.id = S.uid(); bundle.notebook.title = nb.title + ' copy';
        bundle.notebook.driveFileId = ''; bundle.pages.forEach(pg => { pg.id = S.uid(); });
        await S.importNotebook(bundle);
        this.markDirty(); this.showShelf();
      }
      if (b.dataset.m === 'export') {
        const bundle = await S.exportNotebook(nb.id);
        const { downloadBlob } = await import('./pdfout.js');
        downloadBlob(new Blob([JSON.stringify(bundle)], { type: 'application/json' }), `${nb.title}.snb.json`);
      }
      if (b.dataset.m === 'del') {
        if (await confirmDialog('Delete notebook', `Delete “${nb.title}” and all its pages? If Drive sync is on, it is removed there too.`)) {
          await S.deleteNotebook(nb.id); this.markDirty(); this.syncNow(true); this.showShelf();
        }
      }
    });
  }

  async renameNotebook(nb) {
    const v = await promptDialog('Rename notebook', nb.title);
    if (!v) return null;
    nb.title = v;
    if (nb.cover) nb.cover.title = v;
    await S.saveNotebook(nb);
    this.markDirty();
    return v;
  }

  /* ---------- create ---------- */

  async newNotebookFlow() {
    const types = [
      ['notes', 'Notebook', 'Free-form pages for anything', 'book'],
      ['journal', 'Journal', 'Dated entries, gratitude, voice notes', 'journal'],
      ['todo', 'Daily to-do', 'Top 3 personal, top 3 business, everything else', 'todo'],
      ['planner', 'Daily planner', 'Schedule, water, meals, tasks, notes', 'grid'],
      ['tabbed', 'Tabbed notebook', 'Dividers like HR, Operations, Finance — pages under each', 'pages']
    ];
    let choice = { type: 'notes', paper: 'lined', cover: { design: 'aurora', hue: HUES[Math.floor(Math.random() * HUES.length)] } };
    const body = el(`<div class="newnb">
      <label class="lbl">Name</label>
      <input class="field" data-t placeholder="e.g. Client Notes" value="">
      <label class="lbl">Type</label>
      <div class="types">${types.map(([id, n, d, ic]) => `<button class="type-opt ${id === 'notes' ? 'on' : ''}" data-type="${id}">${icon(ic)}<strong>${n}</strong><span>${d}</span></button>`).join('')}</div>
      <label class="lbl" data-tabslbl style="display:none">Tabs <span class="opt">— separated by commas, rename any time</span></label>
      <input class="field" data-tabs placeholder="HR, Operations, Finance" value="" autocomplete="off" style="display:none">
      <label class="lbl" data-paperlbl>Paper</label>
      <div class="paper-grid" data-papergrid>${PAPER_KINDS.filter(k => !['journal','todo','daily'].includes(k.id)).map(k =>
        `<button type="button" class="paper-opt ${k.id === 'lined' ? 'on' : ''}" data-paper="${k.id}"><canvas width="112" height="158"></canvas><span>${k.label}</span></button>`).join('')}</div>
    </div>`);
    let paperKind = 'lined';
    body.querySelectorAll('[data-paper] canvas').forEach(c => {
      const kind = c.parentElement.dataset.paper;
      const ctx = c.getContext('2d');
      ctx.scale(112 / PAGE.w, 158 / PAGE.h);
      drawPaper(ctx, { w: PAGE.w, h: PAGE.h, paper: { kind, color: 'white' }, meta: { dateLabel: '' } });
    });
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-paper]'); if (!b) return;
      paperKind = b.dataset.paper;
      body.querySelectorAll('.paper-opt').forEach(x => x.classList.toggle('on', x === b));
    });
    modal({
      title: 'New notebook', body, wide: true,
      actions: [
        { label: 'Cancel' },
        { label: 'Choose cover →', primary: true, onClick: () => {
            const title = body.querySelector('[data-t]').value.trim()
              || ({ notes: 'Notebook', journal: 'Journal', todo: 'Daily To-Do', planner: 'Daily Planner', tabbed: 'Tabbed Notebook' })[choice.type]
              || 'Notebook';
            const paper = choice.type === 'journal' ? 'journal' : choice.type === 'todo' ? 'todo' : choice.type === 'planner' ? 'daily' : paperKind;
            const tabNames = choice.type === 'tabbed'
              ? body.querySelector('[data-tabs]').value.split(',').map(x => x.trim()).filter(Boolean)
              : null;
            this.coverPicker({ title, cover: { ...choice.cover, title } }, async nbLike => {
              const nb = await this.createNotebook({ title, type: choice.type, cover: nbLike.cover, paper, tabNames });
              this.openNotebook(nb);
            }, true);
          } }
      ]
    });
    body.addEventListener('click', e => {
      const t = e.target.closest('[data-type]'); if (!t) return;
      choice.type = t.dataset.type;
      body.querySelectorAll('.type-opt').forEach(x => x.classList.toggle('on', x === t));
      const show = choice.type === 'notes' || choice.type === 'tabbed';
      body.querySelector('[data-papergrid]').style.display = show ? '' : 'none';
      body.querySelector('[data-paperlbl]').style.display = show ? '' : 'none';
      const tabbed = choice.type === 'tabbed';
      const tabsField = body.querySelector('[data-tabs]');
      tabsField.style.display = tabbed ? '' : 'none';
      body.querySelector('[data-tabslbl]').style.display = tabbed ? '' : 'none';
      if (tabbed) setTimeout(() => { tabsField.focus(); tabsField.select(); }, 0);
    });
  }

  async createNotebook({ title, type, cover, paper, tabNames }, open = true) {
    const nb = {
      id: S.uid(), title, type: type || 'notes',
      cover: { design: cover?.design || 'aurora', hue: cover?.hue ?? 214, title, subtitle: cover?.subtitle || '' },
      defaultPaper: { kind: paper || 'lined', color: 'white' },
      sections: [],
      createdAt: Date.now(), updatedAt: Date.now(), dirty: true
    };
    const names = (tabNames && tabNames.length) ? tabNames : (type === 'tabbed' ? ['Notes'] : []);
    nb.sections = names.map((n, i) => ({ id: S.uid(), name: n, hue: TAB_HUES[i % TAB_HUES.length] }));
    await S.put('notebooks', nb);
    // one starting page per tab, so every tab opens onto something
    const seed = nb.sections.length ? nb.sections : [null];
    let idx = 0;
    for (const sec of seed) {
      const p = {
        id: S.uid(), notebookId: nb.id, index: idx++, w: 1240, h: 1754,
        paper: { ...nb.defaultPaper },
        sectionId: sec ? sec.id : undefined,
        strokes: [], objects: [],
        meta: ['journal', 'todo', 'planner'].includes(type) ? { date: new Date().toISOString(), dateLabel: fmtDate(new Date()), checks: {} } : {},
        createdAt: Date.now()
      };
      await S.put('pages', p);
    }
    this.markDirty();
    return nb;
  }

  coverPicker(nbLike, done, isNew) {
    let sel = { ...(nbLike.cover || {}) };
    sel.title = sel.title || nbLike.title;
    const body = el(`<div class="coverpick">
      <div class="hues" data-el="hues">${HUES.map(h => `<button class="hue ${h === sel.hue ? 'on' : ''}" data-h="${h}" style="background:hsl(${h},62%,50%)"></button>`).join('')}</button></div>
      <div class="covergrid" data-el="cg"></div>
      <label class="lbl">Cover subtitle (optional)</label>
      <input class="field" data-sub placeholder="e.g. 2026 · Operations" value="${(sel.subtitle || '').replace(/"/g, '&quot;')}">
    </div>`);
    const paint = () => {
      const cg = body.querySelector('[data-el="cg"]');
      cg.innerHTML = COVER_IDS.map(d =>
        `<button class="coveropt ${d === sel.design ? 'on' : ''}" data-d="${d}"><img alt="${d}" src="${coverDataURI({ ...sel, design: d })}"></button>`).join('');
    };
    paint();
    const m = modal({
      title: isNew ? 'Pick a cover' : 'Change cover', body, wide: true,
      actions: [{ label: 'Cancel' }, { label: isNew ? 'Create notebook' : 'Save', primary: true, onClick: async () => {
        sel.subtitle = body.querySelector('[data-sub]').value.trim();
        if (isNew) { done({ cover: sel }); return; }
        nbLike.cover = sel; await S.saveNotebook(nbLike); this.markDirty(); done?.(nbLike);
      } }]
    });
    body.addEventListener('click', e => {
      const d = e.target.closest('[data-d]'), h = e.target.closest('[data-h]');
      if (d) { sel.design = d.dataset.d; paint(); }
      if (h) {
        sel.hue = +h.dataset.h; paint();
        body.querySelectorAll('.hue').forEach(x => x.classList.toggle('on', +x.dataset.h === sel.hue));
      }
    });
    body.querySelector('[data-sub]').oninput = e => { sel.subtitle = e.target.value; paint(); };
  }

  /* ---------- open ---------- */

  async openNotebook(nb) {
    this.editor?.destroy();
    this.root.innerHTML = '';
    this.editor = new Editor(this.root, this);
    await this.editor.open(nb);
  }

  async openToday(type) {
    const nbs = await S.listNotebooks();
    let nb = nbs.find(n => n.type === type);
    if (!nb) {
      const preset = {
        journal: { title: 'Daily Journal', design: 'dune',    hue: 26,  paper: 'journal' },
        todo:    { title: 'Daily To-Do',   design: 'minimal', hue: 200, paper: 'todo' },
        planner: { title: 'Daily Planner', design: 'spine',   hue: 152, paper: 'daily' }
      }[type];
      nb = await this.createNotebook({ title: preset.title, type, cover: { design: preset.design, hue: preset.hue }, paper: preset.paper });
    }
    await this.openNotebook(nb);
    const key = todayKey();
    const idx = this.editor.pages.findIndex(p => p.meta?.date && todayKey(new Date(p.meta.date)) === key);
    if (idx >= 0) this.editor.scrollToPage(idx);
    else { await this.editor.newDatedPage(); }
  }

  /* ---------- settings ---------- */

  async settingsPanel() {
    const d = Drive.state;
    const body = el(`<div class="settings">
      <section>
        <h3>${icon('cloud')} Google Drive</h3>
        <p class="muted">Notebooks sync to a <b>SuperNotes</b> folder in your Google Drive. The app uses the narrow <code>drive.file</code> permission, so it can only ever see files it created itself. Every device is pre-configured — just tap <b>Connect Google Drive</b>.</p>
        <details><summary>Use a different Google project</summary>
          <label class="lbl">OAuth client ID <span class="opt">— leave blank for the built-in one</span></label>
          <input class="field" data-cid placeholder="1234567890-abc....apps.googleusercontent.com" value="${(await S.setting('gdrive.clientId')) || ''}">
          <button data-x="save">Save client ID</button>
        </details>
        <div class="row gap">
          <button class="primary" data-x="${d.signedIn ? 'out' : 'in'}">${d.signedIn ? 'Disconnect' : 'Connect Google Drive'}</button>
          <button data-x="sync">Sync now</button>
        </div>
        <p class="status" data-st>${d.status}: ${d.message}</p>
        <details><summary>How do I get these? (5 minutes, one time)</summary>
          <ol class="howto">
            <li>Go to <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a> and create a project called <b>SuperNotes</b>.</li>
            <li><b>APIs &amp; Services → Library</b>: enable <b>Google Drive API</b>. Nothing else.</li>
            <li><b>OAuth consent screen</b>: External, add your own Gmail as a Test user, scope <code>drive.file</code>.</li>
            <li><b>Credentials → Create credentials → OAuth client ID → Web application</b>. Under <b>Authorised JavaScript origins</b> add exactly: <code data-origin></code></li>
            <li>Copy the client ID into the box above.</li>
          </ol>
        </details>
      </section>
      <section>
        <h3>Drawing</h3>
        <label class="row"><input type="checkbox" data-fd ${this.settings.fingerDraw ? 'checked' : ''}> Draw with finger (off = finger pans, pencil draws)</label>
        <label class="row"><input type="checkbox" data-pc ${this.settings.pdfCover !== false ? 'checked' : ''}> Include the cover as page 1 of exported PDFs</label>
        <label class="row"><input type="checkbox" data-tf ${this.settings.twoFingerSwap ? 'checked' : ''}> Two-finger tap swaps pen and eraser</label>
        <p class="muted small">Off by default: a palm resting on the screen can register as two fingers and flip you to the eraser mid-sentence. The pencil is always rejected-safe either way.</p>
      </section>
      <section>
        <h3>Storage</h3>
        <p class="muted" data-usage>Checking…</p>
        <div class="row gap">
          <button data-x="import">Restore from a backup file</button>
          <button data-x="install">Install on this device</button>
        </div>
      </section>
      <section>
        <h3>Cost</h3>
        <p class="muted">Nothing in SuperNotes can bill you. It is static files on GitHub Pages (free for public repositories) plus the Google Drive API, which is free at any volume you will reach. No paid service is called and no billing account is attached to the Google project. The only ceiling is your Google account's own free 15&nbsp;GB of Drive storage, shared with Gmail and Photos — notebooks are small, but photos and voice recordings do count toward it.</p>
        <p class="muted">Handwriting-to-text is deliberately absent: every engine a browser can reach is a paid cloud service. On iPad, write with the Apple Pencil straight into a text box instead — iPadOS Scribble converts it on-device, free.</p>
      </section>
      <section>
        <h3>About iCloud</h3>
        <p class="muted">No third-party app can write into your personal iCloud Drive folders — Apple's only web route (CloudKit JS) reaches an app's own container and needs a paid developer account. Use <b>Share → Save to Files → iCloud Drive</b> on any PDF or page export to put a copy in iCloud by hand.</p>
      </section>
    </div>`);

    body.querySelector('[data-origin]').textContent = location.origin;
    const m = modal({ title: 'Settings', body, wide: true, actions: [{ label: 'Close', primary: true }] });

    S.usage().then(u => {
      const n = body.querySelector('[data-usage]');
      if (!u) return n.textContent = 'Storage estimate is not available in this browser.';
      n.innerHTML = `Using <b>${mb(u.used)}</b> of about <b>${mb(u.quota)}</b> available on this device.`;
    });

    body.querySelector('[data-fd]').onchange = e => { this.settings.fingerDraw = e.target.checked; this.saveSettings(); };
    body.querySelector('[data-pc]').onchange = e => { this.settings.pdfCover = e.target.checked; this.saveSettings(); };
    body.querySelector('[data-tf]').onchange = e => { this.settings.twoFingerSwap = e.target.checked; this.saveSettings(); };

    body.addEventListener('click', async e => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      const st = body.querySelector('[data-st]');
      try {
        if (b.dataset.x === 'save') {
          await Drive.saveConfig({ clientId: body.querySelector('[data-cid]').value });
          toast('Saved');
        }
        if (b.dataset.x === 'in') { await Drive.signIn(); toast('Connected to Google Drive'); await this.syncNow(); }
        if (b.dataset.x === 'out') { await Drive.signOut(); }
        if (b.dataset.x === 'sync') { await this.syncNow(); }
        if (b.dataset.x === 'import') this.importBackup();
        if (b.dataset.x === 'install') this.promptInstall();
      } catch (err) { toast(err.message, 'error'); }
      st.textContent = `${Drive.state.status}: ${Drive.state.message}`;
    });
  }

  importBackup() {
    const inp = el('<input type="file" accept=".json,application/json" style="display:none">');
    document.body.appendChild(inp);
    inp.onchange = async () => {
      const f = inp.files[0]; inp.remove();
      if (!f) return;
      try {
        const bundle = JSON.parse(await f.text());
        if (!bundle.notebook) throw new Error('That does not look like a SuperNotes backup.');
        bundle.notebook.id = S.uid(); bundle.notebook.driveFileId = '';
        bundle.pages.forEach(p => p.id = S.uid());
        await S.importNotebook(bundle);
        toast('Notebook restored'); this.markDirty(); this.showShelf();
      } catch (e) { toast(e.message, 'error'); }
    };
    inp.click();
  }

  promptInstall() {
    if (window.__bip) { window.__bip.prompt(); return; }
    modal({ title: 'Install SuperNotes', wide: true, body: `
      <p><b>iPad / iPhone (Safari):</b> tap the Share button, scroll down, tap <b>Add to Home Screen</b>.</p>
      <p><b>Mac (Safari):</b> File → <b>Add to Dock</b>. In Chrome: the install icon at the right of the address bar.</p>
      <p><b>Huawei / Android (Chrome):</b> menu → <b>Add to Home screen</b> / <b>Install app</b>.</p>
      <p class="muted">Once installed it opens full-screen with its own icon and works with no connection.</p>`,
      actions: [{ label: 'Got it', primary: true }] });
  }

  /* ---------- sync ---------- */

  startSyncLoop() {
    setInterval(() => { if (this.settings.autoSync && this._dirty) this.syncNow(true); }, 25000);
  }

  async syncNow(quiet) {
    if (!Drive.state.clientId) { if (!quiet) this.settingsPanel(); return; }
    if (!Drive.state.signedIn) {
      if (quiet) return;
      try { await Drive.signIn(); } catch (e) { return toast(e.message, 'error'); }
    }
    try {
      const r = await Drive.syncAll();
      this._dirty = false;
      if (!quiet && !r.skipped) toast(`Synced with Google Drive`);
    } catch (e) { if (!quiet) toast(e.message, 'error'); }
    this.paintSyncChip();
  }

  paintSyncChip() {
    const c = this.root.querySelector('.sync-chip');
    const d = Drive.state;
    if (c) {
      const labels = { off: 'Set up Drive', ready: 'Connect Drive', syncing: 'Syncing…', synced: this._dirty ? 'Pending…' : 'Synced', error: 'Sync issue', offline: 'Offline' };
      c.innerHTML = `${icon('cloud')} ${labels[d.status] || d.status}`;
      c.dataset.state = d.status;
    }
    this.editor?.updateSyncDot?.();
  }
}

const mb = n => n > 1e9 ? (n / 1e9).toFixed(2) + ' GB' : (n / 1e6).toFixed(1) + ' MB';
const TAB_HUES = [214, 152, 26, 292, 338, 184, 44, 258, 6, 92];

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__bip = e; });

const app = new App();
window.app = app;
app.start().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre style="padding:24px;font:14px/1.5 ui-monospace,monospace;color:#c0392b">SuperNotes failed to start:\n\n${err.stack || err}</pre>`;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

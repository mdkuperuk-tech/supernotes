/* editor.js — the page canvas: input, rendering, tools, selection, export */

import * as S from './store.js';
import * as Ink from './ink.js';
import { drawPaper, PAGE, PAPER_COLORS, todoCheckboxes, dailyTargets, pageTargets, INTERACTIVE, roundRect } from './papers.js';
import { icon, el, toast, modal, confirmDialog, promptDialog, popover, fmtDate,
         mondayOf, weekKey, fmtWeek, fmtWeekLong, fmtMonth, monthGrid, fmtQuarter } from './ui.js';

/** Stamps a new page with whatever labels its paper kind needs. */
export function pageMeta(kind, now = new Date(), when = now) {
  const base = { checks: {} };
  if (kind === 'week1' || kind === 'week2') {
    return { ...base, date: mondayOf(when).toISOString(), weekKey: weekKey(when),
             weekPage: kind === 'week1' ? 1 : 2,
             weekLabel: kind === 'week1' ? fmtWeekLong(when) : fmtWeek(when) };
  }
  if (kind === 'month') {
    return { ...base, date: new Date(when).toISOString(), monthLabel: fmtMonth(when), ...monthGrid(when) };
  }
  if (kind === 'goals') {
    return { ...base, date: new Date(when).toISOString(), goalLabel: fmtQuarter(when), checks: { per_1: true } };
  }
  return {};
}
import * as Drive from './drive.js';
import { buildPDF, canvasToJPEG, shareFile, downloadBlob } from './pdfout.js';
import { coverSVG } from './covers.js';

const GAP = 48;
const DPR = () => Math.min(window.devicePixelRatio || 1, 2.5);
const TAB_HUES = [214, 152, 26, 292, 338, 184, 44, 258, 6, 92];
const escapeHTML = t => String(t).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

export const PALETTE = [
  '#1b1f27', '#3d4757', '#8a94a6', '#c0392b', '#e2554a', '#e8823a',
  '#e5b83c', '#5aa85a', '#2f9e8f', '#2f7fd1', '#4b52c4', '#8b4fc0',
  '#c94f8e', '#7b5230', '#ffffff'
];
const HL_PALETTE = ['#ffe14d', '#7bf0a2', '#7ad7ff', '#ff9ecb', '#c8a5ff', '#ffb066'];

/* Palm rejection tuning. iPadOS Safari doesn't reliably report touch contact size
   (PointerEvent.width/height), unlike Android, so a resting hand can't be told from
   a real finger by geometry alone there — the defenses below are ownership- and
   timing-based instead, which work the same on every platform. */
const PEN_GRACE_MS   = 1500;  // a pause between strokes the pencil still "owns" the page for
const PALM_ZONE_MS   = 6000;  // how long a spot stays "known palm" after a rejected contact
const PALM_ZONE_R    = 240;   // px radius of that remembered spot
const PAIR_WINDOW_MS = 350;   // two fingers arriving further apart than this aren't one pinch
const PAN_SLOP_PX    = 10;    // a single finger must travel this far before the page moves
const HOVER_GRACE_MS = 300;   // a hovering Pencil (no contact) shields the page for this long

/* Elements that keep the platform's own touch behaviour (click, focus, caret)
   even inside the drawing surface. Everything else there is ink-only. */
const NATIVE_OK = 'input, textarea, select, a, button, [contenteditable="true"], .tbox';
const EDITABLE  = 'input, textarea, [contenteditable="true"], .tbox';
function nativeOK(t, editableOnly) {
  const n = t && (t.nodeType === 1 ? t : t.parentElement);
  return !!(n && n.closest && n.closest(editableOnly ? EDITABLE : NATIVE_OK));
}
const elOf = t => t && (t.nodeType === 1 ? t : t.parentElement);
/* A Touch (TouchEvent) described the way isPalm() reads a PointerEvent. WebKit
   reports PointerEvent.width/height as 2 × the touch radius, so match that. */
const touchAsPointer = x => ({ pointerType: x.touchType === 'stylus' ? 'pen' : 'touch',
  clientX: x.clientX, clientY: x.clientY, width: (x.radiusX || 0) * 2, height: (x.radiusY || 0) * 2 });
const INK_TOOLS_EXCLUDE = ['eraser', 'lasso', 'text', 'hand'];

export class Editor {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.zoom = 1; this.tx = 0; this.ty = 0;
    this.pages = [];
    this.pageEls = new Map();
    this.undoStack = []; this.redoStack = [];
    this.selection = null;
    this.recorder = null;
    this.renderScale = 1;
    this._pointers = new Map();
    this._rejected = new Set();   // pointer ids judged to be a resting hand — ignored for their whole life
    this._btnTaps = new Map();    // pointer id -> pending tap on an on-page button (see bindInput)
    this._draw = null;
    this._raf = 0;
  }

  /* ================= lifecycle ================= */

  async open(notebook) {
    this.nb = notebook;
    this.nb.sections = this.nb.sections || [];
    this.allPages = await S.getPages(notebook.id);

    // Any page written before this notebook gained tabs belongs to the first tab.
    if (this.nb.sections.length) {
      const first = this.nb.sections[0].id;
      let fixed = false;
      for (const pg of this.allPages) if (!pg.sectionId) { pg.sectionId = first; fixed = true; }
      if (fixed) for (const pg of this.allPages) await S.savePage(pg);
    }
    this.activeSection = this.nb.sections[0]?.id || null;
    this.applyFilter();

    if (!this.pages.length) { await this.addPage(0, true); }
    this.undoStack = []; this.redoStack = [];
    this.build();
    this.fitWidth();
    this.renderAll();
  }

  /** Pages visible right now: the active tab's, or everything when there are no tabs. */
  applyFilter() {
    this.pages = this.nb.sections.length
      ? this.allPages.filter(p => p.sectionId === this.activeSection)
      : this.allPages.slice();
  }

  reindex() {
    this.allPages.forEach((p, i) => { p.index = i; });
  }

  showsTabs() { return this.nb.sections.length > 0 || this.nb.type === 'tabbed'; }

  build() {
    this.root.innerHTML = `
      <div class="ed" data-rail="${this.app.settings.railPos || 'left'}">
        <div class="topbar">
          <button class="icon-btn" data-a="back" title="Library">${icon('back')}</button>
          <div class="title-wrap"><button class="title-btn" data-a="rename"></button>
            <span class="sub" data-el="sub"></span></div>
          <div class="spacer"></div>
          <button class="icon-btn" data-a="undo" title="Undo">${icon('undo')}</button>
          <button class="icon-btn" data-a="redo" title="Redo">${icon('redo')}</button>
          <button class="icon-btn sync-btn" data-a="sync" title="Sync">${icon('cloud')}<i class="dot"></i></button>
          <button class="icon-btn" data-a="pages" title="Pages">${icon('pages')}</button>
          <button class="icon-btn" data-a="share" title="Share / export">${icon('share')}</button>
          <button class="icon-btn" data-a="menu" title="More">${icon('more')}</button>
        </div>

        <div class="statusbar">
          <button class="chip" data-a="zoomout">${icon('zoomout')}</button>
          <button class="chip zlabel" data-a="zoomreset">100%</button>
          <button class="chip" data-a="zoomin">${icon('zoomin')}</button>
          <span class="spacer"></span>
          <span class="pageno" data-el="pageno"></span>
          <span class="spacer"></span>
          <button class="chip" data-a="addpage">${icon('plus')} Page</button>
        </div>

        <div class="tabbar" data-el="tabs" hidden></div>
        <div class="toolrail" data-el="rail"></div>

        <div class="viewport" data-el="vp">
          <div class="doc" data-el="doc"></div>
          <div class="selframe" data-el="sel" hidden></div>
        </div>
      </div>`;

    this.vp = this.q('vp'); this.doc = this.q('doc'); this.selEl = this.q('sel');
    this.root.querySelector('.title-btn').textContent = this.nb.title;
    this.q('sub').textContent = { journal: 'Journal', todo: 'Daily to-do', planner: 'Daily planner', weekly: 'Weekly planner', sudoku: 'Sudoku', wordfind: 'Word find', tabbed: 'Tabbed notebook', notes: 'Notebook' }[this.nb.type] || 'Notebook';

    this.buildRail();
    this.renderTabs();
    this.root.querySelector('.ed').addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (b) this.action(b.dataset.a, b);
    });
    this.bindInput();
    this.updateSyncDot();
    this._syncOff = Drive.onChange(() => this.updateSyncDot());
  }

  q(n) { return this.root.querySelector(`[data-el="${n}"]`); }

  /* ================= tabs / sections ================= */

  renderTabs() {
    const bar = this.q('tabs');
    if (!bar) return;
    if (!this.showsTabs()) { bar.hidden = true; return; }
    bar.hidden = false;
    const secs = this.nb.sections;
    bar.innerHTML = secs.map(sec => {
      const n = this.allPages.filter(p => p.sectionId === sec.id).length;
      return `<button class="tab ${sec.id === this.activeSection ? 'on' : ''}" data-a="tab" data-sec="${sec.id}"
        style="--tab:hsl(${sec.hue ?? 214},62%,52%)"><span>${escapeHTML(sec.name)}</span><em>${n}</em></button>`;
    }).join('') + `<button class="tab add" data-a="addsec" title="Add a tab">${icon('plus')}</button>`;
  }

  async action_tab(btn) {
    const id = btn.dataset.sec;
    if (id === this.activeSection) return this.sectionMenu(btn);
    this.activeSection = id;
    this.applyFilter();
    this.clearSelection();
    this.renderTabs();
    this.renderAll();
    this.ty = 24; this.applyTransform();
  }

  /** Give an untabbed notebook its first tab, sweeping existing pages into it. */
  async ensureSectioned() {
    if (this.nb.sections.length) return;
    const first = { id: S.uid(), name: 'Notes', hue: 214 };
    this.nb.sections.push(first);
    for (const pg of this.allPages) { pg.sectionId = first.id; await S.savePage(pg); }
    this.activeSection = first.id;
    await S.saveNotebook(this.nb);
  }

  async addSection() {
    await this.ensureSectioned();
    const name = await promptDialog('New tab', '', 'e.g. Operations');
    if (!name) { this.applyFilter(); this.renderTabs(); this.renderAll(); return; }
    const hue = TAB_HUES[this.nb.sections.length % TAB_HUES.length];
    const sec = { id: S.uid(), name, hue };
    this.nb.sections.push(sec);
    await S.saveNotebook(this.nb);
    this.activeSection = sec.id;
    this.applyFilter();
    await this.addPage(0, true);
    this.renderTabs();
    this.renderAll();
    this.app.markDirty();
  }

  sectionMenu(btn) {
    const secs = this.nb.sections;
    const i = secs.findIndex(x => x.id === this.activeSection);
    const sec = secs[i];
    const w = el(`<div class="menu">
      <button data-m="rename">${icon('text')}<span>Rename tab</span></button>
      <button data-m="colour">${icon('grid')}<span>Tab colour</span></button>
      ${i > 0 ? `<button data-m="left">${icon('back')}<span>Move left</span></button>` : ''}
      ${i < secs.length - 1 ? `<button data-m="right">${icon('back')}<span style="transform:none">Move right</span></button>` : ''}
      <hr>
      <button data-m="del" class="danger">${icon('trash')}<span>Delete tab</span></button></div>`);
    const pop = popover(btn, w);
    w.addEventListener('click', async e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      pop.remove();
      const m = b.dataset.m;
      if (m === 'rename') {
        const v = await promptDialog('Rename tab', sec.name);
        if (v) { sec.name = v; await S.saveNotebook(this.nb); this.renderTabs(); this.app.markDirty(); }
      }
      if (m === 'colour') this.tabColour(sec);
      if (m === 'left' || m === 'right') {
        const j = m === 'left' ? i - 1 : i + 1;
        secs.splice(j, 0, secs.splice(i, 1)[0]);
        await S.saveNotebook(this.nb); this.renderTabs(); this.app.markDirty();
      }
      if (m === 'del') this.deleteSection(sec);
    });
  }

  tabColour(sec) {
    const wrap = el(`<div class="swatches">${TAB_HUES.map(h =>
      `<button class="sw ${sec.hue === h ? 'on' : ''}" data-h="${h}" style="background:hsl(${h},62%,52%)"></button>`).join('')}</div>`);
    const m = modal({ title: 'Tab colour', body: wrap, actions: [{ label: 'Done', primary: true }] });
    wrap.addEventListener('click', async e => {
      const b = e.target.closest('[data-h]'); if (!b) return;
      sec.hue = +b.dataset.h;
      await S.saveNotebook(this.nb);
      wrap.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === b));
      this.renderTabs(); this.app.markDirty();
    });
  }

  async deleteSection(sec) {
    if (this.nb.sections.length <= 1) return toast('A tabbed notebook needs at least one tab');
    const n = this.allPages.filter(p => p.sectionId === sec.id).length;
    if (!await confirmDialog('Delete tab',
      `Delete “${sec.name}” and its ${n} page${n === 1 ? '' : 's'}? This cannot be undone.`)) return;
    for (const pg of this.allPages.filter(p => p.sectionId === sec.id)) await S.del('pages', pg.id);
    this.allPages = this.allPages.filter(p => p.sectionId !== sec.id);
    this.nb.sections = this.nb.sections.filter(x => x.id !== sec.id);
    this.reindex();
    for (const pg of this.allPages) await S.savePage(pg);
    await S.saveNotebook(this.nb);
    this.activeSection = this.nb.sections[0].id;
    this.applyFilter();
    this.renderTabs(); this.renderAll(); this.app.markDirty();
  }

  destroy() {
    this._syncOff?.();
    this.stopRecording(true);
    clearTimeout(this._saveT); clearTimeout(this._zt);
    (this._win || []).forEach(([t, h]) => window.removeEventListener(t, h));
    this._win = [];
    this.pageEls.clear();
  }

  /** window-level listener that is torn down when the editor closes */
  onWin(type, handler, opts) {
    this._win = this._win || [];
    window.addEventListener(type, handler, opts);
    this._win.push([type, handler]);
  }

  /* ================= tool rail ================= */

  buildRail() {
    const t = this.app.tool;
    const penId = Ink.PEN_IDS.includes(t.name) ? t.name : (Ink.PEN_IDS.includes(t.pen) ? t.pen : 'pen');
    const penOn = Ink.PEN_IDS.includes(t.name);
    const tools = [
      ['highlighter', 'Highlighter'], ['lasso', 'Select — tap an item, or draw around a group'],
      ['shapes', 'Shape'], ['text', 'Text box'], ['image', 'Photo'], ['mic', 'Voice note'], ['hand', 'Pan']
    ];
    const rail = this.q('rail');
    rail.innerHTML =
      `<button class="tool pen-slot ${penOn ? 'on' : ''}" data-a="pens" data-tool="${penId}" title="${Ink.TOOLS[penId].label} — tap again to switch pen">
         ${icon(penIcon(penId))}<i class="caret"></i></button>` +
      `<button class="tool pen-slot ${t.name === 'eraser' ? 'on' : ''}" data-a="erasers" data-tool="eraser" title="Eraser — tap again for size and mode">
         ${icon('eraser')}<i class="caret"></i></button>` +
      tools.map(([id, label]) =>
        `<button class="tool ${t.name === id ? 'on' : ''}" data-a="tool" data-tool="${id}" title="${label}">${icon(id === 'shapes' ? 'shapes' : id)}</button>`
      ).join('') + `<div class="rail-sep"></div>
      <button class="tool swatch" data-a="colors" title="Colour"><i style="background:${t.color}"></i></button>
      <button class="tool" data-a="sizes" title="Size"><span class="sizedot" style="width:${Math.min(20, 4 + t.size)}px;height:${Math.min(20, 4 + t.size)}px"></span></button>`;
  }

  setTool(name) {
    const t = this.app.tool;
    t.name = name;
    if (name === 'highlighter' && !HL_PALETTE.includes(t.color)) { t.prevColor = t.color; t.color = HL_PALETTE[0]; }
    if (name !== 'highlighter' && t.prevColor) { t.color = t.prevColor; t.prevColor = null; }
    if (Ink.PEN_IDS.includes(name)) t.pen = name;
    const spec = Ink.TOOLS[name];
    if (spec && !spec.sizes.includes(t.size)) t.size = spec.sizes[2];
    this.app.saveTool();
    this.buildRail();
    this.clearSelection();
    this.vp.dataset.tool = name;
    if (name === 'image') { this.pickImage(); this.setTool(t.prevTool || 'pen'); }
    if (name === 'mic') { this.toggleRecording(); this.setTool(t.prevTool || 'pen'); }
    if (name !== 'image' && name !== 'mic') t.prevTool = name;
  }

  /* ================= actions ================= */

  async action(a, btn) {
    switch (a) {
      case 'back': this.app.showShelf(); break;
      case 'rename': {
        const v = await this.app.renameNotebook(this.nb);
        if (v) this.root.querySelector('.title-btn').textContent = v;
        break;
      }
      case 'tab': this.action_tab(btn); break;
      case 'addsec': this.addSection(); break;
      case 'tool': this.setTool(btn.dataset.tool); break;
      case 'pens':
        if (Ink.PEN_IDS.includes(this.app.tool.name)) this.penPop(btn);
        else this.setTool(btn.dataset.tool);
        break;
      case 'erasers':
        if (this.app.tool.name === 'eraser') this.eraserPop(btn);
        else this.setTool('eraser');
        break;
      case 'colors': this.colorPop(btn); break;
      case 'sizes': this.sizePop(btn); break;
      case 'undo': this.undo(); break;
      case 'redo': this.redo(); break;
      case 'sync': this.app.syncNow(); break;
      case 'pages': this.pagesPanel(); break;
      case 'share': this.sharePanel(btn); break;
      case 'menu': this.menuPop(btn); break;
      case 'zoomin': this.setZoom(this.zoom * 1.25); break;
      case 'zoomout': this.setZoom(this.zoom / 1.25); break;
      case 'zoomreset': this.fitWidth(); break;
      case 'addpage': await this.addPage(this.currentPageIndex() + 1); break;
    }
  }

  penPop(btn) {
    const t = this.app.tool;
    const wrap = el(`<div class="pens">${Ink.PEN_IDS.map(id => {
      const sp = Ink.TOOLS[id];
      return `<button class="penopt ${t.name === id ? 'on' : ''}" data-p="${id}">
        <canvas width="120" height="34"></canvas><span>${sp.label}</span></button>`;
    }).join('')}</div>`);
    const p = popover(btn, wrap, { side: 'right' });
    wrap.querySelectorAll('.penopt').forEach(b => {
      const c = b.querySelector('canvas'), ctx = c.getContext('2d');
      const id = b.dataset.p, sp = Ink.TOOLS[id];
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        pts.push(8 + u * 104, 17 - Math.sin(u * Math.PI * 1.6) * 8, 0.25 + Math.sin(u * Math.PI) * 0.7);
      }
      Ink.drawStroke(ctx, { tool: id, color: t.color, size: sp.sizes[2], pts });
    });
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-p]'); if (!b) return;
      p.remove();
      t.pen = b.dataset.p;
      this.setTool(b.dataset.p);
    });
  }

  eraserPop(btn) {
    const t = this.app.tool;
    const wrap = el(`<div class="pens eraserpop">
      <div class="pophead">Erases</div>
      ${Ink.ERASE_MODES.map(m => `<button class="penopt mode ${t.eraseMode === m.id ? 'on' : ''}" data-m="${m.id}">
          <strong>${m.label}</strong><em>${m.hint}</em></button>`).join('')}
      <div class="pophead">Size</div>
      <div class="ersizes">${Ink.ERASER_SIZES.map(v => `<button class="ersize ${t.eraserSize === v ? 'on' : ''}" data-s="${v}">
        <i style="width:${Math.min(38, v * 0.62)}px;height:${Math.min(38, v * 0.62)}px"></i></button>`).join('')}</div>
    </div>`);
    const p = popover(btn, wrap, { side: 'right' });
    wrap.addEventListener('click', e => {
      const m = e.target.closest('[data-m]'), z = e.target.closest('[data-s]');
      if (m) { t.eraseMode = m.dataset.m; wrap.querySelectorAll('.mode').forEach(x => x.classList.toggle('on', x === m)); }
      if (z) { t.eraserSize = +z.dataset.s; wrap.querySelectorAll('.ersize').forEach(x => x.classList.toggle('on', x === z)); }
      if (m || z) this.app.saveTool();
    });
  }

  /** Swap between the last pen and the eraser — the two-finger-tap and E shortcut. */
  quickSwap() {
    const t = this.app.tool;
    this.setTool(t.name === 'eraser' ? (t.pen || 'pen') : 'eraser');
    if (navigator.vibrate) navigator.vibrate(6);
    toast(t.name === 'eraser' ? 'Eraser' : (Ink.TOOLS[this.app.tool.name]?.label || 'Pen'));
  }

  colorPop(btn) {
    const t = this.app.tool;
    const list = t.name === 'highlighter' ? HL_PALETTE : PALETTE;
    const wrap = el(`<div class="swatches">${list.map(c =>
      `<button class="sw ${c === t.color ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}
      <label class="sw custom"><input type="color" value="${t.color}"></label></div>`);
    const p = popover(btn, wrap);
    wrap.addEventListener('click', e => {
      const s = e.target.closest('[data-c]');
      if (s) { t.color = s.dataset.c; this.app.saveTool(); this.buildRail(); this.recolorSelection(t.color); p.remove(); }
    });
    wrap.querySelector('input').oninput = e => { t.color = e.target.value; this.app.saveTool(); this.buildRail(); this.recolorSelection(t.color); };
  }

  sizePop(btn) {
    const t = this.app.tool;
    if (t.name === 'eraser') return this.eraserPop(btn);
    const spec = Ink.TOOLS[t.name] || Ink.TOOLS.pen;
    const wrap = el(`<div class="sizes">${spec.sizes.map(s =>
      `<button class="sz ${s === t.size ? 'on' : ''}" data-s="${s}"><i style="width:${Math.min(30, 3 + s * 1.5)}px;height:${Math.min(30, 3 + s * 1.5)}px;background:${t.color}"></i></button>`).join('')}
      <div class="slider-row"><input type="range" min="0.5" max="60" step="0.5" value="${t.size}"><span>${t.size}</span></div></div>`);
    const p = popover(btn, wrap);
    wrap.addEventListener('click', e => {
      const s = e.target.closest('[data-s]');
      if (s) { t.size = +s.dataset.s; this.app.saveTool(); this.buildRail(); p.remove(); }
    });
    const r = wrap.querySelector('input');
    r.oninput = () => { t.size = +r.value; wrap.querySelector('span').textContent = r.value; this.app.saveTool(); this.buildRail(); };
  }

  menuPop(btn) {
    const items = [
      ['rail', 'Move the toolbar', 'grid'],
      ['tabs', this.nb.sections.length ? 'Add a tab' : 'Turn on tabs', 'pages'],
      ['paper', 'Change paper', 'grid'],
      ['cover', 'Change cover', 'book'],
      ['fingerdraw', this.app.settings.fingerDraw ? 'Finger drawing: ON' : 'Finger drawing: off', 'hand'],
      ['clearpage', 'Clear this page', 'trash'],
      ['delpage', 'Delete this page', 'trash']
    ];
    items.unshift(['addgoals', 'Add a SMART goals page', 'target']);
    items.unshift(['addmonth', 'Add a month calendar', 'calendar']);
    if (this.nb.type === 'todo' || this.nb.type === 'planner') items.unshift(['carry', 'Carry unfinished to a new day', 'todo']);
    if (['journal', 'todo', 'planner'].includes(this.nb.type)) items.unshift(['newday', "New page for today", 'plus']);
    items.unshift(['newweek', 'Add a week (two pages)', 'plus']);
    const wrap = el(`<div class="menu">${items.map(([a, l, ic]) => `<button data-m="${a}">${icon(ic)}<span>${l}</span></button>`).join('')}</div>`);
    const p = popover(btn, wrap);
    wrap.addEventListener('click', async e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      p.remove();
      const m = b.dataset.m;
      if (m === 'rail') this.railPicker(btn);
      if (m === 'tabs') this.addSection();
      if (m === 'paper') this.paperPicker();
      if (m === 'cover') this.app.coverPicker(this.nb, () => {});
      if (m === 'fingerdraw') { this.app.settings.fingerDraw = !this.app.settings.fingerDraw; this.app.saveSettings(); toast('Finger drawing ' + (this.app.settings.fingerDraw ? 'on' : 'off')); }
      if (m === 'clearpage') { if (await confirmDialog('Clear page', 'Remove all ink and objects from this page?', 'Clear')) this.clearPage(); }
      if (m === 'delpage') this.deletePage(this.currentPageIndex());
      if (m === 'newday') this.newDatedPage();
      if (m === 'carry') this.carryForward();
      if (m === 'newweek') this.newWeekSpread();
      if (m === 'addmonth') this.newTemplatePage('month');
      if (m === 'addgoals') this.newTemplatePage('goals');
    });
  }

  railPicker() {
    const cur = this.app.settings.railPos || 'left';
    const opts = [['left', 'Left edge'], ['right', 'Right edge'], ['top', 'Across the top'], ['bottom', 'Across the bottom']];
    const body = el(`<div>
      <p class="muted">Where the pen, eraser and tool buttons sit while you write.</p>
      <div class="railopts">${opts.map(([id, label]) =>
        `<button class="railopt ${cur === id ? 'on' : ''}" data-r="${id}"><span class="railmini ${id}"><i></i><i></i><i></i></span>${label}</button>`).join('')}</div>
      <label class="row"><input type="checkbox" data-tf ${this.app.settings.twoFingerSwap ? 'checked' : ''}>
        Two-finger tap swaps pen and eraser</label>
      <p class="muted small">Leave this off if you rest your hand on the screen — a palm can read as two fingers.</p>
    </div>`);
    const m = modal({ title: 'Toolbar', body, actions: [{ label: 'Done', primary: true }] });
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      this.app.settings.railPos = b.dataset.r;
      this.app.saveSettings();
      this.root.querySelector('.ed').dataset.rail = b.dataset.r;
      body.querySelectorAll('.railopt').forEach(x => x.classList.toggle('on', x === b));
    });
    body.querySelector('[data-tf]').onchange = ev => {
      this.app.settings.twoFingerSwap = ev.target.checked;
      this.app.saveSettings();
    };
  }

  paperPicker() {
    const page = this.pages[this.currentPageIndex()];
    const kinds = ['blank','lined','narrow','college','grid','graph','dot','iso','cornell','planner','music','storyboard','journal','todo'];
    const body = el(`<div>
      <div class="paper-grid">${kinds.map(k => `<button class="paper-opt ${page.paper.kind === k ? 'on' : ''}" data-k="${k}"><canvas width="124" height="176"></canvas><span>${k}</span></button>`).join('')}</div>
      <h4>Paper colour</h4>
      <div class="swatches">${Object.keys(PAPER_COLORS).map(c => `<button class="sw ${page.paper.color === c ? 'on' : ''}" data-pc="${c}" style="background:${PAPER_COLORS[c].bg};border-color:${PAPER_COLORS[c].line}"></button>`).join('')}</div>
      <label class="row"><input type="checkbox" data-all> Apply to every page in this notebook</label>
    </div>`);
    const m = modal({ title: 'Paper', body, wide: true, actions: [{ label: 'Done', primary: true }] });
    body.querySelectorAll('.paper-opt').forEach(b => {
      const c = b.querySelector('canvas'), ctx = c.getContext('2d');
      ctx.scale(124 / PAGE.w, 176 / PAGE.h);
      drawPaper(ctx, { w: PAGE.w, h: PAGE.h, paper: { kind: b.dataset.k, color: page.paper.color }, meta: { dateLabel: 'Monday 9' } });
    });
    body.addEventListener('click', async e => {
      const k = e.target.closest('[data-k]'), pc = e.target.closest('[data-pc]');
      const applyAll = body.querySelector('[data-all]').checked;
      const targets = applyAll ? this.pages : [page];
      if (k) {
        const kind = k.dataset.k;
        targets.forEach(p => {
          p.paper.kind = kind;
          // switching onto a dated template fills in its labels, keeping any ticks
          const add = pageMeta(kind, new Date(), p.meta?.date ? new Date(p.meta.date) : new Date());
          if (Object.keys(add).length) p.meta = { ...p.meta, ...add, checks: p.meta?.checks || add.checks || {} };
        });
        this.pages.forEach(p => this.syncOverlay(p));
      }
      else if (pc) { targets.forEach(p => p.paper.color = pc.dataset.pc); }
      else return;
      for (const p of targets) await S.savePage(p);
      body.querySelectorAll('.paper-opt').forEach(x => x.classList.toggle('on', x.dataset.k === page.paper.kind));
      body.querySelectorAll('[data-pc]').forEach(x => x.classList.toggle('on', x.dataset.pc === page.paper.color));
      body.querySelectorAll('.paper-opt canvas').forEach((c, i) => {
        const ctx = c.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,124,176);
        ctx.scale(124 / PAGE.w, 176 / PAGE.h);
        drawPaper(ctx, { w: PAGE.w, h: PAGE.h, paper: { kind: kinds[i], color: page.paper.color }, meta: { dateLabel: 'Monday 9' } });
      });
      this.renderAll();
      this.app.markDirty();
    });
  }

  /* ================= page management ================= */

  newPageObj(index, paperOverride) {
    const type = this.nb.type;
    const paper = paperOverride || { ...(this.nb.defaultPaper || { kind: 'lined', color: 'white' }) };
    if (type === 'journal') paper.kind = 'journal';
    if (type === 'todo') paper.kind = 'todo';
    if (type === 'planner') paper.kind = 'daily';
    if (type === 'weekly' && !paperOverride) paper.kind = 'week1';
    const now = new Date();
    const dated = ['journal', 'todo', 'planner'].includes(type);
    return {
      id: S.uid(), notebookId: this.nb.id, index,
      w: PAGE.w, h: PAGE.h, paper,
      strokes: [], objects: [],
      meta: dated
        ? { date: now.toISOString(), dateLabel: fmtDate(now), checks: {} }
        : pageMeta(paper.kind, now),
      createdAt: Date.now()
    };
  }

  /** `at` is a position within the visible tab, not the whole notebook. */
  async addPage(at, silent) {
    const p = this.newPageObj(0);
    if (this.activeSection) p.sectionId = this.activeSection;

    let gi;
    if (!this.pages.length) {
      // first page of this tab — drop it after the last page of the preceding tab
      const secs = this.nb.sections;
      const si = secs.findIndex(x => x.id === this.activeSection);
      let after = -1;
      for (let k = 0; k <= si; k++) {
        const last = this.allPages.map((x, idx) => x.sectionId === secs[k]?.id ? idx : -1).filter(x => x >= 0).pop();
        if (last != null) after = Math.max(after, last);
      }
      gi = after + 1;
    } else {
      const clamped = Math.max(0, Math.min(at, this.pages.length));
      gi = clamped >= this.pages.length
        ? this.allPages.indexOf(this.pages[this.pages.length - 1]) + 1
        : this.allPages.indexOf(this.pages[clamped]);
    }

    this.allPages.splice(gi, 0, p);
    this.reindex();
    this.applyFilter();
    for (const x of this.allPages) await S.savePage(x);
    if (!silent) { this.renderAll(); this.scrollToPage(this.pages.indexOf(p)); this.renderTabs(); this.app.markDirty(); }

    this.pushUndo({
      undo: async () => {
        this.allPages = this.allPages.filter(x => x.id !== p.id);
        this.reindex(); this.applyFilter();
        await S.del('pages', p.id);
        for (const x of this.allPages) await S.savePage(x);
        this.renderAll(); this.renderTabs();
      },
      redo: async () => {
        this.allPages.splice(gi, 0, p);
        this.reindex(); this.applyFilter();
        for (const x of this.allPages) await S.savePage(x);
        this.renderAll(); this.renderTabs();
      }
    });
    return p;
  }

  async newDatedPage() {
    const now = new Date();
    const p = await this.addPage(this.pages.length);
    p.meta = { date: now.toISOString(), dateLabel: fmtDate(now), checks: {} };
    await S.savePage(p);
    this.renderAll(); this.scrollToPage(this.pages.length - 1);
  }

  /** Adds one page of a given template kind at the end of the current tab. */
  async newTemplatePage(kind, when = new Date()) {
    const p = await this.addPage(this.pages.length, true);
    p.paper = { ...p.paper, kind };
    p.meta = pageMeta(kind, new Date(), when);
    await S.savePage(p);
    this.renderAll(); this.renderTabs();
    this.scrollToPage(this.pages.indexOf(p));
    this.app.markDirty();
    return p;
  }

  /** Adds a fresh two-page weekly spread, dated to `when` (defaults to next unused week). */
  async newWeekSpread(when) {
    if (!when) {
      const used = new Set(this.allPages.map(p => p.meta?.weekKey).filter(Boolean));
      when = mondayOf(new Date());
      // walk forward until we land on a week that isn't already in the notebook
      for (let guard = 0; guard < 520 && used.has(weekKey(when)); guard++) {
        when = new Date(when); when.setDate(when.getDate() + 7);
      }
    }
    const made = [];
    for (const kind of ['week1', 'week2']) {
      const p = await this.addPage(this.pages.length, true);
      p.paper = { ...p.paper, kind };
      p.meta = pageMeta(kind, new Date(), when);
      await S.savePage(p);
      made.push(p);
    }
    this.renderAll(); this.renderTabs();
    this.scrollToPage(this.pages.indexOf(made[0]));
    this.app.markDirty();
    toast(`Added ${fmtWeek(when)}`);
    return made;
  }

  async carryForward() {
    const from = this.pages[this.currentPageIndex()];
    const p = await this.addPage(this.pages.length);
    const now = new Date();
    p.meta = { date: now.toISOString(), dateLabel: fmtDate(now), checks: {}, carriedFrom: from.id };
    // copy ink from unfinished rows: any row whose checkbox is unchecked
    const boxes = from.paper.kind === 'daily' ? dailyTargets().boxes.filter(b => /^[pbe]/.test(b.key)) : todoCheckboxes(from);
    const done = from.meta?.checks || {};
    const keep = boxes.filter(b => !done[b.key]);
    const rowH = 54;
    for (const b of keep) {
      const y0 = b.y - 10, y1 = b.y + rowH - 12;
      for (const s of from.strokes) {
        const bb = Ink.strokeBounds(s);
        if (bb.y0 >= y0 - 8 && bb.y1 <= y1 + 8 && bb.x0 > b.x) p.strokes.push(JSON.parse(JSON.stringify(s)));
      }
    }
    p.strokes.forEach(s => s.id = S.uid());
    await S.savePage(p);
    this.renderAll(); this.scrollToPage(this.pages.length - 1);
    toast(`Carried ${keep.length} open item rows to today`);
  }

  async deletePage(i) {
    if (this.pages.length <= 1) return toast(this.nb.sections.length ? 'A tab needs at least one page' : 'A notebook needs at least one page');
    if (!await confirmDialog('Delete page', `Delete page ${i + 1}? This cannot be undone from the shelf.`)) return;
    const p = this.pages[i];
    this.allPages = this.allPages.filter(x => x.id !== p.id);
    await S.del('pages', p.id);
    this.reindex(); this.applyFilter();
    for (const x of this.allPages) await S.savePage(x);
    this.renderAll(); this.renderTabs(); this.app.markDirty();
  }

  clearPage() {
    const p = this.pages[this.currentPageIndex()];
    const prevS = p.strokes, prevO = p.objects;
    p.strokes = []; p.objects = [];
    S.savePage(p); this.renderPage(p); this.app.markDirty();
    this.pushUndo({ undo: () => { p.strokes = prevS; p.objects = prevO; S.savePage(p); this.renderPage(p); },
                    redo: () => { p.strokes = []; p.objects = []; S.savePage(p); this.renderPage(p); } });
  }

  /* ================= layout & rendering ================= */

  renderAll() {
    this.doc.innerHTML = '';
    this.pageEls.clear();
    let y = 0;
    for (const p of this.pages) {
      p._y = y;
      const d = el(`<div class="page" data-pid="${p.id}" style="top:${y}px;width:${p.w}px;height:${p.h}px">
        <canvas class="ink"></canvas><canvas class="live"></canvas><div class="ov"></div>
        <div class="pgnum">${this.pages.indexOf(p) + 1}</div></div>`);
      this.doc.appendChild(d);
      this.pageEls.set(p.id, d);
      y += p.h + GAP;
    }
    this.doc.style.width = (this.pages[0]?.w || PAGE.w) + 'px';
    this.doc.style.height = y + 'px';
    this.applyTransform();
    this.pages.forEach(p => this.renderPage(p));
  }

  renderPage(p) {
    const d = this.pageEls.get(p.id);
    if (!d) return;
    const R = this.renderScale;
    const ink = d.querySelector('.ink'), live = d.querySelector('.live');
    for (const c of [ink, live]) {
      if (c.width !== Math.round(p.w * R)) { c.width = Math.round(p.w * R); c.height = Math.round(p.h * R); }
      c.style.width = p.w + 'px'; c.style.height = p.h + 'px';
    }
    const ctx = ink.getContext('2d');
    ctx.setTransform(R, 0, 0, R, 0, 0);
    ctx.clearRect(0, 0, p.w, p.h);
    drawPaper(ctx, p);
    this.drawImages(ctx, p);
    for (const s of p.strokes) Ink.drawStroke(ctx, s);
    this.syncOverlay(p);
  }

  drawImages(ctx, p) {
    for (const o of p.objects) {
      if (o.type !== 'image') continue;
      const img = this._imgCache?.get(o.blobId);
      if (img) {
        ctx.save();
        ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
        if (o.rot) ctx.rotate(o.rot);
        ctx.drawImage(img, -o.w / 2, -o.h / 2, o.w, o.h);
        ctx.restore();
      } else {
        this.loadImage(o.blobId).then(() => this.renderPage(p));
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.05)'; roundRect(ctx, o.x, o.y, o.w, o.h, 8); ctx.fill(); ctx.restore();
      }
    }
  }

  async loadImage(blobId) {
    this._imgCache = this._imgCache || new Map();
    if (this._imgCache.has(blobId)) return this._imgCache.get(blobId);
    if (this._imgPending?.has(blobId)) return this._imgPending.get(blobId);
    this._imgPending = this._imgPending || new Map();
    const pr = (async () => {
      const url = await S.getBlobURL(blobId);
      if (!url) return null;
      const img = new Image();
      await new Promise(r => { img.onload = r; img.onerror = r; img.src = url; });
      this._imgCache.set(blobId, img);
      return img;
    })();
    this._imgPending.set(blobId, pr);
    return pr;
  }

  /* HTML overlay: text boxes, audio pins, to-do checkboxes */
  syncOverlay(p) {
    const d = this.pageEls.get(p.id); if (!d) return;
    const ov = d.querySelector('.ov');
    ov.innerHTML = '';

    if (INTERACTIVE.includes(p.paper.kind)) {
      const checks = p.meta.checks || (p.meta.checks = {});
      const targets = pageTargets(p);
      /* Older to-do and daily pages paint their tick/fill in the DOM. The weekly,
         month and goals pages paint theirs onto the page canvas instead, so screen
         and exported PDF can never drift apart — those get invisible hit areas. */
      const onCanvas = !['todo', 'daily'].includes(p.paper.kind);
      const flip = (key, after) => {
        // (A tap from the writer's resting hand never gets here — bindInput's
        // capture-phase click guard swallows it.)
        checks[key] = !checks[key];
        after(!!checks[key]);
        if (onCanvas) this.renderPage(p);
        this.queueSave(p);
      };
      for (const g of (targets.glasses || [])) {
        const n = el(`<button class="glass ${checks[g.key] ? 'on' : ''}" data-k="${escapeHTML(g.key)}" style="left:${g.x}px;top:${g.y}px;width:${g.s}px;height:${g.s}px"></button>`);
        n.onclick = ev => { ev.stopPropagation(); flip(g.key, on => n.classList.toggle('on', on)); };
        ov.appendChild(n);
      }
      for (const pip of (targets.pips || [])) {
        const n = el(`<button class="hit" data-k="${escapeHTML(pip.key)}" style="left:${pip.x - 3}px;top:${pip.y - 3}px;width:${pip.s + 6}px;height:${pip.s + 6}px"></button>`);
        n.onclick = ev => { ev.stopPropagation(); flip(pip.key, () => {}); };
        ov.appendChild(n);
      }
      for (const b of (targets.boxes || [])) {
        const w = b.w || b.s;
        if (onCanvas) {
          const n = el(`<button class="hit" data-k="${escapeHTML(b.key)}" style="left:${b.x - 3}px;top:${b.y - 3}px;width:${w + 6}px;height:${b.s + 6}px"></button>`);
          n.onclick = ev => { ev.stopPropagation(); flip(b.key, () => {}); };
          ov.appendChild(n);
        } else {
          const n = el(`<button class="tick ${checks[b.key] ? 'on' : ''}" data-k="${escapeHTML(b.key)}" style="left:${b.x}px;top:${b.y}px;width:${w}px;height:${b.s}px">${checks[b.key] ? icon('check') : ''}</button>`);
          n.onclick = ev => { ev.stopPropagation(); flip(b.key, on => { n.classList.toggle('on', on); n.innerHTML = on ? icon('check') : ''; }); };
          ov.appendChild(n);
        }
      }
    }

    for (const o of p.objects) {
      if (o.type === 'text') {
        const n = el(`<div class="tbox" contenteditable="true" spellcheck="false"
           style="left:${o.x}px;top:${o.y}px;width:${o.w}px;font-size:${o.size||30}px;color:${o.color||'#1b1f27'};font-family:${o.font||"ui-sans-serif, system-ui, sans-serif"}"></div>`);
        n.textContent = o.text || '';
        n.dataset.oid = o.id;
        n.addEventListener('input', () => { o.text = n.innerText; this.queueSave(p); });
        // The Pencil writing across a text box that isn't being edited is ink like
        // anywhere else on the page (it falls through to the page's onDown).
        n.addEventListener('pointerdown', e => { if (!this._penInksOnBox(e, n)) e.stopPropagation(); });
        n.addEventListener('blur', () => { if (!n.innerText.trim()) { p.objects = p.objects.filter(x => x.id !== o.id); this.queueSave(p); this.syncOverlay(p); } });
        ov.appendChild(n);
      }
      if (o.type === 'audio') {
        const n = el(`<button class="apin" data-k="a:${o.id}" style="left:${o.x}px;top:${o.y}px">${icon('play')}<span>${o.label || 'Voice note'}</span><em>${fmtDur(o.dur)}</em></button>`);
        n.addEventListener('pointerdown', e => e.stopPropagation());
        n.onclick = e => { e.stopPropagation(); this.playAudio(o, n); };
        n.oncontextmenu = e => { e.preventDefault(); this.audioMenu(o, p, n); };
        ov.appendChild(n);
      }
    }
  }

  async playAudio(o, node) {
    if (this._audio && !this._audio.paused) { this._audio.pause(); this._audio = null; node.classList.remove('playing'); return; }
    const url = await S.getBlobURL(o.blobId);
    if (!url) return toast('Recording not found', 'error');
    const a = new Audio(url);
    this._audio = a;
    node.classList.add('playing');
    a.onended = () => { node.classList.remove('playing'); URL.revokeObjectURL(url); };
    a.play().catch(() => toast('Could not play audio', 'error'));
  }

  audioMenu(o, p, node) {
    const w = el(`<div class="menu"><button data-m="del">${icon('trash')}<span>Delete voice note</span></button></div>`);
    const pop = popover(node, w);
    w.onclick = () => { p.objects = p.objects.filter(x => x.id !== o.id); S.savePage(p); this.syncOverlay(p); pop.remove(); this.app.markDirty(); };
  }

  applyTransform() {
    this.doc.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.zoom})`;
    const zl = this.root.querySelector('.zlabel');
    if (zl) zl.textContent = Math.round(this.zoom * 100) + '%';
    this.updatePageNo();
  }

  setZoom(z, cx, cy) {
    const nz = Math.max(0.18, Math.min(6, z));
    const r = this.vp.getBoundingClientRect();
    cx = cx == null ? r.width / 2 : cx; cy = cy == null ? r.height / 2 : cy;
    const k = nz / this.zoom;
    this.tx = cx - (cx - this.tx) * k;
    this.ty = cy - (cy - this.ty) * k;
    this.zoom = nz;
    this.applyTransform();
    clearTimeout(this._zt);
    this._zt = setTimeout(() => {
      const want = Math.max(1, Math.min(3, Math.round(this.zoom * DPR() * 2) / 2));
      if (Math.abs(want - this.renderScale) > 0.24) { this.renderScale = want; this.pages.forEach(p => this.renderPage(p)); }
    }, 220);
  }

  fitWidth() {
    const r = this.vp.getBoundingClientRect();
    const w = this.pages[0]?.w || PAGE.w;
    const z = Math.min(2, (r.width - 48) / w);
    this.zoom = z;
    this.tx = (r.width - w * z) / 2;
    this.ty = 24;
    this.renderScale = Math.max(1, Math.min(3, Math.round(z * DPR() * 2) / 2));
    this.applyTransform();
    this.pages.forEach(p => this.renderPage(p));
  }

  currentPageIndex() {
    const r = this.vp.getBoundingClientRect();
    const mid = (r.height / 2 - this.ty) / this.zoom;
    let best = 0;
    for (let i = 0; i < this.pages.length; i++) { if (this.pages[i]._y <= mid) best = i; }
    return best;
  }
  updatePageNo() {
    const n = this.q('pageno');
    const i = this.currentPageIndex();
    if (n) n.textContent = `${i + 1} / ${this.pages.length}`;
  }
  scrollToPage(i) {
    const p = this.pages[Math.max(0, Math.min(i, this.pages.length - 1))];
    if (!p) return;
    this.ty = -p._y * this.zoom + 24;
    this.applyTransform();
  }

  /* ================= input ================= */

  bindInput() {
    const vp = this.vp;
    vp.style.touchAction = 'none';

    vp.addEventListener('pointerdown', e => this.onDown(e));
    vp.addEventListener('pointermove', e => this.onMove(e), { passive: false });
    vp.addEventListener('pointerup', e => this.onUp(e));
    vp.addEventListener('pointercancel', e => {
      // The system took this contact back. A Pencil stroke keeps what it drew; a
      // finger stroke (finger drawing on) that iOS cancelled is usually a palm — drop it.
      if (e.pointerType === 'touch' && this._draw?.id === e.pointerId) { this.clearLive(this._draw.page); this._draw = null; }
      if (e.pointerType === 'touch' && this._erase?.id === e.pointerId) this._revertErase();
      this.onUp(e);
    });
    // Touch and pen contacts are implicitly captured and get a pointerleave right
    // after their pointerup; only a mouse can genuinely leave mid-drag.
    vp.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') this.onUp(e); });

    /* iPad Safari runs its own gesture recognisers on top of Pointer Events, and
       `touch-action: none` only switches off pan/zoom — not long-press text
       selection, the Copy / Look Up callout, the loupe, or Scribble. A resting palm
       triggers those, and once a native selection is up the Pencil's next taps go
       to dismissing it instead of to the page: the "missing letters". Cancelling
       the touch at the source stops all of it, while pointer events (which is all
       the drawing code listens to) keep flowing for both the Pencil and fingers.
       Real controls inside the page keep their native behaviour so they still
       click and focus. */
    const blockNative = e => {
      if (!nativeOK(e.target)) { e.preventDefault(); return; }
      if (e.type !== 'touchstart' || !nativeOK(e.target, true)) return;
      // Editable text inside the page. The Pencil keeps native behaviour (caret,
      // Scribble). A finger keeps it only on the box already being edited, and only
      // if it isn't a palm. Anything else is cancelled; a clean finger tap on an
      // unfocused box is turned into focus + caret on touchend (below).
      const tt = [...(e.changedTouches || [])].map(touchAsPointer);
      if (!tt.length) return;
      const box = elOf(e.target).closest(EDITABLE);
      const focused = box && (box === document.activeElement || box.contains(document.activeElement));
      if (tt.some(x => x.pointerType === 'pen')) {
        // Pencil: native (caret, Scribble) only on the box being edited or with the
        // Text tool; otherwise it inks, so the system mustn't grab the touch.
        if (!focused && this.app.tool.name !== 'text' && box?.matches('.tbox')) e.preventDefault();
        return;
      }
      const palm = tt.some(x => this.isPalm(x));
      if (focused && !palm) return;
      e.preventDefault();
      if (!focused && !palm && tt.length === 1 && e.touches.length === 1 && box?.matches('.tbox'))
        this._boxTap = { box, id: e.changedTouches[0].identifier, x: tt[0].clientX, y: tt[0].clientY, t: performance.now() };
    };
    vp.addEventListener('touchstart', blockNative, { passive: false });
    // Moves are cancelled everywhere except inside editable text (drag-to-select
    // there), buttons included — Scribble otherwise grabs a stroke that happens
    // to start on a checkbox.
    vp.addEventListener('touchmove', e => {
      const box = elOf(e.target)?.closest?.(EDITABLE);
      const focused = box && (box === document.activeElement || box.contains(document.activeElement));
      if (!focused) e.preventDefault();
    }, { passive: false });
    vp.addEventListener('contextmenu', blockNative);
    const ed = this.root.querySelector('.ed');
    ed.addEventListener('selectstart', e => { if (!nativeOK(e.target, true)) e.preventDefault(); });

    /* Buttons ON the page (checkboxes, hit areas, audio pins) are re-created every
       time the page re-renders — which happens each time a stroke is saved — so a
       browser-synthesised click can land on a fresh copy that knows nothing about
       where the press began. The editor therefore owns those taps outright: the
       press is judged (palm or not) at pointerdown, the button is activated by the
       editor itself on a clean pointerup, and every pointer-originated native click
       on them is swallowed. Keyboard activation (click.detail === 0) still works. */
    const PAGE_BTN = '.hit, .tick, .glass, .apin, .selbar button';
    const pageBtn = t => { const b = elOf(t)?.closest?.(PAGE_BTN); return b && this.vp.contains(b) ? b : null; };
    /* Buttons OFF the page (tool rail, top bar, tabs, selection bar) live long
       enough to carry their own verdict. There a press only counts as a palm while
       the Pencil is touching or has just lifted (300 ms), so a quick finger tap on
       Undo or the eraser right after writing still works. */
    const BTN = 'button, [data-a], .tab';
    ed.addEventListener('pointerdown', e => {
      // The Pencil touching anything on the page — including the selection frame,
      // a voice-note pin or a text box, whose own handlers stop the event — makes
      // every touch already down a palm, from this instant.
      if (e.pointerType === 'pen' && this.vp.contains(elOf(e.target))) this._penLanded();
      const pb = pageBtn(e.target);
      if (pb) {
        if (this._inkableOn(e, pb)) return;             // onDown inks from it instead
        // The "recently seen palm here" memory is left out for on-page buttons: a
        // tap must already be a quick, still press-and-lift (checked on pointerup),
        // which a hand settling back down isn't — and it would otherwise swallow a
        // deliberate tap on a box for seconds after a palm brushed it.
        if (!this.isPalm(e, false)) this._btnTaps.set(e.pointerId, { el: pb, pid: pb.closest('.page')?.dataset.pid, k: pb.dataset.k,
                                                               type: e.pointerType, x: e.clientX, y: e.clientY, t: performance.now() });
        return;
      }
      const b = elOf(e.target)?.closest?.(BTN); if (!b) return;
      const palm = e.pointerType === 'touch' && (this._penDown || performance.now() - (this._lastPenAt || -1e9) < 300);
      b._noClickAt = palm ? performance.now() : 0;
    }, true);
    ed.addEventListener('pointerup', e => {
      const bt = this._btnTaps.get(e.pointerId); if (!bt) return;
      this._btnTaps.delete(e.pointerId);
      if (Math.hypot(e.clientX - bt.x, e.clientY - bt.y) > 12 || performance.now() - bt.t > 900) return;
      this._liveBtn(bt.el, bt.pid, bt.k)?.click();        // detail 0: passes the guard below
    }, true);
    ed.addEventListener('pointercancel', e => this._btnTaps.delete(e.pointerId), true);
    // Never leave the page thinking the Pencil is still down (which would treat
    // every finger as a palm) if its lift was delivered somewhere onUp can't see.
    for (const t of ['pointerup', 'pointercancel'])
      this.onWin(t, e => { if (e.pointerType === 'pen') this._penDown = false; });   // e.g. a lift over a modal
    // And if that lift lands outside the page entirely (capture lost), finish the
    // stroke properly rather than leaving it half-drawn.
    for (const t of ['pointerup', 'pointercancel'])
      ed.addEventListener(t, e => {
        if (e.pointerType !== 'pen') return;
        this._penDown = false; this._lastPenAt = this._lastPenUpAt = performance.now();
        if (!this.vp.contains(elOf(e.target)) && this._pointers.has(e.pointerId)) this.onUp(e);
      }, true);
    ed.addEventListener('click', e => {
      if (pageBtn(e.target)) { if (e.detail > 0) { e.stopPropagation(); e.preventDefault(); } return; }
      const b = elOf(e.target)?.closest?.(BTN); if (!b || !b._noClickAt) return;
      const fresh = performance.now() - b._noClickAt < 10000;
      b._noClickAt = 0;
      if (fresh) { e.stopPropagation(); e.preventDefault(); }
    }, true);

    /* Text boxes: an unfocused box is ink-only to a finger too (a palm resting on
       it before the Pencil lands would otherwise start native selection there), and
       a quick, still finger tap focuses it and drops the caret where it touched.
       Done on touchend, which iOS accepts as the gesture that may raise the keyboard. */
    vp.addEventListener('touchend', e => {
      const bt = this._boxTap;
      const x = bt && [...e.changedTouches].find(t => t.identifier === bt.id);
      if (!x) return;                                     // some other contact lifted (e.g. the palm)
      this._boxTap = null;
      if (performance.now() - bt.t > 450 ||
          Math.hypot(x.clientX - bt.x, x.clientY - bt.y) > 10 || !bt.box.isConnected) return;
      e.preventDefault();
      this._focusBoxAt(bt.box, x.clientX, x.clientY);
    }, { passive: false });

    // Safari ignores user-scalable=no; a hand resting on the toolbar plus a finger
    // elsewhere would otherwise zoom the whole app instead of the page. On a Mac
    // trackpad (no touch screen) Safari reports pinch the same way, so turn it into
    // page zoom there unless the browser is already sending ctrl+wheel for it.
    let g0 = 1;
    this.onWin('gesturestart', e => { e.preventDefault(); g0 = this.zoom; }, { passive: false });
    this.onWin('gesturechange', e => {
      e.preventDefault();
      if (navigator.maxTouchPoints > 0 || !e.scale) return;
      if (performance.now() - (this._ctrlWheelAt || -1e9) < 400) return;
      const r = vp.getBoundingClientRect();
      this.setZoom(g0 * e.scale, (e.clientX ?? r.left + r.width / 2) - r.left, (e.clientY ?? r.top + r.height / 2) - r.top);
    }, { passive: false });
    this.onWin('gestureend', e => e.preventDefault(), { passive: false });

    vp.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        if (e.ctrlKey) this._ctrlWheelAt = performance.now();
        const r = vp.getBoundingClientRect();
        this.setZoom(this.zoom * Math.exp(-e.deltaY / 260), e.clientX - r.left, e.clientY - r.top);
      } else {
        this.tx -= e.deltaX; this.ty -= e.deltaY; this.applyTransform();
      }
    }, { passive: false });

    this.onWin('keydown', e => {
      if (document.querySelector('.modal-back')) return;
      if (e.target.isContentEditable || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const m = e.metaKey || e.ctrlKey;
      if (m && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
      if (m && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); }
      if (!m && ['1','2','3','4','5','6','7'].includes(e.key)) this.setTool([this.app.tool.pen || 'pen','fountain','pencil','marker','highlighter','eraser','lasso'][+e.key - 1]);
      if (e.key.toLowerCase() === 'e' && !m) { e.preventDefault(); this.quickSwap(); }
      if (e.key === 'Escape') this.clearSelection();
      if ((e.key === 'Backspace' || e.key === 'Delete') && this.selection) { e.preventDefault(); this.deleteSelection(); }
      if (e.key === ' ') this._space = true;
    });
    this.onWin('keyup', e => { if (e.key === ' ') this._space = false; });

    vp.addEventListener('dragover', e => e.preventDefault());
    vp.addEventListener('drop', async e => {
      e.preventDefault();
      const f = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
      if (f) this.insertImageFile(f, this.toPage(e.clientX, e.clientY));
    });
    this.onWin('paste', async e => {
      if (e.target.isContentEditable) return;
      const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
      if (it) this.insertImageFile(it.getAsFile(), null);
    });
    this.onWin('resize', () => { clearTimeout(this._rz); this._rz = setTimeout(() => this.applyTransform(), 180); });
  }

  toPage(clientX, clientY) {
    const dr = this.doc.getBoundingClientRect();
    const dx = (clientX - dr.left) / this.zoom;
    const dy = (clientY - dr.top) / this.zoom;
    for (const p of this.pages) {
      if (dy >= p._y - GAP / 2 && dy <= p._y + p.h + GAP / 2) return { page: p, x: dx, y: dy - p._y };
    }
    const p = this.pages[this.pages.length - 1];
    return { page: p, x: dx, y: dy - p._y };
  }

  inputMode(e) {
    const t = this.app.tool.name;
    if (this._space || t === 'hand') return 'pan';
    if (e.pointerType === 'touch') return this.app.settings.fingerDraw ? 'draw' : 'pan';
    return 'draw';
  }

  /**
   * True when a touch contact should be ignored outright. Contact size is a bonus
   * signal at best — WebKit reports it (2 × touch radius) but coarsely, so this
   * leans on things that hold on every platform: whether the pencil currently owns
   * the page (touching, or hovering on newer iPads), and whether this spot was
   * just identified as someone's resting hand. Accepts a PointerEvent or the
   * touchAsPointer() shape.
   */
  isPalm(e, useZone = true) {
    if (e.pointerType !== 'touch') return false;
    if (this._penDown) return true;
    if (performance.now() - (this._lastPenAt || -1e9) < PEN_GRACE_MS) return true;
    if (performance.now() - (this._lastHoverAt || -1e9) < HOVER_GRACE_MS) return true;
    if ((e.width || 0) > 45 || (e.height || 0) > 45) return true;
    if (useZone && this._palmZone && performance.now() - this._palmZone.t < PALM_ZONE_MS &&
        Math.hypot(e.clientX - this._palmZone.x, e.clientY - this._palmZone.y) < PALM_ZONE_R) return true;
    return false;
  }

  /** Remember where a rejected contact was, so a hand that lifts and resettles a
   *  few millimetres away (very common mid-word) keeps being recognised as itself. */
  _notePalm(p) {
    this._palmZone = { x: p.clientX ?? p.x, y: p.clientY ?? p.y, t: performance.now() };
  }

  /** The Pencil, with a drawing tool, landing on a checkbox / hit area inks. */
  _inkableOn(e, el) {
    return e.pointerType === 'pen' && el.matches('.tick, .glass, .hit') &&
      !this._space && !INK_TOOLS_EXCLUDE.includes(this.app.tool.name);
  }

  /** The Pencil on a text box that isn't being edited, with any tool but Text, inks. */
  _penInksOnBox(e, box) {
    if (e.pointerType !== 'pen' || this.app.tool.name === 'text') return false;
    return !(box === document.activeElement || box.contains(document.activeElement));
  }

  /** The on-page button a press started on — or, if the page re-rendered since
   *  (each saved stroke rebuilds the overlay), its replacement. */
  _liveBtn(el, pid, k) {
    if (el.isConnected) return el;
    if (!pid || !k) return null;
    const pg = this.doc.querySelector(`.page[data-pid="${CSS.escape(pid)}"]`);
    return pg?.querySelector(`.ov [data-k="${CSS.escape(k)}"]`) || null;
  }

  /** Focus a text box and put the caret under (x, y). */
  _focusBoxAt(box, x, y) {
    try { box.focus({ preventScroll: true }); } catch { box.focus(); }
    let r = null;
    if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(x, y);
    else if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) { r = document.createRange(); r.setStart(p.offsetNode, p.offset); }
    }
    const sel = window.getSelection?.();
    if (!sel) return;
    if (!r || !box.contains(r.startContainer)) { r = document.createRange(); r.selectNodeContents(box); r.collapse(false); }
    else r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
  }

  /** Undo an in-progress erase without recording it (it was a palm, not the user). */
  _revertErase() {
    const er = this._erase; this._erase = null;
    if (!er) return;
    this.clearLive(er.page);
    if (!er.changed) return;
    er.page.strokes = er.before.slice(); er.page.objects = er.beforeObjs.slice();
    this.renderPage(er.page); this.queueSave(er.page);
  }

  _blurEditing() {
    const ae = document.activeElement;
    if (ae && ae !== document.body && ae.isContentEditable && this.root.contains(ae)) ae.blur();
  }

  /** Ignore this pointer until it lifts, and remember where it was. */
  _reject(e) {
    this._rejected.add(e.pointerId);
    this._pointers.delete(e.pointerId);
    this._notePalm(e);
  }

  onDown(e) {
    // Overlay controls handle their own taps (bindInput activates them), with three
    // exceptions that behave like the page underneath:
    //  - the Pencil with a drawing tool on a checkbox / hit area inks (a tick drawn
    //    in a to-do box, a letter that happens to start on one; see onUp for taps);
    //  - the Pencil on a text box that isn't being edited inks;
    //  - a finger on a checkbox / hit area can still start a scroll or a pinch.
    const ov = e.target.closest('.tbox, .apin, .tick, .glass, .hit, .selframe');
    let onBtn = null, skip = false;
    if (ov) {
      if (ov.matches('.tbox')) skip = !this._penInksOnBox(e, ov);
      else if (this._inkableOn(e, ov)) onBtn = ov;
      else skip = !(e.pointerType === 'touch' && ov.matches('.tick, .glass, .hit'));
    }
    const penGap = e.pointerType === 'pen' ? performance.now() - (this._lastPenUpAt ?? -1e9) : Infinity;
    // (The Pencil-landed bookkeeping already ran in bindInput's capture listener —
    // it has to, because some on-page targets stop the event before it gets here.)
    if (skip) return;
    // A pointerdown is always a brand-new contact; if the system ever reuses an id
    // whose lift we never saw, it must not inherit the old palm verdict.
    this._rejected.delete(e.pointerId);
    if (this.isPalm(e)) { this._reject(e); return; }
    // Writing on the page ends typing in a text box. Cancelling touchstart (above)
    // also cancels Safari's own tap-to-blur, so do it here.
    if (e.pointerType !== 'touch') this._blurEditing();
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, downAt: performance.now() });
    const fingerOnBox = !!ov && !onBtn && e.pointerType === 'touch';
    return this._onDownRest(e, onBtn, penGap, fingerOnBox);
  }

  /** The Pencil just touched the page (or something on it). Runs before any
   *  on-page handler can stop the event. */
  _penLanded() {
    this._penDown = true; this._lastPenAt = performance.now();
    // A finger that is mid-tap on a checkbox when the Pencil lands is the hand.
    for (const [id, bt] of [...this._btnTaps]) if (bt.type === 'touch') this._btnTaps.delete(id);
    this._boxTap = null;
    // Any touch already on the glass the instant the Pencil lands is the writer's
    // own hand, not a deliberate second contact — this is what stopped a stroke
    // dead or spun it into a pinch whenever a resting hand had already been
    // (mis)read as a real finger before the tip touched down.
    for (const [id, pt] of [...this._pointers]) {
      if (pt.type === 'touch') { this._pointers.delete(id); this._rejected.add(id); this._notePalm(pt); }
    }
    // If finger drawing is on and that hand had started inking, drop its mark.
    const owner = this._draw?.id ?? this._erase?.id ?? this._lasso?.id;
    if (owner != null && this._rejected.has(owner)) {
      // ...and if it had been erasing, put back whatever it rubbed out.
      this._revertErase();
      this.cancelDraw();
    }
    // ...and whatever that hand did to the view while it was being mistaken for a
    // finger (a drift-pan, a settling "pinch") is undone, so the page doesn't sit
    // shifted under the nib.
    if (this._pan || this._pinch) this._restoreView();
    this._pan = null; this._pinch = null; this._twoTap = null;
    // Belt and braces: never let a stray native selection eat the next stroke.
    const sel = window.getSelection?.();
    if (sel && sel.rangeCount && !document.activeElement?.isContentEditable) sel.removeAllRanges();
  }

  _onDownRest(e, onBtn, penGap, fingerOnBox) {
    // Only two TOUCHES arriving together are a pinch. A pencil sharing the map with
    // a touch must never count toward that, and a touch that shows up well after an
    // already-settled one is a hand shifting, not a second finger joining a gesture.
    const touches = [...this._pointers.values()].filter(p => p.type === 'touch');
    if (e.pointerType === 'touch' && touches.length === 2) {
      const [a, b] = touches;
      if (Math.abs(a.downAt - b.downAt) > PAIR_WINDOW_MS) { this._reject(e); return; }
      if (!this._pan) this._gestureOrigin = { zoom: this.zoom, tx: this.tx, ty: this.ty };
      // A pinch that began on a checkbox is a pinch, not a tap on it.
      for (const [id, bt] of [...this._btnTaps]) if (bt.type === 'touch') this._btnTaps.delete(id);
      this.cancelDraw(); this.startPinch(); return;
    }
    if (touches.length > 2) { this._reject(e); return; }

    if (e.pointerType === 'pen') this.app.notePen();

    const mode = this.inputMode(e);
    if (mode === 'pan') {
      this._gestureOrigin = { zoom: this.zoom, tx: this.tx, ty: this.ty };
      this._pan = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty, live: false };
      return;
    }
    // A finger on a checkbox may scroll or pinch from there, but never starts the
    // current tool (finger drawing on) — that tap belongs to the box.
    if (fingerOnBox) return;

    // Capture can throw if the pointer is already gone (cancelled by the system
    // between dispatch and here); that must never abort the stroke itself.
    try { this.vp.setPointerCapture?.(e.pointerId); } catch {}
    const hit = this.toPage(e.clientX, e.clientY);
    const tool = this.app.tool;

    if (this.selection && this.hitSelection(hit)) { this.startMoveSelection(e, hit); return; }
    this.clearSelection();

    if (tool.name === 'text') { this.addTextBox(hit); return; }
    if (tool.name === 'eraser') {
      this._erase = { id: e.pointerId, page: hit.page, before: hit.page.strokes.slice(), beforeObjs: hit.page.objects.slice(), changed: false };
      this.eraseAt(hit); return;
    }
    if (tool.name === 'lasso') { this._lasso = { id: e.pointerId, page: hit.page, pts: [hit.x, hit.y], x0: hit.x, y0: hit.y, far: 0 }; return; }

    const draw = new Ink.StrokeCapture(tool.name === 'shapes' ? 'pen' : tool.name, tool.color, tool.size);
    draw.add(hit.x, hit.y, e.pressure, performance.now());
    this._draw = { id: e.pointerId, cap: draw, page: hit.page, lastMove: performance.now(), t0: performance.now(),
                   forceShape: tool.name === 'shapes', dotOK: e.pointerType !== 'touch', onBtn, penGap };
    this.paintLive();
  }

  onMove(e) {
    // A Pencil in contact owns the page (PEN_GRACE after it lifts). A Pencil merely
    // hovering above the glass (newer iPads) counts for a short window only, so a
    // finger can scroll again soon after the Pencil moves away.
    if (e.pointerType === 'pen') { if (e.buttons || this._penDown) this._lastPenAt = performance.now(); else this._lastHoverAt = performance.now(); }
    if (this._rejected.has(e.pointerId)) return;
    if (this.isPalm(e) && !this._pointers.has(e.pointerId)) return;
    if (this._pointers.has(e.pointerId)) {
      const p = this._pointers.get(e.pointerId); p.x = e.clientX; p.y = e.clientY;
    }
    if (this._pinch) { if (this._touchPair().every(Boolean)) this.movePinch(); return; }
    if (this._pan) {
      // Only the finger that started the pan moves the page — never a hovering
      // Pencil or some other contact's coordinates.
      if (e.pointerId !== this._pan.id) return;
      if (!this._pan.live) {
        // A hand settling onto the glass wobbles a few pixels; a scroll doesn't.
        if (Math.hypot(e.clientX - this._pan.x, e.clientY - this._pan.y) < PAN_SLOP_PX) return;
        this._pan.live = true;
        this._pan.x = e.clientX; this._pan.y = e.clientY;
      }
      this.tx = this._pan.tx + (e.clientX - this._pan.x);
      this.ty = this._pan.ty + (e.clientY - this._pan.y);
      this.applyTransform();
      return;
    }
    if (this._moveSel) { if (this._moveSel.id == null || this._moveSel.id === e.pointerId) this.moveSelection(e); return; }

    const owner = this._draw?.id ?? this._erase?.id ?? this._lasso?.id;
    if (owner != null && e.pointerId !== owner) return;

    const hit = this.toPage(e.clientX, e.clientY);
    if (this._erase) { this.eraseAt(hit); return; }
    if (this._lasso) {
      this._lasso.pts.push(hit.x, hit.y);
      this._lasso.far = Math.max(this._lasso.far, Math.hypot(hit.x - this._lasso.x0, hit.y - this._lasso.y0));
      this.paintLasso(); return;
    }
    if (!this._draw) return;

    // Coalesced events give us the full-rate pencil samples between frames.
    // Some events report none — fall back to the event itself so no sample is lost.
    let evts = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (!evts || !evts.length) evts = [e];
    let moved = false;
    for (const ev of evts) {
      const h = this.toPage(ev.clientX, ev.clientY);
      if (this._draw.cap.add(h.x, h.y, ev.pressure, performance.now())) moved = true;
    }
    if (moved) this._draw.lastMove = performance.now();
    this.paintLive();
  }

  onUp(e) {
    if (e.pointerType === 'pen') { this._penDown = false; this._lastPenAt = this._lastPenUpAt = performance.now(); }
    // A resting hand lifting off ends nothing — not a stroke, a pan, or a selection drag.
    if (this._rejected.delete(e.pointerId)) return;
    this._pointers.delete(e.pointerId);
    if (this._touchPair().some(p => !p) && this._pinch) {
      const tt = this._twoTap;
      this._pinch = null; this._twoTap = null;
      // A quick two-finger tap that neither zoomed nor panned = swap pen ⇄ eraser.
      if (this.app.settings.twoFingerSwap && tt && !tt.palm &&
          performance.now() - tt.t0 < 320 && tt.moved < 16 && Math.abs(this.zoom / tt.zoom0 - 1) < 0.04) {
        this._pointers.clear();
        this.quickSwap();
        return;
      }
    }
    if (this._pan && e.pointerId === this._pan.id) {
      // A finger tap (never moved far enough to scroll) on the page ends text editing.
      if (!this._pan.live && e.type === 'pointerup') this._blurEditing();
      this._pan = null; this._gestureOrigin = null; this.updatePageNo(); return;
    }
    if (this._pan && this._pointers.size === 0) { this._pan = null; this._gestureOrigin = null; this.updatePageNo(); return; }
    if (!this._pinch && !this._pan) this._gestureOrigin = null;
    if (this._moveSel) {
      if (this._moveSel.id == null || this._moveSel.id === e.pointerId) this.endMoveSelection();
      return;
    }

    // A resting hand lifting off must not end the stroke the pencil is still drawing.
    const owner = this._draw?.id ?? this._erase?.id ?? this._lasso?.id;
    if (owner != null && e.pointerId !== owner) return;

    if (this._erase) { this.commitErase(); return; }
    if (this._lasso) { this.commitLasso(); return; }
    if (!this._draw) return;

    const { cap, page, onBtn } = this._draw;
    const held = performance.now() - this._draw.lastMove;
    if (onBtn) {
      const r0 = cap.raw[0];
      const reach = Math.max(0, ...cap.raw.map(q => Math.hypot(q.x - r0.x, q.y - r0.y)));
      // A deliberate Pencil tap on a checkbox toggles it and leaves no ink — unless it
      // came mid-handwriting (an i-dot or full stop that happened to land on a hidden
      // hit area), in which case it's ink. Anything that moved is ink too. The native
      // click is always swallowed (bindInput); the editor activates the box itself.
      if (reach < 4 && performance.now() - this._draw.t0 < 600 && this._draw.penGap > 450) {
        this.clearLive(page); this._draw = null;
        this._liveBtn(onBtn, page.id, onBtn.dataset.k)?.click();
        return;
      }
    }
    let pts = cap.smoothed();

    // pts is flat [x, y, p, ...]. A single sample is a deliberate dot from the Pencil
    // (i-dots, full stops) and used to be thrown away; from a finger it isn't kept.
    if (pts.length >= 6 || (pts.length >= 3 && this._draw.dotOK)) {
      if (pts.length >= 6 && (this._draw.forceShape || held > 420)) {
        const sh = Ink.recognizeShape(pts);
        if (sh) { pts = Ink.shapeToPoints(sh); if (navigator.vibrate) navigator.vibrate(8); }
      }
      const stroke = { id: S.uid(), tool: cap.tool, color: cap.color, size: cap.size, pts };
      page.strokes.push(stroke);
      this.pushUndo({
        undo: () => { page.strokes = page.strokes.filter(s => s.id !== stroke.id); this.queueSave(page); this.renderPage(page); },
        redo: () => { page.strokes.push(stroke); this.queueSave(page); this.renderPage(page); }
      });
      this.queueSave(page);
      this.renderPage(page);
    }
    this.clearLive(page);
    this._draw = null;
  }

  /** Put the view back where it was when the current touch gesture began. */
  _restoreView() {
    const o = this._gestureOrigin; this._gestureOrigin = null;
    if (!o) return;
    if (o.zoom === this.zoom && o.tx === this.tx && o.ty === this.ty) return;
    this.zoom = o.zoom; this.tx = o.tx; this.ty = o.ty;
    this.applyTransform();
  }

  cancelDraw() {
    if (this._draw) { this.clearLive(this._draw.page); this._draw = null; }
    this._lasso = null; this._erase = null;
  }

  _touchPair() {
    // Always the two touches, even if a pen contact happens to share the map —
    // a pinch is a two-finger thing and must never read a pen tip as one of them.
    const t = [...this._pointers.values()].filter(p => p.type === 'touch');
    return [t[0], t[1]];
  }
  startPinch() {
    const [a, b] = this._touchPair();
    const r = this.vp.getBoundingClientRect();
    // Two contacts sitting far apart, or arriving while the pencil is live, are a
    // hand resting on the glass — not a deliberate two-finger tap.
    const spread = Math.hypot(a.x - b.x, a.y - b.y);
    this._twoTap = {
      t0: performance.now(), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, zoom0: this.zoom, moved: 0,
      palm: spread > 260 || this._penDown || performance.now() - (this._lastPenAt || -1e9) < PEN_GRACE_MS
    };
    this._pinch = {
      d: Math.hypot(a.x - b.x, a.y - b.y),
      cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top,
      zoom: this.zoom, tx: this.tx, ty: this.ty, armed: false
    };
    this._pan = null;
  }
  movePinch() {
    const [a, b] = this._touchPair();
    if (!a || !b) return;
    const r = this.vp.getBoundingClientRect();
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
    if (this._twoTap) this._twoTap.moved = Math.max(this._twoTap.moved, Math.hypot(cx + r.left - this._twoTap.cx, cy + r.top - this._twoTap.cy));

    if (!this._pinch.armed) {
      // Two contacts that both belong to one settling hand drift by a percent or
      // two, not a deliberate spread — the very first hand-down of a session (no
      // pen history yet to have flagged it as a palm) shouldn't be able to zoom
      // the page just because it happened to register as two touches. Require a
      // real, decisive pinch before this starts moving anything, and keep the
      // baseline fresh in the meantime so arming never causes a visible jump.
      if (Math.abs(d - this._pinch.d) / (this._pinch.d || 1) < 0.06) {
        this._pinch.d = d; this._pinch.cx = cx; this._pinch.cy = cy;
        this._pinch.zoom = this.zoom; this._pinch.tx = this.tx; this._pinch.ty = this.ty;
        return;
      }
      this._pinch.armed = true;
    }

    const k = d / (this._pinch.d || 1);
    const nz = Math.max(0.18, Math.min(6, this._pinch.zoom * k));
    const kk = nz / this._pinch.zoom;
    this.zoom = nz;
    this.tx = cx - (this._pinch.cx - this._pinch.tx) * kk;
    this.ty = cy - (this._pinch.cy - this._pinch.ty) * kk;
    this.applyTransform();
    clearTimeout(this._zt);
    this._zt = setTimeout(() => {
      const want = Math.max(1, Math.min(3, Math.round(this.zoom * DPR() * 2) / 2));
      if (Math.abs(want - this.renderScale) > 0.24) { this.renderScale = want; this.pages.forEach(p => this.renderPage(p)); }
    }, 260);
  }

  /* ---- live layer ---- */
  paintLive() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      const d = this._draw; if (!d) return;
      const c = this.pageEls.get(d.page.id)?.querySelector('.live'); if (!c) return;
      const R = this.renderScale, ctx = c.getContext('2d');
      ctx.setTransform(R, 0, 0, R, 0, 0);
      ctx.clearRect(0, 0, d.page.w, d.page.h);
      Ink.drawStroke(ctx, { tool: d.cap.tool, color: d.cap.color, size: d.cap.size, pts: d.cap.smoothed() });
    });
  }
  clearLive(page) {
    const c = this.pageEls.get(page.id)?.querySelector('.live');
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  }
  paintLasso() {
    const l = this._lasso;
    const c = this.pageEls.get(l.page.id)?.querySelector('.live'); if (!c) return;
    const R = this.renderScale, ctx = c.getContext('2d');
    ctx.setTransform(R, 0, 0, R, 0, 0);
    ctx.clearRect(0, 0, l.page.w, l.page.h);
    ctx.save();
    ctx.strokeStyle = '#2f7fd1'; ctx.lineWidth = 2 / this.zoom * 1.4; ctx.setLineDash([8, 6]);
    ctx.fillStyle = 'rgba(47,127,209,.08)';
    ctx.beginPath(); ctx.moveTo(l.pts[0], l.pts[1]);
    for (let i = 2; i < l.pts.length; i += 2) ctx.lineTo(l.pts[i], l.pts[i + 1]);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /* ---- eraser ---- */
  eraseAt(hit) {
    if (!this._erase || hit.page !== this._erase.page) return;
    const t = this.app.tool;
    const r = (t.eraserSize || 30) / 2;
    const page = hit.page;
    const mode = t.eraseMode || 'precise';
    let changed = false;

    if (mode === 'precise') {
      const out = [];
      for (const st of page.strokes) {
        const pieces = Ink.eraseFromStroke(st, hit.x, hit.y, r, S.uid);
        if (pieces === null) { out.push(st); continue; }
        changed = true;
        out.push(...pieces);
      }
      if (changed) page.strokes = out;
    } else {
      const keep = [];
      for (const st of page.strokes) {
        if (Ink.strokeHits(st, hit.x, hit.y, r)) changed = true;
        else keep.push(st);
      }
      if (changed) page.strokes = keep;
      if (mode === 'object') {
        const objs = page.objects.filter(o => !(o.type === 'image' &&
          hit.x > o.x - r && hit.x < o.x + o.w + r && hit.y > o.y - r && hit.y < o.y + o.h + r));
        if (objs.length !== page.objects.length) { page.objects = objs; changed = true; this.syncOverlay(page); }
      }
    }
    if (changed) { this._erase.changed = true; this.renderPage(page); }
    this.paintEraserRing(page, hit.x, hit.y, r);
  }

  paintEraserRing(page, x, y, r) {
    const c = this.pageEls.get(page.id)?.querySelector('.live'); if (!c) return;
    const R = this.renderScale, ctx = c.getContext('2d');
    ctx.setTransform(R, 0, 0, R, 0, 0);
    ctx.clearRect(0, 0, page.w, page.h);
    ctx.save();
    ctx.strokeStyle = 'rgba(90,110,140,.75)'; ctx.lineWidth = 1.6 / this.zoom;
    ctx.fillStyle = 'rgba(160,180,210,.16)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.284); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  commitErase() {
    const e = this._erase; this._erase = null;
    if (!e) return;
    this.clearLive(e.page);
    if (!e.changed) return;
    const page = e.page;
    const before = e.before, beforeObjs = e.beforeObjs;
    const after = page.strokes.slice(), afterObjs = page.objects.slice();
    this.queueSave(page);
    this.pushUndo({
      undo: () => { page.strokes = before.slice(); page.objects = beforeObjs.slice(); this.queueSave(page); this.renderPage(page); },
      redo: () => { page.strokes = after.slice(); page.objects = afterObjs.slice(); this.queueSave(page); this.renderPage(page); }
    });
  }

  /* ---- selection ---- */
  commitLasso() {
    const l = this._lasso; this._lasso = null;
    if (!l) return;
    this.clearLive(l.page);

    // A tap (rather than a loop) selects whatever sits under the finger.
    if (l.pts.length < 8 || l.far < 14) { this.tapSelect(l.page, l.x0, l.y0); return; }
    const strokes = l.page.strokes.filter(s => Ink.strokeMostlyInPoly(s, l.pts));
    const objs = l.page.objects.filter(o => o.type === 'image' && Ink.pointInPoly(o.x + o.w / 2, o.y + o.h / 2, l.pts));
    if (!strokes.length && !objs.length) return;
    this.selection = { page: l.page, strokes, objs, bounds: this.calcBounds(strokes, objs) };
    this.drawSelFrame();
  }

  /** Pick the topmost image/stroke under a point. */
  tapSelect(page, x, y) {
    for (let i = page.objects.length - 1; i >= 0; i--) {
      const o = page.objects[i];
      if (o.type !== 'image') continue;
      if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) {
        this.selection = { page, strokes: [], objs: [o], bounds: this.calcBounds([], [o]) };
        this.drawSelFrame();
        return;
      }
    }
    // nothing there — grab nearby ink instead so a tap on writing still selects it
    const near = page.strokes.filter(st => Ink.strokeHits(st, x, y, 22));
    if (!near.length) { this.clearSelection(); return; }
    const seed = Ink.strokeBounds(near[near.length - 1]);
    const pad = 26;
    const group = page.strokes.filter(st => {
      const b = Ink.strokeBounds(st);
      return b.x1 > seed.x0 - pad && b.x0 < seed.x1 + pad && b.y1 > seed.y0 - pad && b.y0 < seed.y1 + pad;
    });
    this.selection = { page, strokes: group, objs: [], bounds: this.calcBounds(group, []) };
    this.drawSelFrame();
  }

  calcBounds(strokes, objs) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) { const b = Ink.strokeBounds(s); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
    for (const o of objs) { x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x + o.w); y1 = Math.max(y1, o.y + o.h); }
    return { x0, y0, x1, y1 };
  }

  drawSelFrame() {
    const s = this.selection;
    if (!s) { this.selEl.hidden = true; return; }
    const pd = this.pageEls.get(s.page.id);
    const b = s.bounds;
    const pad = 8;
    this.selEl.hidden = false;
    this.selEl.style.left = (this.tx + (b.x0 - pad) * this.zoom) + 'px';
    this.selEl.style.top = (this.ty + (s.page._y + b.y0 - pad) * this.zoom) + 'px';
    this.selEl.style.width = ((b.x1 - b.x0 + pad * 2) * this.zoom) + 'px';
    this.selEl.style.height = ((b.y1 - b.y0 + pad * 2) * this.zoom) + 'px';
    this.selEl.innerHTML = `<div class="h nw"></div><div class="h ne"></div><div class="h sw"></div><div class="h se"></div>
      <div class="selbar">
        <button data-s="copy" title="Duplicate">${icon('copy')}</button>
        <button data-s="share" title="Share">${icon('share')}</button>
        <button data-s="del" title="Delete">${icon('trash')}</button>
      </div>`;
    this.selEl.querySelectorAll('[data-s]').forEach(b2 => b2.onclick = ev => {
      ev.stopPropagation();
      const k = b2.dataset.s;
      if (k === 'del') this.deleteSelection();
      if (k === 'copy') this.duplicateSelection();
      if (k === 'share') this.shareSelection();
    });
    // A resting hand landing on the selection must not drag or resize it.
    const palmHere = ev => {
      if (!this.isPalm(ev) && !this._rejected.has(ev.pointerId)) return false;
      ev.stopPropagation(); this._reject(ev); return true;
    };
    this.selEl.querySelectorAll('.h').forEach(h => h.addEventListener('pointerdown', ev => {
      if (palmHere(ev)) return;
      ev.stopPropagation(); ev.preventDefault();
      // The handles are rebuilt on every move; capture on the viewport so the drag
      // isn't stranded on a node that no longer exists.
      try { this.vp.setPointerCapture?.(ev.pointerId); } catch {}
      this.startScale(ev, h.className.split(' ')[1]);
    }));
    // Assigned, not added: this frame is redrawn on every move, and addEventListener
    // here used to stack a fresh copy of the handler each time.
    this.selEl.onpointerdown = ev => {
      if (ev.target.closest('.selbar, .h')) return;
      if (palmHere(ev)) return;
      ev.stopPropagation();
      this._moveSel = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, moved: false, before: this.snapshotSel() };
      try { this.selEl.setPointerCapture?.(ev.pointerId); } catch {}
    };
  }

  snapshotSel() {
    const s = this.selection;
    return {
      strokes: s.strokes.map(x => ({ id: x.id, pts: x.pts.slice(), size: x.size })),
      objs: s.objs.map(o => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h }))
    };
  }
  restoreSel(snap) {
    const s = this.selection; if (!s) return;
    for (const b of snap.strokes) { const t = s.strokes.find(x => x.id === b.id); if (t) { t.pts = b.pts.slice(); t.size = b.size; } }
    for (const b of snap.objs) { const t = s.objs.find(x => x.id === b.id); if (t) Object.assign(t, b); }
  }

  hitSelection(hit) {
    const s = this.selection;
    if (!s || s.page !== hit.page) return false;
    const b = s.bounds;
    return hit.x >= b.x0 - 8 && hit.x <= b.x1 + 8 && hit.y >= b.y0 - 8 && hit.y <= b.y1 + 8;
  }
  startMoveSelection(e, hit) {
    this._moveSel = { id: e.pointerId, x: e.clientX, y: e.clientY, before: this.snapshotSel() };
  }
  moveSelection(e) {
    const m = this._moveSel, s = this.selection;
    const dx = (e.clientX - m.x) / this.zoom, dy = (e.clientY - m.y) / this.zoom;
    m.x = e.clientX; m.y = e.clientY;
    if (m.scale) return this.scaleSelection(e);
    for (const st of s.strokes) Ink.transformStroke(st, dx, dy);
    for (const o of s.objs) { o.x += dx; o.y += dy; }
    s.bounds = this.calcBounds(s.strokes, s.objs);
    this.renderPage(s.page); this.drawSelFrame();
  }
  startScale(ev, corner) {
    const s = this.selection;
    this._moveSel = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, scale: corner, before: this.snapshotSel(), b0: { ...s.bounds } };
  }
  scaleSelection(e) {
    const m = this._moveSel, s = this.selection, b = m.b0;
    const dr = this.doc.getBoundingClientRect();
    const px = (e.clientX - dr.left) / this.zoom, py = (e.clientY - dr.top) / this.zoom - s.page._y;
    const anchorX = m.scale.includes('w') ? b.x1 : b.x0;
    const anchorY = m.scale.includes('n') ? b.y1 : b.y0;
    let sx = (px - anchorX) / ((m.scale.includes('w') ? b.x0 : b.x1) - anchorX || 1);
    let sy = (py - anchorY) / ((m.scale.includes('n') ? b.y0 : b.y1) - anchorY || 1);
    const k = Math.max(0.08, Math.min(8, (Math.abs(sx) + Math.abs(sy)) / 2));
    this.restoreSel(m.before);
    for (const st of s.strokes) Ink.transformStroke(st, 0, 0, k, k, anchorX, anchorY);
    for (const o of s.objs) {
      o.x = anchorX + (o.x - anchorX) * k; o.y = anchorY + (o.y - anchorY) * k;
      o.w *= k; o.h *= k;
    }
    s.bounds = this.calcBounds(s.strokes, s.objs);
    this.renderPage(s.page); this.drawSelFrame();
  }
  endMoveSelection() {
    const m = this._moveSel; this._moveSel = null;
    if (!m || !this.selection) return;
    const s = this.selection, before = m.before, after = this.snapshotSel();
    this.queueSave(s.page);
    this.pushUndo({
      undo: () => { this.applySnap(s.page, before); this.renderPage(s.page); this.clearSelection(); },
      redo: () => { this.applySnap(s.page, after); this.renderPage(s.page); }
    });
  }
  applySnap(page, snap) {
    for (const b of snap.strokes) { const t = page.strokes.find(x => x.id === b.id); if (t) { t.pts = b.pts.slice(); t.size = b.size; } }
    for (const b of snap.objs) { const t = page.objects.find(x => x.id === b.id); if (t) Object.assign(t, b); }
    this.queueSave(page);
  }

  clearSelection() { this.selection = null; this.selEl.hidden = true; }

  deleteSelection() {
    const s = this.selection; if (!s) return;
    const page = s.page, sids = new Set(s.strokes.map(x => x.id)), oids = new Set(s.objs.map(x => x.id));
    const rs = s.strokes, ro = s.objs;
    page.strokes = page.strokes.filter(x => !sids.has(x.id));
    page.objects = page.objects.filter(x => !oids.has(x.id));
    this.queueSave(page); this.renderPage(page); this.clearSelection();
    this.pushUndo({
      undo: () => { page.strokes.push(...rs); page.objects.push(...ro); this.queueSave(page); this.renderPage(page); },
      redo: () => { page.strokes = page.strokes.filter(x => !sids.has(x.id)); page.objects = page.objects.filter(x => !oids.has(x.id)); this.queueSave(page); this.renderPage(page); }
    });
  }
  duplicateSelection() {
    const s = this.selection; if (!s) return;
    const page = s.page, off = 26;
    const ns = s.strokes.map(x => ({ ...JSON.parse(JSON.stringify(x)), id: S.uid() }));
    ns.forEach(x => Ink.transformStroke(x, off, off));
    const no = s.objs.map(o => ({ ...o, id: S.uid(), x: o.x + off, y: o.y + off }));
    page.strokes.push(...ns); page.objects.push(...no);
    this.queueSave(page); this.renderPage(page);
    this.selection = { page, strokes: ns, objs: no, bounds: this.calcBounds(ns, no) };
    this.drawSelFrame();
  }
  recolorSelection(color) {
    const s = this.selection; if (!s || !s.strokes.length) return;
    s.strokes.forEach(x => x.color = color);
    this.queueSave(s.page); this.renderPage(s.page);
  }

  /* ================= text, images, audio ================= */

  addTextBox(hit) {
    const o = { id: S.uid(), type: 'text', x: hit.x, y: hit.y - 20, w: Math.min(560, hit.page.w - hit.x - 60), size: 30, color: this.app.tool.color, text: '' };
    hit.page.objects.push(o);
    this.queueSave(hit.page); this.syncOverlay(hit.page);
    setTimeout(() => this.pageEls.get(hit.page.id)?.querySelector(`[data-oid="${o.id}"]`)?.focus(), 50);
    this.setTool(this.app.tool.prevTool === 'text' ? 'pen' : (this.app.tool.prevTool || 'pen'));
    this.pushUndo({
      undo: () => { hit.page.objects = hit.page.objects.filter(x => x.id !== o.id); this.queueSave(hit.page); this.syncOverlay(hit.page); },
      redo: () => { hit.page.objects.push(o); this.queueSave(hit.page); this.syncOverlay(hit.page); }
    });
  }

  pickImage() {
    const inp = el('<input type="file" accept="image/*" style="display:none">');
    document.body.appendChild(inp);
    inp.onchange = () => { if (inp.files[0]) this.insertImageFile(inp.files[0], null); inp.remove(); };
    inp.click();
  }

  async insertImageFile(file, at) {
    if (!file) return;
    const shrunk = await downscale(file, 2000);
    const blobId = await S.putBlob(shrunk);
    const img = await this.loadImage(blobId);
    const i = at ? this.pages.indexOf(at.page) : this.currentPageIndex();
    const page = this.pages[i < 0 ? 0 : i];
    const maxW = page.w * 0.62;
    const scale = Math.min(1, maxW / img.naturalWidth);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    const o = { id: S.uid(), type: 'image', blobId, x: at ? at.x - w / 2 : (page.w - w) / 2, y: at ? at.y - h / 2 : 200, w, h, rot: 0 };
    o.x = Math.max(20, Math.min(o.x, page.w - w - 20));
    o.y = Math.max(20, Math.min(o.y, page.h - h - 20));
    page.objects.push(o);
    await S.savePage(page);
    this.renderPage(page);
    this.selection = { page, strokes: [], objs: [o], bounds: this.calcBounds([], [o]) };
    this.drawSelFrame();
    this.app.markDirty();
    this.pushUndo({
      undo: () => { page.objects = page.objects.filter(x => x.id !== o.id); this.queueSave(page); this.renderPage(page); },
      redo: () => { page.objects.push(o); this.queueSave(page); this.renderPage(page); }
    });
  }

  async toggleRecording() {
    if (this.recorder) return this.stopRecording();
    if (!navigator.mediaDevices?.getUserMedia) return toast('Recording is not available in this browser', 'error');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return toast('Microphone permission was declined', 'error'); }
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(m => MediaRecorder.isTypeSupported?.(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    const t0 = Date.now();
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/mp4' });
      const blobId = await S.putBlob(blob);
      const page = this.pages[this.currentPageIndex()];
      const o = { id: S.uid(), type: 'audio', blobId, x: 90, y: 90 + (page.objects.filter(x => x.type === 'audio').length * 66),
                  dur: Math.round((Date.now() - t0) / 1000), label: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) };
      page.objects.push(o);
      await S.savePage(page);
      this.syncOverlay(page); this.app.markDirty();
      toast('Voice note added');
    };
    rec.start();
    this.recorder = rec;
    this.showRecBar(t0);
  }

  stopRecording(silent) {
    if (!this.recorder) return;
    try { this.recorder.stop(); } catch {}
    this.recorder = null;
    document.getElementById('recbar')?.remove();
    clearInterval(this._recT);
  }

  showRecBar(t0) {
    document.getElementById('recbar')?.remove();
    const b = el(`<div id="recbar" class="recbar"><i class="rdot"></i><span>0:00</span><button>${icon('stop')} Stop</button></div>`);
    document.body.appendChild(b);
    b.querySelector('button').onclick = () => this.stopRecording();
    this._recT = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      b.querySelector('span').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 500);
  }

  /* ================= export & share ================= */

  async renderPageToCanvas(page, scale = 2, white = false) {
    const c = document.createElement('canvas');
    c.width = Math.round(page.w * scale); c.height = Math.round(page.h * scale);
    const ctx = c.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (white) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, page.w, page.h); }
    drawPaper(ctx, page);
    for (const o of page.objects) {
      if (o.type !== 'image') continue;
      const img = await this.loadImage(o.blobId);
      if (img) { ctx.save(); ctx.translate(o.x + o.w / 2, o.y + o.h / 2); if (o.rot) ctx.rotate(o.rot); ctx.drawImage(img, -o.w / 2, -o.h / 2, o.w, o.h); ctx.restore(); }
    }
    for (const s of page.strokes) Ink.drawStroke(ctx, s);
    // Ticks and fills for to-do / daily, whose marks live in the DOM rather than on
    // the canvas. Weekly, month and goals pages already drew theirs in drawPaper().
    if (page.paper.kind === 'todo' || page.paper.kind === 'daily') {
      const checks = page.meta?.checks || {};
      const t = page.paper.kind === 'daily' ? dailyTargets() : { boxes: todoCheckboxes(page), glasses: [] };
      ctx.save(); ctx.strokeStyle = '#2f9e8f'; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const b of t.boxes) {
        if (!checks[b.key]) continue;
        const k = b.s / 24;
        ctx.beginPath();
        ctx.moveTo(b.x + 5 * k, b.y + 12 * k); ctx.lineTo(b.x + 10 * k, b.y + 18 * k); ctx.lineTo(b.x + 19 * k, b.y + 6 * k);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(47,127,209,.32)';
      for (const g of t.glasses) {
        if (!checks[g.key]) continue;
        ctx.beginPath();
        ctx.moveTo(g.x + g.s * 0.19, g.y + g.s * 0.14);
        ctx.lineTo(g.x + g.s * 0.81, g.y + g.s * 0.14);
        ctx.lineTo(g.x + g.s * 0.70, g.y + g.s * 0.96);
        ctx.lineTo(g.x + g.s * 0.30, g.y + g.s * 0.96);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // text boxes
    for (const o of page.objects) {
      if (o.type !== 'text' || !o.text) continue;
      ctx.save();
      ctx.fillStyle = o.color || '#1b1f27';
      ctx.font = `${o.size || 30}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = 'top';
      wrapText(ctx, o.text, o.x, o.y, o.w, (o.size || 30) * 1.35);
      ctx.restore();
    }
    // audio pins
    let ai = 0;
    for (const o of page.objects) {
      if (o.type !== 'audio') continue;
      ctx.save();
      ctx.fillStyle = 'rgba(47,127,209,.10)'; ctx.strokeStyle = '#2f7fd1'; ctx.lineWidth = 1.4;
      roundRect(ctx, o.x, o.y, 250, 44, 22); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2f7fd1'; ctx.font = '600 18px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'middle';
      ctx.fillText(`▶  Voice note ${o.label || ''} · ${fmtDur(o.dur)}`, o.x + 20, o.y + 23);
      ctx.restore(); ai++;
    }
    return c;
  }

  async coverCanvas(scale = 2) {
    const svg = coverSVG(this.nb.cover || {}, { title: this.nb.title });
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    const img = new Image();
    await new Promise(r => { img.onload = r; img.onerror = r; img.src = url; });
    const c = document.createElement('canvas');
    c.width = Math.round(PAGE.w * scale); c.height = Math.round(PAGE.h * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    if (img.width) ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  sharePanel(btn) {
    const items = [
      ['page-pdf', 'This page as PDF'],
      ['page-png', 'This page as image'],
      ...(this.nb.sections.length ? [['sec-pdf', 'This tab as PDF']] : []),
      ['nb-pdf', 'Whole notebook as PDF'],
      ['sep', ''],
      ['drive', 'Save PDF to Google Drive'],
      ['backup', 'Download notebook backup (.json)']
    ];
    const w = el(`<div class="menu">${items.map(([a, l]) => a === 'sep' ? '<hr>' : `<button data-x="${a}"><span>${l}</span></button>`).join('')}</div>`);
    const p = popover(btn, w);
    w.addEventListener('click', async e => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      p.remove();
      const k = b.dataset.x;
      if (k === 'page-pdf') this.exportPDF([this.pages[this.currentPageIndex()]], false);
      if (k === 'sec-pdf') this.exportPDF(this.pages, true);
      if (k === 'nb-pdf') this.exportPDF(this.allPages, true);
      if (k === 'page-png') this.exportPNG();
      if (k === 'drive') this.exportPDF(this.allPages, true, 'drive');
      if (k === 'backup') {
        const bundle = await S.exportNotebook(this.nb.id);
        downloadBlob(new Blob([JSON.stringify(bundle)], { type: 'application/json' }), `${this.nb.title}.snb.json`);
      }
    });
  }

  async exportPDF(pages, withCover, dest) {
    const m = modal({ title: 'Building PDF', body: '<p class="muted" data-p>Rendering…</p>' });
    const note = m.body.querySelector('[data-p]');
    try {
      const out = [];
      if (withCover && this.app.settings.pdfCover !== false) {
        const c = await this.coverCanvas(1.7);
        out.push({ jpeg: await canvasToJPEG(c, 0.9), wpx: c.width, hpx: c.height });
      }
      for (let i = 0; i < pages.length; i++) {
        note.textContent = `Rendering page ${i + 1} of ${pages.length}…`;
        await new Promise(r => setTimeout(r));
        const c = await this.renderPageToCanvas(pages[i], 2, true);
        out.push({ jpeg: await canvasToJPEG(c, 0.9), wpx: c.width, hpx: c.height });
      }
      const blob = buildPDF(out, { title: this.nb.title });
      const name = `${safe(this.nb.title)}${pages.length === 1 ? ` — page ${pages[0].index + 1}` : ''}.pdf`;
      m.close();
      if (dest === 'drive') {
        const r = await Drive.uploadFile(blob, name, 'application/pdf');
        toast('Saved to Google Drive → SuperNotes');
        if (r.webViewLink) window.open(r.webViewLink, '_blank');
      } else {
        const res = await shareFile(blob, name, this.nb.title);
        if (res === 'downloaded') toast('PDF downloaded');
      }
    } catch (e) { m.close(); toast(e.message, 'error'); }
  }

  async exportPNG() {
    const page = this.pages[this.currentPageIndex()];
    const c = await this.renderPageToCanvas(page, 2.4, true);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const res = await shareFile(blob, `${safe(this.nb.title)} — page ${page.index + 1}.png`, this.nb.title);
    if (res === 'downloaded') toast('Image downloaded — open it to save to Photos');
    else toast('Choose “Save Image” to put it in Photos');
  }

  async shareSelection() {
    const s = this.selection; if (!s) return;
    const b = s.bounds, pad = 24;
    const sc = 3;
    const c = document.createElement('canvas');
    c.width = Math.round((b.x1 - b.x0 + pad * 2) * sc); c.height = Math.round((b.y1 - b.y0 + pad * 2) * sc);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(sc, 0, 0, sc, -(b.x0 - pad) * sc, -(b.y0 - pad) * sc);
    for (const o of s.objs) { const img = this._imgCache?.get(o.blobId); if (img) ctx.drawImage(img, o.x, o.y, o.w, o.h); }
    for (const st of s.strokes) Ink.drawStroke(ctx, st);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await shareFile(blob, 'selection.png', this.nb.title);
  }

  /* ================= pages panel ================= */

  async pagesPanel() {
    const body = el('<div class="thumbs"></div>');
    const m = modal({ title: 'Pages', body, wide: true, actions: [{ label: 'Done', primary: true }] });
    for (const p of this.pages) {
      const t = el(`<button class="thumb"><canvas width="150" height="212"></canvas><span>${this.pages.indexOf(p) + 1}</span></button>`);
      body.appendChild(t);
      const ctx = t.querySelector('canvas').getContext('2d');
      ctx.scale(150 / p.w, 212 / p.h);
      drawPaper(ctx, p);
      for (const o of p.objects) if (o.type === 'image') { const img = this._imgCache?.get(o.blobId); if (img) ctx.drawImage(img, o.x, o.y, o.w, o.h); }
      for (const s of p.strokes) Ink.drawStroke(ctx, s);
      t.onclick = () => { m.close(); this.scrollToPage(this.pages.indexOf(p)); };
    }
    const add = el(`<button class="thumb add">${icon('plus')}<span>Add page</span></button>`);
    add.onclick = async () => { m.close(); await this.addPage(this.pages.length); this.scrollToPage(this.pages.length - 1); };
    body.appendChild(add);
  }

  /* ================= plumbing ================= */

  queueSave(page) {
    this._saveQ = this._saveQ || new Set();
    this._saveQ.add(page);
    clearTimeout(this._saveT);
    this._saveT = setTimeout(async () => {
      const q = [...this._saveQ]; this._saveQ.clear();
      for (const p of q) await S.savePage(p);
      this.app.markDirty();
    }, 500);
  }

  pushUndo(op) { this.undoStack.push(op); if (this.undoStack.length > 140) this.undoStack.shift(); this.redoStack = []; }
  async undo() { const op = this.undoStack.pop(); if (!op) return; await op.undo(); this.redoStack.push(op); this.clearSelection(); }
  async redo() { const op = this.redoStack.pop(); if (!op) return; await op.redo(); this.undoStack.push(op); this.clearSelection(); }

  updateSyncDot() {
    const b = this.root.querySelector('.sync-btn');
    if (b) b.dataset.state = Drive.state.status;
  }
}

/* ---------- helpers ---------- */

function penIcon(id) {
  return ({ pen: 'pen', ballpoint: 'pen', gel: 'pen', fountain: 'fountain', quill: 'fountain',
            brush: 'marker', felt: 'marker', pencil: 'pencil', crayon: 'pencil',
            pastel: 'pencil', marker: 'marker' })[id] || 'pen';
}

function fmtDur(s) { s = s || 0; return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
const safe = s => String(s).replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);

function wrapText(ctx, text, x, y, maxW, lh) {
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = word; }
      else line = test;
    }
    ctx.fillText(line, x, y); y += lh;
  }
}

async function downscale(file, max) {
  try {
    const bmp = await createImageBitmap(file);
    if (bmp.width <= max && bmp.height <= max) { bmp.close?.(); return file; }
    const k = max / Math.max(bmp.width, bmp.height);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
  } catch { return file; }
}

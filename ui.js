/* ui.js — small UI primitives: icons, toasts, modals, bottom sheets */

export const ICON = {
  pen:        '<path d="M3 21l3.5-.8 12-12a2.1 2.1 0 0 0-3-3l-12 12L3 21z"/><path d="M14.5 5.5l4 4"/>',
  fountain:   '<path d="M3 21c2-6 5-11 9-14l5 5c-3 4-8 7-14 9z"/><path d="M17 12l4-4-5-5-4 4"/>',
  pencil:     '<path d="M4 20l2-6L17 3l4 4L10 18l-6 2z"/><path d="M14 6l4 4"/><path d="M6 14l4 4"/>',
  marker:     '<path d="M9 21H4v-4l9.5-9.5 4 4L9 21z"/><path d="M14.5 4.5l5 5 2-2a2.1 2.1 0 0 0-3-3l-4 0z"/>',
  highlighter:'<path d="M4 21h6l9-9-5-5-9 9v5z"/><path d="M14 5l5 5"/><path d="M3 23h18"/>',
  eraser:     '<path d="M8 21h12"/><path d="M15.5 3.5l5 5a2 2 0 0 1 0 3L12 20H7l-3.5-3.5a2 2 0 0 1 0-3L12.5 3.5a2 2 0 0 1 3 0z"/>',
  lasso:      '<path d="M4 12c0-4 3.6-7 8-7s8 3 8 7-3.6 7-8 7c-1.6 0-3-.3-4.3-.9"/><path d="M6.5 18.5a2 2 0 1 1-2.8 2.8 2 2 0 0 1 2.8-2.8z"/>',
  text:       '<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>',
  image:      '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  mic:        '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v4"/>',
  hand:       '<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6"/><path d="M11 11V4a1.5 1.5 0 0 1 3 0v7"/><path d="M14 11V6a1.5 1.5 0 0 1 3 0v8"/><path d="M17 12a1.5 1.5 0 0 1 3 0v3a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7v-3a1.5 1.5 0 0 1 3 0"/>',
  undo:       '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10H9"/>',
  redo:       '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h6"/>',
  plus:       '<path d="M12 5v14M5 12h14"/>',
  share:      '<path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  pages:      '<rect x="4" y="3" width="12" height="16" rx="2"/><path d="M8 21h10a2 2 0 0 0 2-2V8"/>',
  back:       '<path d="M15 19l-7-7 7-7"/>',
  gear:       '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  cloud:      '<path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 6.5 19h11z"/>',
  trash:      '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  copy:       '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check:      '<path d="M4 12l5 5L20 6"/>',
  close:      '<path d="M6 6l12 12M18 6L6 18"/>',
  book:       '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z"/>',
  journal:    '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M9 7h7M9 11h7M9 15h4"/>',
  todo:       '<path d="M4 6l2 2 3-3"/><path d="M4 13l2 2 3-3"/><path d="M4 20l2 2 3-3"/><path d="M13 7h8M13 14h8M13 21h8"/>',
  search:     '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  play:       '<path d="M7 4l13 8-13 8z"/>',
  stop:       '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  shapes:     '<circle cx="7.5" cy="16" r="4.5"/><rect x="12" y="12" width="9" height="9" rx="1.5"/><path d="M12 3l4.5 7h-9z"/>',
  ocr:        '<path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M20 8V5a1 1 0 0 0-1-1h-3"/><path d="M4 16v3a1 1 0 0 0 1 1h3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M8 12h8"/><path d="M8 9h8"/><path d="M8 15h5"/>',
  more:       '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  zoomin:     '<circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6"/><path d="M20 20l-3.5-3.5"/>',
  zoomout:    '<circle cx="11" cy="11" r="7"/><path d="M8 11h6"/><path d="M20 20l-3.5-3.5"/>',
  grid:       '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[name] || ''}</svg>`;
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

let toastTimer;
export function toast(msg, kind = '') {
  let t = document.getElementById('toast');
  if (!t) { t = el('<div id="toast" class="toast"></div>'); document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast ' + kind; }, kind === 'error' ? 5200 : 2600);
}

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const back = el(`<div class="modal-back"><div class="modal ${wide ? 'wide' : ''}">
    <header><h2></h2><button class="ghost icon-btn" data-x>${icon('close')}</button></header>
    <div class="modal-body"></div><footer></footer></div></div>`);
  back.querySelector('h2').textContent = title || '';
  const b = back.querySelector('.modal-body');
  if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
  const f = back.querySelector('footer');
  if (!actions.length) f.remove();
  actions.forEach(a => {
    const btn = el(`<button class="${a.primary ? 'primary' : a.danger ? 'danger' : ''}">${a.label}</button>`);
    btn.onclick = () => { const r = a.onClick?.(back); if (r !== false) close(); };
    f.appendChild(btn);
  });
  let closed = false;
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const close = () => { if (closed) return; closed = true; document.removeEventListener('keydown', onKey, true); back.remove(); onClose?.(); };
  back.querySelector('[data-x]').onclick = close;
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(back);
  requestAnimationFrame(() => back.classList.add('in'));
  return { root: back, body: b, close };
}

export function confirmDialog(title, message, confirmLabel = 'Delete') {
  return new Promise(res => {
    modal({
      title, body: `<p class="muted">${message}</p>`,
      actions: [
        { label: 'Cancel', onClick: () => res(false) },
        { label: confirmLabel, danger: true, onClick: () => res(true) }
      ],
      onClose: () => res(false)
    });
  });
}

export function promptDialog(title, value = '', placeholder = '') {
  return new Promise(res => {
    const inp = el(`<input class="field" value="${String(value).replace(/"/g, '&quot;')}" placeholder="${placeholder}">`);
    const m = modal({
      title, body: inp,
      actions: [{ label: 'Cancel', onClick: () => res(null) }, { label: 'Save', primary: true, onClick: () => res(inp.value.trim()) }],
      onClose: () => res(null)
    });
    setTimeout(() => { inp.focus(); inp.select(); }, 60);
    inp.onkeydown = e => { if (e.key === 'Enter') { res(inp.value.trim()); m.close(); } };
  });
}

/** anchored popover */
export function popover(anchor, content, opts = {}) {
  document.querySelectorAll('.pop').forEach(p => p.remove());
  const p = el('<div class="pop"></div>');
  if (typeof content === 'string') p.innerHTML = content; else p.appendChild(content);
  document.body.appendChild(p);
  const r = anchor.getBoundingClientRect();
  const pw = p.offsetWidth, ph = p.offsetHeight;
  let x, y;
  if (opts.side === 'right') { x = r.right + 10; y = r.top; }
  else { x = r.left + r.width / 2 - pw / 2; y = r.bottom + 10; }
  x = Math.max(10, Math.min(x, innerWidth - pw - 10));
  y = Math.max(10, Math.min(y, innerHeight - ph - 10));
  p.style.left = x + 'px'; p.style.top = y + 'px';
  requestAnimationFrame(() => p.classList.add('in'));
  const off = e => { if (!p.contains(e.target) && !anchor.contains(e.target)) { p.remove(); document.removeEventListener('pointerdown', off, true); } };
  setTimeout(() => document.addEventListener('pointerdown', off, true), 20);
  return p;
}

export const fmtDate = d => new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export const fmtShort = d => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

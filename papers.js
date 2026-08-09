/* papers.js — page backgrounds drawn straight to canvas (vector, so they stay crisp at any zoom) */

export const PAGE = { w: 1240, h: 1754 };          // A4 at 150 dpi
export const PAGE_LANDSCAPE = { w: 1754, h: 1240 };

export const PAPER_COLORS = {
  white:  { bg: '#ffffff', line: '#c9d6e8', accent: '#e3b7b0', text: '#8a97a8' },
  cream:  { bg: '#fbf6ec', line: '#d9cdb6', accent: '#c9a27a', text: '#9a8b73' },
  sand:   { bg: '#f4efe6', line: '#d5c8b4', accent: '#b99a72', text: '#93856f' },
  mint:   { bg: '#f0f7f3', line: '#bfd9cb', accent: '#7fae95', text: '#7d968a' },
  slate:  { bg: '#eef1f5', line: '#c3ccda', accent: '#8697ad', text: '#7c8899' },
  night:  { bg: '#1d2128', line: '#333b47', accent: '#5b6b82', text: '#7a869a' }
};

export const PAPER_KINDS = [
  { id: 'blank',   label: 'Blank' },
  { id: 'lined',   label: 'Lined' },
  { id: 'narrow',  label: 'Narrow ruled' },
  { id: 'college', label: 'College ruled' },
  { id: 'grid',    label: 'Grid' },
  { id: 'graph',   label: 'Graph' },
  { id: 'dot',     label: 'Dot grid' },
  { id: 'iso',     label: 'Isometric' },
  { id: 'cornell', label: 'Cornell' },
  { id: 'planner', label: 'Day planner' },
  { id: 'music',   label: 'Music staff' },
  { id: 'storyboard', label: 'Storyboard' },
  { id: 'journal', label: 'Journal' },
  { id: 'todo',    label: 'Daily to-do' }
];

export function drawPaper(ctx, page) {
  const w = page.w, h = page.h;
  const c = PAPER_COLORS[page.paper?.color] || PAPER_COLORS.white;
  const kind = page.paper?.kind || 'blank';
  ctx.save();
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = 'butt';

  const M = 96;   // margin
  switch (kind) {
    case 'lined':   rules(ctx, w, h, 44, M, c, true); break;
    case 'narrow':  rules(ctx, w, h, 30, M, c, true); break;
    case 'college': rules(ctx, w, h, 38, M, c, true); break;
    case 'grid':    grid(ctx, w, h, 44, c, 1); break;
    case 'graph':   graph(ctx, w, h, c); break;
    case 'dot':     dots(ctx, w, h, 44, c); break;
    case 'iso':     iso(ctx, w, h, 46, c); break;
    case 'cornell': cornell(ctx, w, h, c); break;
    case 'planner': planner(ctx, w, h, c, page); break;
    case 'music':   music(ctx, w, h, c); break;
    case 'storyboard': storyboard(ctx, w, h, c); break;
    case 'journal': journalPaper(ctx, w, h, c, page); break;
    case 'todo':    todoPaper(ctx, w, h, c, page); break;
    default: break;
  }
  ctx.restore();
}

/* ---- primitives ---- */
function line(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function rules(ctx, w, h, gap, m, c, margin) {
  for (let y = m + gap; y < h - 60; y += gap) line(ctx, 60, y, w - 60, y, c.line, 1);
  if (margin) line(ctx, m + 42, 48, m + 42, h - 48, c.accent, 1.4);
}
function grid(ctx, w, h, gap, c, lw) {
  for (let x = gap; x < w; x += gap) line(ctx, x, 0, x, h, c.line, lw);
  for (let y = gap; y < h; y += gap) line(ctx, 0, y, w, y, c.line, lw);
}
function graph(ctx, w, h, c) {
  grid(ctx, w, h, 22, { line: fade(c.line, 0.5) }, 0.8);
  for (let x = 110; x < w; x += 110) line(ctx, x, 0, x, h, c.line, 1.4);
  for (let y = 110; y < h; y += 110) line(ctx, 0, y, w, y, c.line, 1.4);
}
function dots(ctx, w, h, gap, c) {
  ctx.fillStyle = c.line;
  for (let x = gap; x < w; x += gap) for (let y = gap; y < h; y += gap) {
    ctx.beginPath(); ctx.arc(x, y, 1.9, 0, 6.284); ctx.fill();
  }
}
function iso(ctx, w, h, gap, c) {
  const col = fade(c.line, 0.75), t = Math.tan(Math.PI / 6);
  for (let x = -h * t; x < w + h * t; x += gap) {
    line(ctx, x, 0, x + h * t, h, col, 0.9);
    line(ctx, x, 0, x - h * t, h, col, 0.9);
  }
  for (let y = gap; y < h; y += gap * 1.732) line(ctx, 0, y, w, y, fade(c.line, 0.4), 0.7);
}
function cornell(ctx, w, h, c) {
  const cue = 300, sum = h - 260;
  rules(ctx, w, sum, 44, 60, { line: c.line, accent: c.accent }, false);
  line(ctx, cue, 60, cue, sum, c.accent, 1.6);
  line(ctx, 60, sum, w - 60, sum, c.accent, 1.6);
  label(ctx, 'CUES', 78, 96, c);
  label(ctx, 'NOTES', cue + 20, 96, c);
  label(ctx, 'SUMMARY', 78, sum + 44, c);
}
function planner(ctx, w, h, c) {
  label(ctx, 'DATE', 70, 78, c);
  line(ctx, 150, 84, w - 70, 84, c.line, 1.2);
  const top = 130, rowH = 62;
  for (let i = 0; i < 14; i++) {
    const y = top + i * rowH, hr = 7 + i;
    ctx.fillStyle = c.text; ctx.font = '600 22px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(String(hr).padStart(2, '0') + ':00', 70, y + rowH / 2);
    line(ctx, 150, y, w - 70, y, c.line, i % 2 ? 0.7 : 1.2);
    line(ctx, 150, y + rowH / 2, w - 70, y + rowH / 2, fade(c.line, 0.45), 0.7);
  }
  line(ctx, 150, top + 14 * rowH, w - 70, top + 14 * rowH, c.line, 1.2);
}
function music(ctx, w, h, c) {
  const sets = 10, gap = 12;
  for (let s = 0; s < sets; s++) {
    const top = 120 + s * 152;
    for (let i = 0; i < 5; i++) line(ctx, 80, top + i * gap, w - 80, top + i * gap, c.line, 1.1);
  }
}
function storyboard(ctx, w, h, c) {
  const cols = 2, rows = 3, mx = 80, my = 110, gx = 44, gy = 54;
  const cw = (w - mx * 2 - gx * (cols - 1)) / cols;
  const ch = (h - my * 2 - gy * (rows - 1)) / rows;
  for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
    const x = mx + col * (cw + gx), y = my + r * (ch + gy);
    ctx.strokeStyle = c.line; ctx.lineWidth = 1.4;
    roundRect(ctx, x, y, cw, ch * 0.68, 10); ctx.stroke();
    for (let i = 1; i <= 3; i++) line(ctx, x, y + ch * 0.68 + i * 30, x + cw, y + ch * 0.68 + i * 30, fade(c.line, 0.7), 1);
  }
}

/* ---- journal template ---- */
function journalPaper(ctx, w, h, c, page) {
  const m = 74;
  // header band
  ctx.fillStyle = fade(c.accent, 0.10);
  roundRect(ctx, m, 56, w - m * 2, 108, 16); ctx.fill();
  ctx.fillStyle = c.text;
  ctx.font = '700 20px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('DAILY JOURNAL', m + 26, 92);
  ctx.font = '700 40px ui-serif, Georgia, serif';
  ctx.fillStyle = fade(c.text, 1);
  ctx.fillText(page?.meta?.dateLabel || '', m + 26, 140);

  let y = 214;
  y = section(ctx, m, y, w - m * 2, 'THREE THINGS I\'M GRATEFUL FOR', c, 0);
  for (let i = 0; i < 3; i++) {
    const ry = y + i * 62;
    ctx.strokeStyle = c.accent; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(m + 32, ry + 18, 11, 0, 6.284); ctx.stroke();
    ctx.fillStyle = fade(c.text, 0.9); ctx.font = '600 17px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), m + 28, ry + 19);
    line(ctx, m + 58, ry + 38, w - m - 20, ry + 38, c.line, 1.1);
  }
  y += 3 * 62 + 30;

  y = section(ctx, m, y, w - m * 2, 'HIGHLIGHT OF THE DAY', c, 0);
  for (let i = 0; i < 2; i++) line(ctx, m + 12, y + 38 + i * 48, w - m - 20, y + 38 + i * 48, c.line, 1.1);
  y += 2 * 48 + 46;

  y = section(ctx, m, y, w - m * 2, 'ON MY MIND', c, 0);
  const rest = h - y - 130;
  const rows = Math.floor(rest / 46);
  for (let i = 0; i < rows; i++) line(ctx, m + 12, y + 34 + i * 46, w - m - 20, y + 34 + i * 46, c.line, 1.1);

  // footer mood strip
  const fy = h - 84;
  ctx.fillStyle = fade(c.text, 0.85); ctx.font = '700 15px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillText('MOOD', m, fy);
  const moods = ['○', '○', '○', '○', '○'];
  moods.forEach((_, i) => {
    ctx.strokeStyle = c.line; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(m + 96 + i * 46, fy, 14, 0, 6.284); ctx.stroke();
  });
}

/* ---- daily to-do template ---- */
function todoPaper(ctx, w, h, c, page) {
  const m = 74, colGap = 34;
  ctx.fillStyle = fade(c.accent, 0.10);
  roundRect(ctx, m, 56, w - m * 2, 100, 16); ctx.fill();
  ctx.fillStyle = c.text;
  ctx.font = '700 20px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('DAILY TO-DO', m + 26, 90);
  ctx.font = '700 34px ui-serif, Georgia, serif';
  ctx.fillText(page?.meta?.dateLabel || '', m + 26, 134);

  const colW = (w - m * 2 - colGap) / 2;
  const top = 200;
  panel(ctx, m, top, colW, 262, 'TOP 3 — PERSONAL', c, 3);
  panel(ctx, m + colW + colGap, top, colW, 262, 'TOP 3 — BUSINESS', c, 3);

  const y2 = top + 262 + 40;
  const restH = h - y2 - 90;
  panel(ctx, m, y2, w - m * 2, restH, 'EVERYTHING ELSE', c, Math.floor((restH - 74) / 54));
}

function panel(ctx, x, y, w, h, title, c, rows) {
  ctx.strokeStyle = fade(c.line, 0.9); ctx.lineWidth = 1.4;
  roundRect(ctx, x, y, w, h, 14); ctx.stroke();
  ctx.fillStyle = fade(c.accent, 0.07);
  roundRect(ctx, x, y, w, 46, 14); ctx.fill();
  ctx.fillStyle = c.text; ctx.font = '700 15px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillText(title, x + 18, y + 24);
  for (let i = 0; i < rows; i++) {
    const ry = y + 74 + i * 54;
    if (ry > y + h - 20) break;
    ctx.strokeStyle = c.line; ctx.lineWidth = 1.5;
    roundRect(ctx, x + 20, ry - 12, 24, 24, 6); ctx.stroke();
    line(ctx, x + 58, ry + 16, x + w - 20, ry + 16, fade(c.line, 0.85), 1.1);
  }
}

function section(ctx, x, y, w, title, c) {
  ctx.fillStyle = c.text;
  ctx.font = '700 15px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, x + 12, y + 6);
  line(ctx, x + 12, y + 16, x + w - 20, y + 16, fade(c.accent, 0.5), 1.4);
  return y + 22;
}

function label(ctx, t, x, y, c) {
  ctx.fillStyle = fade(c.text, 0.9);
  ctx.font = '700 15px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(t, x, y);
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fade(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* interactive checkbox positions for to-do pages, in page coordinates */
export function todoCheckboxes(page) {
  const w = page.w, h = page.h, m = 74, colGap = 34;
  const colW = (w - m * 2 - colGap) / 2;
  const out = [];
  const top = 200;
  for (let cIdx = 0; cIdx < 2; cIdx++) {
    const x = m + cIdx * (colW + colGap);
    for (let i = 0; i < 3; i++) out.push({ key: `${cIdx === 0 ? 'p' : 'b'}${i}`, x: x + 20, y: top + 74 + i * 54 - 12, s: 24 });
  }
  const y2 = top + 262 + 40, restH = h - y2 - 90;
  const rows = Math.floor((restH - 74) / 54);
  for (let i = 0; i < rows; i++) out.push({ key: `e${i}`, x: m + 20, y: y2 + 74 + i * 54 - 12, s: 24 });
  return out;
}

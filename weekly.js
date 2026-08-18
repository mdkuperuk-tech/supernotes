/* weekly.js — the weekly planner spread, monthly calendar and SMART goals pages.
   Every filled state is drawn on the page canvas itself (not with CSS), so what
   you see on screen is exactly what lands in the exported PDF. */

export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/* ---------------- page 1: the week's thinking ---------------- */
export const WK1 = (() => {
  const m = 60, W = 1240, H = 1754, gap = 24;
  const colW = (W - m * 2 - gap) / 2;          // 548
  const rx = m + colW + gap;                   // 632
  return {
    m, W, H, colW, rx,
    head:     { x: m,  y: 50,   w: W - m * 2, h: 96 },
    personal: { x: m,  y: 166,  w: colW, h: 206, rows: 3 },
    business: { x: m,  y: 388,  w: colW, h: 206, rows: 3 },
    else:     { x: m,  y: 610,  w: colW, h: 300 },
    manifest: { x: rx, y: 166,  w: colW, h: 744, count: 3, lines: 2 },
    thought:  { x: m,  y: 926,  w: W - m * 2, h: 230 },
    family:   { x: m,  y: 1172, w: colW, h: 522 },
    notes:    { x: rx, y: 1172, w: colW, h: 522 }
  };
})();

/* ---------------- page 2: the trackers ---------------- */
export const GYM_ROWS = [
  { sect: 'FOCUS' },
  { key: 'fu', icon: 'upper',  label: 'Upper body',        write: null },
  { key: 'fl', icon: 'lower',  label: 'Lower body',        write: null },
  { key: 'ff', icon: 'full',   label: 'Full body',         write: null },
  { sect: 'CARDIO', note: [['MINUTES', 0]] },
  { key: 'cb', icon: 'bike',   label: 'Bike',              write: 'min' },
  { key: 'cw', icon: 'walk',   label: 'Walk',              write: 'min' },
  { key: 'cr', icon: 'run',    label: 'Run',               write: 'min' },
  { key: 'co', icon: 'row',    label: 'Row / elliptical',  write: 'min' },
  { sect: 'STRENGTH', note: [['SETS', 0], ['REPS', 94], ['WEIGHT', 208]] },
  { key: 'sc', icon: 'chest',  label: 'Chest press',       write: 'srw' },
  { key: 'sb', icon: 'back',   label: 'Back / arms',       write: 'srw' },
  { key: 'sl', icon: 'legs',   label: 'Legs',              write: 'srw' },
  { key: 'ss', icon: 'shoulder', label: 'Shoulders',       write: 'srw' },
  { key: 'sk', icon: 'core',   label: 'Core',              write: 'srw' },
  { sect: 'RECOVERY' },
  { key: 'rs', icon: 'stretch', label: 'Stretch / mobility', write: 'min' },
  { key: 'rr', icon: 'rest',   label: 'Rest day',          write: null }
];

/* one row per day; the pips are the click-to-fill part */
export const INTAKE = [
  { key: 'w', icon: 'glass',   n: 8, label: 'WATER',  cap: null },
  { key: 'c', icon: 'coffee',  n: 4, label: 'COFFEE', cap: 4 },
  { key: 'a', icon: 'tumbler', n: 3, label: 'DRINKS', cap: 3 }
];

export const HABITS = [
  { key: 'hr', icon: 'book',    label: 'Read / audiobook', short: 'READ' },
  { key: 'hw', icon: 'walk',    label: 'Personal walk',    short: 'WALK' },
  { key: 'hd', icon: 'nophone', label: 'Disconnect time',  short: 'OFFLINE' },
  { key: 'hs', icon: 'sleep',   label: 'Slept 7h+',        short: 'SLEEP' }
];

export const WK2 = (() => {
  const m = 60, W = 1240, H = 1754;
  const gym = { x: m, y: 144, w: W - m * 2, h: 892 };
  // gym internal geometry
  const gLabelW = 292, gDayW = 62, gDayN = 7;
  const gDayX = gym.x + gLabelW + 14;
  const gWriteX = gDayX + gDayW * gDayN + 18;
  return {
    m, W, H,
    head:  { x: m, y: 50, w: W - m * 2, h: 72 },
    gym, gLabelW, gDayW, gDayN, gDayX, gWriteX,
    gTop: gym.y + 92, gRowH: 48, gSectH: 32,
    grid:  { x: m, y: 1058, w: W - m * 2, h: 470 },
    review:{ x: m, y: 1550, w: W - m * 2, h: 150 }
  };
})();

/* ---------------- shared primitives ---------------- */
function fade(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function ln(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function shell(ctx, x, y, w, h, title, c, right) {
  ctx.strokeStyle = fade(c.line, 0.9); ctx.lineWidth = 1.4;
  rr(ctx, x, y, w, h, 14); ctx.stroke();
  ctx.fillStyle = fade(c.accent, 0.07);
  rr(ctx, x, y, w, 46, 14); ctx.fill();
  ctx.fillStyle = c.text; ctx.font = '700 15px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(title, x + 18, y + 24);
  if (right) {
    ctx.textAlign = 'right';
    ctx.fillStyle = fade(c.text, 0.6);
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(right, x + w - 18, y + 24);
    ctx.textAlign = 'left';
  }
}
function ruled(ctx, x, y, w, h, c, top = 88, step = 46) {
  for (let i = 0; ; i++) {
    const yy = y + top + i * step;
    if (yy > y + h - 16) break;
    ln(ctx, x + 20, yy, x + w - 20, yy, fade(c.line, 0.8), 1.1);
  }
}
function box(ctx, x, y, s, c, on) {
  ctx.strokeStyle = fade(c.line, 1); ctx.lineWidth = 1.5;
  rr(ctx, x, y, s, s, 5); ctx.stroke();
  if (on) {
    ctx.save();
    ctx.strokeStyle = '#2f9e8f'; ctx.lineWidth = s / 7.5;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + s * 0.22, y + s * 0.52);
    ctx.lineTo(x + s * 0.43, y + s * 0.74);
    ctx.lineTo(x + s * 0.79, y + s * 0.26);
    ctx.stroke();
    ctx.restore();
  }
}

/* ---------------- fillable pip shapes ----------------
   Each takes (ctx, x, y, s, c, on). Outline always; tinted body when on. */
const PIP_INK = {
  glass:   ['rgba(47,127,209,.62)', 'rgba(47,127,209,.34)'],
  coffee:  ['rgba(140,94,58,.68)',  'rgba(140,94,58,.36)'],
  tumbler: ['rgba(176,116,58,.68)', 'rgba(196,138,64,.38)']
};
function pipGlass(ctx, x, y, s, c, on) {
  const [st, fl] = PIP_INK.glass;
  ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x + s * 0.17, y + s * 0.06);
  ctx.lineTo(x + s * 0.83, y + s * 0.06);
  ctx.lineTo(x + s * 0.70, y + s * 0.96);
  ctx.lineTo(x + s * 0.30, y + s * 0.96);
  ctx.closePath();
  if (on) { ctx.fillStyle = fl; ctx.fill(); }
  ctx.strokeStyle = st; ctx.stroke();
}
function pipCoffee(ctx, x, y, s, c, on) {
  const [st, fl] = PIP_INK.coffee;
  ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // cup body (tapered)
  ctx.beginPath();
  ctx.moveTo(x + s * 0.16, y + s * 0.22);
  ctx.lineTo(x + s * 0.74, y + s * 0.22);
  ctx.lineTo(x + s * 0.64, y + s * 0.92);
  ctx.lineTo(x + s * 0.26, y + s * 0.92);
  ctx.closePath();
  if (on) { ctx.fillStyle = fl; ctx.fill(); }
  ctx.strokeStyle = st; ctx.stroke();
  // handle
  ctx.beginPath();
  ctx.arc(x + s * 0.76, y + s * 0.46, s * 0.15, -Math.PI * 0.45, Math.PI * 0.45);
  ctx.stroke();
  // saucer
  ctx.beginPath();
  ctx.moveTo(x + s * 0.14, y + s * 0.96); ctx.lineTo(x + s * 0.78, y + s * 0.96);
  ctx.stroke();
}
function pipTumbler(ctx, x, y, s, c, on) {
  const [st, fl] = PIP_INK.tumbler;
  ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // short whisky tumbler
  ctx.beginPath();
  ctx.moveTo(x + s * 0.20, y + s * 0.26);
  ctx.lineTo(x + s * 0.80, y + s * 0.26);
  ctx.lineTo(x + s * 0.72, y + s * 0.94);
  ctx.lineTo(x + s * 0.28, y + s * 0.94);
  ctx.closePath();
  if (on) { ctx.fillStyle = fl; ctx.fill(); }
  ctx.strokeStyle = st; ctx.stroke();
  // liquid line
  ctx.beginPath();
  ctx.moveTo(x + s * 0.24, y + s * 0.52); ctx.lineTo(x + s * 0.76, y + s * 0.52);
  ctx.strokeStyle = fade('#b0743a', 0.5); ctx.lineWidth = 1.2; ctx.stroke();
}
export const PIPS = { glass: pipGlass, coffee: pipCoffee, tumbler: pipTumbler };

/* ---------------- row identity icons (not tappable) ---------------- */
function gi(ctx, x, y, s, col, draw) {
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = 1.7; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  draw(ctx, x, y, s);
  ctx.restore();
}
const dot = (ctx, cx, cy, r) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); };
const ICONS = {
  bike: (ctx, x, y, s) => {
    dot(ctx, x + s * 0.24, y + s * 0.70, s * 0.20);
    dot(ctx, x + s * 0.78, y + s * 0.70, s * 0.20);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.24, y + s * 0.70); ctx.lineTo(x + s * 0.46, y + s * 0.70);
    ctx.lineTo(x + s * 0.58, y + s * 0.36); ctx.lineTo(x + s * 0.36, y + s * 0.36);
    ctx.moveTo(x + s * 0.46, y + s * 0.70); ctx.lineTo(x + s * 0.66, y + s * 0.36);
    ctx.moveTo(x + s * 0.66, y + s * 0.36); ctx.lineTo(x + s * 0.78, y + s * 0.70);
    ctx.moveTo(x + s * 0.58, y + s * 0.34); ctx.lineTo(x + s * 0.74, y + s * 0.34);
    ctx.stroke();
  },
  walk: (ctx, x, y, s) => {
    dot(ctx, x + s * 0.52, y + s * 0.16, s * 0.11);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.52, y + s * 0.28); ctx.lineTo(x + s * 0.48, y + s * 0.56);
    ctx.moveTo(x + s * 0.48, y + s * 0.56); ctx.lineTo(x + s * 0.34, y + s * 0.90);
    ctx.moveTo(x + s * 0.48, y + s * 0.56); ctx.lineTo(x + s * 0.68, y + s * 0.88);
    ctx.moveTo(x + s * 0.52, y + s * 0.36); ctx.lineTo(x + s * 0.30, y + s * 0.48);
    ctx.moveTo(x + s * 0.52, y + s * 0.36); ctx.lineTo(x + s * 0.72, y + s * 0.50);
    ctx.stroke();
  },
  run: (ctx, x, y, s) => {
    dot(ctx, x + s * 0.60, y + s * 0.16, s * 0.11);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.58, y + s * 0.28); ctx.lineTo(x + s * 0.44, y + s * 0.54);
    ctx.moveTo(x + s * 0.44, y + s * 0.54); ctx.lineTo(x + s * 0.22, y + s * 0.62);
    ctx.moveTo(x + s * 0.44, y + s * 0.54); ctx.lineTo(x + s * 0.58, y + s * 0.74);
    ctx.lineTo(x + s * 0.44, y + s * 0.92);
    ctx.moveTo(x + s * 0.58, y + s * 0.74); ctx.lineTo(x + s * 0.82, y + s * 0.80);
    ctx.moveTo(x + s * 0.56, y + s * 0.34); ctx.lineTo(x + s * 0.80, y + s * 0.40);
    ctx.stroke();
  },
  row: (ctx, x, y, s) => {
    dot(ctx, x + s * 0.34, y + s * 0.24, s * 0.11);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.34, y + s * 0.36); ctx.lineTo(x + s * 0.40, y + s * 0.62);
    ctx.lineTo(x + s * 0.70, y + s * 0.66);
    ctx.moveTo(x + s * 0.40, y + s * 0.62); ctx.lineTo(x + s * 0.24, y + s * 0.78);
    ctx.moveTo(x + s * 0.16, y + s * 0.44); ctx.lineTo(x + s * 0.88, y + s * 0.56);
    ctx.stroke();
  },
  chest: (ctx, x, y, s) => {   // bench press bar
    ctx.beginPath();
    ctx.moveTo(x + s * 0.10, y + s * 0.50); ctx.lineTo(x + s * 0.90, y + s * 0.50);
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.20, y + s * 0.28); ctx.lineTo(x + s * 0.20, y + s * 0.72);
    ctx.moveTo(x + s * 0.30, y + s * 0.34); ctx.lineTo(x + s * 0.30, y + s * 0.66);
    ctx.moveTo(x + s * 0.70, y + s * 0.34); ctx.lineTo(x + s * 0.70, y + s * 0.66);
    ctx.moveTo(x + s * 0.80, y + s * 0.28); ctx.lineTo(x + s * 0.80, y + s * 0.72);
    ctx.stroke();
  },
  back: (ctx, x, y, s) => {    // dumbbell
    ctx.beginPath();
    ctx.moveTo(x + s * 0.30, y + s * 0.50); ctx.lineTo(x + s * 0.70, y + s * 0.50);
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.18, y + s * 0.30); ctx.lineTo(x + s * 0.18, y + s * 0.70);
    ctx.moveTo(x + s * 0.28, y + s * 0.24); ctx.lineTo(x + s * 0.28, y + s * 0.76);
    ctx.moveTo(x + s * 0.72, y + s * 0.24); ctx.lineTo(x + s * 0.72, y + s * 0.76);
    ctx.moveTo(x + s * 0.82, y + s * 0.30); ctx.lineTo(x + s * 0.82, y + s * 0.70);
    ctx.stroke();
  },
  legs: (ctx, x, y, s) => {
    ctx.beginPath();
    ctx.moveTo(x + s * 0.36, y + s * 0.12); ctx.lineTo(x + s * 0.42, y + s * 0.46);
    ctx.lineTo(x + s * 0.26, y + s * 0.74); ctx.lineTo(x + s * 0.30, y + s * 0.92);
    ctx.moveTo(x + s * 0.62, y + s * 0.12); ctx.lineTo(x + s * 0.58, y + s * 0.46);
    ctx.lineTo(x + s * 0.74, y + s * 0.74); ctx.lineTo(x + s * 0.70, y + s * 0.92);
    ctx.moveTo(x + s * 0.34, y + s * 0.14); ctx.lineTo(x + s * 0.64, y + s * 0.14);
    ctx.stroke();
  },
  shoulder: (ctx, x, y, s) => {
    dot(ctx, x + s * 0.50, y + s * 0.20, s * 0.12);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.50, y + s * 0.34); ctx.lineTo(x + s * 0.50, y + s * 0.72);
    ctx.moveTo(x + s * 0.20, y + s * 0.44); ctx.lineTo(x + s * 0.80, y + s * 0.44);
    ctx.moveTo(x + s * 0.20, y + s * 0.44); ctx.lineTo(x + s * 0.14, y + s * 0.24);
    ctx.moveTo(x + s * 0.80, y + s * 0.44); ctx.lineTo(x + s * 0.86, y + s * 0.24);
    ctx.stroke();
  },
  core: (ctx, x, y, s) => {
    ctx.beginPath();
    ctx.ellipse(x + s * 0.50, y + s * 0.52, s * 0.26, s * 0.36, 0, 0, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * 0.50, y + s * 0.22); ctx.lineTo(x + s * 0.50, y + s * 0.82);
    ctx.moveTo(x + s * 0.28, y + s * 0.44); ctx.lineTo(x + s * 0.72, y + s * 0.44);
    ctx.moveTo(x + s * 0.28, y + s * 0.62); ctx.lineTo(x + s * 0.72, y + s * 0.62);
    ctx.stroke();
  },
  stretch: (ctx, x, y, s) => {
    dot(ctx, x + s * 0.30, y + s * 0.20, s * 0.11);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.30, y + s * 0.32); ctx.lineTo(x + s * 0.36, y + s * 0.62);
    ctx.lineTo(x + s * 0.82, y + s * 0.66);
    ctx.moveTo(x + s * 0.36, y + s * 0.62); ctx.lineTo(x + s * 0.18, y + s * 0.66);
    ctx.moveTo(x + s * 0.34, y + s * 0.40); ctx.lineTo(x + s * 0.74, y + s * 0.58);
    ctx.stroke();
  },
  rest: (ctx, x, y, s) => crescent(ctx, x, y, s),
  upper: (ctx, x, y, s) => {
    ctx.beginPath();
    ctx.moveTo(x + s * 0.22, y + s * 0.34); ctx.lineTo(x + s * 0.50, y + s * 0.16);
    ctx.lineTo(x + s * 0.78, y + s * 0.34);
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.24, y + s * 0.62); ctx.lineTo(x + s * 0.76, y + s * 0.62);
    ctx.moveTo(x + s * 0.24, y + s * 0.82); ctx.lineTo(x + s * 0.76, y + s * 0.82);
    ctx.stroke();
  },
  lower: (ctx, x, y, s) => {
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.24, y + s * 0.18); ctx.lineTo(x + s * 0.76, y + s * 0.18);
    ctx.moveTo(x + s * 0.24, y + s * 0.38); ctx.lineTo(x + s * 0.76, y + s * 0.38);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.22, y + s * 0.66); ctx.lineTo(x + s * 0.50, y + s * 0.84);
    ctx.lineTo(x + s * 0.78, y + s * 0.66);
    ctx.stroke();
  },
  full: (ctx, x, y, s) => {
    ctx.beginPath();
    ctx.moveTo(x + s * 0.22, y + s * 0.34); ctx.lineTo(x + s * 0.50, y + s * 0.16);
    ctx.lineTo(x + s * 0.78, y + s * 0.34);
    ctx.moveTo(x + s * 0.22, y + s * 0.66); ctx.lineTo(x + s * 0.50, y + s * 0.84);
    ctx.lineTo(x + s * 0.78, y + s * 0.66);
    ctx.moveTo(x + s * 0.26, y + s * 0.50); ctx.lineTo(x + s * 0.74, y + s * 0.50);
    ctx.stroke();
  },
  book: (ctx, x, y, s) => {
    ctx.beginPath();
    ctx.moveTo(x + s * 0.50, y + s * 0.28);
    ctx.lineTo(x + s * 0.16, y + s * 0.20); ctx.lineTo(x + s * 0.16, y + s * 0.80);
    ctx.lineTo(x + s * 0.50, y + s * 0.88); ctx.lineTo(x + s * 0.84, y + s * 0.80);
    ctx.lineTo(x + s * 0.84, y + s * 0.20); ctx.lineTo(x + s * 0.50, y + s * 0.28);
    ctx.closePath(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * 0.50, y + s * 0.28); ctx.lineTo(x + s * 0.50, y + s * 0.88);
    ctx.stroke();
  },
  nophone: (ctx, x, y, s) => {
    rr(ctx, x + s * 0.30, y + s * 0.14, s * 0.40, s * 0.72, s * 0.09); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * 0.14, y + s * 0.88); ctx.lineTo(x + s * 0.86, y + s * 0.12);
    ctx.stroke();
  },
  sleep: (ctx, x, y, s) => crescent(ctx, x, y, s)
};

/* A true crescent: big disc minus an offset disc, via the even-odd fill rule.
   Two stroked arcs never close cleanly at the horns; this does. */
function crescent(ctx, x, y, s) {
  const R = s * 0.34, cx = x + s * 0.46, cy = y + s * 0.50;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.arc(cx + R * 0.52, cy - R * 0.20, R * 0.92, 0, Math.PI * 2);
  ctx.fill('evenodd');
}

/* ---------------- page 1 renderer ---------------- */
function panelRows(ctx, x, y, w, h, title, c, rows, rowH = 54) {
  shell(ctx, x, y, w, h, title, c);
  for (let i = 0; i < rows; i++) {
    const yy = y + 74 + i * rowH;
    if (yy > y + h - 10) break;
    box(ctx, x + 20, yy - 12, 24, c, false);
    ln(ctx, x + 56, yy + 12, x + w - 20, yy + 12, fade(c.line, 0.8), 1.1);
  }
}

export function weekly1(ctx, w, h, c, page) {
  const L = WK1;
  ctx.fillStyle = fade(c.accent, 0.10);
  rr(ctx, L.head.x, L.head.y, L.head.w, L.head.h, 16); ctx.fill();
  ctx.fillStyle = c.text; ctx.textAlign = 'left';
  ctx.font = '700 20px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('WEEKLY PLANNER', L.head.x + 26, L.head.y + 36);
  ctx.font = '700 32px ui-serif, Georgia, serif';
  ctx.fillText(page?.meta?.weekLabel || page?.meta?.dateLabel || '', L.head.x + 26, L.head.y + 78);

  panelRows(ctx, L.personal.x, L.personal.y, L.personal.w, L.personal.h, 'TOP 3 — PERSONAL', c, 3);
  panelRows(ctx, L.business.x, L.business.y, L.business.w, L.business.h, 'TOP 3 — BUSINESS', c, 3);
  panelRows(ctx, L.else.x, L.else.y, L.else.w, L.else.h, 'EVERYTHING ELSE', c,
    Math.floor((L.else.h - 74) / 54));

  /* manifestation — three, two lines each, plenty of room to read them daily */
  const M = L.manifest;
  shell(ctx, M.x, M.y, M.w, M.h, 'MANIFESTATION — THIS WEEK', c, 'READ IT DAILY');
  const inner = M.h - 62, per = inner / M.count;
  for (let i = 0; i < M.count; i++) {
    const top = M.y + 62 + i * per;
    // two writing lines spread through the slot, so the block reads evenly
    const y1 = top + per * 0.38, y2 = top + per * 0.74;
    ctx.fillStyle = fade(c.accent, 0.85);
    ctx.font = '700 22px ui-serif, Georgia, serif'; ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(`${i + 1}`, M.x + 34, y1 - 18);
    ctx.textAlign = 'left';
    ctx.strokeStyle = fade(c.accent, 0.30); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(M.x + 34, y1 - 18, 18, 0, 7); ctx.stroke();
    ln(ctx, M.x + 62, y1, M.x + M.w - 22, y1, fade(c.line, 0.85), 1.1);
    ln(ctx, M.x + 62, y2, M.x + M.w - 22, y2, fade(c.line, 0.85), 1.1);
    if (i < M.count - 1) ln(ctx, M.x + 18, top + per - 6, M.x + M.w - 18, top + per - 6, fade(c.line, 0.4), 1);
  }

  shell(ctx, L.thought.x, L.thought.y, L.thought.w, L.thought.h, 'THOUGHT OF THE WEEK', c, 'REVIEW SUNDAY');
  ruled(ctx, L.thought.x, L.thought.y, L.thought.w, L.thought.h, c, 92, 48);

  shell(ctx, L.family.x, L.family.y, L.family.w, L.family.h, 'KUPER FAMILY LIST', c);
  ctx.fillStyle = fade(c.text, 0.55);
  ctx.font = '500 12px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
  ctx.fillText("What matters for the family this week", L.family.x + 20, L.family.y + 68);
  for (let i = 0; ; i++) {
    const yy = L.family.y + 100 + i * 48;
    if (yy > L.family.y + L.family.h - 16) break;
    box(ctx, L.family.x + 20, yy - 14, 22, c, false);
    ln(ctx, L.family.x + 54, yy + 8, L.family.x + L.family.w - 20, yy + 8, fade(c.line, 0.8), 1.1);
  }

  shell(ctx, L.notes.x, L.notes.y, L.notes.w, L.notes.h, 'NOTES', c);
  ruled(ctx, L.notes.x, L.notes.y, L.notes.w, L.notes.h, c, 88, 46);
}

/* ---------------- page 2 renderer ---------------- */
export function weekly2(ctx, w, h, c, page) {
  const L = WK2, checks = page?.meta?.checks || {};

  /* slim header */
  ctx.fillStyle = fade(c.accent, 0.10);
  rr(ctx, L.head.x, L.head.y, L.head.w, L.head.h, 14); ctx.fill();
  ctx.fillStyle = c.text; ctx.textAlign = 'left';
  ctx.font = '700 17px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillText('WEEK TRACKERS', L.head.x + 24, L.head.y + 36);
  ctx.font = '600 20px ui-serif, Georgia, serif';
  ctx.fillText(page?.meta?.weekLabel || '', L.head.x + 210, L.head.y + 37);
  ctx.textAlign = 'right';
  ctx.fillStyle = fade(c.text, 0.7);
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('WEIGH-IN', L.head.x + L.head.w - 150, L.head.y + 37);
  ctx.textAlign = 'left';
  ln(ctx, L.head.x + L.head.w - 140, L.head.y + 48, L.head.x + L.head.w - 24, L.head.y + 48, fade(c.text, 0.4), 1.2);

  /* ---- gym ---- */
  const G = L.gym;
  shell(ctx, G.x, G.y, G.w, G.h, 'GYM — THE WEEK', c, 'TICK THE DAY YOU DID IT');
  // day column headings
  ctx.textAlign = 'center';
  ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = fade(c.text, 0.75); ctx.textBaseline = 'middle';
  DAYS.forEach((d, i) => {
    ctx.fillText(d, L.gDayX + i * L.gDayW + L.gDayW / 2, G.y + 68);
  });
  ctx.textAlign = 'left';
  ln(ctx, G.x + 16, G.y + 82, G.x + G.w - 16, G.y + 82, fade(c.line, 0.7), 1.1);

  let y = L.gTop;
  for (const r of GYM_ROWS) {
    if (r.sect) {
      ctx.fillStyle = fade(c.accent, 0.9);
      ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'middle';
      ctx.fillText(r.sect, G.x + 20, y + L.gSectH / 2);
      if (r.note) {
        ctx.fillStyle = fade(c.text, 0.5);
        ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
        for (const [t, dx] of r.note) ctx.fillText(t, L.gWriteX + dx, y + L.gSectH / 2);
      }
      ln(ctx, G.x + 20 + ctx.measureText(r.sect).width + 60, y + L.gSectH / 2,
         L.gDayX - 16, y + L.gSectH / 2, fade(c.accent, 0.28), 1.2);
      y += L.gSectH;
      continue;
    }
    // icon + label
    if (ICONS[r.icon]) gi(ctx, G.x + 22, y + 8, 30, fade(c.text, 0.8), ICONS[r.icon]);
    ctx.fillStyle = fade(c.text, 0.95);
    ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(r.label, G.x + 64, y + L.gRowH / 2);
    // day boxes
    for (let i = 0; i < L.gDayN; i++) {
      const bx = L.gDayX + i * L.gDayW + (L.gDayW - 28) / 2;
      box(ctx, bx, y + (L.gRowH - 28) / 2, 28, c, !!checks[`g_${r.key}_${i}`]);
    }
    // write-in area
    const wy = y + L.gRowH / 2 + 12;
    if (r.write === 'min') {
      ln(ctx, L.gWriteX, wy, L.gWriteX + 250, wy, fade(c.line, 0.85), 1.1);
      ctx.fillStyle = fade(c.text, 0.45);
      ctx.font = '500 11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('min', L.gWriteX + 258, wy - 6);
    } else if (r.write === 'srw') {
      ln(ctx, L.gWriteX, wy, L.gWriteX + 70, wy, fade(c.line, 0.85), 1.1);
      ctx.fillStyle = fade(c.text, 0.45);
      ctx.font = '500 13px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('×', L.gWriteX + 78, wy - 5);
      ln(ctx, L.gWriteX + 94, wy, L.gWriteX + 164, wy, fade(c.line, 0.85), 1.1);
      ln(ctx, L.gWriteX + 208, wy, L.gWriteX + 296, wy, fade(c.line, 0.85), 1.1);
      ctx.font = '500 11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('kg/lb', L.gWriteX + 302, wy - 6);
    }
    y += L.gRowH;
  }

  /* ---- the day grid: intake + habits, one row per day ---- */
  const D = L.grid;
  shell(ctx, D.x, D.y, D.w, D.h, 'EVERY DAY', c, 'TAP TO FILL');
  const geo = gridGeometry();
  // column headings
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = fade(c.text, 0.6);
  ctx.fillText('WATER  8', geo.colX.w, D.y + 62);
  ctx.fillText('COFFEE  max 4', geo.colX.c, D.y + 62);
  ctx.fillText('DRINKS  max 3', geo.colX.a, D.y + 62);
  ctx.textAlign = 'center';
  HABITS.forEach((hb, i) => {
    const cx2 = geo.habitX + i * geo.habitW + geo.habitW / 2;
    gi(ctx, cx2 - 12, D.y + 40, 24, fade(c.text, 0.7), ICONS[hb.icon]);
    ctx.fillStyle = fade(c.text, 0.6);
    ctx.font = '700 9px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(hb.short, cx2, D.y + 71);
  });
  ctx.textAlign = 'left';
  ln(ctx, D.x + 16, D.y + 78, D.x + D.w - 16, D.y + 78, fade(c.line, 0.7), 1.1);

  DAYS.forEach((d, di) => {
    const ry = geo.rowY(di);
    if (di % 2 === 1) { ctx.fillStyle = fade(c.line, 0.10); rr(ctx, D.x + 12, ry, D.w - 24, geo.rowH - 4, 7); ctx.fill(); }
    ctx.fillStyle = fade(c.text, 0.85);
    ctx.font = '700 13px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(d, D.x + 22, ry + geo.rowH / 2);
    for (const grp of INTAKE) {
      for (let i = 0; i < grp.n; i++) {
        const p = geo.pip(grp.key, di, i);
        PIPS[grp.icon](ctx, p.x, p.y, p.s, c, !!checks[p.key]);
      }
    }
    HABITS.forEach((hb, hi) => {
      const b = geo.habit(hb.key, di);
      box(ctx, b.x, b.y, b.s, c, !!checks[b.key]);
    });
  });

  /* ---- week review strip ---- */
  const R = L.review;
  shell(ctx, R.x, R.y, R.w, R.h, 'HOW THE WEEK WENT', c, 'SUNDAY');
  ruled(ctx, R.x, R.y, R.w, R.h, c, 82, 42);
}

/* geometry for the every-day grid, shared by renderer and hit targets */
function gridGeometry() {
  const D = WK2.grid;
  const rowH = 54, top = D.y + 88;
  const dayLabelW = 76;
  const pipS = 34, pipGap = 6;
  const wx = D.x + dayLabelW;
  const wW = 8 * (pipS + pipGap);
  const cx = wx + wW + 26;
  const cW = 4 * (pipS + pipGap);
  const ax = cx + cW + 26;
  const aW = 3 * (pipS + pipGap);
  const habitX = ax + aW + 26;
  const habitW = (D.x + D.w - 18 - habitX) / HABITS.length;
  const colStart = { w: wx, c: cx, a: ax };
  return {
    rowH, pipS, habitX, habitW,
    colX: colStart,
    rowY: di => top + di * rowH,
    pip(groupKey, di, i) {
      const s = pipS;
      return {
        key: `d_${groupKey}_${di}_${i}`,
        x: colStart[groupKey] + i * (pipS + pipGap),
        y: top + di * rowH + (rowH - 4 - s) / 2,
        s
      };
    },
    habit(hkey, di) {
      const idx = HABITS.findIndex(x => x.key === hkey), s = 28;
      return {
        key: `d_${hkey}_${di}`,
        x: habitX + idx * habitW + (habitW - s) / 2,
        y: top + di * rowH + (rowH - 4 - s) / 2,
        s
      };
    }
  };
}

/** Tap targets for a weekly page. Page 1 has checkboxes; page 2 has the trackers. */
export function weeklyTargets(page) {
  const which = page?.meta?.weekPage || 1;
  const boxes = [], pips = [];
  if (which === 1) {
    const L = WK1;
    const col = (p, prefix, n) => {
      for (let i = 0; i < n; i++) boxes.push({ key: prefix + i, x: p.x + 20, y: p.y + 74 + i * 54 - 12, s: 24 });
    };
    col(L.personal, 'p', 3);
    col(L.business, 'b', 3);
    col(L.else, 'e', Math.floor((L.else.h - 74) / 54));
    for (let i = 0; ; i++) {
      const yy = L.family.y + 100 + i * 48;
      if (yy > L.family.y + L.family.h - 16) break;
      boxes.push({ key: 'k' + i, x: L.family.x + 20, y: yy - 14, s: 22 });
    }
    return { boxes, pips };
  }
  const L = WK2;
  let y = L.gTop;
  for (const r of GYM_ROWS) {
    if (r.sect) { y += L.gSectH; continue; }
    for (let i = 0; i < L.gDayN; i++) {
      boxes.push({
        key: `g_${r.key}_${i}`,
        x: L.gDayX + i * L.gDayW + (L.gDayW - 28) / 2,
        y: y + (L.gRowH - 28) / 2, s: 28
      });
    }
    y += L.gRowH;
  }
  const geo = gridGeometry();
  DAYS.forEach((_, di) => {
    for (const grp of INTAKE) {
      for (let i = 0; i < grp.n; i++) pips.push({ ...geo.pip(grp.key, di, i), shape: grp.icon });
    }
    HABITS.forEach(hb => boxes.push(geo.habit(hb.key, di)));
  });
  return { boxes, pips };
}

/* ---------------- monthly calendar ---------------- */
export const MONTHCAL = (() => {
  const m = 54, W = 1240, H = 1754;
  const sideW = 300, gap = 20;
  const gridW = W - m * 2 - sideW - gap;
  return {
    m, W, H, sideW, gap, gridW,
    head: { x: m, y: 46, w: W - m * 2, h: 92 },
    grid: { x: m, y: 158, w: gridW, h: 1540 },
    side: { x: m + gridW + gap, y: 158, w: sideW, h: 1540 }
  };
})();

export function monthPaper(ctx, w, h, c, page) {
  const L = MONTHCAL;
  ctx.fillStyle = fade(c.accent, 0.10);
  rr(ctx, L.head.x, L.head.y, L.head.w, L.head.h, 16); ctx.fill();
  ctx.fillStyle = c.text; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = '700 18px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('MONTH', L.head.x + 24, L.head.y + 34);
  ctx.font = '700 34px ui-serif, Georgia, serif';
  ctx.fillText(page?.meta?.monthLabel || page?.meta?.dateLabel || '', L.head.x + 24, L.head.y + 74);

  const G = L.grid;
  const cols = 7, colW = G.w / cols;
  const hdrH = 40;
  ctx.fillStyle = fade(c.accent, 0.07);
  rr(ctx, G.x, G.y, G.w, hdrH, 10); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = fade(c.text, 0.8);
  DAYS.forEach((d, i) => ctx.fillText(d, G.x + i * colW + colW / 2, G.y + hdrH / 2));
  ctx.textAlign = 'left';

  const rows = 6, bodyY = G.y + hdrH, rowH = (G.h - hdrH) / rows;
  /* weekend columns tinted so the shape of the week reads instantly */
  ctx.fillStyle = fade(c.line, 0.13);
  ctx.fillRect(G.x + 5 * colW, bodyY, colW * 2, rowH * rows);
  ctx.strokeStyle = fade(c.line, 0.95); ctx.lineWidth = 1.2;
  for (let r = 0; r <= rows; r++) ln(ctx, G.x, bodyY + r * rowH, G.x + G.w, bodyY + r * rowH, fade(c.line, 0.95), 1.2);
  for (let i = 0; i <= cols; i++) ln(ctx, G.x + i * colW, G.y, G.x + i * colW, bodyY + rows * rowH, fade(c.line, 0.95), 1.2);

  /* faint date-number corner on every cell so you can write the numbers in */
  const first = page?.meta?.monthFirstDow;       // 0 = Monday
  const days = page?.meta?.monthDays;
  if (Number.isFinite(first) && Number.isFinite(days)) {
    ctx.fillStyle = fade(c.text, 0.55);
    ctx.font = '600 15px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'top';
    for (let d = 1; d <= days; d++) {
      const idx = first + d - 1, r = Math.floor(idx / 7), col = idx % 7;
      if (r >= rows) break;
      ctx.fillText(String(d), G.x + col * colW + 10, bodyY + r * rowH + 8);
    }
  }
  /* writing rules inside each cell */
  for (let r = 0; r < rows; r++) {
    for (let k = 1; k <= 3; k++) {
      const yy = bodyY + r * rowH + 32 + k * 34;
      if (yy > bodyY + (r + 1) * rowH - 8) break;
      ln(ctx, G.x + 8, yy, G.x + G.w - 8, yy, fade(c.line, 0.35), 1);
    }
  }

  const S = L.side;
  const blocks = [
    ['MONTH PRIORITIES', 5],
    ['KEY DATES', 6],
    ['KUPER FAMILY', 5],
    ['NOTES', 0]
  ];
  let sy = S.y;
  const each = S.h / blocks.length - 14;
  for (const [title, n] of blocks) {
    shell(ctx, S.x, sy, S.w, each, title, c);
    if (n) {
      for (let i = 0; i < n; i++) {
        const yy = sy + 74 + i * 46;
        if (yy > sy + each - 12) break;
        box(ctx, S.x + 16, yy - 12, 20, c, false);
        ln(ctx, S.x + 46, yy + 8, S.x + S.w - 16, yy + 8, fade(c.line, 0.8), 1.1);
      }
    } else {
      ruled(ctx, S.x, sy, S.w, each, c, 80, 42);
    }
    sy += each + 14;
  }
}

export function monthTargets(page) {
  const L = MONTHCAL, S = L.side, boxes = [];
  const blocks = [['m', 5], ['d', 6], ['f', 5]];
  const each = S.h / 4 - 14;
  let sy = S.y;
  for (const [pre, n] of blocks) {
    for (let i = 0; i < n; i++) {
      const yy = sy + 74 + i * 46;
      if (yy > sy + each - 12) break;
      boxes.push({ key: pre + i, x: S.x + 16, y: yy - 12, s: 20 });
    }
    sy += each + 14;
  }
  return { boxes, pips: [] };
}

/* ---------------- SMART goals ---------------- */
export const SMART = ['Specific', 'Measurable', 'Achievable', 'Relevant', 'Time-bound'];
export const GOAL_AREAS = [
  { key: 'p', title: 'PERSONAL' },
  { key: 'b', title: 'BUSINESS' },
  { key: 'f', title: 'FAMILY' }
];

export const GOALS = (() => {
  const m = 56, W = 1240, H = 1754;
  const head = { x: m, y: 46, w: W - m * 2, h: 104 };
  const top = 170, gap = 16;
  const blockH = (H - top - 54 - gap * 2) / 3;
  return { m, W, H, head, top, gap, blockH, blockW: W - m * 2 };
})();

export function goalsPaper(ctx, w, h, c, page) {
  const L = GOALS, checks = page?.meta?.checks || {};
  ctx.fillStyle = fade(c.accent, 0.10);
  rr(ctx, L.head.x, L.head.y, L.head.w, L.head.h, 16); ctx.fill();
  ctx.fillStyle = c.text; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = '700 18px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('SMART GOALS', L.head.x + 24, L.head.y + 34);
  ctx.font = '700 30px ui-serif, Georgia, serif';
  ctx.fillText(page?.meta?.goalLabel || '', L.head.x + 24, L.head.y + 72);

  /* period selector — tap one */
  const periods = ['MONTHLY', 'QUARTERLY', 'YEARLY'];
  ctx.textBaseline = 'middle';
  periods.forEach((p, i) => {
    const bx = L.head.x + L.head.w - 20 - (periods.length - i) * 158;
    const on = !!checks['per_' + i];
    ctx.strokeStyle = on ? fade(c.accent, 0.95) : fade(c.line, 0.95);
    ctx.lineWidth = on ? 2 : 1.3;
    rr(ctx, bx, L.head.y + 30, 142, 44, 22);
    if (on) { ctx.fillStyle = fade(c.accent, 0.16); ctx.fill(); }
    ctx.stroke();
    ctx.fillStyle = on ? c.text : fade(c.text, 0.7);
    ctx.font = '700 13px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p, bx + 71, L.head.y + 53);
    ctx.textAlign = 'left';
  });

  GOAL_AREAS.forEach((area, ai) => {
    const y = L.top + ai * (L.blockH + L.gap);
    goalBlock(ctx, L.m, y, L.blockW, L.blockH, area, c, checks);
  });
}

function goalBlock(ctx, x, y, w, h, area, c, checks) {
  shell(ctx, x, y, w, h, area.title + ' GOAL', c);
  /* the goal statement */
  ctx.fillStyle = fade(c.text, 0.5);
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('THE GOAL', x + 20, y + 66);
  ln(ctx, x + 20, y + 90, x + w - 20, y + 90, fade(c.accent, 0.55), 1.5);

  /* SMART lines — left two thirds, spread to fill the block */
  const leftW = w * 0.62;
  const sTop = y + 106, sStep = (h - 106 - 22) / SMART.length;
  SMART.forEach((s, i) => {
    const yy = sTop + i * sStep + sStep / 2;
    ctx.fillStyle = fade(c.accent, 0.9);
    ctx.font = '700 17px ui-serif, Georgia, serif'; ctx.textBaseline = 'middle';
    ctx.fillText(s[0], x + 24, yy);
    ctx.fillStyle = fade(c.text, 0.62);
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(s.slice(1).toUpperCase(), x + 38, yy + 1);
    const lx = x + 132;
    ln(ctx, lx, yy + 13, x + leftW - 16, yy + 13, fade(c.line, 0.85), 1.1);
  });

  /* milestones + progress — right third */
  const rx2 = x + leftW, rw = w - leftW - 20;
  ctx.fillStyle = fade(c.text, 0.5);
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('MILESTONES', rx2, y + 66);
  const mTop = y + 92;
  for (let i = 0; i < 4; i++) {
    const yy = mTop + i * 42;
    box(ctx, rx2, yy, 22, c, !!checks[`gm_${area.key}_${i}`]);
    ln(ctx, rx2 + 32, yy + 18, rx2 + rw, yy + 18, fade(c.line, 0.8), 1.1);
  }
  /* progress meter — ten segments you tap */
  ctx.fillStyle = fade(c.text, 0.5);
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('PROGRESS', rx2, mTop + 4 * 42 + 26);
  const pg = progressGeo(x, y, w, h);
  for (let i = 0; i < 10; i++) {
    const on = !!checks[`gp_${area.key}_${i}`];
    ctx.strokeStyle = fade(c.line, 0.95); ctx.lineWidth = 1.2;
    rr(ctx, pg.x + i * (pg.s + 4), pg.y, pg.s, pg.h, 4);
    if (on) { ctx.fillStyle = fade(c.accent, 0.55); ctx.fill(); }
    ctx.stroke();
  }
  ctx.fillStyle = fade(c.text, 0.45);
  ctx.font = '500 11px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('WHY THIS MATTERS', rx2, pg.y + pg.h + 30);
  for (let i = 0; i < 4; i++) {
    const yy = pg.y + pg.h + 54 + i * 40;
    if (yy > y + h - 18) break;
    ln(ctx, rx2, yy, rx2 + rw, yy, fade(c.line, 0.8), 1.1);
  }
}

function progressGeo(x, y, w, h) {
  const leftW = w * 0.62, rx2 = x + leftW, rw = w - leftW - 20;
  const mTop = y + 92;
  const s = Math.floor((rw - 9 * 4) / 10);
  return { x: rx2, y: mTop + 4 * 42 + 38, s, h: 22 };
}

export function goalsTargets(page) {
  const L = GOALS, boxes = [];
  for (let i = 0; i < 3; i++) {
    boxes.push({ key: 'per_' + i, x: L.head.x + L.head.w - 20 - (3 - i) * 158, y: L.head.y + 30, s: 44, w: 142 });
  }
  GOAL_AREAS.forEach((area, ai) => {
    const y = L.top + ai * (L.blockH + L.gap);
    const x = L.m, w = L.blockW, h = L.blockH;
    const leftW = w * 0.62, rx2 = x + leftW;
    const mTop = y + 92;
    for (let i = 0; i < 4; i++) boxes.push({ key: `gm_${area.key}_${i}`, x: rx2, y: mTop + i * 42, s: 22 });
    const pg = progressGeo(x, y, w, h);
    for (let i = 0; i < 10; i++) {
      boxes.push({ key: `gp_${area.key}_${i}`, x: pg.x + i * (pg.s + 4), y: pg.y, s: pg.h, w: pg.s, plain: true });
    }
  });
  return { boxes, pips: [] };
}

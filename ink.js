/* ink.js — stroke smoothing, variable width, shape recognition
   No dependencies. Points are stored flat: [x,y,pressure, x,y,pressure, ...] */

export const TOOLS = {
  pen:        { label: 'Pen',         sizes: [1.2, 2, 3, 4.5, 7],    opacity: 1,    pressure: 0.55, velocity: 0.35, taper: true },
  ballpoint:  { label: 'Ballpoint',   sizes: [0.8, 1.4, 2, 3, 4.5],  opacity: 0.94, pressure: 0.22, velocity: 0.12, taper: false },
  gel:        { label: 'Gel pen',     sizes: [1.2, 2, 3, 4.5, 6.5],  opacity: 1,    pressure: 0.4,  velocity: 0.18, taper: true },
  fountain:   { label: 'Fountain',    sizes: [1.5, 2.5, 4, 6, 9],    opacity: 1,    pressure: 0.85, velocity: 0.55, taper: true },
  quill:      { label: 'Quill',       sizes: [2, 3.5, 5, 7, 10],     opacity: 1,    pressure: 0.45, velocity: 0.15, taper: true, nib: -0.7, nibMin: 0.16 },
  brush:      { label: 'Brush',       sizes: [2, 4, 7, 11, 16],      opacity: 1,    pressure: 1,    velocity: 0.45, taper: true },
  felt:       { label: 'Felt-tip',    sizes: [1.5, 2.5, 4, 6, 9],    opacity: 0.96, pressure: 0.12, velocity: 0,    taper: false },
  pencil:     { label: 'Pencil',      sizes: [1.5, 2.5, 4, 6, 9],    opacity: 0.88, pressure: 0.7,  velocity: 0.1,  taper: false, grain: 0.5,  jitter: 0.4 },
  crayon:     { label: 'Crayon',      sizes: [4, 7, 11, 16, 24],     opacity: 0.7,  pressure: 0.55, velocity: 0.1,  taper: false, grain: 0.9,  jitter: 1.7 },
  pastel:     { label: 'Pastel',      sizes: [6, 10, 16, 24, 34],    opacity: 0.46, pressure: 0.45, velocity: 0.05, taper: false, grain: 1.25, jitter: 3.1 },
  marker:     { label: 'Marker',      sizes: [3, 5, 8, 12, 18],      opacity: 1,    pressure: 0.15, velocity: 0,    taper: false, constant: true },
  highlighter:{ label: 'Highlighter', sizes: [10, 16, 24, 34, 48],   opacity: 0.32, pressure: 0,    velocity: 0,    taper: false, blend: 'multiply', flat: true, constant: true }
};

export const ERASER_SIZES = [10, 18, 30, 48, 76];
export const ERASE_MODES = [
  { id: 'precise', label: 'Precision',      hint: 'Rubs out only the part you touch' },
  { id: 'stroke',  label: 'Whole stroke',   hint: 'Removes the entire line you touch' },
  { id: 'object',  label: 'Stroke + photo', hint: 'Also removes photos you touch' }
];

/** Pen-type tools, in the order the pen picker shows them. */
export const PEN_IDS = ['pen', 'ballpoint', 'gel', 'fountain', 'quill', 'brush', 'felt', 'pencil', 'crayon', 'pastel', 'marker'];

/* ---------- capture ---------- */

export class StrokeCapture {
  constructor(tool, color, size) {
    this.tool = tool; this.color = color; this.size = size;
    this.raw = [];            // {x,y,p,t}
    this.pts = [];            // smoothed flat array
    this._lastEmit = null;
  }
  add(x, y, pressure, t) {
    const prev = this.raw[this.raw.length - 1];
    if (prev) {
      const d = Math.hypot(x - prev.x, y - prev.y);
      if (d < 0.55 && this.raw.length > 1) return false;   // drop jitter
    }
    // pressure: pens report 0..1; mice/fingers report 0 or 0.5 — synthesise from speed later
    let p = (pressure > 0 && pressure !== 0.5) ? pressure : -1;
    this.raw.push({ x, y, p, t });
    return true;
  }
  /* exponential smoothing on the tail, keeps the line calm without lagging the nib */
  smoothed() {
    const r = this.raw;
    if (r.length === 0) return [];
    if (r.length < 3) return flatten(r);
    const out = [];
    const a = 0.42;
    let sx = r[0].x, sy = r[0].y;
    out.push({ x: sx, y: sy, p: r[0].p, t: r[0].t });
    for (let i = 1; i < r.length; i++) {
      sx += (r[i].x - sx) * a;
      sy += (r[i].y - sy) * a;
      out.push({ x: sx, y: sy, p: r[i].p, t: r[i].t });
    }
    // pull the final point back to the true nib position so the stroke ends where the pen lifted
    out[out.length - 1] = { ...r[r.length - 1] };
    return flatten(out);
  }
}

function flatten(arr) {
  const f = new Array(arr.length * 3);
  for (let i = 0; i < arr.length; i++) { f[i*3] = round2(arr[i].x); f[i*3+1] = round2(arr[i].y); f[i*3+2] = arr[i].p < 0 ? -1 : Math.round(arr[i].p * 100) / 100; }
  return f;
}
const round2 = n => Math.round(n * 100) / 100;

/* ---------- width profile ---------- */

function widths(pts, spec, base) {
  const n = pts.length / 3;
  const w = new Float32Array(n);
  const pk = spec.pressure, vk = spec.velocity;
  for (let i = 0; i < n; i++) {
    const p = pts[i*3+2];
    let f = 1;
    if (spec.nib != null) {
      // Broad-edge nib: the line is fat across the nib and hairline along it.
      const j = Math.min(n - 1, i + 1), k = Math.max(0, i - 1);
      const dir = Math.atan2(pts[j*3+1] - pts[k*3+1], pts[j*3] - pts[k*3]);
      f *= Math.max(spec.nibMin || 0.15, Math.abs(Math.sin(dir - spec.nib)));
    }
    if (pk > 0) {
      const pv = p < 0 ? 0.5 : p;
      f *= (1 - pk) + pk * (0.35 + 1.3 * pv);
    }
    if (vk > 0) {
      const j = Math.min(n - 1, i + 1), k = Math.max(0, i - 1);
      const d = Math.hypot(pts[j*3] - pts[k*3], pts[j*3+1] - pts[k*3+1]);
      const speed = Math.min(1, d / 14);
      f *= (1 - vk) + vk * (1 - 0.65 * speed);
    }
    w[i] = Math.max(0.28, base * f);
  }
  if (spec.taper && n > 4) {
    const tp = Math.min(6, Math.floor(n * 0.18));
    for (let i = 0; i < tp; i++) {
      const e = 0.32 + 0.68 * (i / tp);
      w[i] *= e; w[n - 1 - i] *= e;
    }
  }
  // soften the width curve so it doesn't wobble
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let a = 0, c = 0;
    for (let k = -2; k <= 2; k++) { const j = i + k; if (j >= 0 && j < n) { a += w[j]; c++; } }
    s[i] = a / c;
  }
  return s;
}

/* ---------- rendering ---------- */

export function drawStroke(ctx, stroke, opts = {}) {
  const spec = TOOLS[stroke.tool] || TOOLS.pen;
  const pts = stroke.pts;
  const n = pts.length / 3;
  if (n === 0) return;

  ctx.save();
  if (spec.blend) ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = (stroke.opacity != null ? stroke.opacity : spec.opacity) * (opts.alpha != null ? opts.alpha : 1);
  ctx.fillStyle = ctx.strokeStyle = stroke.color;
  ctx.lineCap = spec.flat ? 'butt' : 'round';
  ctx.lineJoin = 'round';

  if (n === 1) {
    const r = stroke.size / 2;
    ctx.beginPath(); ctx.arc(pts[0], pts[1], Math.max(r, 0.4), 0, 6.284); ctx.fill();
    ctx.restore(); return;
  }

  // Highlighter & marker: constant-width path, one pass so overlaps don't darken
  if (spec.constant) {
    ctx.lineWidth = stroke.size;
    ctx.beginPath();
    path(ctx, pts, n);
    ctx.stroke();
    ctx.restore(); return;
  }

  const w = widths(pts, spec, stroke.size);

  if (spec.grain) {
    // Pencil / crayon / pastel: offset passes read as tooth on the paper.
    const g = spec.grain, jit = (spec.jitter || 0.4) * stroke.size * 0.22;
    const passes = g > 1 ? 5 : g > 0.7 ? 4 : 3;
    ctx.globalAlpha *= g > 0.7 ? 0.34 : 0.5;
    for (let pass = 0; pass < passes; pass++) {
      const t = passes === 1 ? 0 : (pass / (passes - 1)) * 2 - 1;   // -1 .. 1
      ribbon(ctx, pts, w, n, t * jit, 0.9 - Math.abs(t) * 0.22);
    }
    ctx.restore(); return;
  }

  ribbon(ctx, pts, w, n, 0, 1);
  ctx.restore();
}

/* variable-width ribbon: two offset edges joined into one filled shape */
function ribbon(ctx, pts, w, n, off, scale) {
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const x = pts[i*3], y = pts[i*3+1];
    const pi = Math.max(0, i - 1), ni = Math.min(n - 1, i + 1);
    let dx = pts[ni*3] - pts[pi*3], dy = pts[ni*3+1] - pts[pi*3+1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const r = (w[i] * scale) / 2;
    L.push([x - dy * r + dx * off, y + dx * r + dy * off]);
    R.push([x + dy * r + dx * off, y - dx * r + dy * off]);
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  quadThrough(ctx, L);
  // round cap at the far end
  ctx.lineTo(R[n-1][0], R[n-1][1]);
  quadThrough(ctx, R.slice().reverse());
  ctx.closePath();
  ctx.fill();
  // round the two ends off
  ctx.beginPath(); ctx.arc(pts[0], pts[1], Math.max(w[0]*scale/2, 0.3), 0, 6.284); ctx.fill();
  ctx.beginPath(); ctx.arc(pts[(n-1)*3], pts[(n-1)*3+1], Math.max(w[n-1]*scale/2, 0.3), 0, 6.284); ctx.fill();
}

function quadThrough(ctx, p) {
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i][0] + p[i+1][0]) / 2, my = (p[i][1] + p[i+1][1]) / 2;
    ctx.quadraticCurveTo(p[i][0], p[i][1], mx, my);
  }
  const last = p[p.length - 1];
  ctx.lineTo(last[0], last[1]);
}

function path(ctx, pts, n) {
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 1; i < n - 1; i++) {
    const mx = (pts[i*3] + pts[(i+1)*3]) / 2, my = (pts[i*3+1] + pts[(i+1)*3+1]) / 2;
    ctx.quadraticCurveTo(pts[i*3], pts[i*3+1], mx, my);
  }
  ctx.lineTo(pts[(n-1)*3], pts[(n-1)*3+1]);
}

/* ---------- geometry helpers ---------- */

export function strokeBounds(s) {
  const p = s.pts, n = p.length / 3;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = p[i*3], y = p[i*3+1];
    if (x < x0) x0 = x; if (y < y0) y0 = y;
    if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  const pad = (s.size || 2) / 2 + 1;
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

/** Squared distance from (x,y) to the segment (ax,ay)-(bx,by). */
export function segDistSq(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len ? ((x - ax) * dx + (y - ay) * dy) / len : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + dx * t - x, py = ay + dy * t - y;
  return px * px + py * py;
}

export function strokeHits(s, x, y, r) {
  const p = s.pts, n = p.length / 3;
  const rr = (r + (s.size || 2) / 2) ** 2;
  if (n === 1) return (p[0] - x) ** 2 + (p[1] - y) ** 2 < rr;
  for (let i = 0; i < n - 1; i++) {
    if (segDistSq(x, y, p[i*3], p[i*3+1], p[(i+1)*3], p[(i+1)*3+1]) < rr) return true;
  }
  return false;
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i+1], xj = poly[j], yj = poly[j+1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function strokeMostlyInPoly(s, poly) {
  const p = s.pts, n = p.length / 3;
  let hit = 0;
  for (let i = 0; i < n; i++) if (pointInPoly(p[i*3], p[i*3+1], poly)) hit++;
  return hit / n > 0.7;
}

export function transformStroke(s, dx, dy, sx = 1, sy = 1, ox = 0, oy = 0) {
  const p = s.pts;
  for (let i = 0; i < p.length; i += 3) {
    p[i]   = ox + (p[i]   - ox) * sx + dx;
    p[i+1] = oy + (p[i+1] - oy) * sy + dy;
  }
  if (sx !== 1 || sy !== 1) s.size = s.size * (Math.abs(sx) + Math.abs(sy)) / 2;
  return s;
}

/* ---------- shape recognition (hold at end of stroke to straighten) ---------- */

export function recognizeShape(pts) {
  const n = pts.length / 3;
  if (n < 6) return null;
  const P = [];
  for (let i = 0; i < n; i++) P.push([pts[i*3], pts[i*3+1]]);

  const b = bbox(P);
  const w = b[2] - b[0], h = b[3] - b[1];
  const diag = Math.hypot(w, h);
  if (diag < 26) return null;

  const pathLen = polyLen(P);
  const gap = Math.hypot(P[n-1][0] - P[0][0], P[n-1][1] - P[0][1]);
  const closed = gap < diag * 0.28;

  /* line / arrow */
  if (!closed) {
    const dev = maxDeviation(P, P[0], P[n-1]);
    if (dev < diag * 0.055 && pathLen < gap * 1.22) {
      return { kind: 'line', a: P[0], b: P[n-1] };
    }
    // arrow: straight shaft then a sharp reversal near the end
    const arrow = detectArrow(P, diag);
    if (arrow) return arrow;
    return null;
  }

  /* closed shapes */
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  const rx = w / 2, ry = h / 2;
  let ellErr = 0;
  for (const [x, y] of P) {
    const v = ((x - cx) / (rx || 1)) ** 2 + ((y - cy) / (ry || 1)) ** 2;
    ellErr += Math.abs(Math.sqrt(v) - 1);
  }
  ellErr /= n;

  const corners = findCorners(P, diag);
  const rectFill = (pathLen / (2 * (w + h)));
  const rectish = corners.length === 4 && Math.abs(rectFill - 1) < 0.28;

  if (ellErr < 0.12 && !rectish) return { kind: 'ellipse', cx, cy, rx, ry };
  if (rectish) return { kind: 'rect', x: b[0], y: b[1], w, h };
  if (corners.length === 3) return { kind: 'poly', pts: corners.concat([corners[0]]) };
  if (ellErr < 0.2) return { kind: 'ellipse', cx, cy, rx, ry };
  if (corners.length >= 3 && corners.length <= 6) return { kind: 'poly', pts: corners.concat([corners[0]]) };
  return null;
}

function detectArrow(P, diag) {
  const n = P.length;
  // find the point of sharpest turn in the last 45%
  let bestI = -1, bestAng = Math.PI;
  for (let i = Math.floor(n * 0.55); i < n - 3; i++) {
    const a = ang(P[i], P[Math.max(0, i - 3)]), b2 = ang(P[i], P[Math.min(n-1, i + 3)]);
    let d = Math.abs(norm(b2 - a));
    if (d < bestAng) { bestAng = d; bestI = i; }
  }
  if (bestI < 0 || bestAng > 1.5) return null;
  const shaft = P.slice(0, bestI + 1);
  if (shaft.length < 4) return null;
  const dev = maxDeviation(shaft, shaft[0], shaft[shaft.length - 1]);
  if (dev > diag * 0.09) return null;
  const tip = shaft[shaft.length - 1];
  const headLen = Math.hypot(P[n-1][0] - tip[0], P[n-1][1] - tip[1]);
  if (headLen < diag * 0.08) return null;
  return { kind: 'arrow', a: shaft[0], b: tip, head: Math.min(headLen, diag * 0.35) };
}

function findCorners(P, diag) {
  const n = P.length, k = Math.max(2, Math.round(n * 0.06));
  const score = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i - k + n) % n], b = P[i], c = P[(i + k) % n];
    score.push(Math.abs(norm(ang(b, c) - ang(b, a))));
  }
  const cand = [];
  for (let i = 0; i < n; i++) {
    if (score[i] > 2.5) continue;           // not sharp enough
    let peak = true;
    for (let j = -k; j <= k; j++) { const m = (i + j + n) % n; if (score[m] < score[i]) { peak = false; break; } }
    if (peak) cand.push(i);
  }
  const out = [];
  for (const i of cand) {
    if (out.length && Math.hypot(P[i][0] - out[out.length-1][0], P[i][1] - out[out.length-1][1]) < diag * 0.18) continue;
    out.push(P[i]);
  }
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length-1][0], out[0][1] - out[out.length-1][1]) < diag * 0.18) out.pop();
  return out;
}

export function shapeToPoints(sh) {
  const out = [];
  const push = (x, y) => { out.push(round2(x), round2(y), 0.62); };
  if (sh.kind === 'line') { push(sh.a[0], sh.a[1]); push(sh.b[0], sh.b[1]); }
  else if (sh.kind === 'ellipse') {
    for (let i = 0; i <= 72; i++) { const t = i / 72 * 6.28318; push(sh.cx + Math.cos(t) * sh.rx, sh.cy + Math.sin(t) * sh.ry); }
  } else if (sh.kind === 'rect') {
    const { x, y, w, h } = sh;
    const c = [[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
    for (let i = 0; i < c.length - 1; i++) for (let s = 0; s <= 10; s++) push(c[i][0] + (c[i+1][0]-c[i][0])*s/10, c[i][1] + (c[i+1][1]-c[i][1])*s/10);
  } else if (sh.kind === 'poly') {
    for (let i = 0; i < sh.pts.length - 1; i++) for (let s = 0; s <= 10; s++) push(sh.pts[i][0] + (sh.pts[i+1][0]-sh.pts[i][0])*s/10, sh.pts[i][1] + (sh.pts[i+1][1]-sh.pts[i][1])*s/10);
  } else if (sh.kind === 'arrow') {
    const [ax, ay] = sh.a, [bx, by] = sh.b;
    for (let s = 0; s <= 20; s++) push(ax + (bx-ax)*s/20, ay + (by-ay)*s/20);
    const th = Math.atan2(by - ay, bx - ax), hl = sh.head, sp = 0.42;
    for (let s = 0; s <= 8; s++) push(bx - Math.cos(th - sp) * hl * s/8, by - Math.sin(th - sp) * hl * s/8);
    for (let s = 8; s >= 0; s--) push(bx - Math.cos(th - sp) * hl * s/8, by - Math.sin(th - sp) * hl * s/8);
    for (let s = 0; s <= 8; s++) push(bx - Math.cos(th + sp) * hl * s/8, by - Math.sin(th + sp) * hl * s/8);
  }
  return out;
}

const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const norm = a => { while (a > Math.PI) a -= 6.28318; while (a < -Math.PI) a += 6.28318; return a; };
function bbox(P) { let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity; for (const [x,y] of P){ if(x<a)a=x; if(y<b)b=y; if(x>c)c=x; if(y>d)d=y; } return [a,b,c,d]; }
function polyLen(P) { let l = 0; for (let i = 1; i < P.length; i++) l += Math.hypot(P[i][0]-P[i-1][0], P[i][1]-P[i-1][1]); return l; }
function maxDeviation(P, a, b) {
  const dx = b[0]-a[0], dy = b[1]-a[1], L = Math.hypot(dx,dy) || 1;
  let m = 0;
  for (const [x,y] of P) m = Math.max(m, Math.abs((x-a[0])*dy - (y-a[1])*dx) / L);
  return m;
}


/* ---------- precision erasing ---------- */

/**
 * Cut a disc out of a stroke. Returns null when nothing was touched, otherwise the
 * surviving pieces (possibly none, if the whole stroke fell inside the disc).
 */
export function eraseFromStroke(stroke, x, y, r, newId) {
  const p = stroke.pts, n = p.length / 3;
  const rr = (r + (stroke.size || 2) * 0.4) ** 2;
  const keep = new Array(n).fill(true);
  let hit = false;

  // Points inside the disc go, and so do both ends of any segment that passes
  // through it — otherwise a small eraser slips between two widely spaced points.
  for (let i = 0; i < n; i++) {
    if ((p[i*3] - x) ** 2 + (p[i*3+1] - y) ** 2 < rr) { keep[i] = false; hit = true; }
  }
  for (let i = 0; i < n - 1; i++) {
    if (segDistSq(x, y, p[i*3], p[i*3+1], p[(i+1)*3], p[(i+1)*3+1]) < rr) {
      keep[i] = false; keep[i+1] = false; hit = true;
    }
  }
  if (!hit) return null;

  const pieces = [];
  let run = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) run.push(p[i*3], p[i*3+1], p[i*3+2]);
    else { if (run.length >= 6) pieces.push(run); run = []; }
  }
  if (run.length >= 6) pieces.push(run);

  return pieces.map(pts => ({ ...stroke, id: newId(), pts }));
}

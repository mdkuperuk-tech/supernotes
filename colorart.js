/* colorart.js — the drawing vocabulary for the coloring books.

   Everything is built from smooth closed curves rather than polygons, because
   line art made of straight edges reads as a diagram, not a picture. `smooth()`
   turns a handful of control points into a Catmull-Rom spline expressed as
   cubic beziers, which is what gives hills, clouds, canopies and animals their
   shape without hand-writing every control handle. */

/** Deterministic PRNG so a picture is identical every time it is opened. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}
export const lerp = (a, b, t) => a + (b - a) * t;
const n2 = v => Math.round(v * 10) / 10;

/** Catmull-Rom through the given points → SVG cubic path. */
export function smooth(pts, closed = true, tension = 1) {
  if (pts.length < 3) {
    return 'M' + pts.map(p => `${n2(p[0])} ${n2(p[1])}`).join('L') + (closed ? 'Z' : '');
  }
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]]
                   : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${n2(P[1][0])} ${n2(P[1][1])}`;
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const k = tension / 6;
    const c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += `C${n2(c1[0])} ${n2(c1[1])},${n2(c2[0])} ${n2(c2[1])},${n2(p2[0])} ${n2(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}

/** A soft irregular blob — clouds, bushes, foliage, smoke. */
export function blob(cx, cy, rx, ry, wobble, r, lobes = 9) {
  const pts = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * 2 * wobble;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return smooth(pts, true);
}

/** A cloud: a few overlapping humps sitting on a flat base. */
export function cloud(cx, cy, w, h, r) {
  const pts = [[cx - w / 2, cy]];
  const humps = 3 + Math.floor(r() * 2);
  for (let i = 0; i < humps; i++) {
    const t = (i + 0.5) / humps;
    const hx = cx - w / 2 + t * w;
    const hh = h * (0.7 + r() * 0.6);
    pts.push([hx - w / (humps * 3), cy - hh * 0.75], [hx, cy - hh], [hx + w / (humps * 3), cy - hh * 0.7]);
  }
  pts.push([cx + w / 2, cy]);
  return smooth(pts, true, 0.8);
}

/** A rolling ridge line closed into a filled band down to `floor`. */
export function ridge(x0, x1, baseY, peaks, amp, r, floor) {
  const pts = [];
  const n = Math.max(3, peaks);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = lerp(x0, x1, t);
    const bump = Math.sin(t * Math.PI * (0.7 + peaks * 0.35)) * amp;
    pts.push([x, baseY - Math.abs(bump) * (0.55 + r() * 0.7)]);
  }
  let d = smooth(pts, false, 1);
  d += `L${n2(x1)} ${n2(floor)}L${n2(x0)} ${n2(floor)}Z`;
  return d;
}

/** A jagged mountain range with rounded shoulders. */
export function range(x0, x1, baseY, peaks, amp, r, floor) {
  const pts = [];
  for (let i = 0; i <= peaks * 2; i++) {
    const t = i / (peaks * 2);
    const x = lerp(x0, x1, t);
    const high = i % 2 === 1;
    const y = baseY - (high ? amp * (0.72 + r() * 0.45) : amp * (0.12 + r() * 0.2));
    pts.push([x, y]);
  }
  let d = smooth(pts, false, 0.55);
  d += `L${n2(x1)} ${n2(floor)}L${n2(x0)} ${n2(floor)}Z`;
  return d;
}

/** A broadleaf canopy — a fat blob with a slightly flat underside. */
export function canopy(cx, cy, rx, ry, r) {
  const pts = [];
  const lobes = 11;
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const flat = Math.sin(a) > 0.55 ? 0.72 : 1;      // underside a little flatter
    const k = (1 + (r() - 0.5) * 0.42) * flat;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return smooth(pts, true);
}

/** A conifer: stacked soft tiers, one closed shape. */
export function conifer(cx, baseY, w, h, r) {
  const tiers = 4;
  const left = [], right = [];
  for (let i = 0; i <= tiers; i++) {
    const t = i / tiers;
    const y = baseY - h * t;
    const halfW = (w / 2) * (1 - t) * (0.86 + r() * 0.28);
    left.push([cx - halfW, y]);
    right.push([cx + halfW, y]);
    if (i < tiers) {
      left.push([cx - halfW * 0.62, y - h / tiers * 0.42]);
      right.push([cx + halfW * 0.62, y - h / tiers * 0.42]);
    }
  }
  const pts = [...left, [cx, baseY - h - 8], ...right.reverse()];
  return smooth(pts, true, 0.6);
}

/** A gentle wave line, closed into a band between y0 and y1. */
export function waveBand(x0, x1, y, amp, wavelength, floor, phase = 0) {
  const pts = [];
  const n = Math.max(6, Math.round((x1 - x0) / wavelength) * 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([lerp(x0, x1, t), y + Math.sin(phase + t * Math.PI * 2 * ((x1 - x0) / wavelength)) * amp]);
  }
  let d = smooth(pts, false, 0.9);
  d += `L${n2(x1)} ${n2(floor)}L${n2(x0)} ${n2(floor)}Z`;
  return d;
}

/** A short open wave stroke — the little ripples on water. */
export function ripple(cx, cy, w) {
  const h = w * 0.16;
  return `M${n2(cx - w / 2)} ${n2(cy)}q${n2(w / 4)} ${n2(-h)},${n2(w / 2)} 0t${n2(w / 2)} 0`;
}

/** Rounded rectangle as a path string. */
export function rrect(x, y, w, h, r = 0) {
  r = Math.min(r, w / 2, h / 2);
  if (!r) return `M${n2(x)} ${n2(y)}H${n2(x + w)}V${n2(y + h)}H${n2(x)}Z`;
  return `M${n2(x + r)} ${n2(y)}H${n2(x + w - r)}A${r} ${r} 0 0 1 ${n2(x + w)} ${n2(y + r)}`
       + `V${n2(y + h - r)}A${r} ${r} 0 0 1 ${n2(x + w - r)} ${n2(y + h)}`
       + `H${n2(x + r)}A${r} ${r} 0 0 1 ${n2(x)} ${n2(y + h - r)}`
       + `V${n2(y + r)}A${r} ${r} 0 0 1 ${n2(x + r)} ${n2(y)}Z`;
}

export function ell(cx, cy, rx, ry, rot = 0) {
  if (!rot) {
    return `M${n2(cx - rx)} ${n2(cy)}a${n2(rx)} ${n2(ry)} 0 1 0 ${n2(rx * 2)} 0a${n2(rx)} ${n2(ry)} 0 1 0 ${n2(-rx * 2)} 0Z`;
  }
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return smooth(pts, true);
}

/** A landform: a smooth top edge closed with straight sides down to `floor`.
    Closing a landform with smooth() instead rounds the page-edge corners and the
    hill ends up looking like a balloon. */
export function landform(topPts, floor) {
  const d = smooth(topPts, false, 0.9);
  const a = topPts[0], b = topPts[topPts.length - 1];
  return `${d}L${n2(b[0])} ${n2(floor)}L${n2(a[0])} ${n2(floor)}Z`;
}

/** A closed shape from explicit points, smoothed. */
export const shape = pts => smooth(pts, true);
export const curve = pts => smooth(pts, false);

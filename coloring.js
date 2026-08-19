/* coloring.js — the coloring books.

   Each picture is a list of closed vector regions plus a few detail strokes.
   Tapping runs a point-in-path test and stores one colour per region, so a
   finished page is a few hundred bytes rather than an image, stays sharp at any
   zoom, and exports to PDF exactly as it looks on screen. Nothing here uses the
   network, and nothing here can ever cost anything to run. */

import { rng, lerp, smooth, blob, cloud, ridge, range, canopy, conifer,
         waveBand, ripple, rrect, ell, shape, curve, landform } from './colorart.js';

const W = 1240, H = 1754;
const L = 84, R = W - 84, TOP = 132, BOT = H - 120;   // drawing box

/* ---------- palettes ---------- */
export const PALETTES = {
  city:   ['#FDF6E3','#F6C667','#E8894A','#C8553D','#7E3B3B','#5C7A96','#3E5C76','#1D3557','#A8C4D4','#4F6D5A','#2E3B44','#FFFFFF'],
  woods:  ['#F2F7EA','#CFE3B4','#A7C957','#6A994E','#386641','#254D32','#DDA15E','#BC6C25','#8A5A22','#8FB8C9','#4A7C8C','#FFFFFF'],
  water:  ['#F4FAFC','#D7EEF6','#A9DBEA','#6FC0D8','#3D9BC1','#1F6E94','#12455F','#F6D08A','#E2925B','#B9553F','#8B9AA3','#FFFFFF'],
  dog:    ['#FFFBF2','#F6E4C2','#E9C68A','#D8A65C','#B8823C','#8C5C2A','#5A3617','#33200F','#DCE6DE','#7FA08C','#C6553F','#FFFFFF'],
  travel: ['#FFF8E7','#FBD9A5','#F2A65A','#DE7A46','#A24E2B','#7A8B94','#4A6274','#26394E','#B8D0B2','#6E9A6A','#D9DEE2','#FFFFFF']
};

/* helper: push a region */
const mk = (arr, d, hint) => { arr.push({ d, hint }); };

/* ================= scenes ================= */

/* --- City skyline over water --- */
function skyline(seed) {
  const r = rng(seed), Rg = [], St = [];
  const horizon = 1080, waterTop = horizon + 26;

  mk(Rg, rrect(L, TOP, R - L, horizon - TOP), 'sky');
  mk(Rg, ell(930, 330, 96, 96), 'sun');
  for (let i = 0; i < 5; i++) {
    mk(Rg, cloud(220 + i * 220 + r() * 60, 300 + (i % 3) * 90, 190 + r() * 80, 56 + r() * 26, r), 'cloud');
  }
  mk(Rg, ridge(L, R, 900, 5, 150, r, horizon), 'hills');

  // buildings, each with a few lit windows
  let x = L + 6;
  const tops = [];
  while (x < R - 40) {
    const w = 74 + Math.floor(r() * 96);
    const bw = Math.min(w, R - 6 - x);
    const h = 230 + Math.floor(r() * 470);
    const y = horizon - h;
    const style = r();
    if (style < 0.22) {
      // stepped top
      mk(Rg, `M${x} ${horizon}V${y + 46}H${x + bw * 0.24}V${y}H${x + bw * 0.76}V${y + 46}H${x + bw}V${horizon}Z`, 'building');
    } else if (style < 0.36) {
      // pitched top
      mk(Rg, `M${x} ${horizon}V${y + 60}L${x + bw / 2} ${y}L${x + bw} ${y + 60}V${horizon}Z`, 'building');
    } else {
      mk(Rg, rrect(x, y, bw, h), 'building');
    }
    tops.push({ x, y, w: bw, h });
    const cols = Math.max(1, Math.floor(bw / 42));
    const rows = Math.max(2, Math.floor(h / 78));
    for (let c = 0; c < cols; c++) for (let q = 0; q < rows; q++) {
      if (r() < 0.62) continue;
      const ww = (bw - 26) / cols - 12;
      const wx = x + 16 + c * (bw - 26) / cols;
      const wy = y + 34 + q * (h - 54) / rows;
      if (ww < 9 || wx + ww > x + bw - 12 || wy + 26 > y + h - 14) continue;
      mk(Rg, rrect(wx, wy, ww, 26, 3), 'window');
    }
    x += bw + 10;
  }

  // quay + water
  mk(Rg, rrect(L, horizon, R - L, 26), 'quay');
  mk(Rg, rrect(L, waterTop, R - L, BOT - waterTop), 'water');
  for (let i = 0; i < 3; i++) {
    const y = waterTop + 96 + i * 168;
    mk(Rg, waveBand(L, R, y, 13, 300, y + 60, i * 1.4), 'wave');
  }
  // reflections
  for (const t of tops) {
    if (r() < 0.5) continue;
    mk(Rg, rrect(t.x + 12, waterTop + 6, Math.max(16, t.w - 24), 70 + r() * 170), 'reflect');
  }
  // a sailing boat
  const bx = 760, by = waterTop + 250;
  mk(Rg, shape([[bx, by], [bx + 90, by + 8], [bx + 160, by], [bx + 132, by + 46], [bx + 28, by + 46]]), 'hull');
  mk(Rg, `M${bx + 78} ${by - 150}L${bx + 78} ${by - 6}L${bx + 150} ${by - 6}Z`, 'sail');
  mk(Rg, `M${bx + 68} ${by - 138}L${bx + 68} ${by - 6}L${bx + 14} ${by - 6}Z`, 'sail');

  for (let i = 0; i < 6; i++) St.push({ d: ripple(200 + r() * 800, waterTop + 100 + r() * 480, 90) });
  return { regions: Rg, strokes: St, palette: 'city' };
}

/* --- Forest path --- */
function forest(seed) {
  const r = rng(seed), Rg = [], St = [];
  mk(Rg, rrect(L, TOP, R - L, 620 - TOP), 'sky');
  mk(Rg, ell(660, 300, 84, 84), 'sun');
  for (let i = 0; i < 3; i++) mk(Rg, cloud(260 + i * 340, 260 + (i % 2) * 70, 200, 52, r), 'cloud');

  mk(Rg, ridge(L, R, 668, 4, 96, r, 900), 'far');
  mk(Rg, rrect(L, 860, R - L, BOT - 860), 'ground');
  // the path, narrowing away
  mk(Rg, smooth([[300, BOT], [430, 1380], [520, 1120], [560, 900], [690, 900], [740, 1120], [880, 1380], [1010, BOT]], true, 0.7), 'path');

  // trees: big ones at the edges, smaller behind
  const trees = [
    { x: 150, base: 1290, h: 520, w: 210 },
    { x: 300, base: 1180, h: 430, w: 170 },
    { x: 1090, base: 1310, h: 540, w: 220 },
    { x: 950, base: 1180, h: 420, w: 165 },
    { x: 430, base: 1000, h: 300, w: 120 },
    { x: 820, base: 1010, h: 310, w: 125 }
  ];
  for (const t of trees) {
    mk(Rg, shape([[t.x - t.w * 0.09, t.base], [t.x + t.w * 0.09, t.base],
                  [t.x + t.w * 0.05, t.base - t.h * 0.52], [t.x - t.w * 0.05, t.base - t.h * 0.52]]), 'trunk');
    mk(Rg, canopy(t.x, t.base - t.h * 0.74, t.w * 0.62, t.h * 0.42, r), 'canopy');
    mk(Rg, canopy(t.x - t.w * 0.22, t.base - t.h * 0.55, t.w * 0.36, t.h * 0.24, r), 'canopy');
    mk(Rg, canopy(t.x + t.w * 0.24, t.base - t.h * 0.58, t.w * 0.34, t.h * 0.23, r), 'canopy');
  }
  // undergrowth
  for (let i = 0; i < 12; i++) {
    const bx = L + 40 + r() * (R - L - 80), by = 1240 + r() * 400;
    if (bx > 470 && bx < 830 && by > 1200) continue;      // keep the path clear
    mk(Rg, blob(bx, by, 52 + r() * 40, 30 + r() * 22, 0.28, r, 8), 'bush');
  }
  // stones on the path
  for (let i = 0; i < 5; i++) mk(Rg, blob(560 + r() * 160, 1200 + i * 90, 34, 20, 0.3, r, 7), 'stone');
  for (let i = 0; i < 3; i++) {
    const bx = 380 + r() * 500, by = 200 + r() * 120;
    St.push({ d: `M${bx} ${by}q18 -16,36 0q18 -16,36 0` });
  }
  return { regions: Rg, strokes: St, palette: 'woods' };
}

/* --- Golden retriever, sitting, facing you --- */
function retriever(seed, scenery) {
  const r = rng(seed), Rg = [], St = [];
  let cx = 620, base = 1470, s = 1;

  if (scenery) {
    s = 0.74; cx = 620; base = 1500;
    mk(Rg, rrect(L, TOP, R - L, 700 - TOP), 'sky');
    mk(Rg, ell(1000, 290, 78, 78), 'sun');
    for (let i = 0; i < 3; i++) mk(Rg, cloud(240 + i * 330, 280 + (i % 2) * 60, 190, 50, r), 'cloud');
    mk(Rg, ridge(L, R, 720, 4, 110, r, 900), 'hills');
    mk(Rg, landform([[L, 1030], [400, 992], [800, 1038], [R, 1004]], 1120), 'meadow');
    for (let i = 0; i < 5; i++) {
      const tx = 170 + i * 230 + r() * 50;
      mk(Rg, rrect(tx - 13, 700, 26, 180), 'trunk');
      mk(Rg, canopy(tx, 640, 96, 82, r), 'canopy');
    }
    mk(Rg, rrect(L, 880, R - L, BOT - 880), 'grass');
    for (let i = 0; i < 9; i++) mk(Rg, blob(L + 50 + r() * (R - L - 100), 1180 + r() * 480, 40 + r() * 26, 22 + r() * 14, 0.3, r, 8), 'bush');
    mk(Rg, ell(1055, 1600, 46, 46), 'ball');
    Rg.push({ d: ell(620, 1516, 250, 38), hint: 'shadow', noline: true });
    St.push({ d: `M1030 1580q26 -14,52 0` });
  } else {
    mk(Rg, rrect(L, TOP, R - L, BOT - TOP), 'sky');
    // a soft oval vignette to sit the portrait in
    mk(Rg, ell(620, 900, 452, 622), 'halo');
    mk(Rg, ell(620, 900, 402, 566), 'inner');
    // ground shadow so the dog isn't floating
    Rg.push({ d: ell(620, 1492, 300, 46), hint: 'shadow', noline: true });
  }

  const P = (x, y) => [cx + x * s, base + y * s];

  /* body — a soft teardrop, wide at the base */
  mk(Rg, smooth([P(-215, 0), P(-240, -180), P(-200, -330), P(-120, -410), P(0, -440),
                 P(120, -410), P(200, -330), P(240, -180), P(215, 0)], true, 0.85), 'body');
  /* chest bib */
  mk(Rg, smooth([P(-96, -30), P(-120, -190), P(-60, -300), P(0, -330), P(60, -300),
                 P(120, -190), P(96, -30), P(0, -6)], true, 0.9), 'chest');
  /* front legs */
  mk(Rg, smooth([P(-150, -160), P(-96, -170), P(-84, -20), P(-96, 26), P(-160, 26), P(-172, -20)], true, 0.8), 'leg');
  mk(Rg, smooth([P(150, -160), P(96, -170), P(84, -20), P(96, 26), P(160, 26), P(172, -20)], true, 0.8), 'leg');
  /* paws */
  mk(Rg, ell(cx - 136 * s, base + 20 * s, 60 * s, 30 * s), 'paw');
  mk(Rg, ell(cx + 136 * s, base + 20 * s, 60 * s, 30 * s), 'paw');
  /* haunches */
  mk(Rg, ell(cx - 214 * s, base - 88 * s, 70 * s, 96 * s, -0.18), 'haunch');
  mk(Rg, ell(cx + 214 * s, base - 88 * s, 70 * s, 96 * s, 0.18), 'haunch');
  /* tail sweeping right */
  mk(Rg, smooth([P(220, -60), P(320, -30), P(392, -110), P(360, -190), P(300, -150), P(258, -110)], true, 0.9), 'tail');

  /* head */
  const hy = -520;
  mk(Rg, smooth([P(-176, hy + 40), P(-186, hy - 80), P(-120, hy - 158), P(0, hy - 182),
                 P(120, hy - 158), P(186, hy - 80), P(176, hy + 40), P(96, hy + 118),
                 P(0, hy + 140), P(-96, hy + 118)], true, 0.9), 'head');
  /* ears */
  mk(Rg, smooth([P(-176, hy - 78), P(-250, hy - 40), P(-268, hy + 78), P(-224, hy + 150),
                 P(-166, hy + 118), P(-160, hy + 10)], true, 0.9), 'ear');
  mk(Rg, smooth([P(176, hy - 78), P(250, hy - 40), P(268, hy + 78), P(224, hy + 150),
                 P(166, hy + 118), P(160, hy + 10)], true, 0.9), 'ear');
  /* muzzle */
  mk(Rg, smooth([P(-92, hy + 46), P(-100, hy + 112), P(-52, hy + 156), P(0, hy + 164),
                 P(52, hy + 156), P(100, hy + 112), P(92, hy + 46), P(0, hy + 30)], true, 0.95), 'muzzle');
  /* nose */
  mk(Rg, smooth([P(-34, hy + 84), P(0, hy + 66), P(34, hy + 84), P(18, hy + 112), P(-18, hy + 112)], true, 0.9), 'nose');
  /* eyes + brows */
  mk(Rg, ell(cx - 74 * s, base + (hy - 24) * s, 26 * s, 29 * s), 'eye');
  mk(Rg, ell(cx + 74 * s, base + (hy - 24) * s, 26 * s, 29 * s), 'eye');
  mk(Rg, ell(cx - 74 * s, base + (hy - 78) * s, 24 * s, 11 * s), 'brow');
  mk(Rg, ell(cx + 74 * s, base + (hy - 78) * s, 24 * s, 11 * s), 'brow');
  /* collar + tag */
  mk(Rg, smooth([P(-150, hy + 150), P(0, hy + 186), P(150, hy + 150), P(150, hy + 196),
                 P(0, hy + 232), P(-150, hy + 196)], true, 0.9), 'collar');
  mk(Rg, ell(cx, base + (hy + 250) * s, 28 * s, 28 * s), 'tag');

  /* mouth */
  St.push({ d: `M${cx - 40 * s} ${base + (hy + 128) * s}q${40 * s} ${34 * s},${80 * s} 0` });
  St.push({ d: `M${cx} ${base + (hy + 112) * s}v${20 * s}` });
  return { regions: Rg, strokes: St, palette: 'dog' };
}

/* --- Mountain lake --- */
function mountains(seed) {
  const r = rng(seed), Rg = [], St = [];
  const shoreY = 980;
  mk(Rg, rrect(L, TOP, R - L, shoreY - TOP), 'sky');
  mk(Rg, ell(330, 290, 88, 88), 'sun');
  for (let i = 0; i < 4; i++) mk(Rg, cloud(680 + i * 150, 250 + (i % 2) * 80, 200, 54, r), 'cloud');

  mk(Rg, range(L, R, 780, 4, 330, r, shoreY), 'far');
  mk(Rg, range(L, R, 860, 5, 260, r, shoreY), 'mid');
  mk(Rg, range(L, R, 920, 6, 170, r, shoreY), 'near');
  // pines along the shore
  for (let i = 0; i < 8; i++) {
    const tx = 130 + i * 140 + r() * 40;
    mk(Rg, rrect(tx - 8, shoreY - 40, 16, 44), 'trunk');
    mk(Rg, conifer(tx, shoreY - 34, 92, 190, r), 'pine');
  }
  mk(Rg, smooth([[L, shoreY - 6], [400, shoreY + 14], [820, shoreY - 10], [R, shoreY + 8], [R, shoreY + 46], [L, shoreY + 44]], true, 0.9), 'shore');
  // lake
  mk(Rg, rrect(L, shoreY + 44, R - L, BOT - shoreY - 44), 'water');
  for (let i = 0; i < 3; i++) {
    const y = shoreY + 150 + i * 168;
    mk(Rg, waveBand(L, R, y, 11, 340, y + 58, i * 1.7), 'wave');
  }
  // reflected peaks — soft, and drawn under the ripples
  for (let i = 0; i < 4; i++) {
    const x = 230 + i * 260;
    Rg.push({ d: smooth([[x - 96, shoreY + 50], [x + 96, shoreY + 50], [x + 40, shoreY + 190],
                         [x, shoreY + 236 + r() * 60], [x - 40, shoreY + 190]], true, 0.7),
              hint: 'reflect', noline: true });
  }
  for (let i = 0; i < 6; i++) St.push({ d: ripple(200 + r() * 760, shoreY + 120 + r() * 440, 100) });
  return { regions: Rg, strokes: St, palette: 'water' };
}

/* --- Harbour at dusk --- */
function harbour(seed) {
  const r = rng(seed), Rg = [], St = [];
  const dockY = 760;
  mk(Rg, rrect(L, TOP, R - L, dockY - TOP), 'sky');
  mk(Rg, ell(960, 360, 104, 104), 'sun');
  for (let i = 0; i < 4; i++) mk(Rg, cloud(200 + i * 260, 250 + (i % 2) * 70, 210, 50, r), 'cloud');
  mk(Rg, ridge(L, R, 600, 4, 130, r, dockY), 'hill');

  // harbour-front houses
  let x = L + 10;
  while (x < R - 60) {
    const w = 96 + r() * 74, bw = Math.min(w, R - 10 - x);
    const h = 130 + r() * 120, y = dockY - h;
    mk(Rg, rrect(x, y, bw, h), 'house');
    mk(Rg, `M${x - 12} ${y}L${x + bw / 2} ${y - 66}L${x + bw + 12} ${y}Z`, 'roof');
    const n = Math.max(1, Math.floor(bw / 46));
    for (let q = 0; q < n; q++) {
      const wx = x + 14 + q * (bw - 20) / n, ww = (bw - 20) / n - 14;
      if (ww > 12) mk(Rg, rrect(wx, y + 40, ww, 42, 4), 'window');
    }
    mk(Rg, rrect(x + bw / 2 - 20, y + h - 60, 40, 60, 4), 'door');
    x += bw + 12;
  }
  // dock
  mk(Rg, rrect(L, dockY, R - L, 54), 'dock');
  for (let i = 0; i < 8; i++) mk(Rg, rrect(112 + i * 142, dockY + 54, 22, 74), 'post');
  // water
  mk(Rg, rrect(L, dockY + 54, R - L, BOT - dockY - 54), 'water');
  for (let i = 0; i < 3; i++) {
    const y = dockY + 210 + i * 170;
    mk(Rg, waveBand(L, R, y, 12, 320, y + 58, i * 1.3), 'wave');
  }
  // moored boats
  for (let i = 0; i < 4; i++) {
    const bx = 150 + (i % 2) * 480 + r() * 60, by = 1050 + i * 155;
    mk(Rg, shape([[bx, by], [bx + 100, by + 10], [bx + 190, by], [bx + 156, by + 56], [bx + 34, by + 56]]), 'hull');
    mk(Rg, `M${bx + 92} ${by - 168}L${bx + 92} ${by - 6}L${bx + 176} ${by - 6}Z`, 'sail');
    mk(Rg, `M${bx + 82} ${by - 150}L${bx + 82} ${by - 6}L${bx + 16} ${by - 6}Z`, 'sail');
  }
  return { regions: Rg, strokes: St, palette: 'water' };
}

/* --- Coast road --- */
function coastRoad(seed) {
  const r = rng(seed), Rg = [], St = [];
  const seaY = 620, cliffY = 990;
  mk(Rg, rrect(L, TOP, R - L, seaY - TOP), 'sky');
  for (let i = 0; i < 5; i++) mk(Rg, cloud(180 + i * 240, 250 + (i % 3) * 80, 200 - i * 8, 52, r), 'cloud');
  mk(Rg, ell(300, 280, 82, 82), 'sun');

  mk(Rg, rrect(L, seaY, R - L, cliffY - seaY), 'sea');
  for (let i = 0; i < 3; i++) {
    const y = seaY + 90 + i * 92;
    mk(Rg, waveBand(L, R, y, 10, 300, y + 40, i * 1.6), 'wave');
  }
  // headlands
  mk(Rg, ridge(L, 560, 640, 3, 120, r, 760), 'far');
  mk(Rg, ridge(720, R, 620, 3, 140, r, 760), 'far');

  // cliff mass
  mk(Rg, landform([[L, cliffY], [330, cliffY - 66], [700, cliffY + 26], [1000, cliffY - 44], [R, cliffY + 8]], BOT), 'cliff');
  // the road, curving away
  mk(Rg, smooth([[190, BOT], [330, 1470], [452, 1210], [528, cliffY + 24],
                 [694, cliffY + 24], [772, 1210], [906, 1470], [1050, BOT]], true, 0.7), 'road');
  for (let i = 0; i < 6; i++) {
    const t = i / 6, t2 = (i + 0.42) / 6;
    const ay = lerp(cliffY + 60, BOT - 30, t), by = lerp(cliffY + 60, BOT - 30, t2);
    const aw = 7 + t * 12, bw = 7 + t2 * 12;
    const ax = lerp(610, 620, t), bx = lerp(610, 620, t2);
    Rg.push({ d: `M${ax - aw} ${ay}L${bx - bw} ${by}L${bx + bw} ${by}L${ax + aw} ${ay}Z`, hint: 'marking' });
  }
  // lighthouse
  mk(Rg, smooth([[1010, cliffY - 30], [1084, cliffY - 30], [1066, 700], [1028, 700]], true, 0.6), 'tower');
  mk(Rg, rrect(1018, 654, 58, 48, 5), 'lamp');
  mk(Rg, `M1008 654L1086 654L1047 604Z`, 'roof');
  // grass tufts and rocks
  for (let i = 0; i < 12; i++) {
    const bx = L + 40 + r() * (R - L - 80), by = 1180 + r() * 420;
    if (bx > 430 && bx < 900 && by > 1150) continue;
    mk(Rg, blob(bx, by, 40 + r() * 30, 24 + r() * 16, 0.3, r, 8), 'rock');
  }
  for (let i = 0; i < 4; i++) {
    const bx = 700 + r() * 380, by = 300 + r() * 130;
    St.push({ d: `M${bx} ${by}q20 -18,40 0q20 -18,40 0` });
  }
  return { regions: Rg, strokes: St, palette: 'travel' };
}

/* --- Street café --- */
function cafe(seed) {
  const r = rng(seed), Rg = [], St = [];
  const groundY = 1150;
  mk(Rg, rrect(L, TOP, R - L, 320 - TOP), 'sky');
  mk(Rg, rrect(120, 250, R - 120 - 36, groundY - 250), 'wall');
  // awning
  for (let i = 0; i < 9; i++) {
    const w = (R - 156) / 9, ax = 138 + i * w;
    mk(Rg, smooth([[ax, 520], [ax + w, 520], [ax + w - 16, 636], [ax - 16, 636]], true, 0.95), 'awning');
  }
  mk(Rg, rrect(122, 500, R - 158, 24, 8), 'rail');
  // windows
  for (let i = 0; i < 3; i++) {
    const wx = 186 + i * 318;
    mk(Rg, rrect(wx, 690, 224, 306, 12), 'window');
    for (let a = 0; a < 2; a++) for (let b2 = 0; b2 < 2; b2++) {
      mk(Rg, rrect(wx + 20 + a * 100, 710 + b2 * 146, 84, 128, 5), 'pane');
    }
  }
  mk(Rg, rrect(566, 1000, 132, 150, 8), 'door');
  mk(Rg, ell(632, 1076, 9, 9), 'knob');
  // pavement
  mk(Rg, rrect(L, groundY, R - L, BOT - groundY), 'ground');
  for (let i = 0; i < 5; i++) mk(Rg, rrect(L, groundY + 70 + i * 84, R - L, 8), 'seam');
  // tables
  for (let i = 0; i < 3; i++) {
    const tx = 268 + i * 356, ty = 1310 + (i % 2) * 130;
    mk(Rg, ell(tx, ty, 104, 36), 'table');
    mk(Rg, rrect(tx - 11, ty, 22, 132), 'stem');
    mk(Rg, ell(tx, ty + 140, 58, 19), 'base');
    mk(Rg, smooth([[tx - 196, ty - 42], [tx - 122, ty - 46], [tx - 116, ty + 6], [tx - 190, ty + 10]], true, 0.9), 'chair');
    mk(Rg, smooth([[tx + 122, ty - 46], [tx + 196, ty - 42], [tx + 190, ty + 10], [tx + 116, ty + 6]], true, 0.9), 'chair');
    mk(Rg, ell(tx, ty - 24, 28, 15), 'cup');
    mk(Rg, ell(tx + 52, ty - 16, 16, 9), 'saucer');
  }
  // planters
  for (let i = 0; i < 2; i++) {
    const px = 156 + i * 848;
    mk(Rg, smooth([[px, 1570], [px + 116, 1570], [px + 100, 1676], [px + 16, 1676]], true, 0.95), 'planter');
    mk(Rg, blob(px + 58, 1500, 84, 70, 0.26, r, 9), 'plant');
  }
  return { regions: Rg, strokes: St, palette: 'travel' };
}

/* --- Cabin in the pines --- */
function cabin(seed) {
  const r = rng(seed), Rg = [], St = [];
  const groundY = 960;
  mk(Rg, rrect(L, TOP, R - L, groundY - TOP), 'sky');
  mk(Rg, ell(1000, 260, 72, 72), 'moon');
  for (let i = 0; i < 3; i++) mk(Rg, cloud(240 + i * 300, 280 + (i % 2) * 60, 190, 48, r), 'cloud');
  mk(Rg, ridge(L, R, 720, 4, 120, r, groundY), 'hills');
  // pines
  for (let i = 0; i < 9; i++) {
    const tx = 120 + i * 126 + r() * 30;
    mk(Rg, rrect(tx - 10, groundY - 50, 20, 54), 'trunk');
    mk(Rg, conifer(tx, groundY - 44, 118, 250 + r() * 70, r), 'pine');
  }
  mk(Rg, rrect(L, groundY, R - L, BOT - groundY), 'ground');
  // cabin
  mk(Rg, rrect(340, 1060, 560, 380), 'wall');
  for (let i = 1; i < 6; i++) mk(Rg, rrect(340, 1060 + i * 63, 560, 9), 'log');
  mk(Rg, `M296 1060L944 1060L620 850Z`, 'roof');
  mk(Rg, rrect(770, 880, 62, 132), 'chimney');
  for (let i = 0; i < 3; i++) mk(Rg, blob(806 + i * 40, 830 - i * 82, 42 + i * 12, 32 + i * 10, 0.32, r, 8), 'smoke');
  mk(Rg, rrect(410, 1130, 150, 132, 6), 'window');
  mk(Rg, rrect(760, 1130, 150, 132, 6), 'window');
  mk(Rg, rrect(578, 1250, 116, 190, 6), 'door');
  mk(Rg, ell(668, 1348, 9, 9), 'knob');
  // path
  mk(Rg, smooth([[440, BOT], [540, 1540], [578, 1440], [694, 1440], [750, 1540], [840, BOT]], true, 0.8), 'path');
  for (let i = 0; i < 8; i++) mk(Rg, blob(L + 60 + r() * (R - L - 120), 1490 + r() * 150, 36 + r() * 22, 22 + r() * 12, 0.3, r, 8), 'stone');
  return { regions: Rg, strokes: St, palette: 'woods' };
}

/* --- Coastal cliffs --- */
function cliffs(seed) {
  const r = rng(seed), Rg = [], St = [];
  const seaY = 640;
  mk(Rg, rrect(L, TOP, R - L, seaY - TOP), 'sky');
  mk(Rg, ell(310, 290, 92, 92), 'sun');
  for (let i = 0; i < 4; i++) mk(Rg, cloud(640 + i * 160, 240 + (i % 2) * 74, 210, 54, r), 'cloud');
  mk(Rg, rrect(L, seaY, R - L, BOT - seaY), 'sea');
  for (let i = 0; i < 4; i++) {
    const y = seaY + 110 + i * 108;
    mk(Rg, waveBand(L, R, y, 12, 330, y + 42, i * 1.5), 'wave');
  }
  // stacked headlands
  mk(Rg, landform([[L, 1020], [260, 892], [480, 968], [640, 1064]], 1220), 'cliff');
  mk(Rg, landform([[600, 1086], [880, 946], [R, 1058]], 1290), 'cliff');
  mk(Rg, landform([[L, 1236], [430, 1146], [820, 1262], [R, 1188]], 1480), 'cliff');
  mk(Rg, landform([[L, 1418], [400, 1344], [800, 1452], [R, 1372]], BOT), 'cliff');
  // strata, confined to the front shelf
  for (let i = 0; i < 5; i++) {
    const y = 1500 + i * 52;
    if (y > BOT - 40) break;
    mk(Rg, waveBand(L + 40, R - 40, y, 6, 380, y + 16, i), 'strata');
  }
  // foam
  for (let i = 0; i < 7; i++) mk(Rg, blob(140 + r() * (R - 280), 1110 + r() * 90, 56 + r() * 40, 20, 0.35, r, 9), 'foam');
  for (let i = 0; i < 4; i++) {
    const bx = 420 + r() * 560, by = 330 + r() * 150;
    St.push({ d: `M${bx} ${by}q22 -20,44 0q22 -20,44 0` });
  }
  return { regions: Rg, strokes: St, palette: 'water' };
}

/* --- City rooftops --- */
function rooftops(seed) {
  const r = rng(seed), Rg = [], St = [];
  const skyBot = 700;
  mk(Rg, rrect(L, TOP, R - L, skyBot - TOP), 'sky');
  mk(Rg, ell(900, 286, 82, 82), 'sun');
  for (let i = 0; i < 4; i++) mk(Rg, cloud(200 + i * 250, 250 + (i % 2) * 66, 200, 50, r), 'cloud');

  // distant towers, back layer
  let x = L;
  while (x < R - 30) {
    const w = 68 + r() * 86, h = 150 + r() * 230, bw = Math.min(w, R - x);
    mk(Rg, rrect(x, skyBot - h, bw, h), 'far');
    x += bw + 14;
  }

  /* Three roof planes at different depths. Each one is a block with a pitched
     top, a tile field and its own chimneys — laid out so nothing overlaps. */
  const roofs = [
    { x: L,   w: 372, top: 880,  ridge: 806 },
    { x: 468, w: 286, top: 966,  ridge: 900 },
    { x: 768, w: R - 768, top: 838, ridge: 762 }
  ];
  for (const rf of roofs) {
    // chimneys first so the roof plane sits in front of their bases
    const n = rf.w > 320 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const cx2 = rf.x + 40 + i * ((rf.w - 96) / (n - 1 || 1));
      mk(Rg, rrect(cx2, rf.ridge - 132, 56, 150), 'chimney');
      mk(Rg, rrect(cx2 - 9, rf.ridge - 150, 74, 22, 4), 'cap');
    }
    // pitched roof plane
    mk(Rg, `M${rf.x} ${rf.top}L${rf.x + rf.w / 2} ${rf.ridge}L${rf.x + rf.w} ${rf.top}Z`, 'roof');
    // the wall under it
    mk(Rg, rrect(rf.x, rf.top, rf.w, 1060 - rf.top), 'front');
    // tile courses inside the roof triangle only
    const courses = 4;
    for (let i = 1; i <= courses; i++) {
      const t = i / (courses + 1);
      const y = lerp(rf.top, rf.ridge, t);
      const half = (rf.w / 2) * (1 - t) - 10;
      if (half < 24) continue;
      mk(Rg, rrect(rf.x + rf.w / 2 - half, y - 7, half * 2, 14, 6), 'tile');
    }
  }

  // the wall below, with a tidy grid of windows
  mk(Rg, rrect(L, 1060, R - L, BOT - 1060), 'wall');
  const cols = 5, rows = 5;
  const gapX = (R - L - 40) / cols, gapY = (BOT - 1060 - 60) / rows;
  for (let c = 0; c < cols; c++) for (let q = 0; q < rows; q++) {
    const wx = L + 20 + c * gapX + 14, wy = 1100 + q * gapY;
    const ww = gapX - 46, wh = Math.min(66, gapY - 34);
    if (ww < 40 || wh < 30) continue;
    mk(Rg, rrect(wx, wy, ww, wh, 6), 'window');
    mk(Rg, rrect(wx - 6, wy + wh + 4, ww + 12, 11, 4), 'ledge');
  }
  return { regions: Rg, strokes: St, palette: 'city' };
}

/* ================= the book ================= */
export const SCENES = {
  'city-skyline':   { title: 'City Skyline',        theme: 'City life',    gen: () => skyline(1207) },
  'city-rooftops':  { title: 'Rooftops',            theme: 'City views',   gen: () => rooftops(4411) },
  'street-cafe':    { title: 'Street Café',         theme: 'City life',    gen: () => cafe(9021) },
  'forest-path':    { title: 'Forest Path',         theme: 'In the woods', gen: () => forest(3312) },
  'forest-cabin':   { title: 'Cabin in the Pines',  theme: 'In the woods', gen: () => cabin(7788) },
  'mountain-lake':  { title: 'Mountain Lake',       theme: 'Nature views', gen: () => mountains(5150) },
  'coastal-cliffs': { title: 'Coastal Cliffs',      theme: 'Nature views', gen: () => cliffs(2468) },
  'harbour-dusk':   { title: 'Harbour at Dusk',     theme: 'Travel',       gen: () => harbour(6174) },
  'coast-road':     { title: 'Coast Road',          theme: 'Travel',       gen: () => coastRoad(8642) },
  'retriever':      { title: 'Golden Retriever',    theme: 'Dogs',         gen: () => retriever(1111, false) },
  'dog-park':       { title: 'Dog in the Park',     theme: 'Dogs',         gen: () => retriever(2222, true) },
  'dog-portrait':   { title: 'Good Dog',            theme: 'Dogs',         gen: () => retriever(3333, false) }
};

export const BOOK = [
  { scene: 'city-skyline',   mode: 'tap' },
  { scene: 'forest-path',    mode: 'tap' },
  { scene: 'retriever',      mode: 'tap' },
  { scene: 'coast-road',     mode: 'tap' },
  { scene: 'mountain-lake',  mode: 'number' },
  { scene: 'harbour-dusk',   mode: 'number' },
  { scene: 'city-rooftops',  mode: 'number' },
  { scene: 'dog-park',       mode: 'number' },
  { scene: 'street-cafe',    mode: 'blank' },
  { scene: 'forest-cabin',   mode: 'blank' },
  { scene: 'coastal-cliffs', mode: 'blank' },
  { scene: 'dog-portrait',   mode: 'blank' }
];

export const MODES = {
  tap:    { label: 'Tap to fill',      hint: 'Pick a colour, then tap any area.' },
  number: { label: 'Colour by number', hint: 'Pick a numbered colour, then tap the areas with that number.' },
  blank:  { label: 'Colour it in',     hint: 'Line art only — use the pens and the highlighter.' }
};

/* geometry is identical every time, so build once */
const cache = new Map();
export function getScene(id) {
  if (cache.has(id)) return cache.get(id);
  const def = SCENES[id] || SCENES['city-skyline'];
  const built = def.gen();
  const pal = PALETTES[built.palette];
  const byHint = new Map();
  let next = 0;
  built.regions.forEach((rg, i) => {
    rg.id = 'r' + i;
    rg.path = new Path2D(rg.d);
    if (!byHint.has(rg.hint)) byHint.set(rg.hint, (next++ % pal.length) + 1);
    rg.n = byHint.get(rg.hint);
    rg.box = boxOf(rg.d);
  });
  const out = { ...built, id, title: def.title, theme: def.theme, colors: pal };
  cache.set(id, out);
  return out;
}

/* crude bounding box straight off the path numbers — only used to decide
   whether a region is big enough to carry a printed number */
function boxOf(d) {
  const nums = d.match(/-?\d+(\.\d+)?/g);
  if (!nums) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = +nums[i], y = +nums[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/* ---------- drawing ---------- */
export function drawColoring(ctx, page) {
  const meta = page?.meta || {};
  const sc = getScene(meta.scene || 'city-skyline');
  const mode = meta.mode || 'tap';
  const fills = meta.fills || {};

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, page.w, page.h);

  /* Back to front, filling opaquely before stroking. A shape in front therefore
     wipes out the outlines of whatever sits behind it, which is what stops the
     picture turning into a tangle of overlapping lines — the single thing that
     separates line art from a wireframe. */
  ctx.strokeStyle = '#232a33';
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const rg of sc.regions) {
    ctx.fillStyle = fills[rg.id] || '#ffffff';
    ctx.fill(rg.path);
    if (!rg.noline) ctx.stroke(rg.path);
  }
  for (const s of sc.strokes) ctx.stroke(new Path2D(s.d));

  if (mode === 'number') {
    ctx.fillStyle = 'rgba(35,42,51,.66)';
    ctx.font = '600 20px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const placed = [];
    for (const rg of sc.regions) {
      if (fills[rg.id] || !rg.box) continue;
      if (rg.box.w < 56 || rg.box.h < 42) continue;
      // don't stack numbers on top of each other
      if (placed.some(p => Math.abs(p.x - rg.box.cx) < 42 && Math.abs(p.y - rg.box.cy) < 30)) continue;
      placed.push({ x: rg.box.cx, y: rg.box.cy });
      ctx.fillText(String(rg.n), rg.box.cx, rg.box.cy);
    }
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = 'rgba(35,42,51,.6)';
  ctx.font = '600 22px ui-serif, Georgia, serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(sc.title, L, 88);
  ctx.font = '500 14px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(35,42,51,.4)';
  ctx.fillText(`${sc.theme}  ·  ${MODES[mode].label}`, L, H - 62);
  ctx.restore();
}

/** Topmost region under a page-space point. */
export function regionAt(page, x, y, ctx) {
  const sc = getScene(page?.meta?.scene || 'city-skyline');
  for (let i = sc.regions.length - 1; i >= 0; i--) {
    if (ctx.isPointInPath(sc.regions[i].path, x, y)) return sc.regions[i];
  }
  return null;
}

export const sceneOf = page => getScene(page?.meta?.scene || 'city-skyline');

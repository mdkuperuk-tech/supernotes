/* wordfind.js — themed word-search grids, printed as a page you circle by hand.

   Same philosophy as sudoku.js: this is a paper template, not an interactive
   tool. The grid and word bank are generated once when the notebook is created
   and drawn as a fixed background; the person circles or underlines found words
   with their own pen, the way they would in a printed puzzle book. */

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function shuffled(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const gridWord = s => s.toUpperCase().replace(/[^A-Z]/g, '');

/* Real place names, kept accurate since these end up printed in front of Mark's
   team — spelling matches common English usage (Bogotá/Medellín etc. rendered
   without diacritics, as is standard in word-search grids). */
export const THEMES = {
  us_cities: { label: 'US Cities', words: [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
    'San Antonio', 'San Diego', 'Dallas', 'Austin', 'Miami', 'Seattle',
    'Denver', 'Boston', 'Atlanta', 'Orlando'
  ] },
  colombia_cities: { label: 'Colombia Cities', words: [
    'Bogota', 'Medellin', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga',
    'Pereira', 'Manizales', 'Santa Marta', 'Cucuta', 'Ibague', 'Pasto',
    'Popayan', 'Monteria'
  ] },
  philippines_cities: { label: 'Philippines Cities', words: [
    'Manila', 'Quezon City', 'Cebu', 'Davao', 'Makati', 'Taguig',
    'Pasig', 'Antipolo', 'Iloilo', 'Baguio', 'Zamboanga', 'Bacolod', 'Tagaytay'
  ] },
  world_countries: { label: 'Countries of the World', words: [
    'Brazil', 'Canada', 'France', 'Germany', 'Japan', 'Kenya', 'Mexico',
    'Norway', 'Egypt', 'India', 'Italy', 'Spain', 'Thailand', 'Vietnam',
    'Australia', 'Argentina'
  ] },
  world_capitals: { label: 'World Capitals', words: [
    'Paris', 'Tokyo', 'Cairo', 'Madrid', 'Ottawa', 'Berlin', 'London',
    'Nairobi', 'Lima', 'Rome', 'Oslo', 'Bangkok', 'Canberra', 'Jakarta'
  ] }
};

export const DIFFICULTY = {
  easy:   { size: 12, wordCount: 8,  dirs: [[0,1],[1,0],[1,1]] },
  medium: { size: 14, wordCount: 10, dirs: [[0,1],[1,0],[1,1],[0,-1],[-1,0],[-1,-1],[1,-1],[-1,1]] }
};

function tryPlace(grid, size, word, dirs, rnd) {
  const attempts = 400;
  for (let a = 0; a < attempts; a++) {
    const [dr, dc] = dirs[Math.floor(rnd() * dirs.length)];
    const len = word.length;
    const rLo = dr < 0 ? (len - 1) * -dr : 0, rHi = dr > 0 ? size - 1 - (len - 1) * dr : size - 1;
    const cLo = dc < 0 ? (len - 1) * -dc : 0, cHi = dc > 0 ? size - 1 - (len - 1) * dc : size - 1;
    if (rHi < rLo || cHi < cLo) continue;
    const r0 = rLo + Math.floor(rnd() * (rHi - rLo + 1));
    const c0 = cLo + Math.floor(rnd() * (cHi - cLo + 1));
    let fits = true;
    const cells = [];
    for (let i = 0; i < len; i++) {
      const r = r0 + dr * i, c = c0 + dc * i;
      const existing = grid[r * size + c];
      if (existing && existing !== word[i]) { fits = false; break; }
      cells.push([r, c]);
    }
    if (!fits) continue;
    cells.forEach(([r, c], i) => { grid[r * size + c] = word[i]; });
    return cells;
  }
  return null;
}

/** One themed puzzle: a filled letter grid plus the placed word list (with the
 *  path each word occupies, kept for a possible future "reveal" feature — the
 *  printed page itself never shows the paths). */
export function generatePuzzle(themeId, difficulty = 'easy', seed = Date.now() ^ (Math.random() * 1e9)) {
  const theme = THEMES[themeId] || THEMES.us_cities;
  const spec = DIFFICULTY[difficulty] || DIFFICULTY.easy;
  const rnd = rng(seed);
  const pool = shuffled(theme.words, rnd).slice(0, spec.wordCount)
    .map(label => ({ label, grid: gridWord(label) }))
    .filter(w => w.grid.length <= spec.size)
    .sort((a, b) => b.grid.length - a.grid.length);

  let grid, placed;
  for (let attempt = 0; attempt < 25; attempt++) {
    grid = new Array(spec.size * spec.size).fill('');
    placed = [];
    let ok = true;
    for (const w of pool) {
      const cells = tryPlace(grid, spec.size, w.grid, spec.dirs, rnd);
      if (cells) placed.push({ label: w.label, word: w.grid, cells });
      else ok = false;
    }
    if (ok) break;
  }
  // fill whatever is left with random letters
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = letters[Math.floor(rnd() * 26)];

  return { theme: themeId, themeLabel: theme.label, difficulty, size: spec.size, grid, words: placed };
}

/** True when every placed word's letters actually read correctly along its path
 *  in the finished grid — the generator's own self-check, exercised by tests. */
export function verifyPlacement(puzzle) {
  const { grid, size, words } = puzzle;
  return words.every(w => w.cells.every(([r, c], i) => grid[r * size + c] === w.word[i]));
}

/* ---------- rendering: a printed page, circle words with your own pen ---------- */

export function drawWordFind(ctx, page) {
  const { w, h, meta } = page;
  const size = meta?.size || 12;
  const grid = meta?.grid || new Array(size * size).fill('A');
  const words = meta?.words || [];
  const idx = meta?.puzzleIndex, total = meta?.puzzleTotal;

  ctx.save();
  ctx.fillStyle = '#fbfaf7'; ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#2a2f3a';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText('Word Find', 56, 76);
  ctx.font = '400 18px system-ui, sans-serif';
  ctx.fillStyle = '#8a8f9c';
  const sub = (meta?.themeLabel || '') + (idx ? ` · Puzzle ${idx}${total ? ` of ${total}` : ''}` : '');
  ctx.fillText(sub, 56, 102);

  const gridW = w - 112;
  const cell = gridW / size;
  const gx = 56, gy = 140;

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `500 ${Math.round(cell * 0.55)}px "Courier New", monospace`;
  ctx.fillStyle = '#20242d';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      ctx.fillText(grid[r * size + c], gx + c * cell + cell / 2, gy + r * cell + cell / 2 + 1);
    }
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  const listY = gy + size * cell + 50;
  ctx.font = '600 17px system-ui, sans-serif';
  ctx.fillStyle = '#2a2f3a';
  ctx.fillText('Find:', gx, listY);

  ctx.font = '400 16px system-ui, sans-serif';
  const cols = 3;
  const colW = gridW / cols;
  words.forEach((wd, i) => {
    const col = i % cols, row = (i / cols) | 0;
    ctx.fillStyle = '#4a5060';
    ctx.fillText('○ ' + wd.label, gx + col * colW, listY + 28 + row * 26);
  });
  ctx.restore();
}

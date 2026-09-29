/* sudoku.js — puzzle generation, solving and the printed page you write on.

   Sudoku is drawn as a plain paper template, the same way the daily planner or
   the month grid are: a fixed background with the givens printed in, and blank
   cells for the person to fill in with their own pen. There is no tap-to-enter
   tool and nothing to validate — exactly like a puzzle book page, and it means
   this feature adds no new touch-handling code at all. */

const N = 9, BOX = 3;

/* ---------- solving ---------- */

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function shuffled(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function valid(grid, r, c, v) {
  for (let i = 0; i < N; i++) {
    if (grid[r * N + i] === v) return false;
    if (grid[i * N + c] === v) return false;
  }
  const br = r - (r % BOX), bc = c - (c % BOX);
  for (let i = 0; i < BOX; i++) for (let j = 0; j < BOX; j++) {
    if (grid[(br + i) * N + (bc + j)] === v) return false;
  }
  return true;
}

/** Randomised backtracking fill — produces one complete, valid 9×9 solution. */
export function generateFullGrid(seed = Date.now() ^ (Math.random() * 1e9)) {
  const rnd = rng(seed);
  const grid = new Array(81).fill(0);
  const digits = [1,2,3,4,5,6,7,8,9];
  function fill(pos) {
    if (pos === 81) return true;
    const r = (pos / N) | 0, c = pos % N;
    for (const v of shuffled(digits, rnd)) {
      if (valid(grid, r, c, v)) {
        grid[pos] = v;
        if (fill(pos + 1)) return true;
        grid[pos] = 0;
      }
    }
    return false;
  }
  fill(0);
  return grid;
}

/** Counts solutions up to `limit` (default 2, just enough to prove uniqueness),
 *  stopping early — this never needs to enumerate every solution to know there's
 *  more than one. */
export function countSolutions(grid, limit = 2) {
  const g = grid.slice();
  let count = 0;
  function firstEmpty() {
    for (let i = 0; i < 81; i++) if (g[i] === 0) return i;
    return -1;
  }
  function solve() {
    if (count >= limit) return;
    const pos = firstEmpty();
    if (pos < 0) { count++; return; }
    const r = (pos / N) | 0, c = pos % N;
    for (let v = 1; v <= 9; v++) {
      if (valid(g, r, c, v)) {
        g[pos] = v;
        solve();
        g[pos] = 0;
        if (count >= limit) return;
      }
    }
  }
  solve();
  return count;
}

export function solve(grid) {
  const g = grid.slice();
  function firstEmpty() { for (let i = 0; i < 81; i++) if (g[i] === 0) return i; return -1; }
  function step() {
    const pos = firstEmpty();
    if (pos < 0) return true;
    const r = (pos / N) | 0, c = pos % N;
    for (let v = 1; v <= 9; v++) {
      if (valid(g, r, c, v)) { g[pos] = v; if (step()) return true; g[pos] = 0; }
    }
    return false;
  }
  return step() ? g : null;
}

export const DIFFICULTY = {
  easy:   { label: 'Easy',   givens: 40 },
  medium: { label: 'Medium', givens: 30 }
};

/** Removes cells from a full grid one at a time, keeping a removal only when the
 *  puzzle still has exactly one solution — this is what makes it a real puzzle
 *  rather than a grid with holes in it. */
export function digPuzzle(fullGrid, targetGivens, seed = Date.now() ^ (Math.random() * 1e9)) {
  const rnd = rng(seed);
  const puzzle = fullGrid.slice();
  const order = shuffled([...Array(81).keys()], rnd);
  let givens = 81;
  for (const pos of order) {
    if (givens <= targetGivens) break;
    if (puzzle[pos] === 0) continue;
    const saved = puzzle[pos];
    puzzle[pos] = 0;
    if (countSolutions(puzzle, 2) === 1) { givens--; }
    else { puzzle[pos] = saved; }
  }
  return puzzle;
}

/** One full puzzle: the printed grid, its (hidden) solution, and which cells are
 *  fixed clues versus blank for the writer to fill in. */
export function generatePuzzle(difficulty = 'easy', seed) {
  const spec = DIFFICULTY[difficulty] || DIFFICULTY.easy;
  const solution = generateFullGrid(seed);
  const puzzle = digPuzzle(solution, spec.givens, seed != null ? seed + 1 : undefined);
  const given = puzzle.map(v => v !== 0);
  return { puzzle, solution, given, difficulty };
}

/** True only when every clue in `puzzle` is consistent with `solution` and the
 *  puzzle (with those clues removed) still has exactly one solution. Used only
 *  by tests — the app itself never needs to re-verify a puzzle it just built. */
export function isValidPuzzle(puzzle, solution) {
  for (let i = 0; i < 81; i++) if (puzzle[i] !== 0 && puzzle[i] !== solution[i]) return false;
  return countSolutions(puzzle, 2) === 1;
}

/* ---------- rendering: a printed page, ink goes on top ---------- */

export function drawSudoku(ctx, page) {
  const { w, h, meta } = page;
  const puzzle = meta?.puzzle || new Array(81).fill(0);
  const given = meta?.given || puzzle.map(v => v !== 0);
  const diff = DIFFICULTY[meta?.difficulty] || DIFFICULTY.easy;
  const idx = meta?.puzzleIndex, total = meta?.puzzleTotal;

  ctx.save();
  ctx.fillStyle = '#fbfaf7'; ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#2a2f3a';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Sudoku', 56, 76);
  ctx.font = '400 18px system-ui, sans-serif';
  ctx.fillStyle = '#8a8f9c';
  const sub = `${diff.label}` + (idx ? ` · Puzzle ${idx}${total ? ` of ${total}` : ''}` : '');
  ctx.fillText(sub, 56, 102);

  const size = Math.min(w - 112, h - 320);
  const gx = (w - size) / 2, gy = 150;
  const cell = size / 9;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(gx, gy, size, size);

  for (let i = 0; i <= 9; i++) {
    const bold = i % 3 === 0;
    ctx.strokeStyle = bold ? '#2a2f3a' : '#c7ccd6';
    ctx.lineWidth = bold ? 2.6 : 1;
    ctx.beginPath(); ctx.moveTo(gx + i * cell, gy); ctx.lineTo(gx + i * cell, gy + size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx, gy + i * cell); ctx.lineTo(gx + size, gy + i * cell); ctx.stroke();
  }

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(cell * 0.5)}px system-ui, sans-serif`;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = puzzle[r * 9 + c];
      if (!v) continue;
      ctx.fillStyle = given[r * 9 + c] ? '#20242d' : '#2f6fed';
      ctx.fillText(String(v), gx + c * cell + cell / 2, gy + r * cell + cell / 2 + 1);
    }
  }
  ctx.textAlign = 'left';

  ctx.fillStyle = '#9aa0ac';
  ctx.font = '400 15px system-ui, sans-serif';
  ctx.fillText('Fill in the blanks with your pen — every row, column and 3×3 box takes 1–9 once.', 56, gy + size + 44);
  ctx.restore();
}

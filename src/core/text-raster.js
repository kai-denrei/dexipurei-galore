// text-raster.js — turn any string into a lit/unlit grid.
//   ASCII (0-9, A-Z, punctuation) → crisp built-in 5×7 font.
//   Anything else (日本語, kana, emoji, accented latin) → rasterize a web font and sample to a grid.
// Results are cached by (str, height, mode) so we don't re-rasterize every animation frame.

// 5×7 dot-matrix font — rows top→bottom, '1' = lit. (From the reference dot-matrix module.)
export const F = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00000', '00100'],
  ',': ['00000', '00000', '00000', '00000', '00100', '00100', '01000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '°': ['01100', '10010', '01100', '00000', '00000', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  'D': ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  'W': ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
};
export const GW = 5, GH = 7, GAP = 1;

const _cache = new Map();
const inBuiltin = (str) => [...str].every((c) => F[c] || F[c.toUpperCase()]);

function builtinGrid(str) {
  const glyphs = [...str].map((c) => F[c] || F[c.toUpperCase()] || F['?']);
  const cols = glyphs.length ? glyphs.length * GW + (glyphs.length - 1) * GAP : GW;
  const grid = [];
  for (let r = 0; r < GH; r++) {
    const line = [];
    glyphs.forEach((g, gi) => {
      for (let c = 0; c < GW; c++) line.push(g[r][c] === '1' ? 1 : 0);
      if (gi < glyphs.length - 1) line.push(0);
    });
    grid.push(line);
  }
  return { grid, rows: GH, cols };
}

let _trCanvas = null;
// Rasterize arbitrary text (incl. Japanese) into a grid roughly `height` rows tall.
function rasterGrid(str, height) {
  const h = Math.max(7, height | 0);
  if (!_trCanvas) _trCanvas = document.createElement('canvas');
  const ctx = _trCanvas.getContext('2d');
  const font = `600 ${h}px "Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif`;
  ctx.font = font;
  const w = Math.max(1, Math.ceil(ctx.measureText(str).width) + 2);
  const ch = Math.ceil(h * 1.32);
  _trCanvas.width = w; _trCanvas.height = ch;
  const c2 = _trCanvas.getContext('2d');
  c2.clearRect(0, 0, w, ch);
  c2.fillStyle = '#fff'; c2.textBaseline = 'top'; c2.font = font;
  c2.fillText(str, 1, Math.floor(h * 0.12));
  const data = c2.getImageData(0, 0, w, ch).data;
  let grid = [];
  for (let y = 0; y < ch; y++) {
    const line = [];
    for (let x = 0; x < w; x++) line.push(data[(y * w + x) * 4 + 3] > 90 ? 1 : 0);
    grid.push(line);
  }
  return trim({ grid, rows: ch, cols: w });
}

// drop fully-empty border rows/cols so the glyph block sits flush (keeps interior spacing)
function trim(g) {
  let top = 0, bot = g.rows - 1, left = 0, right = g.cols - 1;
  const rowEmpty = (r) => g.grid[r].every((v) => !v);
  const colEmpty = (c) => g.grid.every((row) => !row[c]);
  while (top < bot && rowEmpty(top)) top++;
  while (bot > top && rowEmpty(bot)) bot--;
  while (left < right && colEmpty(left)) left++;
  while (right > left && colEmpty(right)) right--;
  const grid = [];
  for (let r = top; r <= bot; r++) grid.push(g.grid[r].slice(left, right + 1));
  return { grid, rows: grid.length, cols: grid[0] ? grid[0].length : 1 };
}

/**
 * textGrid(str, opts) → { grid:number[][], rows, cols }
 *   opts.mode: 'auto' (default) | 'ascii' | 'raster'
 *   opts.height: target rows for rasterized (non-ASCII) text (default 9)
 */
export function textGrid(str, opts = {}) {
  const mode = opts.mode || 'auto';
  const height = opts.height || 9;
  const key = mode + '|' + height + '|' + str;
  if (_cache.has(key)) return _cache.get(key);
  let out;
  if (mode === 'ascii' || (mode === 'auto' && inBuiltin(str))) out = builtinGrid(str);
  else out = rasterGrid(str, height);
  if (_cache.size > 256) _cache.clear();
  _cache.set(key, out);
  return out;
}

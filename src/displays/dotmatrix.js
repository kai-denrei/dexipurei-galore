// dotmatrix.js — Dot-Matrix LED (emissive). The canonical contract example.
// Ported from the standalone reference: round emissive LEDs on a dark grid, hot white core, additive
// halo bloom, per-pixel variance, weak/dead dots, flicker, vignette. Generalized to (a) fit the shared
// stage instead of resizing the canvas, and (b) render ANY unicode via the text rasterizer (日本語/emoji).

import { stageSize } from '../core/contract.js';
import { textGrid } from '../core/text-raster.js';
import { bloom, vignette } from '../core/fx.js';
import { hex2rgb, mix, rgba } from '../core/color.js';

const PAD = 1; // border in cells

export default {
  id: 'dotmatrix',
  name: 'Dot-Matrix LED',
  category: 'emissive',
  physics: 'Round emissive LEDs on a dark grid; hot white core + additive halo bloom; per-pixel variance, weak/dying dots, sparse flicker.',
  USES: ['textGrid', 'bloom', 'vignette', 'hex2rgb', 'mix', 'rgba'],
  params: [
    { key: 'text', label: 'text', type: 'text', max: 24, default: 'ドットMATRIX', group: 'content' },
    { key: 'source', label: 'source', type: 'select', options: ['text', 'clock'], default: 'text', group: 'content' },
    { key: 'fill', label: 'dot fill', type: 'range', min: 20, max: 62, step: 1, default: 44, group: 'geometry' },
    { key: 'square', label: 'square pixels', type: 'toggle', default: false, group: 'geometry' },
    { key: 'rasterH', label: 'kanji grid', type: 'range', min: 7, max: 44, step: 1, default: 32, group: 'geometry' },
    { key: 'color', label: 'LED color', type: 'color', default: '#dfe9ff', group: 'color' },
    { key: 'bg', label: 'background', type: 'color', default: '#070708', group: 'color' },
    { key: 'coreWhite', label: 'whiteness', type: 'range', min: 0, max: 100, step: 1, default: 78, group: 'hot core' },
    { key: 'coreSize', label: 'core size', type: 'range', min: 0, max: 80, step: 1, default: 42, group: 'hot core' },
    { key: 'coreInt', label: 'intensity', type: 'range', min: 0, max: 100, step: 1, default: 85, group: 'hot core' },
    { key: 'bloomBlur', label: 'spread', type: 'range', min: 0, max: 40, step: 1, default: 14, group: 'halo' },
    { key: 'bloomInt', label: 'intensity', type: 'range', min: 0, max: 100, step: 1, default: 55, group: 'halo' },
    { key: 'offGrid', label: 'off-dot grid', type: 'range', min: 0, max: 100, step: 1, default: 22, group: 'lived-in' },
    { key: 'variance', label: 'dot variance', type: 'range', min: 0, max: 100, step: 1, default: 30, group: 'lived-in' },
    { key: 'dead', label: 'weak dots', type: 'range', min: 0, max: 30, step: 1, default: 5, group: 'lived-in' },
    { key: 'flicker', label: 'flicker', type: 'range', min: 0, max: 100, step: 1, default: 18, group: 'lived-in' },
    { key: 'vignette', label: 'vignette', type: 'range', min: 0, max: 100, step: 1, default: 45, group: 'lived-in' },
  ],
  presets: {
    Macro: { color: '#e6edff', bg: '#070708', fill: 46, coreWhite: 84, coreSize: 48, coreInt: 90, bloomBlur: 16, bloomInt: 62, offGrid: 24, variance: 34, dead: 6, flicker: 16, vignette: 52, square: false },
    Clean: { color: '#dfe9ff', bg: '#05060a', fill: 42, coreWhite: 60, coreSize: 34, coreInt: 70, bloomBlur: 8, bloomInt: 34, offGrid: 8, variance: 8, dead: 0, flicker: 0, vignette: 20, square: false },
    Alarm: { color: '#ff3b30', bg: '#0a0303', fill: 48, coreWhite: 30, coreSize: 30, coreInt: 80, bloomBlur: 18, bloomInt: 70, offGrid: 14, variance: 18, dead: 2, flicker: 8, vignette: 55, square: false },
    Depot: { color: '#ffb000', bg: '#080602', fill: 50, coreWhite: 25, coreSize: 26, coreInt: 65, bloomBlur: 12, bloomInt: 50, offGrid: 30, variance: 40, dead: 9, flicker: 22, vignette: 48, square: true },
  },

  render(ctx, p, t, rng) {
    const { w, h } = stageSize(ctx);
    let str = p.text || ' ';
    if (p.source === 'clock') {
      const d = new Date(), z = (n) => String(n).padStart(2, '0');
      str = z(d.getHours()) + ':' + z(d.getMinutes());
    }
    const { grid, rows, cols } = textGrid(str, { height: p.rasterH });   // higher → finer kanji
    const tCols = cols + PAD * 2, tRows = rows + PAD * 2;
    const cell = Math.max(2, Math.min((w * 0.94) / tCols, (h * 0.9) / tRows));
    const matW = tCols * cell, matH = tRows * cell;
    const ox = (w - matW) / 2, oy = (h - matH) / 2;

    const ledC = hex2rgb(p.color), coreC = mix(ledC, [255, 255, 255], p.coreWhite / 100), bgC = hex2rgb(p.bg);
    if (!p.transparent) { ctx.fillStyle = rgba(bgC, 1); ctx.fillRect(0, 0, w, h); }

    const R = cell * (p.fill / 100);
    const offA = p.offGrid / 100, varA = p.variance / 100, deadP = p.dead / 100, flick = p.flicker / 100, square = p.square;

    const dot = (g, cx, cy, rad) => {
      if (square) g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      else { g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill(); }
    };

    const lit = [];
    for (let r = 0; r < tRows; r++) {
      for (let c = 0; c < tCols; c++) {
        const cx = ox + c * cell + cell / 2, cy = oy + r * cell + cell / 2;
        const gr = r - PAD, gc = c - PAD;
        const on = gr >= 0 && gr < rows && gc >= 0 && gc < cols && grid[gr][gc] === 1;
        if (!on) {
          if (offA > 0) {
            const j = 1 - varA * 0.6 * rng.hash(c, r);
            ctx.fillStyle = rgba(mix(bgC, ledC, 0.18 + 0.1 * rng.hash(c + 3, r + 5)), offA * 0.5 * j);
            dot(ctx, cx, cy, R * 0.62);
          }
          continue;
        }
        let bright = 1 - varA * rng.hash(c + 11, r + 7);
        if (rng.hash(c + 31, r + 17) < deadP) bright *= 0.28;
        if (flick > 0) {
          const fph = rng.hash(c + 99, r + 44);
          if (fph < flick * 0.5) bright *= 0.78 + 0.22 * Math.sin(t * 0.012 + fph * 60);
        }
        bright = Math.max(0.08, bright);
        ctx.fillStyle = rgba(ledC, 0.9 * bright);
        dot(ctx, cx, cy, R);
        if (p.coreInt > 0 && p.coreSize > 0) {
          const cr = R * (p.coreSize / 100) * 1.15;
          const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(cr, 0.5));
          g1.addColorStop(0, rgba(coreC, (p.coreInt / 100) * bright));
          g1.addColorStop(1, rgba(coreC, 0));
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g1;
          ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        lit.push([cx, cy, bright]);
      }
    }

    const glowC = mix(ledC, coreC, 0.4);
    bloom(ctx, (g) => {
      for (let i = 0; i < lit.length; i++) { g.fillStyle = rgba(glowC, 0.95 * lit[i][2]); dot(g, lit[i][0], lit[i][1], R); }
    }, p.bloomBlur, p.bloomInt / 100);

    vignette(ctx, w, h, p.vignette / 100);
  },
};

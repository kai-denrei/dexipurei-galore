// vfd.js — Vacuum Fluorescent Display (emissive). HANDOVER §6.03.
// Phosphor anodes in a vacuum tube, excited by electrons boiled off hot filament wires and gated by a
// mesh grid → that unmistakable cyan-green ~505nm glow on deep blue-black. Two element forms share one
// module: 'segment' reuses the 7-seg hex-bar approach (uneven brightness, faint always-on OFF-segment
// "ghost", blue-white core); 'dot' rasterizes via textGrid into soft cyan-green dots with bloom. BOTH
// styles draw the characteristic faint horizontal heater-filament wires spanning the tube + a subtle
// gate-grid shimmer. Wear (via rng.hash): age-dimming, off-element ghost, filament-hum flicker keyed off t.

import { stageSize } from '../core/contract.js';
import { textGrid } from '../core/text-raster.js';
import { bloom, vignette } from '../core/fx.js';
import { hex2rgb, mix, rgba } from '../core/color.js';

// ── segment geometry (self-contained SEG map: digits + basic letters, VFD displayable) ──
const SEG_ALL = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const SEG_CHAR = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg',
  '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  'A': 'abcefg', 'B': 'cdefg', 'C': 'adef', 'D': 'bcdeg', 'E': 'adefg', 'F': 'aefg',
  'G': 'acdef', 'H': 'bcefg', 'I': 'bc', 'J': 'bcde', 'L': 'def', 'N': 'ceg',
  'O': 'abcdef', 'P': 'abefg', 'R': 'eg', 'S': 'acdfg', 'T': 'defg', 'U': 'bcdef',
  'Y': 'bcdfg', 'Z': 'abdeg', '-': 'g', '_': 'd', '°': 'abfg', ' ': '',
};

// endpoints of segment inside a w×h cell, bar thickness t
function segEnds(seg, w, h, t) {
  const ht = t / 2, hh = h / 2;
  switch (seg) {
    case 'a': return [t, ht, w - t, ht];
    case 'b': return [w - ht, t, w - ht, hh - ht];
    case 'c': return [w - ht, hh + ht, w - ht, h - t];
    case 'd': return [t, h - ht, w - t, h - ht];
    case 'e': return [ht, hh + ht, ht, h - t];
    case 'f': return [ht, t, ht, hh - ht];
    case 'g': return [t, hh, w - t, hh];
  }
  return [0, 0, 0, 0];
}
// elongated hex (rounded-tip bar) path between two points
function vhex(ctx, x1, y1, x2, y2, th) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 0.001) return;
  const ux = dx / len, uy = dy / len, px = -uy, py = ux, h = th / 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 + ux * h - px * h, y1 + uy * h - py * h);
  ctx.lineTo(x2 - ux * h - px * h, y2 - uy * h - py * h);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - ux * h + px * h, y2 - uy * h + py * h);
  ctx.lineTo(x1 + ux * h + px * h, y1 + uy * h + py * h);
  ctx.closePath();
}
const clockStr = () => { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return z(d.getHours()) + ':' + z(d.getMinutes()); };

// faint horizontal heater-filament wires + gate-grid shimmer drawn over the whole tube (both styles).
// Always faint, always-on; hum flickers in brightness keyed off t (real filaments shimmer at mains hum).
function drawFilaments(ctx, w, h, t, vis, phosC, rng) {
  if (vis <= 0) return;
  const n = Math.max(3, Math.round(h / 56));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const fy = h * (i + 0.5) / n + (rng.hash(i, 91) - 0.5) * 6;     // stable per-wire jitter
    const hum = 0.7 + 0.3 * Math.sin(t * 0.018 + i * 1.7 + rng.hash(i, 7) * 6.28); // mains-hum flicker
    const a = vis * 0.05 * hum;
    const g = ctx.createLinearGradient(0, fy, w, fy);
    g.addColorStop(0, rgba(phosC, 0)); g.addColorStop(0.5, rgba(phosC, a));
    g.addColorStop(1, rgba(phosC, a * 0.3));
    ctx.strokeStyle = g; ctx.lineWidth = 1; ctx.shadowColor = rgba(phosC, a); ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(w, fy); ctx.stroke();
  }
  ctx.shadowBlur = 0; ctx.restore();
}
// subtle gate-grid: vertical mesh shimmer, the wire grid that gates anodes on/off
function drawGrid(ctx, w, h, t, amt, phosC) {
  if (amt <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const gap = Math.max(10, w / 48), shimmer = 0.5 + 0.5 * Math.sin(t * 0.004);
  ctx.strokeStyle = rgba(phosC, amt * 0.02 * shimmer); ctx.lineWidth = 1;
  for (let x = 0; x < w; x += gap) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  ctx.restore();
}

export default {
  id: 'vfd',
  name: 'Vacuum Fluorescent',
  category: 'emissive',
  physics: 'Phosphor anodes in vacuum, excited by electrons boiled off hot filament wires and gated by a mesh grid → cyan-green ~505nm glow; faint heater wires cross the tube, OFF anodes keep a ghost glow.',
  USES: ['stageSize', 'textGrid', 'bloom', 'vignette', 'hex2rgb', 'mix', 'rgba'],
  params: [
    { key: 'text', label: 'text', type: 'text', max: 16, default: 'VFD-505', group: 'content' },
    { key: 'source', label: 'source', type: 'select', options: ['text', 'clock'], default: 'clock', group: 'content' },
    { key: 'style', label: 'element', type: 'select', options: ['segment', 'dot'], default: 'segment', group: 'content' },
    { key: 'color', label: 'phosphor', type: 'color', default: '#7dffd0', group: 'color' },
    { key: 'bg', label: 'background', type: 'color', default: '#020a10', group: 'color' },
    { key: 'glow', label: 'glow', type: 'range', min: 0, max: 40, step: 1, default: 18, group: 'glow' },
    { key: 'core', label: 'blue-white core', type: 'range', min: 0, max: 100, step: 1, default: 46, group: 'glow' },
    { key: 'filament', label: 'filament wires', type: 'range', min: 0, max: 100, step: 1, default: 45, group: 'tube' },
    { key: 'grid', label: 'gate-grid', type: 'range', min: 0, max: 100, step: 1, default: 30, group: 'tube' },
    { key: 'ghost', label: 'off-element ghost', type: 'range', min: 0, max: 30, step: 1, default: 9, group: 'wear' },
    { key: 'age', label: 'age dimming', type: 'range', min: 0, max: 100, step: 1, default: 22, group: 'wear' },
    { key: 'flicker', label: 'flicker', type: 'range', min: 0, max: 100, step: 1, default: 16, group: 'wear' },
    { key: 'vignette', label: 'vignette', type: 'range', min: 0, max: 100, step: 1, default: 40, group: 'wear' },
  ],
  presets: {
    Tube: { color: '#7dffd0', bg: '#020a10', style: 'segment', glow: 18, core: 46, filament: 45, grid: 30, ghost: 9, age: 22, flicker: 16, vignette: 40 },
    Player: { color: '#9affe0', bg: '#01080c', style: 'dot', glow: 22, core: 38, filament: 55, grid: 40, ghost: 7, age: 14, flicker: 12, vignette: 34 },
    Aged: { color: '#5fd9af', bg: '#03090d', style: 'segment', glow: 14, core: 30, filament: 70, grid: 50, ghost: 14, age: 58, flicker: 34, vignette: 52 },
    Pristine: { color: '#a8ffe6', bg: '#01060a', style: 'dot', glow: 12, core: 60, filament: 20, grid: 14, ghost: 2, age: 4, flicker: 4, vignette: 18 },
  },

  render(ctx, p, t, rng) {
    const { w, h } = stageSize(ctx);
    const phosC = hex2rgb(p.color), bgC = hex2rgb(p.bg);
    const coreC = mix(phosC, [190, 220, 255], p.core / 100);   // VFD core leans blue-white, not pure white
    if (!p.transparent) { ctx.fillStyle = rgba(bgC, 1); ctx.fillRect(0, 0, w, h); }

    // ambient phosphor wash so the whole tube reads faintly lit even where nothing's on
    const wash = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
    wash.addColorStop(0, rgba(phosC, 0.05)); wash.addColorStop(1, rgba(phosC, 0));
    if (!p.transparent) { ctx.fillStyle = wash; ctx.fillRect(0, 0, w, h); }

    drawFilaments(ctx, w, h, t, p.filament / 100, phosC, rng); // heater wires (behind the glyphs)

    const str = (p.source === 'clock' ? clockStr() : (p.text || ' '));
    const ageA = p.age / 100, ghostA = p.ghost / 100, flick = p.flicker / 100, coreA = p.core / 100;
    // global hum dim — VFDs lose phosphor efficiency with age and flicker on the hum
    const hum = 1 - flick * 0.12 * (0.5 + 0.5 * Math.sin(t * 0.02));
    const ageMul = 1 - ageA * 0.5;

    if (p.style === 'dot') {
      renderDot(ctx, w, h, t, p, str, phosC, coreC, { ageA, ghostA, flick, coreA, hum, ageMul }, rng);
    } else {
      renderSeg(ctx, w, h, t, p, str, phosC, coreC, { ageA, ghostA, flick, coreA, hum, ageMul }, rng);
    }

    drawGrid(ctx, w, h, t, p.grid / 100, phosC);
    vignette(ctx, w, h, p.vignette / 100);
  },
};

// ── 'dot' style: cyan-green dots/squares via textGrid + soft bloom ──
function renderDot(ctx, w, h, t, p, str, phosC, coreC, wear, rng) {
  const PAD = 1;
  const { grid, rows, cols } = textGrid(str, { height: 9 });
  const tCols = cols + PAD * 2, tRows = rows + PAD * 2;
  const cell = Math.max(2, Math.min((w * 0.9) / tCols, (h * 0.82) / tRows));
  const R = cell * 0.4, matW = tCols * cell, matH = tRows * cell;
  const ox = (w - matW) / 2, oy = (h - matH) / 2;
  const lit = [];
  for (let r = 0; r < tRows; r++) {
    for (let c = 0; c < tCols; c++) {
      const cx = ox + c * cell + cell / 2, cy = oy + r * cell + cell / 2;
      const gr = r - PAD, gc = c - PAD;
      const on = gr >= 0 && gr < rows && gc >= 0 && gc < cols && grid[gr][gc] === 1;
      if (!on) {
        if (wear.ghostA > 0) {  // off-anode ghost: every dot site glows faintly even unlit
          ctx.fillStyle = rgba(phosC, wear.ghostA * 0.45 * (0.7 + 0.3 * rng.hash(c, r)));
          ctx.beginPath(); ctx.arc(cx, cy, R * 0.6, 0, Math.PI * 2); ctx.fill();
        }
        continue;
      }
      let bright = (1 - wear.ageA * 0.55 * rng.hash(c + 11, r + 7)) * wear.ageMul * wear.hum;
      if (wear.flick > 0 && rng.hash(c + 99, r + 44) < wear.flick * 0.4)
        bright *= 0.8 + 0.2 * Math.sin(t * 0.014 + rng.hash(c, r) * 60);
      bright = Math.max(0.1, bright);
      ctx.fillStyle = rgba(phosC, 0.92 * bright);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      if (wear.coreA > 0) {
        ctx.fillStyle = rgba(coreC, wear.coreA * bright);
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      lit.push([cx, cy, bright]);
    }
  }
  bloom(ctx, (g) => {
    for (let i = 0; i < lit.length; i++) {
      g.fillStyle = rgba(phosC, 0.95 * lit[i][2]);
      g.beginPath(); g.arc(lit[i][0], lit[i][1], R, 0, Math.PI * 2); g.fill();
    }
  }, p.glow * 0.8, 0.6);
}

// ── 'segment' style: 7-seg hex bars, multi-pass glow, blue-white core, OFF-segment ghost ──
function renderSeg(ctx, w, h, t, p, str, phosC, coreC, wear, rng) {
  const tokens = [...String(str)].map((ch) => (ch === ' ' ? ' ' : ch.toUpperCase()));
  const n = tokens.length;
  const widths = tokens.map((c) => (c === ':' ? 0.42 : 1));
  const units = widths.reduce((a, b) => a + b, 0);
  const aspect = 1.62, pad = Math.min(w, h) * 0.16, gapFrac = 0.28;
  let dh = h - pad * 2, dw = dh / aspect, gp = dw * gapFrac;
  let tw = dw * units + gp * (n - 1);
  const maxW = w - pad * 2;
  if (tw > maxW) { const s = maxW / tw; dw *= s; dh *= s; gp = dw * gapFrac; tw = dw * units + gp * (n - 1); }
  const th = dw * 0.17;
  let x = (w - tw) / 2; const y = (h - dh) / 2;

  const drawSeg = (x1, y1, x2, y2, bright, on) => {
    if (!on) {  // OFF-segment ghost — the faint always-on phosphor of an idle anode
      if (wear.ghostA <= 0) return;
      ctx.shadowBlur = 0; ctx.globalAlpha = wear.ghostA; ctx.fillStyle = rgba(phosC, 1);
      vhex(ctx, x1, y1, x2, y2, th * 0.9); ctx.fill(); ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = rgba(phosC, 1); ctx.shadowColor = rgba(phosC, 1);
    vhex(ctx, x1, y1, x2, y2, th);
    ctx.globalAlpha = 0.5 * bright; ctx.shadowBlur = p.glow; ctx.fill();   // glow pass
    ctx.globalAlpha = Math.min(1, bright); ctx.shadowBlur = 0; ctx.fill(); // solid
    if (wear.coreA > 0) {  // blue-white hot core down the bar centre
      ctx.globalAlpha = Math.min(1, wear.coreA * bright); ctx.fillStyle = rgba(coreC, 1);
      vhex(ctx, x1, y1, x2, y2, th * 0.5); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  };

  for (let ti = 0; ti < n; ti++) {
    const ch = tokens[ti], cellW = dw * widths[ti];
    ctx.save(); ctx.translate(x, y);
    if (ch === ':') {
      const r = th * 0.7, cx = cellW / 2;
      for (const cy of [dh * 0.34, dh * 0.66]) {
        ctx.fillStyle = rgba(phosC, 1); ctx.shadowColor = rgba(phosC, 1); ctx.shadowBlur = p.glow;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = rgba(coreC, 1); ctx.globalAlpha = wear.coreA;
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
    } else {
      const on = SEG_CHAR[ch] != null ? SEG_CHAR[ch] : SEG_CHAR[' '];
      for (let i = 0; i < SEG_ALL.length; i++) {
        const seg = SEG_ALL[i];
        const [x1, y1, x2, y2] = segEnds(seg, cellW, dh, th);
        // uneven segment brightness: stable per-segment variance + age dimming + hum flicker
        let bright = (1 - wear.ageA * 0.5 * rng.hash(ti * 7 + i, 3)) * wear.ageMul * wear.hum;
        if (wear.flick > 0 && rng.hash(ti * 13 + i, 21) < wear.flick * 0.3)
          bright *= 0.82 + 0.18 * Math.sin(t * 0.012 + (ti * 7 + i));
        drawSeg(x1, y1, x2, y2, Math.max(0.14, bright), on.indexOf(seg) >= 0);
      }
    }
    ctx.restore();
    x += cellW + gp;
  }
  ctx.shadowBlur = 0;
}

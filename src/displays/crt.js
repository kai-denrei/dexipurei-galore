// crt.js — Cathode-Ray Tube (emissive). HANDOVER §6.09. An electron beam sweeps a phosphor-coated
// screen line by line; the lit phosphor blooms (halation) through the glass, a shadow-mask/aperture-grille
// quantizes it into an RGB triad, scanlines fall between sweep rows, and a faint rolling "refresh" bar
// scrolls vertically as the new frame outruns the persistence of the old. Default RASTER mode rasters the
// content via textGrid and paints each lit cell as a soft phosphor blob; VECTOR mode strokes the grid as
// thin glowing edges (oscilloscope feel). Curvature is approximated cheaply by insetting the content into a
// slightly scaled-down "screen" rect (no per-pixel warp). All wear (burn-in, flicker, geometry drift, dust)
// routes through rng.hash so a seed re-roll is stable; the roll/jitter animate off t.

import { stageSize } from '../core/contract.js';
import { textGrid } from '../core/text-raster.js';
import { bloom, scanlines, vignette, chromaticOffset } from '../core/fx.js';
import { hex2rgb, mix, rgba } from '../core/color.js';

const PAD = 1; // border in cells around the rasterized glyph block

// content string from text or live clock (Date allowed only for clock content)
function content(p) {
  if (p.source === 'clock') {
    const d = new Date(), z = (n) => String(n).padStart(2, '0');
    return z(d.getHours()) + ':' + z(d.getMinutes());
  }
  return (p.text || ' ').toString();
}

// draw the phosphor mask (color stripes / dots) tiled across the screen rect, multiplied over content.
// 'aperture-grille' = vertical RGB stripes; 'shadow-mask' = staggered RGB dot triads; 'rgb-triad' = aligned dots.
function phosphorMask(ctx, x0, y0, w, h, type, scale, strength) {
  if (strength <= 0) return;
  const s = Math.max(2, scale);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const cols = [[255, 60, 60], [60, 255, 80], [70, 110, 255]];
  if (type === 'aperture-grille') {
    const cw = s / 3;
    for (let x = 0; x < w; x += s) {
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = rgba(cols[k], strength);
        ctx.fillRect(x0 + x + k * cw, y0, cw, h);
      }
    }
    // thin black grille gaps every cell for the metal aperture between phosphor lines
    ctx.fillStyle = rgba([0, 0, 0], strength * 0.5);
    for (let x = 0; x < w; x += s) ctx.fillRect(x0 + x + s - 0.6, y0, 0.8, h);
  } else {
    const stagger = type === 'shadow-mask', r = s * 0.26, sy = s * 0.92;
    let row = 0;
    for (let y = 0; y < h; y += sy, row++) {
      const off = stagger && row % 2 ? s / 2 : 0;
      for (let x = -s; x < w; x += s) {
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = rgba(cols[k], strength);
          ctx.beginPath();
          ctx.arc(x0 + x + off + (k + 0.5) * (s / 3), y0 + y + sy / 2, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  ctx.restore();
}

export default {
  id: 'crt',
  name: 'Cathode-Ray Tube',
  category: 'emissive',
  physics: 'Electron beam exciting phosphor line-by-line behind glass: halation bloom, RGB shadow-mask/aperture-grille quantization, inter-row scanlines, a rolling refresh bar, barrel curvature, and burn-in/flicker/drift wear.',
  USES: ['stageSize', 'textGrid', 'bloom', 'scanlines', 'vignette', 'chromaticOffset', 'hex2rgb', 'mix', 'rgba'],
  params: [
    { key: 'text', label: 'text', type: 'text', max: 24, default: 'CRT 日本', group: 'content' },
    { key: 'source', label: 'source', type: 'select', options: ['text', 'clock'], default: 'text', group: 'content' },
    { key: 'mode', label: 'mode', type: 'select', options: ['raster', 'vector'], default: 'raster', group: 'content' },
    { key: 'rasterH', label: 'raster height', type: 'range', min: 7, max: 24, step: 1, default: 11, group: 'content' },
    { key: 'color', label: 'phosphor', type: 'color', default: '#7dffc4', group: 'color' },
    { key: 'bg', label: 'background', type: 'color', default: '#040806', group: 'color' },
    { key: 'persistence', label: 'persistence', type: 'range', min: 0, max: 100, step: 1, default: 40, group: 'beam' },
    { key: 'bloom', label: 'halation', type: 'range', min: 0, max: 100, step: 1, default: 60, group: 'beam' },
    { key: 'scanline', label: 'scanline strength', type: 'range', min: 0, max: 100, step: 1, default: 42, group: 'optics' },
    { key: 'mask', label: 'phosphor mask', type: 'select', options: ['aperture-grille', 'shadow-mask', 'rgb-triad'], default: 'aperture-grille', group: 'optics' },
    { key: 'maskScale', label: 'mask scale', type: 'range', min: 3, max: 16, step: 1, default: 6, group: 'optics' },
    { key: 'maskStrength', label: 'mask strength', type: 'range', min: 0, max: 100, step: 1, default: 34, group: 'optics' },
    { key: 'curvature', label: 'curvature', type: 'range', min: 0, max: 100, step: 1, default: 28, group: 'optics' },
    { key: 'chroma', label: 'chroma aberration', type: 'range', min: 0, max: 6, step: 0.2, default: 1.6, group: 'optics' },
    { key: 'rollSpeed', label: 'refresh roll', type: 'range', min: 0, max: 100, step: 1, default: 30, group: 'motion' },
    { key: 'rollStrength', label: 'roll strength', type: 'range', min: 0, max: 100, step: 1, default: 26, group: 'motion' },
    { key: 'jitter', label: 'h-jitter', type: 'range', min: 0, max: 100, step: 1, default: 18, group: 'motion' },
    { key: 'flicker', label: 'flicker', type: 'range', min: 0, max: 100, step: 1, default: 14, group: 'wear' },
    { key: 'burnin', label: 'burn-in', type: 'range', min: 0, max: 100, step: 1, default: 16, group: 'wear' },
    { key: 'drift', label: 'geometry drift', type: 'range', min: 0, max: 100, step: 1, default: 20, group: 'wear' },
    { key: 'dust', label: 'dust on glass', type: 'range', min: 0, max: 100, step: 1, default: 22, group: 'wear' },
    { key: 'vignette', label: 'vignette', type: 'range', min: 0, max: 100, step: 1, default: 52, group: 'wear' },
  ],
  presets: {
    'P1 Green': { color: '#7dffc4', bg: '#040806', mode: 'raster', persistence: 40, bloom: 60, scanline: 42, mask: 'aperture-grille', maskScale: 6, maskStrength: 34, curvature: 28, chroma: 1.6, rollSpeed: 30, rollStrength: 26, jitter: 18, flicker: 14, burnin: 16, drift: 20, dust: 22, vignette: 52 },
    'Mono White': { color: '#eaf2ff', bg: '#05060a', mode: 'raster', persistence: 30, bloom: 48, scanline: 36, mask: 'shadow-mask', maskScale: 7, maskStrength: 28, curvature: 22, chroma: 1.2, rollSpeed: 18, rollStrength: 16, jitter: 10, flicker: 8, burnin: 8, drift: 12, dust: 14, vignette: 44 },
    'Tired Trinitron': { color: '#9affb0', bg: '#050805', mode: 'raster', persistence: 58, bloom: 78, scanline: 56, mask: 'aperture-grille', maskScale: 5, maskStrength: 46, curvature: 40, chroma: 3.0, rollSpeed: 52, rollStrength: 44, jitter: 38, flicker: 30, burnin: 44, drift: 40, dust: 40, vignette: 64 },
    'Vector Scope': { color: '#8effd0', bg: '#020604', mode: 'vector', persistence: 70, bloom: 70, scanline: 14, mask: 'rgb-triad', maskScale: 8, maskStrength: 18, curvature: 30, chroma: 1.0, rollSpeed: 0, rollStrength: 0, jitter: 6, flicker: 10, burnin: 10, drift: 14, dust: 18, vignette: 50 },
  },

  render(ctx, p, t, rng) {
    const { w, h } = stageSize(ctx);
    const phos = hex2rgb(p.color), bg = hex2rgb(p.bg);
    const hot = mix(phos, [255, 255, 255], 0.55);
    if (!p.transparent) { ctx.fillStyle = rgba(bg, 1); ctx.fillRect(0, 0, w, h); }

    // ---- screen rect: barrel curvature approximated by insetting the active area into a scaled "tube face"
    const curv = (p.curvature / 100);
    const inset = Math.min(w, h) * 0.04 * (0.4 + curv);           // edges pull inward as curvature rises
    const sx = inset, sy = inset, sw = w - inset * 2, sh = h - inset * 2;

    // dark glass wash inside the screen rect (NOT full-canvas → still guard for transparent export)
    if (!p.transparent) {
      const gl = ctx.createRadialGradient(w / 2, h / 2, Math.min(sw, sh) * 0.2, w / 2, h / 2, Math.max(sw, sh) * 0.66);
      gl.addColorStop(0, rgba(mix(bg, phos, 0.04), 1));
      gl.addColorStop(1, rgba(bg, 1));
      ctx.fillStyle = gl; ctx.fillRect(sx, sy, sw, sh);
    }

    // ---- content grid (any unicode via the rasterizer → 0/1 cells)
    const str = content(p);
    const { grid, rows, cols } = textGrid(str, { height: p.rasterH });
    const tCols = cols + PAD * 2, tRows = rows + PAD * 2;
    // curvature also slightly shrinks the content so it lives within the curved face
    const fit = 1 - curv * 0.06;
    const cell = Math.max(2, Math.min((sw * 0.9 * fit) / tCols, (sh * 0.82 * fit) / tRows));
    const matW = tCols * cell, matH = tRows * cell;

    // ---- per-frame geometry: a slow drift (stable per seed) + tiny live horizontal jitter
    const driftX = (rng.hash(7, 3) - 0.5) * (p.drift / 100) * cell * 1.2;
    const driftY = (rng.hash(9, 5) - 0.5) * (p.drift / 100) * cell * 1.0;
    const jit = (p.jitter / 100) * cell * 0.5 * Math.sin(t * 0.05 + rng.hash(2, 8) * 6.28);
    const ox = sx + (sw - matW) / 2 + driftX + jit, oy = sy + (sh - matH) / 2 + driftY;

    const persist = 0.35 + 0.6 * (p.persistence / 100);          // beam brightness / phosphor stay
    const flick = p.flicker / 100, burn = p.burnin / 100, vector = p.mode === 'vector';
    const beamR = cell * (vector ? 0.18 : 0.62);

    // global brightness flicker (mains hum) — animates off t, gated by flicker amount
    let frame = 1;
    if (flick > 0) frame = 1 - flick * 0.12 * (0.5 + 0.5 * Math.sin(t * 0.04));

    // soft phosphor blob for one lit cell
    const blob = (g, cx, cy, rad, a, c) => {
      const gd = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rad, 0.5));
      gd.addColorStop(0, rgba(c, a));
      gd.addColorStop(0.6, rgba(c, a * 0.5));
      gd.addColorStop(1, rgba(c, 0));
      g.fillStyle = gd; g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
    };

    // ---- burn-in ghost: a faint, permanently-lit copy of the content baked into the phosphor (stable per seed)
    if (burn > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== 1) continue;
        const cx = ox + (c + PAD) * cell + cell / 2, cy = oy + (r + PAD) * cell + cell / 2;
        const wear = 0.5 + 0.5 * rng.hash(c + 50, r + 70);       // uneven scorch
        ctx.fillStyle = rgba(mix(phos, bg, 0.4), burn * 0.10 * wear);
        ctx.fillRect(cx - cell * 0.45, cy - cell * 0.45, cell * 0.9, cell * 0.9);
      }
      ctx.restore();
    }

    // ---- live raster: paint the beam-excited phosphor, collect lit points for the halation bloom
    const lit = [];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (vector) { ctx.lineWidth = Math.max(1, cell * 0.16); ctx.lineCap = 'round'; ctx.strokeStyle = rgba(phos, persist); }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== 1) continue;
        const cx = ox + (c + PAD) * cell + cell / 2, cy = oy + (r + PAD) * cell + cell / 2;
        // per-cell variance + sparse flicker (stable hash for who flickers, t for the shimmer)
        let b = persist * (0.85 + 0.15 * rng.hash(c + 11, r + 7)) * frame;
        if (flick > 0 && rng.hash(c + 99, r + 44) < flick * 0.4) b *= 0.7 + 0.3 * Math.sin(t * 0.02 + r);
        b = Math.max(0.08, b);
        if (vector) {
          // stroke an edge toward the next lit neighbor on the row → thin glowing trace
          if (c + 1 < cols && grid[r][c + 1] === 1) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + cell, cy); ctx.stroke(); }
          if (r + 1 < rows && grid[r + 1][c] === 1) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + cell); ctx.stroke(); }
          blob(ctx, cx, cy, beamR * 1.6, b * 0.7, phos);
        } else {
          blob(ctx, cx, cy, beamR, b, phos);
          blob(ctx, cx, cy, beamR * 0.42, Math.min(1, b * 1.3), hot);  // hot beam core
        }
        lit.push([cx, cy, b]);
      }
    }
    ctx.restore();

    // ---- halation: one soft additive bloom of all lit phosphor (the glow through the glass)
    bloom(ctx, (g) => {
      for (let i = 0; i < lit.length; i++) { g.fillStyle = rgba(phos, 0.85 * lit[i][2]); g.beginPath(); g.arc(lit[i][0], lit[i][1], beamR * 1.2, 0, Math.PI * 2); g.fill(); }
    }, 4 + (p.bloom / 100) * 16, (p.bloom / 100) * 0.9);

    // ---- phosphor mask: RGB stripes/dots multiplied over the screen rect only
    phosphorMask(ctx, sx, sy, sw, sh, p.mask, p.maskScale, p.maskStrength / 100);

    // ---- inter-row scanlines (shared fx; self-suppresses in transparent export)
    if (p.scanline > 0) {
      const gap = Math.max(2, Math.round(cell * 0.5));
      scanlines(ctx, w, h, { gap, alpha: (p.scanline / 100) * 0.28 });
    }

    // ---- rolling refresh bar: a soft vertical band scrolling up the screen as t advances
    if (p.rollSpeed > 0 && p.rollStrength > 0 && !p.transparent) {
      const speed = (p.rollSpeed / 100) * 0.4;
      const bandY = sy + ((1 - ((t * speed) % 1000) / 1000) * sh) % sh;
      const bh = sh * 0.16;
      const rg = ctx.createLinearGradient(0, bandY - bh, 0, bandY + bh);
      const a = (p.rollStrength / 100) * 0.16;
      rg.addColorStop(0, rgba(phos, 0));
      rg.addColorStop(0.5, rgba(mix(phos, [255, 255, 255], 0.5), a));
      rg.addColorStop(1, rgba(phos, 0));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rg; ctx.fillRect(sx, bandY - bh, sw, bh * 2); ctx.restore();
    }

    // ---- dust/specks on the glass (stable per seed) — faint static motes near the surface
    if (p.dust > 0) {
      ctx.save();
      const n = Math.floor((p.dust / 100) * 80);
      for (let i = 0; i < n; i++) {
        const dx = sx + rng.hash(i + 200, 1) * sw, dy = sy + rng.hash(i + 200, 2) * sh;
        const a = 0.06 + 0.14 * rng.hash(i + 200, 3);
        ctx.fillStyle = rgba(rng.hash(i + 200, 4) > 0.7 ? [255, 255, 255] : bg, a * (p.dust / 100));
        const rr = 0.5 + rng.hash(i + 200, 5) * 1.4;
        ctx.beginPath(); ctx.arc(dx, dy, rr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // ---- edge chromatic aberration + vignette (both shared fx; chroma is additive so it keeps alpha)
    if (p.chroma > 0) chromaticOffset(ctx, w, h, p.chroma);
    vignette(ctx, w, h, p.vignette / 100);
  },
};

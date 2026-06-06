// fog.js — Fog projection (aerial). HANDOVER §6.12. An image thrown onto a thin, drifting mist curtain:
// soft, low-contrast, rippling, intermittently dropping out where the mist thins. Content is built from
// textGrid → soft glyph blobs, then modulated by ANIMATED volumetric noise (cheap value/flow noise defined
// in-file, evolving with t): the noise WARPS each sample slightly and MODULATES its opacity so the image
// breathes and tears. A light-scatter halo (bloom) sells the airborne glow; a faint projection cone (a
// subtle trapezoid of light) anchors the source. Wear (rng.hash + t): turbulence drift, density flicker,
// dropout amount, chromatic scatter, ambient haze — all reproducible under a seed re-roll.

import { stageSize } from '../core/contract.js';
import { textGrid } from '../core/text-raster.js';
import { bloom, vignette } from '../core/fx.js';
import { hex2rgb, mix, rgba } from '../core/color.js';

const PAD = 2; // soft margin in cells so warped blobs never clip the stage edge

// --- in-file value noise -----------------------------------------------------------------------------
// Cheap deterministic 2D hash → [0,1). Same as rng.hash math but free-standing so the offline export
// (which inlines this file as a global) doesn't depend on rng for the texture itself.
function vhash(x, y) {
  let n = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
// smooth (bilinear, smoothstep-eased) value noise sampled at floating (x,y) on an integer lattice.
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);     // smoothstep ease
  const a = vhash(xi, yi), b = vhash(xi + 1, yi);
  const c = vhash(xi, yi + 1), d = vhash(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
// two-octave flow noise that drifts with time t. scale = lattice frequency, sp = drift speed.
// Returns ~[0,1]; the two octaves are sheared in opposite directions so it reads as curling mist.
function flow(x, y, t, scale, sp) {
  const t1 = t * 0.001 * sp, t2 = t * 0.0013 * sp;
  const n1 = vnoise(x * scale + t1, y * scale - t1 * 0.6);
  const n2 = vnoise(x * scale * 2.1 - t2 * 0.7, y * scale * 2.1 + t2);
  return n1 * 0.65 + n2 * 0.35;
}

// content string from text or live clock
function content(p) {
  if (p.source === 'clock') {
    const d = new Date(), z = (n) => String(n).padStart(2, '0');
    return z(d.getHours()) + ':' + z(d.getMinutes());
  }
  return (p.text || ' ').toString();
}

export default {
  id: 'fog',
  name: 'Fog Projection',
  category: 'aerial',
  physics: 'Image cast onto a drifting mist curtain: light scatters off suspended droplets, so the picture is soft and low-contrast, warps with turbulence, and drops out where the fog thins. A weak projection cone marks the beam.',
  USES: ['stageSize', 'textGrid', 'bloom', 'vignette', 'hex2rgb', 'mix', 'rgba'],
  params: [
    { key: 'text', label: 'text', type: 'text', max: 24, default: 'MIST 霧', group: 'content' },
    { key: 'source', label: 'source', type: 'select', options: ['text', 'clock'], default: 'text', group: 'content' },
    { key: 'rasterH', label: 'kanji grid', type: 'range', min: 7, max: 22, step: 1, default: 11, group: 'content' },
    { key: 'color', label: 'light', type: 'color', default: '#aecbe6', group: 'color' },
    { key: 'bg', label: 'background', type: 'color', default: '#05070b', group: 'color' },
    { key: 'density', label: 'fog density', type: 'range', min: 0, max: 100, step: 1, default: 62, group: 'fog' },
    { key: 'haze', label: 'ambient haze', type: 'range', min: 0, max: 100, step: 1, default: 30, group: 'fog' },
    { key: 'turbSpeed', label: 'turbulence speed', type: 'range', min: 0, max: 100, step: 1, default: 40, group: 'turbulence' },
    { key: 'turbScale', label: 'turbulence scale', type: 'range', min: 5, max: 80, step: 1, default: 32, group: 'turbulence' },
    { key: 'warp', label: 'warp amount', type: 'range', min: 0, max: 100, step: 1, default: 40, group: 'turbulence' },
    { key: 'dropout', label: 'dropout amount', type: 'range', min: 0, max: 100, step: 1, default: 46, group: 'turbulence' },
    { key: 'glow', label: 'scatter / glow', type: 'range', min: 0, max: 100, step: 1, default: 64, group: 'scatter' },
    { key: 'chroma', label: 'chromatic scatter', type: 'range', min: 0, max: 100, step: 1, default: 26, group: 'scatter' },
    { key: 'cone', label: 'cone visibility', type: 'range', min: 0, max: 100, step: 1, default: 34, group: 'scatter' },
    { key: 'vignette', label: 'vignette', type: 'range', min: 0, max: 100, step: 1, default: 48, group: 'scatter' },
  ],
  presets: {
    'Cool Mist': { color: '#aecbe6', bg: '#05070b', density: 62, haze: 30, turbSpeed: 40, turbScale: 32, warp: 40, dropout: 46, glow: 64, chroma: 26, cone: 34, vignette: 48 },
    'Thin Veil': { color: '#cfe0ee', bg: '#04050a', density: 40, haze: 16, turbSpeed: 28, turbScale: 24, warp: 24, dropout: 26, glow: 48, chroma: 14, cone: 22, vignette: 32 },
    'Heavy Steam': { color: '#9fd4d0', bg: '#03080a', density: 86, haze: 54, turbSpeed: 64, turbScale: 46, warp: 64, dropout: 70, glow: 80, chroma: 40, cone: 50, vignette: 60 },
    'Séance': { color: '#c8b6e8', bg: '#070510', density: 70, haze: 40, turbSpeed: 22, turbScale: 38, warp: 52, dropout: 58, glow: 72, chroma: 48, cone: 44, vignette: 56 },
  },

  render(ctx, p, t, rng) {
    const { w, h } = stageSize(ctx);
    const lightC = hex2rgb(p.color), bgC = hex2rgb(p.bg);
    if (!p.transparent) { ctx.fillStyle = rgba(bgC, 1); ctx.fillRect(0, 0, w, h); }

    // fit the content grid into the stage (generous PAD so warped blobs stay inside)
    const { grid, rows, cols } = textGrid(content(p), { height: p.rasterH });
    const tCols = cols + PAD * 2, tRows = rows + PAD * 2;
    const cell = Math.max(2, Math.min((w * 0.82) / tCols, (h * 0.74) / tRows));
    const matW = cols * cell, matH = rows * cell;
    const ox = (w - matW) / 2, oy = (h - matH) / 2;

    const dens = p.density / 100, hazeA = p.haze / 100, warpA = p.warp / 100;
    const dropA = p.dropout / 100, sp = p.turbSpeed / 100, scale = 0.02 + (p.turbScale / 100) * 0.06;
    const chromaPx = (p.chroma / 100) * cell * 0.5;
    // a per-seed turbulence origin so a re-roll shifts the whole mist field deterministically.
    const sx = rng.hash(7, 3) * 1000, sy = rng.hash(11, 5) * 1000;

    // 0) faint projection cone — a subtle trapezoid of light fanning down to the curtain. This is a
    //    localized (non-full-canvas) wash, but guard it anyway so the transparent PNG stays clean.
    if (p.cone > 0 && !p.transparent) {
      const coneA = (p.cone / 100) * 0.22;
      const apex = [w / 2, oy - cell * 1.5], hw = matW * 0.62;
      const g = ctx.createLinearGradient(0, apex[1], 0, oy + matH);
      g.addColorStop(0, rgba(lightC, coneA));
      g.addColorStop(1, rgba(lightC, 0));
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(apex[0] - hw * 0.18, apex[1]); ctx.lineTo(apex[0] + hw * 0.18, apex[1]);
      ctx.lineTo(w / 2 + hw, oy + matH); ctx.lineTo(w / 2 - hw, oy + matH);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }

    // 1) lay down the projected image: each lit cell becomes a soft blob whose position is WARPED by the
    //    flow field and whose opacity is MODULATED by it (thin mist → drop out). Collect blobs for bloom.
    const blobs = [];
    const r0 = cell * 0.62;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let gr = 0; gr < rows; gr++) {
      for (let gc = 0; gc < cols; gc++) {
        if (grid[gr][gc] !== 1) continue;
        const bx = ox + gc * cell + cell / 2, by = oy + gr * cell + cell / 2;

        // flow sample drives both warp and opacity; centered ~0 for warp, raw for density.
        const f = flow(bx + sx, by + sy, t, scale, sp);
        const fx2 = flow(bx + sx + 91, by + sy - 37, t, scale, sp);
        const wx = (f - 0.5) * warpA * cell * 2.2;
        const wy = (fx2 - 0.5) * warpA * cell * 2.2;
        const cx = bx + wx, cy = by + wy;

        // mist thickness here: where flow is low the curtain thins and the image tears away.
        const thin = Math.max(0, f - dropA * (0.55 + 0.45 * vhash(gc, gr)));
        // per-cell density flicker (stable per seed × slow temporal beat) so the image breathes.
        const fl = 0.7 + 0.3 * Math.sin(t * 0.0016 + rng.hash(gc + 3, gr + 9) * 6.28);
        let a = dens * thin * fl * (0.55 + 0.45 * f);
        if (a <= 0.012) continue;                                  // dropped out — skip entirely
        a = Math.min(0.85, a);

        const rad = r0 * (0.85 + 0.4 * f);
        // soft radial blob (no hard edge — it's airborne light, not a pixel)
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        rg.addColorStop(0, rgba(lightC, a));
        rg.addColorStop(0.6, rgba(lightC, a * 0.4));
        rg.addColorStop(1, rgba(lightC, 0));
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();

        // chromatic scatter: split a faint cool/warm pair sideways (droplet dispersion).
        if (chromaPx > 0.2) {
          for (const [dx, tint] of [[-chromaPx, [120, 150, 255]], [chromaPx, [255, 150, 130]]]) {
            const cg = ctx.createRadialGradient(cx + dx, cy, 0, cx + dx, cy, rad * 0.9);
            cg.addColorStop(0, rgba(tint, a * 0.18));
            cg.addColorStop(1, rgba(tint, 0));
            ctx.fillStyle = cg;
            ctx.beginPath(); ctx.arc(cx + dx, cy, rad * 0.9, 0, Math.PI * 2); ctx.fill();
          }
        }
        blobs.push([cx, cy, rad, a]);
      }
    }
    ctx.restore();

    // 2) light-scatter halo — one soft additive bloom over every surviving blob (the airborne glow).
    bloom(ctx, (g) => {
      for (let i = 0; i < blobs.length; i++) {
        const [cx, cy, rad, a] = blobs[i];
        const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad * 1.4);
        rg.addColorStop(0, rgba(lightC, a * 0.9));
        rg.addColorStop(1, rgba(lightC, 0));
        g.fillStyle = rg;
        g.beginPath(); g.arc(cx, cy, rad * 1.4, 0, Math.PI * 2); g.fill();
      }
    }, cell * (0.3 + (p.glow / 100) * 0.9), (p.glow / 100) * 0.8);

    // 3) ambient haze — a thin field of drifting fog lit by spill light, densest near the content. This
    //    is a localized additive wash (not an opaque full-canvas fill), but guard it for the PNG export.
    if (hazeA > 0 && !p.transparent) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const step = Math.max(10, cell * 0.9);
      for (let y = oy - matH * 0.3; y < oy + matH * 1.3; y += step) {
        for (let x = ox - matW * 0.3; x < ox + matW * 1.3; x += step) {
          const f = flow(x + sx, y + sy, t, scale * 0.7, sp * 0.8);
          const a = hazeA * f * f * 0.05;
          if (a <= 0.004) continue;
          ctx.fillStyle = rgba(mix(bgC, lightC, 0.5), a);
          ctx.beginPath(); ctx.arc(x, y, step * 1.1, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }

    vignette(ctx, w, h, p.vignette / 100);
  },
};

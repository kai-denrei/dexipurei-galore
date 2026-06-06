// eink.js — Electronic Paper / E-ink (reflective, bistable). HANDOVER §6.10. The NON-emissive reference:
// a deliberate matte counterpoint to every glowing module. Electrophoretic display — charged white & black
// pigment in microcapsules float to the surface under a field and STAY there with no power (bistable). It
// emits nothing; you read it by ambient light off a greyish paper-white substrate. So: LIGHT background,
// high-contrast DARK content, zero glow, zero bloom. Signature t-driven artifacts: the periodic FULL-REFRESH
// FLASH (the panel briefly inverts to solid black then redraws, clearing residue) and PARTIAL-REFRESH
// GHOSTING (a faint grey residue of the previous frame's content left behind between full refreshes). Wear
// (rng.hash): residue buildup, microcapsule grain, slightly-off white, edge-contrast falloff, dead grey blobs.

import { stageSize } from '../core/contract.js';
import { textGrid } from '../core/text-raster.js';
import { ambientGradient } from '../core/fx.js';
import { hex2rgb, mix, rgba } from '../core/color.js';
import { grain } from '../core/wear.js';

const PAD = 1; // quiet border in grid cells

// the panel cycles through a small content sequence; which frame is shown is derived from t (pure).
const SEQ = ['HELLO', '日本', 'E-INK', '電子'];

// content for the current update cycle + the index of the previous one (for ghosting).
function frames(p, t) {
  if (p.source === 'clock') {
    const d = new Date(), z = (n) => String(n).padStart(2, '0');
    const now = z(d.getHours()) + ':' + z(d.getMinutes());
    // previous minute string for the residual ghost
    const prevD = new Date(d.getTime() - 60000);
    return { cur: now, prev: z(prevD.getHours()) + ':' + z(prevD.getMinutes()), phase: (t % (p.updateMs || 1)) / (p.updateMs || 1) };
  }
  const ms = Math.max(200, p.updateMs);
  const i = Math.floor(t / ms);
  const items = (p.text && p.text.length) ? p.text.split('|') : SEQ;
  const n = items.length;
  return { cur: items[i % n] || ' ', prev: items[(i - 1 + n) % n] || ' ', phase: (t % ms) / ms };
}

export default {
  id: 'eink',
  name: 'E-ink',
  category: 'reflective',
  physics: 'Electrophoretic e-paper: charged black/white pigment in microcapsules driven to the surface by a field and held with no power (bistable). Reflective, matte, no emission — read by ambient light. Full-refresh flash on change clears the partial-refresh ghost residue that otherwise accumulates.',
  USES: ['stageSize', 'textGrid', 'ambientGradient', 'hex2rgb', 'mix', 'rgba', 'grain'],
  params: [
    { key: 'text', label: 'text (a|b|c)', type: 'text', max: 40, default: 'HELLO|日本|E-INK|電子', group: 'content' },
    { key: 'source', label: 'source', type: 'select', options: ['text', 'clock'], default: 'text', group: 'content' },
    { key: 'rasterH', label: 'glyph grid', type: 'range', min: 7, max: 22, step: 1, default: 11, group: 'content' },
    { key: 'updateMs', label: 'update ms', type: 'range', min: 400, max: 6000, step: 100, default: 2200, group: 'content' },
    { key: 'ink', label: 'ink (dark)', type: 'color', default: '#161413', group: 'paper' },
    { key: 'paper', label: 'paper', type: 'color', default: '#d8d6cf', group: 'paper' },
    { key: 'tint', label: 'paper tint', type: 'range', min: 0, max: 100, step: 1, default: 30, group: 'paper' },
    { key: 'contrast', label: 'contrast', type: 'range', min: 30, max: 100, step: 1, default: 86, group: 'paper' },
    { key: 'ghosting', label: 'ghosting', type: 'range', min: 0, max: 100, step: 1, default: 34, group: 'artifacts' },
    { key: 'flash', label: 'refresh flash', type: 'toggle', default: true, group: 'artifacts' },
    { key: 'edgeFade', label: 'edge falloff', type: 'range', min: 0, max: 100, step: 1, default: 28, group: 'wear' },
    { key: 'grain', label: 'capsule grain', type: 'range', min: 0, max: 100, step: 1, default: 30, group: 'wear' },
    { key: 'dead', label: 'dead blobs', type: 'range', min: 0, max: 30, step: 1, default: 4, group: 'wear' },
    { key: 'ambient', label: 'ambient light', type: 'range', min: 0, max: 100, step: 1, default: 36, group: 'wear' },
  ],
  presets: {
    Kindle: { ink: '#1a1816', paper: '#d8d6cf', tint: 30, contrast: 86, ghosting: 34, flash: true, edgeFade: 28, grain: 30, dead: 4, ambient: 36, rasterH: 11, updateMs: 2200 },
    Fresh: { ink: '#0e0d0c', paper: '#e6e4dd', tint: 14, contrast: 96, ghosting: 8, flash: true, edgeFade: 10, grain: 12, dead: 0, ambient: 24, rasterH: 13, updateMs: 1600 },
    Worn: { ink: '#2a2622', paper: '#cdc9bd', tint: 52, contrast: 62, ghosting: 70, flash: true, edgeFade: 56, grain: 58, dead: 12, ambient: 48, rasterH: 9, updateMs: 3000 },
    'No-flash': { ink: '#191715', paper: '#d6d4cd', tint: 36, contrast: 80, ghosting: 56, flash: false, edgeFade: 34, grain: 34, dead: 6, ambient: 38, rasterH: 11, updateMs: 2400 },
  },

  render(ctx, p, t, rng) {
    const { w, h } = stageSize(ctx);

    // paper colour: slightly-off white warmed toward sepia by tint (a real e-paper substrate is never #fff).
    const baseP = hex2rgb(p.paper), inkC = hex2rgb(p.ink);
    const warm = [232, 224, 206];                                   // sepia direction
    const paperC = mix(baseP, warm, (p.tint / 100) * 0.5);
    // contrast pulls the ink toward / away from the paper (lower contrast = greyer, faded ink).
    const con = p.contrast / 100;
    const drawInk = mix(paperC, inkC, con);

    // full-canvas paper fill — guarded so the transparent PNG export keeps alpha.
    if (!p.transparent) { ctx.fillStyle = rgba(paperC, 1); ctx.fillRect(0, 0, w, h); }

    const { cur, prev, phase } = frames(p, t);

    // FULL-REFRESH FLASH: at the very start of each update cycle the controller inverts the whole panel to
    // black, then to white, then paints the new frame. We model that as a brief window at phase≈0.
    let flashing = 0;
    if (p.flash) {
      const fw = 0.10;                                              // flash occupies first 10% of the cycle
      if (phase < fw) {
        const u = phase / fw;                                       // 0..1 through the flash
        flashing = u < 0.5 ? 1 : 0;                                 // black half, then white half
        // black slam (always opaque — it's the controller driving every capsule dark; export-safe: only
        // drawn during the brief flash window, and we still skip the steady paper fill above when transparent)
        if (!p.transparent) {
          ctx.fillStyle = u < 0.5 ? rgba(inkC, 0.96) : rgba([255, 255, 255], 0.55 * (1 - (u - 0.5) * 2));
          ctx.fillRect(0, 0, w, h);
        }
      }
    }

    // grids for current + previous content (cached by text-raster).
    const gCur = textGrid(cur, { height: p.rasterH });
    const gPrev = textGrid(prev, { height: p.rasterH });
    const tCols = gCur.cols + PAD * 2, tRows = gCur.rows + PAD * 2;
    const cell = Math.max(1.5, Math.min((w * 0.9) / tCols, (h * 0.82) / tRows));
    const matW = (gCur.cols + PAD * 2) * cell, matH = (gCur.rows + PAD * 2) * cell;
    const ox = (w - matW) / 2, oy = (h - matH) / 2;

    const ghostA = (p.ghosting / 100) * 0.5, deadP = p.dead / 100;
    const edge = p.edgeFade / 100;
    const cx0 = ox + matW / 2, cy0 = oy + matH / 2, edR = Math.hypot(matW, matH) / 2;

    // square-ish capsule blocks read as pigment, not LEDs — no rounding, no core, no glow.
    const block = (g, c, r, rad) => {
      const x = ox + c * cell + cell / 2, y = oy + r * cell + cell / 2;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    };
    const sample = (grid, gr, gc) => gr >= 0 && gr < grid.length && gc >= 0 && gc < (grid[0] ? grid[0].length : 0) && grid[gr][gc] === 1;

    // 1) PARTIAL-REFRESH GHOST: the previous frame's content lingers as faint grey residue. Heavier where
    //    the seed says residue has built up (older, lazier capsules) and only outside the flash window.
    if (ghostA > 0 && !flashing) {
      const fade = 1 - (p.flash ? 0 : phase * 0.3);                 // without flash it slowly self-erases
      for (let r = 0; r < gCur.rows + PAD * 2; r++) {
        for (let c = 0; c < gCur.cols + PAD * 2; c++) {
          const gr = r - PAD, gc = c - PAD;
          if (!sample(gPrev.grid, gr, gc) || sample(gCur.grid, gr, gc)) continue; // residue only where it WAS lit and now isn't
          const build = 0.6 + 0.4 * rng.hash(c + 5, r + 9);        // uneven residue buildup per cell
          ctx.fillStyle = rgba(inkC, ghostA * 0.32 * build * fade);
          block(ctx, c, r, cell * 0.42);
        }
      }
    }

    // 2) CURRENT CONTENT: solid dark ink. Per-capsule variance + edge-contrast falloff make it matte, never flat.
    for (let r = 0; r < gCur.rows + PAD * 2; r++) {
      for (let c = 0; c < gCur.cols + PAD * 2; c++) {
        const gr = r - PAD, gc = c - PAD;
        if (!sample(gCur.grid, gr, gc)) continue;
        let dark = 1;
        const x = ox + c * cell + cell / 2, y = oy + r * cell + cell / 2;
        // edge falloff: capsules near the panel rim hold charge worse → lower contrast there.
        if (edge > 0) { const d = Math.hypot(x - cx0, y - cy0) / edR; dark *= 1 - edge * 0.5 * Math.max(0, d - 0.45); }
        // microcapsule unevenness — a few cells settle slightly grey (stable per seed).
        dark *= 0.86 + 0.14 * rng.hash(c + 17, r + 3);
        const inkPix = mix(paperC, drawInk, Math.max(0.2, dark));
        ctx.fillStyle = rgba(inkPix, 1);
        block(ctx, c, r, cell * 0.5);
      }
    }

    // 3) DEAD GREY BLOBS: permanent stuck microcapsules — small mid-grey smudges that never refresh (per seed).
    if (deadP > 0) {
      const grey = mix(paperC, inkC, 0.42);
      const nBlobs = Math.floor(deadP * tCols * tRows * 0.12);
      for (let i = 0; i < nBlobs; i++) {
        const bx = ox + rng.hash(i + 2, 71) * matW, by = oy + rng.hash(i + 4, 53) * matH;
        const br = cell * (0.5 + rng.hash(i + 6, 29) * 1.1);
        ctx.fillStyle = rgba(grey, 0.5 + 0.3 * rng.hash(i + 8, 37));
        ctx.fillRect(bx - br, by - br, br * 2, br * 2);
      }
    }

    // 4) microcapsule grain over the whole panel (shared wear vocabulary — matte texture, not noise glow).
    grain(ctx, rng, (p.grain / 100) * 0.9, w, h);

    // 5) ambient room light raking across the reflective substrate (self-suppresses for transparent export).
    ambientGradient(ctx, w, h, Math.PI * 0.28, 1 - (p.ambient / 100));
  },
};

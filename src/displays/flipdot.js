// flipdot.js — Flip-dot / flip-disc matrix (electromechanical, REFLECTIVE). HANDOVER §6.06.
// A grid of discs, each black on one face and fluoro yellow on the other, pivoted on a diameter and
// thrown over by a momentary magnetic pulse. REFLECTIVE — there is no light source in the dot; the
// yellow face is just bright matte paint catching room light. So we light the whole panel with an
// ambientGradient (a raking key) instead of bloom, and give every disc a bevel/cavity shadow so it
// reads as a physical token recessed in the board. A flip is the disc rotating about its horizontal
// diameter: we fake the rotation with a scaleY squash (1 → 0 → 1) and swap which face shows at the
// midpoint. Per-column STAGGER makes the new image wipe in left-to-right, driven by t; the board
// re-flips to fresh content every period. Wear via rng.hash: stuck dots that never throw, discs that
// rest a few degrees off-flush, dust, and the dark gap between discs. All decisions reproducible.

import { stageSize } from '../core/contract.js';
import { textGrid } from '../core/text-raster.js';
import { ambientGradient, vignette } from '../core/fx.js';
import { hex2rgb, mix, rgba } from '../core/color.js';

const PAD = 1; // border in cells around the glyph block

// two content "pages" the board cycles between — gives the column wipe something to reveal
const clockStr = () => { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return z(d.getHours()) + ':' + z(d.getMinutes()); };

// matte disc with a cavity ring + a soft sheen offset toward the light. `face01` 0=black,1=yellow.
// sy is the vertical squash (1 flush, →0 edge-on) used to fake the diameter rotation.
function disc(ctx, cx, cy, rad, face01, sy, faceC, darkC, bevel, lx, ly) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, Math.max(0.04, sy));            // squash → the disc seen near edge-on mid-flip
  // recessed cavity shadow under the disc (always present, gives the board depth)
  if (bevel > 0) {
    ctx.fillStyle = rgba([0, 0, 0], 0.5 * bevel);
    ctx.beginPath(); ctx.arc(0, rad * 0.12, rad * 1.04, 0, Math.PI * 2); ctx.fill();
  }
  // disc body — matte face colour, no glow
  const base = face01 > 0.5 ? faceC : darkC;
  ctx.fillStyle = rgba(base, 1);
  ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
  // bevelled rim: lit crescent toward the light, shadowed crescent away from it
  if (bevel > 0) {
    const g = ctx.createRadialGradient(-lx * rad * 0.4, -ly * rad * 0.4, rad * 0.1, 0, 0, rad);
    g.addColorStop(0, rgba(mix(base, [255, 255, 255], 0.28 * bevel), face01 > 0.5 ? 0.9 : 0.5));
    g.addColorStop(0.55, rgba(base, 0));
    g.addColorStop(1, rgba([0, 0, 0], 0.55 * bevel));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export default {
  id: 'flipdot',
  name: 'Flip-Dot',
  category: 'electromechanical',
  physics: 'Magnetically flipped bistable discs — black on one face, fluoro-yellow on the other, pivoting on a diameter. Reflective (matte paint catching room light, not emissive); image wipes in column-by-column as the rotor pulses fire in sequence.',
  USES: ['stageSize', 'textGrid', 'ambientGradient', 'vignette', 'hex2rgb', 'mix', 'rgba'],
  params: [
    { key: 'text', label: 'text', type: 'text', max: 24, default: 'PLATFORM 2', group: 'content' },
    { key: 'source', label: 'source', type: 'select', options: ['text', 'clock'], default: 'text', group: 'content' },
    { key: 'rasterH', label: 'kanji grid', type: 'range', min: 7, max: 22, step: 1, default: 11, group: 'content' },
    { key: 'face', label: 'disc face', type: 'color', default: '#d8e000', group: 'colour' },
    { key: 'cavity', label: 'off / cavity', type: 'color', default: '#0c0d0a', group: 'colour' },
    { key: 'bg', label: 'panel', type: 'color', default: '#080906', group: 'colour' },
    { key: 'fill', label: 'disc size', type: 'range', min: 30, max: 50, step: 1, default: 42, group: 'geometry' },
    { key: 'gap', label: 'disc gap', type: 'range', min: 0, max: 60, step: 1, default: 22, group: 'geometry' },
    { key: 'bevel', label: 'bevel / shadow', type: 'range', min: 0, max: 100, step: 1, default: 58, group: 'geometry' },
    { key: 'flipMs', label: 'flip time', type: 'range', min: 40, max: 400, step: 10, default: 150, group: 'motion' },
    { key: 'stagger', label: 'column stagger', type: 'range', min: 0, max: 100, step: 1, default: 46, group: 'motion' },
    { key: 'cycleMs', label: 'page cycle', type: 'range', min: 1000, max: 8000, step: 100, default: 4000, group: 'motion' },
    { key: 'stuck', label: 'stuck dots', type: 'range', min: 0, max: 40, step: 1, default: 6, group: 'wear' },
    { key: 'cock', label: 'rest skew', type: 'range', min: 0, max: 100, step: 1, default: 30, group: 'wear' },
    { key: 'light', label: 'light angle', type: 'range', min: 0, max: 360, step: 1, default: 300, group: 'wear' },
    { key: 'ambient', label: 'ambient', type: 'range', min: 0, max: 100, step: 1, default: 46, group: 'wear' },
    { key: 'dust', label: 'dust', type: 'range', min: 0, max: 100, step: 1, default: 24, group: 'wear' },
    { key: 'vignette', label: 'vignette', type: 'range', min: 0, max: 100, step: 1, default: 44, group: 'wear' },
  ],
  presets: {
    Departures: { face: '#d8e000', cavity: '#0c0d0a', bg: '#080906', fill: 42, gap: 22, bevel: 58, flipMs: 150, stagger: 46, cycleMs: 4000, stuck: 6, cock: 30, light: 300, ambient: 46, dust: 24, vignette: 44 },
    Pristine: { face: '#e6ee10', cavity: '#0a0b08', bg: '#06070a', fill: 44, gap: 16, bevel: 70, flipMs: 90, stagger: 30, cycleMs: 5000, stuck: 0, cock: 6, light: 285, ambient: 58, dust: 6, vignette: 24 },
    'Station Worn': { face: '#c4cc18', cavity: '#0e0e0a', bg: '#090905', fill: 40, gap: 28, bevel: 50, flipMs: 220, stagger: 70, cycleMs: 3000, stuck: 22, cock: 64, light: 320, ambient: 38, dust: 60, vignette: 56 },
    Amber: { face: '#ffb000', cavity: '#0d0a04', bg: '#0a0703', fill: 43, gap: 20, bevel: 60, flipMs: 130, stagger: 50, cycleMs: 4500, stuck: 8, cock: 34, light: 250, ambient: 50, dust: 30, vignette: 40 },
  },

  render(ctx, p, t, rng) {
    const { w, h } = stageSize(ctx);
    const faceC = hex2rgb(p.face), cavityC = hex2rgb(p.cavity), bgC = hex2rgb(p.bg);
    if (!p.transparent) { ctx.fillStyle = rgba(bgC, 1); ctx.fillRect(0, 0, w, h); }

    // two content pages: live string + a blank board, so the wipe has something to reveal each cycle.
    const str = p.source === 'clock' ? clockStr() : (p.text || ' ');
    const { grid, rows, cols } = textGrid(str, { height: p.rasterH });
    const tCols = cols + PAD * 2, tRows = rows + PAD * 2;

    // fit the grid to the stage (square cells; reflective board likes generous margin)
    const cell = Math.max(3, Math.min((w * 0.92) / tCols, (h * 0.84) / tRows));
    const matW = tCols * cell, matH = tRows * cell;
    const ox = (w - matW) / 2, oy = (h - matH) / 2;
    const gapF = p.gap / 100, rad = cell * (p.fill / 100) * (1 - gapF * 0.5);

    // light direction (unit vector) shared by every bevel + the ambient rake
    const ang = p.light * Math.PI / 180, lx = Math.cos(ang), ly = Math.sin(ang);
    const bevel = p.bevel / 100, stuckP = p.stuck / 100, cock = p.cock / 100;

    // animation: each frame belongs to a "page" (t / cycleMs); even pages show the glyph, odd are blank.
    // A column flips when the wipe front, sweeping left→right, passes it; the flip itself takes flipMs.
    const cycle = Math.max(200, p.cycleMs), page = Math.floor(t / cycle);
    const showGlyph = (page % 2) === 0;          // alternate content ↔ blank so the board keeps moving
    const into = t - page * cycle;               // ms since this page began
    const stag = (p.stagger / 100) * cycle * 0.6;// total left→right sweep duration across all columns
    const flipMs = Math.max(20, p.flipMs);

    // matte board ground under the discs (off cells read as recessed cavities, not bg — allowed: not full-canvas)
    ctx.fillStyle = rgba(mix(bgC, [0, 0, 0], 0.35), 1);
    ctx.fillRect(ox, oy, matW, matH);

    for (let r = 0; r < tRows; r++) {
      for (let c = 0; c < tCols; c++) {
        const cx = ox + c * cell + cell / 2, cy = oy + r * cell + cell / 2;
        const gr = r - PAD, gc = c - PAD;
        const inGlyph = gr >= 0 && gr < rows && gc >= 0 && gc < cols && grid[gr][gc] === 1;
        const target = showGlyph && inGlyph ? 1 : 0;   // face this dot is being thrown to this page
        const prev = !showGlyph && inGlyph ? 1 : 0;     // face it held on the previous page

        // stuck dots never throw — they sit on whatever face the seed assigned and ignore the wipe.
        const isStuck = rng.hash(c + 5, r + 9) < stuckP;
        if (isStuck) {
          const sf = rng.hash(c + 21, r + 3) > 0.5 ? 1 : 0;
          const skew = 1 - cock * 0.5 * rng.hash(c + 7, r + 13);   // cocked off-flush, never fully flat
          disc(ctx, cx, cy, rad, sf, skew, faceC, cavityC, bevel, lx, ly);
          continue;
        }

        // wipe timing: column c fires after a fraction of the sweep; phase 0→1 over flipMs is the throw.
        const fire = (c / Math.max(1, tCols - 1)) * stag;
        const localT = into - fire;
        let face = prev, sy = 1;
        if (target !== prev) {                  // this dot actually changes face this page
          if (localT < 0) { face = prev; }                        // front hasn't reached it yet
          else if (localT >= flipMs) { face = target; }           // already settled
          else {
            const ph = localT / flipMs;                           // 0→1 through the throw
            sy = Math.abs(Math.cos(ph * Math.PI));                // 1 → 0 (edge-on) → 1 squash
            face = ph < 0.5 ? prev : target;                      // swap shown face at edge-on midpoint
          }
        }

        // discs at rest sit a hair off-flush (worn pivot) — a faint always-on squash keyed to the seed.
        const rest = 1 - cock * 0.16 * rng.hash(c + 41, r + 37);
        disc(ctx, cx, cy, rad, face, sy * rest, faceC, cavityC, bevel, lx, ly);
      }
    }

    // dust settled in the cavities + on the discs (light & dark flecks, stable per seed)
    if (p.dust > 0) {
      const n = Math.floor((p.dust / 100) * tCols * tRows * 0.8);
      ctx.save();
      for (let i = 0; i < n; i++) {
        const dx = ox + rng.hash(i + 1, 71) * matW, dy = oy + rng.hash(i + 3, 53) * matH;
        const lightFleck = rng.hash(i, 17) > 0.62;
        ctx.fillStyle = `rgba(${lightFleck ? '210,210,190' : '0,0,0'},${0.05 + rng.hash(i + 2, 9) * 0.08})`;
        ctx.beginPath(); ctx.arc(dx, dy, 0.4 + rng.hash(i + 5, 13) * 1.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // REFLECTIVE lighting: a raking ambient gradient is the only "light" — no bloom on a flip-dot.
    ambientGradient(ctx, w, h, ang, 1 - p.ambient / 100);
    vignette(ctx, w, h, p.vignette / 100);
  },
};

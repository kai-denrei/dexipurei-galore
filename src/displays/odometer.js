// odometer.js — Mechanical Odometer (electromechanical). HANDOVER §6.07. Vertical number drums: each
// column is a little cylinder engraved 0..9 around its circumference, viewed through a window so you see
// the resting digit plus the curling top/bottom of its neighbours. The bank counts UP from t: the
// rightmost wheel rolls continuously and carries into the higher wheels (9→0 advances the next), with the
// two-half-digit transition mid-roll. Perspective compresses digits toward the window's lip, an inter-drum
// gap throws a dark shadow between columns, and wear (rng.hash) gives each wheel a slightly-off rest
// alignment, worn paint, a faint drum sheen, and one wheel that sits a hair high.

import { stageSize } from '../core/contract.js';
import { vignette } from '../core/fx.js';
import { hex2rgb, mix, rgba } from '../core/color.js';

const DRUM_FONT = "'JetBrains Mono', monospace";

// ease a 0..1 roll progress. amt 0 = linear, 1 = a sharp mechanical snap (slow detent, fast flip, settle).
function ease(x, amt) {
  if (amt <= 0) return x;
  // smootherstep blended toward identity by amt — reads as a sprung detent letting go then catching.
  const s = x * x * x * (x * (x * 6 - 15) + 10);
  return x + (s - x) * amt;
}

// vertical perspective compression: map a linear offset u (in digit-heights, 0 = window centre) to a
// screen offset and a foreshortening scale, as if printed on a cylinder of curvature `curv` (0..1).
// At the lip (|u|→0.5) digits crowd together and shrink, like the real curl of the drum away from you.
function cylinder(u, curv) {
  if (curv <= 0) return { y: u, s: 1 };
  const a = u * Math.PI * curv;            // angular position on the visible arc
  const y = Math.sin(a) / Math.max(0.0001, Math.sin(Math.PI * 0.5 * curv)) * 0.5; // normalised screen y
  const s = Math.max(0.18, Math.cos(a));   // foreshorten: edge-on digits get thin
  return { y, s };
}

export default {
  id: 'odometer',
  name: 'Odometer',
  category: 'electromechanical',
  physics: 'Stacked number drums (0–9 around each cylinder) rolling vertically behind a window; perspective-compressed digits curl over the lip, the units wheel turns continuously and carries 9→0 into higher wheels, gaps shadow between drums.',
  USES: ['stageSize', 'vignette', 'hex2rgb', 'mix', 'rgba'],
  params: [
    { key: 'digits', label: 'digit count', type: 'range', min: 2, max: 9, step: 1, default: 6, group: 'content' },
    { key: 'start', label: 'start value', type: 'range', min: 0, max: 99999, step: 1, default: 12480, group: 'content' },
    { key: 'invert', label: 'black on white', type: 'toggle', default: false, group: 'color' },
    { key: 'drum', label: 'drum face', type: 'color', default: '#0c0c0e', group: 'color' },
    { key: 'ink', label: 'digit ink', type: 'color', default: '#ece7dd', group: 'color' },
    { key: 'bg', label: 'background', type: 'color', default: '#0a0a0b', group: 'color' },
    { key: 'speed', label: 'roll speed', type: 'range', min: 0, max: 100, step: 1, default: 34, group: 'motion' },
    { key: 'easing', label: 'detent snap', type: 'range', min: 0, max: 100, step: 1, default: 58, group: 'motion' },
    { key: 'curve', label: 'drum curvature', type: 'range', min: 0, max: 100, step: 1, default: 64, group: 'geometry' },
    { key: 'gapShadow', label: 'gap shadow', type: 'range', min: 0, max: 100, step: 1, default: 52, group: 'geometry' },
    { key: 'sheen', label: 'drum sheen', type: 'range', min: 0, max: 100, step: 1, default: 40, group: 'geometry' },
    { key: 'align', label: 'rest misalign', type: 'range', min: 0, max: 100, step: 1, default: 30, group: 'wear' },
    { key: 'worn', label: 'worn paint', type: 'range', min: 0, max: 100, step: 1, default: 34, group: 'wear' },
    { key: 'tint', label: 'ink warmth', type: 'range', min: 0, max: 100, step: 1, default: 22, group: 'wear' },
    { key: 'vignette', label: 'vignette', type: 'range', min: 0, max: 100, step: 1, default: 44, group: 'wear' },
  ],
  presets: {
    Trip: { digits: 6, invert: false, drum: '#0c0c0e', ink: '#ece7dd', bg: '#0a0a0b', speed: 34, easing: 58, curve: 64, gapShadow: 52, sheen: 40, align: 30, worn: 34, tint: 22, vignette: 44 },
    Brass: { digits: 5, invert: true, drum: '#e9e3d4', ink: '#181410', bg: '#15110b', speed: 22, easing: 70, curve: 72, gapShadow: 60, sheen: 56, align: 44, worn: 50, tint: 60, vignette: 50 },
    Fast: { digits: 7, invert: false, drum: '#101013', ink: '#f4f1ea', bg: '#08080a', speed: 84, easing: 30, curve: 50, gapShadow: 40, sheen: 30, align: 14, worn: 16, tint: 10, vignette: 36 },
    Pristine: { digits: 6, invert: false, drum: '#0e0e11', ink: '#ffffff', bg: '#070708', speed: 30, easing: 64, curve: 58, gapShadow: 48, sheen: 24, align: 0, worn: 0, tint: 0, vignette: 24 },
  },

  render(ctx, p, t, rng) {
    const { w, h } = stageSize(ctx);
    const bg = hex2rgb(p.bg);
    const drumBase = hex2rgb(p.invert ? p.ink : p.drum);   // the cylinder face
    const inkBase = hex2rgb(p.invert ? p.drum : p.ink);    // engraved digits
    const inkWarm = mix(inkBase, [255, 196, 120], (p.tint / 100) * 0.5);
    if (!p.transparent) { ctx.fillStyle = rgba(bg, 1); ctx.fillRect(0, 0, w, h); }

    const n = Math.max(1, p.digits | 0);
    const pad = Math.min(w, h) * 0.12, gapFrac = 0.07;

    // fit the bank of drums to the stage (each window aspect ~ 0.66 wide : 1 tall)
    const aspect = 0.66;
    let dh = h - pad * 2, dw = dh * aspect, gp = dw * gapFrac;
    const maxW = w - pad * 2, total = () => dw * n + gp * (n - 1);
    if (total() > maxW) { const s = maxW / total(); dw *= s; dh *= s; gp = dw * gapFrac; }
    const fontPx = dh * 0.62, curv = p.curve / 100;
    const startX = (w - total()) / 2, midY = h / 2;

    // continuous count: the units wheel advances `speed` digits/sec; higher wheels carry from it.
    const unitsPerSec = 0.4 + (p.speed / 100) * 9;            // 0.4 .. 9.4 digits/sec on the units drum
    const advance = (t / 1000) * unitsPerSec;
    const base = (p.start | 0) + advance;                    // fractional odometer value
    const easeAmt = p.easing / 100, worn = p.worn / 100, alignAmt = p.align / 100;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < n; i++) {
      const place = n - 1 - i;                               // i=0 is leftmost (highest) place
      const pos = base / Math.pow(10, place);                // this wheel's fractional position in digits
      const whole = Math.floor(pos);
      let frac = pos - whole;                                // 0..1 progress toward the next digit
      // only the actively-carrying lower portion of a wheel rolls smoothly; a higher wheel rolls just as
      // its lower neighbour crosses 9→0. Easing applies near the flip so it snaps through the detent.
      const flipping = frac > 0.62 ? ease((frac - 0.62) / 0.38, easeAmt) * 0.38 + 0.62 : frac;
      frac = place === 0 ? ease(frac, easeAmt * 0.5) : flipping;

      // wear: a stable rest misalignment per wheel, and ONE wheel that sits a hair high.
      const misalign = (rng.hash(i + 3, 17) - 0.5) * alignAmt * 0.10;
      const highWheel = rng.hash(i + 7, 41) < 0.16 ? -0.06 : 0;
      const roll = frac + misalign + highWheel;              // total drum rotation offset in digit-heights

      const cx = startX + dw * (i + 0.5) + gp * i;
      const x0 = cx - dw / 2;

      // --- drum face: vertical gradient (lit top → shadowed lip) reads as a cylinder ---
      const faceG = ctx.createLinearGradient(0, midY - dh / 2, 0, midY + dh / 2);
      faceG.addColorStop(0.0, rgba(mix(drumBase, [0, 0, 0], 0.55), 1));
      faceG.addColorStop(0.5, rgba(drumBase, 1));
      faceG.addColorStop(1.0, rgba(mix(drumBase, [0, 0, 0], 0.62), 1));
      ctx.fillStyle = faceG;
      ctx.fillRect(x0, midY - dh / 2, dw, dh);

      // --- engraved digits: draw the resting digit and its neighbours, curled by the cylinder map ---
      // `roll` shifts the whole strip; we render a window of ±2 digits around centre.
      for (let k = -2; k <= 2; k++) {
        const u = k - (roll % 1 + 1) % 1;                    // offset of this digit from window centre, in heights
        if (Math.abs(u) > 0.62) continue;                    // outside the visible arc → over the lip
        const cyl = cylinder(u, curv);
        const dy = cyl.y * dh;                               // screen position
        const digit = ((whole + k + (roll >= 1 ? Math.floor(roll) : 0)) % 10 + 10) % 10;
        // fade + foreshorten toward the lip; worn paint thins random faces (stable per digit/wheel)
        const lip = 1 - Math.min(1, Math.abs(u) / 0.62);     // 1 centre → 0 lip
        const wpaint = 1 - worn * rng.hash(i * 11 + digit, 53) * 0.55;
        const a = (0.18 + 0.82 * lip) * wpaint;
        ctx.save();
        ctx.translate(cx, midY + dy);
        ctx.scale(1, cyl.s);                                 // vertical foreshorten only
        ctx.font = `${fontPx}px ${DRUM_FONT}`;
        ctx.fillStyle = rgba(inkWarm, a);
        ctx.fillText(String(digit), 0, 0);
        ctx.restore();
      }

      // --- drum sheen: a soft horizontal highlight band across the upper third of the cylinder ---
      if (p.sheen > 0) {
        const sy = midY - dh * (0.10 + 0.04 * rng.hash(i + 5, 29)); // each drum's sheen sits a touch differently
        const sheenG = ctx.createLinearGradient(0, sy - dh * 0.18, 0, sy + dh * 0.18);
        const sa = (p.sheen / 100) * 0.22;
        sheenG.addColorStop(0, rgba([255, 255, 255], 0));
        sheenG.addColorStop(0.5, rgba([255, 255, 255], sa));
        sheenG.addColorStop(1, rgba([255, 255, 255], 0));
        ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = sheenG;
        ctx.fillRect(x0, midY - dh / 2, dw, dh); ctx.restore();
      }

      // --- inter-drum gap shadow: dark seam down each side of the cylinder where it meets the next ---
      if (p.gapShadow > 0) {
        const gw = Math.max(2, dw * 0.10), ga = (p.gapShadow / 100) * 0.7;
        for (const sx of [x0, x0 + dw - gw]) {
          const seamG = ctx.createLinearGradient(sx, 0, sx + gw, 0);
          const lead = sx === x0;
          seamG.addColorStop(lead ? 0 : 1, rgba([0, 0, 0], ga));
          seamG.addColorStop(lead ? 1 : 0, rgba([0, 0, 0], 0));
          ctx.fillStyle = seamG;
          ctx.fillRect(sx, midY - dh / 2, gw, dh);
        }
      }

      // --- window lip: thin top/bottom shadow bars so the digit looks cropped by a frame ---
      const lipH = dh * 0.10;
      const topG = ctx.createLinearGradient(0, midY - dh / 2, 0, midY - dh / 2 + lipH);
      topG.addColorStop(0, rgba([0, 0, 0], 0.85)); topG.addColorStop(1, rgba([0, 0, 0], 0));
      ctx.fillStyle = topG; ctx.fillRect(x0, midY - dh / 2, dw, lipH);
      const botG = ctx.createLinearGradient(0, midY + dh / 2 - lipH, 0, midY + dh / 2);
      botG.addColorStop(0, rgba([0, 0, 0], 0)); botG.addColorStop(1, rgba([0, 0, 0], 0.85));
      ctx.fillStyle = botG; ctx.fillRect(x0, midY + dh / 2 - lipH, dw, lipH);
    }

    // --- frame: a hairline bezel around the whole bank, like the pressed-metal odometer surround ---
    ctx.strokeStyle = rgba(mix(bg, [255, 255, 255], 0.22), 0.5);
    ctx.lineWidth = Math.max(1, dw * 0.02);
    ctx.strokeRect(startX - gp, midY - dh / 2 - gp, total() + gp * 2, dh + gp * 2);

    vignette(ctx, w, h, p.vignette / 100);
  },
};

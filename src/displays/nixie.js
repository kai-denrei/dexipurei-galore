// nixie.js — Nixie Tube (emissive). HANDOVER §6.02. Cold-cathode neon glow discharge around stacked
// shaped-wire numerals: each tube holds ten numeral cathodes 0-9, all faintly visible as warm "ghost"
// glyphs, with the energized one wrapped in a soft ~605nm orange neon glow. The stack has Z/parallax
// depth (closer = active), an optional thin vertical anode mesh in front, and lived-in wear (cathode
// poisoning, warm-up ramp, jitter, flicker) — all routed through rng.hash so a seed re-roll is stable.

import { stageSize } from '../core/contract.js';
import { bloom, vignette } from '../core/fx.js';
import { hex2rgb, mix, rgba } from '../core/color.js';

// physical cathode stacking order in a real IN-style tube (not numeric) — front-to-back wire order.
// Earlier in this list = closer to the glass (drawn last / least parallax). Keeps overlap believable.
const STACK_ORDER = [1, 2, 6, 7, 5, 0, 4, 9, 8, 3];
// glyph font: condensed serif already loaded by the page; falls back to mono numerals.
const TUBE_FONT = "'Cormorant Garamond', 'JetBrains Mono', serif";

// warm-up brightness ramp: when the shown value changes, the gas takes a beat to fully ionize.
// We can't store state across frames (render is pure), so we derive a phase from t within a window.
function warmup(t, ms) {
  if (ms <= 0) return 1;
  const ph = (t % (ms * 6)) / ms; // a soft pulse every ~6 windows so it reads as "settling"
  return ph < 1 ? 0.45 + 0.55 * ph : 1;
}

// digit string from text or live clock
function content(p) {
  if (p.source === 'clock') {
    const d = new Date(), z = (n) => String(n).padStart(2, '0');
    return z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
  }
  return (p.text || ' ').toString();
}

export default {
  id: 'nixie',
  name: 'Nixie Tube',
  category: 'emissive',
  physics: 'Cold-cathode neon glow discharge (~605nm orange) around the energized numeral in a stack of ten shaped-wire cathodes; non-lit cathodes ghost faintly, gas warms up on switch, tubes poison unevenly with age.',
  USES: ['stageSize', 'bloom', 'vignette', 'hex2rgb', 'mix', 'rgba'],
  params: [
    { key: 'text', label: 'text', type: 'text', max: 12, default: '1957', group: 'content' },
    { key: 'source', label: 'source', type: 'select', options: ['text', 'clock'], default: 'text', group: 'content' },
    { key: 'color', label: 'neon', type: 'color', default: '#ff7a18', group: 'color' },
    { key: 'bg', label: 'background', type: 'color', default: '#0a0604', group: 'color' },
    { key: 'glow', label: 'glow radius', type: 'range', min: 0, max: 50, step: 1, default: 22, group: 'glow' },
    { key: 'bloomInt', label: 'bloom', type: 'range', min: 0, max: 100, step: 1, default: 60, group: 'glow' },
    { key: 'coreWhite', label: 'hot core', type: 'range', min: 0, max: 100, step: 1, default: 30, group: 'glow' },
    { key: 'depth', label: 'stack depth', type: 'range', min: 0, max: 100, step: 1, default: 48, group: 'stack' },
    { key: 'ghost', label: 'ghost cathodes', type: 'range', min: 0, max: 100, step: 1, default: 24, group: 'stack' },
    { key: 'poison', label: 'poisoning', type: 'range', min: 0, max: 100, step: 1, default: 28, group: 'wear' },
    { key: 'jitter', label: 'digit jitter', type: 'range', min: 0, max: 100, step: 1, default: 20, group: 'wear' },
    { key: 'flicker', label: 'flicker', type: 'range', min: 0, max: 100, step: 1, default: 16, group: 'wear' },
    { key: 'warmupMs', label: 'warm-up ms', type: 'range', min: 0, max: 600, step: 10, default: 220, group: 'wear' },
    { key: 'mesh', label: 'anode mesh', type: 'toggle', default: true, group: 'tube' },
    { key: 'vignette', label: 'vignette', type: 'range', min: 0, max: 100, step: 1, default: 50, group: 'tube' },
  ],
  presets: {
    'IN-14': { color: '#ff7a18', bg: '#0a0604', glow: 22, bloomInt: 60, coreWhite: 30, depth: 48, ghost: 24, poison: 28, jitter: 20, flicker: 16, warmupMs: 220, mesh: true, vignette: 50 },
    Pristine: { color: '#ff8a2a', bg: '#080504', glow: 18, bloomInt: 48, coreWhite: 22, depth: 40, ghost: 14, poison: 4, jitter: 6, flicker: 4, warmupMs: 140, mesh: true, vignette: 32 },
    Tired: { color: '#ff6a12', bg: '#0b0603', glow: 26, bloomInt: 70, coreWhite: 18, depth: 60, ghost: 40, poison: 66, jitter: 44, flicker: 38, warmupMs: 360, mesh: true, vignette: 62 },
    'Cold War': { color: '#ffae3a', bg: '#0a0702', glow: 30, bloomInt: 80, coreWhite: 40, depth: 54, ghost: 30, poison: 22, jitter: 16, flicker: 12, warmupMs: 260, mesh: false, vignette: 46 },
  },

  render(ctx, p, t, rng) {
    const { w, h } = stageSize(ctx);
    const neon = hex2rgb(p.color), bg = hex2rgb(p.bg);
    const coreC = mix(neon, [255, 240, 220], p.coreWhite / 100);
    if (!p.transparent) { ctx.fillStyle = rgba(bg, 1); ctx.fillRect(0, 0, w, h); }

    const str = content(p);
    const n = str.length;
    const pad = Math.min(w, h) * 0.12;

    // size each tube cell to fit the stage (tube aspect ~ 0.6 wide : 1 tall like a real cylinder)
    const aspect = 0.62, gapFrac = 0.34;
    let th = h - pad * 2, tw = th * aspect, gp = tw * gapFrac;
    const maxW = w - pad * 2, total = (n) => tw * n + gp * (n - 1);
    if (total(n) > maxW) { const s = maxW / total(n); tw *= s; th *= s; gp = tw * gapFrac; }
    const fontPx = th * 0.78;
    const startX = (w - total(n)) / 2, y = h / 2;

    const depth = (p.depth / 100) * fontPx * 0.16;     // max parallax push per stack layer
    const ghostA = p.ghost / 100, poison = p.poison / 100, jit = p.jitter / 100;
    const flick = p.flicker / 100, wu = warmup(t, p.warmupMs);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // collect lit glyph draws for one additive bloom pass at the end
    const lit = [];

    for (let i = 0; i < n; i++) {
      const ch = str[i];
      const cx = startX + tw * (i + 0.5) + gp * i;
      // colon (clock separators) — small stacked neon dots, not a tube
      if (ch === ':' || ch === ' ') {
        if (ch === ':') {
          for (const dy of [-fontPx * 0.22, fontPx * 0.22]) {
            ctx.fillStyle = rgba(neon, 0.9); ctx.shadowColor = rgba(neon, 1); ctx.shadowBlur = p.glow * 0.7;
            ctx.beginPath(); ctx.arc(cx, y + dy, fontPx * 0.045, 0, Math.PI * 2); ctx.fill();
          }
          ctx.shadowBlur = 0;
        }
        continue;
      }

      // per-tube cathode poisoning: some positions glow dim/uneven (stable per seed)
      const sick = Math.max(0.22, 1 - poison * rng.hash(i + 5, 91));
      // tiny per-digit positional jitter (loose cathode wire) — stable per seed
      const jx = (rng.hash(i + 13, 3) - 0.5) * jit * fontPx * 0.04;
      const jy = (rng.hash(i + 17, 9) - 0.5) * jit * fontPx * 0.04;

      // 1) ghost stack: draw ALL ten cathodes faint & warm, back-to-front with Z/parallax offset.
      if (ghostA > 0) {
        for (let s = 0; s < STACK_ORDER.length; s++) {
          const g = STACK_ORDER[s];
          if (String(g) === ch) continue;                 // the active one is drawn bright below
          const z = s / (STACK_ORDER.length - 1);          // 0 = closest, 1 = deepest cathode
          const dz = depth * z;                            // push deeper glyphs down/right (parallax)
          const a = ghostA * (0.10 + 0.16 * (1 - z)) * sick;
          ctx.font = `${fontPx}px ${TUBE_FONT}`;
          ctx.fillStyle = rgba(mix(bg, neon, 0.5), a);
          ctx.fillText(String(g), cx + dz * 0.5 + jx, y + dz + jy);
        }
      }

      // 2) active numeral: bright neon glyph, warm-up ramped, flickering, sitting at the front layer.
      let bright = sick * wu;
      if (flick > 0) {
        const fph = rng.hash(i + 41, 7);
        if (fph < flick * 0.6) bright *= 0.80 + 0.20 * Math.sin(t * 0.018 + fph * 70);
      }
      bright = Math.max(0.12, bright);
      ctx.font = `${fontPx}px ${TUBE_FONT}`;

      // glow halo (drawn in place via shadow), then solid body, then a faint hot core
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = rgba(neon, 1);
      ctx.shadowBlur = p.glow;
      ctx.fillStyle = rgba(neon, 0.6 * bright);
      ctx.fillText(ch, cx + jx, y + jy);                  // halo pass
      ctx.shadowBlur = p.glow * 0.4;
      ctx.fillStyle = rgba(neon, 0.85 * bright);
      ctx.fillText(ch, cx + jx, y + jy);                  // body pass
      if (p.coreWhite > 0) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = rgba(coreC, 0.5 * bright);
        ctx.fillText(ch, cx + jx, y + jy);                // hot core
      }
      ctx.restore();
      ctx.shadowBlur = 0;

      lit.push({ ch, x: cx + jx, y: y + jy, bright });
    }

    // 3) one soft additive bloom over all lit numerals (the gas envelope's outer halo)
    bloom(ctx, (g) => {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `${fontPx}px ${TUBE_FONT}`;
      for (const L of lit) { g.fillStyle = rgba(neon, 0.9 * L.bright); g.fillText(L.ch, L.x, L.y); }
    }, p.glow * 0.8, p.bloomInt / 100);

    // 4) anode mesh: thin vertical wires in front of the whole bank (real IN-tubes have an anode grid)
    if (p.mesh) {
      ctx.save();
      ctx.strokeStyle = rgba(mix(bg, [255, 255, 255], 0.18), 0.20);
      ctx.lineWidth = Math.max(0.5, fontPx * 0.006);
      const step = Math.max(3, fontPx * 0.05), y0 = y - th * 0.46, y1 = y + th * 0.46;
      for (let i = 0; i < n; i++) {
        const ch = str[i];
        if (ch === ':' || ch === ' ') continue;
        const cx = startX + tw * (i + 0.5) + gp * i, half = fontPx * 0.34;
        for (let mx = -half; mx <= half; mx += step) {
          ctx.beginPath(); ctx.moveTo(cx + mx, y0); ctx.lineTo(cx + mx, y1); ctx.stroke();
        }
      }
      ctx.restore();
    }

    vignette(ctx, w, h, p.vignette / 100);
  },
};

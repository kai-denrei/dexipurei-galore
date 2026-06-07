// sevenseg.js — Seven-Segment (emissive). Ported from the 01-kai-meta VFD counter: thick rounded-tip
// hex segments, multi-pass glow + white hot core. Extended per HANDOVER §6.01 with: off-segment ghost
// (the faint full "8" behind the lit digit), a habitually-dim segment as wear, decimal points, a clock
// colon, per-segment variance, and a 7-seg-displayable letter set (alphanumeric only — segment bars
// physically can't form kanji; that's the dot-matrix's job).

import { stageSize } from '../core/contract.js';
import { vignette } from '../core/fx.js';
import { hex2rgb, rgba } from '../core/color.js';

const SEG_ALL = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
// which segments light per character (uppercased on lookup)
const SEG_CHAR = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg',
  '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  'A': 'abcefg', 'B': 'cdefg', 'C': 'adef', 'D': 'bcdeg', 'E': 'adefg', 'F': 'aefg',
  'G': 'acdef', 'H': 'bcefg', 'I': 'bc', 'J': 'bcde', 'K': 'bcefg', 'L': 'def',
  'N': 'ceg', 'O': 'abcdef', 'P': 'abefg', 'Q': 'abcfg', 'R': 'eg', 'S': 'acdfg',
  'T': 'defg', 'U': 'bcdef', 'V': 'bcdef', 'W': 'bcdef', 'X': 'bcefg', 'Y': 'bcdfg', 'Z': 'abdeg',
  'M': 'aceg', '-': 'g', '_': 'd', '°': 'abfg', ' ': '',
};

// segment endpoints inside a w×h digit box, bar thickness t
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

function parse(str) {
  const toks = [];
  for (const ch of String(str)) {
    if (ch === '.') { const last = toks[toks.length - 1]; if (last && !last.dp && last.ch !== ':') { last.dp = true; continue; } }
    toks.push({ ch: ch === ' ' ? ' ' : ch.toUpperCase(), dp: false });
  }
  return toks.length ? toks : [{ ch: ' ', dp: false }];
}

export default {
  id: 'sevenseg',
  name: 'Seven-Segment',
  category: 'emissive',
  physics: 'Emissive bar segments (VFD/LED): thick rounded hex bars, multi-pass glow + white hot core; faint off-segment ghost of the full 8; one habitually-dim segment as wear.',
  USES: ['stageSize', 'vignette', 'hex2rgb', 'rgba'],
  params: [
    { key: 'text', label: 'text', type: 'text', max: 16, default: '20:26', group: 'content' },
    { key: 'source', label: 'source', type: 'select', options: ['clock', 'text'], default: 'clock', group: 'content' },
    { key: 'color', label: 'segment', type: 'color', default: '#1bf0c8', group: 'color' },
    { key: 'bg', label: 'background', type: 'color', default: '#04100e', group: 'color' },
    { key: 'thickness', label: 'bar width', type: 'range', min: 8, max: 26, step: 1, default: 17, group: 'geometry' },
    { key: 'gap', label: 'digit gap (px)', type: 'range', min: 0, max: 24, step: 1, default: 3, group: 'geometry' },
    { key: 'glow', label: 'glow', type: 'range', min: 0, max: 34, step: 1, default: 16, group: 'glow' },
    { key: 'coreWhite', label: 'hot core', type: 'range', min: 0, max: 100, step: 1, default: 88, group: 'glow' },
    { key: 'coreThick', label: 'core width', type: 'range', min: 20, max: 90, step: 1, default: 58, group: 'glow' },
    { key: 'ghost', label: 'ghost 8', type: 'range', min: 0, max: 30, step: 1, default: 6, group: 'wear' },
    { key: 'bleed', label: 'junction bleed', type: 'range', min: 0, max: 100, step: 1, default: 30, group: 'wear' },
    { key: 'variance', label: 'seg variance', type: 'range', min: 0, max: 100, step: 1, default: 24, group: 'wear' },
    { key: 'dimSeg', label: 'dim segment', type: 'select', options: ['none', 'a', 'b', 'c', 'd', 'e', 'f', 'g'], default: 'e', group: 'wear' },
    { key: 'vignette', label: 'vignette', type: 'range', min: 0, max: 100, step: 1, default: 36, group: 'wear' },
  ],
  presets: {
    VFD: { color: '#1bf0c8', bg: '#04100e', thickness: 17, glow: 16, coreWhite: 88, coreThick: 58, ghost: 6, bleed: 30, variance: 24, dimSeg: 'e', vignette: 36 },
    Amber: { color: '#ffb000', bg: '#0c0702', thickness: 19, glow: 14, coreWhite: 50, coreThick: 52, ghost: 5, bleed: 22, variance: 18, dimSeg: 'f', vignette: 42 },
    Ruby: { color: '#ff3b30', bg: '#0e0202', thickness: 18, glow: 18, coreWhite: 34, coreThick: 48, ghost: 8, bleed: 36, variance: 30, dimSeg: 'g', vignette: 48 },
    Clean: { color: '#bfeaff', bg: '#03080c', thickness: 15, glow: 8, coreWhite: 70, coreThick: 60, ghost: 2, bleed: 10, variance: 6, dimSeg: 'none', vignette: 18 },
  },

  render(ctx, p, t, rng) {
    const { w, h } = stageSize(ctx);
    const segColor = p.color;
    if (!p.transparent) { ctx.fillStyle = rgba(hex2rgb(p.bg), 1); ctx.fillRect(0, 0, w, h); }

    let str = p.text || ' ';
    if (p.source === 'clock') {
      const d = new Date(), z = (n) => String(n).padStart(2, '0');
      str = z(d.getHours()) + ':' + z(d.getMinutes());
    }
    const tokens = parse(str);
    const n = tokens.length;
    const widths = tokens.map((tk) => (tk.ch === ':' ? 0.42 : 1));
    const units = widths.reduce((a, b) => a + b, 0);
    const aspect = 1.62, pad = Math.min(w, h) * 0.1, gp = p.gap;   // gp = a few ABSOLUTE px between digits (tight, not a % of width)
    let dh = h - pad * 2, dw = dh / aspect;
    const maxW = w - pad * 2;
    let tw = dw * units + gp * (n - 1);
    if (tw > maxW) { dw = Math.max(2, (maxW - gp * (n - 1)) / units); dh = dw * aspect; tw = dw * units + gp * (n - 1); }
    const th = dw * (p.thickness / 100);
    const ghostA = p.ghost / 100, varA = p.variance / 100, dim = p.dimSeg, coreW = p.coreWhite / 100;
    let x = (w - tw) / 2;
    const y = (h - dh) / 2;

    const drawSeg = (x1, y1, x2, y2, bright, on, big) => {
      if (!on) {
        if (ghostA <= 0) return;
        ctx.shadowBlur = 0; ctx.globalAlpha = ghostA; ctx.fillStyle = segColor;
        vhex(ctx, x1, y1, x2, y2, big * 0.92); ctx.fill(); ctx.globalAlpha = 1;
        return;
      }
      ctx.fillStyle = segColor; ctx.shadowColor = segColor;
      vhex(ctx, x1, y1, x2, y2, big);
      ctx.globalAlpha = 0.55 * bright; ctx.shadowBlur = p.glow; ctx.fill();           // glow pass
      if (p.bleed > 0) { ctx.globalAlpha = 0.16 * (p.bleed / 100) * bright; ctx.shadowBlur = p.glow * (1 + p.bleed / 60); ctx.fill(); } // junction bleed
      ctx.globalAlpha = Math.min(1, bright); ctx.shadowBlur = 0; ctx.fill();           // solid
      if (coreW > 0) {
        ctx.globalAlpha = Math.min(1, coreW * bright); ctx.fillStyle = '#fff';
        vhex(ctx, x1, y1, x2, y2, big * (p.coreThick / 100)); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    };

    for (let ti = 0; ti < n; ti++) {
      const tk = tokens[ti], cellW = dw * widths[ti];
      ctx.save(); ctx.translate(x, y);
      if (tk.ch === ':') {
        const r = th * 0.7, cx = cellW / 2;
        for (const cy of [dh * 0.34, dh * 0.66]) {
          ctx.fillStyle = segColor; ctx.shadowColor = segColor; ctx.shadowBlur = p.glow;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.globalAlpha = coreW;
          ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        }
      } else {
        const on = SEG_CHAR[tk.ch] != null ? SEG_CHAR[tk.ch] : '';
        for (let i = 0; i < SEG_ALL.length; i++) {
          const seg = SEG_ALL[i];
          const [x1, y1, x2, y2] = segEnds(seg, cellW, dh, th);
          let bright = 1 - varA * rng.hash(ti * 7 + i, 3);
          if (seg === dim) bright *= 0.34;
          drawSeg(x1, y1, x2, y2, Math.max(0.12, bright), on.indexOf(seg) >= 0, th);
        }
        if (tk.dp) {
          const r = th * 0.62;
          ctx.fillStyle = segColor; ctx.shadowColor = segColor; ctx.shadowBlur = p.glow;
          ctx.beginPath(); ctx.arc(cellW - r, dh - r, r, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.globalAlpha = coreW;
          ctx.beginPath(); ctx.arc(cellW - r, dh - r, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
      x += cellW + gp;
    }

    ctx.shadowBlur = 0;
    vignette(ctx, w, h, p.vignette / 100);
  },
};

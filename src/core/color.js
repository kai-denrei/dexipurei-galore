// color.js — sRGB helpers + OKLCH passthrough. Modern canvas/CSS parse oklch() natively, so for
// perceptual derivation we just emit the string and let the engine do the conversion.

export function hex2rgb(h) {
  h = String(h).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgb2hex(c) {
  return '#' + c.map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');
}

// linear sRGB interpolation. t in [0,1].
export const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

export const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// OKLCH string for mixing/derivation where perceptual uniformity matters.
//   l: 0..1 lightness · c: 0..~0.4 chroma · h: 0..360 hue · a: 0..1 alpha
export const oklch = (l, c, h, a = 1) => `oklch(${l} ${c} ${h}${a < 1 ? ` / ${a}` : ''})`;

// fx.js — optical post-processing shared across modules.
// bloom renders a bright pass to an offscreen canvas, blurs it, and composites additively.

let _fxScratch = null;
function fxScratchCanvas(w, h) {
  if (!_fxScratch) _fxScratch = document.createElement('canvas');
  if (_fxScratch.width !== w || _fxScratch.height !== h) { _fxScratch.width = w; _fxScratch.height = h; }
  return _fxScratch;
}

// drawFn(g) paints the glow source in the SAME logical coords as ctx; we then blur + add it.
export function bloom(ctx, drawFn, blur, intensity) {
  if (intensity <= 0 || blur <= 0) return;
  const cv = ctx.canvas, off = fxScratchCanvas(cv.width, cv.height), g = off.getContext('2d');
  g.setTransform(ctx.getTransform());
  g.clearRect(0, 0, cv.width, cv.height);
  drawFn(g);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = intensity;
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(off, 0, 0);
  ctx.restore();
  ctx.filter = 'none';
}

export function vignette(ctx, w, h, amount) {
  if (ctx.canvas._transparent || amount <= 0) return;   // full-canvas darken — skip for transparent PNG export
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${amount * 0.85})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

export function scanlines(ctx, w, h, opts) {
  const { gap = 3, alpha = 0.12 } = opts || {};
  if (ctx.canvas._transparent || alpha <= 0) return;
  ctx.save(); ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = 0; y < h; y += gap) ctx.fillRect(0, y, w, 1);
  ctx.restore();
}

// ambient light gradient for REFLECTIVE panels (flip-dot, e-ink) — lit, not emissive. angle radians.
export function ambientGradient(ctx, w, h, angle, falloff) {
  if (ctx.canvas._transparent) return;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const g = ctx.createLinearGradient(w / 2 - dx * w, h / 2 - dy * h, w / 2 + dx * w, h / 2 + dy * h);
  g.addColorStop(0, `rgba(255,255,255,${0.14 * (1 - falloff)})`);
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, `rgba(0,0,0,${0.22 * (1 - falloff)})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

// cheap chromatic edge: redraw the canvas shifted in R/B. px = offset in logical px.
export function chromaticOffset(ctx, w, h, px) {
  if (!px) return;
  const cv = ctx.canvas;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.22;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dpr = cv._dpr || 1;
  ctx.drawImage(cv, px * dpr, 0);
  ctx.drawImage(cv, -px * dpr, 0);
  ctx.restore();
}

// wear.js — the "lived-in" vocabulary. Reuse these instead of re-implementing wear per module.
// Every function is deterministic in the seed via rng.hash, so wear is reproducible.
// rng = { seed, rand, hash(x, y) } (from rng.js makeRng).

// per-element brightness multiplier in [1 - amount, 1]
export function vary(rng, x, y, amount) {
  return 1 - amount * rng.hash(x, y);
}

// is element (x, y) a weak/dying one, at probability prob (0..1)?
export function isWeak(rng, x, y, prob) {
  return rng.hash(x + 31, y + 17) < prob;
}

// scatter faint dust specks across the panel (light + dark flecks)
export function dust(ctx, rng, density, w, h) {
  if (density <= 0) return;
  const n = Math.floor(density * (w * h) / 1400);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = rng.hash(i + 1, 7) * w, y = rng.hash(i + 3, 11) * h, r = 0.4 + rng.hash(i + 5, 13) * 1.4;
    const light = rng.hash(i, 9) > 0.5;
    ctx.fillStyle = `rgba(${light ? '255,255,255' : '0,0,0'},${0.04 + rng.hash(i + 2, 4) * 0.06})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// thin hairline scratches
export function scratches(ctx, rng, count, w, h) {
  if (count <= 0) return;
  ctx.save(); ctx.lineWidth = 0.6;
  for (let i = 0; i < count; i++) {
    const x = rng.hash(i + 1, 21) * w, y = rng.hash(i + 2, 23) * h;
    const a = rng.hash(i + 3, 25) * Math.PI, len = 8 + rng.hash(i + 4, 27) * 40;
    ctx.strokeStyle = `rgba(255,255,255,${0.03 + rng.hash(i + 5, 29) * 0.05})`;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
  ctx.restore();
}

// fine luminance grain over the whole frame (cheap; coarsened by `step`)
export function grain(ctx, rng, strength, w, h) {
  if (ctx.canvas._transparent || strength <= 0) return;   // full-canvas texture — skip for transparent PNG export
  const step = 3, a = strength * 0.08;
  ctx.save();
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const v = rng.hash((x * 0.5) | 0, ((y * 7) | 0) + ((x * 13) | 0));
      if (v > 0.6) { ctx.fillStyle = `rgba(${v > 0.8 ? '255,255,255' : '0,0,0'},${a * v})`; ctx.fillRect(x, y, step, step); }
    }
  }
  ctx.restore();
}

// rng.js — the single seeded PRNG + spatial hash. ALL randomness in the library flows through here,
// so one `seed` number re-rolls every module's wear identically-reproducibly.

export function mulberry32(a) {
  a = a >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stable per-element hash → [0,1). Same (x, y, seed) ALWAYS yields the same value, so wear stays
// pinned to a pixel/segment across frames and re-renders.
export function hash(x, y, seed = 0) {
  let n = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// The helper object handed to every render(ctx, p, t, rng).
//   rng.rand()      → next value of a seeded stream (use for things that may change frame-to-frame)
//   rng.hash(x, y)  → stable value for element (x, y) under this seed (use for fixed wear)
export function makeRng(seed) {
  const s = (seed >>> 0) || 0;
  const rand = mulberry32(s);
  return { seed: s, rand, hash: (x, y) => hash(x, y, s) };
}

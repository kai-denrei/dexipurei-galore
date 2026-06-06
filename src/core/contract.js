// contract.js — the ONE interface every display module implements, plus param resolution and the
// stage-size helper. controls.js and exporter.js read only this shape, so they stay generic.

/** @typedef {'emissive'|'reflective'|'electromechanical'|'volumetric'|'aerial'} Category */
/**
 * @typedef {Object} Param
 * @property {string} key
 * @property {string} label
 * @property {'range'|'color'|'toggle'|'select'|'text'} type
 * @property {number} [min] @property {number} [max] @property {number} [step]
 * @property {string[]} [options]   // for type 'select'
 * @property {*} default
 * @property {string} [group]       // controls panel groups by this
 */
/**
 * @typedef {Object} Display
 * @property {string} id            // MUST equal the filename stem (e.g. 'dotmatrix' → displays/dotmatrix.js)
 * @property {string} name
 * @property {Category} category
 * @property {string} physics       // one-line note on the real emission/reflection/motion
 * @property {string[]} USES        // core helper names the standalone export should inline (documentary in V1)
 * @property {Param[]} params
 * @property {Object<string,Object>} [presets]   // named partial param bundles
 * @property {(canvas:HTMLCanvasElement)=>any} [init]
 * @property {(ctx:CanvasRenderingContext2D, p:Object, t:number, rng:{seed:number,rand:()=>number,hash:(x:number,y:number)=>number})=>void} render
 * @property {()=>void} [dispose]
 */

/* ============================================================================
   RENDER CONTRACT — read this before adding a module
   ----------------------------------------------------------------------------
   • The APP sizes ctx.canvas (dpr-aware backing store) and applies the dpr transform BEFORE
     calling render. Read your logical drawing area from stageSize(ctx) → { w, h, dpr }, then
     draw within [0,w] × [0,h]. Do NOT resize the canvas yourself — center/scale your content
     into the stage so every module (and the landing mini-previews) share one frame size.
   • Paint your own background (fill the stage) — the app does not clear for you. BUT guard the opaque
     full-canvas backdrop (and any bespoke full-canvas wash/tint YOU draw) behind `if (!p.transparent)`:
     when p.transparent is true (set only during PNG export) skip them so the export keeps alpha. Off
     elements may still use the bg color for compositing — only full-canvas paints are suppressed. The
     shared overlays vignette/scanlines/ambientGradient (fx) and grain (wear) already self-suppress via
     ctx.canvas._transparent, so you do NOT guard those — only your own module-authored full-canvas fills.
   • render is a pure function of (ctx, p, t, rng):
       - route ALL wear/variance/dead-element decisions through rng.hash(x, y) so a seed re-roll
         is reproducible. Use rng.rand() only for things meant to shimmer frame-to-frame.
       - animation may use t (ms). Do not read Date.now()/Math.random() for reproducible state.
   • p carries p.seed plus every param key (resolved from defaults + overrides). presets are
     partial bundles merged over defaults.
   • Reference only your own file-scope helpers and the core utils you `import` and name in USES.
     (The standalone exporter inlines the core utils + your module source so the file runs offline.)
   ============================================================================ */

export function stageSize(ctx) {
  const cv = ctx.canvas;
  const dpr = cv._dpr || 1;
  return { w: cv.width / dpr, h: cv.height / dpr, dpr };
}

// Build a fully-resolved params object from a module's schema + optional overrides. Always includes seed.
export function resolveParams(mod, overrides = {}) {
  const p = { seed: 1 };
  for (const param of mod.params) p[param.key] = param.default;
  return Object.assign(p, overrides);
}

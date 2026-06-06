# HANDOVER — `dexipurei-galore`

> A local repository of procedural **display-method** renderers. Each entry simulates a real display
> technology with physics-grounded behaviour, procedural wear, and adjustable controls, and can export
> both its settings and a self-contained reproduction snippet. The repo is a parts bin: pull any effect
> into other projects.

Codename: **dexipurei-galore** (ディスプレイ galore).
Status: scaffolding + 2 reference modules exist. CLI to build out the remaining 11 + core systems.

---

## 0. What this is

Not an app with a single purpose — a **gallery of display simulators**. Thirteen modules, one shared
contract. Every module:

1. Renders to a `<canvas>` (Canvas 2D; no WebGL/three.js — keep it vanilla and CPU-cheap).
2. Approximates the **real physics** of how that display emits or reflects light (or moves matter).
3. Feels **lived-in**: seeded RNG drives per-element variance, dead/weak elements, dust, scratches,
   flicker, ambient unevenness. Nothing is pixel-perfect.
4. Declares its tunables as a **param schema** → the controls panel and both exporters are generated
   from that schema. No bespoke UI per module.
5. Supports two exports: **(a)** the current variable set as JSON, **(b)** a standalone runnable
   `.html` reproducing *that* effect with *those* settings, zero dependencies, offline.

End goal: a browsable local repo I open, tune, and harvest from.

---

## 1. Hard conventions (do not deviate without flagging)

- **Vanilla ES modules, no build step.** No bundler, no framework. Native `import`/`export`.
  - Caveat: ES modules need HTTP, not `file://`. Ship a one-line runner note (`python3 -m http.server`)
    and make the exported standalone snippets **single-file, no-module** so they run from `file://`.
- **Canvas 2D only.** Manual perspective projection where 3D is needed (voxel). No external render libs.
- **Aesthetic — dark editorial.** Near-black canvas/bezel, generous negative space.
  - Type: `Cormorant Garamond` / `EB Garamond` for headings, `JetBrains Mono` for UI + values.
  - Accents: amber `#ffb000`, teal `#00e5d0`. Color math in **OKLCH** where mixing/derivation is needed.
  - Tokens live in `src/core/ui.css` as CSS variables. One source of truth.
- **Determinism.** All randomness flows through a single seeded PRNG. A `seed` control re-rolls every
  module's wear identically-reproducibly. Same seed + same params = same frame.
- **No PII** anywhere in code, comments, sample text, or exports. Keep all placeholder content generic.

---

## 2. Repo layout

```
dexipurei-galore/
├── index.html                 # gallery shell: module list + active display + controls panel
├── README.md                  # how to run + how to add a module
├── HANDOVER.md                # this file
└── src/
    ├── core/
    │   ├── contract.js        # Display interface (JSDoc types) + param-schema spec
    │   ├── registry.js        # imports & registers all displays
    │   ├── controls.js        # builds the slider/color/select panel from a param schema
    │   ├── rng.js             # mulberry32 PRNG + spatial hash(x,y,seed)
    │   ├── wear.js            # variance, dead/weak masks, dust, scratches, grain
    │   ├── fx.js              # bloom (offscreen blur+lighter), vignette, scanlines,
    │   │                      #   ambient-light gradient, chromatic offset
    │   ├── exporter.js        # exportParams() + exportStandalone()
    │   ├── standalone.tpl.js  # template string for the single-file export harness
    │   └── ui.css             # design tokens + panel/bezel styling
    └── displays/
        ├── dotmatrix.js       # EXISTING — port to contract; use as the canonical example
        ├── sevenseg.js        # EXISTING (link below) — port to contract
        ├── nixie.js
        ├── vfd.js
        ├── starburst16.js
        ├── splitflap.js
        ├── flipdot.js
        ├── odometer.js
        ├── lixie.js
        ├── crt.js
        ├── eink.js
        ├── voxel.js
        └── fog.js
```

### LINKS — fill these in before starting
- Existing **dot-matrix** module: `<<<LINK>>>` (the reference for the contract; round LED grid, off-dot
  grid, hot core, halo bloom, per-pixel variance, weak dots, flicker, vignette — already correct).
- Existing **7-segment** module: `<<<LINK>>>` (port to contract; preserve its segment geometry).

---

## 3. The Display contract

Every module default-exports one object implementing this. The two existing modules define the shape;
match it exactly so `controls.js` and `exporter.js` stay generic.

```js
/** @typedef {'emissive'|'reflective'|'electromechanical'|'volumetric'|'aerial'} Category */

export default {
  id: 'nixie',
  name: 'Nixie Tube',
  category: 'emissive',
  physics: 'Cold-cathode neon glow discharge around stacked wire numerals; ~605nm orange.',

  // Schema → controls panel AND exporter both read this. One declaration.
  params: [
    { key:'glow',      label:'glow radius',  type:'range', min:0,  max:40, step:1, default:14, group:'glow' },
    { key:'depth',     label:'stack depth',  type:'range', min:0,  max:30, step:1, default:12, group:'geometry' },
    { key:'ghost',     label:'ghost digits', type:'range', min:0,  max:100,step:1, default:18, group:'wear' },
    { key:'poison',    label:'cathode poison',type:'range',min:0,  max:100,step:1, default:10, group:'wear' },
    { key:'color',     label:'neon color',   type:'color', default:'#ff7a18', group:'glow' },
    { key:'mesh',      label:'anode mesh',   type:'toggle', default:true, group:'geometry' },
    // ...
  ],

  presets: { warm:{...}, fresh:{...}, tired:{...} },   // named param bundles

  init?(canvas){ /* optional one-time setup; return any module-local state */ },
  render(ctx, p, t, rng){ /* p = resolved params; t = ms; rng = seeded helpers */ },
  dispose?(){},
}
```

`render` must be a **pure function of `(ctx, p, t, rng)`** and may only reference: its own module-scope
constants/helpers (declared in the same file) and the shared utils it explicitly lists in a top-of-file
`USES = ['bloom','vignette','hash']` array. The exporter inlines exactly those utils — see §5.

---

## 4. Shared systems (`src/core`)

- **`rng.js`** — `mulberry32(seed)` PRNG; `hash(x,y,seed)`→[0,1) spatial hash for stable per-element wear.
  Global `seed` is itself a param on every module (injected by the shell), so the whole library re-rolls
  from one number.
- **`wear.js`** — `variance(rng,amount)`, `isWeak(x,y,seed,prob)`, `dust(ctx,seed,density)`,
  `scratches(ctx,seed,count)`, `grain(ctx,seed,strength)`. These are the lived-in vocabulary; reuse them
  rather than re-implementing wear per module.
- **`fx.js`** — `bloom(ctx, drawFn, blur, intensity)` (offscreen canvas → `blur()` → `globalCompositeOperation='lighter'`),
  `vignette(ctx, amount)`, `scanlines(ctx, opts)`, `ambientGradient(ctx, angle, falloff)` (for reflective
  panels), `chromaticOffset(ctx, px)`.
- **`controls.js`** — renders the panel from `params[]`; groups by `group`; live-binds to a resolved
  params object; includes the global `seed` field, a re-roll button, preset buttons, and the two export
  buttons.

---

## 5. The two exports (this is the load-bearing feature)

**Export 1 — variables.** Serialize `{id, seed, params}` to JSON. Copy-to-clipboard + download `.json`.
Provide a matching **import** (paste JSON → restore). Trivial; do this first to de-risk.

**Export 2 — reproduction code.** Produce one **self-contained `.html`** that renders *this* module at
*these* settings with no dependencies and runs from `file://`:

1. Read the module's `USES` list; pull the source of exactly those `fx`/`wear`/`rng` helpers.
2. Inline: those helpers + the module's `render` (via `Function.prototype.toString()` on the declared
   helpers and render, or a small source map keyed by name — pick one and document it in `exporter.js`).
3. Freeze the current resolved params as a literal object.
4. Wrap in `standalone.tpl.js`: a minimal RAF loop, a sized canvas, the dark bezel, and the frozen params.
5. Result is a tiny readable file the user can drop into any project and adapt.

Constraint: the standalone must be **no-module** (plain `<script>`), single file, offline. Verify each
module's export actually runs before marking it done.

---

## 6. Module specs

For every module: document the physics note, cover the listed sliders, route all wear through the seed,
and verify both exports. Categories tag the dominant behaviour.

### 00 · Dot-Matrix LED — *existing, emissive* — reference implementation
Round emissive LEDs on a dark grid. Already correct. Port to the contract; it is the canonical example
the others copy. Sliders already present: pitch, fill, hot-core (whiteness/size/intensity), halo bloom
(spread/intensity), off-dot grid, variance, weak dots, flicker, vignette, color/bg, round/square.

### 01 · Seven-Segment — *existing, emissive*
Port the linked module. Physics: emissive (or LCD) bar segments. Add if missing: **off-segment ghost**
(the faint full "8" behind the lit digit), segment-junction bleed, decimal point, one habitually-dim
segment as wear. Sliders: segment color, ghost brightness, bleed, per-segment variance, dim-segment
index, glow.

### 02 · Nixie — *emissive*
Physics: cold-cathode neon glow around shaped wire numerals, ~605nm orange. **Stacked digits at
different Z** → real parallax/overlap; an anode mesh sits in front; lit numeral glows, others are faint
warm ghosts. Render: layered numeral paths with depth offset + soft additive glow; optional mesh
overlay. Wear: **cathode poisoning** (rarely-lit digits glow unevenly/dim), warm-up ramp on switch,
slight digit jitter, flicker. Sliders: glow radius, stack depth/parallax, ghost-digit brightness,
poisoning amount, mesh visibility, warm-up time, color.

### 03 · VFD — *emissive*
Physics: phosphor anodes in vacuum excited by electrons, **cyan-green ~505nm**, gated by a grid;
characteristic faint **heater-filament wires** crossing the display; segment or dot-matrix form. Render:
cyan-green elements with soft bloom + slight blue-white core; thin always-faint filament lines; uneven
segment brightness. Wear: age-dimming, the faint always-on glow on "off" elements, filament-hum flicker.
Sliders: phosphor color, filament-wire visibility, glow, element style (seg/dot), age dimming, flicker.

### 04 · 16-Segment Starburst — *emissive*
Physics: same emissive bars as 7-seg, but 14/16 segments (diagonals + split horizontals) → full
alphanumeric. Real work is the **segment geometry + glyph map** for A–Z/0–9. Share segment-draw code
with 7-seg. Sliders: as 7-seg + 14/16 toggle. Wear: off-segment ghost, junction bleed, uneven intensity.

### 05 · Split-flap (Solari) — *electromechanical*
Physics: printed cards on a drum flip through the alphabet to the target; classic two-leaf split with a
horizontal seam; cascade + settle bounce. Render: animate the flip (top leaf folds down), motion blur on
fast flips, seam shadow, settle overshoot. Wear: slightly misaligned/worn cards, aged off-white card
stock, occasional **sticky card** that lands a frame late, dust. Sliders: flip speed, flips-to-target,
card color/wear, seam darkness, misalignment jitter, settle bounce. (Audio clatter: optional, off by
default — see open questions.)

### 06 · Flip-dot — *electromechanical, REFLECTIVE*
Physics: discs black on one face, color (fluoro yellow) on the other, magnetically flipped. **Reflective,
not emissive** — lit by ambient light, so use `ambientGradient`, not bloom. Render: matte discs with a
subtle bevel/cavity shadow; flip = rotation about a diameter; **per-dot flip stagger** so images wipe in.
Wear: stuck dots, discs resting at slightly-off angles, dust, recessed black cavity on "off" dots.
Sliders: disc color, flip stagger, stuck-dot count, bevel/shadow depth, ambient-light angle, gap.

### 07 · Odometer counter — *electromechanical*
Physics: mechanical number drums rolling vertically; rollover cascades (9→0 advances next wheel) with the
two-half-digit transition. Render: cylindrical drums with perspective compression top/bottom, dark
inter-drum gap shadow, eased roll. Wear: slightly-off rest alignment, worn paint, drum sheen, one wheel
that sits a hair high. Sliders: digit count, roll speed/easing, drum curvature, gap shadow, wear, font.

### 08 · Lixie — *emissive, layered* — **10 transparent layers required**
Physics: edge-lit engraved acrylic. **Exactly 10 stacked transparent panels**, each etched with one
numeral 0–9, lit edge-on by an LED so the active numeral's etched lines scatter light and the digit
appears to float in the stack. Render: 10 semi-transparent layers with small Z/parallax offsets; active
numeral glows along its etch lines; inactive numerals are faint always-visible ghosts (all ten overlap);
edge-LED color bleed at panel borders. Wear: dust/scratches on panels, uneven per-layer LED brightness,
slight chromatic edge. Sliders: per-layer offset, etch-line width, glow color, inactive-ghost
visibility, scratch/dust amount, edge-LED bleed.

### 09 · CRT — *emissive* — richest module
Physics: electron beam on phosphor. Default **raster** mode; expose a **vector** mode toggle (line-draw
with beam bloom, no pixels). Raster effects: scanlines, phosphor mask (aperture-grille / shadow-mask /
RGB-triad — selectable), halation bloom, barrel curvature, persistence/afterglow, rolling refresh bar,
horizontal jitter, edge chromatic aberration, vignette, dot crawl. Wear: degauss wobble on power-on,
geometry drift, faint burn-in ghost, brightness flicker, dust on glass. Sliders: scanline strength, mask
type/scale, curvature, bloom, persistence, jitter, chroma, refresh-roll speed, burn-in, mode (raster/vector).

### 10 · E-ink — *reflective, bistable* — the non-emissive reference
Physics: electrophoretic; charged pigment in microcapsules; **no glow**, ambient-lit, paper-like.
Render: greyish-white paper, high-contrast dark content, matte. Signature artifacts: **full-refresh
flash** (invert to black then redraw) on update, and **partial-refresh ghosting** (faint residue of the
previous frame). Wear: ghost residue buildup, microcapsule grain, slightly-off white, edge contrast
falloff, permanent grey dead-pixel blobs. Sliders: contrast, ghosting amount, refresh-flash toggle,
paper tint, grain, update animation speed. Keep it matte — this is the library's deliberate counterpoint
to all the glowing modules.

### 11 · 3D Volumetric voxel — *volumetric*
Physics: true 3D voxels via a swept rotating screen or static lattice. Render: a 3D point grid in manual
perspective projection (Canvas 2D, depth-sorted point sprites), slow rotation; glowing voxels with depth
fog; optional faint **sweep plane** to imply a rotating-screen display; persistence trails. Keep
CPU-cheap (cap voxel count; cull occluded). Wear: flicker, dead voxels, density falloff at sweep edges,
depth haze. Sliders: grid resolution, rotation speed, voxel size/glow, depth fog, sweep-plane
visibility, dead-voxel rate, color.

### 12 · Fog projection — *aerial* — **assumed "Fox" was a typo for "Fog"; confirm**
Physics: image projected onto a thin drifting mist curtain → soft, low-contrast, rippling, intermittently
dropping out. Render: base content + animated volumetric noise (curl/flow noise) warping and modulating
opacity so the image breathes; light-scatter halo; faint projection cone. Wear: turbulence drift, density
flicker, dropout where mist thins, chromatic scatter, ambient haze. Sliders: fog density, turbulence
speed/scale, scatter/glow, dropout amount, cone visibility, color.

---

## 7. Build order

**Phase A — core + validate the contract**
`rng.js`, `wear.js`, `fx.js`, `contract.js`, `controls.js`, `ui.css`, the gallery shell, then **port
the two existing modules** (dot-matrix, 7-seg) onto the contract. Then build `exporter.js` + the
standalone template and prove both exports against those two. Do not proceed until export-2 produces a
file that runs offline.

**Phase B — emissive segment/glow family** (share segment geometry): 16-seg starburst, then Nixie, VFD.

**Phase C — electromechanical** (share easing/animation utils): split-flap, flip-dot, odometer.

**Phase D — optical/layered**: Lixie, CRT, E-ink.

**Phase E — volumetric/aerial**: voxel, fog.

Commit per module. Keep each module under ~250 lines where possible; push shared behaviour into core.

---

## 8. Acceptance criteria (per module)

- [ ] Physics note written; render visibly approximates the real technology.
- [ ] All listed sliders present, grouped, live.
- [ ] All wear/variance/flicker routed through the global seed; re-roll changes it deterministically.
- [ ] Export-1 round-trips (export JSON → import → identical frame).
- [ ] Export-2 produces a single-file `.html` that runs offline at the captured settings.
- [ ] No external deps beyond Google Fonts; no PII; matches the design tokens.

---

## 9. Open questions for the owner

1. **"Fox projection" → "Fog projection"?** Assumed mist-curtain projection. Confirm or correct.
2. **Audio** for split-flap / flip-dot clatter — wanted, or stay silent/visual-only? (Default: off.)
3. Export-2 target: **standalone HTML only**, or also emit a framework-agnostic `render()` snippet?
4. Strict **no-build / file://** for the gallery too, or is a `python -m http.server` dev step acceptable
   for the gallery (exports stay single-file regardless)?
5. Glyph coverage for alphanumeric modules (16-seg, split-flap): digits-only, A–Z, or full ASCII?

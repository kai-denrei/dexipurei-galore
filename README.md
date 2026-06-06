# dexipurei-galore — ディスプレイ galore

A local, browsable **parts bin of procedural display-method simulators**. Each module renders a real
display technology to a `<canvas>` (Canvas 2D, no WebGL) with physics-grounded light behaviour, seeded
procedural wear (dead pixels, dust, flicker), a controls panel generated from its param schema, and three
exports: settings as JSON, a self-contained `.html` that reproduces the effect offline, and a hi-res
**transparent PNG** snapshot.

Open it, tune an effect, harvest it into other projects.

## Run

ES modules need HTTP (not `file://`), so serve the folder:

```bash
python3 -m http.server 8000
# then open http://127.0.0.1:8000
```

The **gallery** tab shows every module as a live minimal preview side by side; click any tab to open it
with full controls. (The exported standalone files are single-file / no-module and DO run from `file://`.)

## Modules (all 13)

| id | name | category | notes |
|---|---|---|---|
| `dotmatrix` | Dot-Matrix LED | emissive | hot core + halo bloom, weak/dead dots, flicker; **unicode/Japanese** via the rasterizer; `kanji grid` slider for finer CJK |
| `sevenseg` | Seven-Segment | emissive | VFD hex bars, off-segment ghost, one habitually-dim segment, decimal + clock colon |
| `starburst16` | 16-Segment Starburst | emissive | full alphanumeric glyph map; 14/16-segment toggle |
| `nixie` | Nixie Tube | emissive | stacked neon numerals with depth, cathode poisoning, anode mesh, warm-up |
| `vfd` | Vacuum Fluorescent | emissive | cyan-green, heater-filament wires, gate grid, `segment`/`dot` styles |
| `splitflap` | Split-flap (Solari) | electromechanical | two-leaf flip, seam shadow, cascade + settle bounce, sticky cards |
| `flipdot` | Flip-Dot | reflective | matte fluoro-yellow discs, ambient-lit, per-column flip wipe, stuck dots |
| `odometer` | Odometer | electromechanical | cylindrical number drums, 9→0 carry, perspective compression |
| `lixie` | Lixie Tube | emissive | exactly 10 edge-lit acrylic layers, floating digit, overlapping ghosts |
| `crt` | Cathode-Ray Tube | emissive | scanlines, phosphor mask (grille/shadow/triad), halation, rolling refresh, curvature, burn-in |
| `eink` | E-ink | reflective | matte paper, full-refresh flash, partial-refresh ghosting, capsule grain — the non-emissive counterpoint |
| `voxel` | Volumetric Voxel | volumetric | manual 3D perspective point lattice, depth fog, sweep plane |
| `fog` | Fog Projection | aerial | content on drifting mist, flow-noise warp + dropout, projection cone |

Bitmap displays (dot-matrix, flip-dot, CRT, e-ink, fog) render **Japanese/unicode** via the rasterizer;
segment displays (7-seg, 16-seg) are alphanumeric — segment bars physically can't form kanji.

## Exports (per module)

- **params `.json`** — `{id, seed, params}`, copy + download; round-trips via **import `.json`**.
- **snapshot `.png` ⬓** — a hi-res render with **transparent** background (the opaque backdrop + full-canvas
  overlays are suppressed; only the lit elements keep alpha).
- **standalone `.html`** — inlines the core utils + the module source + frozen params into one no-module
  file that runs offline from `file://`.

## Layout

```
index.html                gallery shell (tab rail · stage · generated controls · landing)
cb-badge.js, cb-shapes/    cache-bust version badge (top-left): 3 shape tiles + 8-char token
scripts/bust.sh            bump the version token (fingerprints assets, rotates favicon)
src/
  app.js                   driver: loads modules, owns canvas sizing + RAF, wires controls
  core/
    contract.js            the frozen Display interface + stageSize() + resolveParams()  ← READ FIRST
    rng.js wear.js fx.js   seeded PRNG · lived-in wear vocabulary · bloom/vignette/scanlines/ambient
    color.js text-raster.js  sRGB+OKLCH helpers · 5×7 ASCII + font-rasterized unicode (cached)
    controls.js            builds the panel from a module's params[]
    exporter.js standalone.tpl.js  JSON + transparent PNG + offline single-file HTML export
    registry.js            lists the module stems to load
    ui.css                 design tokens (single source of truth)
  displays/<id>.js         one file per display, default-exports a Display
```

## Add a module

1. Copy the shape of `src/displays/dotmatrix.js` (or `sevenseg.js`). Default-export
   `{ id, name, category, physics, USES, params, presets, render(ctx, p, t, rng) }`.
   `id` **must equal the filename stem**.
2. Read the **RENDER CONTRACT** comment in `src/core/contract.js`: the app sizes the canvas for you
   (read `stageSize(ctx)`), you fill the background and draw within `[0,w]×[0,h]`, and you route all
   wear through `rng.hash(x,y)` so a seed re-roll is reproducible.
3. **Transparency:** guard your opaque backdrop + any bespoke full-canvas wash behind `if (!p.transparent)`
   so the PNG export keeps alpha. Shared `fx` overlays + `wear.grain` self-suppress; don't guard those.
4. Import only from `../core/*.js`, keep every other helper in-file (the exporter inlines core + your
   file), and list the core helpers you use in `USES`.
5. Add the stem to `MODULE_FILES` in `src/core/registry.js`. Done — it appears as a tab and a preview.

## Versioning / cache-busting

`./scripts/bust.sh` mints a fresh token and rewrites it across the asset `?v=` query strings, the
`<meta name="cb">` tag, and the favicon shape cell. The **badge top-left** (3 shapes + the 8 hex chars)
is the human-visible build id — if it changed shape/colour after a reload, you're on the new build.

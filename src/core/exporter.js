// exporter.js — the two load-bearing exports.
//   1) params → JSON (copy + download), with a matching import.
//   2) a self-contained .html that renders THIS module at THESE settings, offline, zero deps.
//
// Standalone strategy (V1): inline the actual SOURCE TEXT of the core utils + the module file
// (imports stripped, `export` keywords removed, `export default` → a named global). Because every
// reference resolves to an inlined global, this sidesteps Function.prototype.toString() closure
// fragility — at the cost of inlining all core utils rather than only the module's USES list.
// (Trimming to USES is a later optimization; see .deban/roles/arch.md.)

import { standaloneHTML } from './standalone.tpl.js';
import { makeRng } from './rng.js';

const CORE_FILES = ['rng', 'color', 'contract', 'text-raster', 'wear', 'fx'];

function paramsOnly(mod, state) {
  const p = {};
  for (const param of mod.params) p[param.key] = state[param.key];
  return p;
}

function download(filename, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Snapshot the current state to a hi-res PNG. transparent:true sets p.transparent so modules skip
// their opaque backdrop (see the RENDER CONTRACT) — the result keeps alpha around the lit elements.
export function exportPNG(mod, state, opts = {}) {
  const transparent = opts.transparent !== false;
  const W = opts.w || 1280, H = opts.h || Math.round(W / 2.15), dpr = opts.scale || 2;
  const off = document.createElement('canvas');
  off.width = W * dpr; off.height = H * dpr; off._dpr = dpr; off._transparent = transparent;
  const ctx = off.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (mod.init) { try { mod._s = mod.init(off); } catch (e) {} }
  try {
    const t = typeof performance !== 'undefined' ? performance.now() : 0;
    mod.render(ctx, Object.assign({}, state, { transparent }), t, makeRng(state.seed));
  } catch (e) { alert('PNG export failed: ' + e.message); return; }
  off.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${mod.id}-${state.seed >>> 0}${transparent ? '-alpha' : ''}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }, 'image/png');
}

export function exportParams(mod, state) {
  const payload = JSON.stringify({ id: mod.id, seed: state.seed >>> 0, params: paramsOnly(mod, state) }, null, 2);
  if (navigator.clipboard) navigator.clipboard.writeText(payload).catch(() => {});
  download(`${mod.id}-params.json`, payload, 'application/json');
}

export function importParams(mod, json, state) {
  try {
    const obj = JSON.parse(json);
    if (obj.seed != null) state.seed = obj.seed >>> 0;
    if (obj.params) for (const k in obj.params) if (k in state) state[k] = obj.params[k];
  } catch (e) {
    alert('Invalid params JSON: ' + e.message);
  }
}

function strip(src) {
  return src
    .replace(/^[ \t]*import[^\n]*\n/gm, '')
    .replace(/export\s+default\s+/, 'const __MOD__ = ')
    .replace(/^export\s+/gm, '');
}

export async function exportStandalone(mod, state) {
  try {
    const base = import.meta.url;
    const coreSrcs = await Promise.all(
      CORE_FILES.map((f) => fetch(new URL(`./${f}.js`, base)).then((r) => r.text()))
    );
    const moduleSrc = await fetch(new URL(`../displays/${mod.id}.js`, base)).then((r) => r.text());
    const coreSrc = CORE_FILES.map((f, i) => `// --- core/${f}.js ---\n` + strip(coreSrcs[i])).join('\n\n');
    const html = standaloneHTML({
      name: mod.name,
      id: mod.id,
      seed: state.seed >>> 0,
      params: paramsOnly(mod, state),
      coreSrc,
      moduleSrc: `// --- displays/${mod.id}.js ---\n` + strip(moduleSrc),
    });
    download(`${mod.id}-standalone.html`, html, 'text/html');
  } catch (e) {
    alert('Standalone export failed: ' + e.message);
    console.error(e);
  }
}

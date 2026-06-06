// app.js — gallery driver. The LANDING shows one text input + a live preview per module; previews
// that CAN render the typed text show it, the rest dim with a capability hint. Selecting a module
// opens the FULL VIEW (display pinned to the top, collapsible controls below). The app sizes the
// canvas (dpr-aware) and applies the transform; modules only draw within stageSize(ctx).

import { loadModules } from './core/registry.js';
import { resolveParams } from './core/contract.js';
import { makeRng } from './core/rng.js';
import { buildControls } from './core/controls.js';

const app = document.getElementById('app');
const tabsEl = document.getElementById('tabs');
const landingView = document.getElementById('landing-view');
const moduleView = document.getElementById('module-view');
const landingInput = document.getElementById('landing-input');
const landingEl = document.getElementById('landing');
const panelEl = document.getElementById('panel');
const physicsEl = document.getElementById('physics');
const titleEl = document.getElementById('module-name');
const cv = document.getElementById('screen');
const ctx = cv.getContext('2d');

// what each display can render. 'any' = rasterizer/font (kana/kanji ok); 'alnum' = segment alphanumeric;
// 'num' = numerals only. key = the text param to drive from the landing input (null = none).
const CAPS = {
  dotmatrix: { accepts: 'any', key: 'text' }, crt: { accepts: 'any', key: 'text' },
  eink: { accepts: 'any', key: 'text' }, fog: { accepts: 'any', key: 'text' },
  flipdot: { accepts: 'any', key: 'text' }, splitflap: { accepts: 'any', key: 'text' },
  voxel: { accepts: 'any', key: 'text' },
  starburst16: { accepts: 'alnum', key: 'text' }, vfd: { accepts: 'alnum', key: 'text' },
  sevenseg: { accepts: 'num', key: 'text' }, nixie: { accepts: 'num', key: 'text' },
  lixie: { accepts: 'num', key: 'text' }, odometer: { accepts: 'num', key: null },
};
const ALNUM = /^[a-z0-9 .,:'\-\/!?+=°]*$/i;
const NUM = /^[0-9 .:\-]*$/;
function canRender(accepts, str) {
  if (accepts === 'any') return true;
  if (accepts === 'alnum') return ALNUM.test(str);
  return NUM.test(str);
}

let mods = [], active = null, state = null, raf = 0, landingRaf = 0;
const minis = [];

// size the canvas to fill its bezel (the bezel has a CSS height — the display occupies the top of the view).
function sizeCanvas() {
  const w = Math.max(120, cv.clientWidth), h = Math.max(100, cv.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv._dpr = dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function stopLoops() { cancelAnimationFrame(raf); cancelAnimationFrame(landingRaf); raf = 0; landingRaf = 0; }
function markActiveTab(id) { [...tabsEl.children].forEach((b) => b.setAttribute('aria-pressed', b.dataset.id === id)); }

function selectModule(mod) {
  stopLoops();
  if (active && active.dispose) { try { active.dispose(); } catch (e) {} }
  app.dataset.view = 'module';
  landingView.hidden = true; moduleView.hidden = false;
  active = mod;
  state = resolveParams(mod, {});
  // carry the typed text into the full view when the display can show it
  const cap = CAPS[mod.id] || { accepts: 'any', key: 'text' };
  const typed = (landingInput.value || '').trim();
  if (typed && cap.key && cap.key in state && canRender(cap.accepts, typed)) {
    state[cap.key] = typed;
    if ('source' in state) state.source = 'text';
  }
  if (mod.init) { try { mod._s = mod.init(cv); } catch (e) { console.warn(e); } }
  titleEl.textContent = mod.name;
  physicsEl.textContent = mod.physics;
  buildControls(panelEl, mod, state, () => {});
  markActiveTab(mod.id);
  window.scrollTo(0, 0);
  requestAnimationFrame(() => { sizeCanvas(); });   // size after the sticky stage lays out
  const frame = (t) => {
    ctx.setTransform(cv._dpr, 0, 0, cv._dpr, 0, 0);
    try { mod.render(ctx, state, t, makeRng(state.seed)); }
    catch (e) { console.error('[render]', mod.id, e); stopLoops(); }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

function presetFor(mod) {
  const o = mod.presets ? mod.presets[Object.keys(mod.presets)[0]] : null;
  return Object.assign({ seed: 7 }, o || {});
}

function buildLanding() {
  landingEl.innerHTML = '';
  minis.length = 0;
  mods.forEach((mod) => {
    const card = document.createElement('button');
    card.className = 'mini-card'; card.onclick = () => selectModule(mod);
    const c = document.createElement('canvas'); c.className = 'mini-canvas';
    const badge = document.createElement('span'); badge.className = 'mini-badge'; badge.hidden = true;
    const label = document.createElement('span'); label.className = 'mini-label';
    label.innerHTML = `<b>${mod.name}</b><i>${mod.category}</i>`;
    card.appendChild(badge); card.appendChild(c); card.appendChild(label);
    landingEl.appendChild(card);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = 256 * dpr; c.height = 124 * dpr; c._dpr = dpr;
    const cap = CAPS[mod.id] || { accepts: 'any', key: 'text' };
    const st = resolveParams(mod, presetFor(mod));
    minis.push({
      mod, cap, card, badge, cctx: c.getContext('2d'), st,
      defText: cap.key ? st[cap.key] : null,
      defSource: 'source' in st ? st.source : null,
    });
  });
  applyLandingText(landingInput.value || '');
  const tick = (t) => {
    for (const m of minis) {
      m.cctx.setTransform(m.cctx.canvas._dpr, 0, 0, m.cctx.canvas._dpr, 0, 0);
      try { m.mod.render(m.cctx, m.st, t, makeRng(m.st.seed)); } catch (e) {}
    }
    landingRaf = requestAnimationFrame(tick);
  };
  landingRaf = requestAnimationFrame(tick);
}

// drive every preview from the one input: capable previews show the text; others dim + hint, default content.
function applyLandingText(raw) {
  const str = (raw || '').trim();
  for (const m of minis) {
    const ok = str === '' || canRender(m.cap.accepts, str);
    m.card.classList.toggle('dim', !ok);
    if (m.cap.key && m.cap.key in m.st) {
      if (ok && str !== '') { m.st[m.cap.key] = str; if ('source' in m.st) m.st.source = 'text'; }
      else { m.st[m.cap.key] = m.defText; if (m.defSource != null) m.st.source = m.defSource; }
    }
    m.badge.hidden = ok;
    if (!ok) m.badge.textContent = m.cap.accepts === 'num' ? '0–9 only' : 'A–Z 0–9';
  }
}

function showLanding() {
  stopLoops();
  if (active && active.dispose) { try { active.dispose(); } catch (e) {} }
  active = null;
  app.dataset.view = 'landing';
  moduleView.hidden = true; landingView.hidden = false;
  markActiveTab('__landing');
  buildLanding();
}

function buildTabs() {
  tabsEl.innerHTML = '';
  const landingBtn = document.createElement('button');
  landingBtn.className = 'tab tab-landing'; landingBtn.dataset.id = '__landing';
  landingBtn.textContent = '⊞ gallery'; landingBtn.onclick = showLanding;
  tabsEl.appendChild(landingBtn);
  mods.forEach((mod) => {
    const b = document.createElement('button');
    b.className = 'tab'; b.dataset.id = mod.id;
    b.innerHTML = `<span class="tab-name">${mod.name}</span><span class="tab-cat">${mod.category}</span>`;
    b.onclick = () => selectModule(mod);
    tabsEl.appendChild(b);
  });
}

landingInput.addEventListener('input', () => applyLandingText(landingInput.value));
document.getElementById('back-btn').addEventListener('click', showLanding);
window.addEventListener('resize', () => { if (active) sizeCanvas(); });

loadModules().then((loaded) => {
  mods = loaded;
  if (!mods.length) { landingEl.innerHTML = '<p style="color:var(--dim);padding:20px">no modules loaded — check the console.</p>'; return; }
  buildTabs();
  showLanding();
});

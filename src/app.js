// app.js — gallery driver. Loads modules, builds the tab rail + landing, owns canvas sizing and
// the RAF loop, and wires the generated controls panel. Modules never size the canvas — the app
// does (dpr-aware) and applies the transform; modules draw within stageSize(ctx).

import { loadModules } from './core/registry.js';
import { resolveParams } from './core/contract.js';
import { makeRng } from './core/rng.js';
import { buildControls } from './core/controls.js';

const tabsEl = document.getElementById('tabs');
const panelEl = document.getElementById('panel');
const stageWrap = document.getElementById('stage-wrap');
const landingEl = document.getElementById('landing');
const physicsEl = document.getElementById('physics');
const titleEl = document.getElementById('module-name');
const cv = document.getElementById('screen');
const ctx = cv.getContext('2d');

let mods = [], active = null, state = null, raf = 0, landingRaf = 0;
const minis = [];

function sizeCanvas() {
  const bez = cv.parentElement;
  const w = Math.max(140, bez.clientWidth - 44);
  const h = Math.max(90, Math.round(w / 2.15));
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv._dpr = dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function stopLoops() { cancelAnimationFrame(raf); cancelAnimationFrame(landingRaf); raf = 0; landingRaf = 0; }

function markActiveTab(id) {
  [...tabsEl.children].forEach((b) => b.setAttribute('aria-pressed', b.dataset.id === id));
}

function selectModule(mod) {
  stopLoops();
  if (active && active.dispose) { try { active.dispose(); } catch (e) {} }
  landingEl.hidden = true; stageWrap.hidden = false; panelEl.hidden = false;
  active = mod;
  state = resolveParams(mod, {});
  if (mod.init) { try { mod._s = mod.init(cv); } catch (e) { console.warn(e); } }
  titleEl.textContent = mod.name;
  physicsEl.textContent = mod.physics;
  buildControls(panelEl, mod, state, () => {});
  sizeCanvas();
  markActiveTab(mod.id);
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
    card.className = 'mini-card';
    card.onclick = () => selectModule(mod);
    const c = document.createElement('canvas');
    c.className = 'mini-canvas';
    const label = document.createElement('span');
    label.className = 'mini-label';
    label.innerHTML = `<b>${mod.name}</b><i>${mod.category}</i>`;
    card.appendChild(c); card.appendChild(label);
    landingEl.appendChild(card);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = 248, h = 120;
    c.style.width = w + 'px'; c.style.height = h + 'px';
    c.width = w * dpr; c.height = h * dpr; c._dpr = dpr;
    minis.push({ mod, cctx: c.getContext('2d'), st: resolveParams(mod, presetFor(mod)) });
  });
  const tick = (t) => {
    for (const m of minis) {
      m.cctx.setTransform(m.cctx.canvas._dpr, 0, 0, m.cctx.canvas._dpr, 0, 0);
      try { m.mod.render(m.cctx, m.st, t, makeRng(m.st.seed)); } catch (e) {}
    }
    landingRaf = requestAnimationFrame(tick);
  };
  landingRaf = requestAnimationFrame(tick);
}

function showLanding() {
  stopLoops();
  if (active && active.dispose) { try { active.dispose(); } catch (e) {} }
  active = null;
  stageWrap.hidden = true; panelEl.hidden = true; landingEl.hidden = false;
  titleEl.textContent = 'gallery';
  physicsEl.textContent = 'a parts bin of procedural display simulators — pick one to tune & harvest';
  markActiveTab('__landing');
  buildLanding();
}

function buildTabs() {
  tabsEl.innerHTML = '';
  const landingBtn = document.createElement('button');
  landingBtn.className = 'tab tab-landing'; landingBtn.dataset.id = '__landing';
  landingBtn.textContent = '⊞ gallery';
  landingBtn.onclick = showLanding;
  tabsEl.appendChild(landingBtn);
  mods.forEach((mod) => {
    const b = document.createElement('button');
    b.className = 'tab'; b.dataset.id = mod.id;
    b.innerHTML = `<span class="tab-name">${mod.name}</span><span class="tab-cat">${mod.category}</span>`;
    b.onclick = () => selectModule(mod);
    tabsEl.appendChild(b);
  });
}

window.addEventListener('resize', () => { if (active) sizeCanvas(); });

loadModules().then((loaded) => {
  mods = loaded;
  if (!mods.length) { titleEl.textContent = 'no modules loaded'; physicsEl.textContent = 'check the console — displays/*.js failed to import'; return; }
  buildTabs();
  showLanding();
});

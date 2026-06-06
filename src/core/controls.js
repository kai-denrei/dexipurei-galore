// controls.js — builds the slider/color/select/toggle panel from a module's params[]. Groups by
// `group`, adds the global seed field + re-roll, preset buttons, and the export buttons. Live-binds
// every control to the resolved `state` object (mutated in place; the RAF loop reads it each frame).

import { exportParams, importParams, exportStandalone, exportPNG } from './exporter.js';

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) e.appendChild(c);
  return e;
}

function row(label, control, valueEl) {
  return el('div', { class: 'row' }, [el('label', { text: label }), control, valueEl || el('span', { class: 'val' })]);
}

// a collapsible control group: header with a +/− toggle, body that hides when collapsed.
function group(name, children) {
  const toggle = el('span', { class: 'group-toggle', text: '−' });
  const head = el('button', { class: 'group-head', type: 'button' }, [el('span', { class: 'group-name', text: name }), toggle]);
  const body = el('div', { class: 'group-body' }, [].concat(children).filter(Boolean));
  const wrap = el('div', { class: 'group' }, [head, body]);
  head.addEventListener('click', () => { const c = wrap.classList.toggle('collapsed'); toggle.textContent = c ? '+' : '−'; });
  return wrap;
}

function paramRow(p, state, onChange) {
  if (p.type === 'range') {
    // segmented fill meter (no handle): drag/click to set the fill edge; segments ramp in colour
    // intensity from dim teal up to near-WHITE at 100%. Arrow keys fine-tune by one step.
    const step = p.step == null ? 1 : p.step;
    const min = p.min == null ? 0 : p.min, max = p.max == null ? 100 : p.max, span = (max - min) || 1;
    const N = Math.max(1, Math.min(20, Math.round(span / step)));   // segment count (capped for legibility)
    const decimals = (String(step).split('.')[1] || '').length;
    const fmt = (v) => (decimals ? v.toFixed(decimals) : String(v));
    const val = el('span', { class: 'val', text: fmt(state[p.key]) });
    const meter = el('div', { class: 'meter', tabindex: '0', role: 'slider' });
    meter.setAttribute('aria-valuemin', min); meter.setAttribute('aria-valuemax', max);
    const segs = [];
    for (let i = 0; i < N; i++) { const s = el('div', { class: 'seg' }); meter.appendChild(s); segs.push(s); }
    // intensity ramp: lightness rises and chroma fades toward the top so 100% reads white.
    const colorFor = (i) => { const f = N <= 1 ? 1 : i / (N - 1); const L = 0.5 + 0.47 * f, C = 0.15 * (1 - 0.9 * f); return `oklch(${L.toFixed(3)} ${C.toFixed(3)} 178)`; };
    const clampV = (v) => +(Math.min(max, Math.max(min, Math.round(v / step) * step))).toFixed(6);
    const paint = () => {
      const lvl = Math.round((state[p.key] - min) / span * N);
      for (let i = 0; i < N; i++) { const on = i < lvl; segs[i].classList.toggle('on', on); segs[i].style.background = on ? colorFor(i) : ''; }
      val.textContent = fmt(state[p.key]); meter.setAttribute('aria-valuenow', state[p.key]);
    };
    const setLevel = (lvl) => { lvl = Math.max(0, Math.min(N, lvl)); state[p.key] = clampV(min + (lvl / N) * span); paint(); onChange(); };
    const fromEvent = (e) => { const r = meter.getBoundingClientRect(); setLevel(Math.ceil((e.clientX - r.left) / r.width * N)); };
    let drag = false;
    meter.addEventListener('pointerdown', (e) => { drag = true; try { meter.setPointerCapture(e.pointerId); } catch (_) {} fromEvent(e); });
    meter.addEventListener('pointermove', (e) => { if (drag) fromEvent(e); });
    meter.addEventListener('pointerup', (e) => { drag = false; try { meter.releasePointerCapture(e.pointerId); } catch (_) {} });
    meter.addEventListener('keydown', (e) => {
      const d = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? step : (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -step : 0;
      if (d) { state[p.key] = clampV((+state[p.key]) + d); paint(); onChange(); e.preventDefault(); }
    });
    paint();
    return row(p.label, meter, val);
  }
  if (p.type === 'color') {
    const input = el('input', { type: 'color', value: state[p.key], oninput: (e) => { state[p.key] = e.target.value; onChange(); } });
    return row(p.label, input, el('span', { class: 'val' }));
  }
  if (p.type === 'toggle') {
    const input = el('input', { type: 'checkbox', onchange: (e) => { state[p.key] = e.target.checked; onChange(); } });
    if (state[p.key]) input.setAttribute('checked', '');
    return el('div', { class: 'row chk' }, [input, el('label', { class: 'chklabel', text: p.label })]);
  }
  if (p.type === 'select') {
    const sel = el('select', { onchange: (e) => { state[p.key] = e.target.value; onChange(); } },
      (p.options || []).map((o) => el('option', { value: o, text: o })));
    sel.value = state[p.key];
    return row(p.label, sel, el('span', { class: 'val' }));
  }
  if (p.type === 'text') {
    const input = el('input', { type: 'text', value: state[p.key], maxlength: p.max || 24,
      oninput: (e) => { state[p.key] = e.target.value; onChange(); } });
    return row(p.label, input, el('span', { class: 'val' }));
  }
  return el('div');
}

export function buildControls(root, mod, state, onChange = () => {}) {
  const rebuild = () => buildControls(root, mod, state, onChange);
  root.innerHTML = '';
  const frag = document.createDocumentFragment();

  // seed
  const seedInput = el('input', {
    type: 'number', value: state.seed, min: 0, step: 1, class: 'seedval',
    oninput: (e) => { state.seed = (+e.target.value) >>> 0; onChange(); },
  });
  const reroll = el('button', {
    class: 'mini', text: 're-roll ⟳',
    onclick: () => { state.seed = (Math.random() * 1e9) >>> 0; seedInput.value = state.seed; onChange(); },
  });
  frag.appendChild(group('seed', el('div', { class: 'row seedrow' }, [seedInput, reroll])));

  // param groups (insertion order preserved)
  const groups = new Map();
  for (const p of mod.params) {
    const g = p.group || 'params';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }
  for (const [gname, params] of groups) {
    frag.appendChild(group(gname, params.map((p) => paramRow(p, state, onChange))));
  }

  // presets
  if (mod.presets && Object.keys(mod.presets).length) {
    const btns = Object.keys(mod.presets).map((name) =>
      el('button', { class: 'mini', text: name, onclick: () => { Object.assign(state, mod.presets[name]); onChange(); rebuild(); } }));
    frag.appendChild(group('presets', el('div', { class: 'preset-row' }, btns)));
  }

  // exports
  const fileInput = el('input', {
    type: 'file', accept: 'application/json', style: 'display:none',
    onchange: (e) => { const f = e.target.files[0]; if (f) f.text().then((txt) => { importParams(mod, txt, state); onChange(); rebuild(); }); },
  });
  frag.appendChild(group('export', el('div', { class: 'preset-row' }, [
    el('button', { class: 'mini', text: 'params .json', onclick: () => exportParams(mod, state) }),
    el('button', { class: 'mini', text: 'import .json', onclick: () => fileInput.click() }),
    el('button', { class: 'mini', text: 'snapshot .png ⬓', onclick: () => exportPNG(mod, state) }),
    el('button', { class: 'mini wide', text: 'standalone .html', onclick: () => exportStandalone(mod, state) }),
    fileInput,
  ])));

  root.appendChild(frag);
}

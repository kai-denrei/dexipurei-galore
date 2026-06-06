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

function paramRow(p, state, onChange) {
  if (p.type === 'range') {
    // simplified control: [−] [value] [+]. value is also directly editable. clamped to min/max, stepped by step.
    const step = p.step == null ? 1 : p.step;
    const lo = p.min == null ? -Infinity : p.min, hi = p.max == null ? Infinity : p.max;
    const decimals = (String(step).split('.')[1] || '').length;
    const fmt = (v) => (decimals ? v.toFixed(decimals) : String(v));
    const field = el('input', { type: 'number', class: 'step-val', value: fmt(state[p.key]), min: p.min, max: p.max, step });
    const apply = (v) => {
      if (!isFinite(v)) v = state[p.key];
      v = +(Math.min(hi, Math.max(lo, Math.round(v / step) * step))).toFixed(6);
      state[p.key] = v; field.value = fmt(v); onChange();
    };
    field.addEventListener('change', () => apply(+field.value));
    const minus = el('button', { class: 'step-btn', type: 'button', text: '−', onclick: () => apply(state[p.key] - step) });
    const plus = el('button', { class: 'step-btn', type: 'button', text: '+', onclick: () => apply(state[p.key] + step) });
    return el('div', { class: 'row' }, [el('label', { text: p.label }), el('div', { class: 'stepper' }, [minus, field, plus])]);
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
  frag.appendChild(el('div', { class: 'group' }, [el('h3', { text: 'seed' }), el('div', { class: 'row seedrow' }, [seedInput, reroll])]));

  // param groups (insertion order preserved)
  const groups = new Map();
  for (const p of mod.params) {
    const g = p.group || 'params';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }
  for (const [gname, params] of groups) {
    frag.appendChild(el('div', { class: 'group' }, [el('h3', { text: gname }), ...params.map((p) => paramRow(p, state, onChange))]));
  }

  // presets
  if (mod.presets && Object.keys(mod.presets).length) {
    const btns = Object.keys(mod.presets).map((name) =>
      el('button', { class: 'mini', text: name, onclick: () => { Object.assign(state, mod.presets[name]); onChange(); rebuild(); } }));
    frag.appendChild(el('div', { class: 'group' }, [el('h3', { text: 'presets' }), el('div', { class: 'preset-row' }, btns)]));
  }

  // exports
  const fileInput = el('input', {
    type: 'file', accept: 'application/json', style: 'display:none',
    onchange: (e) => { const f = e.target.files[0]; if (f) f.text().then((txt) => { importParams(mod, txt, state); onChange(); rebuild(); }); },
  });
  frag.appendChild(el('div', { class: 'group' }, [
    el('h3', { text: 'export' }),
    el('div', { class: 'preset-row' }, [
      el('button', { class: 'mini', text: 'params .json', onclick: () => exportParams(mod, state) }),
      el('button', { class: 'mini', text: 'import .json', onclick: () => fileInput.click() }),
      el('button', { class: 'mini', text: 'snapshot .png ⬓', onclick: () => exportPNG(mod, state) }),
      el('button', { class: 'mini wide', text: 'standalone .html', onclick: () => exportStandalone(mod, state) }),
      fileInput,
    ]),
  ]));

  root.appendChild(frag);
}

// voxel.js — 3D Volumetric Voxel (volumetric). HANDOVER §6.11. A swept-volume display faked in pure
// Canvas 2D: a 3D point set is rotated by t, projected through a manual perspective camera, depth-SORTED
// in painter's order, and drawn as additive glowing sprites whose size + brightness fall off with depth
// (depth fog). An optional SWEEP PLANE sweeps through the volume — voxels near it flare, implying a
// rotating swept-screen phosphor. Voxel count is CAPPED and back points culled to stay CPU-cheap. All
// wear (flicker, dead voxels, edge falloff) routes through rng.hash so a seed re-roll is reproducible.
//
// The point set comes from one of two builders:
//   • lattice shapes (cube / sphere / shell / frame) — abstract geometry, the classic swept volume;
//   • 'digits' — the text/number bitmap (textGrid) EXTRUDED through Z into a slab of lit voxels: a true
//     3D dot-matrix where the volume of the digits is lit. Rotating it reveals the depth.

import { stageSize } from '../core/contract.js';
import { bloom, vignette } from '../core/fx.js';
import { hex2rgb, mix, rgba } from '../core/color.js';
import { textGrid } from '../core/text-raster.js';

const MAX_VOXELS = 2600;          // hard CPU cap — builders bail once reached
const FOCAL = 2.4;                // camera focal length in volume-radius units (perspective strength)
const CAM_Z = 3.4;                // camera distance from volume center (along +Z)
const ROLL_YAW = 0.5;             // fixed 3/4 yaw in odometer 'roll' mode so the vertical roll reads in 3D

// Abstract unit-cube lattice (centered on origin, extent ±1). Returns flat [x,y,z, ...].
function buildLattice(res, shape, edgeFall, rng) {
  const pts = [];
  const span = res - 1 || 1;
  for (let i = 0; i < res; i++) for (let j = 0; j < res; j++) for (let k = 0; k < res; k++) {
    const x = (i / span) * 2 - 1, y = (j / span) * 2 - 1, z = (k / span) * 2 - 1;
    const r = Math.hypot(x, y, z);
    if (shape === 'sphere' && r > 1.0) continue;
    if (shape === 'shell' && (r > 1.0 || r < 0.72)) continue;
    if (shape === 'frame') {
      const onX = Math.abs(Math.abs(x) - 1) < 1e-6, onY = Math.abs(Math.abs(y) - 1) < 1e-6, onZ = Math.abs(Math.abs(z) - 1) < 1e-6;
      if ((onX ? 1 : 0) + (onY ? 1 : 0) + (onZ ? 1 : 0) < 2) continue;
    }
    if (edgeFall > 0 && r > 0.55) {
      const p = (r - 0.55) / 0.45 * edgeFall;
      if (rng.hash((i * 31 + j) | 0, (k * 17 + 5) | 0) < p) continue;
    }
    pts.push(x, y, z);
    if (pts.length / 3 >= MAX_VOXELS) return pts;
  }
  return pts;
}

// Extrude the text bitmap into a centered voxel slab: each lit grid cell becomes a column of `depth`
// voxels along Z. The result is a 3D dot-matrix of the digits, sized to the unit volume.
function buildDigits(str, depth, gridH, rng) {
  const { grid, rows, cols } = textGrid(str, { height: gridH });
  const pts = [];
  const maxDim = Math.max(cols, rows, 1);
  const cell = 1.74 / maxDim;                  // voxel spacing in unit space (leaves a small margin)
  const x0 = -(cols - 1) * cell / 2;
  const y0 = (rows - 1) * cell / 2;            // grid row 0 = top → +y
  const dN = Math.max(1, Math.round(depth));
  const extr = cell * (dN - 1);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!grid[r][c]) continue;
    const x = x0 + c * cell, y = y0 - r * cell;
    for (let k = 0; k < dN; k++) {
      const z = dN === 1 ? 0 : (k / (dN - 1) - 0.5) * extr;
      pts.push(x, y, z);
      if (pts.length / 3 >= MAX_VOXELS) return pts;
    }
  }
  return pts.length ? pts : [0, 0, 0];
}

// Rolling odometer: each base-10 wheel rolls vertically (units fastest). For wheel w we show digit
// floor(cont/10^w)%10 scrolling up and out while the next digit rolls in from below, clipped to a
// one-glyph window — the two-half-digit transition — then extruded through Z like buildDigits.
function buildRollingDigits(cont, depth, gridH, rng) {
  const G = []; let gw = 0, gh = 0;
  for (let d = 0; d < 10; d++) { const g = textGrid(String(d), { height: gridH }); G[d] = g; gw = Math.max(gw, g.cols); gh = Math.max(gh, g.rows); }
  const width = Math.max(4, String(Math.max(0, Math.floor(cont))).length);
  const stride = gw + 1;
  const totalCols = width * stride - 1;
  const cell = 1.74 / Math.max(totalCols, gh, 1);
  const x0 = -(totalCols - 1) * cell / 2;
  const yTop = (gh - 1) * cell / 2;
  const dN = Math.max(1, Math.round(depth));
  const extr = cell * (dN - 1);
  const pts = [];
  for (let w = 0; w < width; w++) {
    const wheelPos = cont / Math.pow(10, w);
    let d0 = Math.floor(wheelPos) % 10; if (d0 < 0) d0 += 10;
    const d1 = (d0 + 1) % 10;
    const rf = wheelPos - Math.floor(wheelPos);              // 0..1 roll fraction
    const colBase = (width - 1 - w) * stride;                // wheel 0 (units) rightmost
    const pair = [[d0, rf * gh], [d1, rf * gh - gh]];        // current scrolls up, next enters below
    for (let pi = 0; pi < 2; pi++) {
      const d = pair[pi][0], shift = pair[pi][1], g = G[d].grid, gr = G[d].rows, gc = G[d].cols;
      const xoff = (gw - gc) >> 1;
      for (let r = 0; r < gr; r++) for (let c = 0; c < gc; c++) {
        if (!g[r][c]) continue;
        const yRow = r - shift;
        if (yRow < -0.001 || yRow > gh - 1 + 0.001) continue; // clip to the wheel window
        const x = x0 + (colBase + xoff + c) * cell, y = yTop - yRow * cell;
        for (let k = 0; k < dN; k++) { const z = dN === 1 ? 0 : (k / (dN - 1) - 0.5) * extr; pts.push(x, y, z); if (pts.length / 3 >= MAX_VOXELS) return pts; }
      }
    }
  }
  return pts.length ? pts : [0, 0, 0];
}

function content(p) {
  if (p.source === 'clock') {
    const d = new Date(), z = (n) => String(n).padStart(2, '0');
    return z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
  }
  return (p.text == null ? '' : String(p.text)) || ' ';
}

export default {
  id: 'voxel',
  name: 'Volumetric Voxel',
  category: 'volumetric',
  physics: 'Swept-volume display faked in 2D: a 3D point set rotated by t, projected through a manual perspective camera, depth-sorted (painter), drawn as additive sprites with size/brightness fog by depth. In "digits" mode the number is extruded through Z into a lit voxel slab — a 3D dot-matrix; a sweep plane flares voxels it crosses. A "roll" motion option rolls the digit wheels vertically, base-10, like a 3D odometer.',
  USES: ['stageSize', 'textGrid', 'bloom', 'vignette', 'hex2rgb', 'mix', 'rgba'],
  params: [
    { key: 'shape', label: 'shape', type: 'select', options: ['digits', 'cube', 'sphere', 'shell', 'frame'], default: 'digits', group: 'volume' },
    { key: 'text', label: 'digits/text', type: 'text', max: 12, default: '42', group: 'digits' },
    { key: 'source', label: 'source', type: 'select', options: ['text', 'clock'], default: 'text', group: 'digits' },
    { key: 'motion', label: 'motion', type: 'select', options: ['spin', 'roll'], default: 'spin', group: 'digits' },
    { key: 'depth', label: 'extrude depth', type: 'range', min: 1, max: 16, step: 1, default: 5, group: 'digits' },
    { key: 'gridH', label: 'digit grid', type: 'range', min: 7, max: 18, step: 1, default: 9, group: 'digits' },
    { key: 'res', label: 'lattice res', type: 'range', min: 5, max: 18, step: 1, default: 11, group: 'volume' },
    { key: 'spin', label: 'speed (spin/roll)', type: 'range', min: 0, max: 100, step: 1, default: 28, group: 'volume' },
    { key: 'tilt', label: 'camera tilt', type: 'range', min: -45, max: 45, step: 1, default: 16, group: 'volume' },
    { key: 'size', label: 'voxel size', type: 'range', min: 1, max: 18, step: 0.5, default: 5.5, group: 'sprite' },
    { key: 'glow', label: 'glow', type: 'range', min: 0, max: 100, step: 1, default: 60, group: 'sprite' },
    { key: 'coreWhite', label: 'hot core', type: 'range', min: 0, max: 100, step: 1, default: 54, group: 'sprite' },
    { key: 'fog', label: 'depth fog', type: 'range', min: 0, max: 100, step: 1, default: 56, group: 'sprite' },
    { key: 'sweep', label: 'sweep plane', type: 'range', min: 0, max: 100, step: 1, default: 34, group: 'sweep' },
    { key: 'sweepMs', label: 'sweep period', type: 'range', min: 600, max: 6000, step: 100, default: 2600, group: 'sweep' },
    { key: 'dead', label: 'dead voxels', type: 'range', min: 0, max: 40, step: 1, default: 4, group: 'wear' },
    { key: 'flicker', label: 'flicker', type: 'range', min: 0, max: 100, step: 1, default: 16, group: 'wear' },
    { key: 'edgeFall', label: 'edge density', type: 'range', min: 0, max: 100, step: 1, default: 0, group: 'wear' },
    { key: 'color', label: 'voxel', type: 'color', default: '#39e0ff', group: 'color' },
    { key: 'bg', label: 'background', type: 'color', default: '#03060a', group: 'color' },
    { key: 'vignette', label: 'vignette', type: 'range', min: 0, max: 100, step: 1, default: 48, group: 'color' },
  ],
  presets: {
    '3D Digits': { shape: 'digits', motion: 'spin', text: '42', source: 'text', depth: 5, gridH: 9, spin: 26, tilt: 16, size: 5.5, glow: 62, coreWhite: 58, fog: 52, sweep: 30, dead: 3, flicker: 14, edgeFall: 0, color: '#39e0ff', bg: '#03060a', vignette: 46 },
    Odometer: { shape: 'digits', motion: 'roll', text: '0', depth: 6, gridH: 9, spin: 24, tilt: 14, size: 5, glow: 60, coreWhite: 52, fog: 54, sweep: 16, dead: 1, flicker: 8, edgeFall: 0, color: '#7affc0', bg: '#02080a', vignette: 44 },
    Phosphor: { shape: 'sphere', res: 11, spin: 30, tilt: 18, size: 6, glow: 58, coreWhite: 46, fog: 64, sweep: 50, sweepMs: 2600, dead: 8, flicker: 22, edgeFall: 30, color: '#39e0ff', bg: '#03060a', vignette: 52 },
    Radar: { shape: 'shell', res: 14, spin: 46, tilt: 8, size: 5.5, glow: 64, coreWhite: 30, fog: 76, sweep: 84, sweepMs: 1600, dead: 14, flicker: 34, edgeFall: 42, color: '#33ff77', bg: '#020703', vignette: 60 },
    Holocube: { shape: 'frame', res: 9, spin: 22, tilt: 24, size: 5, glow: 70, coreWhite: 60, fog: 40, sweep: 18, sweepMs: 3200, dead: 3, flicker: 10, edgeFall: 6, color: '#7affc0', bg: '#02080a', vignette: 40 },
  },

  render(ctx, p, t, rng) {
    const { w, h } = stageSize(ctx);
    const vox = hex2rgb(p.color), bg = hex2rgb(p.bg);
    const coreC = mix(vox, [255, 255, 255], p.coreWhite / 100);
    if (!p.transparent) { ctx.fillStyle = rgba(bg, 1); ctx.fillRect(0, 0, w, h); }

    // 1) build the point set — rolling odometer digits, an extruded digit slab, or an abstract lattice
    const rolling = p.shape === 'digits' && p.motion === 'roll';
    let pts, yaw;
    if (rolling) {
      const start = parseInt(String(p.text).replace(/\D/g, ''), 10) || 0;
      const cont = start + (t / 1000) * (0.15 + (p.spin / 100) * 6);   // count up; units wheel rolls fastest
      pts = buildRollingDigits(cont, p.depth, Math.round(p.gridH), rng);
      yaw = ROLL_YAW;                                                   // fixed 3/4 view so the roll reads
    } else if (p.shape === 'digits') {
      pts = buildDigits(content(p), p.depth, Math.round(p.gridH), rng);
      yaw = (t / 1000) * (p.spin / 100) * 1.4;                          // continuous spin
    } else {
      pts = buildLattice(Math.round(p.res), p.shape, p.edgeFall / 100, rng);
      yaw = (t / 1000) * (p.spin / 100) * 1.4;
    }
    const n = pts.length / 3;

    // 2) pitch is the fixed camera tilt
    const pitch = (p.tilt * Math.PI) / 180;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);

    const swPh = (t % p.sweepMs) / p.sweepMs;
    const swZ = (swPh < 0.5 ? swPh * 2 : 2 - swPh * 2) * 2 - 1;
    const sweepA = p.sweep / 100, fog = p.fog / 100, glow = p.glow / 100;
    const deadP = p.dead / 100, flick = p.flicker / 100, coreW = p.coreWhite / 100;

    // 3) project + depth-sort. Cull dead voxels and anything behind the camera.
    const scale = Math.min(w, h) * 0.34;
    const cx0 = w / 2, cy0 = h / 2;
    const sprites = [];
    for (let i = 0; i < n; i++) {
      if (rng.hash(i * 3 + 1, 13) < deadP) continue;
      const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
      const rx = x * cyw + z * syw; let rz = -x * syw + z * cyw;
      const ry = y * cp - rz * sp; rz = y * sp + rz * cp;
      const camZ = CAM_Z - rz;
      if (camZ <= 0.2) continue;
      const persp = FOCAL / camZ;
      sprites.push({ sx: cx0 + rx * persp * scale, sy: cy0 - ry * persp * scale, depth: rz, persp, wz: rz, idx: i });
    }
    sprites.sort((a, b) => a.depth - b.depth);

    // 4) additive sprites with depth fog
    const lit = [];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let s = 0; s < sprites.length; s++) {
      const sp2 = sprites[s];
      const dN = Math.max(0, Math.min(1, (sp2.depth + 1.2) / 2.4));
      let bright = (1 - fog) + fog * dN;
      bright *= 0.7 + 0.5 * sp2.persp;
      if (sweepA > 0) {
        const dist = Math.abs(sp2.wz - swZ), band = 0.18;
        if (dist < band) bright += sweepA * (1 - dist / band) * 1.4;
      }
      if (flick > 0) {
        const fph = rng.hash(sp2.idx + 71, 9);
        if (fph < flick * 0.6) bright *= 0.74 + 0.26 * Math.sin(t * 0.02 + fph * 80);
      }
      bright = Math.max(0.04, Math.min(2.2, bright));
      const rad = Math.max(0.4, p.size * sp2.persp * (0.5 + 0.5 * dN));
      const g = ctx.createRadialGradient(sp2.sx, sp2.sy, 0, sp2.sx, sp2.sy, rad);
      g.addColorStop(0, rgba(coreC, Math.min(1, (0.5 + coreW * 0.5) * bright)));
      g.addColorStop(0.45, rgba(vox, Math.min(1, 0.7 * bright)));
      g.addColorStop(1, rgba(vox, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sp2.sx, sp2.sy, rad, 0, Math.PI * 2); ctx.fill();
      lit.push([sp2.sx, sp2.sy, rad, bright]);
    }
    ctx.restore();

    // 5) one soft additive bloom over the cloud
    if (glow > 0) {
      bloom(ctx, (gx) => {
        for (let i = 0; i < lit.length; i++) {
          const L = lit[i];
          gx.fillStyle = rgba(vox, 0.55 * L[3]);
          gx.beginPath(); gx.arc(L[0], L[1], L[2] * 1.1, 0, Math.PI * 2); gx.fill();
        }
      }, 8 + glow * 16, glow * 0.85);
    }

    // 6) faint visible sweep-plane edge
    if (sweepA > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const planeScale = FOCAL / (CAM_Z - swZ) * scale;
      ctx.strokeStyle = rgba(coreC, 0.1 * sweepA);
      ctx.lineWidth = Math.max(1, p.size * 0.5);
      ctx.beginPath();
      ctx.ellipse(cx0, cy0, planeScale * 0.9, planeScale * 0.9 * Math.cos(pitch), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    vignette(ctx, w, h, p.vignette / 100);
  },
};

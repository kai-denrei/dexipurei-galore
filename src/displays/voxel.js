// voxel.js — 3D Volumetric Voxel (volumetric). HANDOVER §6.11. A swept-volume display faked in pure
// Canvas 2D: a 3D point lattice (cube grid, sphere shell, or a slow torus) is rotated by t, projected
// through a manual perspective camera, depth-SORTED in painter's order, and drawn as additive glowing
// sprites whose size + brightness fall off with depth (depth fog). An optional faint SWEEP PLANE sweeps
// through the volume — voxels near the plane flare, implying a rotating swept-screen phosphor. Voxel
// count is CAPPED and back-half points are culled to stay CPU-cheap. All wear (flicker, dead voxels,
// edge density falloff, depth haze) routes through rng.hash so a seed re-roll is reproducible.

import { stageSize } from '../core/contract.js';
import { bloom, vignette } from '../core/fx.js';
import { hex2rgb, mix, rgba } from '../core/color.js';

const MAX_VOXELS = 1500;          // hard CPU cap — we subsample the lattice down to this if needed
const FOCAL = 2.4;                // camera focal length in volume-radius units (perspective strength)
const CAM_Z = 3.4;                // camera distance from volume center (along +Z)

// Build the static unit-cube lattice (centered on origin, extent ±1) for a given resolution + shape.
// Returns flat [x,y,z, x,y,z, ...]. Edge voxels can be thinned by `edgeFall` via rng (density falloff).
function buildLattice(res, shape, edgeFall, rng) {
  const pts = [];
  const span = res - 1 || 1;
  for (let i = 0; i < res; i++) for (let j = 0; j < res; j++) for (let k = 0; k < res; k++) {
    const x = (i / span) * 2 - 1, y = (j / span) * 2 - 1, z = (k / span) * 2 - 1;
    const r = Math.hypot(x, y, z);
    if (shape === 'sphere' && r > 1.0) continue;                 // solid ball
    if (shape === 'shell' && (r > 1.0 || r < 0.72)) continue;    // hollow shell
    if (shape === 'frame') {                                     // wireframe cube: keep only edge runs
      const onX = Math.abs(Math.abs(x) - 1) < 1e-6, onY = Math.abs(Math.abs(y) - 1) < 1e-6, onZ = Math.abs(Math.abs(z) - 1) < 1e-6;
      if ((onX ? 1 : 0) + (onY ? 1 : 0) + (onZ ? 1 : 0) < 2) continue;
    }
    // density falloff toward the lattice edges — sparser at the rim (sweep/phosphor "fade")
    if (edgeFall > 0 && r > 0.55) {
      const p = (r - 0.55) / 0.45 * edgeFall;
      if (rng.hash((i * 31 + j) | 0, (k * 17 + 5) | 0) < p) continue;
    }
    pts.push(x, y, z);
    if (pts.length / 3 >= MAX_VOXELS) return pts;                // bail once capped
  }
  return pts;
}

export default {
  id: 'voxel',
  name: 'Volumetric Voxel',
  category: 'volumetric',
  physics: 'Swept-volume display faked in 2D: a 3D point lattice rotated by t, projected through a manual perspective camera, depth-sorted (painter), drawn as additive sprites with size/brightness fog by depth; a sweep plane flares voxels it crosses, like a rotating phosphor screen.',
  USES: ['stageSize', 'bloom', 'vignette', 'hex2rgb', 'mix', 'rgba'],
  params: [
    { key: 'shape', label: 'shape', type: 'select', options: ['cube', 'sphere', 'shell', 'frame'], default: 'sphere', group: 'volume' },
    { key: 'res', label: 'grid res', type: 'range', min: 5, max: 18, step: 1, default: 11, group: 'volume' },
    { key: 'spin', label: 'rotation speed', type: 'range', min: 0, max: 100, step: 1, default: 30, group: 'volume' },
    { key: 'tilt', label: 'camera tilt', type: 'range', min: -45, max: 45, step: 1, default: 18, group: 'volume' },
    { key: 'size', label: 'voxel size', type: 'range', min: 1, max: 18, step: 0.5, default: 6, group: 'sprite' },
    { key: 'glow', label: 'glow', type: 'range', min: 0, max: 100, step: 1, default: 58, group: 'sprite' },
    { key: 'coreWhite', label: 'hot core', type: 'range', min: 0, max: 100, step: 1, default: 46, group: 'sprite' },
    { key: 'fog', label: 'depth fog', type: 'range', min: 0, max: 100, step: 1, default: 64, group: 'sprite' },
    { key: 'sweep', label: 'sweep plane', type: 'range', min: 0, max: 100, step: 1, default: 50, group: 'sweep' },
    { key: 'sweepMs', label: 'sweep period', type: 'range', min: 600, max: 6000, step: 100, default: 2600, group: 'sweep' },
    { key: 'dead', label: 'dead voxels', type: 'range', min: 0, max: 40, step: 1, default: 8, group: 'wear' },
    { key: 'flicker', label: 'flicker', type: 'range', min: 0, max: 100, step: 1, default: 22, group: 'wear' },
    { key: 'edgeFall', label: 'edge density', type: 'range', min: 0, max: 100, step: 1, default: 30, group: 'wear' },
    { key: 'color', label: 'voxel', type: 'color', default: '#39e0ff', group: 'color' },
    { key: 'bg', label: 'background', type: 'color', default: '#03060a', group: 'color' },
    { key: 'vignette', label: 'vignette', type: 'range', min: 0, max: 100, step: 1, default: 52, group: 'color' },
  ],
  presets: {
    Phosphor: { shape: 'sphere', res: 11, spin: 30, tilt: 18, size: 6, glow: 58, coreWhite: 46, fog: 64, sweep: 50, sweepMs: 2600, dead: 8, flicker: 22, edgeFall: 30, color: '#39e0ff', bg: '#03060a', vignette: 52 },
    Holocube: { shape: 'frame', res: 9, spin: 22, tilt: 24, size: 5, glow: 70, coreWhite: 60, fog: 40, sweep: 18, sweepMs: 3200, dead: 3, flicker: 10, edgeFall: 6, color: '#7affc0', bg: '#02080a', vignette: 40 },
    Radar: { shape: 'shell', res: 14, spin: 46, tilt: 8, size: 5.5, glow: 64, coreWhite: 30, fog: 76, sweep: 84, sweepMs: 1600, dead: 14, flicker: 34, edgeFall: 42, color: '#33ff77', bg: '#020703', vignette: 60 },
    Ember: { shape: 'cube', res: 10, spin: 16, tilt: -14, size: 7, glow: 52, coreWhite: 24, fog: 58, sweep: 36, sweepMs: 4000, dead: 18, flicker: 40, edgeFall: 22, color: '#ff6a2a', bg: '#0a0402', vignette: 56 },
  },

  render(ctx, p, t, rng) {
    const { w, h } = stageSize(ctx);
    const vox = hex2rgb(p.color), bg = hex2rgb(p.bg);
    const coreC = mix(vox, [255, 255, 255], p.coreWhite / 100);
    if (!p.transparent) { ctx.fillStyle = rgba(bg, 1); ctx.fillRect(0, 0, w, h); }

    // 1) static lattice (rebuilt each frame — pure & cheap at these counts; capped at MAX_VOXELS)
    const res = Math.round(p.res);
    const pts = buildLattice(res, p.shape, p.edgeFall / 100, rng);
    const n = pts.length / 3;

    // 2) rotation from t: yaw spins continuously, pitch is the fixed camera tilt
    const yaw = (t / 1000) * (p.spin / 100) * 1.4;
    const pitch = (p.tilt * Math.PI) / 180;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);

    // sweep plane position: a flat plane at depth swZ sliding through the volume on t (triangle wave)
    const swPh = (t % p.sweepMs) / p.sweepMs;                 // 0..1
    const swZ = (swPh < 0.5 ? swPh * 2 : 2 - swPh * 2) * 2 - 1; // -1..1..-1
    const sweepA = p.sweep / 100, fog = p.fog / 100, glow = p.glow / 100;
    const deadP = p.dead / 100, flick = p.flicker / 100, coreW = p.coreWhite / 100;

    // 3) project + depth-sort. Cull dead voxels and any point that falls behind the camera.
    const scale = Math.min(w, h) * 0.34;                     // volume radius in screen px
    const cx0 = w / 2, cy0 = h / 2;
    const sprites = [];
    for (let i = 0; i < n; i++) {
      if (rng.hash(i * 3 + 1, 13) < deadP) continue;          // dead voxel — never lights (stable)
      let x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
      // yaw about Y, then pitch about X
      let rx = x * cy + z * sy, rz = -x * sy + z * cy;
      let ry = y * cp - rz * sp; rz = y * sp + rz * cp;
      const camZ = CAM_Z - rz;                                // depth from camera (+ = nearer)
      if (camZ <= 0.2) continue;                              // behind / too close — cull
      const persp = FOCAL / camZ;
      sprites.push({
        sx: cx0 + rx * persp * scale,
        sy: cy0 + ry * persp * scale,
        depth: rz,                                            // higher = nearer the camera
        persp,
        wz: rz,                                               // world Z for sweep test
        idx: i,
      });
    }
    // painter's order: far (low depth) first, near last
    sprites.sort((a, b) => a.depth - b.depth);

    // 4) draw additive sprites with depth fog (size + brightness shrink with distance)
    const lit = [];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let s = 0; s < sprites.length; s++) {
      const sp2 = sprites[s];
      // normalize depth to 0 (far) .. 1 (near) for fog
      const dN = Math.max(0, Math.min(1, (sp2.depth + 1.2) / 2.4));
      let bright = (1 - fog) + fog * dN;                      // fogged base brightness
      bright *= 0.7 + 0.5 * sp2.persp;                        // nearer = a touch brighter via perspective

      // sweep plane flare: voxels whose world-Z sits near the moving plane glow harder
      if (sweepA > 0) {
        const dist = Math.abs(sp2.wz - swZ);
        const band = 0.18;
        if (dist < band) bright += sweepA * (1 - dist / band) * 1.4;
      }

      // per-voxel flicker (stable phase, shimmering amplitude via t)
      if (flick > 0) {
        const fph = rng.hash(sp2.idx + 71, 9);
        if (fph < flick * 0.6) bright *= 0.74 + 0.26 * Math.sin(t * 0.02 + fph * 80);
      }
      bright = Math.max(0.04, Math.min(2.2, bright));

      const rad = Math.max(0.4, p.size * sp2.persp * (0.5 + 0.5 * dN));
      // soft radial sprite: voxel color rim → hot core
      const g = ctx.createRadialGradient(sp2.sx, sp2.sy, 0, sp2.sx, sp2.sy, rad);
      g.addColorStop(0, rgba(coreC, Math.min(1, (0.5 + coreW * 0.5) * bright)));
      g.addColorStop(0.45, rgba(vox, Math.min(1, 0.7 * bright)));
      g.addColorStop(1, rgba(vox, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sp2.sx, sp2.sy, rad, 0, Math.PI * 2); ctx.fill();
      lit.push([sp2.sx, sp2.sy, rad, bright]);
    }
    ctx.restore();

    // 5) one soft additive bloom over the whole point cloud (the volume's outer haze)
    if (glow > 0) {
      bloom(ctx, (gx) => {
        for (let i = 0; i < lit.length; i++) {
          const L = lit[i];
          gx.fillStyle = rgba(vox, 0.55 * L[3]);
          gx.beginPath(); gx.arc(L[0], L[1], L[2] * 1.1, 0, Math.PI * 2); gx.fill();
        }
      }, 8 + glow * 16, glow * 0.85);
    }

    // 6) faint visible sweep plane edge — a thin lit disc where the plane intersects the volume front
    if (sweepA > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const planeScale = FOCAL / (CAM_Z - swZ) * scale;
      ctx.strokeStyle = rgba(coreC, 0.10 * sweepA);
      ctx.lineWidth = Math.max(1, p.size * 0.5);
      ctx.beginPath();
      ctx.ellipse(cx0, cy0, planeScale * 0.9, planeScale * 0.9 * Math.cos(pitch), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    vignette(ctx, w, h, p.vignette / 100);
  },
};

// standalone.tpl.js — the single-file export harness. Inlined core utils + module source + frozen
// params are wrapped in a minimal no-module RAF loop so the result runs from file:// with zero deps.

export function standaloneHTML({ name, id, seed, params, coreSrc, moduleSrc }) {
  const frozen = JSON.stringify({ seed, ...params });
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} — dexipurei standalone</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Noto+Sans+JP:wght@500&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;height:100%;background:#08080a;color:#8b8780;
    font:13px/1.5 "JetBrains Mono",ui-monospace,monospace;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:14px;min-height:100%}
  .bezel{padding:20px;border-radius:14px;background:linear-gradient(145deg,#121216,#070708);
    box-shadow:inset 0 1px 0 #2a2a32,inset 0 0 0 1px #000,0 24px 60px -20px #000}
  canvas{display:block;width:min(720px,92vw);height:min(340px,46vw);border-radius:6px}
  .cap{font-size:11px;letter-spacing:.3px;color:#6b6862;text-align:center;padding:0 12px}
  .cap b{color:#00e5d0;font-weight:500}
</style></head>
<body>
  <div class="bezel"><canvas id="s"></canvas></div>
  <div class="cap"><b>${name}</b> · seed ${seed} · dexipurei-galore standalone · runs offline, zero deps</div>
<script>
"use strict";
${coreSrc}
${moduleSrc}
(function () {
  var P = ${frozen};
  var cv = document.getElementById('s'), ctx = cv.getContext('2d');
  function size() {
    var r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cv._dpr = dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', size); size();
  function frame(t) {
    ctx.setTransform(cv._dpr, 0, 0, cv._dpr, 0, 0);
    __MOD__.render(ctx, P, t, makeRng(P.seed));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
</script>
</body></html>`;
}

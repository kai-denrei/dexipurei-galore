// cb-badge.js — runtime cache-bust visual badge.
// Reads <meta name="cb" content="..."> and renders 3 cell tiles in the corner.
// Drop in via: <script src="/cb-badge.js" defer></script>

(function () {
  const meta = document.querySelector('meta[name="cb"]');
  if (!meta) return;

  const raw = meta.getAttribute("content") || "";
  const hex = raw.replace(/^0x/i, "").toLowerCase().padStart(8, "0").slice(0, 8);
  if (!/^[0-9a-f]{8}$/.test(hex)) return;

  const cells = [0, 1, 2].map(i => parseInt(hex.slice(i * 2, i * 2 + 2), 16) % 64);
  const pad = n => String(n).padStart(2, "0");

  // Honor a hint in the meta tag if provided (e.g. content="cbd1dddb#dev").
  // Anything after '#' is treated as a label.
  const labelMatch = raw.match(/#(.+)$/);
  const label = labelMatch ? labelMatch[1] : "";

  // Mount inline into #cb-badge-slot when the page provides one; otherwise pin
  // to the bottom-right corner (default for any page that uses this script).
  const slot = document.getElementById("cb-badge-slot");
  const tileSize = slot ? 16 : 20;

  // Build the badge.
  const badge = document.createElement("div");
  badge.id = "cb-badge";
  badge.setAttribute("data-cb", hex);
  badge.style.cssText = [
    slot ? "display:inline-flex" : "position:fixed",
    ...(slot ? [] : ["bottom:8px", "right:8px", "display:flex", "z-index:2147483647"]),
    "gap:2px",
    "padding:4px 6px",
    "background:#111",
    "border:1px solid #2a2a2a",
    "border-radius:6px",
    "font:11px ui-monospace,SFMono-Regular,Menlo,monospace",
    "color:#888",
    "align-items:center",
    "user-select:none"
  ].join(";");

  const tiles = cells.map(c => {
    const img = document.createElement("img");
    // dexipurei-galore ships SVG shape cells only (no webp rasters), so load svg directly
    // to avoid a guaranteed 404 + fallback on every tile.
    img.src = `cb-shapes/${pad(c)}.svg`;
    img.alt = "";
    img.width = tileSize;
    img.height = tileSize;
    img.style.cssText = "display:block;border-radius:2px";
    return img;
  });
  tiles.forEach(t => badge.appendChild(t));

  const hexEl = document.createElement("span");
  hexEl.textContent = label ? `${hex} · ${label}` : hex;
  hexEl.style.cssText = "margin-left:6px;color:#bbb";
  badge.appendChild(hexEl);

  // Click: check for a new version (PWA) if the page wired up the hook;
  // always copy the token too. Falls back to a copy-confirm flash otherwise.
  badge.style.cursor = "pointer";
  badge.title = "click: check for updates (copies token)";
  badge.addEventListener("click", () => {
    navigator.clipboard?.writeText(hex);
    if (typeof window.cbCheckForUpdate === "function") {
      window.cbCheckForUpdate(hexEl);
    } else {
      hexEl.style.color = "#5dcaa5";
      setTimeout(() => { hexEl.style.color = "#bbb"; }, 600);
    }
  });

  // Mount once DOM is ready — into the slot if present, else the page body.
  const mount = () => (document.getElementById("cb-badge-slot") || document.body).appendChild(badge);
  if (document.body) {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount);
  }
})();

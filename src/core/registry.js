// registry.js — discover & load display modules. Missing files are skipped (caught) so the gallery
// still runs while later modules are being added. To add a module: drop displays/<id>.js and add its
// stem to MODULE_FILES (the id MUST equal the filename stem).

const MODULE_FILES = [
  'dotmatrix', 'sevenseg', 'starburst16', 'nixie', 'vfd',     // emissive (V1)
  'splitflap', 'flipdot', 'odometer',                         // electromechanical
  'lixie', 'crt', 'eink',                                     // optical / layered
  'voxel', 'fog',                                             // volumetric / aerial
];

export async function loadModules() {
  const mods = [];
  for (const f of MODULE_FILES) {
    try {
      const m = await import(`../displays/${f}.js`);
      if (m && m.default && m.default.render) mods.push(m.default);
      else console.warn(`[registry] ${f}.js has no valid default export`);
    } catch (e) {
      console.warn(`[registry] skipped ${f}: ${e.message}`);
    }
  }
  return mods;
}

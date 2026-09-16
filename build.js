const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');

const source = fs.readFileSync('payload1.js', 'utf8');
const sandbox = { window: {} };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'payload1.js' });
const payload = sandbox.window.__LD_PAYLOAD;
if (!payload || typeof payload !== 'string') {
  throw new Error('Payload Lion Dynasty introuvable dans payload1.js');
}
let html = zlib.gunzipSync(Buffer.from(payload, 'base64')).toString('utf8');

// Nettoyage de la version publique.
html = html.replace(/<div class="setup-banner" id="setupBanner"[\s\S]*?(?=<header class="hero" id="home">)/, '');
html = html.replace(/<section class="section" id="setup">[\s\S]*?<\/section>/, '');
html = html.replace('<span>Supabase Auth · PostgreSQL · Storage · Row Level Security</span>', '<span>Le Hub communautaire des passionnés de coloriage</span>');
html = html.replace(/const setupBanner = document\.getElementById\("setupBanner"\);\s*setupBanner\.hidden = configured;\s*/g, '');
html = html.replace(/document\.getElementById\("setup"\)\.scrollIntoView\(\{behavior:"smooth"\}\);\s*/g, '');
html = html.replace('toast("Configure d’abord Supabase dans config.js");', 'toast("Service temporairement indisponible");');
html = html.replace('toast("La V4 doit d’abord être reliée à Supabase");', 'toast("Service temporairement indisponible");');

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync(path.join('dist', 'index.html'), html, 'utf8');
console.log(`Lion Dynasty: index.html généré (${html.length} caractères)`);

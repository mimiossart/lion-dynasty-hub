const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');

const sandbox = { window: {} };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);

for (const file of ['payload1.js', 'payload2.js', 'payload3.js', 'payload4.js']) {
  if (!fs.existsSync(file)) throw new Error(`Fichier manquant: ${file}`);
  const source = fs.readFileSync(file, 'utf8');
  vm.runInContext(source, sandbox, { filename: file });
}

const payload = sandbox.window.__LD_PAYLOAD;
if (!payload || typeof payload !== 'string') {
  throw new Error('Payload Lion Dynasty introuvable');
}

let html = zlib.gunzipSync(Buffer.from(payload, 'base64')).toString('utf8');

// Configuration publique Supabase de production.
html = html
  .replace(/YOUR_SUPABASE_URL/g, 'https://ocmqyhspdezqxomjlyrd.supabase.co')
  .replace(/YOUR_SUPABASE_PUBLISHABLE_KEY/g, 'sb_publishable_ixu7aqhc0hFWFkk3cETfkw_vjeF098u');

// Confirmation e-mail vers le vrai domaine.
html = html.replace(
  /data:\s*\{ display_name: displayName, username, bio \}\s*\n\s*\}/,
  'data: { display_name: displayName, username, bio },\n          emailRedirectTo: window.location.origin\n        }'
);

// Nettoyage de l'ancienne section d'installation publique.
html = html.replace(/<div class="setup-banner" id="setupBanner"[\s\S]*?(?=<header class="hero" id="home">)/, '');
html = html.replace(/<section class="section" id="setup">[\s\S]*?<\/section>/, '');
html = html.replace('<span>Supabase Auth · PostgreSQL · Storage · Row Level Security</span>', '<span>Le Hub communautaire des passionnés de coloriage</span>');
html = html.replace(/const setupBanner = document\.getElementById\("setupBanner"\);\s*setupBanner\.hidden = configured;\s*/g, '');
html = html.replace(/document\.getElementById\("setup"\)\.scrollIntoView\(\{behavior:"smooth"\}\);\s*/g, '');
html = html.replace('toast("Configure d’abord Supabase dans config.js");', 'toast("Service temporairement indisponible");');
html = html.replace('toast("La V4 doit d’abord être reliée à Supabase");', 'toast("Service temporairement indisponible");');

// Vraie planche Tome 1 Disney - Page 7.
html = html.replace(
  '{book:"Tome 1 Disney", page:"Page 7", result:"Château au coucher de soleil"}',
  '{book:"Tome 1 Disney", page:"Page 7", result:"Château au coucher de soleil", image:"https://pub.bestcoloringpages.ai/coloring_page/user/previews/fairy-tale-castle-at-sunset.png"}'
);

// Rendu des solutions avec image quand elle existe.
const oldRender = `function renderSolutions() {
  const q = document.getElementById("solutionSearch").value.trim().toLowerCase();
  const book = document.getElementById("solutionBook").value;
  const result = solutions.filter(s => (!book || s.book === book) && \`${'${s.book} ${s.page} ${s.result}'}\`.toLowerCase().includes(q));
  const grid = document.getElementById("solutionsGrid");
  grid.innerHTML = result.map(s => \`<article class="card">
    <div class="form-note">${'${escapeHTML(s.book)}'}</div>
    <h3 style="margin:5px 0 11px">${'${escapeHTML(s.page)}'}</h3>
    <div class="spoiler" data-result="${'${escapeHTML(s.result)}'}"><strong>Cliquer pour révéler</strong></div>
  </article>\`).join("") || \`<div class="empty">Aucune solution trouvée.</div>\`;

  grid.querySelectorAll(".spoiler").forEach(spoiler => spoiler.addEventListener("click",() => {
    spoiler.classList.toggle("revealed");
    spoiler.innerHTML = spoiler.classList.contains("revealed")
      ? \`<strong>${'${spoiler.dataset.result}'}</strong>\`
      : \`<strong>Cliquer pour révéler</strong>\`;
  }));
}`;

const newRender = `function renderSolutions() {
  const q = document.getElementById("solutionSearch").value.trim().toLowerCase();
  const book = document.getElementById("solutionBook").value;
  const result = solutions.filter(s => (!book || s.book === book) && \`${'${s.book} ${s.page} ${s.result}'}\`.toLowerCase().includes(q));
  const grid = document.getElementById("solutionsGrid");
  grid.innerHTML = result.map(s => \`<article class="card"><div class="form-note">${'${escapeHTML(s.book)}'}</div><h3 style="margin:5px 0 11px">${'${escapeHTML(s.page)}'}</h3><div class="spoiler" data-result="${'${escapeHTML(s.result)}'}" data-image="${'${escapeHTML(s.image || "")}'}"><strong>Cliquer pour révéler</strong></div></article>\`).join("") || \`<div class="empty">Aucune solution trouvée.</div>\`;
  grid.querySelectorAll(".spoiler").forEach(spoiler => spoiler.addEventListener("click",(event) => {
    if (event.target.closest(".solution-full-link")) return;
    spoiler.classList.toggle("revealed");
    if (!spoiler.classList.contains("revealed")) { spoiler.innerHTML = \`<strong>Cliquer pour révéler</strong>\`; return; }
    const image = spoiler.dataset.image;
    if (image) { spoiler.innerHTML = \`<div class="solution-reveal"><img src="${'${image}'}" alt="${'${escapeHTML(spoiler.dataset.result)}'}" loading="lazy" referrerpolicy="no-referrer"><div class="solution-caption"><strong>${'${escapeHTML(spoiler.dataset.result)}'}</strong><a class="solution-full-link" href="${'${image}'}" target="_blank" rel="noopener noreferrer">Voir en grand ↗</a></div></div>\`; } else { spoiler.innerHTML = \`<strong>${'${escapeHTML(spoiler.dataset.result)}'}</strong>\`; }
  }));
}`;
html = html.replace(oldRender, newRender);
html = html.replace('</head>', '<style>.solution-reveal{width:100%;display:grid;gap:10px}.solution-reveal img{width:100%;max-height:480px;object-fit:contain;display:block;border-radius:14px;background:#fff}.solution-caption{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.solution-full-link{display:inline-flex;align-items:center;justify-content:center;padding:8px 10px;border-radius:10px;background:#fff;color:#5c2431;font-size:12px;font-weight:900;text-decoration:none;border:1px solid rgba(92,36,49,.18)}.spoiler.revealed{min-height:auto;padding:12px}</style></head>');

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync(path.join('dist', 'index.html'), html, 'utf8');
console.log(`Lion Dynasty: ${payload.length} caractères de payload réunis`);
console.log(`Lion Dynasty: index.html généré (${html.length} caractères)`);

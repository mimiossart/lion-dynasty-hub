const fs = require('fs');
const path = require('path');

const files = [
  'index.html',
  'styles.css',
  'config.js',
  'app.js',
  'app.part1.txt',
  'app.part2.txt',
  'app.part3.txt',
  'app.part4.txt',
  'app.part5.txt',
  'editorial-mode-v53.js',
  'editorial-labels-v55.js',
  'editorial-runtime-fix-v57.js'
];

const out = path.join(process.cwd(), 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of files) {
  if (!fs.existsSync(file)) throw new Error(`Fichier statique manquant: ${file}`);
  fs.copyFileSync(file, path.join(out, file));
}

// V5.8 : conserver le moteur V5.3 stable, mais rendre les codes réellement utilisables.
const editorialPath = path.join(out, 'editorial-mode-v53.js');
let editorial = fs.readFileSync(editorialPath, 'utf8');

editorial = editorial
  .replace("if(complexity)complexity.value='high';", "if(complexity)complexity.value='medium';")
  .replace(
    '<label>Codes<select class="field" id="editorialCodes"><option value="hybrid" selected>1–9, 0, A…</option><option value="numbers">Chiffres uniquement</option></select></label>',
    '<label>Codes<select class="field" id="editorialCodes"><option value="hybrid">1–9, 0, A…</option><option value="numbers" selected>Chiffres uniquement</option></select></label>'
  );

const oldLabels = "let labels=0;if(numbered){ctx.textAlign='center';ctx.textBaseline='middle';const minLabel=Math.max(18,Math.round(step*step*.28));for(const r of regs){if(r.size<minLabel)continue;const text=codeFor(r.code),[lx,ly]=r.label,fs=Math.max(4.8,Math.min(7.2,Math.sqrt(r.size)*.14));ctx.font=`500 ${fs}px Arial`;ctx.fillStyle=sm[strokeColor?.value||'light'];ctx.fillText(text,ox+(lx+.5)*scale,oy+(ly+.5)*scale);labels++;}}";

const newLabels = `let labels=0;if(numbered){
        ctx.textAlign='center';ctx.textBaseline='middle';
        const readability=window.__LION_LABEL_READABILITY__||'readable';
        const minLabel=readability==='xl'?6:readability==='standard'?12:8;
        const minFont=readability==='xl'?15:readability==='standard'?10:12;
        const maxFont=readability==='xl'?22:readability==='standard'?15:18;
        for(const r of regs){
          if(r.size<minLabel)continue;
          const text=codeFor(r.code),[lx,ly]=r.label;
          const fs=Math.max(minFont,Math.min(maxFont,Math.sqrt(r.size)*.30));
          const x=ox+(lx+.5)*scale,y=oy+(ly+.5)*scale;
          ctx.font=\`700 \${fs}px Arial\`;
          ctx.lineJoin='round';ctx.miterLimit=2;
          ctx.strokeStyle='#ffffff';ctx.lineWidth=readability==='xl'?4:3;
          ctx.strokeText(text,x,y);
          ctx.fillStyle=readability==='standard'?'#5c5752':'#403b36';
          ctx.fillText(text,x,y);
          labels++;
        }
      }`;

if (!editorial.includes(oldLabels)) {
  throw new Error('Bloc des codes V5.3 introuvable : correctif V5.8 non appliqué.');
}
editorial = editorial.replace(oldLabels, newLabels);
fs.writeFileSync(editorialPath, editorial, 'utf8');

const indexPath = path.join(out, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html
  .replace(/\s*<script src="payload2\.js"><\/script>/g, '')
  .replace(/\s*<script src="example-mode-v2\.js"><\/script>/g, '')
  .replace(/\s*<script src="editorial-mode-v5\.js"><\/script>/g, '')
  .replace(/\s*<script src="editorial-mode-v53\.js"><\/script>/g, '')
  .replace(/\s*<script src="editorial-mode-v54\.js"><\/script>/g, '')
  .replace(/\s*<script src="editorial-labels-v55\.js"><\/script>/g, '')
  .replace(/\s*<script src="editorial-runtime-fix-v56\.js"><\/script>/g, '')
  .replace(/\s*<script src="editorial-runtime-fix-v57\.js"><\/script>/g, '');
html = html.replace('</body>', '  <script src="editorial-mode-v53.js"></script>\n  <script src="editorial-labels-v55.js"></script>\n  <script src="editorial-runtime-fix-v57.js"></script>\n</body>');
fs.writeFileSync(indexPath, html, 'utf8');

console.log(`Lion Dynasty: ${files.length} fichiers de production copiés dans dist/.`);
console.log('Lion Dynasty: V5.3 stable + V5.8 codes grands, foncés et lisibles actif.');

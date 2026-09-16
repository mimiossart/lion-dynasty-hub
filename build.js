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
  'editorial-mode-v54.js',
  'editorial-labels-v55.js',
  'editorial-runtime-fix-v56.js'
];

const out = path.join(process.cwd(), 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of files) {
  if (!fs.existsSync(file)) throw new Error(`Fichier statique manquant: ${file}`);
  fs.copyFileSync(file, path.join(out, file));
}

const indexPath = path.join(out, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html
  .replace(/\s*<script src="payload2\.js"><\/script>/g, '')
  .replace(/\s*<script src="example-mode-v2\.js"><\/script>/g, '')
  .replace(/\s*<script src="editorial-mode-v5\.js"><\/script>/g, '')
  .replace(/\s*<script src="editorial-mode-v53\.js"><\/script>/g, '')
  .replace(/\s*<script src="editorial-mode-v54\.js"><\/script>/g, '')
  .replace(/\s*<script src="editorial-labels-v55\.js"><\/script>/g, '')
  .replace(/\s*<script src="editorial-runtime-fix-v56\.js"><\/script>/g, '');
html = html.replace('</body>', '  <script src="editorial-mode-v54.js"></script>\n  <script src="editorial-labels-v55.js"></script>\n  <script src="editorial-runtime-fix-v56.js"></script>\n</body>');
fs.writeFileSync(indexPath, html, 'utf8');

console.log(`Lion Dynasty: ${files.length} fichiers de production copiés dans dist/.`);
console.log('Lion Dynasty: V5.4 + V5.5 codes lisibles + V5.6 stabilisation UI actifs.');

const fs = require('fs');
const path = require('path');

// Netlify UI force encore `node build.js`.
// Le site est statique : on prépare simplement un dossier dist propre.
const files = [
  'index.html',
  'styles.css',
  'config.js',
  'app.js',
  'app.part1.txt',
  'app.part2.txt',
  'app.part3.txt',
  'app.part4.txt',
  'app.part5.txt'
];

const out = path.join(process.cwd(), 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of files) {
  if (!fs.existsSync(file)) {
    throw new Error(`Fichier statique manquant: ${file}`);
  }
  fs.copyFileSync(file, path.join(out, file));
}

console.log(`Lion Dynasty: ${files.length} fichiers statiques copiés dans dist/.`);
console.log('Lion Dynasty: build statique prêt.');

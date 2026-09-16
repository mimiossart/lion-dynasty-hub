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

// V5.14 : moteur V5.3 stable + codes garantis dans les zones utiles.
const editorialPath = path.join(out, 'editorial-mode-v53.js');
let editorial = fs.readFileSync(editorialPath, 'utf8');

editorial = editorial
  .replace("if(complexity)complexity.value='high';", "if(complexity)complexity.value='medium';")
  .replace("if(merge)merge.value='strong';", "if(merge)merge.value='medium';")
  .replace(
    '<label>Codes<select class="field" id="editorialCodes"><option value="hybrid" selected>1–9, 0, A…</option><option value="numbers">Chiffres uniquement</option></select></label>',
    '<label>Codes<select class="field" id="editorialCodes"><option value="hybrid">1–9, 0, A…</option><option value="numbers" selected>Chiffres uniquement</option></select></label>'
  );

const oldLabels = "let labels=0;if(numbered){ctx.textAlign='center';ctx.textBaseline='middle';const minLabel=Math.max(18,Math.round(step*step*.28));for(const r of regs){if(r.size<minLabel)continue;const text=codeFor(r.code),[lx,ly]=r.label,fs=Math.max(4.8,Math.min(7.2,Math.sqrt(r.size)*.14));ctx.font=`500 ${fs}px Arial`;ctx.fillStyle=sm[strokeColor?.value||'light'];ctx.fillText(text,ox+(lx+.5)*scale,oy+(ly+.5)*scale);labels++;}}";

const newLabels = `let labels=0;if(numbered){
        ctx.textAlign='center';ctx.textBaseline='middle';
        const readability=window.__LION_LABEL_READABILITY__||'readable';
        const minArea=readability==='xl'?5:readability==='standard'?12:7;
        const minFont=readability==='xl'?15:readability==='standard'?9:12;
        const maxFont=readability==='xl'?21:readability==='standard'?14:18;
        const maxLabels=readability==='xl'?220:readability==='standard'?150:190;
        const placed=[];
        const usedRegions=new Set();
        const candidates=regs
          .filter(r=>r.size>=minArea)
          .sort((a,b)=>b.size-a.size);

        const drawCode=(text,x,y,fs)=>{
          ctx.font='700 '+fs+'px Arial';
          ctx.lineJoin='round';ctx.miterLimit=2;
          ctx.strokeStyle='#ffffff';ctx.lineWidth=readability==='xl'?3:2.2;
          ctx.strokeText(text,x,y);
          ctx.fillStyle=readability==='standard'?'#514c47':'#302b27';
          ctx.fillText(text,x,y);
        };

        // Passe principale : un code par vraie zone, sans exiger une grande marge aux contours.
        for(let ri=0;ri<candidates.length&&labels<maxLabels;ri++){
          const r=candidates[ri];
          let lx=r.label?.[0],ly=r.label?.[1];
          if(!Number.isFinite(lx)||!Number.isFinite(ly)){lx=Math.round(r.cx);ly=Math.round(r.cy);}
          const x=ox+(lx+.5)*scale,y=oy+(ly+.5)*scale;
          const fs=Math.max(minFont,Math.min(maxFont,Math.sqrt(r.size)*.20));
          const radius=Math.max(5,fs*.42);
          let collision=false;
          for(const p of placed){
            if(Math.hypot(x-p.x,y-p.y)<Math.max(6,(radius+p.r)*.40)){collision=true;break;}
          }
          if(collision)continue;
          drawCode(codeFor(r.code),x,y,fs);
          placed.push({x,y,r:radius});
          usedRegions.add(ri);
          labels++;
        }

        // Filet de sécurité : si la segmentation fournit trop peu de codes,
        // on ajoute des repères espacés calculés directement depuis la couleur locale.
        const targetLabels=Math.min(maxLabels,readability==='standard'?55:readability==='xl'?95:75);
        if(labels<targetLabels && model.raw && model.edge){
          const raw=model.raw,edge=model.edge;
          const stride=Math.max(20,Math.round(Math.min(w,h)/9));
          const start=Math.round(stride*.55);
          for(let sy=start;sy<h-start&&labels<targetLabels;sy+=stride){
            for(let sx=start;sx<w-start&&labels<targetLabels;sx+=stride){
              const idx=sy*w+sx;
              if(edge[idx]>150)continue;
              const x=ox+(sx+.5)*scale,y=oy+(sy+.5)*scale;
              const fs=readability==='xl'?15:readability==='standard'?9.5:12.5;
              const radius=Math.max(5,fs*.42);
              let collision=false;
              for(const p of placed){
                if(Math.hypot(x-p.x,y-p.y)<Math.max(8,(radius+p.r)*.58)){collision=true;break;}
              }
              if(collision)continue;
              const o=idx*4;
              const color=[raw[o],raw[o+1],raw[o+2]];
              let bi=0,bd=Infinity;
              for(let pi=0;pi<palette.length;pi++){
                const d=cdist(color,palette[pi]);
                if(d<bd){bd=d;bi=pi;}
              }
              drawCode(codeFor(bi),x,y,fs);
              placed.push({x,y,r:radius});
              labels++;
            }
          }
        }
      }`;

if (!editorial.includes(oldLabels)) {
  throw new Error('Bloc des codes V5.3 introuvable : correctif V5.14 non appliqué.');
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
console.log('Lion Dynasty: V5.14 codes garantis par zone + filet de sécurité couleur actif.');

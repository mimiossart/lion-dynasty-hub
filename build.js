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

// V5.12 : placement équilibré avec davantage de codes lisibles.
const editorialPath = path.join(out, 'editorial-mode-v53.js');
let editorial = fs.readFileSync(editorialPath, 'utf8');

editorial = editorial
  .replace("if(complexity)complexity.value='high';", "if(complexity)complexity.value='medium';")
  .replace("if(merge)merge.value='strong';", "if(merge)merge.value='medium';")
  .replace(
    '<label>Codes<select class="field" id="editorialCodes"><option value="hybrid" selected>1–9, 0, A…</option><option value="numbers">Chiffres uniquement</option></select></label>',
    '<label>Codes<select class="field" id="editorialCodes"><option value="hybrid">1–9, 0, A…</option><option value="numbers" selected>Chiffres uniquement</option></select></label>'
  );

const oldLabelPoint = "function labelPoint(r,w){const set=new Set(r.cells);let bx=Math.round(r.cx),by=Math.round(r.cy),best=-1;const step=Math.max(1,Math.floor(Math.sqrt(r.size)/8));for(let y=r.minY;y<=r.maxY;y+=step)for(let x=r.minX;x<=r.maxX;x+=step){if(!set.has(y*w+x))continue;let d=0;for(let rr=1;rr<=10;rr++){let ok=true;for(let dx=-rr;dx<=rr;dx++){if(!set.has((y-rr)*w+x+dx)||!set.has((y+rr)*w+x+dx)){ok=false;break;}}if(ok)for(let dy=-rr;dy<=rr;dy++){if(!set.has((y+dy)*w+x-rr)||!set.has((y+dy)*w+x+rr)){ok=false;break;}}if(!ok)break;d=rr;}if(d>best){best=d;bx=x;by=y;}}return[bx,by];}";

const newLabelPoint = `function labelPoint(r,w){
      const set=new Set(r.cells);
      let bx=Math.round(r.cx),by=Math.round(r.cy),bestScore=-Infinity,bestClear=0;
      const sample=Math.max(1,Math.floor(Math.sqrt(r.size)/14));
      for(let y=r.minY;y<=r.maxY;y+=sample){
        for(let x=r.minX;x<=r.maxX;x+=sample){
          if(!set.has(y*w+x))continue;
          let clearance=0;
          for(let rr=1;rr<=14;rr++){
            let inside=true;
            for(let dx=-rr;dx<=rr;dx++){
              const y1=y-rr,y2=y+rr,x1=x+dx;
              if(y1<0||y2<0||x1<0||x1>=w||!set.has(y1*w+x1)||!set.has(y2*w+x1)){inside=false;break;}
            }
            if(inside){
              for(let dy=-rr+1;dy<=rr-1;dy++){
                const x1=x-rr,x2=x+rr,y1=y+dy;
                if(y1<0||x1<0||x2>=w||!set.has(y1*w+x1)||!set.has(y1*w+x2)){inside=false;break;}
              }
            }
            if(!inside)break;
            clearance=rr;
          }
          const centerPenalty=Math.hypot(x-r.cx,y-r.cy)*0.012;
          const score=clearance-centerPenalty;
          if(score>bestScore){bestScore=score;bestClear=clearance;bx=x;by=y;}
        }
      }
      return[bx,by,bestClear];
    }`;

if (!editorial.includes(oldLabelPoint)) {
  throw new Error('Fonction labelPoint V5.3 introuvable : correctif V5.12 non appliqué.');
}
editorial = editorial.replace(oldLabelPoint, newLabelPoint);

const oldLabels = "let labels=0;if(numbered){ctx.textAlign='center';ctx.textBaseline='middle';const minLabel=Math.max(18,Math.round(step*step*.28));for(const r of regs){if(r.size<minLabel)continue;const text=codeFor(r.code),[lx,ly]=r.label,fs=Math.max(4.8,Math.min(7.2,Math.sqrt(r.size)*.14));ctx.font=`500 ${fs}px Arial`;ctx.fillStyle=sm[strokeColor?.value||'light'];ctx.fillText(text,ox+(lx+.5)*scale,oy+(ly+.5)*scale);labels++;}}";

const newLabels = `let labels=0;if(numbered){
        ctx.textAlign='center';ctx.textBaseline='middle';
        const readability=window.__LION_LABEL_READABILITY__||'readable';
        const minArea=readability==='xl'?7:readability==='standard'?14:9;
        const minFont=readability==='xl'?18:readability==='standard'?11:14;
        const maxFont=readability==='xl'?24:readability==='standard'?16:20;
        const maxLabels=readability==='xl'?280:readability==='standard'?180:230;
        const candidates=regs
          .filter(r=>r.size>=minArea&&r.label&&Number.isFinite(r.label[0])&&Number.isFinite(r.label[1]))
          .sort((a,b)=>b.size-a.size);
        const desired=Math.min(maxLabels,Math.max(55,Math.round(candidates.length*.62)));
        const placed=[],used=new Set();

        const placePass=(clearanceFloor,separation,minDistance)=>{
          for(let ri=0;ri<candidates.length;ri++){
            if(labels>=maxLabels)break;
            if(used.has(ri))continue;
            const r=candidates[ri],point=r.label||[];
            const lx=point[0],ly=point[1],clear=point[2]||0;
            if(clear<clearanceFloor)continue;
            const x=ox+(lx+.5)*scale,y=oy+(ly+.5)*scale;
            const areaFont=Math.sqrt(r.size)*.23;
            const clearFont=Math.max(0,clear*scale*1.1);
            const fs=Math.max(minFont,Math.min(maxFont,Math.max(areaFont,clearFont)));
            const radius=Math.max(5,fs*.42);
            let collision=false;
            for(const p of placed){
              if(Math.hypot(x-p.x,y-p.y)<Math.max(minDistance,(radius+p.r)*separation)){collision=true;break;}
            }
            if(collision)continue;
            const text=codeFor(r.code);
            ctx.font='700 '+fs+'px Arial';
            ctx.lineJoin='round';ctx.miterLimit=2;
            ctx.strokeStyle='#ffffff';ctx.lineWidth=readability==='xl'?3.2:2.3;
            ctx.strokeText(text,x,y);
            ctx.fillStyle=readability==='standard'?'#514c47':'#332e2a';
            ctx.fillText(text,x,y);
            placed.push({x,y,r:radius});
            used.add(ri);
            labels++;
          }
        };

        // Passe 1 : centres les plus sûrs.
        placePass(.25,.68,8);
        // Passe 2 : assouplit la marge aux contours et entre codes.
        if(labels<desired)placePass(0,.48,6);
        // Passe 3 : complète raisonnablement les zones restantes sans superposition directe.
        if(labels<Math.min(desired,95))placePass(0,.34,4);
      }`;

if (!editorial.includes(oldLabels)) {
  throw new Error('Bloc des codes V5.3 introuvable : correctif V5.12 non appliqué.');
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
console.log('Lion Dynasty: V5.12 codes plus nombreux, bien espacés et centrés actif.');

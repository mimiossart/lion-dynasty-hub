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

// V5.15 : codes plus propres, mieux espacés et priorité aux vraies zones.
const editorialPath = path.join(out, 'editorial-mode-v53.js');
let editorial = fs.readFileSync(editorialPath, 'utf8');

editorial = editorial
  .replace("if(complexity)complexity.value='high';", "if(complexity)complexity.value='medium';")
  .replace("if(merge)merge.value='strong';", "if(merge)merge.value='medium';")
  .replace(
    '<label>Codes<select class="field" id="editorialCodes"><option value="hybrid" selected>1–9, 0, A…</option><option value="numbers">Chiffres uniquement</option></select></label>',
    '<label>Codes<select class="field" id="editorialCodes"><option value="hybrid">1–9, 0, A…</option><option value="numbers" selected>Chiffres uniquement</option></select></label>'
  )
  // contours un peu plus présents à l’écran et à l’impression
  .replace("ctx.save();ctx.globalAlpha=.56;ctx.imageSmoothingEnabled=true;", "ctx.save();ctx.globalAlpha=.70;ctx.imageSmoothingEnabled=true;")
  .replace("ctx.lineWidth=(strokeWidth?.value||'fine')==='fine'?.62:1.0;", "ctx.lineWidth=(strokeWidth?.value||'fine')==='fine'?.82:1.10;");

const oldLabels = "let labels=0;if(numbered){ctx.textAlign='center';ctx.textBaseline='middle';const minLabel=Math.max(18,Math.round(step*step*.28));for(const r of regs){if(r.size<minLabel)continue;const text=codeFor(r.code),[lx,ly]=r.label,fs=Math.max(4.8,Math.min(7.2,Math.sqrt(r.size)*.14));ctx.font=`500 ${fs}px Arial`;ctx.fillStyle=sm[strokeColor?.value||'light'];ctx.fillText(text,ox+(lx+.5)*scale,oy+(ly+.5)*scale);labels++;}}";

const newLabels = `let labels=0;if(numbered){
        ctx.textAlign='center';ctx.textBaseline='middle';
        const readability=window.__LION_LABEL_READABILITY__||'readable';
        const minArea=readability==='xl'?9:readability==='standard'?18:12;
        const minFont=readability==='xl'?15:readability==='standard'?9:11.5;
        const maxFont=readability==='xl'?21:readability==='standard'?13.5:17;
        const maxLabels=readability==='xl'?115:readability==='standard'?72:92;
        const placed=[];

        const regionScore=(r)=>{
          let edgeSum=0,samples=0;
          if(model.edge&&r.cells?.length){
            const stepCell=Math.max(1,Math.floor(r.cells.length/18));
            for(let ci=0;ci<r.cells.length;ci+=stepCell){edgeSum+=model.edge[r.cells[ci]]||0;samples++;}
          }
          const edgeMean=samples?edgeSum/samples:0;
          const dx=(r.cx-w/2)/(w/2),dy=(r.cy-h/2)/(h/2);
          const central=Math.max(0,1-Math.hypot(dx,dy)*.55);
          return Math.sqrt(r.size)*(1+edgeMean/210)*(0.82+central*.28);
        };

        const candidates=regs
          .filter(r=>{
            const bw=Math.max(1,r.maxX-r.minX+1),bh=Math.max(1,r.maxY-r.minY+1);
            return r.size>=minArea && Math.min(bw,bh)>=2;
          })
          .sort((a,b)=>regionScore(b)-regionScore(a));

        const drawCode=(text,x,y,fs)=>{
          ctx.font='700 '+fs+'px Arial';
          ctx.lineJoin='round';ctx.miterLimit=2;
          ctx.strokeStyle='#ffffff';ctx.lineWidth=readability==='xl'?3.0:2.2;
          ctx.strokeText(text,x,y);
          ctx.fillStyle=readability==='standard'?'#514c47':'#302b27';
          ctx.fillText(text,x,y);
        };

        // Priorité aux vraies zones de la segmentation.
        for(const r of candidates){
          if(labels>=maxLabels)break;
          let lx=r.label?.[0],ly=r.label?.[1];
          if(!Number.isFinite(lx)||!Number.isFinite(ly)){lx=Math.round(r.cx);ly=Math.round(r.cy);}
          const x=ox+(lx+.5)*scale,y=oy+(ly+.5)*scale;
          const fs=Math.max(minFont,Math.min(maxFont,Math.sqrt(r.size)*.19));
          const radius=Math.max(5.5,fs*.47);
          let collision=false;
          for(const p of placed){
            if(Math.hypot(x-p.x,y-p.y)<Math.max(11,(radius+p.r)*.72)){collision=true;break;}
          }
          if(collision)continue;
          drawCode(codeFor(r.code),x,y,fs);
          placed.push({x,y,r:radius});
          labels++;
        }

        // Filet de sécurité plus discret : seulement si les vraies zones donnent trop peu de codes.
        const fallbackTarget=readability==='standard'?34:readability==='xl'?52:44;
        if(labels<fallbackTarget && model.raw && model.edge){
          const raw=model.raw,edge=model.edge;
          const stride=Math.max(28,Math.round(Math.min(w,h)/6.8));
          const points=[];
          const start=Math.round(stride*.55);
          for(let sy=start;sy<h-start;sy+=stride){
            for(let sx=start;sx<w-start;sx+=stride){
              const idx=sy*w+sx,e=edge[idx]||0;
              // Évite de remplir le fond totalement plat, mais garde les grandes zones utiles.
              if(e>165)continue;
              const dx=(sx-w/2)/(w/2),dy=(sy-h/2)/(h/2);
              const central=Math.max(0,1-Math.hypot(dx,dy));
              const score=e*1.35+central*34;
              points.push({sx,sy,idx,score});
            }
          }
          points.sort((a,b)=>b.score-a.score);
          for(const pt of points){
            if(labels>=fallbackTarget)break;
            const x=ox+(pt.sx+.5)*scale,y=oy+(pt.sy+.5)*scale;
            const fs=readability==='xl'?14.5:readability==='standard'?9:11.5;
            const radius=Math.max(5,fs*.46);
            let collision=false;
            for(const p of placed){
              if(Math.hypot(x-p.x,y-p.y)<Math.max(15,(radius+p.r)*.86)){collision=true;break;}
            }
            if(collision)continue;
            const o=pt.idx*4;
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
      }`;

if (!editorial.includes(oldLabels)) {
  throw new Error('Bloc des codes V5.3 introuvable : correctif V5.15 non appliqué.');
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
console.log('Lion Dynasty: V5.15 codes plus propres, mieux espacés et contours renforcés actif.');

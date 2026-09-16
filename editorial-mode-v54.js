(() => {
  const boot = (attempt = 0) => {
    const upload = document.getElementById('pixelUpload');
    const mode = document.getElementById('pixelMode');
    if (!upload || !mode) {
      if (attempt < 120) setTimeout(() => boot(attempt + 1), 100);
      return;
    }
    if (window.__LION_EDITORIAL_V54__) return;
    init();
  };

  function init() {
    window.__LION_EDITORIAL_V54__ = true;

    const clone = id => {
      const old = document.getElementById(id);
      if (!old) return null;
      const el = old.cloneNode(true);
      old.replaceWith(el);
      return el;
    };

    const upload = clone('pixelUpload');
    const grid = clone('gridSize');
    const colors = clone('colorCount');
    const mode = clone('pixelMode');
    const download = clone('downloadPixel');
    const printBtn = clone('printPixel');
    const canvas = document.getElementById('pixelCanvas');
    const ctx = canvas?.getContext('2d');
    const legend = document.getElementById('pixelLegend');
    const info = document.getElementById('pixelInfo');
    const card = upload?.closest('.card');
    const intro = card?.querySelector('p');
    if (!upload || !grid || !colors || !mode || !canvas || !ctx || !legend || !info) return;

    mode.innerHTML = `
      <option value="editorial-numbered" selected>Éditorial V5.4 — contours + super-zones + codes</option>
      <option value="editorial-line">Éditorial V5.4 — contour seul</option>
      <option value="preview">Aperçu couleur des zones</option>`;
    colors.innerHTML = `
      <option value="10">10 couleurs</option>
      <option value="12">12 couleurs</option>
      <option value="14">14 couleurs</option>
      <option value="16" selected>16 couleurs</option>`;
    grid.innerHTML = `
      <option value="medium">Détail moyen</option>
      <option value="high" selected>Détail élevé</option>
      <option value="ultra">Détail très élevé</option>`;
    mode.value = 'editorial-numbered';
    colors.value = '16';
    grid.value = 'high';
    if (intro) intro.textContent = 'V5.4 : segmentation guidée par les contours et super-zones organiques. Idéal pour véhicules, objets, portraits, paysages et illustrations.';

    let controls = document.getElementById('exampleControls');
    if (!controls) {
      controls = document.createElement('div');
      controls.id = 'exampleControls';
      controls.className = 'example-controls';
      mode.insertAdjacentElement('afterend', controls);
    }
    controls.hidden = false;
    controls.innerHTML = `
      <label>Type de photo
        <select class="field" id="editorialPreset">
          <option value="object" selected>Véhicule / objet détaillé</option>
          <option value="portrait">Portrait</option>
          <option value="landscape">Paysage</option>
          <option value="illustration">Illustration / dessin</option>
        </select>
      </label>
      <label>Fusion des petites zones
        <select class="field" id="editorialMerge">
          <option value="low" selected>Faible</option>
          <option value="medium">Moyenne</option>
          <option value="strong">Forte</option>
        </select>
      </label>
      <label>Préserver texte / logo
        <select class="field" id="editorialText">
          <option value="on" selected>Oui</option>
          <option value="off">Non</option>
        </select>
      </label>
      <label>Grandes surfaces
        <select class="field" id="editorialSubdivide">
          <option value="on" selected>Subdiviser</option>
          <option value="off">Conserver</option>
        </select>
      </label>
      <label>Trait
        <select class="field" id="editorialStrokeWidth">
          <option value="fine" selected>Fin</option>
          <option value="medium">Moyen</option>
        </select>
      </label>
      <label>Couleur du trait
        <select class="field" id="editorialStrokeColor">
          <option value="light" selected>Gris clair</option>
          <option value="medium">Gris moyen</option>
          <option value="dark">Noir doux</option>
        </select>
      </label>
      <label>Codes
        <select class="field" id="editorialCodes">
          <option value="hybrid" selected>1–9, 0, A…</option>
          <option value="numbers">Chiffres uniquement</option>
        </select>
      </label>
      <label>Repères de page
        <select class="field" id="editorialGuide">
          <option value="off" selected>Sans grille</option>
          <option value="on">Grille très légère</option>
        </select>
      </label>`;

    const preset = document.getElementById('editorialPreset');
    const merge = document.getElementById('editorialMerge');
    const textMode = document.getElementById('editorialText');
    const subdivide = document.getElementById('editorialSubdivide');
    const strokeWidth = document.getElementById('editorialStrokeWidth');
    const strokeColor = document.getElementById('editorialStrokeColor');
    const codeMode = document.getElementById('editorialCodes');
    const guide = document.getElementById('editorialGuide');

    let image = null;
    let model = null;
    let buildToken = 0;

    const clamp = v => Math.max(0, Math.min(255, v));
    const lum = c => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
    const hex = c => '#' + c.map(v => Math.round(clamp(v)).toString(16).padStart(2, '0')).join('').toUpperCase();
    const colorDistance = (a, b) => .30 * (a[0]-b[0])**2 + .59 * (a[1]-b[1])**2 + .11 * (a[2]-b[2])**2;
    const pointColor = (raw, idx) => {
      const o = idx * 4;
      return [raw[o], raw[o+1], raw[o+2]];
    };

    function average(points) {
      let r=0,g=0,b=0;
      for (const p of points) { r+=p[0]; g+=p[1]; b+=p[2]; }
      const n = Math.max(1, points.length);
      return [r/n,g/n,b/n];
    }

    function medianCut(pixels, count) {
      const range = (pts, k) => {
        let lo=255,hi=0;
        for (const p of pts) { lo=Math.min(lo,p[k]); hi=Math.max(hi,p[k]); }
        return hi-lo;
      };
      let boxes = [pixels.slice()];
      while (boxes.length < count) {
        let best=-1,score=-1,channel=0;
        boxes.forEach((box,i) => {
          if (box.length < 2) return;
          const ranges = [0,1,2].map(k => range(box,k));
          const ch = ranges.indexOf(Math.max(...ranges));
          const s = ranges[ch] * Math.sqrt(box.length);
          if (s > score) { score=s; best=i; channel=ch; }
        });
        if (best < 0) break;
        const box = boxes.splice(best,1)[0].sort((a,b)=>a[channel]-b[channel]);
        const mid = Math.floor(box.length/2);
        boxes.push(box.slice(0,mid), box.slice(mid));
      }
      return boxes.map(average);
    }

    function refinePalette(pixels, palette, loops=6) {
      let cs = palette.map(c=>c.slice());
      for (let pass=0; pass<loops; pass++) {
        const sums = cs.map(()=>[0,0,0,0]);
        for (const p of pixels) {
          let bi=0,bd=Infinity;
          for (let i=0;i<cs.length;i++) {
            const d=colorDistance(p,cs[i]);
            if (d<bd) { bd=d; bi=i; }
          }
          const s=sums[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++;
        }
        cs = cs.map((c,i)=>sums[i][3] ? [sums[i][0]/sums[i][3],sums[i][1]/sums[i][3],sums[i][2]/sums[i][3]] : c);
      }
      return cs;
    }

    function cropRect(img,w,h) {
      const src = img.width/img.height, dst=w/h;
      let sw=img.width, sh=img.height, sx=0, sy=0;
      if (src > dst) { sw=img.height*dst; sx=(img.width-sw)/2; }
      else if (src < dst) { sh=img.width/dst; sy=(img.height-sh)/2; }
      return {sx,sy,sw,sh};
    }

    function boxBlur(raw,w,h,passes=1) {
      let cur = new Uint8ClampedArray(raw);
      for (let pass=0; pass<passes; pass++) {
        const out = new Uint8ClampedArray(cur.length);
        for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
          let r=0,g=0,b=0,n=0;
          for (let dy=-1;dy<=1;dy++) {
            const yy=y+dy; if (yy<0||yy>=h) continue;
            for (let dx=-1;dx<=1;dx++) {
              const xx=x+dx; if (xx<0||xx>=w) continue;
              const o=(yy*w+xx)*4; r+=cur[o]; g+=cur[o+1]; b+=cur[o+2]; n++;
            }
          }
          const o=(y*w+x)*4; out[o]=r/n; out[o+1]=g/n; out[o+2]=b/n; out[o+3]=255;
        }
        cur=out;
      }
      return cur;
    }

    function sobel(raw,w,h) {
      const gray=new Float32Array(w*h), grad=new Uint8ClampedArray(w*h);
      for (let i=0;i<w*h;i++) { const o=i*4; gray[i]=.299*raw[o]+.587*raw[o+1]+.114*raw[o+2]; }
      let max=1;
      for (let y=1;y<h-1;y++) for (let x=1;x<w-1;x++) {
        const i=y*w+x;
        const gx=-gray[i-w-1]-2*gray[i-1]-gray[i+w-1]+gray[i-w+1]+2*gray[i+1]+gray[i+w+1];
        const gy=-gray[i-w-1]-2*gray[i-w]-gray[i-w+1]+gray[i+w-1]+2*gray[i+w]+gray[i+w+1];
        const v=Math.hypot(gx,gy); grad[i]=Math.min(255,v); if(v>max)max=v;
      }
      if (max>255) for(let i=0;i<grad.length;i++) grad[i]=Math.min(255,grad[i]*255/max);
      return grad;
    }

    function paletteFromRaw(raw,count) {
      const pts=[], n=raw.length/4, step=Math.max(1,Math.floor(n/60000));
      for(let i=0;i<n;i+=step) pts.push(pointColor(raw,i));
      return refinePalette(pts,medianCut(pts,count),6).sort((a,b)=>lum(a)-lum(b));
    }

    const hash=(x,y)=>{
      let n=(x*374761393+y*668265263)>>>0;
      n=(n^(n>>13))*1274126177>>>0;
      return ((n^(n>>16))>>>0)/4294967295;
    };

    function presetParams() {
      const detail=grid.value, p=preset.value;
      const ultra=detail==='ultra', high=detail==='high';
      const table={
        object:{step:ultra?6:high?8:11,edge:17,color:4.2,local:4.8,spatial:.065,blur:1,extraEdgeSeeds:true},
        portrait:{step:ultra?6:high?8:11,edge:12,color:4.5,local:3.4,spatial:.060,blur:1,extraEdgeSeeds:true},
        landscape:{step:ultra?9:high?12:16,edge:8,color:3.4,local:2.8,spatial:.045,blur:2,extraEdgeSeeds:false},
        illustration:{step:ultra?5:high?7:10,edge:21,color:3.5,local:5.2,spatial:.055,blur:0,extraEdgeSeeds:true}
      };
      const q={...table[p]};
      if (subdivide.value==='off') q.step=Math.round(q.step*1.55);
      if (merge.value==='strong') q.step=Math.round(q.step*1.18);
      if (merge.value==='low') q.step=Math.max(4,Math.round(q.step*.88));
      return q;
    }

    function analysisSize(img,q) {
      const longSide = Math.min(720, Math.max(360, Math.round(560 * (8/q.step))));
      const aspect=img.width/img.height;
      return aspect>=1 ? {w:longSide,h:Math.max(180,Math.round(longSide/aspect))} : {h:longSide,w:Math.max(180,Math.round(longSide*aspect))};
    }

    function localEdgeMean(edge,w,h,x,y,r) {
      let sum=0,n=0;
      for(let dy=-r;dy<=r;dy++) { const yy=y+dy; if(yy<0||yy>=h)continue;
        for(let dx=-r;dx<=r;dx++) { const xx=x+dx; if(xx<0||xx>=w)continue; sum+=edge[yy*w+xx]; n++; }
      }
      return n?sum/n:0;
    }

    function makeSeeds(raw,edge,w,h,q) {
      const seeds=[], used=new Uint8Array(w*h);
      const add=(x,y,kind='base')=>{
        x=Math.max(2,Math.min(w-3,Math.round(x))); y=Math.max(2,Math.min(h-3,Math.round(y)));
        let bx=x,by=y,bv=edge[y*w+x];
        for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) {
          const xx=x+dx,yy=y+dy;if(xx<1||yy<1||xx>=w-1||yy>=h-1)continue;
          const v=edge[yy*w+xx]; if(v<bv){bv=v;bx=xx;by=yy;}
        }
        const idx=by*w+bx; if(used[idx])return; used[idx]=1;
        seeds.push({idx,x:bx,y:by,c:pointColor(raw,idx),kind});
      };
      let row=0;
      for(let gy=Math.floor(q.step/2);gy<h;gy+=q.step,row++) {
        let col=0;
        for(let gx=Math.floor(q.step/2);gx<w;gx+=q.step,col++) {
          const j=.36*q.step;
          add(gx+(hash(col,row)-.5)*2*j, gy+(hash(row,col+37)-.5)*2*j);
          const em=localEdgeMean(edge,w,h,gx,gy,Math.max(2,Math.floor(q.step/2)));
          if(q.extraEdgeSeeds && em>42) {
            add(gx+q.step*.33,gy-q.step*.25,'detail');
            if(em>75) add(gx-q.step*.30,gy+q.step*.30,'detail');
          }
        }
      }
      if(textMode.value==='on') {
        for(let y=4;y<h-4;y+=4) for(let x=4;x<w-4;x+=4) {
          const i=y*w+x;
          if(edge[i]>135 && hash(x,y)>.62) add(x,y,'edge');
        }
      }
      return seeds;
    }

    class Heap {
      constructor(){this.a=[];}
      push(n){const a=this.a;a.push(n);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p][0]<=n[0])break;a[i]=a[p];i=p;}a[i]=n;}
      pop(){const a=this.a;if(!a.length)return null;const root=a[0],last=a.pop();if(a.length){let i=0;while(true){let l=i*2+1,r=l+1,b=i;if(l<a.length&&a[l][0]<(b===i?last[0]:a[b][0]))b=l;if(r<a.length&&a[r][0]<(b===i?last[0]:a[b][0]))b=r;if(b===i)break;a[i]=a[b];i=b;}a[i]=last;}return root;}
      get length(){return this.a.length;}
    }

    function segment(raw,edge,w,h,seeds,q) {
      const n=w*h, labels=new Int32Array(n);labels.fill(-1);
      const costs=new Float32Array(n);costs.fill(Infinity);
      const heap=new Heap();
      for(let s=0;s<seeds.length;s++) { const i=seeds[s].idx; costs[i]=0; labels[i]=s; heap.push([0,i,s]); }
      const dirs=[1,-1,w,-w];
      while(heap.length) {
        const node=heap.pop(); if(!node)break;
        const [cost,i,lab]=node; if(cost!==costs[i]||labels[i]!==lab)continue;
        const x=i%w,y=(i/w)|0, seed=seeds[lab], pc=pointColor(raw,i);
        for(const d of dirs) {
          const ni=i+d;if(ni<0||ni>=n)continue;
          const nx=ni%w,ny=(ni/w)|0;if(Math.abs(nx-x)+Math.abs(ny-y)!==1)continue;
          const nc=pointColor(raw,ni), e=edge[ni]/255;
          const seedDiff=Math.sqrt(colorDistance(nc,seed.c))/255;
          const localDiff=Math.sqrt(colorDistance(nc,pc))/255;
          const spatial=Math.hypot(nx-seed.x,ny-seed.y)/Math.max(1,q.step);
          const structural = e * q.edge * (textMode.value==='on' ? 1.15 : 1);
          const stepCost=1+structural+q.color*seedDiff+q.local*localDiff+q.spatial*spatial*spatial;
          const next=cost+stepCost;
          if(next<costs[ni]){costs[ni]=next;labels[ni]=lab;heap.push([next,ni,lab]);}
        }
      }
      return labels;
    }

    function regions(labels,w,h) {
      const map=new Map();
      for(let i=0;i<labels.length;i++) {
        const lab=labels[i]; let r=map.get(lab);
        const x=i%w,y=(i/w)|0;
        if(!r){r={lab,cells:[],size:0,sx:0,sy:0,minX:x,maxX:x,minY:y,maxY:y};map.set(lab,r);}
        r.cells.push(i);r.size++;r.sx+=x;r.sy+=y;r.minX=Math.min(r.minX,x);r.maxX=Math.max(r.maxX,x);r.minY=Math.min(r.minY,y);r.maxY=Math.max(r.maxY,y);
      }
      const out=[...map.values()];for(const r of out){r.cx=r.sx/r.size;r.cy=r.sy/r.size;}return out;
    }

    function mergeTinyRegions(labels,edge,raw,w,h,q) {
      const minSize = merge.value==='strong' ? Math.max(12,Math.round(q.step*q.step*.32)) : merge.value==='medium' ? Math.max(7,Math.round(q.step*q.step*.20)) : Math.max(4,Math.round(q.step*q.step*.10));
      let cur=new Int32Array(labels);
      const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
      for(let pass=0;pass<3;pass++) {
        const rs=regions(cur,w,h).sort((a,b)=>a.size-b.size); let changed=false;
        const means=new Map();
        for(const r of rs){let sr=0,sg=0,sb=0;for(const i of r.cells){const o=i*4;sr+=raw[o];sg+=raw[o+1];sb+=raw[o+2];}means.set(r.lab,[sr/r.size,sg/r.size,sb/r.size]);}
        for(const r of rs){
          if(r.size>=minSize) continue;
          const score=new Map();
          for(const i of r.cells){const x=i%w,y=(i/w)|0;for(const[dx,dy]of dirs){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const ni=ny*w+nx,nlab=cur[ni];if(nlab===r.lab)continue;const barrier=edge[ni]/255;const cd=Math.sqrt(colorDistance(means.get(r.lab),means.get(nlab)))/255;const s=(score.get(nlab)||0)+(1-barrier)*2.2+(1-cd)*1.5;score.set(nlab,s);}}
          let best=r.lab,bestScore=-Infinity;for(const [lab,s]of score){if(s>bestScore){bestScore=s;best=lab;}}
          if(best!==r.lab){for(const i of r.cells)cur[i]=best;changed=true;}
        }
        if(!changed)break;
      }
      return cur;
    }

    function paletteCodeForRegions(regs,raw,palette) {
      for(const r of regs){let sr=0,sg=0,sb=0;for(const i of r.cells){const o=i*4;sr+=raw[o];sg+=raw[o+1];sb+=raw[o+2];}const c=[sr/r.size,sg/r.size,sb/r.size];let bi=0,bd=Infinity;for(let j=0;j<palette.length;j++){const d=colorDistance(c,palette[j]);if(d<bd){bd=d;bi=j;}}r.code=bi;}
    }

    const pkey=(x,y)=>`${x},${y}`;
    function loopsForRegion(r,w,h) {
      const cells=new Set(r.cells), edges=new Map();
      const has=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&cells.has(y*w+x);
      const add=(x1,y1,x2,y2)=>{const k=pkey(x1,y1);if(!edges.has(k))edges.set(k,[]);edges.get(k).push([x2,y2]);};
      for(const i of r.cells){const x=i%w,y=(i/w)|0;if(!has(x,y-1))add(x,y,x+1,y);if(!has(x+1,y))add(x+1,y,x+1,y+1);if(!has(x,y+1))add(x+1,y+1,x,y+1);if(!has(x-1,y))add(x,y+1,x,y);}
      const loops=[];
      while(edges.size){const start=edges.keys().next().value,[sx,sy]=start.split(',').map(Number),loop=[[sx,sy]];let cur=start,guard=0;while(guard++<300000){const list=edges.get(cur);if(!list?.length)break;const next=list.shift();if(!list.length)edges.delete(cur);loop.push(next);cur=pkey(next[0],next[1]);if(cur===start)break;}if(loop.length>5)loops.push(loop);}
      return loops;
    }

    function simplify(points,tol) {
      let pts=points.slice();if(pts.length>1&&pkey(...pts[0])===pkey(...pts[pts.length-1]))pts.pop();
      const dist=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1];if(!dx&&!dy)return Math.hypot(p[0]-a[0],p[1]-a[1]);const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));};
      const rdp=arr=>{if(arr.length<=2)return arr;let max=0,idx=0;for(let i=1;i<arr.length-1;i++){const d=dist(arr[i],arr[0],arr[arr.length-1]);if(d>max){max=d;idx=i;}}if(max>tol){const l=rdp(arr.slice(0,idx+1)),r=rdp(arr.slice(idx));return l.slice(0,-1).concat(r);}return[arr[0],arr[arr.length-1]];};
      const out=rdp(pts);if(out.length>2)out.push(out[0]);return out;
    }

    function chaikin(points,passes=2) {
      let pts=points.slice();if(pts.length>1&&pkey(...pts[0])===pkey(...pts[pts.length-1]))pts.pop();
      for(let pass=0;pass<passes;pass++){const next=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];next.push([.75*a[0]+.25*b[0],.75*a[1]+.25*b[1]],[.25*a[0]+.75*b[0],.25*a[1]+.75*b[1]]);}pts=next;}
      if(pts.length)pts.push(pts[0]);return pts;
    }

    function labelPoint(r,w) {
      const set=new Set(r.cells);let bx=Math.round(r.cx),by=Math.round(r.cy),best=-1;
      const step=Math.max(1,Math.floor(Math.sqrt(r.size)/7));
      for(let y=r.minY;y<=r.maxY;y+=step) for(let x=r.minX;x<=r.maxX;x+=step){if(!set.has(y*w+x))continue;let d=0;for(let rr=1;rr<=12;rr++){let hit=false;for(let t=-rr;t<=rr;t++){if(!set.has((y-rr)*w+x+t)||!set.has((y+rr)*w+x+t)||!set.has((y+t)*w+x-rr)||!set.has((y+t)*w+x+rr)){hit=true;break;}}if(hit){d=rr;break;}d=rr;}if(d>best){best=d;bx=x;by=y;}}
      return[bx,by,best];
    }

    function codeLabel(i) {
      if(codeMode.value==='numbers')return String(i+1);
      const seq=['1','2','3','4','5','6','7','8','9','0','A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','X','Y','Z'];
      return seq[i]||String(i+1);
    }

    function structuralEdgePaths(edge,w,h,threshold) {
      const lines=[];
      for(let y=2;y<h-2;y+=2){let run=[];for(let x=2;x<w-2;x++){const v=edge[y*w+x];if(v>=threshold)run.push([x,y]);else if(run.length>=4){lines.push(run);run=[];}else run=[];}if(run.length>=4)lines.push(run);}
      for(let x=2;x<w-2;x+=2){let run=[];for(let y=2;y<h-2;y++){const v=edge[y*w+x];if(v>=threshold)run.push([x,y]);else if(run.length>=4){lines.push(run);run=[];}else run=[];}if(run.length>=4)lines.push(run);}
      return lines;
    }

    function buildModel(img) {
      const q=presetParams();
      const {w,h}=analysisSize(img,q);
      const c=document.createElement('canvas');c.width=w;c.height=h;
      const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
      const cr=cropRect(img,w,h);x.drawImage(img,cr.sx,cr.sy,cr.sw,cr.sh,0,0,w,h);
      let raw=x.getImageData(0,0,w,h).data;
      raw=q.blur?boxBlur(raw,w,h,q.blur):new Uint8ClampedArray(raw);
      const grad=sobel(raw,w,h);
      const palette=paletteFromRaw(raw,+colors.value);
      const seeds=makeSeeds(raw,grad,w,h,q);
      let labels=segment(raw,grad,w,h,seeds,q);
      labels=mergeTinyRegions(labels,grad,raw,w,h,q);
      const regs=regions(labels,w,h);
      paletteCodeForRegions(regs,raw,palette);
      const structure=textMode.value==='on'?structuralEdgePaths(grad,w,h,preset.value==='object'?112:128):[];
      return{w,h,raw,edge:grad,palette,labels,regions:regs,q,structure};
    }

    function renderEditorial(numbered=true) {
      if(!model)return;
      const W=1240,H=1754,margin=70,paletteH=210,top=95,bottom=H-paletteH-55;
      canvas.width=W;canvas.height=H;ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
      const artW=W-margin*2,artH=bottom-top;
      const scale=Math.min(artW/model.w,artH/model.h);
      const ox=(W-model.w*scale)/2,oy=top+(artH-model.h*scale)/2;
      const strokeMap={light:'#aaa7a3',medium:'#77736f',dark:'#403c38'};
      ctx.strokeStyle=strokeMap[strokeColor.value];ctx.lineWidth=strokeWidth.value==='fine'?0.92:1.35;ctx.lineJoin='round';ctx.lineCap='round';
      ctx.strokeRect(ox,oy,model.w*scale,model.h*scale);
      if(guide.value==='on'){ctx.save();ctx.strokeStyle='#e8e6e3';ctx.lineWidth=.55;for(let i=1;i<10;i++){const x=ox+i*model.w*scale/10;ctx.beginPath();ctx.moveTo(x,oy);ctx.lineTo(x,oy+model.h*scale);ctx.stroke();}for(let i=1;i<10;i++){const y=oy+i*model.h*scale/10;ctx.beginPath();ctx.moveTo(ox,y);ctx.lineTo(ox+model.w*scale,y);ctx.stroke();}ctx.restore();}
      for(const r of model.regions){if(r.size<5)continue;for(const rawLoop of loopsForRegion(r,model.w,model.h)){const s=simplify(rawLoop,model.q.step<=7?.45:.65),curve=chaikin(s,2);if(curve.length<4)continue;ctx.beginPath();ctx.moveTo(ox+curve[0][0]*scale,oy+curve[0][1]*scale);for(let i=1;i<curve.length;i++)ctx.lineTo(ox+curve[i][0]*scale,oy+curve[i][1]*scale);ctx.stroke();}}
      if(textMode.value==='on'&&model.structure.length){ctx.save();ctx.strokeStyle=strokeColor.value==='light'?'#bbb8b5':'#8a8682';ctx.lineWidth=.58;ctx.globalAlpha=.72;for(const line of model.structure){ctx.beginPath();ctx.moveTo(ox+line[0][0]*scale,oy+line[0][1]*scale);for(let i=1;i<line.length;i++)ctx.lineTo(ox+line[i][0]*scale,oy+line[i][1]*scale);ctx.stroke();}ctx.restore();}
      if(numbered){ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#77736f';for(const r of model.regions){if(r.size<Math.max(12,model.q.step*model.q.step*.20))continue;const [lx,ly,clear]=labelPoint(r,model.w);if(clear<1)continue;const fs=Math.max(5,Math.min(10,clear*scale*.60));ctx.font=`600 ${fs}px Arial`;ctx.fillText(codeLabel(r.code),ox+(lx+.5)*scale,oy+(ly+.5)*scale);}}
      const box=58,gap=12,total=model.palette.length*(box+gap)-gap,start=(W-total)/2,y0=H-155;ctx.textAlign='center';ctx.textBaseline='middle';for(let i=0;i<model.palette.length;i++){const x=start+i*(box+gap);ctx.fillStyle=hex(model.palette[i]);ctx.fillRect(x,y0,box,box);ctx.strokeStyle='#bbb';ctx.lineWidth=.7;ctx.strokeRect(x,y0,box,box);ctx.fillStyle='#555';ctx.font='600 13px Arial';ctx.fillText(codeLabel(i),x+box/2,y0+box+18);}
      legend.innerHTML=model.palette.map((c,i)=>`<div class="swatch"><div class="swatch-color" style="background:${hex(c)}"></div><small>${codeLabel(i)}<br>${hex(c)}</small></div>`).join('');
      info.textContent=`V5.4 • ${model.regions.length} super-zones • ${model.palette.length} couleurs • ${preset.selectedOptions[0].textContent}`;
    }

    function renderPreview() {
      if(!model)return;const scale=Math.min(3,1000/Math.max(model.w,model.h));canvas.width=Math.round(model.w*scale);canvas.height=Math.round(model.h*scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      for(const r of model.regions){ctx.fillStyle=hex(model.palette[r.code]);for(const i of r.cells){const x=i%model.w,y=(i/model.w)|0;ctx.fillRect(x*scale,y*scale,Math.ceil(scale),Math.ceil(scale));}}
      legend.innerHTML=model.palette.map((c,i)=>`<div class="swatch"><div class="swatch-color" style="background:${hex(c)}"></div><small>${codeLabel(i)}<br>${hex(c)}</small></div>`).join('');
      info.textContent=`Aperçu couleur • ${model.regions.length} super-zones • ${model.palette.length} couleurs`;
    }

    function render() {
      if(!model)return;
      if(mode.value==='preview')renderPreview();else renderEditorial(mode.value==='editorial-numbered');
    }

    function regenerate() {
      if(!image)return;const token=++buildToken;info.textContent='V5.4 : analyse des contours et création des super-zones…';
      setTimeout(()=>{try{const next=buildModel(image);if(token!==buildToken)return;model=next;render();}catch(err){console.error(err);info.textContent='Impossible de générer le coloriage.';}},20);
    }

    upload.addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{const im=new Image();im.onload=()=>{image=im;regenerate();};im.src=ev.target.result;};reader.readAsDataURL(file);});
    [grid,colors,preset,merge,textMode,subdivide].forEach(el=>el?.addEventListener('change',regenerate));
    [mode,strokeWidth,strokeColor,codeMode,guide].forEach(el=>el?.addEventListener('change',render));

    download?.addEventListener('click',()=>{if(!model)return;const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='lion-dynasty-editorial-v54.png';a.click();});
    printBtn?.addEventListener('click',()=>{if(!model)return;const data=canvas.toDataURL('image/png'),w=window.open('','_blank');w.document.write(`<title>Lion Dynasty V5.4</title><style>@page{size:A4 portrait;margin:7mm}body{margin:0;text-align:center}img{width:100%;height:auto;max-height:98vh;object-fit:contain}</style><img src="${data}"><script>onload=()=>setTimeout(()=>print(),180)<\/script>`);w.document.close();});

    window.__LION_EDITORIAL_REGENERATE__=regenerate;
  }

  setTimeout(()=>boot(),120);
})();

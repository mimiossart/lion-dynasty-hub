(() => {
  const wait=(n=0)=>{
    const upload=document.getElementById('pixelUpload');
    const mode=document.getElementById('pixelMode');
    if(!upload||!mode){ if(n<120) setTimeout(()=>wait(n+1),100); return; }
    if(window.__LION_EDITORIAL_V53__) return;
    init();
  };

  function init(){
    window.__LION_EDITORIAL_V53__=true;
    const clone=id=>{const old=document.getElementById(id);if(!old)return null;const el=old.cloneNode(true);old.replaceWith(el);return el;};
    const upload=clone('pixelUpload'), grid=clone('gridSize'), colors=clone('colorCount'), mode=clone('pixelMode');
    const download=clone('downloadPixel'), printBtn=clone('printPixel');
    const canvas=document.getElementById('pixelCanvas'), ctx=canvas?.getContext('2d');
    const legend=document.getElementById('pixelLegend'), info=document.getElementById('pixelInfo');
    const controls=document.getElementById('exampleControls');
    const complexity=document.getElementById('exampleComplexity'), merge=document.getElementById('exampleMerge');
    const strokeWidth=document.getElementById('exampleStrokeWidth'), strokeColor=document.getElementById('exampleStrokeColor');
    const card=upload?.closest('.card'), intro=card?.querySelector('p');
    if(!upload||!grid||!colors||!mode||!canvas||!ctx||!legend||!info)return;

    mode.innerHTML=`
      <option value="editorial-numbered" selected>Éditorial V5.3 — objet + contours + codes</option>
      <option value="editorial-line">Éditorial V5.3 — contour seul</option>
      <option value="mystery">Grille mystère numérotée</option>
      <option value="color">Aperçu couleur</option>`;
    colors.innerHTML=`<option value="8">8 couleurs</option><option value="10">10 couleurs</option><option value="12">12 couleurs</option><option value="14">14 couleurs</option><option value="16" selected>16 couleurs</option>`;
    colors.value='16';
    grid.innerHTML=`<option value="48">Standard</option><option value="64">Détaillé</option><option value="80" selected>Très détaillé</option>`;
    grid.value='80';
    if(complexity)complexity.value='high';
    if(merge)merge.value='medium';
    if(strokeWidth)strokeWidth.value='fine';
    if(strokeColor)strokeColor.value='light';
    if(intro)intro.textContent='V5.3 : segmentation guidée par les contours réels, adaptée aux véhicules, objets, portraits et paysages. Les grandes surfaces sont subdivisées sans perdre les arêtes importantes.';

    let extras=document.getElementById('editorialV53Extras');
    if(!extras&&controls){
      extras=document.createElement('div');extras.id='editorialV53Extras';extras.className='editorial-extras';
      extras.innerHTML=`
        <label>Type de photo<select class="field" id="editorialPreset"><option value="object" selected>Véhicule / objet détaillé</option><option value="portrait">Portrait</option><option value="landscape">Paysage</option><option value="illustration">Illustration / dessin</option></select></label>
        <label>Codes<select class="field" id="editorialCodes"><option value="hybrid" selected>1–9, 0, A…</option><option value="numbers">Chiffres uniquement</option></select></label>
        <label>Préserver texte / logo<select class="field" id="editorialText"><option value="on" selected>Oui — renforcer les détails</option><option value="off">Non</option></select></label>
        <label>Grandes surfaces<select class="field" id="editorialSubdivide"><option value="on" selected>Subdiviser</option><option value="off">Conserver grandes zones</option></select></label>
        <label>Repères de page<select class="field" id="editorialGrid"><option value="off" selected>Sans grille</option><option value="on">Grille très légère</option></select></label>`;
      controls.appendChild(extras);
    }
    const preset=document.getElementById('editorialPreset'), codeMode=document.getElementById('editorialCodes');
    const textMode=document.getElementById('editorialText'), subdivide=document.getElementById('editorialSubdivide'), guideGrid=document.getElementById('editorialGrid');

    let image=null, model=null, busyToken=0;
    const clamp=v=>Math.max(0,Math.min(255,v));
    const hex=c=>'#'+c.map(v=>Math.round(clamp(v)).toString(16).padStart(2,'0')).join('').toUpperCase();
    const lum=c=>.2126*c[0]+.7152*c[1]+.0722*c[2];
    const cdist=(a,b)=>.30*(a[0]-b[0])**2+.59*(a[1]-b[1])**2+.11*(a[2]-b[2])**2;
    const pxColor=(raw,i)=>{const o=i*4;return[raw[o],raw[o+1],raw[o+2]];};

    function avg(pts){let r=0,g=0,b=0;for(const p of pts){r+=p[0];g+=p[1];b+=p[2];}const n=Math.max(1,pts.length);return[r/n,g/n,b/n];}
    function medianCut(pixels,count){
      const range=(pts,k)=>{let lo=255,hi=0;for(const p of pts){lo=Math.min(lo,p[k]);hi=Math.max(hi,p[k]);}return hi-lo;};
      let boxes=[pixels.slice()];
      while(boxes.length<count){let bi=-1,score=-1,ch=0;boxes.forEach((box,i)=>{if(box.length<2)return;const rs=[0,1,2].map(k=>range(box,k)),c=rs.indexOf(Math.max(...rs)),s=rs[c]*Math.sqrt(box.length);if(s>score){score=s;bi=i;ch=c;}});if(bi<0)break;const box=boxes.splice(bi,1)[0].sort((a,b)=>a[ch]-b[ch]),m=Math.floor(box.length/2);boxes.push(box.slice(0,m),box.slice(m));}
      return boxes.map(avg);
    }
    function refine(pixels,palette,loops=6){let cs=palette.map(c=>c.slice());for(let p=0;p<loops;p++){const sums=cs.map(()=>[0,0,0,0]);for(const q of pixels){let bi=0,bd=Infinity;for(let i=0;i<cs.length;i++){const d=cdist(q,cs[i]);if(d<bd){bd=d;bi=i;}}const s=sums[bi];s[0]+=q[0];s[1]+=q[1];s[2]+=q[2];s[3]++;}cs=cs.map((c,i)=>sums[i][3]?[sums[i][0]/sums[i][3],sums[i][1]/sums[i][3],sums[i][2]/sums[i][3]]:c);}return cs;}
    function cropRect(img,w,h){const sa=img.width/img.height,da=w/h;let sw=img.width,sh=img.height,sx=0,sy=0;if(sa>da){sw=img.height*da;sx=(img.width-sw)/2;}else if(sa<da){sh=img.width/da;sy=(img.height-sh)/2;}return{sx,sy,sw,sh};}
    function blur(raw,w,h,passes=1){let cur=new Uint8ClampedArray(raw);for(let p=0;p<passes;p++){const out=new Uint8ClampedArray(cur.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let r=0,g=0,b=0,n=0;for(let dy=-1;dy<=1;dy++){const yy=y+dy;if(yy<0||yy>=h)continue;for(let dx=-1;dx<=1;dx++){const xx=x+dx;if(xx<0||xx>=w)continue;const o=(yy*w+xx)*4;r+=cur[o];g+=cur[o+1];b+=cur[o+2];n++;}}const o=(y*w+x)*4;out[o]=r/n;out[o+1]=g/n;out[o+2]=b/n;out[o+3]=255;}cur=out;}return cur;}
    function sobel(raw,w,h){const g=new Uint8ClampedArray(w*h);let max=1;const gray=new Float32Array(w*h);for(let i=0;i<w*h;i++){const o=i*4;gray[i]=.299*raw[o]+.587*raw[o+1]+.114*raw[o+2];}for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;const gx=-gray[i-w-1]-2*gray[i-1]-gray[i+w-1]+gray[i-w+1]+2*gray[i+1]+gray[i+w+1];const gy=-gray[i-w-1]-2*gray[i-w]-gray[i-w+1]+gray[i+w-1]+2*gray[i+w]+gray[i+w+1];const v=Math.hypot(gx,gy);g[i]=Math.min(255,v);if(v>max)max=v;}if(max>255)for(let i=0;i<g.length;i++)g[i]=Math.min(255,g[i]*255/max);return g;}
    function paletteFromRaw(raw,count){const pts=[],n=raw.length/4,step=Math.max(1,Math.floor(n/50000));for(let i=0;i<n;i+=step){const o=i*4;pts.push([raw[o],raw[o+1],raw[o+2]]);}return refine(pts,medianCut(pts,count),6).sort((a,b)=>lum(a)-lum(b));}

    class Heap{constructor(){this.a=[];}push(n){const a=this.a;a.push(n);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p][0]<=n[0])break;a[i]=a[p];i=p;}a[i]=n;}pop(){const a=this.a;if(!a.length)return null;const root=a[0],last=a.pop();if(a.length){let i=0;while(true){let l=i*2+1,r=l+1,b=i;if(l<a.length&&a[l][0]<(b===i?last[0]:a[b][0]))b=l;if(r<a.length&&a[r][0]<(b===i?last[0]:a[b][0]))b=r;if(b===i)break;a[i]=a[b];i=b;}a[i]=last;}return root;}get length(){return this.a.length;}}
    const hash=(x,y)=>{let n=(x*374761393+y*668265263)>>>0;n=(n^(n>>13))*1274126177>>>0;return((n^(n>>16))>>>0)/4294967295;};
    function params(){const p=preset?.value||'object',hi=complexity?.value==='high',lo=complexity?.value==='low';const table={
      object:{step:hi?11:lo?20:15,edge:8.5,color:1.8,local:2.4,jitter:.34,blur:1},
      portrait:{step:hi?10:lo?18:14,edge:6.2,color:2.1,local:1.8,jitter:.28,blur:1},
      landscape:{step:hi?15:lo?28:20,edge:4.8,color:1.5,local:1.4,jitter:.38,blur:2},
      illustration:{step:hi?9:lo?17:13,edge:9.5,color:1.4,local:2.8,jitter:.25,blur:0}
    };let q={...table[p]};if(subdivide?.value==='off')q.step=Math.round(q.step*1.6);if(merge?.value==='strong')q.step=Math.round(q.step*1.18);return q;}
    function seedsFor(raw,edge,w,h,q){const seeds=[];for(let gy=Math.floor(q.step/2),row=0;gy<h;gy+=q.step,row++)for(let gx=Math.floor(q.step/2),col=0;gx<w;gx+=q.step,col++){
      const jx=(hash(col,row)-.5)*q.step*q.jitter*2,jy=(hash(row,col+91)-.5)*q.step*q.jitter*2;let x=Math.max(2,Math.min(w-3,Math.round(gx+jx))),y=Math.max(2,Math.min(h-3,Math.round(gy+jy)));
      let bx=x,by=y,bv=edge[y*w+x];for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx<1||yy<1||xx>=w-1||yy>=h-1)continue;const v=edge[yy*w+xx];if(v<bv){bv=v;bx=xx;by=yy;}}const idx=by*w+bx;seeds.push({idx,x:bx,y:by,c:pxColor(raw,idx)});
    }return seeds;}
    function watershed(raw,edge,w,h,seeds,q){const n=w*h,labels=new Int32Array(n);labels.fill(-1);const costs=new Float32Array(n);costs.fill(Infinity);const heap=new Heap();for(let s=0;s<seeds.length;s++){const i=seeds[s].idx;if(costs[i]>0){costs[i]=0;labels[i]=s;heap.push([0,i,s]);}}
      const dirs=[1,-1,w,-w];while(heap.length){const node=heap.pop();if(!node)break;const [cost,i,lab]=node;if(cost!==costs[i]||labels[i]!==lab)continue;const x=i%w,y=(i/w)|0,seed=seeds[lab],pc=pxColor(raw,i);for(const d of dirs){const ni=i+d;if(ni<0||ni>=n)continue;const nx=ni%w,ny=(ni/w)|0;if(Math.abs(nx-x)+Math.abs(ny-y)!==1)continue;const nc=pxColor(raw,ni),e=edge[ni]/255,seedDiff=Math.sqrt(cdist(nc,seed.c))/255,localDiff=Math.sqrt(cdist(nc,pc))/255;const noise=(hash(nx,ny)-.5)*.12;const stepCost=1+q.edge*e+q.color*seedDiff+q.local*localDiff+noise;const ncst=cost+stepCost;if(ncst<costs[ni]){costs[ni]=ncst;labels[ni]=lab;heap.push([ncst,ni,lab]);}}}
      return labels;}
    function components(labels,w,h){const seen=new Uint8Array(w*h),out=[],dirs=[[1,0],[-1,0],[0,1],[0,-1]];for(let y=0;y<h;y++)for(let x=0;x<w;x++){const s=y*w+x;if(seen[s])continue;const lab=labels[s],q=[s];seen[s]=1;let k=0,sx=0,sy=0,minX=x,maxX=x,minY=y,maxY=y;const cells=[];while(k<q.length){const i=q[k++],cx=i%w,cy=(i/w)|0;cells.push(i);sx+=cx;sy+=cy;minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);minY=Math.min(minY,cy);maxY=Math.max(maxY,cy);for(const[dx,dy]of dirs){const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const ni=ny*w+nx;if(!seen[ni]&&labels[ni]===lab){seen[ni]=1;q.push(ni);}}}out.push({lab,cells,size:cells.length,cx:sx/cells.length,cy:sy/cells.length,minX,maxX,minY,maxY});}return out;}
    function segmentCodes(regs,raw,palette){for(const r of regs){let sr=0,sg=0,sb=0;for(const i of r.cells){const o=i*4;sr+=raw[o];sg+=raw[o+1];sb+=raw[o+2];}const c=[sr/r.size,sg/r.size,sb/r.size];let bi=0,bd=Infinity;for(let j=0;j<palette.length;j++){const d=cdist(c,palette[j]);if(d<bd){bd=d;bi=j;}}r.code=bi;}}
    function labelPoint(r,w){const set=new Set(r.cells);let bx=Math.round(r.cx),by=Math.round(r.cy),best=-1;const step=Math.max(1,Math.floor(Math.sqrt(r.size)/8));for(let y=r.minY;y<=r.maxY;y+=step)for(let x=r.minX;x<=r.maxX;x+=step){if(!set.has(y*w+x))continue;let d=0;for(let rr=1;rr<=10;rr++){let ok=true;for(let dx=-rr;dx<=rr;dx++){if(!set.has((y-rr)*w+x+dx)||!set.has((y+rr)*w+x+dx)){ok=false;break;}}if(ok)for(let dy=-rr;dy<=rr;dy++){if(!set.has((y+dy)*w+x-rr)||!set.has((y+dy)*w+x+rr)){ok=false;break;}}if(!ok)break;d=rr;}if(d>best){best=d;bx=x;by=y;}}return[bx,by];}
    const key=(x,y)=>`${x},${y}`;
    function loopsFor(r,w,h){const set=new Set(r.cells),map=new Map(),has=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&set.has(y*w+x),add=(a,b,c,d)=>{const k=key(a,b);if(!map.has(k))map.set(k,[]);map.get(k).push([c,d]);};for(const i of r.cells){const x=i%w,y=(i/w)|0;if(!has(x,y-1))add(x,y,x+1,y);if(!has(x+1,y))add(x+1,y,x+1,y+1);if(!has(x,y+1))add(x+1,y+1,x,y+1);if(!has(x-1,y))add(x,y+1,x,y);}const loops=[];while(map.size){const start=map.keys().next().value,[sx,sy]=start.split(',').map(Number),loop=[[sx,sy]];let cur=start,guard=0;while(guard++<1000000){const list=map.get(cur);if(!list?.length)break;const next=list.shift();if(!list.length)map.delete(cur);loop.push(next);cur=key(next[0],next[1]);if(cur===start)break;}if(loop.length>4)loops.push(loop);}return loops;}
    const pd=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1];if(!dx&&!dy)return Math.hypot(p[0]-a[0],p[1]-a[1]);const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));};
    function simplify(points,t=.45){let a=points.slice();if(a.length>1&&key(...a[0])===key(...a[a.length-1]))a.pop();const rdp=x=>{if(x.length<3)return x;let m=0,mi=0;for(let i=1;i<x.length-1;i++){const d=pd(x[i],x[0],x[x.length-1]);if(d>m){m=d;mi=i;}}if(m>t){const l=rdp(x.slice(0,mi+1)),r=rdp(x.slice(mi));return l.slice(0,-1).concat(r);}return[x[0],x[x.length-1]];};const o=rdp(a);if(o.length>2)o.push(o[0]);return o;}
    function chaikin(points,passes=2){let a=points.slice();if(a.length>1&&key(...a[0])===key(...a[a.length-1]))a.pop();for(let p=0;p<passes;p++){const n=[];for(let i=0;i<a.length;i++){const x=a[i],y=a[(i+1)%a.length];n.push([.75*x[0]+.25*y[0],.75*x[1]+.25*y[1]],[.25*x[0]+.75*y[0],.25*x[1]+.75*y[1]]);}a=n;}if(a.length)a.push(a[0]);return a;}
    function codeFor(i){if(codeMode?.value==='numbers')return String(i+1);if(i<9)return String(i+1);if(i===9)return'0';return String.fromCharCode(65+(i-10)%26);}

    function makeModel(img){const q=params(),longSide=complexity?.value==='high'?680:complexity?.value==='low'?430:550,aspect=img.width/img.height;let w,h;if(aspect>=1){w=longSide;h=Math.max(220,Math.round(longSide/aspect));}else{h=longSide;w=Math.max(220,Math.round(longSide*aspect));}const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';const cr=cropRect(img,w,h);x.drawImage(img,cr.sx,cr.sy,cr.sw,cr.sh,0,0,w,h);let raw=x.getImageData(0,0,w,h).data;if(q.blur)raw=blur(raw,w,h,q.blur);const edge=sobel(raw,w,h),palette=paletteFromRaw(raw,+colors.value),seeds=seedsFor(raw,edge,w,h,q),labels=watershed(raw,edge,w,h,seeds,q),regs=components(labels,w,h);segmentCodes(regs,raw,palette);for(const r of regs)r.label=labelPoint(r,w);return{w,h,raw,edge,palette,regs,step:q.step,preset:preset?.value||'object'};}
    function edgeLayer(edge,w,h,ox,oy,scale){const e=document.createElement('canvas');e.width=w;e.height=h;const ec=e.getContext('2d'),im=ec.createImageData(w,h),boost=textMode?.value==='on'?1.35:1;for(let i=0;i<edge.length;i++){let a=edge[i];if(a<26)continue;a=Math.min(210,(a-20)*1.35*boost);const o=i*4;im.data[o]=145;im.data[o+1]=145;im.data[o+2]=145;im.data[o+3]=a;}ec.putImageData(im,0,0);ctx.save();ctx.globalAlpha=.56;ctx.imageSmoothingEnabled=true;ctx.drawImage(e,ox,oy,w*scale,h*scale);ctx.restore();}
    function drawEditorial(numbered){if(!model)return;const{w,h,palette,regs,edge,step}=model,pageW=1240,pageH=1754;canvas.width=pageW;canvas.height=pageH;ctx.fillStyle='#fff';ctx.fillRect(0,0,pageW,pageH);const margin=52,legendH=145,top=34,bottom=pageH-legendH-20,availW=pageW-margin*2,availH=bottom-top,scale=Math.min(availW/w,availH/h),ox=(pageW-w*scale)/2,oy=top+(availH-h*scale)/2;ctx.strokeStyle='#cacaca';ctx.lineWidth=.8;ctx.strokeRect(ox,oy,w*scale,h*scale);if(guideGrid?.value==='on'){ctx.save();ctx.strokeStyle='rgba(160,160,160,.12)';ctx.lineWidth=.45;for(let gx=ox+100;gx<ox+w*scale;gx+=100){ctx.beginPath();ctx.moveTo(gx,oy);ctx.lineTo(gx,oy+h*scale);ctx.stroke();}for(let gy=oy+100;gy<oy+h*scale;gy+=100){ctx.beginPath();ctx.moveTo(ox,gy);ctx.lineTo(ox+w*scale,gy);ctx.stroke();}ctx.restore();}
      edgeLayer(edge,w,h,ox,oy,scale);const sm={light:'#aaa8a5',medium:'#85827e',dark:'#5b5854'};ctx.strokeStyle=sm[strokeColor?.value||'light'];ctx.lineWidth=(strokeWidth?.value||'fine')==='fine'?.62:1.0;ctx.lineCap='round';ctx.lineJoin='round';let contours=0;for(const r of regs){if(r.size<5)continue;for(const lp of loopsFor(r,w,h)){const curve=chaikin(simplify(lp,complexity?.value==='high'?.30:.5),2);if(curve.length<6)continue;ctx.beginPath();ctx.moveTo(ox+curve[0][0]*scale,oy+curve[0][1]*scale);for(let i=1;i<curve.length;i++)ctx.lineTo(ox+curve[i][0]*scale,oy+curve[i][1]*scale);ctx.closePath();ctx.stroke();contours++;}}
      let labels=0;if(numbered){ctx.textAlign='center';ctx.textBaseline='middle';const minLabel=Math.max(18,Math.round(step*step*.28));for(const r of regs){if(r.size<minLabel)continue;const text=codeFor(r.code),[lx,ly]=r.label,fs=Math.max(4.8,Math.min(7.2,Math.sqrt(r.size)*.14));ctx.font=`500 ${fs}px Arial`;ctx.fillStyle=sm[strokeColor?.value||'light'];ctx.fillText(text,ox+(lx+.5)*scale,oy+(ly+.5)*scale);labels++;}}
      const gap=7,itemW=Math.floor((pageW-margin*2-(palette.length-1)*gap)/palette.length),y0=pageH-105;ctx.textAlign='center';ctx.textBaseline='middle';for(let i=0;i<palette.length;i++){const x0=margin+i*(itemW+gap);ctx.fillStyle=hex(palette[i]);ctx.fillRect(x0,y0,itemW,42);ctx.strokeStyle='#c7c7c7';ctx.lineWidth=.7;ctx.strokeRect(x0,y0,itemW,42);ctx.fillStyle=lum(palette[i])<120?'#fff':'#333';ctx.font='700 16px Arial';ctx.fillText(codeFor(i),x0+itemW/2,y0+21);}info.textContent=`Éditorial V5.3 • ${model.preset} • ${palette.length} couleurs • ${regs.length} zones • ${contours} contours${numbered?` • ${labels} codes`:''}`;legend.innerHTML=palette.map((c,i)=>`<div class="swatch"><div class="swatch-color" style="background:${hex(c)}"></div><small>${codeFor(i)}<br>${hex(c)}</small></div>`).join('');}
    function drawLegacy(){if(!image)return;const target=+grid.value||80,count=+colors.value,aspect=image.width/image.height;let w,h;if(aspect>=1){w=target;h=Math.max(1,Math.round(target/aspect));}else{h=target;w=Math.max(1,Math.round(target*aspect));}const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});const cr=cropRect(image,w,h);x.drawImage(image,cr.sx,cr.sy,cr.sw,cr.sh,0,0,w,h);const raw=x.getImageData(0,0,w,h).data,px=[];for(let i=0;i<raw.length;i+=4)px.push([raw[i],raw[i+1],raw[i+2]]);const palette=refine(px,medianCut(px,count),5).sort((a,b)=>lum(a)-lum(b)),a=px.map(p=>{let bi=0,bd=Infinity;for(let i=0;i<palette.length;i++){const d=cdist(p,palette[i]);if(d<bd){bd=d;bi=i;}}return bi;}),cell=Math.max(9,Math.floor(950/Math.max(w,h)));canvas.width=w*cell;canvas.height=h*cell;const mystery=mode.value==='mystery';ctx.textAlign='center';ctx.textBaseline='middle';for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const p=a[yy*w+xx];ctx.fillStyle=mystery?'#fff':hex(palette[p]);ctx.fillRect(xx*cell,yy*cell,cell,cell);ctx.strokeStyle='rgba(40,30,20,.18)';ctx.strokeRect(xx*cell+.5,yy*cell+.5,cell,cell);if(mystery){ctx.fillStyle='#24170e';ctx.font=`600 ${Math.max(7,cell*.42)}px Arial`;ctx.fillText(String(p+1),xx*cell+cell/2,yy*cell+cell/2);}}legend.innerHTML=palette.map((c,i)=>`<div class="swatch"><div class="swatch-color" style="background:${hex(c)}"></div><small>${i+1}<br>${hex(c)}</small></div>`).join('');info.textContent=`${w} × ${h} • ${palette.length} couleurs`;}
    function toggle(){const ed=mode.value.startsWith('editorial');if(controls)controls.hidden=!ed;const gl=grid.closest('label');if(gl)gl.style.display=ed?'none':'';}
    function regenerate(){if(!image)return;const t=++busyToken,ed=mode.value.startsWith('editorial');info.textContent=ed?'Segmentation guidée par les contours…':'Analyse…';setTimeout(()=>{if(t!==busyToken)return;try{if(ed){model=makeModel(image);drawEditorial(mode.value==='editorial-numbered');}else drawLegacy();}catch(e){console.error(e);info.textContent='Génération impossible. Essaie Complexité moyenne.';}},35);}
    upload.addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{const im=new Image();im.onload=()=>{image=im;regenerate();};im.src=ev.target.result;};r.readAsDataURL(f);});
    mode.addEventListener('change',()=>{toggle();regenerate();});colors.addEventListener('change',regenerate);grid.addEventListener('change',regenerate);[complexity,merge,strokeWidth,strokeColor,preset,codeMode,textMode,subdivide,guideGrid].forEach(el=>el?.addEventListener('change',regenerate));
    download?.addEventListener('click',()=>{if(!image)return;const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=mode.value.startsWith('editorial')?'lion-dynasty-editorial-v53.png':'lion-dynasty-coloriage.png';a.click();});
    printBtn?.addEventListener('click',()=>{if(!image)return;const data=canvas.toDataURL('image/png'),w=window.open('','_blank');w.document.write(`<title>Lion Dynasty — V5.3</title><style>@page{size:A4 portrait;margin:5mm}body{margin:0;text-align:center}img{width:100%;max-height:99vh;object-fit:contain}</style><img src="${data}"><script>onload=()=>setTimeout(()=>print(),180)<\/script>`);w.document.close();});
    toggle();info.textContent='Importe une photo. Pour le camion : preset Véhicule / objet détaillé, 16 couleurs, Complexité élevée.';
  }
  wait();
})();

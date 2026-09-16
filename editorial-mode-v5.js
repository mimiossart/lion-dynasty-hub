(() => {
  const wait=(n=0)=>{
    const upload=document.getElementById('pixelUpload');
    const mode=document.getElementById('pixelMode');
    if(!upload||!mode){ if(n<100) setTimeout(()=>wait(n+1),100); return; }
    if(window.__LION_EDITORIAL_V51__) return;
    init();
  };

  function init(){
    window.__LION_EDITORIAL_V51__=true;
    const clone=id=>{const old=document.getElementById(id);if(!old)return null;const el=old.cloneNode(true);old.replaceWith(el);return el;};
    const upload=clone('pixelUpload');
    const grid=clone('gridSize');
    const colors=clone('colorCount');
    const mode=clone('pixelMode');
    const download=clone('downloadPixel');
    const printBtn=clone('printPixel');
    const canvas=document.getElementById('pixelCanvas');
    const ctx=canvas?.getContext('2d');
    const legend=document.getElementById('pixelLegend');
    const info=document.getElementById('pixelInfo');
    const controls=document.getElementById('exampleControls');
    const complexity=document.getElementById('exampleComplexity');
    const merge=document.getElementById('exampleMerge');
    const strokeWidth=document.getElementById('exampleStrokeWidth');
    const strokeColor=document.getElementById('exampleStrokeColor');
    const card=upload?.closest('.card');
    const intro=card?.querySelector('p');
    if(!upload||!grid||!colors||!mode||!canvas||!ctx||!legend||!info)return;

    mode.innerHTML=`
      <option value="editorial-numbered" selected>Mode Éditorial V5.1 — contour + codes</option>
      <option value="editorial-line">Mode Éditorial V5.1 — contour seul</option>
      <option value="mystery">Grille mystère numérotée</option>
      <option value="color">Aperçu couleur</option>`;
    colors.innerHTML=`
      <option value="8">8 couleurs</option><option value="10">10 couleurs</option>
      <option value="12">12 couleurs</option><option value="14">14 couleurs</option>
      <option value="16" selected>16 couleurs</option>`;
    colors.value='16';
    grid.innerHTML=`<option value="48">Standard</option><option value="64">Détaillé</option><option value="80" selected>Très détaillé</option>`;
    grid.value='80';
    if(complexity)complexity.value='high';
    if(merge)merge.value='medium';
    if(strokeWidth)strokeWidth.value='fine';
    if(strokeColor)strokeColor.value='light';
    if(intro)intro.textContent='V5.1 Éditorial : zones organiques détaillées, contours très fins, petits codes et palette imprimable — sans découpage en gros blocs.';

    let extras=document.getElementById('editorialExtras');
    if(!extras&&controls){
      extras=document.createElement('div');extras.id='editorialExtras';extras.className='editorial-extras';
      extras.innerHTML=`
        <label>Codes<select class="field" id="editorialCodes"><option value="hybrid" selected>1–9, 0, A…</option><option value="numbers">Chiffres uniquement</option></select></label>
        <label>Repères de page<select class="field" id="editorialGrid"><option value="off" selected>Sans grille</option><option value="on">Grille très légère</option></select></label>`;
      controls.appendChild(extras);
    }
    const codeMode=document.getElementById('editorialCodes');
    const guideGrid=document.getElementById('editorialGrid');
    if(codeMode)codeMode.value='hybrid';

    let image=null,model=null,busyToken=0;
    const clamp=v=>Math.max(0,Math.min(255,v));
    const hex=c=>'#'+c.map(v=>Math.round(clamp(v)).toString(16).padStart(2,'0')).join('').toUpperCase();
    const lum=c=>.2126*c[0]+.7152*c[1]+.0722*c[2];
    const dist=(a,b)=>.30*(a[0]-b[0])**2+.59*(a[1]-b[1])**2+.11*(a[2]-b[2])**2;
    function avg(pts){let r=0,g=0,b=0;for(const p of pts){r+=p[0];g+=p[1];b+=p[2];}const n=Math.max(1,pts.length);return[r/n,g/n,b/n];}
    function medianCut(pixels,count){
      const range=(pts,k)=>{let lo=255,hi=0;for(const p of pts){lo=Math.min(lo,p[k]);hi=Math.max(hi,p[k]);}return hi-lo;};
      let boxes=[pixels.slice()];
      while(boxes.length<count){let bi=-1,score=-1,ch=0;boxes.forEach((box,i)=>{if(box.length<2)return;const rs=[0,1,2].map(k=>range(box,k));const c=rs.indexOf(Math.max(...rs));const s=rs[c]*Math.sqrt(box.length);if(s>score){score=s;bi=i;ch=c;}});if(bi<0)break;const box=boxes.splice(bi,1)[0].sort((a,b)=>a[ch]-b[ch]);const mid=Math.floor(box.length/2);boxes.push(box.slice(0,mid),box.slice(mid));}
      return boxes.map(avg);
    }
    function refine(pixels,palette,loops=6){let cs=palette.map(c=>c.slice());for(let pass=0;pass<loops;pass++){const sums=cs.map(()=>[0,0,0,0]);for(const p of pixels){let bi=0,bd=Infinity;for(let i=0;i<cs.length;i++){const d=dist(p,cs[i]);if(d<bd){bd=d;bi=i;}}const s=sums[bi];s[0]+=p[0];s[1]+=p[1];s[2]+=p[2];s[3]++;}cs=cs.map((c,i)=>sums[i][3]?[sums[i][0]/sums[i][3],sums[i][1]/sums[i][3],sums[i][2]/sums[i][3]]:c);}return cs;}
    function cropRect(img,w,h){const sa=img.width/img.height,da=w/h;let sw=img.width,sh=img.height,sx=0,sy=0;if(sa>da){sw=img.height*da;sx=(img.width-sw)/2;}else if(sa<da){sh=img.width/da;sy=(img.height-sh)/2;}return{sx,sy,sw,sh};}

    function blurRGB(src,w,h,passes=1){
      let cur=new Uint8ClampedArray(src);
      for(let pass=0;pass<passes;pass++){
        const tmp=new Uint8ClampedArray(cur.length);
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          let r=0,g=0,b=0,n=0;
          for(let dy=-1;dy<=1;dy++){const yy=y+dy;if(yy<0||yy>=h)continue;for(let dx=-1;dx<=1;dx++){const xx=x+dx;if(xx<0||xx>=w)continue;const i=(yy*w+xx)*4;r+=cur[i];g+=cur[i+1];b+=cur[i+2];n++;}}
          const o=(y*w+x)*4;tmp[o]=r/n;tmp[o+1]=g/n;tmp[o+2]=b/n;tmp[o+3]=255;
        }
        cur=tmp;
      }
      return cur;
    }

    function modeSmooth(values,w,h,passes=1){let cur=new Uint16Array(values);for(let p=0;p<passes;p++){const next=new Uint16Array(cur);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const counts=new Map();for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const v=cur[(y+dy)*w+x+dx];counts.set(v,(counts.get(v)||0)+1);}let best=cur[y*w+x],score=0;for(const[v,n]of counts){if(n>score){score=n;best=v;}}if(score>=5)next[y*w+x]=best;}cur=next;}return cur;}

    function regions(values,w,h){
      const seen=new Uint8Array(w*h),out=[],dirs=[[1,0],[-1,0],[0,1],[0,-1]];
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const s=y*w+x;if(seen[s])continue;const color=values[s],q=[s];seen[s]=1;let qp=0;const cells=[];let sx=0,sy=0,minX=x,maxX=x,minY=y,maxY=y;
        while(qp<q.length){const idx=q[qp++],cx=idx%w,cy=(idx/w)|0;cells.push(idx);sx+=cx;sy+=cy;minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);minY=Math.min(minY,cy);maxY=Math.max(maxY,cy);for(const[dx,dy]of dirs){const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const ni=ny*w+nx;if(!seen[ni]&&values[ni]===color){seen[ni]=1;q.push(ni);}}}
        out.push({color,cells,size:cells.length,cx:sx/cells.length,cy:sy/cells.length,minX,maxX,minY,maxY});
      }
      return out;
    }

    function mergeSmall(values,w,h,minSize,passes=2){let cur=new Uint16Array(values),dirs=[[1,0],[-1,0],[0,1],[0,-1]];for(let pass=0;pass<passes;pass++){let changed=false;const rs=regions(cur,w,h).sort((a,b)=>a.size-b.size);for(const reg of rs){if(reg.size>=minSize)continue;const neighbors=new Map();for(const idx of reg.cells){const x=idx%w,y=(idx/w)|0;for(const[dx,dy]of dirs){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const c=cur[ny*w+nx];if(c!==reg.color)neighbors.set(c,(neighbors.get(c)||0)+1);}}let best=reg.color,score=0;for(const[c,n]of neighbors){if(n>score){score=n;best=c;}}if(best!==reg.color){for(const idx of reg.cells)cur[idx]=best;changed=true;}}if(!changed)break;}return cur;}

    function labelPoint(reg,w){
      const set=new Set(reg.cells),step=Math.max(1,Math.floor(Math.sqrt(reg.size)/10));let bx=Math.round(reg.cx),by=Math.round(reg.cy),best=-1;
      for(let y=reg.minY;y<=reg.maxY;y+=step)for(let x=reg.minX;x<=reg.maxX;x+=step){if(!set.has(y*w+x))continue;let d=0;outer:for(let r=1;r<18;r++){for(let dx=-r;dx<=r;dx++){if(!set.has((y-r)*w+x+dx)||!set.has((y+r)*w+x+dx)){d=r;break outer;}}for(let dy=-r+1;dy<=r-1;dy++){if(!set.has((y+dy)*w+x-r)||!set.has((y+dy)*w+x+r)){d=r;break outer;}}d=r;}if(d>best){best=d;bx=x;by=y;}}
      return[bx,by];
    }

    const key=(x,y)=>`${x},${y}`;
    function loopsFor(reg,w,h){const cells=new Set(reg.cells),map=new Map();const has=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&cells.has(y*w+x);const add=(x1,y1,x2,y2)=>{const k=key(x1,y1);if(!map.has(k))map.set(k,[]);map.get(k).push([x2,y2]);};for(const idx of reg.cells){const x=idx%w,y=(idx/w)|0;if(!has(x,y-1))add(x,y,x+1,y);if(!has(x+1,y))add(x+1,y,x+1,y+1);if(!has(x,y+1))add(x+1,y+1,x,y+1);if(!has(x-1,y))add(x,y+1,x,y);}const loops=[];while(map.size){const start=map.keys().next().value,[sx,sy]=start.split(',').map(Number),loop=[[sx,sy]];let cur=start,guard=0;while(guard++<1000000){const list=map.get(cur);if(!list?.length)break;const next=list.shift();if(!list.length)map.delete(cur);loop.push(next);cur=key(next[0],next[1]);if(cur===start)break;}if(loop.length>5)loops.push(loop);}return loops;}
    function pld(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1];if(!dx&&!dy)return Math.hypot(p[0]-a[0],p[1]-a[1]);const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));}
    function simplify(points,tol){let pts=points.slice();if(pts.length>1&&key(...pts[0])===key(...pts[pts.length-1]))pts.pop();function rdp(a){if(a.length<=2)return a;let max=0,idx=0;for(let i=1;i<a.length-1;i++){const d=pld(a[i],a[0],a[a.length-1]);if(d>max){max=d;idx=i;}}if(max>tol){const l=rdp(a.slice(0,idx+1)),r=rdp(a.slice(idx));return l.slice(0,-1).concat(r);}return[a[0],a[a.length-1]];}const out=rdp(pts);if(out.length>2)out.push(out[0]);return out;}
    function chaikin(points,passes=3){let pts=points.slice();if(pts.length>1&&key(...pts[0])===key(...pts[pts.length-1]))pts.pop();for(let p=0;p<passes;p++){const next=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];next.push([.75*a[0]+.25*b[0],.75*a[1]+.25*b[1]],[.25*a[0]+.75*b[0],.25*a[1]+.75*b[1]]);}pts=next;}if(pts.length)pts.push(pts[0]);return pts;}

    function sobelEdges(raw,w,h){
      const gray=new Float32Array(w*h),mag=new Float32Array(w*h),gxA=new Float32Array(w*h),gyA=new Float32Array(w*h);
      for(let i=0;i<w*h;i++){const o=i*4;gray[i]=.299*raw[o]+.587*raw[o+1]+.114*raw[o+2];}
      let max=1;
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
        const i=y*w+x;
        const gx=-gray[(y-1)*w+x-1]+gray[(y-1)*w+x+1]-2*gray[y*w+x-1]+2*gray[y*w+x+1]-gray[(y+1)*w+x-1]+gray[(y+1)*w+x+1];
        const gy=-gray[(y-1)*w+x-1]-2*gray[(y-1)*w+x]-gray[(y-1)*w+x+1]+gray[(y+1)*w+x-1]+2*gray[(y+1)*w+x]+gray[(y+1)*w+x+1];
        const m=Math.hypot(gx,gy);mag[i]=m;gxA[i]=gx;gyA[i]=gy;if(m>max)max=m;
      }
      const threshold=(complexity?.value==='high'?.16:complexity?.value==='low'?.28:.22)*max;
      const alpha=new Uint8ClampedArray(w*h);
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
        const i=y*w+x,m=mag[i];if(m<threshold)continue;
        const ax=Math.abs(gxA[i]),ay=Math.abs(gyA[i]);let a,b;
        if(ax>ay*2){a=mag[i-1];b=mag[i+1];}
        else if(ay>ax*2){a=mag[i-w];b=mag[i+w];}
        else if(gxA[i]*gyA[i]>0){a=mag[i-w-1];b=mag[i+w+1];}
        else{a=mag[i-w+1];b=mag[i+w-1];}
        if(m>=a&&m>=b)alpha[i]=Math.min(150,55+Math.round((m-threshold)/(max-threshold)*95));
      }
      return alpha;
    }

    function makeEditorialModel(img){
      const longSide=complexity?.value==='high'?700:complexity?.value==='low'?420:560;
      const aspect=img.width/img.height;let w,h;if(aspect>=1){w=longSide;h=Math.max(180,Math.round(longSide/aspect));}else{h=longSide;w=Math.max(180,Math.round(longSide*aspect));}
      const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';const cr=cropRect(img,w,h);x.drawImage(img,cr.sx,cr.sy,cr.sw,cr.sh,0,0,w,h);
      let raw=x.getImageData(0,0,w,h).data;raw=blurRGB(raw,w,h,complexity?.value==='low'?2:1);
      const edges=sobelEdges(raw,w,h);
      const px=[],sample=[],sampleStep=complexity?.value==='high'?7:complexity?.value==='low'?4:5;
      for(let i=0;i<raw.length;i+=4){const r=raw[i],g=raw[i+1],b=raw[i+2],gray=(r+g+b)/3;const p=[clamp(gray+(r-gray)*1.10),clamp(gray+(g-gray)*1.10),clamp(gray+(b-gray)*1.10)];px.push(p);if((i/4)%sampleStep===0)sample.push(p);}
      const count=+colors.value;const palette=refine(sample,medianCut(sample,count),6).sort((a,b)=>lum(a)-lum(b));
      let assignments=new Uint16Array(px.length);for(let n=0;n<px.length;n++){let bi=0,bd=Infinity;for(let i=0;i<palette.length;i++){const d=dist(px[n],palette[i]);if(d<bd){bd=d;bi=i;}}assignments[n]=bi;}
      assignments=modeSmooth(assignments,w,h,complexity?.value==='low'?2:1);
      const area=w*h;let factor=complexity?.value==='high'?.000035:complexity?.value==='low'?.00012:.000065;if(merge?.value==='strong')factor*=1.7;
      assignments=mergeSmall(assignments,w,h,Math.max(8,Math.round(area*factor)),2);
      const rs=regions(assignments,w,h);for(const r of rs)r.label=labelPoint(r,w);
      return{w,h,palette,assignments,regions:rs,edges};
    }

    function codeFor(i){if(codeMode?.value==='numbers')return String(i+1);if(i<9)return String(i+1);if(i===9)return'0';return String.fromCharCode(65+((i-10)%26));}

    function drawEdgeLayer(edges,w,h,ox,oy,scale){
      const e=document.createElement('canvas');e.width=w;e.height=h;const ex=e.getContext('2d');const im=ex.createImageData(w,h);for(let i=0;i<w*h;i++){const a=edges[i];if(!a)continue;const o=i*4;im.data[o]=150;im.data[o+1]=147;im.data[o+2]=143;im.data[o+3]=a;}ex.putImageData(im,0,0);ctx.save();ctx.globalAlpha=.58;ctx.imageSmoothingEnabled=true;ctx.drawImage(e,ox,oy,w*scale,h*scale);ctx.restore();
    }

    function drawEditorial(numbered){
      if(!model)return;const{w,h,palette,regions:rs,edges}=model;const pageW=1240,pageH=1754;canvas.width=pageW;canvas.height=pageH;ctx.fillStyle='#fff';ctx.fillRect(0,0,pageW,pageH);
      const margin=54,legendH=150,artTop=40,artBottom=pageH-legendH-26,availW=pageW-margin*2,availH=artBottom-artTop,scale=Math.min(availW/w,availH/h),ox=(pageW-w*scale)/2,oy=artTop+(availH-h*scale)/2;
      ctx.strokeStyle='#d0cdc9';ctx.lineWidth=1;ctx.strokeRect(ox-1,oy-1,w*scale+2,h*scale+2);
      if(guideGrid?.value==='on'){ctx.save();ctx.strokeStyle='rgba(180,178,175,.16)';ctx.lineWidth=.55;const step=Math.max(70,Math.round(scale*40));for(let x=ox+step;x<ox+w*scale;x+=step){ctx.beginPath();ctx.moveTo(x,oy);ctx.lineTo(x,oy+h*scale);ctx.stroke();}for(let y=oy+step;y<oy+h*scale;y+=step){ctx.beginPath();ctx.moveTo(ox,y);ctx.lineTo(ox+w*scale,y);ctx.stroke();}ctx.restore();}
      drawEdgeLayer(edges,w,h,ox,oy,scale);
      const strokeMap={light:'#aaa7a3',medium:'#898681',dark:'#5c5955'};ctx.strokeStyle=strokeMap[strokeColor?.value||'light'];ctx.lineWidth=(strokeWidth?.value||'fine')==='fine'?.72:1.15;ctx.lineCap='round';ctx.lineJoin='round';
      const sorted=rs.slice().sort((a,b)=>b.size-a.size);let contourCount=0;
      for(const reg of sorted){if(reg.size<6)continue;for(const rawLoop of loopsFor(reg,w,h)){const tol=complexity?.value==='high'?.32:complexity?.value==='low'?.85:.48;const curve=chaikin(simplify(rawLoop,tol),complexity?.value==='high'?3:2);if(curve.length<6)continue;ctx.beginPath();ctx.moveTo(ox+curve[0][0]*scale,oy+curve[0][1]*scale);for(let i=1;i<curve.length;i++)ctx.lineTo(ox+curve[i][0]*scale,oy+curve[i][1]*scale);ctx.closePath();ctx.stroke();contourCount++;}}
      let labelCount=0;if(numbered){ctx.textAlign='center';ctx.textBaseline='middle';let minLabel=Math.max(10,Math.round(w*h*(complexity?.value==='high'?.000035:.000055)));if(merge?.value==='strong')minLabel*=1.25;for(const reg of sorted){if(reg.size<minLabel)continue;const[lx,ly]=reg.label,text=codeFor(reg.color),fs=Math.max(6,Math.min(10.5,Math.sqrt(reg.size)*.20));ctx.font=`500 ${fs}px Arial`;ctx.fillStyle=strokeMap[strokeColor?.value||'light'];ctx.fillText(text,ox+(lx+.5)*scale,oy+(ly+.5)*scale);labelCount++;}}
      const gap=8,itemW=Math.floor((pageW-margin*2-(palette.length-1)*gap)/palette.length),y0=pageH-112;ctx.textAlign='center';ctx.textBaseline='middle';for(let i=0;i<palette.length;i++){const x0=margin+i*(itemW+gap);ctx.fillStyle=hex(palette[i]);ctx.fillRect(x0,y0,itemW,48);ctx.strokeStyle='#c7c3be';ctx.lineWidth=.8;ctx.strokeRect(x0,y0,itemW,48);ctx.fillStyle=lum(palette[i])<120?'#fff':'#2f2b27';ctx.font='700 17px Arial';ctx.fillText(codeFor(i),x0+itemW/2,y0+24);}
      ctx.fillStyle='#8b8782';ctx.font='12px Arial';ctx.textAlign='left';ctx.fillText('Lion Dynasty — Mode Éditorial V5.1',margin,pageH-30);info.textContent=`Mode Éditorial V5.1 • ${palette.length} couleurs • ${rs.length} zones • ${contourCount} contours${numbered?` • ${labelCount} codes`:''} • ${w}×${h}`;legend.innerHTML=palette.map((c,i)=>`<div class="swatch"><div class="swatch-color" style="background:${hex(c)}"></div><small>${codeFor(i)}<br>${hex(c)}</small></div>`).join('');
    }

    function drawLegacy(){
      if(!image)return;const target=+grid.value||80,count=+colors.value,aspect=image.width/image.height;let w,h;if(aspect>=1){w=target;h=Math.max(1,Math.round(target/aspect));}else{h=target;w=Math.max(1,Math.round(target*aspect));}const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});const cr=cropRect(image,w,h);x.drawImage(image,cr.sx,cr.sy,cr.sw,cr.sh,0,0,w,h);const raw=x.getImageData(0,0,w,h).data,px=[];for(let i=0;i<raw.length;i+=4)px.push([raw[i],raw[i+1],raw[i+2]]);const palette=refine(px,medianCut(px,count),6).sort((a,b)=>lum(a)-lum(b));const a=px.map(p=>{let bi=0,bd=Infinity;for(let i=0;i<palette.length;i++){const d=dist(p,palette[i]);if(d<bd){bd=d;bi=i;}}return bi;});const cell=Math.max(9,Math.floor(950/Math.max(w,h)));canvas.width=w*cell;canvas.height=h*cell;const mystery=mode.value==='mystery';ctx.textAlign='center';ctx.textBaseline='middle';for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const p=a[yy*w+xx];ctx.fillStyle=mystery?'#fff':hex(palette[p]);ctx.fillRect(xx*cell,yy*cell,cell,cell);ctx.strokeStyle='rgba(40,30,20,.18)';ctx.strokeRect(xx*cell+.5,yy*cell+.5,cell,cell);if(mystery){ctx.fillStyle='#24170e';ctx.font=`600 ${Math.max(7,cell*.42)}px Arial`;ctx.fillText(String(p+1),xx*cell+cell/2,yy*cell+cell/2);}}legend.innerHTML=palette.map((c,i)=>`<div class="swatch"><div class="swatch-color" style="background:${hex(c)}"></div><small>${i+1}<br>${hex(c)}</small></div>`).join('');info.textContent=`${w} × ${h} • ${palette.length} couleurs`;
    }

    function toggle(){const editorial=mode.value.startsWith('editorial');if(controls)controls.hidden=!editorial;const gl=grid.closest('label');if(gl)gl.style.display=editorial?'none':'';}
    function regenerate(){if(!image)return;const token=++busyToken,editorial=mode.value.startsWith('editorial');info.textContent=editorial?'Création des zones organiques haute définition…':'Analyse de l’image…';setTimeout(()=>{if(token!==busyToken)return;try{if(editorial){model=makeEditorialModel(image);drawEditorial(mode.value==='editorial-numbered');}else drawLegacy();}catch(err){console.error(err);info.textContent='La génération a échoué. Essaie une complexité moyenne.';}},35);}

    upload.addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>{const im=new Image();im.onload=()=>{image=im;regenerate();};im.src=ev.target.result;};r.readAsDataURL(file);});
    mode.addEventListener('change',()=>{toggle();regenerate();});colors.addEventListener('change',regenerate);grid.addEventListener('change',regenerate);[complexity,merge,strokeWidth,strokeColor,codeMode,guideGrid].forEach(el=>el?.addEventListener('change',regenerate));
    download?.addEventListener('click',()=>{if(!image)return;const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=mode.value.startsWith('editorial')?'lion-dynasty-editorial-v5.png':'lion-dynasty-coloriage.png';a.click();});
    printBtn?.addEventListener('click',()=>{if(!image)return;const data=canvas.toDataURL('image/png'),w=window.open('','_blank');w.document.write(`<title>Lion Dynasty — Coloriage Mystère</title><style>@page{size:A4 portrait;margin:6mm}body{margin:0;text-align:center}img{width:100%;max-height:98vh;object-fit:contain}</style><img src="${data}"><script>onload=()=>setTimeout(()=>print(),180)<\/script>`);w.document.close();});
    toggle();info.textContent='Importe une photo pour créer un coloriage éditorial détaillé.';
  }
  wait();
})();

(() => {
  const waitForUI = (tries = 0) => {
    const upload = document.getElementById('pixelUpload');
    const mode = document.getElementById('pixelMode');
    const colors = document.getElementById('colorCount');
    const canvas = document.getElementById('pixelCanvas');
    if (!upload || !mode || !colors || !canvas) {
      if (tries < 40) return setTimeout(() => waitForUI(tries + 1), 100);
      return;
    }
    boot(upload, mode, colors, canvas);
  };

  function boot(uploadOriginal, modeOriginal, colorsOriginal, canvas) {
    if (window.__LD_EXAMPLE_V2__) return;
    window.__LD_EXAMPLE_V2__ = true;

    const replace = el => {
      const clone = el.cloneNode(true);
      el.replaceWith(clone);
      return clone;
    };

    const upload = replace(uploadOriginal);
    const mode = replace(modeOriginal);
    const colors = replace(colorsOriginal);
    const grid = document.getElementById('gridSize');
    const download = document.getElementById('downloadPixel');
    const printBtn = document.getElementById('printPixel');
    const legend = document.getElementById('pixelLegend');
    const info = document.getElementById('pixelInfo');
    const ctx = canvas.getContext('2d');
    const card = upload.closest('.card');
    const intro = card?.querySelector('p');

    if (intro) intro.textContent = 'Mode Exemple V2 : le dessin est calculé directement depuis la photo en haute résolution, avec contours fins et zones numérotées — sans grille de pixels.';

    const oldOptions = [...mode.options].filter(o => !o.value.startsWith('example-v2'));
    mode.innerHTML = '';
    const ex1 = new Option('Mode Exemple V2 — contour + numéros', 'example-v2-numbered', true, true);
    const ex2 = new Option('Mode Exemple V2 — contour seul', 'example-v2-line');
    mode.add(ex1); mode.add(ex2);
    oldOptions.forEach(o => mode.add(o));
    mode.value = 'example-v2-numbered';

    const controls = document.createElement('div');
    controls.id = 'exampleV2Controls';
    controls.className = 'form-grid two';
    controls.style.marginTop = '10px';
    controls.innerHTML = `
      <label>Complexité
        <select class="field" id="exampleV2Complexity">
          <option value="low">Faible — très propre</option>
          <option value="medium" selected>Moyenne</option>
          <option value="high">Élevée — plus de détails</option>
        </select>
      </label>
      <label>Fusion des zones
        <select class="field" id="exampleV2Fusion">
          <option value="medium">Moyenne</option>
          <option value="strong" selected>Forte</option>
        </select>
      </label>
      <label>Trait
        <select class="field" id="exampleV2Stroke">
          <option value="fine" selected>Fin</option>
          <option value="medium">Moyen</option>
        </select>
      </label>
      <label>Couleur du trait
        <select class="field" id="exampleV2Ink">
          <option value="#B4B4B4" selected>Gris clair</option>
          <option value="#888888">Gris moyen</option>
          <option value="#4E4E4E">Noir doux</option>
        </select>
      </label>`;
    mode.insertAdjacentElement('afterend', controls);

    const complexity = controls.querySelector('#exampleV2Complexity');
    const fusion = controls.querySelector('#exampleV2Fusion');
    const stroke = controls.querySelector('#exampleV2Stroke');
    const ink = controls.querySelector('#exampleV2Ink');

    let image = null;
    let renderState = null;
    let runToken = 0;

    const clamp = (v, a = 0, b = 255) => Math.max(a, Math.min(b, v));
    const dist = (a,b) => .30*(a[0]-b[0])**2 + .59*(a[1]-b[1])**2 + .11*(a[2]-b[2])**2;
    const hex = c => '#' + c.map(v => Math.round(clamp(v)).toString(16).padStart(2,'0')).join('').toUpperCase();
    const average = pts => {
      let r=0,g=0,b=0;
      for (const p of pts) { r+=p[0]; g+=p[1]; b+=p[2]; }
      const n=Math.max(1,pts.length);
      return [r/n,g/n,b/n];
    };
    const channelRange = (pts,k) => {
      let lo=255, hi=0;
      for (const p of pts) { lo=Math.min(lo,p[k]); hi=Math.max(hi,p[k]); }
      return hi-lo;
    };

    function medianCut(pixels, count) {
      let boxes=[pixels.slice()];
      while (boxes.length < count) {
        let bi=-1, score=-1, ch=0;
        boxes.forEach((box,i) => {
          if (box.length < 2) return;
          const ranges=[0,1,2].map(k => channelRange(box,k));
          const c=ranges.indexOf(Math.max(...ranges));
          const s=ranges[c]*Math.sqrt(box.length);
          if (s>score) { score=s; bi=i; ch=c; }
        });
        if (bi < 0) break;
        const box=boxes.splice(bi,1)[0].sort((a,b)=>a[ch]-b[ch]);
        const m=Math.floor(box.length/2);
        boxes.push(box.slice(0,m), box.slice(m));
      }
      return boxes.map(average);
    }

    function refine(pixels, palette, loops=7) {
      let cs=palette.map(c=>c.slice());
      for (let n=0;n<loops;n++) {
        const buckets=cs.map(()=>[]);
        for (const p of pixels) {
          let bi=0,bd=Infinity;
          cs.forEach((c,i)=>{ const d=dist(p,c); if(d<bd){bd=d;bi=i;} });
          buckets[bi].push(p);
        }
        cs=cs.map((c,i)=>buckets[i].length?average(buckets[i]):c);
      }
      return cs;
    }

    function cropRect(img, destW, destH) {
      const sa=img.width/img.height, da=destW/destH;
      let sw=img.width, sh=img.height, sx=0, sy=0;
      if (sa>da) { sw=img.height*da; sx=(img.width-sw)/2; }
      else if (sa<da) { sh=img.width/da; sy=(img.height-sh)/2; }
      return {sx,sy,sw,sh};
    }

    function boxBlur(src,w,h,radius=2) {
      const out=new Float32Array(src.length);
      const temp=new Float32Array(src.length);
      const size=radius*2+1;
      for(let y=0;y<h;y++) {
        let sum=0;
        for(let x=-radius;x<=radius;x++) sum+=src[y*w+clamp(x,0,w-1)];
        for(let x=0;x<w;x++) {
          temp[y*w+x]=sum/size;
          sum-=src[y*w+clamp(x-radius,0,w-1)];
          sum+=src[y*w+clamp(x+radius+1,0,w-1)];
        }
      }
      for(let x=0;x<w;x++) {
        let sum=0;
        for(let y=-radius;y<=radius;y++) sum+=temp[clamp(y,0,h-1)*w+x];
        for(let y=0;y<h;y++) {
          out[y*w+x]=sum/size;
          sum-=temp[clamp(y-radius,0,h-1)*w+x];
          sum+=temp[clamp(y+radius+1,0,h-1)*w+x];
        }
      }
      return out;
    }

    function sobelNms(gray,w,h) {
      const mag=new Float32Array(w*h);
      const dir=new Uint8Array(w*h);
      for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++) {
        const i=y*w+x;
        const a=gray[i-w-1], b=gray[i-w], c=gray[i-w+1];
        const d=gray[i-1],                 f=gray[i+1];
        const g=gray[i+w-1], hh=gray[i+w], j=gray[i+w+1];
        const gx=-a+c-2*d+2*f-g+j;
        const gy=-a-2*b-c+g+2*hh+j;
        const m=Math.hypot(gx,gy);
        mag[i]=m;
        let angle=Math.atan2(gy,gx)*180/Math.PI;
        if(angle<0) angle+=180;
        dir[i]=(angle<22.5||angle>=157.5)?0:(angle<67.5?1:(angle<112.5?2:3));
      }
      const nms=new Float32Array(w*h);
      for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++) {
        const i=y*w+x,m=mag[i],q=dir[i];
        let a,b;
        if(q===0){a=mag[i-1];b=mag[i+1];}
        else if(q===1){a=mag[i-w+1];b=mag[i+w-1];}
        else if(q===2){a=mag[i-w];b=mag[i+w];}
        else {a=mag[i-w-1];b=mag[i+w+1];}
        if(m>=a && m>=b) nms[i]=m;
      }
      return nms;
    }

    function edgeImage(img, maxDim) {
      const aspect=img.width/img.height;
      const w=aspect>=1?maxDim:Math.max(1,Math.round(maxDim*aspect));
      const h=aspect>=1?Math.max(1,Math.round(maxDim/aspect)):maxDim;
      const c=document.createElement('canvas'); c.width=w;c.height=h;
      const x=c.getContext('2d',{willReadFrequently:true});
      x.imageSmoothingEnabled=true; x.imageSmoothingQuality='high';
      const cr=cropRect(img,w,h);
      x.drawImage(img,cr.sx,cr.sy,cr.sw,cr.sh,0,0,w,h);
      const raw=x.getImageData(0,0,w,h).data;
      const gray=new Float32Array(w*h);
      for(let i=0,p=0;i<raw.length;i+=4,p++) gray[p]=.299*raw[i]+.587*raw[i+1]+.114*raw[i+2];
      const blur=boxBlur(gray,w,h,complexity.value==='high'?1:2);
      const nms=sobelNms(blur,w,h);
      const vals=[];
      for(let i=0;i<nms.length;i+=3) if(nms[i]>0) vals.push(nms[i]);
      vals.sort((a,b)=>a-b);
      const percentile=complexity.value==='low'?.84:(complexity.value==='high'?.68:.76);
      const threshold=vals.length?vals[Math.floor(vals.length*percentile)]:60;
      return {w,h,nms,threshold};
    }

    function majoritySmooth(arr,w,h,loops=2) {
      let cur=arr.slice();
      for(let pass=0;pass<loops;pass++) {
        const next=cur.slice();
        for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++) {
          const counts=new Map();
          for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
            const v=cur[(y+dy)*w+x+dx]; counts.set(v,(counts.get(v)||0)+1);
          }
          let best=cur[y*w+x],score=0;
          counts.forEach((n,v)=>{if(n>score){score=n;best=v;}});
          if(score>=5) next[y*w+x]=best;
        }
        cur=next;
      }
      return cur;
    }

    function regions(assign,w,h) {
      const seen=new Uint8Array(w*h),out=[],dirs=[[1,0],[-1,0],[0,1],[0,-1]];
      for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
        const s=y*w+x;if(seen[s])continue;
        const color=assign[s],q=[s];seen[s]=1;const cells=[];let sx=0,sy=0;
        while(q.length){
          const i=q.pop(),cx=i%w,cy=(i/w)|0;cells.push(i);sx+=cx;sy+=cy;
          for(const [dx,dy] of dirs){const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const ni=ny*w+nx;if(!seen[ni]&&assign[ni]===color){seen[ni]=1;q.push(ni);}}
        }
        out.push({color,cells,size:cells.length,cx:sx/cells.length,cy:sy/cells.length});
      }
      return out;
    }

    function mergeSmall(assign,w,h,minSize) {
      let cur=assign.slice();const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
      for(let pass=0;pass<3;pass++) {
        let changed=false;
        const regs=regions(cur,w,h).sort((a,b)=>a.size-b.size);
        for(const r of regs){
          if(r.size>=minSize) continue;
          const n=new Map();
          for(const idx of r.cells){const x=idx%w,y=(idx/w)|0;for(const [dx,dy] of dirs){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const c=cur[ny*w+nx];if(c!==r.color)n.set(c,(n.get(c)||0)+1);}}
          let best=r.color,score=0;n.forEach((s,c)=>{if(s>score){score=s;best=c;}});
          if(best!==r.color){r.cells.forEach(i=>cur[i]=best);changed=true;}
        }
        if(!changed) break;
      }
      return cur;
    }

    function segmentImage(img) {
      const max=complexity.value==='low'?105:(complexity.value==='high'?170:135);
      const aspect=img.width/img.height;
      const w=aspect>=1?max:Math.max(1,Math.round(max*aspect));
      const h=aspect>=1?Math.max(1,Math.round(max/aspect)):max;
      const c=document.createElement('canvas');c.width=w;c.height=h;
      const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
      const cr=cropRect(img,w,h);x.drawImage(img,cr.sx,cr.sy,cr.sw,cr.sh,0,0,w,h);
      const raw=x.getImageData(0,0,w,h).data, pixels=[];
      for(let i=0;i<raw.length;i+=4){pixels.push([raw[i],raw[i+1],raw[i+2]]);}
      const count=Math.max(4,Math.min(16,+colors.value||10));
      const sample=pixels.filter((_,i)=>i%2===0);
      const palette=refine(sample,medianCut(sample,count),6);
      let assign=pixels.map(p=>{let bi=0,bd=Infinity;palette.forEach((c,i)=>{const d=dist(p,c);if(d<bd){bd=d;bi=i;}});return bi;});
      assign=majoritySmooth(assign,w,h,complexity.value==='high'?1:2);
      const minSize=Math.max(6,Math.round(w*h*(fusion.value==='strong'?.0012:.00065)));
      assign=mergeSmall(assign,w,h,minSize);
      return {w,h,palette,assign,regions:regions(assign,w,h)};
    }

    const pointKey=(x,y)=>`${x},${y}`;
    function boundaryLoops(region,w,h){
      const cells=new Set(region.cells), map=new Map();
      const has=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&cells.has(y*w+x);
      const add=(x1,y1,x2,y2)=>{const k=pointKey(x1,y1);if(!map.has(k))map.set(k,[]);map.get(k).push([x2,y2]);};
      for(const idx of region.cells){const x=idx%w,y=(idx/w)|0;if(!has(x,y-1))add(x,y,x+1,y);if(!has(x+1,y))add(x+1,y,x+1,y+1);if(!has(x,y+1))add(x+1,y+1,x,y+1);if(!has(x-1,y))add(x,y+1,x,y);}
      const loops=[];
      while(map.size){const start=map.keys().next().value;const [sx,sy]=start.split(',').map(Number);const loop=[[sx,sy]];let cur=start,guard=0;while(guard++<100000){const list=map.get(cur);if(!list?.length)break;const next=list.shift();if(!list.length)map.delete(cur);loop.push(next);cur=pointKey(next[0],next[1]);if(cur===start)break;}if(loop.length>6)loops.push(loop);}
      return loops;
    }

    function chaikin(points,iters=2){
      let pts=points.slice();
      if(pts.length>1&&pts[0][0]===pts.at(-1)[0]&&pts[0][1]===pts.at(-1)[1])pts=pts.slice(0,-1);
      for(let n=0;n<iters;n++){const next=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];next.push([.75*a[0]+.25*b[0],.75*a[1]+.25*b[1]]);next.push([.25*a[0]+.75*b[0],.25*a[1]+.75*b[1]]);}pts=next;}
      return pts;
    }

    function drawRegionCurves(seg, outW, outH) {
      const sx=outW/seg.w,sy=outH/seg.h;
      ctx.save();
      ctx.strokeStyle=ink.value;
      ctx.lineWidth=stroke.value==='fine'?1.0:1.55;
      ctx.lineJoin='round';ctx.lineCap='round';
      for(const r of seg.regions){
        if(r.size < 8) continue;
        for(const loop of boundaryLoops(r,seg.w,seg.h)){
          const pts=chaikin(loop,3);
          if(pts.length<4)continue;
          ctx.beginPath();ctx.moveTo(pts[0][0]*sx,pts[0][1]*sy);
          for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0]*sx,pts[i][1]*sy);
          ctx.closePath();ctx.stroke();
        }
      }
      ctx.restore();
    }

    function drawPhotoEdges(edges) {
      const img=ctx.createImageData(edges.w,edges.h);
      const d=img.data;
      const th=edges.threshold;
      for(let i=0;i<edges.nms.length;i++){
        const m=edges.nms[i];
        const t=clamp((m-th)/(th*.7),0,1);
        const v=Math.round(255-(255-parseInt(ink.value.slice(1,3),16))*t*.72);
        const p=i*4;d[p]=v;d[p+1]=v;d[p+2]=v;d[p+3]=255;
      }
      const temp=document.createElement('canvas');temp.width=edges.w;temp.height=edges.h;temp.getContext('2d').putImageData(img,0,0);
      ctx.save();ctx.globalAlpha=.72;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(temp,0,0,canvas.width,canvas.height);ctx.restore();
    }

    function drawNumbers(seg,outW,outH) {
      if(mode.value!=='example-v2-numbered') return;
      const sx=outW/seg.w,sy=outH/seg.h;
      ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=ink.value;
      for(const r of seg.regions){
        if(r.size < Math.max(18,seg.w*seg.h*.0009)) continue;
        const fs=Math.max(7,Math.min(12,Math.sqrt(r.size)*.8));
        ctx.font=`600 ${fs}px system-ui`;
        ctx.fillText(String(r.color+1),(r.cx+.5)*sx,(r.cy+.5)*sy);
      }
      ctx.restore();
    }

    async function generateExampleV2() {
      if(!image) return;
      const token=++runToken;
      info.textContent='Analyse haute résolution des contours…';
      await new Promise(r=>setTimeout(r,20));
      const maxDim=complexity.value==='high'?720:(complexity.value==='low'?520:620);
      const edges=edgeImage(image,maxDim);
      if(token!==runToken) return;
      info.textContent='Création des zones de coloriage…';
      await new Promise(r=>setTimeout(r,10));
      const seg=segmentImage(image);
      if(token!==runToken) return;
      canvas.width=edges.w*2;canvas.height=edges.h*2;
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      drawPhotoEdges(edges);
      drawRegionCurves(seg,canvas.width,canvas.height);
      drawNumbers(seg,canvas.width,canvas.height);
      legend.innerHTML=seg.palette.map((c,i)=>`<div class="swatch"><div class="swatch-color" style="background:${hex(c)}"></div><small>N° ${i+1}<br>${hex(c)}</small></div>`).join('');
      info.textContent=`Mode Exemple V2 • ${seg.palette.length} couleurs • contours haute résolution • ${seg.regions.length} zones détectées`;
      renderState={edges,seg};
    }

    function exampleSelected(){return mode.value.startsWith('example-v2');}
    function toggleControls(){controls.hidden=!exampleSelected();if(grid)grid.disabled=exampleSelected();}

    upload.addEventListener('change',e=>{
      const file=e.target.files?.[0];if(!file)return;
      const r=new FileReader();r.onload=ev=>{const img=new Image();img.onload=()=>{image=img;if(exampleSelected())generateExampleV2();};img.src=ev.target.result;};r.readAsDataURL(file);
    });
    mode.addEventListener('change',()=>{toggleControls();if(image&&exampleSelected())generateExampleV2();});
    colors.addEventListener('change',()=>{if(image&&exampleSelected())generateExampleV2();});
    [complexity,fusion,stroke,ink].forEach(el=>el.addEventListener('change',()=>{if(image&&exampleSelected())generateExampleV2();}));

    if(download){
      const clone=replace(download);
      clone.addEventListener('click',()=>{if(!image||!exampleSelected())return;const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='lion-dynasty-mode-exemple-v2.png';a.click();});
    }
    if(printBtn){
      const clone=replace(printBtn);
      clone.addEventListener('click',()=>{if(!image||!exampleSelected())return;const data=canvas.toDataURL('image/png');const w=window.open('','_blank');w.document.write(`<title>Mode Exemple Lion Dynasty</title><style>body{margin:0;background:#fff}img{display:block;max-width:96vw;max-height:96vh;margin:2vh auto}</style><img src="${data}"><script>onload=()=>setTimeout(()=>print(),150)<\/script>`);w.document.close();});
    }

    toggleControls();
    if(info) info.textContent='Mode Exemple V2 prêt — importe une photo.';
  }

  waitForUI();
})();

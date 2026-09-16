(() => {
  const waitForConverter = (attempt = 0) => {
    const mode = document.getElementById('pixelMode');
    const upload = document.getElementById('pixelUpload');
    if (!mode || !upload) return;
    const ready = [...mode.options].some(o => /courbes|sans carrés|mystère/i.test(o.textContent));
    if (!ready && attempt < 60) return setTimeout(() => waitForConverter(attempt + 1), 100);
    initExampleConverter();
  };

  function initExampleConverter() {
    if (window.__LION_EXAMPLE_MODE_READY__) return;
    window.__LION_EXAMPLE_MODE_READY__ = true;

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
    const controls = document.getElementById('exampleControls');
    const complexity = document.getElementById('exampleComplexity');
    const merge = document.getElementById('exampleMerge');
    const strokeWidth = document.getElementById('exampleStrokeWidth');
    const strokeColor = document.getElementById('exampleStrokeColor');
    if (!upload || !grid || !colors || !mode || !canvas || !ctx || !legend || !info) return;

    grid.innerHTML = `
      <option value="24">24 — simple</option>
      <option value="32">32 — équilibré</option>
      <option value="48">48 — détaillé</option>
      <option value="64" selected>64 — portrait précis</option>
      <option value="80">80 — très détaillé</option>`;
    colors.innerHTML = `
      <option value="4">4 couleurs</option><option value="6">6 couleurs</option>
      <option value="8">8 couleurs</option><option value="10">10 couleurs</option>
      <option value="12" selected>12 couleurs</option><option value="16">16 couleurs</option>`;
    mode.innerHTML = `
      <option value="example-numbered" selected>Mode Exemple — contour + numéros</option>
      <option value="example-line">Mode Exemple — contour seul</option>
      <option value="line-numbered">Dessin sans carrés — zones numérotées</option>
      <option value="line-only">Dessin sans carrés — contours seuls</option>
      <option value="mystery">Grille mystère numérotée</option>
      <option value="color">Aperçu couleur</option>`;

    let image = null;
    let model = null;
    const clamp = v => Math.max(0, Math.min(255, v));
    const hex = c => '#' + c.map(v => Math.round(clamp(v)).toString(16).padStart(2,'0')).join('').toUpperCase();
    const dist = (a,b) => .30*(a[0]-b[0])**2 + .59*(a[1]-b[1])**2 + .11*(a[2]-b[2])**2;
    const lum = c => .2126*c[0] + .7152*c[1] + .0722*c[2];
    const avg = pts => {
      let r=0,g=0,b=0; for(const p of pts){r+=p[0];g+=p[1];b+=p[2];}
      const n=Math.max(1,pts.length); return [r/n,g/n,b/n];
    };
    const range = (pts,k) => {
      let lo=255,hi=0; for(const p of pts){lo=Math.min(lo,p[k]);hi=Math.max(hi,p[k]);}
      return hi-lo;
    };

    function medianCut(pixels,count){
      let boxes=[pixels.slice()];
      while(boxes.length<count){
        let bi=-1,score=-1,ch=0;
        boxes.forEach((box,i)=>{
          if(box.length<2)return;
          const rs=[0,1,2].map(k=>range(box,k)), c=rs.indexOf(Math.max(...rs));
          const s=rs[c]*Math.sqrt(box.length);
          if(s>score){score=s;bi=i;ch=c;}
        });
        if(bi<0)break;
        const box=boxes.splice(bi,1)[0].sort((a,b)=>a[ch]-b[ch]);
        const m=Math.floor(box.length/2);boxes.push(box.slice(0,m),box.slice(m));
      }
      return boxes.map(avg);
    }

    function refine(pixels,palette,loops=9){
      let cs=palette.map(c=>c.slice());
      for(let n=0;n<loops;n++){
        const buckets=cs.map(()=>[]);
        for(const p of pixels){
          let bi=0,bd=Infinity;
          cs.forEach((c,i)=>{const d=dist(p,c);if(d<bd){bd=d;bi=i;}});
          buckets[bi].push(p);
        }
        cs=cs.map((c,i)=>buckets[i].length?avg(buckets[i]):c);
      }
      return cs;
    }

    function cropRect(img,cols,rows){
      const sa=img.width/img.height, da=cols/rows;
      let sw=img.width,sh=img.height,sx=0,sy=0;
      if(sa>da){sw=img.height*da;sx=(img.width-sw)/2;}
      else if(sa<da){sh=img.width/da;sy=(img.height-sh)/2;}
      const zoom=img.height>img.width?1.06:1.02;
      const nw=sw/zoom,nh=sh/zoom;sx+=(sw-nw)/2;sy+=(sh-nh)/2;
      return {sx,sy,sw:nw,sh:nh};
    }

    function majoritySmooth(a,cols,rows,loops=2){
      let cur=a.slice();
      for(let p=0;p<loops;p++){
        const next=cur.slice();
        for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++){
          const count=new Map();
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
            const v=cur[(y+dy)*cols+x+dx];count.set(v,(count.get(v)||0)+1);
          }
          let best=cur[y*cols+x],score=0;
          count.forEach((n,v)=>{if(n>score){score=n;best=v;}});
          if(score>=5)next[y*cols+x]=best;
        }
        cur=next;
      }
      return cur;
    }

    function regions(assignments,cols,rows){
      const seen=new Uint8Array(cols*rows),out=[],dirs=[[1,0],[-1,0],[0,1],[0,-1]];
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
        const start=y*cols+x;if(seen[start])continue;
        const color=assignments[start],q=[start];seen[start]=1;const cells=[];let sx=0,sy=0;
        while(q.length){
          const idx=q.pop(),cx=idx%cols,cy=(idx/cols)|0;cells.push(idx);sx+=cx;sy+=cy;
          for(const [dx,dy] of dirs){
            const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=cols||ny>=rows)continue;
            const ni=ny*cols+nx;if(!seen[ni]&&assignments[ni]===color){seen[ni]=1;q.push(ni);}
          }
        }
        out.push({color,cells,size:cells.length,cx:sx/cells.length,cy:sy/cells.length});
      }
      return out;
    }

    function mergeTiny(assignments,cols,rows,minSize){
      let cur=assignments.slice(),dirs=[[1,0],[-1,0],[0,1],[0,-1]];
      for(let pass=0;pass<5;pass++){
        let changed=false;
        for(const reg of regions(cur,cols,rows).sort((a,b)=>a.size-b.size)){
          if(reg.size>=minSize)continue;
          const neighbors=new Map();
          for(const idx of reg.cells){
            const x=idx%cols,y=(idx/cols)|0;
            for(const [dx,dy] of dirs){
              const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=cols||ny>=rows)continue;
              const c=cur[ny*cols+nx];if(c!==reg.color)neighbors.set(c,(neighbors.get(c)||0)+1);
            }
          }
          let best=reg.color,score=0;neighbors.forEach((n,c)=>{if(n>score){score=n;best=c;}});
          if(best!==reg.color){reg.cells.forEach(i=>cur[i]=best);changed=true;}
        }
        if(!changed)break;
      }
      return cur;
    }

    function makeModel(img,isExample){
      const settings={complexity:complexity?.value||'medium',merge:merge?.value||'strong'};
      let target=+grid.value;
      if(isExample)target=({low:48,medium:64,high:80})[settings.complexity]||64;
      const count=+colors.value,aspect=img.width/img.height;
      let cols,rows;if(aspect>=1){cols=target;rows=Math.max(1,Math.round(target/aspect));}else{rows=target;cols=Math.max(1,Math.round(target*aspect));}
      const c=document.createElement('canvas');c.width=cols;c.height=rows;
      const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
      const cr=cropRect(img,cols,rows);x.drawImage(img,cr.sx,cr.sy,cr.sw,cr.sh,0,0,cols,rows);
      const raw=x.getImageData(0,0,cols,rows).data,px=[];
      for(let i=0;i<raw.length;i+=4){
        let r=raw[i],g=raw[i+1],b=raw[i+2],gray=(r+g+b)/3;
        r=clamp((r-128)*1.07+128);g=clamp((g-128)*1.07+128);b=clamp((b-128)*1.07+128);
        r=clamp(gray+(r-gray)*1.10);g=clamp(gray+(g-gray)*1.10);b=clamp(gray+(b-gray)*1.10);
        px.push([r,g,b]);
      }
      const palette=refine(px,medianCut(px,count),10).sort((a,b)=>lum(a)-lum(b));
      let assignments=px.map(p=>{let bi=0,bd=Infinity;palette.forEach((cc,i)=>{const d=dist(p,cc);if(d<bd){bd=d;bi=i;}});return bi;});
      assignments=majoritySmooth(assignments,cols,rows,isExample?3:2);
      const base=Math.min(cols,rows);
      const minSize=isExample?(settings.merge==='strong'?Math.max(8,Math.round(base*.13)):Math.max(5,Math.round(base*.08))):Math.max(4,Math.round(base*.06));
      assignments=mergeTiny(assignments,cols,rows,minSize);
      return {cols,rows,palette,assignments,settings};
    }

    const key=(x,y)=>`${x},${y}`;
    function loopsFor(reg,cols,rows){
      const cells=new Set(reg.cells),map=new Map();
      const has=(x,y)=>x>=0&&y>=0&&x<cols&&y<rows&&cells.has(y*cols+x);
      const add=(x1,y1,x2,y2)=>{const k=key(x1,y1);if(!map.has(k))map.set(k,[]);map.get(k).push([x2,y2]);};
      for(const idx of reg.cells){
        const x=idx%cols,y=(idx/cols)|0;
        if(!has(x,y-1))add(x,y,x+1,y);if(!has(x+1,y))add(x+1,y,x+1,y+1);
        if(!has(x,y+1))add(x+1,y+1,x,y+1);if(!has(x-1,y))add(x,y+1,x,y);
      }
      const out=[];
      while(map.size){
        const start=map.keys().next().value,[sx,sy]=start.split(',').map(Number),loop=[[sx,sy]];let cur=start,guard=0;
        while(guard++<200000){const list=map.get(cur);if(!list?.length)break;const next=list.shift();if(!list.length)map.delete(cur);loop.push(next);cur=key(next[0],next[1]);if(cur===start)break;}
        if(loop.length>4)out.push(loop);
      }
      return out;
    }

    const pDist=(p,a,b)=>{
      const dx=b[0]-a[0],dy=b[1]-a[1];if(!dx&&!dy)return Math.hypot(p[0]-a[0],p[1]-a[1]);
      const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
      return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));
    };
    function simplify(points,tol){
      let pts=points.slice();if(pts.length>1&&key(...pts[0])===key(...pts[pts.length-1]))pts.pop();
      const rdp=arr=>{if(arr.length<=2)return arr;let max=0,idx=0;for(let i=1;i<arr.length-1;i++){const d=pDist(arr[i],arr[0],arr[arr.length-1]);if(d>max){max=d;idx=i;}}
        if(max>tol){const l=rdp(arr.slice(0,idx+1)),r=rdp(arr.slice(idx));return l.slice(0,-1).concat(r);}return [arr[0],arr[arr.length-1]];};
      const out=rdp(pts);if(out.length>2)out.push(out[0]);return out;
    }
    function chaikin(points,passes=3){
      let pts=points.slice();if(pts.length>1&&key(...pts[0])===key(...pts[pts.length-1]))pts.pop();
      for(let p=0;p<passes;p++){const next=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];next.push([.75*a[0]+.25*b[0],.75*a[1]+.25*b[1]],[.25*a[0]+.75*b[0],.25*a[1]+.75*b[1]]);}pts=next;}
      if(pts.length)pts.push(pts[0]);return pts;
    }

    function drawExample(numbered){
      const {cols,rows,palette,assignments,settings}=model,cell=Math.max(10,Math.floor(1000/Math.max(cols,rows)));
      canvas.width=cols*cell;canvas.height=rows*cell;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      const strokeMap={light:'#aaa6a1',medium:'#77736f',dark:'#3f3b37'};
      ctx.strokeStyle=strokeMap[strokeColor?.value||'light'];
      ctx.lineWidth=(strokeWidth?.value||'fine')==='fine'?Math.max(.72,cell*.06):Math.max(1.1,cell*.095);
      ctx.lineCap='round';ctx.lineJoin='round';
      const regs=regions(assignments,cols,rows).sort((a,b)=>b.size-a.size);
      for(const reg of regs){
        if(reg.size<4)continue;
        for(const raw of loopsFor(reg,cols,rows)){
          const tol=settings.complexity==='high'?.38:settings.complexity==='low'?1.0:.62;
          const curve=chaikin(simplify(raw,tol),settings.complexity==='high'?2:3);if(curve.length<4)continue;
          ctx.beginPath();ctx.moveTo(curve[0][0]*cell,curve[0][1]*cell);for(let i=1;i<curve.length;i++)ctx.lineTo(curve[i][0]*cell,curve[i][1]*cell);ctx.closePath();ctx.stroke();
        }
      }
      let labels=0;
      if(numbered){
        ctx.textAlign='center';ctx.textBaseline='middle';
        const minLabel=settings.merge==='strong'?Math.max(10,Math.round(Math.min(cols,rows)*.16)):7;
        for(const reg of regs){
          if(reg.size<minLabel)continue;const fs=Math.max(7,Math.min(cell*.52,Math.sqrt(reg.size)*cell*.18)),text=String(reg.color+1),x=(reg.cx+.5)*cell,y=(reg.cy+.5)*cell;
          ctx.font=`600 ${fs}px Arial`;const w=ctx.measureText(text).width+5,h=fs+2;ctx.fillStyle='rgba(255,255,255,.95)';ctx.fillRect(x-w/2,y-h/2,w,h);ctx.fillStyle=strokeMap[strokeColor?.value||'medium'];ctx.fillText(text,x,y);labels++;
        }
      }
      legend.innerHTML=palette.map((c,i)=>`<div class="swatch"><div class="swatch-color" style="background:${hex(c)}"></div><small>N° ${i+1}<br>${hex(c)}</small></div>`).join('');
      info.textContent=`Mode Exemple • ${palette.length} couleurs • ${regs.length} zones${numbered?` • ${labels} numérotées`:''} • traits ${(strokeWidth?.value||'fine')==='fine'?'fins':'moyens'}`;
    }

    function render(){
      if(!model)return;
      const selected=mode.value,{cols,rows,palette,assignments}=model,cell=Math.max(10,Math.floor(980/Math.max(cols,rows)));
      if(selected==='example-numbered'||selected==='example-line')return drawExample(selected==='example-numbered');
      canvas.width=cols*cell;canvas.height=rows*cell;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.lineJoin='round';ctx.lineCap='round';
      if(selected==='color'||selected==='mystery'){
        ctx.textAlign='center';ctx.textBaseline='middle';
        for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
          const i=y*cols+x,p=assignments[i];ctx.fillStyle=selected==='color'?hex(palette[p]):'#fff';ctx.fillRect(x*cell,y*cell,cell,cell);ctx.strokeStyle='rgba(40,30,20,.22)';ctx.strokeRect(x*cell+.5,y*cell+.5,cell,cell);
          if(selected==='mystery'){ctx.fillStyle='#24170e';ctx.font=`700 ${Math.max(7,cell*.42)}px system-ui`;ctx.fillText(String(p+1),x*cell+cell/2,y*cell+cell/2);}
        }
      }else{
        ctx.strokeStyle='#514b46';ctx.lineWidth=Math.max(.9,cell*.08);
        for(const reg of regions(assignments,cols,rows))for(const loop of loopsFor(reg,cols,rows)){
          const curve=chaikin(simplify(loop,.55),2);if(curve.length<4)continue;ctx.beginPath();ctx.moveTo(curve[0][0]*cell,curve[0][1]*cell);for(let i=1;i<curve.length;i++)ctx.lineTo(curve[i][0]*cell,curve[i][1]*cell);ctx.closePath();ctx.stroke();
        }
        if(selected==='line-numbered'){
          ctx.textAlign='center';ctx.textBaseline='middle';for(const reg of regions(assignments,cols,rows)){if(reg.size<6)continue;const fs=Math.max(7,Math.min(cell*.55,Math.sqrt(reg.size)*cell*.19)),x=(reg.cx+.5)*cell,y=(reg.cy+.5)*cell;ctx.font=`600 ${fs}px Arial`;ctx.fillStyle='#fff';ctx.fillRect(x-fs*.5,y-fs*.5,fs,fs);ctx.fillStyle='#514b46';ctx.fillText(String(reg.color+1),x,y);}
        }
      }
      legend.innerHTML=palette.map((c,i)=>`<div class="swatch"><div class="swatch-color" style="background:${hex(c)}"></div><small>N° ${i+1}<br>${hex(c)}</small></div>`).join('');
      info.textContent=`${cols} × ${rows} • ${palette.length} couleurs`;
    }

    function regenerate(){
      if(!image)return;const isExample=mode.value.startsWith('example');info.textContent=isExample?'Création du Mode Exemple…':'Analyse de l’image…';
      setTimeout(()=>{model=makeModel(image,isExample);render();},20);
    }

    const toggleControls=()=>{if(controls)controls.hidden=!mode.value.startsWith('example');};
    toggleControls();
    upload.addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{const im=new Image();im.onload=()=>{image=im;regenerate();};im.src=ev.target.result;};r.readAsDataURL(f);});
    grid.addEventListener('change',regenerate);colors.addEventListener('change',regenerate);
    mode.addEventListener('change',()=>{toggleControls();regenerate();});
    [complexity,merge,strokeWidth,strokeColor].forEach(el=>el?.addEventListener('change',regenerate));
    download?.addEventListener('click',()=>{if(!model)return;const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=mode.value.startsWith('example')?'lion-dynasty-mode-exemple.png':'lion-dynasty-coloriage.png';a.click();});
    printBtn?.addEventListener('click',()=>{if(!model)return;const data=canvas.toDataURL('image/png'),leg=model.palette.map((c,i)=>`<span style="display:inline-flex;align-items:center;gap:5px;margin:3px 5px;font:12px Arial"><i style="width:18px;height:18px;background:${hex(c)};border:1px solid #aaa;display:inline-block"></i><b>${i+1}</b> ${hex(c)}</span>`).join(''),w=window.open('','_blank');w.document.write(`<title>Lion Dynasty — Mode Exemple</title><style>body{margin:18px;font-family:Arial}img{max-width:100%;max-height:78vh;display:block;margin:auto}.legend{text-align:center;margin-top:12px}@media print{button{display:none}}</style><img src="${data}"><div class="legend">${leg}</div><script>onload=()=>setTimeout(()=>print(),150)<\/script>`);w.document.close();});
  }

  waitForConverter();
})();

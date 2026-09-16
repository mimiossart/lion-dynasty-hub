(async () => {
  if (!document.getElementById('resendConfirmation')) {
    const b = document.createElement('button');
    b.id = 'resendConfirmation';
    b.type = 'button';
    b.hidden = true;
    document.body.appendChild(b);
  }

  const files = ['app.part1.txt','app.part2.txt','app.part3.txt','app.part4.txt','app.part5.txt'];
  const parts = await Promise.all(files.map(async f => {
    const r = await fetch(f, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Impossible de charger ${f}`);
    return r.text();
  }));
  (0, eval)(parts.join(''));

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

  if (!upload || !grid || !colors || !mode || !canvas || !ctx) return;

  grid.innerHTML = `
    <option value="24">24 — simple</option>
    <option value="32">32 — équilibré</option>
    <option value="48">48 — détaillé</option>
    <option value="64" selected>64 — portrait précis</option>
    <option value="80">80 — très détaillé</option>`;
  colors.innerHTML = `
    <option value="4">4 couleurs</option>
    <option value="6">6 couleurs</option>
    <option value="8">8 couleurs</option>
    <option value="10">10 couleurs</option>
    <option value="12" selected>12 couleurs</option>
    <option value="16">16 couleurs</option>`;
  mode.innerHTML = `
    <option value="line-numbered" selected>Dessin en courbes — zones numérotées</option>
    <option value="line-only">Dessin en courbes — contours seuls</option>
    <option value="mystery">Grille mystère numérotée</option>
    <option value="color">Aperçu couleur</option>`;
  grid.value = '64';
  colors.value = '12';
  mode.value = 'line-numbered';
  if (intro) intro.textContent = 'Transforme une photo en dessin de coloriage à contours continus : courbes lissées, zones fusionnées et numéros, sans quadrillage visible.';

  let image = null;
  let model = null;
  const clamp = v => Math.max(0, Math.min(255, v));
  const hex = c => '#' + c.map(v => Math.round(clamp(v)).toString(16).padStart(2,'0')).join('').toUpperCase();
  const dist = (a,b) => .30*(a[0]-b[0])**2 + .59*(a[1]-b[1])**2 + .11*(a[2]-b[2])**2;
  const lum = c => .2126*c[0] + .7152*c[1] + .0722*c[2];

  function average(points) {
    let r=0,g=0,b=0;
    for (const p of points) { r+=p[0]; g+=p[1]; b+=p[2]; }
    const n=Math.max(1,points.length);
    return [r/n,g/n,b/n];
  }
  function channelRange(points,k) {
    let lo=255,hi=0;
    for (const p of points) { lo=Math.min(lo,p[k]); hi=Math.max(hi,p[k]); }
    return hi-lo;
  }
  function medianCut(pixels,count) {
    let boxes=[pixels.slice()];
    while (boxes.length<count) {
      let bi=-1,score=-1,channel=0;
      boxes.forEach((box,i) => {
        if (box.length<2) return;
        const rs=[0,1,2].map(k=>channelRange(box,k));
        const ch=rs.indexOf(Math.max(...rs));
        const s=rs[ch]*Math.sqrt(box.length);
        if (s>score) { score=s; bi=i; channel=ch; }
      });
      if (bi<0) break;
      const box=boxes.splice(bi,1)[0].sort((a,b)=>a[channel]-b[channel]);
      const mid=Math.floor(box.length/2);
      boxes.push(box.slice(0,mid),box.slice(mid));
    }
    return boxes.map(average);
  }
  function refine(pixels,palette,loops=9) {
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
  function cropRect(img,cols,rows) {
    const sa=img.width/img.height, da=cols/rows;
    let sw=img.width,sh=img.height,sx=0,sy=0;
    if (sa>da) { sw=img.height*da; sx=(img.width-sw)/2; }
    else if (sa<da) { sh=img.width/da; sy=(img.height-sh)/2; }
    const zoom=img.height>img.width?1.08:1.03;
    const nw=sw/zoom,nh=sh/zoom;
    sx+=(sw-nw)/2; sy+=(sh-nh)/2;
    return {sx,sy,sw:nw,sh:nh};
  }

  function majoritySmooth(values,cols,rows,loops=2) {
    let cur=values.slice();
    for (let pass=0;pass<loops;pass++) {
      const next=cur.slice();
      for (let y=1;y<rows-1;y++) for (let x=1;x<cols-1;x++) {
        const counts=new Map();
        for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
          const v=cur[(y+dy)*cols+x+dx];
          counts.set(v,(counts.get(v)||0)+1);
        }
        let best=cur[y*cols+x],score=0;
        counts.forEach((n,v)=>{ if(n>score){score=n;best=v;} });
        if (score>=5) next[y*cols+x]=best;
      }
      cur=next;
    }
    return cur;
  }

  function getRegions(assignments,cols,rows) {
    const seen=new Uint8Array(cols*rows);
    const out=[];
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) {
      const start=y*cols+x;
      if (seen[start]) continue;
      const color=assignments[start];
      const q=[start];
      seen[start]=1;
      const cells=[];
      let sx=0,sy=0;
      while (q.length) {
        const idx=q.pop(),cx=idx%cols,cy=(idx/cols)|0;
        cells.push(idx); sx+=cx; sy+=cy;
        for (const [dx,dy] of dirs) {
          const nx=cx+dx,ny=cy+dy;
          if (nx<0||ny<0||nx>=cols||ny>=rows) continue;
          const ni=ny*cols+nx;
          if (!seen[ni] && assignments[ni]===color) { seen[ni]=1; q.push(ni); }
        }
      }
      const cx=sx/cells.length,cy=sy/cells.length;
      let labelIdx=cells[0],best=Infinity;
      for (const idx of cells) {
        const px=idx%cols,py=(idx/cols)|0,d=(px-cx)**2+(py-cy)**2;
        if (d<best) { best=d; labelIdx=idx; }
      }
      out.push({color,cells,size:cells.length,cx,cy,labelX:labelIdx%cols,labelY:(labelIdx/cols)|0});
    }
    return out;
  }

  function mergeTinyRegions(assignments,cols,rows,minSize) {
    let cur=assignments.slice();
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    for (let pass=0;pass<4;pass++) {
      let changed=false;
      const regs=getRegions(cur,cols,rows).sort((a,b)=>a.size-b.size);
      for (const reg of regs) {
        if (reg.size>=minSize) continue;
        const neighbors=new Map();
        for (const idx of reg.cells) {
          const x=idx%cols,y=(idx/cols)|0;
          for (const [dx,dy] of dirs) {
            const nx=x+dx,ny=y+dy;
            if (nx<0||ny<0||nx>=cols||ny>=rows) continue;
            const c=cur[ny*cols+nx];
            if (c!==reg.color) neighbors.set(c,(neighbors.get(c)||0)+1);
          }
        }
        let bestColor=reg.color,bestScore=0;
        neighbors.forEach((score,c)=>{ if(score>bestScore){bestScore=score;bestColor=c;} });
        if (bestColor!==reg.color) {
          reg.cells.forEach(idx=>{cur[idx]=bestColor;});
          changed=true;
        }
      }
      if (!changed) break;
    }
    return cur;
  }

  function makeModel(img) {
    const target=+grid.value,count=+colors.value,aspect=img.width/img.height;
    let cols,rows;
    if (aspect>=1) { cols=target; rows=Math.max(1,Math.round(target/aspect)); }
    else { rows=target; cols=Math.max(1,Math.round(target*aspect)); }
    const c=document.createElement('canvas');
    c.width=cols;c.height=rows;
    const x=c.getContext('2d',{willReadFrequently:true});
    x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
    const cr=cropRect(img,cols,rows);
    x.drawImage(img,cr.sx,cr.sy,cr.sw,cr.sh,0,0,cols,rows);
    const raw=x.getImageData(0,0,cols,rows).data;
    const px=[];
    for (let i=0;i<raw.length;i+=4) {
      let r=raw[i],g=raw[i+1],b=raw[i+2];
      const gray=(r+g+b)/3;
      r=clamp((r-128)*1.08+128); g=clamp((g-128)*1.08+128); b=clamp((b-128)*1.08+128);
      r=clamp(gray+(r-gray)*1.12); g=clamp(gray+(g-gray)*1.12); b=clamp(gray+(b-gray)*1.12);
      px.push([r,g,b]);
    }
    const palette=refine(px,medianCut(px,count),10).sort((a,b)=>lum(a)-lum(b));
    let assignments=px.map(p=>{
      let bi=0,bd=Infinity;
      palette.forEach((c,i)=>{const d=dist(p,c);if(d<bd){bd=d;bi=i;}});
      return bi;
    });
    assignments=majoritySmooth(assignments,cols,rows,2);
    const minRegion=Math.max(4,Math.round(Math.min(cols,rows)*0.07));
    assignments=mergeTinyRegions(assignments,cols,rows,minRegion);
    return {cols,rows,palette,assignments};
  }

  const key=(x,y)=>`${x},${y}`;
  function boundaryLoops(region,cols,rows) {
    const cells=new Set(region.cells);
    const has=(x,y)=>x>=0&&y>=0&&x<cols&&y<rows&&cells.has(y*cols+x);
    const map=new Map();
    const add=(x1,y1,x2,y2)=>{
      const k=key(x1,y1);
      if(!map.has(k)) map.set(k,[]);
      map.get(k).push([x2,y2]);
    };
    for (const idx of region.cells) {
      const x=idx%cols,y=(idx/cols)|0;
      if(!has(x,y-1)) add(x,y,x+1,y);
      if(!has(x+1,y)) add(x+1,y,x+1,y+1);
      if(!has(x,y+1)) add(x+1,y+1,x,y+1);
      if(!has(x-1,y)) add(x,y+1,x,y);
    }
    const loops=[];
    while(map.size) {
      const start=map.keys().next().value;
      const [sx,sy]=start.split(',').map(Number);
      const loop=[[sx,sy]];
      let current=start,guard=0;
      while(guard++<200000) {
        const list=map.get(current);
        if(!list?.length) break;
        const next=list.shift();
        if(!list.length) map.delete(current);
        loop.push(next);
        current=key(next[0],next[1]);
        if(current===start) break;
      }
      if(loop.length>4) loops.push(loop);
    }
    return loops;
  }

  function chaikin(points,iterations=2) {
    let pts=points.slice();
    if (pts.length>1 && pts[0][0]===pts[pts.length-1][0] && pts[0][1]===pts[pts.length-1][1]) pts=pts.slice(0,-1);
    for (let n=0;n<iterations;n++) {
      const next=[];
      for (let i=0;i<pts.length;i++) {
        const a=pts[i],b=pts[(i+1)%pts.length];
        next.push([.75*a[0]+.25*b[0],.75*a[1]+.25*b[1]]);
        next.push([.25*a[0]+.75*b[0],.25*a[1]+.75*b[1]]);
      }
      pts=next;
    }
    return pts;
  }

  function drawSmoothClosed(points,scale) {
    const pts=chaikin(points,2);
    if (pts.length<3) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0]*scale,pts[0][1]*scale);
    for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0]*scale,pts[i][1]*scale);
    ctx.closePath();
    ctx.stroke();
  }

  function render() {
    if (!model) return;
    const {cols,rows,palette,assignments}=model;
    const selected=mode.value;
    const cell=Math.max(10,Math.floor(980/Math.max(cols,rows)));
    canvas.width=cols*cell;
    canvas.height=rows*cell;
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.lineJoin='round';
    ctx.lineCap='round';

    if (selected==='color' || selected==='mystery') {
      ctx.textAlign='center';ctx.textBaseline='middle';
      for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) {
        const idx=y*cols+x,p=assignments[idx];
        ctx.fillStyle=selected==='color'?hex(palette[p]):'#fff';
        ctx.fillRect(x*cell,y*cell,cell,cell);
        ctx.strokeStyle='rgba(40,30,20,.22)';
        ctx.strokeRect(x*cell+.5,y*cell+.5,cell,cell);
        if (selected==='mystery') {
          ctx.fillStyle='#24170e';
          ctx.font=`700 ${Math.max(7,cell*.42)}px system-ui`;
          ctx.fillText(String(p+1),x*cell+cell/2,y*cell+cell/2);
        }
      }
    } else {
      const regs=getRegions(assignments,cols,rows).sort((a,b)=>b.size-a.size);
      ctx.strokeStyle='#24170e';
      ctx.lineWidth=Math.max(.9,cell*.085);
      for (const reg of regs) {
        if (reg.size<2) continue;
        for (const loop of boundaryLoops(reg,cols,rows)) drawSmoothClosed(loop,cell);
      }
      if (selected==='line-numbered') {
        ctx.textAlign='center';ctx.textBaseline='middle';
        for (const reg of regs) {
          if (reg.size<7) continue;
          const fs=Math.max(8,Math.min(cell*.62,Math.sqrt(reg.size)*cell*.20));
          const text=String(reg.color+1);
          const x=(reg.labelX+.5)*cell,y=(reg.labelY+.5)*cell;
          ctx.font=`700 ${fs}px system-ui`;
          const w=ctx.measureText(text).width+8,h=fs+5;
          ctx.fillStyle='rgba(255,255,255,.96)';
          ctx.fillRect(x-w/2,y-h/2,w,h);
          ctx.fillStyle='#24170e';
          ctx.fillText(text,x,y);
        }
      }
    }

    legend.innerHTML=palette.map((c,i)=>`<div class="swatch"><div class="swatch-color" style="background:${hex(c)}"></div><small>N° ${i+1}<br>${hex(c)}</small></div>`).join('');
    const labels={
      'line-numbered':`Dessin en courbes • ${palette.length} couleurs • zones numérotées • petites zones fusionnées`,
      'line-only':`Dessin en courbes • ${palette.length} couleurs • contours continus`,
      'mystery':`${cols} × ${rows} • ${palette.length} couleurs • grille mystère`,
      'color':`${cols} × ${rows} • ${palette.length} couleurs • aperçu couleur`
    };
    info.textContent=labels[selected]||`${cols} × ${rows} • ${palette.length} couleurs`;
  }

  function regenerate() {
    if (!image) return;
    info.textContent='Création du dessin en courbes…';
    setTimeout(()=>{model=makeModel(image);render();},20);
  }

  upload.addEventListener('change',e=>{
    const f=e.target.files[0];
    if(!f) return;
    const r=new FileReader();
    r.onload=ev=>{
      const im=new Image();
      im.onload=()=>{image=im;regenerate();};
      im.src=ev.target.result;
    };
    r.readAsDataURL(f);
  });
  grid.addEventListener('change',regenerate);
  colors.addEventListener('change',regenerate);
  mode.addEventListener('change',render);

  download?.addEventListener('click',()=>{
    if(!model) return;
    const a=document.createElement('a');
    a.href=canvas.toDataURL('image/png');
    a.download=mode.value.startsWith('line')?'lion-dynasty-dessin-courbes.png':'lion-dynasty-grille.png';
    a.click();
  });
  printBtn?.addEventListener('click',()=>{
    if(!model) return;
    const data=canvas.toDataURL('image/png');
    const paletteHTML=model.palette.map((c,i)=>`<span style="display:inline-flex;align-items:center;gap:5px;margin:4px;padding:5px 7px;border:1px solid #ccc;border-radius:7px"><i style="width:20px;height:20px;background:${hex(c)};display:inline-block;border:1px solid #aaa"></i><b>N°${i+1}</b> ${hex(c)}</span>`).join('');
    const w=window.open('','_blank');
    w.document.write(`<title>Lion Dynasty</title><h2 style="font-family:Arial;text-align:center">Dessin Lion Dynasty</h2><img src="${data}" style="max-width:100%;max-height:78vh;display:block;margin:auto"><div style="font-family:Arial;text-align:center">${paletteHTML}</div><script>onload=()=>setTimeout(()=>print(),150)<\/script>`);
    w.document.close();
  });
})().catch(error => {
  console.error('Lion Dynasty app loading error', error);
  const t=document.getElementById('toast');
  if(t){t.textContent='Le site n’a pas pu se charger. Recharge la page.';t.classList.add('show');}
});

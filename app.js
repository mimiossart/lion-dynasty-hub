(async () => {
  if (!document.getElementById('resendConfirmation')) {
    const b = document.createElement('button');
    b.id = 'resendConfirmation'; b.type = 'button'; b.hidden = true;
    document.body.appendChild(b);
  }

  const files = ['app.part1.txt','app.part2.txt','app.part3.txt','app.part4.txt','app.part5.txt'];
  const parts = await Promise.all(files.map(async f => {
    const r = await fetch(f, {cache:'no-store'});
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
  const ctx = canvas.getContext('2d');
  const legend = document.getElementById('pixelLegend');
  const info = document.getElementById('pixelInfo');
  const card = upload?.closest('.card');
  const intro = card?.querySelector('p');

  if (!upload || !grid || !colors || !mode || !canvas) return;

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
    <option value="line-numbered" selected>Dessin sans carrés — zones numérotées</option>
    <option value="line-only">Dessin sans carrés — contours seuls</option>
    <option value="mystery">Grille mystère numérotée</option>
    <option value="color">Aperçu couleur</option>`;
  if (intro) intro.textContent = 'Transforme une photo en vrai dessin de coloriage : contours noirs, zones numérotées, sans quadrillage visible.';

  let image = null, model = null;
  const clamp = v => Math.max(0, Math.min(255, v));
  const hex = c => '#' + c.map(v => Math.round(clamp(v)).toString(16).padStart(2,'0')).join('').toUpperCase();
  const dist = (a,b) => .30*(a[0]-b[0])**2 + .59*(a[1]-b[1])**2 + .11*(a[2]-b[2])**2;
  const lum = c => .2126*c[0]+.7152*c[1]+.0722*c[2];
  const avg = pts => {
    let r=0,g=0,b=0; for (const p of pts){r+=p[0];g+=p[1];b+=p[2];}
    const n=Math.max(1,pts.length); return [r/n,g/n,b/n];
  };
  const range = (pts,k) => {
    let lo=255, hi=0; for(const p of pts){lo=Math.min(lo,p[k]);hi=Math.max(hi,p[k]);} return hi-lo;
  };
  function medianCut(pixels, count){
    let boxes=[pixels.slice()];
    while(boxes.length<count){
      let bi=-1, score=-1, channel=0;
      boxes.forEach((box,i)=>{
        if(box.length<2) return;
        const rs=[0,1,2].map(k=>range(box,k));
        const ch=rs.indexOf(Math.max(...rs));
        const s=rs[ch]*Math.sqrt(box.length);
        if(s>score){score=s;bi=i;channel=ch;}
      });
      if(bi<0) break;
      const box=boxes.splice(bi,1)[0].sort((a,b)=>a[channel]-b[channel]);
      const m=Math.floor(box.length/2);
      boxes.push(box.slice(0,m),box.slice(m));
    }
    return boxes.map(avg);
  }
  function refine(pixels,palette,loops=8){
    let cs=palette.map(x=>x.slice());
    for(let n=0;n<loops;n++){
      const buckets=cs.map(()=>[]);
      for(const p of pixels){let bi=0,bd=Infinity;cs.forEach((c,i)=>{const d=dist(p,c);if(d<bd){bd=d;bi=i;}});buckets[bi].push(p);}
      cs=cs.map((c,i)=>buckets[i].length?avg(buckets[i]):c);
    }
    return cs;
  }
  function cropRect(img, cols, rows){
    const sa=img.width/img.height, da=cols/rows;
    let sw=img.width,sh=img.height,sx=0,sy=0;
    if(sa>da){sw=img.height*da;sx=(img.width-sw)/2;} else if(sa<da){sh=img.width/da;sy=(img.height-sh)/2;}
    const zoom=img.height>img.width?1.08:1.03;
    const nw=sw/zoom, nh=sh/zoom; sx+=(sw-nw)/2; sy+=(sh-nh)/2;
    return {sx,sy,sw:nw,sh:nh};
  }
  function majoritySmooth(a, cols, rows, loops=2){
    let cur=a.slice();
    for(let n=0;n<loops;n++){
      const next=cur.slice();
      for(let y=1;y<rows-1;y++) for(let x=1;x<cols-1;x++){
        const counts=new Map();
        for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
          const v=cur[(y+dy)*cols+x+dx]; counts.set(v,(counts.get(v)||0)+1);
        }
        let best=cur[y*cols+x], bc=0;
        counts.forEach((c,v)=>{if(c>bc){bc=c;best=v;}});
        if(bc>=5) next[y*cols+x]=best;
      }
      cur=next;
    }
    return cur;
  }
  function makeModel(img){
    const target=+grid.value, count=+colors.value, aspect=img.width/img.height;
    let cols,rows; if(aspect>=1){cols=target;rows=Math.max(1,Math.round(target/aspect));} else {rows=target;cols=Math.max(1,Math.round(target*aspect));}
    const c=document.createElement('canvas'); c.width=cols;c.height=rows;
    const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
    const cr=cropRect(img,cols,rows);x.drawImage(img,cr.sx,cr.sy,cr.sw,cr.sh,0,0,cols,rows);
    const raw=x.getImageData(0,0,cols,rows).data, px=[];
    for(let i=0;i<raw.length;i+=4){
      let r=raw[i],g=raw[i+1],b=raw[i+2]; const gray=(r+g+b)/3;
      r=clamp((r-128)*1.08+128);g=clamp((g-128)*1.08+128);b=clamp((b-128)*1.08+128);
      r=clamp(gray+(r-gray)*1.12);g=clamp(gray+(g-gray)*1.12);b=clamp(gray+(b-gray)*1.12);
      px.push([r,g,b]);
    }
    let palette=refine(px,medianCut(px,count),9).sort((a,b)=>lum(a)-lum(b));
    let assignments=px.map(p=>{let bi=0,bd=Infinity;palette.forEach((c,i)=>{const d=dist(p,c);if(d<bd){bd=d;bi=i;}});return bi;});
    assignments=majoritySmooth(assignments,cols,rows,2);
    return {cols,rows,palette,assignments};
  }
  function regions(m){
    const {cols,rows,assignments}=m, seen=new Uint8Array(cols*rows), out=[];
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
      const s=y*cols+x;if(seen[s])continue; const color=assignments[s], q=[s];seen[s]=1;let n=0,sx=0,sy=0;
      while(q.length){const i=q.pop(),cx=i%cols,cy=(i/cols)|0;n++;sx+=cx;sy+=cy;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=cols||ny>=rows)continue;const ni=ny*cols+nx;if(!seen[ni]&&assignments[ni]===color){seen[ni]=1;q.push(ni);}}}
      out.push({color,n,cx:sx/n,cy:sy/n});
    }
    return out;
  }
  function render(){
    if(!model) return;
    const {cols,rows,palette,assignments}=model, m=mode.value;
    const cell=Math.max(9,Math.floor(950/Math.max(cols,rows)));canvas.width=cols*cell;canvas.height=rows*cell;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.lineJoin='round';ctx.lineCap='round';
    if(m==='color' || m==='mystery'){
      ctx.textAlign='center';ctx.textBaseline='middle';
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
        const i=y*cols+x,p=assignments[i];ctx.fillStyle=m==='color'?hex(palette[p]):'#fff';ctx.fillRect(x*cell,y*cell,cell,cell);
        ctx.strokeStyle='rgba(40,30,20,.24)';ctx.strokeRect(x*cell+.5,y*cell+.5,cell,cell);
        if(m==='mystery'){ctx.fillStyle='#24170e';ctx.font=`700 ${Math.max(7,cell*.42)}px system-ui`;ctx.fillText(String(p+1),x*cell+cell/2,y*cell+cell/2);}
      }
    } else {
      ctx.strokeStyle='#24170e';ctx.lineWidth=Math.max(1.2,cell*.11);ctx.beginPath();
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
        const p=assignments[y*cols+x],x0=x*cell,y0=y*cell,x1=x0+cell,y1=y0+cell;
        if(x===0||assignments[y*cols+x-1]!==p){ctx.moveTo(x0,y0);ctx.lineTo(x0,y1);}
        if(y===0||assignments[(y-1)*cols+x]!==p){ctx.moveTo(x0,y0);ctx.lineTo(x1,y0);}
        if(x===cols-1||assignments[y*cols+x+1]!==p){ctx.moveTo(x1,y0);ctx.lineTo(x1,y1);}
        if(y===rows-1||assignments[(y+1)*cols+x]!==p){ctx.moveTo(x0,y1);ctx.lineTo(x1,y1);}
      } ctx.stroke();
      if(m==='line-numbered'){
        ctx.textAlign='center';ctx.textBaseline='middle';
        for(const r of regions(model)){
          if(r.n<3)continue;const fs=Math.max(8,Math.min(cell*.62,Math.sqrt(r.n)*cell*.22)),text=String(r.color+1),x=(r.cx+.5)*cell,y=(r.cy+.5)*cell;
          ctx.font=`700 ${fs}px system-ui`;const w=ctx.measureText(text).width+5,h=fs+3;ctx.fillStyle='rgba(255,255,255,.94)';ctx.fillRect(x-w/2,y-h/2,w,h);ctx.fillStyle='#24170e';ctx.fillText(text,x,y);
        }
      }
    }
    legend.innerHTML=palette.map((c,i)=>`<div class="swatch"><div class="swatch-color" style="background:${hex(c)}"></div><small>N° ${i+1}<br>${hex(c)}</small></div>`).join('');
    info.textContent = m==='line-numbered' ? `Dessin sans carrés • ${palette.length} couleurs • zones numérotées` : m==='line-only' ? `Dessin sans carrés • ${palette.length} couleurs • contours seuls` : `${cols} × ${rows} • ${palette.length} couleurs`;
  }
  function regenerate(){if(!image)return;info.textContent='Création du dessin…';setTimeout(()=>{model=makeModel(image);render();},20);}
  upload.addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{const im=new Image();im.onload=()=>{image=im;regenerate();};im.src=ev.target.result;};r.readAsDataURL(f);});
  grid.addEventListener('change',regenerate);colors.addEventListener('change',regenerate);mode.addEventListener('change',render);
  download?.addEventListener('click',()=>{if(!model)return;const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=mode.value.startsWith('line')?'lion-dynasty-dessin-numero.png':'lion-dynasty-grille.png';a.click();});
  printBtn?.addEventListener('click',()=>{if(!model)return;const data=canvas.toDataURL('image/png'),w=window.open('','_blank');w.document.write(`<title>Lion Dynasty</title><img src="${data}" style="max-width:100%;display:block;margin:auto"><script>onload=()=>setTimeout(()=>print(),150)<\/script>`);w.document.close();});
})().catch(error => {
  console.error('Lion Dynasty app loading error', error);
  const t=document.getElementById('toast');if(t){t.textContent='Le site n’a pas pu se charger. Recharge la page.';t.classList.add('show');}
});

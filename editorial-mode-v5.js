(() => {
  const wait = (n=0) => {
    const upload=document.getElementById('pixelUpload');
    const mode=document.getElementById('pixelMode');
    if(!upload || !mode){ if(n<80) setTimeout(()=>wait(n+1),100); return; }
    if(window.__LION_EDITORIAL_V5__) return;
    init();
  };

  function init(){
    window.__LION_EDITORIAL_V5__=true;
    if(!document.getElementById('editorialV5Styles')){
      const style=document.createElement('style');
      style.id='editorialV5Styles';
      style.textContent='.editorial-extras{display:contents}#pixelCanvas{background:#fff}.canvas-wrap{background:#fff}';
      document.head.appendChild(style);
    }

    const clone=id=>{
      const old=document.getElementById(id); if(!old) return null;
      const el=old.cloneNode(true); old.replaceWith(el); return el;
    };

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
    if(!upload||!grid||!colors||!mode||!canvas||!ctx||!legend||!info) return;

    mode.innerHTML=`
      <option value="editorial-numbered" selected>Mode Éditorial V5 — contour + codes</option>
      <option value="editorial-line">Mode Éditorial V5 — contour seul</option>
      <option value="example-numbered">Mode Exemple V2 — contour + numéros</option>
      <option value="example-line">Mode Exemple V2 — contour seul</option>
      <option value="mystery">Grille mystère numérotée</option>
      <option value="color">Aperçu couleur</option>`;

    colors.innerHTML=`
      <option value="8">8 couleurs</option>
      <option value="10">10 couleurs</option>
      <option value="12" selected>12 couleurs</option>
      <option value="14">14 couleurs</option>
      <option value="16">16 couleurs</option>`;
    colors.value='12';

    grid.innerHTML=`
      <option value="48">Standard</option>
      <option value="64" selected>Détaillé</option>
      <option value="80">Très détaillé</option>`;
    grid.value='64';

    if(intro) intro.textContent='V5 Mode Éditorial : transforme une photo en page de coloriage mystère A4 avec contours fins, zones organiques, codes discrets et palette imprimable.';

    let extras=document.getElementById('editorialExtras');
    if(!extras && controls){
      extras=document.createElement('div');
      extras.id='editorialExtras';
      extras.className='editorial-extras';
      extras.innerHTML=`
        <label>Codes
          <select class="field" id="editorialCodes">
            <option value="numbers" selected>Chiffres</option>
            <option value="letters">Chiffres + lettres</option>
          </select>
        </label>
        <label>Repères de page
          <select class="field" id="editorialGrid">
            <option value="off" selected>Sans grille</option>
            <option value="on">Grille très légère</option>
          </select>
        </label>`;
      controls.appendChild(extras);
    }
    const codeMode=document.getElementById('editorialCodes');
    const guideGrid=document.getElementById('editorialGrid');

    let image=null;
    let editorialModel=null;
    let busyToken=0;

    const clamp=v=>Math.max(0,Math.min(255,v));
    const hex=c=>'#'+c.map(v=>Math.round(clamp(v)).toString(16).padStart(2,'0')).join('').toUpperCase();
    const colorDist=(a,b)=>0.30*(a[0]-b[0])**2+0.59*(a[1]-b[1])**2+0.11*(a[2]-b[2])**2;
    const luminance=c=>.2126*c[0]+.7152*c[1]+.0722*c[2];

    function avg(points){
      let r=0,g=0,b=0; for(const p of points){r+=p[0];g+=p[1];b+=p[2];}
      const n=Math.max(1,points.length); return [r/n,g/n,b/n];
    }
    function medianCut(pixels,count){
      const range=(pts,k)=>{let lo=255,hi=0;for(const p of pts){lo=Math.min(lo,p[k]);hi=Math.max(hi,p[k]);}return hi-lo;};
      let boxes=[pixels.slice()];
      while(boxes.length<count){
        let bi=-1,score=-1,ch=0;
        boxes.forEach((box,i)=>{
          if(box.length<2)return;
          const rs=[0,1,2].map(k=>range(box,k));
          const c=rs.indexOf(Math.max(...rs));
          const s=rs[c]*Math.sqrt(box.length);
          if(s>score){score=s;bi=i;ch=c;}
        });
        if(bi<0)break;
        const box=boxes.splice(bi,1)[0].sort((a,b)=>a[ch]-b[ch]);
        const mid=Math.floor(box.length/2);
        boxes.push(box.slice(0,mid),box.slice(mid));
      }
      return boxes.map(avg);
    }
    function refine(pixels,palette,loops=6){
      let cs=palette.map(c=>c.slice());
      for(let pass=0;pass<loops;pass++){
        const sums=cs.map(()=>[0,0,0,0]);
        for(const p of pixels){
          let bi=0,bd=Infinity;
          for(let i=0;i<cs.length;i++){
            const d=colorDist(p,cs[i]); if(d<bd){bd=d;bi=i;}
          }
          const s=sums[bi]; s[0]+=p[0];s[1]+=p[1];s[2]+=p[2];s[3]++;
        }
        cs=cs.map((c,i)=>sums[i][3]?[sums[i][0]/sums[i][3],sums[i][1]/sums[i][3],sums[i][2]/sums[i][3]]:c);
      }
      return cs;
    }

    function cropRect(img,w,h){
      const sa=img.width/img.height, da=w/h;
      let sw=img.width,sh=img.height,sx=0,sy=0;
      if(sa>da){sw=img.height*da;sx=(img.width-sw)/2;}
      else if(sa<da){sh=img.width/da;sy=(img.height-sh)/2;}
      return {sx,sy,sw,sh};
    }

    function modeSmooth(values,w,h,passes){
      let cur=new Uint16Array(values);
      for(let p=0;p<passes;p++){
        const next=new Uint16Array(cur);
        for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
          const counts=new Map();
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
            const v=cur[(y+dy)*w+x+dx];counts.set(v,(counts.get(v)||0)+1);
          }
          let best=cur[y*w+x],score=0;
          for(const [v,n] of counts){if(n>score){score=n;best=v;}}
          if(score>=5)next[y*w+x]=best;
        }
        cur=next;
      }
      return cur;
    }

    function regions(values,w,h){
      const seen=new Uint8Array(w*h),out=[],dirs=[[1,0],[-1,0],[0,1],[0,-1]];
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const s=y*w+x;if(seen[s])continue;
        const color=values[s],q=[s];seen[s]=1;let qp=0;const cells=[];let sx=0,sy=0,minX=x,maxX=x,minY=y,maxY=y;
        while(qp<q.length){
          const idx=q[qp++],cx=idx%w,cy=(idx/w)|0;cells.push(idx);sx+=cx;sy+=cy;
          minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);minY=Math.min(minY,cy);maxY=Math.max(maxY,cy);
          for(const [dx,dy] of dirs){
            const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;
            const ni=ny*w+nx;if(!seen[ni]&&values[ni]===color){seen[ni]=1;q.push(ni);}
          }
        }
        out.push({color,cells,size:cells.length,cx:sx/cells.length,cy:sy/cells.length,minX,maxX,minY,maxY});
      }
      return out;
    }

    function mergeSmall(values,w,h,minSize,passes=4){
      let cur=new Uint16Array(values),dirs=[[1,0],[-1,0],[0,1],[0,-1]];
      for(let pass=0;pass<passes;pass++){
        let changed=false;
        const rs=regions(cur,w,h).sort((a,b)=>a.size-b.size);
        for(const reg of rs){
          if(reg.size>=minSize)continue;
          const neighbors=new Map();
          for(const idx of reg.cells){
            const x=idx%w,y=(idx/w)|0;
            for(const [dx,dy] of dirs){
              const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;
              const c=cur[ny*w+nx];if(c!==reg.color)neighbors.set(c,(neighbors.get(c)||0)+1);
            }
          }
          let best=reg.color,score=0;for(const [c,n] of neighbors){if(n>score){score=n;best=c;}}
          if(best!==reg.color){for(const idx of reg.cells)cur[idx]=best;changed=true;}
        }
        if(!changed)break;
      }
      return cur;
    }

    function labelPoint(reg,w){
      const set=new Set(reg.cells),step=Math.max(1,Math.floor(Math.sqrt(reg.size)/8));
      let bx=Math.round(reg.cx),by=Math.round(reg.cy),best=-1;
      for(let y=reg.minY;y<=reg.maxY;y+=step){
        for(let x=reg.minX;x<=reg.maxX;x+=step){
          if(!set.has(y*w+x))continue;
          let d=0;
          outer: for(let r=1;r<16;r++){
            for(let dx=-r;dx<=r;dx++){
              for(const [xx,yy] of [[x+dx,y-r],[x+dx,y+r]]){if(!set.has(yy*w+xx)){d=r;break outer;}}
            }
            for(let dy=-r+1;dy<=r-1;dy++){
              for(const [xx,yy] of [[x-r,y+dy],[x+r,y+dy]]){if(!set.has(yy*w+xx)){d=r;break outer;}}
            }
            d=r;
          }
          if(d>best){best=d;bx=x;by=y;}
        }
      }
      return [bx,by];
    }

    const k=(x,y)=>`${x},${y}`;
    function loopsFor(reg,w,h){
      const cells=new Set(reg.cells),map=new Map();
      const has=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&cells.has(y*w+x);
      const add=(x1,y1,x2,y2)=>{const key=k(x1,y1);if(!map.has(key))map.set(key,[]);map.get(key).push([x2,y2]);};
      for(const idx of reg.cells){
        const x=idx%w,y=(idx/w)|0;
        if(!has(x,y-1))add(x,y,x+1,y);
        if(!has(x+1,y))add(x+1,y,x+1,y+1);
        if(!has(x,y+1))add(x+1,y+1,x,y+1);
        if(!has(x-1,y))add(x,y+1,x,y);
      }
      const loops=[];
      while(map.size){
        const start=map.keys().next().value,[sx,sy]=start.split(',').map(Number),loop=[[sx,sy]];let cur=start,guard=0;
        while(guard++<500000){
          const list=map.get(cur);if(!list?.length)break;
          const next=list.shift();if(!list.length)map.delete(cur);loop.push(next);cur=k(next[0],next[1]);if(cur===start)break;
        }
        if(loop.length>5)loops.push(loop);
      }
      return loops;
    }

    function pld(p,a,b){
      const dx=b[0]-a[0],dy=b[1]-a[1];if(!dx&&!dy)return Math.hypot(p[0]-a[0],p[1]-a[1]);
      const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
      return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));
    }
    function simplify(points,tol){
      let pts=points.slice();if(pts.length>1&&k(...pts[0])===k(...pts[pts.length-1]))pts.pop();
      function rdp(arr){
        if(arr.length<=2)return arr;let max=0,idx=0;
        for(let i=1;i<arr.length-1;i++){const d=pld(arr[i],arr[0],arr[arr.length-1]);if(d>max){max=d;idx=i;}}
        if(max>tol){const l=rdp(arr.slice(0,idx+1)),r=rdp(arr.slice(idx));return l.slice(0,-1).concat(r);}return [arr[0],arr[arr.length-1]];
      }
      const out=rdp(pts);if(out.length>2)out.push(out[0]);return out;
    }
    function chaikin(points,passes=2){
      let pts=points.slice();if(pts.length>1&&k(...pts[0])===k(...pts[pts.length-1]))pts.pop();
      for(let p=0;p<passes;p++){
        const next=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];next.push([.75*a[0]+.25*b[0],.75*a[1]+.25*b[1]],[.25*a[0]+.75*b[0],.25*a[1]+.75*b[1]]);}pts=next;
      }
      if(pts.length)pts.push(pts[0]);return pts;
    }

    function makeEditorialModel(img){
      const longSide=complexity?.value==='high'?420:complexity?.value==='low'?250:330;
      const aspect=img.width/img.height;
      let w,h;if(aspect>=1){w=longSide;h=Math.max(100,Math.round(longSide/aspect));}else{h=longSide;w=Math.max(100,Math.round(longSide*aspect));}
      const c=document.createElement('canvas');c.width=w;c.height=h;
      const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
      x.filter=complexity?.value==='high'?'blur(.6px) saturate(.96)':'blur(1.1px) saturate(.94)';
      const cr=cropRect(img,w,h);x.drawImage(img,cr.sx,cr.sy,cr.sw,cr.sh,0,0,w,h);x.filter='none';
      const raw=x.getImageData(0,0,w,h).data,px=[],sample=[];
      for(let i=0;i<raw.length;i+=4){const p=[raw[i],raw[i+1],raw[i+2]];px.push(p);if((i/4)%5===0)sample.push(p);}
      const count=+colors.value;
      const palette=refine(sample,medianCut(sample,count),6).sort((a,b)=>luminance(a)-luminance(b));
      let assignments=new Uint16Array(px.length);
      for(let n=0;n<px.length;n++){
        let bi=0,bd=Infinity;for(let i=0;i<palette.length;i++){const d=colorDist(px[n],palette[i]);if(d<bd){bd=d;bi=i;}}assignments[n]=bi;
      }
      assignments=modeSmooth(assignments,w,h,complexity?.value==='high'?1:2);
      const area=w*h;
      const minSize=merge?.value==='strong'?Math.max(34,Math.round(area*0.00052)):Math.max(20,Math.round(area*0.00030));
      assignments=mergeSmall(assignments,w,h,minSize,4);
      const rs=regions(assignments,w,h);for(const r of rs)r.label=labelPoint(r,w);
      return {w,h,palette,regions:rs};
    }

    function codeFor(i){
      if(codeMode?.value==='letters' && i>=9)return String.fromCharCode(65+(i-9)%26);
      return String(i+1);
    }

    function drawEditorial(numbered){
      if(!editorialModel)return;
      const {w,h,palette,regions:rs}=editorialModel;
      const pageW=1240,pageH=1754;canvas.width=pageW;canvas.height=pageH;
      ctx.fillStyle='#fff';ctx.fillRect(0,0,pageW,pageH);
      const margin=58,legendH=150,artTop=46,artBottom=pageH-legendH-30;
      const availW=pageW-margin*2,availH=artBottom-artTop,scale=Math.min(availW/w,availH/h);
      const ox=(pageW-w*scale)/2,oy=artTop+(availH-h*scale)/2;
      ctx.strokeStyle='#cac7c2';ctx.lineWidth=1.2;ctx.strokeRect(ox-2,oy-2,w*scale+4,h*scale+4);

      if(guideGrid?.value==='on'){
        ctx.save();ctx.strokeStyle='rgba(170,170,170,.16)';ctx.lineWidth=.6;
        const step=Math.max(70,Math.round(scale*28));
        for(let x=ox+step;x<ox+w*scale;x+=step){ctx.beginPath();ctx.moveTo(x,oy);ctx.lineTo(x,oy+h*scale);ctx.stroke();}
        for(let y=oy+step;y<oy+h*scale;y+=step){ctx.beginPath();ctx.moveTo(ox,y);ctx.lineTo(ox+w*scale,y);ctx.stroke();}
        ctx.restore();
      }

      const strokeMap={light:'#b9b6b1',medium:'#8e8a85',dark:'#55514d'};
      ctx.strokeStyle=strokeMap[strokeColor?.value||'light'];
      ctx.lineWidth=(strokeWidth?.value||'fine')==='fine'?1.05:1.65;ctx.lineCap='round';ctx.lineJoin='round';
      const sorted=rs.slice().sort((a,b)=>b.size-a.size);
      for(const reg of sorted){
        if(reg.size<12)continue;
        for(const raw of loopsFor(reg,w,h)){
          const tol=complexity?.value==='high'?.45:complexity?.value==='low'?1.25:.75;
          const curve=chaikin(simplify(raw,tol),2);if(curve.length<5)continue;
          ctx.beginPath();ctx.moveTo(ox+curve[0][0]*scale,oy+curve[0][1]*scale);
          for(let i=1;i<curve.length;i++)ctx.lineTo(ox+curve[i][0]*scale,oy+curve[i][1]*scale);
          ctx.closePath();ctx.stroke();
        }
      }

      let labelCount=0;
      if(numbered){
        ctx.textAlign='center';ctx.textBaseline='middle';
        const minLabel=merge?.value==='strong'?Math.max(54,Math.round(w*h*0.00066)):Math.max(36,Math.round(w*h*0.00042));
        for(const reg of sorted){
          if(reg.size<minLabel)continue;
          const [lx,ly]=reg.label,text=codeFor(reg.color),fs=Math.max(7,Math.min(14,Math.sqrt(reg.size)*.32));
          ctx.font=`500 ${fs}px Arial`;ctx.fillStyle=strokeMap[strokeColor?.value||'light'];
          ctx.fillText(text,ox+(lx+.5)*scale,oy+(ly+.5)*scale);labelCount++;
        }
      }

      const gap=10,itemW=Math.floor((pageW-margin*2-(palette.length-1)*gap)/palette.length),y0=pageH-112;
      ctx.textAlign='center';ctx.textBaseline='middle';
      for(let i=0;i<palette.length;i++){
        const x0=margin+i*(itemW+gap);ctx.fillStyle=hex(palette[i]);ctx.fillRect(x0,y0,itemW,48);
        ctx.strokeStyle='#c7c2bc';ctx.lineWidth=1;ctx.strokeRect(x0,y0,itemW,48);
        ctx.fillStyle=luminance(palette[i])<120?'#fff':'#2f2b27';ctx.font='700 18px Arial';ctx.fillText(codeFor(i),x0+itemW/2,y0+24);
      }
      ctx.fillStyle='#77716b';ctx.font='14px Arial';ctx.textAlign='left';ctx.fillText('Lion Dynasty — Mode Éditorial V5',margin,pageH-32);
      info.textContent=`Mode Éditorial V5 • ${palette.length} couleurs • ${rs.length} zones${numbered?` • ${labelCount} codes`:''} • ${w}×${h}`;
      legend.innerHTML=palette.map((c,i)=>`<div class="swatch"><div class="swatch-color" style="background:${hex(c)}"></div><small>${codeFor(i)}<br>${hex(c)}</small></div>`).join('');
    }

    function regenerate(){
      if(!image)return;
      const token=++busyToken,editorial=mode.value.startsWith('editorial');
      info.textContent=editorial?'Création de la page éditoriale…':'Utilise le Mode Éditorial V5 pour le nouveau rendu.';
      setTimeout(()=>{
        if(token!==busyToken)return;
        try{
          if(editorial){editorialModel=makeEditorialModel(image);drawEditorial(mode.value==='editorial-numbered');}
        }catch(err){console.error(err);info.textContent='La génération a échoué. Essaie une complexité plus faible.';}
      },30);
    }

    function toggle(){
      const editorial=mode.value.startsWith('editorial');
      if(controls)controls.hidden=!editorial;
      const gridLabel=grid.closest('label');if(gridLabel)gridLabel.style.display=editorial?'none':'';
    }

    upload.addEventListener('change',e=>{
      const file=e.target.files[0];if(!file)return;
      const r=new FileReader();r.onload=ev=>{const im=new Image();im.onload=()=>{image=im;regenerate();};im.src=ev.target.result;};r.readAsDataURL(file);
    });
    mode.addEventListener('change',()=>{toggle();regenerate();});
    colors.addEventListener('change',regenerate);
    [complexity,merge,strokeWidth,strokeColor,codeMode,guideGrid].forEach(el=>el?.addEventListener('change',regenerate));

    download?.addEventListener('click',()=>{
      if(!image)return;const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='lion-dynasty-editorial-v5.png';a.click();
    });
    printBtn?.addEventListener('click',()=>{
      if(!image)return;const data=canvas.toDataURL('image/png'),w=window.open('','_blank');
      w.document.write(`<title>Lion Dynasty — Coloriage Mystère V5</title><style>@page{size:A4 portrait;margin:8mm}body{margin:0;text-align:center}img{width:100%;max-height:96vh;object-fit:contain}</style><img src="${data}"><script>onload=()=>setTimeout(()=>print(),180)<\/script>`);w.document.close();
    });

    toggle();
    info.textContent='Importe une photo pour créer une page de coloriage éditoriale V5.';
  }

  wait();
})();

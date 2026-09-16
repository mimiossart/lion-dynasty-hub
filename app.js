(async () => {
  if (!document.getElementById("resendConfirmation")) {
    const hiddenResend = document.createElement("button");
    hiddenResend.id = "resendConfirmation";
    hiddenResend.type = "button";
    hiddenResend.hidden = true;
    document.body.appendChild(hiddenResend);
  }

  const files = ["app.part1.txt","app.part2.txt","app.part3.txt","app.part4.txt","app.part5.txt"];
  const parts = await Promise.all(files.map(async file => {
    const response = await fetch(file, { cache: "no-store" });
    if (!response.ok) throw new Error(`Impossible de charger ${file}`);
    return response.text();
  }));

  let source = parts.join("");

  // Haute fidélité portrait : davantage de détails et davantage de couleurs.
  const pixelModelPattern = /function makePixelModel\(img\) \{[\s\S]*?return \{cols,rows,palette,assignments\};\n\}/;
  const improvedPixelModel = `function clampPixel(v,min=0,max=255){return Math.max(min,Math.min(max,v));}
function enhancePixelColor(p){
  let [r,g,b]=p;
  const gray=(r+g+b)/3;
  const contrast=1.10;
  r=clampPixel((r-128)*contrast+128);
  g=clampPixel((g-128)*contrast+128);
  b=clampPixel((b-128)*contrast+128);
  const sat=1.14;
  r=clampPixel(gray+(r-gray)*sat);
  g=clampPixel(gray+(g-gray)*sat);
  b=clampPixel(gray+(b-gray)*sat);
  return [Math.round(r),Math.round(g),Math.round(b)];
}
function getPixelCrop(img,cols,rows){
  const srcAspect=img.width/img.height;
  const destAspect=cols/rows;
  let sw=img.width,sh=img.height,sx=0,sy=0;
  if(srcAspect>destAspect){sw=img.height*destAspect;sx=(img.width-sw)/2;}
  else if(srcAspect<destAspect){sh=img.width/destAspect;sy=(img.height-sh)/2;}
  const zoom=img.height>img.width?1.10:1.04;
  const zw=sw/zoom,zh=sh/zoom;
  sx+=(sw-zw)/2;sy+=(sh-zh)/2;sw=zw;sh=zh;
  return {sx,sy,sw,sh};
}
function makePixelModel(img) {
  const target=+document.getElementById("gridSize").value;
  const count=+document.getElementById("colorCount").value;
  const aspect=img.width/img.height;
  let cols,rows;
  if(aspect>=1){cols=target;rows=Math.max(1,Math.round(target/aspect));}
  else{rows=target;cols=Math.max(1,Math.round(target*aspect));}
  const temp=document.createElement("canvas");temp.width=cols;temp.height=rows;
  const t=temp.getContext("2d",{willReadFrequently:true});
  t.imageSmoothingEnabled=true;
  t.imageSmoothingQuality="high";
  const crop=getPixelCrop(img,cols,rows);
  t.drawImage(img,crop.sx,crop.sy,crop.sw,crop.sh,0,0,cols,rows);
  const raw=t.getImageData(0,0,cols,rows).data;
  const pixels=[];
  for(let i=0;i<raw.length;i+=4)pixels.push(enhancePixelColor([raw[i],raw[i+1],raw[i+2]]));
  let palette=refine(pixels,medianCut(pixels,count),10).sort((a,b)=>lum(a)-lum(b));
  const assignments=pixels.map(p=>{
    let bi=0,bd=Infinity;
    palette.forEach((c,i)=>{const d=colorDistance(p,c);if(d<bd){bd=d;bi=i;}});
    return bi;
  });
  return {cols,rows,palette,assignments};
}`;

  if (pixelModelPattern.test(source)) {
    source = source.replace(pixelModelPattern, improvedPixelModel);
  } else {
    console.warn("Lion Dynasty: ancien moteur Pixel Art introuvable, moteur d'origine conservé.");
  }

  // Nouveau rendu : dessin en contours noirs, sans grille de carrés, avec zones numérotées.
  const renderPixelPattern = /function renderPixel\(\) \{[\s\S]*?\n\}(?=\nfunction regenPixel\(\))/;
  const improvedRenderPixel = `function pixelRegionAt(assignments,cols,x,y){return assignments[y*cols+x];}
function computePixelRegions(cols,rows,assignments){
  const seen=new Uint8Array(cols*rows);
  const regions=[];
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const start=y*cols+x;
    if(seen[start])continue;
    const colorIndex=assignments[start];
    const stack=[start];
    seen[start]=1;
    let size=0,sumX=0,sumY=0;
    while(stack.length){
      const idx=stack.pop();
      const cx=idx%cols,cy=Math.floor(idx/cols);
      size++;sumX+=cx;sumY+=cy;
      for(const [dx,dy] of dirs){
        const nx=cx+dx,ny=cy+dy;
        if(nx<0||ny<0||nx>=cols||ny>=rows)continue;
        const nidx=ny*cols+nx;
        if(!seen[nidx]&&assignments[nidx]===colorIndex){seen[nidx]=1;stack.push(nidx);}
      }
    }
    regions.push({colorIndex,size,cx:sumX/size,cy:sumY/size});
  }
  return regions;
}
function drawLineArt(cols,rows,palette,assignments,cell,numbered){
  pixelCanvas.width=cols*cell;pixelCanvas.height=rows*cell;
  pctx.fillStyle="#fff";pctx.fillRect(0,0,pixelCanvas.width,pixelCanvas.height);
  pctx.strokeStyle="#201711";
  pctx.lineWidth=Math.max(1.15,cell*.095);
  pctx.lineCap="round";pctx.lineJoin="round";
  pctx.beginPath();
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const cur=pixelRegionAt(assignments,cols,x,y);
    const x0=x*cell,y0=y*cell,x1=x0+cell,y1=y0+cell;
    if(x===0){pctx.moveTo(x0,y0);pctx.lineTo(x0,y1);}
    if(y===0){pctx.moveTo(x0,y0);pctx.lineTo(x1,y0);}
    if(x===cols-1||pixelRegionAt(assignments,cols,x+1,y)!==cur){pctx.moveTo(x1,y0);pctx.lineTo(x1,y1);}
    if(y===rows-1||pixelRegionAt(assignments,cols,x,y+1)!==cur){pctx.moveTo(x0,y1);pctx.lineTo(x1,y1);}
  }
  pctx.stroke();
  if(numbered){
    const regions=computePixelRegions(cols,rows,assignments);
    pctx.textAlign="center";pctx.textBaseline="middle";
    for(const region of regions){
      if(region.size<3)continue;
      const fontSize=Math.max(8,Math.min(cell*.56,Math.sqrt(region.size)*cell*.24));
      const label=String(region.colorIndex+1);
      const px=(region.cx+.5)*cell,py=(region.cy+.5)*cell;
      pctx.font="700 "+fontSize+"px system-ui";
      const tw=pctx.measureText(label).width;
      pctx.fillStyle="rgba(255,255,255,.94)";
      pctx.fillRect(px-tw/2-2,py-fontSize*.48,tw+4,fontSize*.96);
      pctx.fillStyle="#2b211a";
      pctx.fillText(label,px,py);
    }
  }
}
function renderPixel() {
  if(!pixelModel)return drawPixelPlaceholder();
  const {cols,rows,palette,assignments}=pixelModel;
  const mode=document.getElementById("pixelMode").value;
  const cell=Math.max(10,Math.floor(920/Math.max(cols,rows)));
  if(mode==="line-numbered"||mode==="line-only"){
    drawLineArt(cols,rows,palette,assignments,cell,mode==="line-numbered");
  } else {
    pixelCanvas.width=cols*cell;pixelCanvas.height=rows*cell;
    pctx.textAlign="center";pctx.textBaseline="middle";
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      const idx=y*cols+x,p=assignments[idx],c=palette[p];
      pctx.fillStyle=mode==="color"?hex(c):"#fff";pctx.fillRect(x*cell,y*cell,cell,cell);
      pctx.strokeStyle="rgba(45,34,25,.28)";pctx.strokeRect(x*cell+.5,y*cell+.5,cell,cell);
      if(mode==="mystery"){pctx.fillStyle="#2b211a";pctx.font="700 "+Math.max(7,Math.floor(cell*.45))+"px system-ui";pctx.fillText(String(p+1),x*cell+cell/2,y*cell+cell/2);}
    }
  }
  document.getElementById("pixelLegend").innerHTML=palette.map((c,i)=>"<div class=\"swatch\"><div class=\"swatch-color\" style=\"background:"+hex(c)+"\"></div><small>N° "+(i+1)+"<br>"+hex(c)+"</small></div>").join("");
  const infos={
    mystery:cols+" × "+rows+" cases • "+palette.length+" couleurs • grille mystère numérotée",
    color:cols+" × "+rows+" cases • "+palette.length+" couleurs • aperçu couleur",
    "line-numbered":palette.length+" couleurs • dessin sans carrés • zones numérotées",
    "line-only":palette.length+" couleurs • dessin en contours noirs"
  };
  document.getElementById("pixelInfo").textContent=infos[mode]||(cols+" × "+rows+" • "+palette.length+" couleurs");
}`;

  if (renderPixelPattern.test(source)) {
    source = source.replace(renderPixelPattern, improvedRenderPixel);
  } else {
    console.warn("Lion Dynasty: moteur de rendu Pixel Art introuvable, rendu d'origine conservé.");
  }

  // Impression et téléchargement adaptés au nouveau mode dessin.
  source = source.replace(
    'const a=document.createElement("a");a.href=pixelCanvas.toDataURL("image/png");a.download="lion-dynasty-grille.png";a.click();',
    'const a=document.createElement("a");a.href=pixelCanvas.toDataURL("image/png");const mode=document.getElementById("pixelMode").value;a.download=mode.startsWith("line")?"lion-dynasty-dessin.png":"lion-dynasty-grille.png";a.click();'
  );
  source = source.replace(
    'document.getElementById("pixelMode").value="mystery";renderPixel();',
    'if(old==="color") document.getElementById("pixelMode").value="line-numbered";renderPixel();'
  );

  (0, eval)(source);

  // Options haute fidélité pour les portraits.
  const gridSize = document.getElementById("gridSize");
  if (gridSize) {
    gridSize.innerHTML = `
      <option value="24">24 cases — simple</option>
      <option value="32">32 cases — équilibré</option>
      <option value="48">48 cases — détaillé</option>
      <option value="64" selected>64 cases — portrait précis</option>
      <option value="80">80 cases — très détaillé</option>`;
    gridSize.value = "64";
  }

  const colorCount = document.getElementById("colorCount");
  if (colorCount) {
    colorCount.innerHTML = `
      <option value="4">4 couleurs</option>
      <option value="6">6 couleurs</option>
      <option value="8">8 couleurs</option>
      <option value="10">10 couleurs</option>
      <option value="12" selected>12 couleurs</option>
      <option value="16">16 couleurs</option>`;
    colorCount.value = "12";
  }

  const modeSelect = document.getElementById("pixelMode");
  if (modeSelect) {
    modeSelect.innerHTML = `
      <option value="mystery">Grille mystère numérotée</option>
      <option value="line-numbered" selected>Dessin sans carrés — zones numérotées</option>
      <option value="line-only">Dessin sans carrés — contours seuls</option>
      <option value="color">Aperçu couleur</option>`;
    modeSelect.value = "line-numbered";
  }

  const upload = document.getElementById("pixelUpload");
  const pixelCard = upload?.closest(".card");
  const intro = pixelCard?.querySelector("p");
  if (intro) intro.textContent = "Importe une photo et transforme-la en vrai dessin de coloriage : contours noirs, sans grille de carrés, avec zones numérotées. Jusqu’à 16 couleurs.";
})().catch(error => {
  console.error("Lion Dynasty app loading error", error);
  const toast = document.getElementById("toast");
  if (toast) {
    toast.textContent = "Le site n’a pas pu se charger. Recharge la page.";
    toast.classList.add("show");
  }
});

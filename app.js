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

  // Amélioration du Pixel Art Converter : davantage de détails, meilleur cadrage
  // des portraits et davantage de couleurs, sans modifier le reste de l'application.
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

  source = source.replace(
    'document.getElementById("pixelInfo").textContent=`${cols} × ${rows} cases • ${palette.length} couleurs • proportions conservées`;',
    'document.getElementById("pixelInfo").textContent=`${cols} × ${rows} cases • ${palette.length} couleurs • cadrage optimisé pour mieux faire ressortir le sujet`;'
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

  const upload = document.getElementById("pixelUpload");
  const pixelCard = upload?.closest(".card");
  const intro = pixelCard?.querySelector("p");
  if (intro) intro.textContent = "Importe une photo : le mode portrait conserve davantage de détails du visage et propose jusqu’à 16 couleurs.";
})().catch(error => {
  console.error("Lion Dynasty app loading error", error);
  const toast = document.getElementById("toast");
  if (toast) {
    toast.textContent = "Le site n’a pas pu se charger. Recharge la page.";
    toast.classList.add("show");
  }
});

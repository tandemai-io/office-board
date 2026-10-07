import {characterFor,COLORS,validateGrid} from './board';

export const TILE_WIDTH=12,TILE_HEIGHT=16,IMAGE_WIDTH=22*TILE_WIDTH,IMAGE_HEIGHT=6*TILE_HEIGHT;
export type ImageStyle='colors'|'mixed'|'characters';
export type ImageFit='contain'|'cover';
export type ImageBackground='auto'|'black'|'white';
export type TileTemplate={code:number;pixels:Uint8ClampedArray};
export const IMAGE_FILE_TYPES=['image/png','image/jpeg','image/webp','image/svg+xml'];
export function validateImageFile(file:{type:string;size:number;name?:string}){
 const extension=file.name?.split('.').pop()?.toLowerCase();
 const inferred=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml'} as Record<string,string>)[extension||''];
 const type=(!file.type||file.type==='application/octet-stream')?inferred:file.type;
 if(!IMAGE_FILE_TYPES.includes(type))throw new Error('Choose an SVG, PNG, JPG or WebP image.');
 if(file.size>10*1024*1024)throw new Error('Choose an image smaller than 10 MB.');
 if(file.size===0)throw new Error('This image is empty. Choose another file.');
 return type;
}
export function imagePlacement(width:number,height:number,fit:ImageFit,zoom=1){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('This image has no usable dimensions.');
 const scale=(fit==='cover'?Math.max:Math.min)(IMAGE_WIDTH/width,IMAGE_HEIGHT/height)*zoom;
 return {x:(IMAGE_WIDTH-width*scale)/2,y:(IMAGE_HEIGHT-height*scale)/2,width:width*scale,height:height*scale};
}
const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const background=rgb('#252729');
export function colorTemplates():TileTemplate[]{return COLORS.filter(c=>c.code===0||c.code>=63).map(c=>{
 const pixels=new Uint8ClampedArray(TILE_WIDTH*TILE_HEIGHT*4),color=c.code===0?background:rgb(c.hex);
 for(let i=0;i<pixels.length;i+=4){pixels.set(color,i);pixels[i+3]=255;}return {code:c.code,pixels};
});}
export function glyphTemplates():TileTemplate[]{
 const canvas=document.createElement('canvas');canvas.width=TILE_WIDTH;canvas.height=TILE_HEIGHT;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Image conversion is unavailable in this browser.');
 const templates:TileTemplate[]=[];
 for(let code=1;code<=62;code++){
  const glyph=characterFor(code);if(!glyph.trim())continue;
  ctx.fillStyle='#252729';ctx.fillRect(0,0,TILE_WIDTH,TILE_HEIGHT);
  ctx.font='bold 11.5px "Courier New", monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ecebe7';
  ctx.fillText(glyph,TILE_WIDTH/2,TILE_HEIGHT/2+.5);
  templates.push({code,pixels:ctx.getImageData(0,0,TILE_WIDTH,TILE_HEIGHT).data});
 }
 return templates;
}
// Match each image patch against the flaps the physical board can display.
// Glyphs are white on dark; no colored letter/background combinations are invented.
export function pixelsToBoard(pixels:Uint8ClampedArray,style:ImageStyle,templates:TileTemplate[],contrast=1):number[][]{
 if(pixels.length!==IMAGE_WIDTH*IMAGE_HEIGHT*4)throw new Error('The conversion image has the wrong dimensions.');
 const colors=colorTemplates(),glyphs=templates.filter(t=>t.code>0&&t.code<63);
 const candidates=style==='colors'?colors:style==='characters'?[colors[0],...glyphs]:[...colors,...glyphs];
 if(!candidates.length||candidates.some(t=>t.pixels.length!==TILE_WIDTH*TILE_HEIGHT*4))throw new Error('The character templates are incomplete.');
 const grid=Array.from({length:6},()=>Array<number>(22).fill(0)),patch=new Float64Array(TILE_WIDTH*TILE_HEIGHT*3);
 for(let row=0;row<6;row++)for(let col=0;col<22;col++){
  let at=0,chroma=0;
  for(let y=0;y<TILE_HEIGHT;y++)for(let x=0;x<TILE_WIDTH;x++){
   const index=((row*TILE_HEIGHT+y)*IMAGE_WIDTH+col*TILE_WIDTH+x)*4,alpha=pixels[index+3]/255;
   for(let channel=0;channel<3;channel++)patch[at++]=Math.max(0,Math.min(255,(pixels[index+channel]*alpha+background[channel]*(1-alpha)-128)*contrast+128));
   chroma+=Math.max(patch[at-1],patch[at-2],patch[at-3])-Math.min(patch[at-1],patch[at-2],patch[at-3]);
  }
  if(style==='colors'){
   // Vote for colors actually present in the cell. Averaging across a sharp
   // yellow/blue boundary otherwise invents a gray, green or violet stripe.
   const votes=new Array<number>(colors.length).fill(0);
   for(let i=0;i<patch.length;i+=3){
    const neutral=Math.max(patch[i],patch[i+1],patch[i+2])-Math.min(patch[i],patch[i+1],patch[i+2])<16;
    let nearest=0,distance=Infinity;
    colors.forEach((color,index)=>{
     if(neutral&&color.code>=63&&color.code<=68)return;
     const dr=patch[i]-color.pixels[0],dg=patch[i+1]-color.pixels[1],db=patch[i+2]-color.pixels[2],cost=dr*dr+dg*dg+db*db;
     if(cost<distance){nearest=index;distance=cost;}
    });
    votes[nearest]++;
   }
   grid[row][col]=colors[votes.indexOf(Math.max(...votes))].code;
   continue;
  }
  let best=Infinity,code=0;
  for(const template of candidates){
   // Preserve neutral artwork: a gray edge should not become a purple or green
   // flap just because that hue is closer than solid white in RGB distance.
   if(template.code>=63&&template.code<=68&&chroma/(TILE_WIDTH*TILE_HEIGHT)<16)continue;
   let cost=0;
   // Equal channel weights preserve color: luminance weights made saturated
   // blue closer to black than the physical blue flap.
   for(let i=0,j=0;i<patch.length;i+=3,j+=4){const dr=patch[i]-template.pixels[j],dg=patch[i+1]-template.pixels[j+1],db=patch[i+2]-template.pixels[j+2];cost+=dr*dr+dg*dg+db*db;}
   // Mixed mode favors coherent solid color unless a glyph improves the match.
   if(style==='mixed'&&template.code>0&&template.code<63)cost*=1.18;
   if(cost<best){best=cost;code=template.code;}
  }
  grid[row][col]=code;
 }
 return validateGrid(grid);
}
export function chooseImageBackground(pixels:Uint8ClampedArray,hasTransparentMargin=false):'black'|'white'{
 let alpha=0,light=0,transparent=hasTransparentMargin;
 for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3]/255;alpha+=a;light+=(.30*pixels[i]+.59*pixels[i+1]+.11*pixels[i+2])*a;if(a<.98)transparent=true;}
 return transparent&&alpha>0&&light/alpha<128?'white':'black';
}
export function contentBounds(pixels:Uint8ClampedArray,width:number,height:number){
 let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>16){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<0)throw new Error('This image is fully transparent. Choose an image with visible artwork.');
 return {x:left,y:top,width:right-left+1,height:bottom-top+1};
}
export function convertImage(image:HTMLCanvasElement,fit:ImageFit,style:ImageStyle,contrast:number,background:ImageBackground='auto',trim=true,zoom=1):number[][]{
 const canvas=document.createElement('canvas');canvas.width=IMAGE_WIDTH;canvas.height=IMAGE_HEIGHT;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Image conversion is unavailable in this browser.');
 const sourceCtx=image.getContext('2d',{willReadFrequently:true});if(!sourceCtx)throw new Error('Image conversion is unavailable in this browser.');
 const bounds=contentBounds(sourceCtx.getImageData(0,0,image.width,image.height).data,image.width,image.height);
 const crop=trim?bounds:{x:0,y:0,width:image.width,height:image.height};
 if(background==='auto'){ctx.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,32,32);background=chooseImageBackground(ctx.getImageData(0,0,32,32).data,bounds.width<image.width||bounds.height<image.height);ctx.clearRect(0,0,IMAGE_WIDTH,IMAGE_HEIGHT);}
 ctx.fillStyle=background==='white'?'#fbfbfb':'#252729';ctx.fillRect(0,0,IMAGE_WIDTH,IMAGE_HEIGHT);
 const placement=imagePlacement(crop.width,crop.height,fit,zoom);
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.drawImage(image,crop.x,crop.y,crop.width,crop.height,placement.x,placement.y,placement.width,placement.height);
 return pixelsToBoard(ctx.getImageData(0,0,IMAGE_WIDTH,IMAGE_HEIGHT).data,style,style==='colors'?[]:glyphTemplates(),contrast);
}

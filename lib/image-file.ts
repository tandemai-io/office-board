import {validateImageFile} from './image-to-board';

const MAX_EDGE=2048;
export type LoadedImage={canvas:HTMLCanvasElement;url:string;name:string};
export function svgSize(viewBox:string|null,width:string|null,height:string|null){
 const box=(viewBox||'').trim().split(/[\s,]+/).map(Number);
 const dimension=(value:string|null)=>value&&/^\d*\.?\d+(?:px)?$/.test(value.trim())?parseFloat(value):0;
 let w=dimension(width),h=dimension(height);
 const validBox=box.length===4&&box.every(Number.isFinite)&&box[2]>0&&box[3]>0;
 if(validBox){if(!w&&!h){w=box[2];h=box[3];}else if(!w)w=h*box[2]/box[3];else if(!h)h=w*box[3]/box[2];}
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw new Error('This SVG needs a viewBox or both width and height. Try exporting it again.');
 const scale=MAX_EDGE/Math.max(w,h);
 return {width:Math.max(1,Math.round(w*scale)),height:Math.max(1,Math.round(h*scale))};
}
export function normalizeSvg(text:string){
 const xml=new DOMParser().parseFromString(text,'image/svg+xml'),root=xml.documentElement;
 if(xml.querySelector('parsererror')||root.localName!=='svg')throw new Error('This SVG could not be opened. Try exporting it again.');
 const size=svgSize(root.getAttribute('viewBox'),root.getAttribute('width'),root.getAttribute('height'));
 // Keep the declared coordinate system when only explicit dimensions are supplied.
 if(!root.hasAttribute('viewBox'))root.setAttribute('viewBox',`0 0 ${parseFloat(root.getAttribute('width')!)} ${parseFloat(root.getAttribute('height')!)}`);
 root.setAttribute('xmlns','http://www.w3.org/2000/svg');
 root.setAttribute('width',String(size.width));root.setAttribute('height',String(size.height));
 // Render only in an image context, never insert uploaded markup into the page.
 return new Blob([new XMLSerializer().serializeToString(root)],{type:'image/svg+xml'});
}
export async function loadImageFile(file:File):Promise<LoadedImage>{
 const type=validateImageFile(file);
 const blob=type==='image/svg+xml'?normalizeSvg(await file.text()):file;
 const url=URL.createObjectURL(blob),image=new Image();
 try{
  image.src=url;await image.decode();
  const w=image.naturalWidth,h=image.naturalHeight;
  if(!w||!h)throw new Error('This image has no usable dimensions.');
  if(w*h>60_000_000)throw new Error('Choose an image under 60 megapixels.');
  const scale=Math.min(1,MAX_EDGE/Math.max(w,h)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image conversion is unavailable in this browser.');
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return {canvas,url,name:file.name};
 }catch(error){URL.revokeObjectURL(url);if(error instanceof Error&&error.name!=='EncodingError')throw error;throw new Error('This image could not be opened. Try exporting it as a PNG or SVG again.');}
 finally{image.src='';}
}

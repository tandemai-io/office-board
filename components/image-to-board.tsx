"use client";
import {useEffect,useRef,useState} from 'react';
import {ImagePlus,Upload} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import BoardPreview from './board-preview';
import {convertImage,type ImageFit,type ImageStyle,type ImageBackground} from '@/lib/image-to-board';
import {loadImageFile,type LoadedImage} from '@/lib/image-file';

export default function ImageToBoard({open,onOpenChange,onApply,droppedFile}:{open:boolean;onOpenChange:(value:boolean)=>void;onApply:(grid:number[][])=>void;droppedFile?:File}){
 const [source,setSource]=useState<(LoadedImage&{generation:number})|null>(null);
 const [fit,setFit]=useState<ImageFit>('contain'),[style,setStyle]=useState<ImageStyle>('colors'),[contrast,setContrast]=useState(1);
 const [background,setBackground]=useState<ImageBackground>('auto');
 const [trim,setTrim]=useState(true),[zoom,setZoom]=useState(1);
 const [grid,setGrid]=useState<number[][]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dragging,setDragging]=useState(false);
 const fileInput=useRef<HTMLInputElement>(null),generation=useRef(0),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;generation.current++;};},[]);
 useEffect(()=>()=>{if(source)URL.revokeObjectURL(source.url);},[source]);
 useEffect(()=>{if(droppedFile)void read(droppedFile);},[droppedFile]);
 useEffect(()=>{
  if(!source||source.generation!==generation.current)return;
  setBusy(true);setGrid(null);const request=generation.current;
  const timer=setTimeout(()=>{if(request!==generation.current||!active.current)return;try{setGrid(convertImage(source.canvas,fit,style,contrast,background,trim,zoom));setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}},0);
  return()=>clearTimeout(timer);
 },[source,fit,style,contrast,background,trim,zoom]);
 async function read(file?:File){
  if(!file)return;const request=++generation.current;setBusy(true);setError('');setGrid(null);setSource(null);
  let loaded:LoadedImage|null=null;
  try{
   loaded=await loadImageFile(file);
   if(!active.current||request!==generation.current){URL.revokeObjectURL(loaded.url);return;}
   setZoom(1);setSource({...loaded,generation:request});loaded=null;
  }catch(e){if(loaded)URL.revokeObjectURL(loaded.url);if(active.current&&request===generation.current){setError(e instanceof Error?e.message:'This image could not be opened. Try a PNG or SVG.');setBusy(false);}}
 }
 function apply(){if(!grid||busy)return;onApply(grid);onOpenChange(false);}
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="image-dialog"><DialogHeader><DialogTitle>Image to board</DialogTitle><DialogDescription>Recreate a picture with 132 flaps. Simple logos and bold shapes work best. Your image stays in this browser.</DialogDescription></DialogHeader>
  <input ref={fileInput} type="file" accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose an image" onChange={e=>{void read(e.target.files?.[0]);e.target.value='';}}/>
  <button type="button" className={`image-drop ${dragging?'dragging':''}`} onClick={()=>fileInput.current?.click()} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();e.stopPropagation();setDragging(false);void read(e.dataTransfer.files?.[0]);}}>
   {source?<img src={source.url} alt="Original uploaded image" className="image-original"/>:<ImagePlus size={30}/>}
   <span><strong>{source?source.name:'Drop an image here'}</strong><span>{source?'Click or drop to replace':'or choose a file · SVG, PNG, JPG, WebP · up to 10 MB'}</span></span><Upload size={18}/>
  </button>
  <div className="image-controls"><label>Style<select disabled={busy} aria-label="Image conversion style" value={style} onChange={e=>setStyle(e.target.value as ImageStyle)}><option value="colors">Colors only</option><option value="mixed">Colors + characters</option><option value="characters">Characters only</option></select></label><label>Framing<select disabled={busy} aria-label="Image framing" value={fit} onChange={e=>setFit(e.target.value as ImageFit)}><option value="contain">Fit whole image</option><option value="cover">Fill and crop</option></select></label><label>Background<select disabled={busy} aria-label="Image background" value={background} onChange={e=>setBackground(e.target.value as ImageBackground)}><option value="auto">Auto</option><option value="black">Black</option><option value="white">White</option></select></label><label>Contrast <span>{contrast.toFixed(1)}×</span><input disabled={busy} aria-label="Image contrast" type="range" min="0.6" max="2" step="0.1" value={contrast} onChange={e=>setContrast(Number(e.target.value))}/></label></div>
  <div className="image-adjustments"><label className="image-trim"><input type="checkbox" checked={trim} disabled={busy} onChange={e=>setTrim(e.target.checked)}/>Trim transparent margins</label><label>Size <span>{Math.round(zoom*100)}%</span><input type="range" aria-label="Image size" disabled={busy} min="0.5" max="3" step="0.05" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label></div>
  {error&&<p className="field-error" role="alert">{error}</p>}
  <div className="image-preview" aria-busy={busy} aria-live="polite">{busy?<p>Recreating your image…</p>:grid?<BoardPreview grid={grid} label="Converted image preview, 6 rows by 22 flaps"/>:<p>Choose an image to see its board preview.</p>}</div>
  <p className="image-hint">Each square becomes one of eight flap colors. With only 6 rows, bold shapes work better than tiny text or fine details. You can paint or type over the result.</p>
  <div className="image-actions"><button type="button" className="button secondary" onClick={()=>onOpenChange(false)}>Cancel</button><button type="button" className="button primary" disabled={!grid||busy} onClick={apply}>Use this design</button></div>
 </DialogContent></Dialog>;
}

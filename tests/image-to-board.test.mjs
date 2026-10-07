import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const cache={};
function load(name){if(cache[name])return cache[name];const exports={};cache[name]=exports;const code=ts.transpileModule(readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(code,{exports,require:path=>load(path.slice(2)),Uint8ClampedArray,Float64Array});return exports;}
const api=load('image-to-board'),board=load('board');
const blank=()=>new Uint8ClampedArray(api.IMAGE_WIDTH*api.IMAGE_HEIGHT*4);
function stamp(image,tile,row,col){for(let y=0;y<api.TILE_HEIGHT;y++)for(let x=0;x<api.TILE_WIDTH;x++){const from=(y*api.TILE_WIDTH+x)*4,to=((row*api.TILE_HEIGHT+y)*api.IMAGE_WIDTH+col*api.TILE_WIDTH+x)*4;image.set(tile.pixels.slice(from,from+4),to);}}
test('exact palette patches retain colors and transparent cells become blank',()=>{
 const pixels=blank(),colors=api.colorTemplates();colors.forEach((tile,i)=>stamp(pixels,tile,0,i));const result=api.pixelsToBoard(pixels,'colors',[]);
 colors.forEach((tile,i)=>assert.equal(result[0][i],tile.code));assert.ok(result.slice(1).flat().every(c=>c===0));assert.doesNotThrow(()=>board.validateGrid(result));
});
test('mixed and character modes choose a legal glyph when its shape matches',()=>{
 const pixels=blank(),tile={code:1,pixels:api.colorTemplates()[0].pixels.slice()};
 for(let y=3;y<13;y++)for(let x=2;x<10;x++)if(x===2||x===9||y===3||y===7)tile.pixels.set([236,235,231,255],(y*api.TILE_WIDTH+x)*4);
 stamp(pixels,tile,2,10);for(const style of ['mixed','characters']){const result=api.pixelsToBoard(pixels,style,[tile]);assert.equal(result[2][10],1);assert.ok(result.flat().every(c=>c===0||c===1));}
});
test('fit and crop preserve aspect ratio for portrait and panorama images',()=>{
 for(const [w,h] of [[100,400],[1600,100]])for(const mode of ['contain','cover']){const p=api.imagePlacement(w,h,mode);assert.equal(p.width/p.height,w/h);if(mode==='contain'){assert.ok(p.width<=api.IMAGE_WIDTH&&p.height<=api.IMAGE_HEIGHT);assert.ok(p.x>=0&&p.y>=0);}else{assert.ok(p.width>=api.IMAGE_WIDTH&&p.height>=api.IMAGE_HEIGHT);assert.ok(p.x<=0&&p.y<=0);}}
 assert.throws(()=>api.imagePlacement(0,100,'contain'),/dimensions/);
});
test('unsupported, empty and oversized files are rejected before decoding',()=>{
 assert.throws(()=>api.validateImageFile({type:'image/svg+xml',size:100}),/PNG/);assert.throws(()=>api.validateImageFile({type:'image/png',size:0}),/empty/);assert.throws(()=>api.validateImageFile({type:'image/png',size:11*1024*1024}),/10 MB/);assert.doesNotThrow(()=>api.validateImageFile({type:'image/jpeg',size:1024}));assert.throws(()=>api.pixelsToBoard(new Uint8ClampedArray(4),'colors',[]),/dimensions/);
});
test('neutral image edges never acquire colored flaps',()=>{
 const pixels=blank();for(let i=0;i<pixels.length;i+=4){const gray=(i/4)%256;pixels.set([gray,gray,gray,255],i);}const grid=api.pixelsToBoard(pixels,'mixed',[]);assert.ok(grid.flat().every(code=>[0,69,70].includes(code)));
});

test('auto background keeps dark transparent logos visible without changing opaque photos',()=>{
 const transparentDark=new Uint8ClampedArray([0,0,0,255,0,0,0,0]);assert.equal(api.chooseImageBackground(transparentDark),'white');assert.equal(api.chooseImageBackground(new Uint8ClampedArray([255,255,255,255,0,0,0,0])),'black');assert.equal(api.chooseImageBackground(new Uint8ClampedArray([0,0,0,255,10,10,10,255])),'black');
});

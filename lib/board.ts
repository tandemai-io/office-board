import type {CollegeProvider} from './college-api';
import type {SportsSelection,SportsGame} from './sports';
export type Mode = "work" | "sports" | "guests" | "meeting";
export type Alignment = "left" | "center" | "right";
export type Source = "manual" | "github" | "sports" | "default";
export const MODES = [{id:"work",name:"Work",description:"Team messages and shipping moments"},{id:"sports",name:"Sports",description:"NFL, NBA and college football"},{id:"guests",name:"Guests",description:"A welcome for the people visiting"},{id:"meeting",name:"Meeting",description:"Hold a message and quiet the feed"}] as const;
// Palette sampled from the Vestaboard app; codes are the physical flap colors.
export const COLORS = [{code:0,name:"None",hex:"#232527"},{code:63,name:"Red",hex:"#da281c"},{code:64,name:"Orange",hex:"#fb7400"},{code:65,name:"Yellow",hex:"#fcb71c"},{code:66,name:"Green",hex:"#239945"},{code:67,name:"Blue",hex:"#2083d6"},{code:68,name:"Violet",hex:"#702f8b"},{code:69,name:"White",hex:"#fbfbfb"},{code:70,name:"Black",hex:"#2b2b2b"}];
const SYMBOLS: Record<string,number> = {"!":37,"@":38,"#":39,"$":40,"(":41,")":42,"-":44,"+":46,"&":47,"=":48,";":49,":":50,"'":52,'"':53,"%":54,",":55,".":56,"/":59,"?":60,"°":62};
export function characterCode(char:string):number {
  if(char===" ") return 0;
  if(/^[A-Z]$/.test(char)) return char.charCodeAt(0)-64;
  if(/^[1-9]$/.test(char)) return Number(char)+26;
  if(char==="0") return 36;
  if(SYMBOLS[char]!==undefined) return SYMBOLS[char];
  throw new Error(`The board cannot display “${char}”. Use letters, numbers, or supported punctuation.`);
}
export function characterFor(code:number):string {
  if(code>=1&&code<=26)return String.fromCharCode(code+64);
  if(code>=27&&code<=35)return String(code-26);
  if(code===36)return "0";
  return Object.entries(SYMBOLS).find(([,n])=>n===code)?.[0]??" ";
}
export function formatBoard(input:string,alignment:Alignment="center",accent=0):number[][] {
  const text=input.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,"-").replace(/\r/g,"").replace(/\t/g," ").toUpperCase();
  if(!text.trim())throw new Error("Write a message first.");
  const lines:string[]=[];
  for(const paragraph of text.split("\n")){
    if(!paragraph.trim()){lines.push("");continue;}
    let line="";
    for(const word of paragraph.trim().split(/ +/)){
      if(word.length>22)throw new Error("Each word must fit within 22 characters.");
      if(line&&line.length+word.length+1>22){lines.push(line);line=word;}else line+=(line?" ":"")+word;
    }
    lines.push(line);
  }
  const available=accent?5:6;
  if(lines.length>available)throw new Error(`This message needs ${lines.length} rows. Use ${available} or fewer${accent?", or remove the color strip":""}.`);
  const grid=Array.from({length:6},()=>Array<number>(22).fill(0));
  const top=Math.floor((available-lines.length)/2);
  lines.forEach((line,index)=>{const start=alignment==="left"?0:alignment==="right"?22-line.length:Math.floor((22-line.length)/2);Array.from(line).forEach((char,col)=>grid[top+index][start+col]=characterCode(char));});
  if(accent)grid[5]=Array(22).fill(accent);
  return grid;
}
export function validateGrid(value:unknown):number[][] {
 const validCodes=new Set([0,...Array.from({length:36},(_,i)=>i+1),...Object.values(SYMBOLS),63,64,65,66,67,68,69,70,71]);
 if(!Array.isArray(value)||value.length!==6||value.some(row=>!Array.isArray(row)||row.length!==22))throw new Error('A visual design must have 6 rows of 22 cells.');
 if(value.some(row=>row.some((code:unknown)=>!Number.isInteger(code)||!validCodes.has(code as number))))throw new Error('The design contains a character the board cannot display.');
 return value.map(row=>[...row]);
}
export function gridText(grid:number[][]):string {return grid.map(row=>row.map(characterFor).join('').trimEnd()).join('\n').trim()||'Visual design';}
export function sceneGrid(scene:Scene) {return scene.grid?validateGrid(scene.grid):formatBoard(scene.text,scene.alignment,scene.accent);}
export type Scene={text:string;alignment:Alignment;accent:number;grid?:number[][]};
export const DEFAULT_SCENES:Record<Mode,Scene>={
  work:{text:"TANDEM\n\nBUILD SOMETHING\nWORTH SHIPPING",alignment:"center",accent:64},
  sports:{text:"GAME DAY\n\nFOLLOW YOUR TEAM\nCONNECT A SCORE FEED",alignment:"center",accent:67},
  guests:{text:"WELCOME TO TANDEM\n\nMAKE YOURSELF AT HOME",alignment:"center",accent:66},
  meeting:{text:"FOCUS TIME\n\nGOOD THINGS\nTAKE ATTENTION",alignment:"center",accent:0},
};
export type Config={boardName:string;mode:Mode;paused:boolean;timezone:string;quietEnabled:boolean;quietStart:string;quietEnd:string;scenes:Record<Mode,Scene>;githubRepo:string;githubEvents:"merged"|"updated"|"both";githubEnabled:boolean;sportLeague:"NBA"|"NFL"|"NCAAF";sportTeams:string;sportsEnabled:boolean;sportsSelection:SportsSelection|null};
export const DEFAULT_CONFIG:Config={boardName:"Office board",mode:"work",paused:false,timezone:"America/Los_Angeles",quietEnabled:true,quietStart:"19:00",quietEnd:"08:00",scenes:DEFAULT_SCENES,githubRepo:"",githubEvents:"merged",githubEnabled:false,sportLeague:"NBA",sportTeams:"",sportsEnabled:false,sportsSelection:null};
export type BoardMessage={id:string;title:string;text:string;grid?:number[][];alignment:Alignment;accent:number;source:Source;author:string;scheduledAt:number;duration:number;status:"queued"|"accepted"|"previewed"|"failed"|"cancelled"|"expired";createdAt:number;sentAt:number|null;error:string|null};
export type CurrentMessage=Scene&{title:string;source:Source;author:string;since:number;until:number|null;id:string|null;grid:number[][]};
export type AppState={sports:{game:SportsGame|null;updatedAt:number|null;error:string|null;college:{provider:CollegeProvider|null;reason:string|null;quota:Record<CollegeProvider,{used:number;limit:number;remaining:number;reserve:number}>}};config:Config;current:CurrentMessage;messages:BoardMessage[];isAdmin:boolean;user:{name:string;email:string};connections:{vestaboard:boolean;github:boolean;sports:boolean;apiSports:boolean;bigBalls:boolean};controller:{lastTick:number|null;lastAccepted:number|null;error:string|null;scheduler:boolean;cadence:number|null;pausedByQuietHours:boolean};feeds:{githubUpdatedAt:number|null;sportsUpdatedAt:number|null;githubError:string|null;sportsError:string|null}};
export function previewState():AppState {const scene=DEFAULT_SCENES.work;return {sports:{game:null,updatedAt:null,error:null,college:{provider:null,reason:null,quota:{'api-sports':{used:0,limit:100,remaining:100,reserve:10},'big-balls':{used:0,limit:250,remaining:250,reserve:10}}}},config:DEFAULT_CONFIG,current:{...scene,title:"Work mode",source:"default",author:"Tandem",since:Date.now(),until:null,id:null,grid:formatBoard(scene.text,scene.alignment,scene.accent)},messages:[],isAdmin:true,user:{name:"You",email:""},connections:{vestaboard:false,github:false,sports:false,apiSports:false,bigBalls:false},controller:{lastTick:null,lastAccepted:null,error:null,scheduler:false,cadence:null,pausedByQuietHours:false},feeds:{githubUpdatedAt:null,sportsUpdatedAt:null,githubError:null,sportsError:null}};}

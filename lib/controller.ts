import {engineeringSettings,normalizeWorkflow,validWebhookSignature,currentHealth,newEngineeringRuntime,engineeringScene,type EngineeringRuntime,type EngineeringState,type Deployment} from './engineering';
import {DEFAULT_STANDUP,newStandupRuntime,standupWindow,nextStandup,type StandupRuntime} from './standup';
import { env } from 'cloudflare:workers';
import {newPossessionCache,updateFootballPossession,type PossessionCache} from './football-possession';
import { DEFAULT_CONFIG, formatBoard, previewState, validateGrid,gridText,sceneGrid, type AppState, type BoardMessage, type Config, type CurrentMessage, type Mode, type Scene } from './board';
import type { ChatGPTUser } from '@/app/chatgpt-auth';
import {gameScene,isTerminalGame,validLeague,validGameId,type SportsGame,type SportsLeague,type GamesResult} from './sports';
import {fetchSchedule,fetchSelectedGame,GAME_REFRESH_MS,SCHEDULE_REFRESH_MS,STALE_GAME_MS,sportsDate} from './sports-api';

import {CollegeClient,CollegeRateLimitError,newCollegeBook,quotaSummary,providerName,COLLEGE_REFRESH_MS,COLLEGE_CATALOG_MS,COLLEGE_STALE_MS,type CollegeBook,type CollegeProvider} from './college-api';

type Hardware={grid:number[][]|null;messageId:string|null;checkedAt:number|null;observedAt:number|null;error:string|null};
const HARDWARE_REFRESH_MS=30000,WRITE_SETTLE_MS=45000;
const initialHardware=():Hardware=>({grid:null,messageId:null,checkedAt:null,observedAt:null,error:null});
type Runtime = {engineering:EngineeringRuntime;standup:StandupRuntime;takeoverPending:boolean;takeoverMessageId:string|null;externalActive:boolean;lastMessageId:string|null;hardware:Hardware;lastForced:boolean;possession:PossessionCache;college:CollegeBook;current:CurrentMessage; lastTick:number|null; lastAccepted:number|null; error:string|null; scheduler:boolean; lastBackground:number|null; githubCursor:number; githubUpdatedAt:number|null; githubError:string|null; sportsUpdatedAt:number|null; sportsError:string|null; sportsScene:Scene|null; sportsGame:SportsGame|null; sportsLists:Partial<Record<SportsLeague,{games:SportsGame[];fetchedAt:number;attemptedAt:number;date:string;error:string|null}>>; sportsFetchedAt:number; retryAt:number};
type Row = {owner_id:string|null; owner_email:string|null; config:string; runtime:string; lease_token:string|null; lease_until:number; last_attempt_at:number};
type MessageRow = {id:string;title:string;text:string;grid:string|null;alignment:'left'|'center'|'right';accent:number;source:BoardMessage['source'];author:string;scheduled_at:number;duration:number;status:BoardMessage['status'];created_at:number;sent_at:number|null;error:string|null};
export class BoardError extends Error { constructor(message:string, public status=400){super(message);} }
function db(){if(!env.DB)throw new BoardError('Shared storage is unavailable.',503);return env.DB;}
const now=()=>Date.now();
const name=(u:ChatGPTUser)=>u.fullName||u.email.split('@')[0];
function initialRuntime():Runtime{return {engineering:newEngineeringRuntime(),standup:newStandupRuntime(),takeoverPending:false,takeoverMessageId:null,externalActive:false,lastMessageId:null,hardware:initialHardware(),lastForced:false,possession:newPossessionCache(),college:newCollegeBook(),current:previewState().current,lastTick:null,lastAccepted:null,error:null,scheduler:false,lastBackground:null,githubCursor:now(),githubUpdatedAt:null,githubError:null,sportsUpdatedAt:null,sportsError:null,sportsScene:null,sportsGame:null,sportsLists:{},sportsFetchedAt:0,retryAt:0};}
async function init(user?:ChatGPTUser){if(!env.OWNER_EMAIL)throw new BoardError('Dashboard owner configuration is unavailable.',503);await db().prepare('INSERT OR IGNORE INTO controller(id,config,runtime) VALUES(1,?,?)').bind(JSON.stringify(DEFAULT_CONFIG),JSON.stringify(initialRuntime())).run();if(user&&user.email.toLowerCase()===env.OWNER_EMAIL.toLowerCase())await db().prepare('UPDATE controller SET owner_id=?,owner_email=? WHERE id=1 AND owner_id IS NULL').bind(user.userId,user.email).run();}
async function row(){return (await db().prepare('SELECT * FROM controller WHERE id=1').first<Row>())!;}
function parse(r:Row){const config={...DEFAULT_CONFIG,...JSON.parse(r.config),quietEnabled:false} as Config;const runtime={...initialRuntime(),...JSON.parse(r.runtime)} as Runtime;runtime.hardware={...initialHardware(),...runtime.hardware};runtime.standup={...newStandupRuntime(),...runtime.standup};config.standup={...DEFAULT_STANDUP,...config.standup};config.scenes={...DEFAULT_CONFIG.scenes,...config.scenes};runtime.engineering={...newEngineeringRuntime(),...runtime.engineering};return {config,runtime};}
async function save(config:Config,runtime:Runtime,lease:string){const result=await db().prepare('UPDATE controller SET config=?,runtime=?,revision=revision+1 WHERE id=1 AND lease_token=? AND lease_until>?').bind(JSON.stringify(config),JSON.stringify(runtime),lease,now()).run();if(!result.meta.changes)throw new BoardError('The controller is busy. Try again.',409);}
async function withLease<T>(fn:(r:Row,lease:string)=>Promise<T>):Promise<T>{const lease=crypto.randomUUID();const claimed=await db().prepare('UPDATE controller SET lease_token=?,lease_until=? WHERE id=1 AND lease_until<=? RETURNING id').bind(lease,now()+90000,now()).first();if(!claimed)throw new BoardError('Another update is running. Try again in a moment.',409);try{return await fn(await row(),lease);}finally{await db().prepare('UPDATE controller SET lease_until=0,lease_token=NULL WHERE id=1 AND lease_token=?').bind(lease).run();}}
// Retained for old clients; quiet hours are disabled for every board update.
export function isQuiet(_config:Config,_time=now()){return false;}
function followingSports(config:Config,runtime:Runtime){return config.mode==='sports'&&config.sportsEnabled&&!!config.sportsSelection&&!!runtime.sportsGame;}
function message(m:MessageRow):BoardMessage{return {id:m.id,title:m.title,text:m.text,...(m.grid?{grid:JSON.parse(m.grid)}:{}),alignment:m.alignment,accent:m.accent,source:m.source,author:m.author,scheduledAt:m.scheduled_at,duration:m.duration,status:m.status,createdAt:m.created_at,sentAt:m.sent_at,error:m.error};}
async function kinds(){const q=await db().prepare('SELECT kind FROM credentials').all<{kind:string}>();return new Set(q.results.map(r=>r.kind));}
export async function getState(user:ChatGPTUser,sync=false):Promise<AppState>{await init(user);if(sync){const before=parse(await row());if(!before.runtime.hardware.checkedAt||now()-before.runtime.hardware.checkedAt>=HARDWARE_REFRESH_MS){try{await withLease(async(r,lease)=>{const {config,runtime}=parse(r);const token=await secret('vestaboard');if(token&&(!runtime.hardware.checkedAt||now()-runtime.hardware.checkedAt>=HARDWARE_REFRESH_MS)){await readHardware(token,runtime,true);await save(config,runtime,lease);}});}catch(e){if(!(e instanceof BoardError&&e.status===409))throw e;}}}const {config,runtime}=parse(await row());const [q,connected,r]=await Promise.all([db().prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 150').all<MessageRow>(),kinds(),row()]);return {engineering:await engineeringState(runtime),sports:{game:runtime.sportsGame,updatedAt:runtime.sportsUpdatedAt,error:runtime.sportsError,college:{provider:runtime.college.active,reason:runtime.college.reason,quota:quotaSummary(runtime.college)}},config,current:runtime.current,messages:q.results.map(message),isAdmin:r.owner_id===user.userId,user:{name:name(user),email:user.email},connections:{vestaboard:connected.has('vestaboard'),github:connected.has('github'),sports:connected.has('sports'),apiSports:connected.has('api-sports'),bigBalls:connected.has('big-balls')},controller:{standup:standupStatus(config,runtime),lastTick:runtime.lastTick,lastAccepted:runtime.lastAccepted,error:runtime.error,scheduler:!!env.SCHEDULER_MINUTES&&!!runtime.lastBackground&&now()-runtime.lastBackground<Math.max(900000,Number(env.SCHEDULER_MINUTES)*120000),cadence:env.SCHEDULER_MINUTES?Number(env.SCHEDULER_MINUTES):null,pausedByQuietHours:isQuiet(config)&&!followingSports(config,runtime),sportsDuringQuietHours:!config.paused&&isQuiet(config)&&followingSports(config,runtime),externalActive:runtime.externalActive,hardware:{grid:runtime.hardware.grid,messageId:runtime.hardware.messageId,observedAt:runtime.hardware.observedAt,checkedAt:runtime.hardware.checkedAt,error:runtime.hardware.error,matches:runtime.hardware.grid?JSON.stringify(runtime.hardware.grid)===JSON.stringify(runtime.current.grid):null,text:runtime.hardware.grid?gridText(runtime.hardware.grid):null}},feeds:{githubUpdatedAt:runtime.githubUpdatedAt,sportsUpdatedAt:runtime.sportsUpdatedAt,githubError:runtime.githubError,sportsError:runtime.sportsError}};}
function base64(b:Uint8Array){return btoa(String.fromCharCode(...b));}
function unbase64(s:string){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function encryptionKey(){if(!env.SECRET_ENCRYPTION_KEY)throw new BoardError('Credential storage is not configured.',503);return crypto.subtle.importKey('raw',unbase64(env.SECRET_ENCRYPTION_KEY),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function putSecret(kind:string,value:string){const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(kind)},await encryptionKey(),new TextEncoder().encode(value));await db().prepare('INSERT INTO credentials(kind,ciphertext) VALUES(?,?) ON CONFLICT(kind) DO UPDATE SET ciphertext=excluded.ciphertext').bind(kind,`${base64(iv)}.${base64(new Uint8Array(ciphertext))}`).run();}
async function secret(kind:string){const saved=await db().prepare('SELECT ciphertext FROM credentials WHERE kind=?').bind(kind).first<{ciphertext:string}>();if(!saved)return null;const [iv,cipher]=saved.ciphertext.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(iv),additionalData:new TextEncoder().encode(kind)},await encryptionKey(),unbase64(cipher)));}
async function request(url:string,headers:Record<string,string>,init:RequestInit={}){let response:Response;try{response=await fetch(url,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(8000)});}catch{throw new BoardError('The provider did not respond. Try again shortly.',502);}if(!response.ok)throw new BoardError(url==='https://cloud.vestaboard.com/'?`Vestaboard rejected the update (HTTP ${response.status}). Check its connection and any pinned message in the Vestaboard app.`:`The provider returned HTTP ${response.status}. Check the key and its permissions.`,502);return response;}
function cloudDiffers(runtime:Runtime){
 if(!runtime.hardware.grid)return false;
 if(runtime.hardware.messageId&&runtime.lastMessageId)return runtime.hardware.messageId!==runtime.lastMessageId;
 return JSON.stringify(runtime.hardware.grid)!==JSON.stringify(runtime.current.grid);
}
async function readHardware(token:string,runtime:Runtime,detectExternal=false){
 try{
  const response=await request('https://cloud.vestaboard.com/',{'X-Vestaboard-Token':token,'Content-Type':'application/json'});
  const data=await response.json() as {currentMessage?:{layout?:unknown;id?:unknown}};
  const layout=data.currentMessage?.layout;
  const grid=validateGrid(typeof layout==='string'?JSON.parse(layout):layout);
  const messageId=typeof data.currentMessage?.id==='string'?data.currentMessage.id.slice(0,200):null;
  const changed=JSON.stringify(grid)!==JSON.stringify(runtime.hardware.grid)||messageId!==runtime.hardware.messageId;
  runtime.hardware={grid,messageId,checkedAt:now(),observedAt:changed?now():runtime.hardware.observedAt||now(),error:null};
  // Our writer baseline stays separate from readback. Allow our most recent
  // write to propagate before treating a different message as an external edit.
  const differentGrid=JSON.stringify(grid)!==JSON.stringify(runtime.current.grid);
  const differentId=!!messageId&&!!runtime.lastMessageId&&messageId!==runtime.lastMessageId;
  if(detectExternal&&!runtime.takeoverPending&&(!runtime.lastAccepted||now()-runtime.lastAccepted>=WRITE_SETTLE_MS)&&(differentId||((!messageId||!runtime.lastMessageId)&&differentGrid))){
   runtime.externalActive=true;runtime.error=null;runtime.retryAt=0;
  }
 }catch{
  runtime.hardware={...runtime.hardware,checkedAt:now(),error:'Could not refresh Vestaboard. Showing the last synced message.'};
 }
}
const githubHeaders=(token:string)=>({Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Tandem-Office-Board'});
type Pull={number:number;title:string;updated_at:string;merged_at:string|null;user:{login:string};head:{sha:string};merged_by?:{login:string}|null};
async function pulls(token:string,repo:string){return await (await request(`https://api.github.com/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=30`,githubHeaders(token))).json() as Pull[];}
function validScene(text:unknown,alignment:unknown='center',accent:unknown=0):Scene{if(typeof text!=='string'||text.length>500)throw new BoardError('Use a message of 500 characters or fewer.');if(!['left','center','right'].includes(String(alignment)))throw new BoardError('Choose a valid alignment.');if(![0,63,64,65,66,67,68,69,70].includes(Number(accent)))throw new BoardError('Choose a valid color.');const scene={text,alignment:alignment as Scene['alignment'],accent:Number(accent)};try{formatBoard(text,scene.alignment,scene.accent);}catch(e){throw new BoardError((e as Error).message);}return scene;}
async function enqueue(scene:Scene,author:string,scheduledAt:number,duration:number,source:BoardMessage['source']='manual',businessKey:string|null=null,title?:string){const id=crypto.randomUUID();await db().prepare('INSERT OR IGNORE INTO messages(id,title,text,grid,alignment,accent,source,author,scheduled_at,duration,status,created_at,business_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,title||scene.text.split('\n').find(Boolean)?.slice(0,60)||'Visual design',scene.text,scene.grid?JSON.stringify(scene.grid):null,scene.alignment,scene.accent,source,author,scheduledAt,duration,'queued',now(),businessKey).run();return id;}
function bounded(value:string,max=18){return value.replace(/[^a-zA-Z0-9 .@#'!&()/+:?=-]/g,'').slice(0,max)||'TEAM';}
async function pollGithub(config:Config,runtime:Runtime){if(!config.githubEnabled||!config.githubRepo||now()-(runtime.githubUpdatedAt||0)<240000)return;try{const token=await secret('github');if(!token)return;const data=await pulls(token,config.githubRepo);const cursor=runtime.githubCursor;for(const pr of data.filter(p=>Date.parse(p.updated_at)>cursor).reverse().slice(-3)){const merged=pr.merged_at&&Date.parse(pr.merged_at)>cursor;if((merged&&config.githubEvents!=='updated')||(!merged&&config.githubEvents!=='merged')){let actor=pr.user.login;if(merged){const detail=await (await request(`https://api.github.com/repos/${config.githubRepo}/pulls/${pr.number}`,githubHeaders(token))).json() as Pull;actor=detail.merged_by?.login||actor;}await enqueue({text:merged?`${bounded(actor).toUpperCase()}\nMERGED PR #${pr.number}\n\nKEEP SHIPPING`:`PR #${pr.number} UPDATED\nAUTHOR ${bounded(actor,15).toUpperCase()}\n\nKEEP SHIPPING`,alignment:'center',accent:merged?66:64},merged?actor:`PR author: ${actor}`,now(),180,'github',`${config.githubRepo}:${pr.number}:${merged?'merge':pr.head.sha+pr.updated_at}`,merged?`${actor} merged PR #${pr.number}`:`PR #${pr.number} updated`);}}runtime.githubCursor=Math.max(cursor,...data.map(p=>Date.parse(p.updated_at)));runtime.githubUpdatedAt=now();runtime.githubError=null;}catch(e){runtime.githubError=(e as Error).message;runtime.githubUpdatedAt=now();}}
// All provider callers hold the controller lease; this budget is shared by every teammate.
async function reserveSportsRequest(){
 await db().prepare('DELETE FROM sports_requests WHERE requested_at<=?').bind(now()-60000).run();
 const usage=await db().prepare('SELECT COUNT(*) AS count FROM sports_requests').first<{count:number}>();
 if((usage?.count||0)>=5)throw new Error('The free score feed is catching up. Try again in a minute.');
 await db().prepare('INSERT INTO sports_requests(id,requested_at) VALUES(?,?)').bind(crypto.randomUUID(),now()).run();
}
async function collegeKeys(){return {'api-sports':await secret('api-sports'),'big-balls':await secret('big-balls')};}
async function collegeClient(config:Config,runtime:Runtime,lease:string,overrides:Partial<Record<CollegeProvider,string>>={}) {return new CollegeClient(runtime.college,{...await collegeKeys(),...overrides},()=>save(config,runtime,lease),now(),config.timezone);}
export async function getSportsGames(user:ChatGPTUser,league:SportsLeague):Promise<GamesResult>{
 await init(user);const before=parse(await row());const college=league==='NCAAF';const keys=college?await collegeKeys():null;const token=college?null:await secret('sports');
 if(!(college?(keys?.['api-sports']||keys?.['big-balls']):token))return {league,games:[],fetchedAt:null,connected:false,error:null};
 const date=sportsDate(now(),before.config.timezone),cadence=college?COLLEGE_CATALOG_MS:SCHEDULE_REFRESH_MS;
 const cachedResult=(runtime:Runtime)=>{const cached=runtime.sportsLists[league];return cached&&cached.date===date&&now()-(cached.attemptedAt||cached.fetchedAt)<cadence?{league,games:cached.games,fetchedAt:cached.fetchedAt||null,connected:true,error:cached.error,provider:college&&runtime.college.active?providerName(runtime.college.active):'BALLDONTLIE'}:null;};
 const cached=cachedResult(before.runtime);if(cached)return cached;
 return withLease(async(r,lease)=>{const {config,runtime}=parse(r);const already=cachedResult(runtime);if(already)return already;const existing=runtime.sportsLists[league];let result:GamesResult;
 try{const games=league==='NCAAF'?await (await collegeClient(config,runtime,lease)).schedule():await fetchSchedule(token!,league,now(),config.timezone,reserveSportsRequest);const fetchedAt=now();runtime.sportsLists[league]={games,fetchedAt,attemptedAt:fetchedAt,date,error:null};result={league,games,fetchedAt,connected:true,error:null,provider:college&&runtime.college.active?providerName(runtime.college.active):'BALLDONTLIE'};}
 catch(e){const error=(e as Error).message;runtime.sportsLists[league]={games:existing?.games||[],fetchedAt:existing?.fetchedAt||0,attemptedAt:now(),date,error};result={league,games:existing?.games||[],fetchedAt:existing?.fetchedAt||null,connected:true,error};}
 await save(config,runtime,lease);return result;
 });
}
async function pollSports(config:Config,runtime:Runtime,lease:string){
 if(config.mode!=='sports'||!config.sportsEnabled||!config.sportsSelection)return;
 const college=config.sportsSelection.league==='NCAAF';
 if(config.paused)return;
 // Keep the final result on the board without spending more provider requests.
 // An explicit game selection is the only way to start following again.
 if(runtime.sportsGame&&isTerminalGame(runtime.sportsGame))return;
 const scheduled=college&&runtime.sportsGame?.state==='scheduled'&&Date.parse(runtime.sportsGame.startsAt||'')-now()>1800000;
 const inactive=college&&!!runtime.sportsGame&&!['in_progress','scheduled'].includes(runtime.sportsGame.state);
 const cadence=(scheduled||inactive)?900000:college?COLLEGE_REFRESH_MS:GAME_REFRESH_MS;
 if(now()-runtime.sportsFetchedAt<cadence)return;
 runtime.sportsFetchedAt=now();
 try{const selected=config.sportsSelection;let game:SportsGame;if(selected.league==='NCAAF')game=await (await collegeClient(config,runtime,lease)).selected(selected.gameId);else{const token=await secret('sports');if(!token)throw new Error('Connect the sports score feed.');game=await fetchSelectedGame(token,selected.league,selected.gameId,reserveSportsRequest);}runtime.sportsGame=game;runtime.sportsScene=gameScene(game,false,config.timezone);runtime.sportsUpdatedAt=now();runtime.sportsError=null;}
 catch(e){runtime.sportsError=(e as Error).message;}
}
async function pollPossession(config:Config,runtime:Runtime){
 if(!followingSports(config,runtime)||!runtime.sportsGame||config.paused)return;
 runtime.sportsGame=await updateFootballPossession(runtime.sportsGame,runtime.possession,now());
}
function standupStatus(config:Config,runtime:Runtime){const s=runtime.standup;return {active:!!s.active,endsAt:s.active?.endsAt||null,nextStart:config.standup.enabled?nextStandup(now()):null,lastResult:s.lastResult,error:s.error,runnerReady:s.runnerReady,lastBackground:s.lastBackground};}
const sameGrid=(a:number[][]|null,b:number[][])=>!!a&&JSON.stringify(a)===JSON.stringify(b);
function finishStandup(runtime:Runtime,result:string){runtime.standup.active=null;runtime.standup.lastResult=result;runtime.standup.error=null;}
async function writeStandupGrid(token:string|null,grid:number[][],config:Config,runtime:Runtime,lease:string){
 if(!token)return true;
 if(runtime.retryAt>now())return false;
 const fenced=await db().prepare('UPDATE controller SET last_attempt_at=? WHERE id=1 AND lease_token=? AND lease_until>? AND last_attempt_at<?').bind(now(),lease,now(),now()-20000).run();
 if(!fenced.meta.changes)return false;
 try{
  const response=await request('https://cloud.vestaboard.com/',{'X-Vestaboard-Token':token,'Content-Type':'application/json'},{method:'POST',body:JSON.stringify({characters:grid,forced:true})});
  const accepted=await response.json() as {status?:unknown;id?:unknown};
  if(accepted.status!=='ok'&&accepted.status!=='success')throw new BoardError('Vestaboard did not confirm the scheduled update. It will retry shortly.',502);
  runtime.lastAccepted=now();runtime.lastMessageId=typeof accepted.id==='string'?accepted.id.slice(0,200):null;runtime.lastForced=true;runtime.retryAt=0;runtime.error=null;runtime.standup.error=null;
  await readHardware(token,runtime);return true;
 }catch(e){runtime.standup.error=(e as Error).message;runtime.retryAt=now()+60000;await save(config,runtime,lease);return false;}
}
// Recurring messages interrupt the display temporarily; the durable snapshot is
// separate from the normal queue and survives worker restarts and failed writes.
async function tickStandup(config:Config,runtime:Runtime,lease:string,token:string|null,explicit=false){
 const s=runtime.standup,window=standupWindow(now());
 if(explicit){if(s.active)finishStandup(runtime,'Stopped for a new board action.');if(window)s.lastWindow=window.key;return false;}
 if(config.paused)return !!s.active;
 if(!s.active&&(!config.standup.enabled||!window||s.lastWindow===window.key||runtime.takeoverPending))return false;
 if(token){await readHardware(token,runtime);if(runtime.hardware.error||!runtime.hardware.grid){s.error='Could not read the current board. Standup will retry without replacing it.';return true;}}
 if(!s.active&&window){
  const external=runtime.externalActive||(!!token&&cloudDiffers(runtime));
  const grid=token?runtime.hardware.grid!:runtime.current.grid;
  const previous:CurrentMessage=external?{text:gridText(grid),grid,title:'Previous Vestaboard message',source:'manual',author:'Vestaboard',alignment:'left',accent:0,since:now(),until:null,id:null}:{...runtime.current,grid};
  s.active={key:window.key,endsAt:window.endsAt,phase:'starting',grid:formatBoard(config.standup.text,'center',64),previous,previousExternal:external,remainingMs:Math.max(0,(previous.until||0)-now()),originalMessageId:token?runtime.hardware.messageId:null,messageId:null,attempted:false};
  s.lastWindow=window.key;s.error=null;s.lastResult='Preparing Standup.';
  // Commit the original display before any external write.
  await save(config,runtime,lease);
 }
 const run=s.active!;
 const isOriginal=token?(run.originalMessageId&&runtime.hardware.messageId?run.originalMessageId===runtime.hardware.messageId:sameGrid(runtime.hardware.grid,run.previous.grid)):true;
 let isOurs=token?(run.messageId&&runtime.hardware.messageId?run.messageId===runtime.hardware.messageId:sameGrid(runtime.hardware.grid,run.grid)):true;
 if(run.phase==='starting'){
  if(token&&!isOriginal){
   // Recover a write accepted immediately before the worker stopped, without
   // ever taking a replacement snapshot of the Standup message itself.
   if(run.attempted&&sameGrid(runtime.hardware.grid,run.grid)){run.messageId=runtime.hardware.messageId;run.phase='showing';runtime.lastMessageId=run.messageId;runtime.lastForced=true;runtime.lastAccepted=now();}
   else {finishStandup(runtime,'Skipped: the board changed before Standup started.');runtime.externalActive=true;return true;}
  }
  if(run.phase==='starting'){
   if(now()>=run.endsAt){finishStandup(runtime,'Skipped: the Standup window ended before it could be shown.');return true;}
   run.attempted=true;await save(config,runtime,lease);
   if(!await writeStandupGrid(token,run.grid,config,runtime,lease))return true;
   run.messageId=runtime.lastMessageId;run.phase='showing';
  }
  runtime.current={text:config.standup.text,grid:run.grid,title:'Standup',source:'recurring',author:'Weekday schedule',alignment:'center',accent:64,since:now(),until:run.endsAt,id:run.key};runtime.externalActive=false;s.lastResult='Showing Standup.';
  await save(config,runtime,lease);
  if(now()<run.endsAt)return true;
 }
 isOurs=token?(run.messageId&&runtime.hardware.messageId?run.messageId===runtime.hardware.messageId:sameGrid(runtime.hardware.grid,run.grid)):true;
 if(token&&!isOurs&&now()-(runtime.lastAccepted||0)<WRITE_SETTLE_MS&&isOriginal)return true;
 if(token&&!isOurs){
  // A restoring write may have succeeded before its state could be committed.
  if(!(run.phase==='restoring'&&sameGrid(runtime.hardware.grid,run.previous.grid))){finishStandup(runtime,'A newer message took priority.');runtime.externalActive=true;runtime.current.until=null;return true;}
 }
 if(now()<run.endsAt&&run.phase==='showing')return true;
 run.phase='restoring';await save(config,runtime,lease);
 if(!token||!sameGrid(runtime.hardware.grid,run.previous.grid)){
  if(!await writeStandupGrid(token,run.previous.grid,config,runtime,lease))return true;
 }else {runtime.lastMessageId=runtime.hardware.messageId;runtime.lastForced=true;runtime.retryAt=0;}
 runtime.current={...run.previous,until:run.remainingMs>0?now()+run.remainingMs:null};
 runtime.externalActive=run.previousExternal||(run.previous.source==='manual'&&run.remainingMs===0);
 finishStandup(runtime,'Restored the previous board message.');return true;
}
export async function runStandupSchedule(ready=false){await init();return withLease(async(r,lease)=>{const {config,runtime}=parse(r);runtime.standup.lastBackground=now();if(ready)runtime.standup.runnerReady=true;else await tickStandup(config,runtime,lease,await secret('vestaboard'));await save(config,runtime,lease);return {ok:true,...standupStatus(config,runtime),needsRetry:!!runtime.standup.error||!!runtime.standup.active&&(runtime.standup.active.phase!=='showing'||now()>=runtime.standup.active.endsAt)};});}
export async function getStandupSchedule(){await init();const {config,runtime}=parse(await row());return {ok:true,settings:config.standup,...standupStatus(config,runtime)};}
async function tickLocked(r:Row,lease:string,background=false,overrideId:string|null=null,takeover=false,engineeringOnly=false){const {config,runtime}=parse(r);runtime.lastTick=now();if(background){runtime.scheduler=true;runtime.lastBackground=now();}
 const token=await secret('vestaboard');
 takeover=takeover||runtime.takeoverPending;
 if(takeover&&runtime.takeoverMessageId)overrideId=runtime.takeoverMessageId;
 if(await tickStandup(config,runtime,lease,token,takeover)){await save(config,runtime,lease);return;}
 if(token&&(!runtime.hardware.checkedAt||now()-runtime.hardware.checkedAt>=HARDWARE_REFRESH_MS))await readHardware(token,runtime,!takeover);
 if(takeover)runtime.externalActive=false;
 if(config.paused||runtime.externalActive||(token&&!takeover&&(runtime.hardware.error||cloudDiffers(runtime)))){await save(config,runtime,lease);return;}
 if(!engineeringOnly){await pollGithub(config,runtime);await pollSports(config,runtime,lease);await pollPossession(config,runtime);}
 if(config.mode==='engineering'&&!engineeringOnly)await pollEngineeringHealth(runtime);
 await db().prepare("UPDATE messages SET status='expired' WHERE status='queued' AND source='github' AND scheduled_at<?").bind(now()-1800000).run();
 const due=overrideId?await db().prepare("SELECT * FROM messages WHERE id=? AND status='queued' AND scheduled_at<=?").bind(overrideId,now()).first<MessageRow>():await db().prepare("SELECT * FROM messages WHERE status='queued' AND scheduled_at<=? AND (source='manual' OR (?='work' AND source='github')) ORDER BY CASE source WHEN 'manual' THEN 0 ELSE 1 END,scheduled_at ASC LIMIT 1").bind(now(),config.mode).first<MessageRow>();
 // Explicit Send Now can interrupt a hold. Scheduled notes and feed events wait.
 if(runtime.current.until&&runtime.current.until>now()&&!overrideId){await save(config,runtime,lease);return;}
 let desired:CurrentMessage;if(due){const scene:Scene={text:due.text,alignment:due.alignment,accent:due.accent,...(due.grid?{grid:JSON.parse(due.grid)}:{})};desired={...scene,title:due.title,source:due.source,author:due.author,since:now(),until:now()+due.duration*1000,id:due.id,grid:sceneGrid(scene)};}else if(runtime.current.until&&runtime.current.until>now()){await save(config,runtime,lease);return;}else {const following=config.mode==='sports'&&config.sportsSelection&&runtime.sportsGame;const stale=!!following&&!isTerminalGame(runtime.sportsGame!)&&(runtime.sportsGame!.league!=='NCAAF'||runtime.sportsGame!.state==='in_progress')&&!!runtime.sportsUpdatedAt&&now()-runtime.sportsUpdatedAt>(runtime.sportsGame!.league==='NCAAF'?COLLEGE_STALE_MS:STALE_GAME_MS);const scene=config.mode==='engineering'?engineeringScene(await engineeringState(runtime),now()):following?gameScene(runtime.sportsGame!,stale,config.timezone):config.scenes[config.mode];desired={...scene,title:following?`${runtime.sportsGame!.away.abbreviation} vs ${runtime.sportsGame!.home.abbreviation}`:`${config.mode[0].toUpperCase()+config.mode.slice(1)} mode`,source:config.mode==='engineering'?'engineering':following?'sports':'default',author:following?(runtime.sportsGame!.provider?providerName(runtime.sportsGame!.provider):'BALLDONTLIE'):'Tandem',since:now(),until:null,id:null,grid:sceneGrid(scene)};}
 const forced=true;
 const same=JSON.stringify(desired.grid)===JSON.stringify(runtime.current.grid);
 if(same&&!due&&(!token||(runtime.lastAccepted&&runtime.lastForced))){runtime.current={...desired,since:runtime.current.since};await save(config,runtime,lease);return;}
 if(token&&(now()-r.last_attempt_at<20000||runtime.retryAt>now())){await save(config,runtime,lease);return;}
 // Read again immediately before an automatic write if another page's sync
 // made our cached observation older than this decision.
 if(token&&!takeover&&now()-(runtime.hardware.checkedAt||0)>1000){await readHardware(token,runtime,true);if(runtime.externalActive||runtime.hardware.error||cloudDiffers(runtime)){await save(config,runtime,lease);return;}}
 if(token){const fenced=await db().prepare('UPDATE controller SET last_attempt_at=? WHERE id=1 AND lease_token=? AND lease_until>? AND last_attempt_at<?').bind(now(),lease,now(),now()-20000).run();if(!fenced.meta.changes)throw new BoardError('Another update took over. The message stays queued.',409);try{const response=await request('https://cloud.vestaboard.com/',{'X-Vestaboard-Token':token,'Content-Type':'application/json'},{method:'POST',body:JSON.stringify({characters:desired.grid,forced})});const accepted=await response.json().catch(()=>null) as {status?:unknown;id?:unknown}|null;
 // The Cloud API documents 'ok' and also returns 'success' for accepted writes.
 if(accepted?.status!=='ok'&&accepted?.status!=='success')throw new BoardError('Vestaboard did not confirm this message. It will retry shortly.',502);runtime.lastAccepted=now();runtime.lastMessageId=typeof accepted.id==='string'?accepted.id.slice(0,200):null;runtime.lastForced=forced;runtime.error=null;runtime.retryAt=0;await readHardware(token,runtime);}catch(e){runtime.error=(e as Error).message;runtime.retryAt=now()+60000;if(due)await db().prepare('UPDATE messages SET error=? WHERE id=?').bind(runtime.error,due.id).run();await save(config,runtime,lease);return;}}
 runtime.current=desired;runtime.takeoverPending=false;runtime.takeoverMessageId=null;
 if(due)await db().prepare('UPDATE messages SET status=?,sent_at=?,error=NULL WHERE id=?').bind(token?'accepted':'previewed',now(),due.id).run();
 await save(config,runtime,lease);
}
export async function backgroundTick(){await init();return withLease(async(r,lease)=>{await tickLocked(r,lease,true);const {runtime,config}=parse(await row());return {ok:true,lastTick:runtime.lastTick,paused:config.paused,quiet:isQuiet(config),error:runtime.error,feedErrors:{github:runtime.githubError,sports:runtime.sportsError}};});}
export async function mutate(user:ChatGPTUser,body:Record<string,unknown>){await init(user);await withLease(async(r,lease)=>{const {config,runtime}=parse(r);const admin=r.owner_id===user.userId;const requireAdmin=()=>{if(!admin)throw new BoardError('Only the dashboard owner can change this setting.',403);};const action=body.action;let overrideId:string|null=null;let takeover=false;
 if(action==='message'){let scene:Scene;if(body.grid!==undefined){try{const grid=validateGrid(body.grid);scene={grid,text:gridText(grid),alignment:'left',accent:0};}catch(e){throw new BoardError((e as Error).message);}}else scene=validScene(body.text,body.alignment,body.accent);const scheduled=Number(body.scheduledAt),duration=Number(body.duration);if(!Number.isFinite(scheduled)||scheduled<now()-60000||scheduled>now()+366*86400000)throw new BoardError('Choose a time within the next year.');if(![60,300,900,1800,3600].includes(duration))throw new BoardError('Choose a valid duration.');const id=await enqueue(scene,name(user),Math.max(scheduled,now()),duration);if(scheduled<=now()+1000){overrideId=id;takeover=true;}}
 else if(action==='hardware-check'){requireAdmin();const token=await secret('vestaboard');if(!token)throw new BoardError('Connect your Vestaboard first.');await readHardware(token,runtime,true);}
 else if(action==='refresh'){/* The open dashboard may check due work without admin privileges. */}
 else if(action==='mode'){if(!['work','sports','guests','meeting','engineering'].includes(String(body.mode)))throw new BoardError('Choose a valid mode.');if(body.mode==='engineering'&&!engineeringConfig().webhookSecret)throw new BoardError('Engineering is not connected yet.');config.mode=body.mode as Mode;runtime.current.until=0;takeover=true;}
 else if(action==='sports-select'){
 const league=body.league,id=body.gameId;if(!validLeague(league)||!validGameId(id)||(league==='NCAAF'?!/^(as:|bb:)/.test(id):!/^[1-9]\d*$/.test(id)))throw new BoardError('Choose an NFL, NBA or college football game.');
 if(!runtime.sportsLists[league]?.games.some(g=>g.id===id))throw new BoardError('Refresh the game list and choose an available game.');
 let game:SportsGame;try{if(league==='NCAAF')game=await (await collegeClient(config,runtime,lease)).selected(id);else{const token=await secret('sports');if(!token)throw new Error('Connect the sports score feed first.');game=await fetchSelectedGame(token,league,id,reserveSportsRequest);}}catch(e){throw new BoardError((e as Error).message,502);}
 runtime.possession=newPossessionCache();takeover=true;
 config.sportsSelection={league,gameId:id};config.sportLeague=league;config.sportsEnabled=true;config.mode='sports';runtime.current.until=0;runtime.sportsGame=game;runtime.sportsScene=gameScene(game,false,config.timezone);runtime.sportsFetchedAt=now();runtime.sportsUpdatedAt=now();runtime.sportsError=null;
 }
 else if(action==='sports-stop'){config.sportsSelection=null;config.mode='work';runtime.current.until=0;runtime.sportsGame=null;runtime.sportsScene=null;runtime.sportsUpdatedAt=null;runtime.sportsError=null;}
 else if(action==='pause'){if(typeof body.paused!=='boolean')throw new BoardError('Choose pause or resume.');config.paused=body.paused;takeover=!body.paused&&!runtime.standup.active;if(body.paused){runtime.takeoverPending=false;runtime.takeoverMessageId=null;}}
 else if(action==='cancel'){if(runtime.takeoverMessageId===body.id){runtime.takeoverPending=false;runtime.takeoverMessageId=null;}await db().prepare("UPDATE messages SET status='cancelled' WHERE id=? AND status='queued'").bind(String(body.id)).run();}
 else if(action==='standup-settings'){requireAdmin();if(typeof body.enabled!=='boolean')throw new BoardError('Choose whether the schedule is enabled.');const scene=validScene(body.text,'center',64);config.standup={enabled:body.enabled,text:scene.text};}
 else if(action==='settings'){requireAdmin();const s=body.settings as Record<string,unknown>;if(!s||typeof s.quietEnabled!=='boolean'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(s.quietStart))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(s.quietEnd)))throw new BoardError('Choose valid quiet hours.');config.quietEnabled=false;config.quietStart=String(s.quietStart);config.quietEnd=String(s.quietEnd);}
 else if(action==='scene'){requireAdmin();if(!['work','sports','guests','meeting'].includes(String(body.mode)))throw new BoardError('Choose a valid mode.');const mode=body.mode as Mode;config.scenes[mode]=validScene(body.text,config.scenes[mode].alignment,config.scenes[mode].accent);}
 else if(action==='connect'){requireAdmin();const kind=String(body.kind);if(!['vestaboard','github','sports','api-sports','big-balls'].includes(kind))throw new BoardError('Choose a supported connection.');const key=typeof body.secret==='string'&&body.secret.trim()?body.secret.trim():await secret(kind);if(!key||key.length>1000)throw new BoardError('Paste a valid API key.');if(kind==='vestaboard'){finishStandup(runtime,'Stopped because the board connection changed.');await request('https://cloud.vestaboard.com/',{'X-Vestaboard-Token':key});runtime.lastAccepted=null;runtime.lastMessageId=null;runtime.externalActive=false;runtime.takeoverPending=false;runtime.takeoverMessageId=null;runtime.lastForced=false;runtime.hardware=initialHardware();runtime.error=null;}
 if(kind==='github'){const repo=String(body.repo).trim();if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw new BoardError('Use an owner/repository name.');if(!['merged','updated','both'].includes(String(body.events)))throw new BoardError('Choose valid GitHub events.');const data=await pulls(key,repo);config.githubRepo=repo;config.githubEvents=body.events as Config['githubEvents'];config.githubEnabled=true;runtime.githubCursor=Math.max(now(),...data.map(p=>Date.parse(p.updated_at)));runtime.githubUpdatedAt=now();runtime.githubError=null;}
 if(kind==='sports'){let schedule:SportsGame[];try{schedule=await fetchSchedule(key,'NFL',now(),config.timezone,reserveSportsRequest);}catch(e){throw new BoardError((e as Error).message,502);}config.sportsEnabled=true;runtime.sportsLists={...runtime.sportsLists,NFL:{games:schedule,fetchedAt:now(),attemptedAt:now(),date:sportsDate(now(),config.timezone),error:null}};runtime.sportsFetchedAt=0;runtime.sportsError=null;}
 if(kind==='api-sports'||kind==='big-balls'){const priorKey=await secret(kind),u=runtime.college.usage[kind],priorHealth={blocked:u.blocked,retryAt:u.retryAt,checkedDay:u.checkedDay,error:u.error};try{await (await collegeClient(config,runtime,lease,{[kind]:key})).validate(kind);}catch(e){if(!(kind==='api-sports'&&e instanceof CollegeRateLimitError)){if(priorKey!==key)Object.assign(u,priorHealth);await save(config,runtime,lease);throw new BoardError((e as Error).message,502);}}config.sportsEnabled=true;delete runtime.sportsLists.NCAAF;runtime.sportsFetchedAt=0;}
 await putSecret(kind,key);}
 else if(action==='disconnect'){requireAdmin();const kind=String(body.kind);if(!['vestaboard','github','sports','api-sports','big-balls'].includes(kind))throw new BoardError('Choose a supported connection.');await db().prepare('DELETE FROM credentials WHERE kind=?').bind(kind).run();if(kind==='github')config.githubEnabled=false;if(kind==='sports'){delete runtime.sportsLists.NFL;delete runtime.sportsLists.NBA;if(config.sportsSelection?.league!=='NCAAF'){config.sportsSelection=null;runtime.sportsScene=null;runtime.sportsGame=null;runtime.sportsUpdatedAt=null;runtime.sportsError=null;}}if(kind==='api-sports'||kind==='big-balls'){delete runtime.sportsLists.NCAAF;runtime.college.active=null;runtime.college.reason=null;runtime.sportsFetchedAt=0;const keys=await collegeKeys();if(!keys['api-sports']&&!keys['big-balls']&&config.sportsSelection?.league==='NCAAF'){config.sportsSelection=null;runtime.sportsGame=null;runtime.sportsScene=null;runtime.sportsUpdatedAt=null;runtime.sportsError=null;}}if(kind==='vestaboard'){finishStandup(runtime,'Stopped because the board connection changed.');runtime.lastAccepted=null;runtime.lastMessageId=null;runtime.externalActive=false;runtime.takeoverPending=false;runtime.takeoverMessageId=null;runtime.lastForced=false;runtime.hardware=initialHardware();runtime.error=null;}}
 else throw new BoardError('Unknown action.');
 if(takeover){runtime.takeoverPending=true;runtime.takeoverMessageId=overrideId;runtime.externalActive=false;runtime.lastForced=false;runtime.retryAt=0;}
 await save(config,runtime,lease);
 // Saving credentials checks read access only. First physical write happens on Send, mode change, or the next controller check.
 if(action!=='connect'&&action!=='disconnect'&&action!=='hardware-check'&&action!=='standup-settings')await tickLocked(await row(),lease,false,overrideId,takeover);
 });return getState(user);}
async function authorizedToken(request:Request,expected:string|undefined){const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';if(!expected||!supplied)return false;const encoder=new TextEncoder();const a=await crypto.subtle.digest('SHA-256',encoder.encode(supplied));const b=await crypto.subtle.digest('SHA-256',encoder.encode(expected));const aa=new Uint8Array(a),bb=new Uint8Array(b);let result=0;for(let i=0;i<aa.length;i++)result|=aa[i]^bb[i];return result===0;}

export const authorizedController=(request:Request)=>authorizedToken(request,env.CONTROLLER_TOKEN);
export const authorizedEngineeringRunner=(request:Request)=>authorizedToken(request,env.ENGINEERING_RUNNER_TOKEN);
function engineeringConfig(){return engineeringSettings({ENGINEERING_REPOSITORY:env.ENGINEERING_REPOSITORY,ENGINEERING_BRANCH:env.ENGINEERING_BRANCH,ENGINEERING_WORKFLOWS:env.ENGINEERING_WORKFLOWS,ENGINEERING_HEALTH_URL:env.ENGINEERING_HEALTH_URL,ENGINEERING_WEBHOOK_SECRET:env.ENGINEERING_WEBHOOK_SECRET});}
async function engineeringState(runtime:Runtime):Promise<EngineeringState>{
 const settings=engineeringConfig(),rows=await db().prepare('SELECT payload FROM engineering_deployments').all<{payload:string}>();
 const known=rows.results.map(row=>JSON.parse(row.payload) as Deployment).filter(d=>d.repository.toLowerCase()===settings.repository.toLowerCase()&&d.branch===settings.branch);
 const deployments=Object.entries(settings.workflows).map(([workflow,label])=>known.find(d=>d.workflow===workflow)||{repository:settings.repository,branch:settings.branch,workflow,label,runId:0,attempt:0,createdAt:0,startedAt:0,updatedAt:0,rank:0,status:'unknown' as const,sha:'',url:''});
 return {connected:!!settings.webhookSecret&&!!settings.repository&&deployments.length>0,repository:settings.repository,branch:settings.branch,deployments,health:currentHealth(runtime.engineering.health,now()),healthConfigured:!!settings.healthUrl,runnerActive:!!runtime.engineering.lastBackground&&now()-runtime.engineering.lastBackground<15*60000,lastBackground:runtime.engineering.lastBackground};
}
async function pollEngineeringHealth(runtime:Runtime){
 const settings=engineeringConfig();if(!settings.healthUrl||now()-runtime.engineering.lastPoll<120000)return;
 runtime.engineering.lastPoll=now();let up=false,accessUnknown=false,sha:string|null=null,reason:string|null=null;
 try{const url=new URL(settings.healthUrl);if(url.protocol!=='https:')throw new Error('HTTPS required');const response=await fetch(url,{headers:{'User-Agent':'Tandem-Office-Board/1.0',Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)});
 accessUnknown=[401,403,429].includes(response.status)||(response.status>=300&&response.status<400);reason=response.ok?'The endpoint did not return a valid health response.':accessUnknown?'The health check was redirected, blocked, or rate limited.':`The health check returned HTTP ${response.status}.`;if(response.ok){const raw=await response.text();if(raw.length<=4096){const body=JSON.parse(raw);up=body.status==='ok'&&body.service==='tandem-backend';if(up&&/^[a-f0-9]{40}$/i.test(body.build_sha||''))sha=body.build_sha.slice(0,7);}}
 }catch{reason='The health check could not reach the API.';}
 const failures=up||accessUnknown?0:runtime.engineering.health.failures+1;
 runtime.engineering.health={status:up?'up':failures>=2?'down':'unknown',checkedAt:now(),failures,sha,reason:up?null:reason};
}
export async function getEngineeringStatus(){await init();return engineeringState(parse(await row()).runtime);}
export async function runEngineeringTick(checkHealth=true){
 await init();return withLease(async(r,lease)=>{const {config,runtime}=parse(r);if(checkHealth){await pollEngineeringHealth(runtime);runtime.engineering.lastBackground=now();}await save(config,runtime,lease);
 if(config.mode==='engineering')await tickLocked(await row(),lease,false,null,false,true);
 const latest=parse(await row());return {ok:true,...await engineeringState(latest.runtime),following:latest.config.mode==='engineering',boardError:latest.config.mode==='engineering'?(latest.runtime.error||latest.runtime.hardware.error):null};});
}
export async function receiveEngineeringEvent(raw:Uint8Array,signature:string|null,event:string|null){
 const settings=engineeringConfig();if(!await validWebhookSignature(raw,signature,settings.webhookSecret))throw new BoardError('Invalid webhook signature.',401);
 let payload:unknown;try{payload=JSON.parse(new TextDecoder().decode(raw));}catch{throw new BoardError('Invalid JSON.');}
 if(event==='ping')return {ok:true,changed:false};if(event!=='workflow_run')return {ok:true,changed:false};
 const deployment=normalizeWorkflow(payload,settings,now());if(!deployment)return {ok:true,changed:false};
 await init();const d=deployment;
 // Materialize each workflow atomically before touching the board lease. A busy
 // writer cannot lose an event; the runner can display this state later.
 const result=await db().prepare(`INSERT INTO engineering_deployments(workflow,payload,started_at,run_id,attempt,rank,updated_at,received_at) VALUES(?,?,?,?,?,?,?,?)
 ON CONFLICT(workflow) DO UPDATE SET payload=excluded.payload,started_at=excluded.started_at,run_id=excluded.run_id,attempt=excluded.attempt,rank=excluded.rank,updated_at=excluded.updated_at,received_at=excluded.received_at
 WHERE (excluded.run_id!=engineering_deployments.run_id AND (excluded.started_at>engineering_deployments.started_at OR
 (excluded.started_at=engineering_deployments.started_at AND excluded.run_id>engineering_deployments.run_id))) OR
 (excluded.run_id=engineering_deployments.run_id AND (excluded.attempt>engineering_deployments.attempt OR
 (excluded.attempt=engineering_deployments.attempt AND (excluded.rank>engineering_deployments.rank OR (excluded.rank=engineering_deployments.rank AND excluded.updated_at>engineering_deployments.updated_at)))))`).bind(`${d.repository.toLowerCase()}:${d.branch}:${d.workflow}`,JSON.stringify(d),d.startedAt,d.runId,d.attempt,d.rank,d.updatedAt,now()).run();
 return {ok:true,changed:!!result.meta.changes};
}

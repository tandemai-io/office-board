import {COLLEGE_TEAMS} from './college-teams';
import {orderGames,type SportsGame,type SportsTeam,type GameState} from './sports';
import {sportsDate} from './sports-api';

export type CollegeProvider='api-sports'|'big-balls';
export type CollegeQuota={used:number;limit:number;remaining:number;reserve:number;verified:boolean;retryAt:number;blocked:boolean};
export class CollegeRateLimitError extends Error {}
type Usage={day:string;calls:number;remaining:number|null;blocked:boolean;retryAt:number;recent:number[];checkedDay?:string};
type Reference={game:SportsGame;ids:Partial<Record<CollegeProvider,string>>};
export type CollegeBook={usage:Record<CollegeProvider,Usage>;season:number|null;seasonChecked:number;references:Record<string,Reference>;active:CollegeProvider|null;reason:string|null};
export const COLLEGE_REFRESH_MS=120000,COLLEGE_CATALOG_MS=600000,COLLEGE_STALE_MS=360000;
const CAPS:Record<CollegeProvider,number>={'api-sports':100,'big-balls':250};
export const providerName=(p:CollegeProvider)=>p==='api-sports'?'API-Sports':'Big Balls';
const utcDay=(time:number)=>new Date(time).toISOString().slice(0,10);
const emptyUsage=():Usage=>({day:'',calls:0,remaining:null,blocked:false,retryAt:0,recent:[]});
export function newCollegeBook():CollegeBook{return {usage:{'api-sports':emptyUsage(),'big-balls':emptyUsage()},season:null,seasonChecked:0,references:{},active:null,reason:null};}
function usage(book:CollegeBook,p:CollegeProvider,time:number){const u=book.usage[p];if(u.day!==utcDay(time)){u.day=utcDay(time);u.calls=0;u.remaining=null;u.retryAt=0;u.recent=[];}return u;}
export function quotaSummary(book:CollegeBook,time=Date.now()) {return Object.fromEntries((['api-sports','big-balls'] as const).map(p=>{const u=usage(book,p,time);return [p,{used:u.calls,limit:CAPS[p],remaining:Math.max(0,Math.min(CAPS[p]-u.calls,u.remaining??CAPS[p])),reserve:10,verified:!!u.checkedDay,retryAt:u.retryAt,blocked:u.blocked}];})) as Record<CollegeProvider,CollegeQuota>;}
const clean=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases=new Map<string,(typeof COLLEGE_TEAMS)[number]|null>();
for(const team of COLLEGE_TEAMS)for(const alias of team.aliases){const key=clean(alias);const found=aliases.get(key);aliases.set(key,found&&found.id!==team.id?null:found===null?null:team);}
// Map the school's hue to the physical board's eight colors, preserving navy/gold.
export function flapColor(hex:string):number {const rgb=hex.match(/../g)?.map(x=>parseInt(x,16));if(!rgb||rgb.length!==3)return 69;const [r,g,b]=rgb,max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min;if(delta<24)return max<85?70:69;let hue=max===r?(g-b)/delta:max===g?(b-r)/delta+2:(r-g)/delta+4;hue=(hue*60+360)%360;return hue<10||hue>=330?63:hue<38?64:hue<75?65:hue<170?66:hue<260?67:68;}
export function collegeTeam(name:string,points:unknown,shortName?:string|null):SportsTeam {const found=aliases.get(clean(name))||null;const score=typeof points==='number'&&Number.isInteger(points)&&points>=0&&points<=999?points:null;return {name:name.slice(0,100),abbreviation:(found?.abbreviation||shortName||name.split(/\s+/).map(w=>w[0]).join('')).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4)||'TEAM',identity:found?`school:${found.id}`:`name:${clean(name)}`,score,colors:found?[flapColor(found.color),flapColor(found.alternateColor)]:[69,70]};}
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const points=(state:GameState,v:unknown)=>state==='scheduled'?null:v;
export function normalizeCollege(raw:any,p:CollegeProvider,timeZone='America/Los_Angeles'):SportsGame {
 const as=p==='api-sports';const native=String(as?raw.game?.id:raw.id);
 if(!(as?/^[1-9]\d{0,17}$/.test(native):uuid.test(native)))throw new Error('The college feed returned an incomplete game.');
 const home=as?raw.teams?.home:raw.home,away=as?raw.teams?.away:raw.away;
 if(typeof home?.name!=='string'||typeof away?.name!=='string')throw new Error('The college feed returned incomplete teams.');
 const short=as?raw.game?.status?.short:raw.status;
 const states:Record<string,GameState>={NS:'scheduled',Q1:'in_progress',Q2:'in_progress',Q3:'in_progress',Q4:'in_progress',HT:'in_progress',OT:'in_progress',FT:'final',AOT:'final',PST:'postponed',CANC:'canceled',scheduled:'scheduled',live:'in_progress',in_progress:'in_progress',finished:'final',postponed:'postponed',cancelled:'canceled',suspended:'suspended'};
 const state=states[short]||'unknown';const status=short==='HT'?'Halftime':state==='in_progress'?(as&&/^Q[1-4]$/.test(short)?short:'Live'):state==='final'?'Final':state==='unknown'?'Status unavailable':state.replace('_',' ');
 const timestamp=as?Number(raw.game?.date?.timestamp)*1000:Date.parse(raw.kickoff_utc);
 if(!Number.isFinite(timestamp)||timestamp<=0)throw new Error('The college feed returned an invalid kickoff.');
 const timer=as?raw.game?.status?.timer:null;const clock=state==='in_progress'&&typeof timer==='string'&&/^\d{1,2}:\d{2}$/.test(timer)?timer:null;
 return {id:(as?'as:':'bb:')+native,league:'NCAAF',provider:p,startsAt:new Date(timestamp).toISOString(),date:sportsDate(timestamp,timeZone),state,status,period:as&&/^Q[1-4]$/.test(short)?Number(short[1]):as&&short==='OT'?5:null,clock,home:collegeTeam(home.name,points(state,as?raw.scores?.home?.total:raw.score?.home),home.short_name),away:collegeTeam(away.name,points(state,as?raw.scores?.away?.total:raw.score?.away),away.short_name),preseason:false};
}
export function sameCollegeTeams(a:SportsGame,b:SportsGame){return !!a.home.identity&&a.home.identity===b.home.identity&&a.away.identity===b.away.identity;}
export function sameCollegeGame(a:SportsGame,b:SportsGame){return sameCollegeTeams(a,b)&&!!a.startsAt&&!!b.startsAt&&Math.abs(Date.parse(a.startsAt)-Date.parse(b.startsAt))<=90*60000;}

// Mutations run under the shared controller lease. Persist BEFORE each attempted
// network call, including failures, so reloads/key edits cannot reset the budget.
export class CollegeClient {
 constructor(private book:CollegeBook,private keys:Partial<Record<CollegeProvider,string|null>>,private persist:()=>Promise<void>,private time=Date.now(),private timeZone='America/Los_Angeles'){}
 private async request(p:CollegeProvider,path:string,billable=true):Promise<any>{
  const u=usage(this.book,p,this.time),key=this.keys[p];if(!key)throw new Error(`Connect ${providerName(p)} for college football.`);
  const left=Math.min(CAPS[p]-u.calls,u.remaining??CAPS[p]);
  if(u.blocked)throw new Error(`${providerName(p)} rejected its key. Update the college connection.`);
  if(u.retryAt>this.time)throw new Error(`${providerName(p)} is cooling down. Scores will retry.`);
  if(billable&&left<=10)throw new Error(`${providerName(p)} is near its free daily limit.`);
  u.recent=u.recent.filter(t=>t>this.time-60000);if(u.recent.length>=(p==='api-sports'?10:100))throw new Error(`${providerName(p)} is catching up. Try again in a minute.`);
  u.recent.push(this.time);if(billable){u.calls++;if(u.remaining!==null)u.remaining=Math.max(0,u.remaining-1);}await this.persist();
  let response:Response;try{response=await fetch((p==='api-sports'?'https://v1.american-football.api-sports.io':'https://api.bigballsdata.com')+path,{headers:p==='api-sports'?{'x-apisports-key':key}:{'x-api-key':key},signal:AbortSignal.timeout(8000)});}catch{throw new Error(`${providerName(p)} did not respond. Scores will retry.`);}
  if(p==='api-sports'){const header=response.headers.get('x-ratelimit-requests-remaining');if(header!==null&&Number.isFinite(Number(header)))u.remaining=Math.max(0,Math.min(u.remaining??CAPS[p],CAPS[p]-u.calls,Number(header)));}
  let data:any;try{data=await response.json();}catch{await this.persist();throw new Error(`${providerName(p)} returned an unreadable response.`);}
  if(response.status===401||response.status===403)u.blocked=true;
  if(response.status===429){if(p==='big-balls'&&data.meta?.limiting_bucket==='day')u.remaining=0;const retry=Number(response.headers.get('Retry-After'));const breaker=response.headers.get('X-RateLimit-4xx-Cooldown');u.retryAt=this.time+Math.max(breaker?600000:60000,Number.isFinite(retry)?retry*1000:60000);}
  const apiErrors=p==='api-sports'&&data.errors&&Object.keys(data.errors).length;
  let detail=apiErrors?Object.values(data.errors).filter(v=>typeof v==='string').join(' '):'';
  for(const savedKey of Object.values(this.keys))if(savedKey)detail=detail.split(savedKey).join('[key hidden]');
  detail=detail.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[account hidden]').slice(0,220);
  const minuteLimit=(response.ok||response.status===429)&&!!apiErrors&&/requests per minute/i.test(detail);
  if(apiErrors)u.retryAt=this.time+(minuteLimit?60000:600000);
  await this.persist();
  if(minuteLimit)throw new CollegeRateLimitError(`API-Sports: ${detail}`);
  if(!response.ok)throw new Error(response.status===401||response.status===403?`${providerName(p)} rejected its key. Update the college connection.`:response.status===429?`${providerName(p)} reached a free rate limit.`:`${providerName(p)} is unavailable (HTTP ${response.status}).`);
  if(apiErrors)throw new Error(detail?`API-Sports: ${detail}`:'API-Sports could not load college data.');
  if(p==='big-balls'&&data.error)throw new Error('Big Balls could not provide this college game.');
  return data;
 }
 private async syncUsage(p:CollegeProvider){const u=usage(this.book,p,this.time);if(u.checkedDay===u.day)return;
  if(p==='api-sports'){const data=await this.request(p,'/status',false);const info=data.response;if(!info?.subscription?.active||!Number.isFinite(info?.requests?.current))throw new Error('API-Sports has no active subscription. Activate the free American Football plan.');u.calls=Math.max(u.calls,info.requests.current);u.remaining=Math.min(u.remaining??100,Math.max(0,100-u.calls));}
  else {const data=await this.request(p,'/v1/usage');if(!Number.isFinite(data.data?.used_today)||!Number.isFinite(data.data?.remaining_today))throw new Error('Big Balls daily usage is unavailable.');u.calls=Math.max(u.calls,data.data.used_today);u.remaining=Math.max(0,Math.min(u.remaining??250,250-u.calls,data.data.remaining_today));}
  u.checkedDay=u.day;await this.persist();
 }
 async validate(p:CollegeProvider){const u=usage(this.book,p,this.time);u.blocked=false;u.retryAt=0;u.checkedDay=undefined;await this.syncUsage(p);
  if(p==='big-balls')await this.catalog(p,sportsDate(this.time,this.timeZone));
 }
 private async season(){if(this.book.season&&this.time-this.book.seasonChecked<86400000)return this.book.season;const data=await this.request('api-sports','/leagues?id=2');const entry=data.response?.find((l:any)=>l.league?.id===2);const seasons=entry?.seasons?.filter((s:any)=>(s.current===true||s.current==='true'||(Date.parse(s.start)<=this.time&&Date.parse(s.end)+86400000>this.time))&&Number.isInteger(Number(s.year)));if(!seasons||seasons.length!==1)throw new Error('The current college football season is unavailable.');this.book.season=Number(seasons[0].year);this.book.seasonChecked=this.time;await this.persist();return this.book.season;}
 private async catalog(p:CollegeProvider,date:string):Promise<SportsGame[]>{let rows:any[];
  if(p==='api-sports'){const season=await this.season();const query=new URLSearchParams({league:'2',season:String(season),date,timezone:this.timeZone});const data=await this.request(p,`/games?${query}`);rows=data.response;}
  else {const query=new URLSearchParams({sport:'american_football',league:'ncaaf',date,tz:this.timeZone,limit:'200',offset:'0'});const data=await this.request(p,`/v1/matches?${query}`);rows=data.data;if(Array.isArray(rows)&&rows.length>=200)throw new Error('The college schedule is too large to load completely. Try again later.');}
  if(!Array.isArray(rows))throw new Error(`${providerName(p)} returned an incomplete schedule.`);return orderGames(rows.map(row=>normalizeCollege(row,p,this.timeZone)));
 }
 private available(p:CollegeProvider){const u=usage(this.book,p,this.time);return !!this.keys[p]&&!u.blocked&&u.retryAt<=this.time&&Math.min(CAPS[p]-u.calls,u.remaining??CAPS[p])>10;}
 private async withFallback<T>(run:(p:CollegeProvider)=>Promise<T>):Promise<T>{let error='Both college feeds are near their free limits or unavailable. Last scores are held; daily quotas reset at midnight UTC.';for(const p of ['api-sports','big-balls'] as const){if(!this.available(p))continue;try{await this.syncUsage(p);if(!this.available(p))continue;const result=await run(p);this.book.active=p;this.book.reason=p==='big-balls'?'Using the free backup while API-Sports is near its limit or unavailable.':null;await this.persist();return result;}catch(e){error=(e as Error).message;}}throw new Error(error);}
 private remember(game:SportsGame,p:CollegeProvider){const candidates=Object.entries(this.book.references).filter(([,r])=>sameCollegeGame(r.game,game));const stable=candidates.length===1?candidates[0][0]:game.id;const previous=this.book.references[stable];this.book.references[stable]={game:{...game,id:stable},ids:{...previous?.ids,[p]:game.id.slice(3)}};return {...game,id:stable};}
 async schedule(){return this.withFallback(async p=>{const games=await this.catalog(p,sportsDate(this.time,this.timeZone));for(const [id,r] of Object.entries(this.book.references))if(this.time-Date.parse(r.game.startsAt||'')>7*86400000)delete this.book.references[id];return games.map(g=>this.remember(g,p));});}
 async selected(id:string){const reference=this.book.references[id];if(!reference)throw new Error('Refresh the college game list before selecting a game.');return this.withFallback(async p=>{
  const native=reference.ids[p];let game:SportsGame;
  if(native){const data=await this.request(p,p==='api-sports'?`/games?id=${encodeURIComponent(native)}`:`/v1/matches/${encodeURIComponent(native)}?sport=american_football`);const raw=p==='api-sports'?data.response?.length===1?data.response[0]:null:data.data;if(!raw)throw new Error('The selected college game is unavailable.');game=normalizeCollege(raw,p,this.timeZone);if(game.id.slice(3)!==native||!sameCollegeTeams(reference.game,game))throw new Error('The college feed returned a different game. Last scores are held.');}
  else {const games=await this.catalog(p,sportsDate(Date.parse(reference.game.startsAt!),this.timeZone));const matches=games.filter(g=>sameCollegeGame(reference.game,g));if(matches.length!==1)throw new Error('The backup cannot uniquely match this college game. Last scores are held.');game=matches[0];}
  reference.ids[p]=game.id.slice(3);reference.game={...game,id};return {...game,id};
 });}
}

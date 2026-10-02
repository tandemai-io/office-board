import {normalizeGame,orderGames,type ProviderGame,type SportsGame,type SportsLeague} from './sports';
export const GAME_REFRESH_MS=30000;
export const SCHEDULE_REFRESH_MS=120000;
export const STALE_GAME_MS=120000;
export function sportsDate(time=Date.now(),timeZone='America/Los_Angeles') {return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(time);}
const endpoint=(league:SportsLeague)=>`https://api.balldontlie.io/${league==='NFL'?'nfl/v1/games':'v1/games'}`;
async function provider(url:string,key:string,beforeRequest?:()=>Promise<void>){await beforeRequest?.();let response:Response;try{response=await fetch(url,{headers:{Authorization:key},signal:AbortSignal.timeout(8000)});}catch{throw new Error('The score feed did not respond. We will retry.');}if(response.status===429)throw new Error('The score feed is busy. We will retry shortly.');if(response.status===401)throw new Error('The score feed rejected the API key. Check the sports connection.');if(!response.ok)throw new Error(`The score feed returned HTTP ${response.status}. We will retry.`);return response.json() as Promise<{data:ProviderGame[]|ProviderGame;meta?:{next_cursor?:number|null}}>;} 
export async function fetchSchedule(key:string,league:SportsLeague,time=Date.now(),timeZone='America/Los_Angeles',beforeRequest?:()=>Promise<void>):Promise<SportsGame[]> {
 const today=sportsDate(time,timeZone),anchor=Date.parse(today+'T12:00:00Z');
 const query=new URLSearchParams({per_page:'100'});
 for(let offset=-1;offset<=3;offset++)query.append('dates[]',new Date(anchor+offset*86400000).toISOString().slice(0,10));
 if(league==='NFL')for(const type of ['1','2','3'])query.append('season_types[]',type);
 const normal=await provider(`${endpoint(league)}?${query}`,key,beforeRequest);
 if(!Array.isArray(normal.data)||normal.meta?.next_cursor)throw new Error('The score schedule could not be fully loaded. Try again shortly.');
 const result=normal.data.map(g=>normalizeGame(g,league));
 if(league==='NBA'){const preseason=await provider(`${endpoint(league)}?${query}&season_type=preseason`,key,beforeRequest);if(!Array.isArray(preseason.data)||preseason.meta?.next_cursor)throw new Error('The preseason schedule could not be fully loaded. Try again shortly.');result.push(...preseason.data.map(g=>normalizeGame(g,league,true)));}
 const unique=[...new Map(result.map(g=>[g.id,g])).values()];
 return orderGames(unique.filter(g=>g.state==='in_progress'||g.date>=today));
}
export async function fetchSelectedGame(key:string,league:SportsLeague,id:string,beforeRequest?:()=>Promise<void>):Promise<SportsGame>{
 const data=await provider(`${endpoint(league)}/${id}`,key,beforeRequest);
 if(Array.isArray(data.data)||!data.data||String(data.data.id)!==id)throw new Error('The followed game is unavailable. Choose another game or try again later.');
 return normalizeGame(data.data,league);
}

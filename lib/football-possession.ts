import {collegeTeam} from './college-api';
import {canonicalTeamAbbreviation} from './team-colors';
import {canShowPossession,POSSESSION_STALE_MS,type SportsGame,type SportsTeam} from './sports';

export type PossessionCache={key:string|null;eventId:string|null;attemptedAt:number;discoveryAt:number;team:'home'|'away'|null;updatedAt:number|null};
export const newPossessionCache=():PossessionCache=>({key:null,eventId:null,attemptedAt:0,discoveryAt:0,team:null,updatedAt:null});
const REFRESH_MS=30000,DISCOVERY_MS=300000;
type Competitor={id?:string;homeAway?:string;possession?:boolean;team?:{id?:string;displayName?:string;abbreviation?:string}};
type Competition={id?:string;date?:string;competitors?:Competitor[];status?:{type?:{state?:string;completed?:boolean;name?:string;description?:string}};situation?:{possession?:string}};
type Feed={events?:{id?:string;date?:string;competitions?:Competition[]}[];header?:{competitions?:Competition[]}};

function sameTeam(team:SportsTeam,other:Competitor,league:SportsGame['league']){
 if(league==='NCAAF')return !!team.identity&&team.identity===collegeTeam(other.team?.displayName||'',null,other.team?.abbreviation).identity;
 return !!other.team?.abbreviation&&canonicalTeamAbbreviation(league,team.abbreviation)===canonicalTeamAbbreviation(league,other.team.abbreviation);
}
function matches(game:SportsGame,c:Competition,date?:string){
 const kickoff=Date.parse(c.date||date||''),selectedKickoff=Date.parse(game.startsAt||'');
 if(!Number.isFinite(selectedKickoff)||!Number.isFinite(kickoff)||Math.abs(kickoff-selectedKickoff)>90*60000)return false;
 const teams=c.competitors||[],home=teams.filter(t=>t.homeAway==='home'),away=teams.filter(t=>t.homeAway==='away');
 return home.length===1&&away.length===1&&sameTeam(game.home,home[0],game.league)&&sameTeam(game.away,away[0],game.league);
}
export function possessionFromCompetition(game:SportsGame,c:Competition):'home'|'away'|null {
 const status=c.status?.type;
 if(!matches(game,c)||status?.state!=='in'||status.completed||/halftime|intermission|end.of/i.test(`${status.name||''} ${status.description||''}`))return null;
 const teams=c.competitors||[],flagged=teams.filter(t=>t.possession===true);
 if(flagged.length>1)return null;
 const explicit=c.situation?.possession,identified=explicit?teams.filter(t=>String(t.team?.id||t.id)===String(explicit)):[];
 if(explicit&&identified.length!==1)return null;
 if(flagged.length===1&&identified.length===1&&flagged[0]!==identified[0])return null;
 const team=flagged[0]||identified[0];
 return team?.homeAway==='home'||team?.homeAway==='away'?team.homeAway:null;
}
async function read(url:string):Promise<Feed>{const response=await fetch(url,{signal:AbortSignal.timeout(4000),headers:{Accept:'application/json'}});if(!response.ok)throw new Error('Possession unavailable.');return await response.json() as Feed;}
export async function updateFootballPossession(game:SportsGame,cache:PossessionCache,time=Date.now()):Promise<SportsGame>{
 const snapshot=()=>({...game,possession:cache.updatedAt&&time-cache.updatedAt<POSSESSION_STALE_MS?cache.team:null,possessionUpdatedAt:cache.updatedAt});
 if(!canShowPossession(game)){cache.team=null;cache.updatedAt=null;return snapshot();}
 const key=`${game.league}:${game.id}:${game.startsAt}`;
 if(cache.key!==key)Object.assign(cache,newPossessionCache(),{key});
 if(cache.attemptedAt&&time-cache.attemptedAt<REFRESH_MS)return snapshot();
 cache.attemptedAt=time;cache.team=null;cache.updatedAt=null;
 const base=`https://site.api.espn.com/apis/site/v2/sports/football/${game.league==='NCAAF'?'college-football':'nfl'}`;
 try{
  if(!cache.eventId){
   if(cache.discoveryAt&&time-cache.discoveryAt<DISCOVERY_MS)return snapshot();
   cache.discoveryAt=time;
   if(!game.startsAt||!Number.isFinite(Date.parse(game.startsAt)))return snapshot();
   // ESPN's football date filter uses one Eastern calendar date, including
   // evening games whose UTC kickoff falls on the following day.
   const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.parse(game.startsAt)).replace(/-/g,'');
   const data=await read(`${base}/scoreboard?dates=${day}&limit=1000${game.league==='NCAAF'?'&groups=80':''}`);
   const events=Array.isArray(data.events)?data.events:[];
   const found=events.filter((e:{id?:string;date?:string;competitions?:Competition[]})=>/^\d{1,18}$/.test(e.id||'')&&(e.competitions||[]).some(c=>matches(game,c,e.date)));
   if(found.length!==1)return snapshot();
   cache.eventId=String(found[0].id);
  }
  // The summary exposes explicit competitor.possession booleans. Scores still
  // come from the configured score feed; never infer possession from the last play.
  const data=await read(`${base}/summary?event=${cache.eventId}`);
  const competitions=Array.isArray(data.header?.competitions)?data.header.competitions:[];
  const found=competitions.filter((c:Competition)=>String(c.id)===cache.eventId&&matches(game,c));
  if(found.length!==1){cache.eventId=null;return snapshot();}
  cache.team=possessionFromCompetition(game,found[0]);cache.updatedAt=cache.team?time:null;
 }catch{/* Possession is optional: clear the marker without interrupting scores. */}
 return snapshot();
}

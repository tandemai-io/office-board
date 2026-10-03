import { formatBoard } from './board';
import { teamColorStrip } from './team-colors';
export type SportsLeague = 'NFL' | 'NBA' | 'NCAAF';
export type GameState = 'scheduled' | 'in_progress' | 'final' | 'postponed' | 'canceled' | 'delayed' | 'suspended' | 'abandoned' | 'unknown';
export type SportsSelection = {league:SportsLeague;gameId:string};
export type SportsTeam = {name:string;abbreviation:string;score:number|null;identity?:string;colors?:[number,number]};
export type SportsGame = {id:string;league:SportsLeague;startsAt:string|null;date:string;state:GameState;status:string;period:number|null;clock:string|null;home:SportsTeam;away:SportsTeam;preseason:boolean;provider?:'api-sports'|'big-balls'};
export type GamesResult = {league:SportsLeague;games:SportsGame[];fetchedAt:number|null;connected:boolean;error:string|null;provider?:string|null};
export type ProviderGame = {id:number|string;date?:string;datetime?:string|null;status?:string;status_state?:string;period?:number;time?:string;postponed?:boolean;season_type?:string|number;home_team_score?:number|null;visitor_team_score?:number|null;home_team?:{full_name?:string;name?:string;abbreviation?:string};visitor_team?:{full_name?:string;name?:string;abbreviation?:string}};
const STATES:GameState[]=['scheduled','in_progress','final','postponed','canceled','delayed','suspended','abandoned','unknown'];
export const isTerminalGame=(game:SportsGame)=>['final','canceled','abandoned'].includes(game.state);
export const validLeague=(value:unknown):value is SportsLeague=>value==='NFL'||value==='NBA'||value==='NCAAF';
export const validGameId=(value:unknown):value is string=>typeof value==='string'&&(/^[1-9]\d{0,17}$/.test(value)||/^as:[1-9]\d{0,17}$/.test(value)||/^bb:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value));
export function normalizeGame(raw:ProviderGame,league:SportsLeague,preseason=false):SportsGame {
 if(!validGameId(String(raw.id))||!raw.home_team?.abbreviation||!raw.visitor_team?.abbreviation)throw new Error('The score feed returned an incomplete game.');
 const status=typeof raw.status==='string'?raw.status:'Unknown';
 let state:GameState=STATES.includes(raw.status_state as GameState)?raw.status_state as GameState:'unknown';
 if(state==='unknown'){if(raw.postponed||/postpon/i.test(status))state='postponed';else if(/cancel/i.test(status))state='canceled';else if(/abandon/i.test(status))state='abandoned';else if(/final|complete|finished/i.test(status))state='final';else if(/delay/i.test(status))state='delayed';else if(/suspend/i.test(status))state='suspended';else if(/progress|qtr|quarter|halftime|overtime/i.test(status)||(raw.period||0)>0)state='in_progress';else if(raw.datetime||/\d.*(?:am|pm)/i.test(status))state='scheduled';}
 const score=(value:unknown)=>state==='scheduled'?null:typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=999?value:null;
 const team=(value:NonNullable<ProviderGame['home_team']>,points:unknown):SportsTeam=>({name:(value.full_name||value.name||value.abbreviation||'Team').slice(0,100),abbreviation:value.abbreviation!.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5),score:score(points)});
 const timestamp=raw.datetime||raw.date||null;
 const startsAt=timestamp&&timestamp.includes('T')&&Number.isFinite(Date.parse(timestamp))?timestamp:null;
 const clock=league==='NBA'&&state==='in_progress'&&typeof raw.time==='string'&&/^\d{1,2}:\d{2}$/.test(raw.time.trim())?raw.time.trim():null;
 return {id:String(raw.id),league,startsAt,date:raw.date?.slice(0,10)||startsAt?.slice(0,10)||'',state,status,period:typeof raw.period==='number'?raw.period:null,clock,home:team(raw.home_team,raw.home_team_score),away:team(raw.visitor_team,raw.visitor_team_score),preseason:preseason||raw.season_type==='preseason'||raw.season_type===1};
}
export function orderGames(games:SportsGame[]) {const rank=(g:SportsGame)=>g.state==='in_progress'?0:g.state==='scheduled'?1:g.state==='final'?3:2;return [...games].sort((a,b)=>rank(a)-rank(b)||(a.startsAt||a.date).localeCompare(b.startsAt||b.date)||a.id.localeCompare(b.id));}
export function gameStatus(game:SportsGame,timeZone='America/Los_Angeles'):string {
 if(game.state==='scheduled')return game.startsAt?new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(Date.parse(game.startsAt)):game.status;
 if(game.state==='in_progress'&&/halftime|intermission|end of/i.test(game.status))return game.status;
 if(game.state==='in_progress'&&game.clock){const period=game.period||0;return `${period>4?'OT'+(period-4):period?'Q'+period:'LIVE'} ${game.clock}`;}
 return game.state==='final'?'Final':game.state==='unknown'?game.status:game.status||game.state.replace('_',' ');
}
export function gameScene(game:SportsGame,stale=false,timeZone='America/Los_Angeles') {
 const live=game.state==='in_progress';
 const label=stale?'SCORES DELAYED':live?'LIVE':game.state==='final'?'FINAL':game.state==='scheduled'?'UPCOMING':game.state.toUpperCase();
 const points=(score:number|null)=>score===null?'--':String(score);
 const detail=gameStatus(game,timeZone).toUpperCase().replace(/[^A-Z0-9 :/.,'-]/g,'').slice(0,22);
 const scene={text:`${game.league} ${label}\n\n${game.away.abbreviation} ${points(game.away.score)} - ${points(game.home.score)} ${game.home.abbreviation}\n\n${detail}`,alignment:'center' as const,accent:67};
 const grid=formatBoard(scene.text,scene.alignment,scene.accent);
 grid[5]=teamColorStrip(game.league,game.away.abbreviation,game.home.abbreviation,game.away.colors,game.home.colors);
 return {...scene,grid};
}

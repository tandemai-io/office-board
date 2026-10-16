import type {CurrentMessage} from './board';
export const STANDUP_TIMEZONE='America/Los_Angeles';
export {DEFAULT_STANDUP,type StandupSettings} from './board';
export type StandupRun={key:string;endsAt:number;phase:'starting'|'showing'|'restoring';grid:number[][];previous:CurrentMessage;previousExternal:boolean;remainingMs:number;originalMessageId:string|null;messageId:string|null;attempted:boolean};
export type StandupRuntime={active:StandupRun|null;lastWindow:string|null;lastResult:string|null;error:string|null;runnerReady:boolean;lastBackground:number|null};
export const newStandupRuntime=():StandupRuntime=>({active:null,lastWindow:null,lastResult:null,error:null,runnerReady:false,lastBackground:null});
function parts(at:number){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:STANDUP_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(at).map(p=>[p.type,p.value]));}
export function standupWindow(at:number){
 const p=parts(at),minute=Number(p.hour)*60+Number(p.minute);
 if(!['Mon','Tue','Wed','Thu','Fri'].includes(p.weekday)||minute<600||minute>=630)return null;
 const startsAt=at-(minute-600)*60000-Number(p.second)*1000-(at%1000);
 return {key:`standup:${p.year}-${p.month}-${p.day}`,startsAt,endsAt:startsAt+30*60000};
}
export function nextStandup(at:number){
 const p=parts(at),date=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day));
 for(let day=0;day<8;day++){
  const local=new Date(date+day*86400000);if(local.getUTCDay()===0||local.getUTCDay()===6)continue;
  const target=local.getTime()+10*3600000;let candidate=target;
  for(let pass=0;pass<3;pass++){const q=parts(candidate),represented=Date.UTC(Number(q.year),Number(q.month)-1,Number(q.day),Number(q.hour),Number(q.minute),Number(q.second));candidate+=target-represented;}
  if(candidate>at)return candidate;
 }
 return null;
}

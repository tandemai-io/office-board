import type {Scene} from './board';

export type DeployStatus='queued'|'deploying'|'succeeded'|'failed'|'cancelled'|'unknown';
export type Deployment={repository:string;branch:string;workflow:string;label:string;runId:number;attempt:number;createdAt:number;startedAt:number;updatedAt:number;rank:number;status:DeployStatus;sha:string;url:string};
export type Health={status:'up'|'down'|'unknown';checkedAt:number|null;failures:number;sha:string|null;reason?:string|null};
export type EngineeringRuntime={health:Health;lastPoll:number;lastBackground:number|null};
export type EngineeringState={connected:boolean;repository:string;branch:string;deployments:Deployment[];health:Health;healthConfigured:boolean;runnerActive:boolean;lastBackground:number|null};
export type EngineeringSettings={repository:string;branch:string;workflows:Record<string,string>;healthUrl:string;webhookSecret:string};
export const newEngineeringRuntime=():EngineeringRuntime=>({health:{status:'unknown',checkedAt:null,failures:0,sha:null},lastPoll:0,lastBackground:null});
export function engineeringSettings(values:Record<string,string|undefined>):EngineeringSettings{
 let workflows:Record<string,string>={};
 try{const parsed=JSON.parse(values.ENGINEERING_WORKFLOWS||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))for(const [path,label] of Object.entries(parsed).slice(0,10))if(/^[\w.-]+\.ya?ml$/.test(path)&&typeof label==='string'&&/^[A-Z0-9 ]{1,10}$/.test(label))workflows[path]=label;}catch{/* An invalid configuration stays disconnected. */}
 return {repository:values.ENGINEERING_REPOSITORY||'',branch:values.ENGINEERING_BRANCH||'main',workflows,healthUrl:values.ENGINEERING_HEALTH_URL||'',webhookSecret:values.ENGINEERING_WEBHOOK_SECRET||''};
}
const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
export function normalizeWorkflow(payload:unknown,settings:EngineeringSettings,at=Date.now()):Deployment|null{
 const p=object(payload),repo=object(p.repository),run=object(p.workflow_run);
 if(typeof repo.full_name!=='string'||repo.full_name.toLowerCase()!==settings.repository.toLowerCase()||run.head_branch!==settings.branch)return null;
 // PR and fork workflows must never masquerade as a production deployment.
 if(!['push','workflow_dispatch','workflow_call'].includes(String(run.event)))return null;
 const headRepo=object(run.head_repository);if(headRepo.full_name&&String(headRepo.full_name).toLowerCase()!==settings.repository.toLowerCase())return null;
 const workflow=String(run.path||'').split('@')[0].split('/').at(-1)||'',label=settings.workflows[workflow];if(!label)return null;
 const runId=Number(run.id),attempt=Number(run.run_attempt||1),createdAt=Date.parse(String(run.created_at)),updatedAt=Date.parse(String(run.updated_at)),startedAt=Date.parse(String(run.run_started_at||run.created_at));
 if(!Number.isSafeInteger(runId)||runId<1||!Number.isSafeInteger(attempt)||attempt<1||!Number.isFinite(createdAt)||!Number.isFinite(updatedAt)||!Number.isFinite(startedAt)||startedAt>at+300000||createdAt>at+300000||updatedAt>at+300000)return null;
 let status:DeployStatus='unknown',rank=0;
 if(['queued','waiting','pending','requested'].includes(String(run.status))){status='queued';rank=1;}
 else if(run.status==='in_progress'){status='deploying';rank=2;}
 else if(run.status==='completed'){rank=3;status=run.conclusion==='success'?'succeeded':['failure','timed_out','action_required','startup_failure'].includes(String(run.conclusion))?'failed':['cancelled','skipped','neutral'].includes(String(run.conclusion))?'cancelled':'unknown';}
 else return null;
 const sha=/^[a-f0-9]{40}$/i.test(String(run.head_sha))?String(run.head_sha).slice(0,7):'';
 return {repository:settings.repository,branch:settings.branch,workflow,label,runId,attempt,createdAt,startedAt,updatedAt,rank,status,sha,url:`https://github.com/${settings.repository}/actions/runs/${runId}`};
}
export async function validWebhookSignature(raw:Uint8Array,signature:string|null,secret:string){
 if(!secret||!/^sha256=[a-f0-9]{64}$/.test(signature||''))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=Uint8Array.from(signature!.slice(7).match(/../g)!,h=>parseInt(h,16));
 return crypto.subtle.verify('HMAC',key,bytes,new Uint8Array(raw));
}
export function currentHealth(health:Health,at=Date.now()):Health{return !health.checkedAt||at-health.checkedAt>15*60000?{...health,status:'unknown',reason:'Waiting for a recent health check.'}:health;}
export function deploymentStatus(d:Deployment,at=Date.now()):DeployStatus{return ['deploying','queued'].includes(d.status)&&at-d.updatedAt>2*3600000?'unknown':d.status;}
export function engineeringScene(state:EngineeringState,at=Date.now()):Scene{
 const health=currentHealth(state.health,at),lines=['TANDEM PRODUCTION',state.healthConfigured?health.status==='up'?'API REACHABLE':health.status==='down'?'API CHECK FAILED':'API STATUS UNKNOWN':'API NOT MONITORED'];
 let severity=state.healthConfigured?(health.status==='down'?3:health.status==='unknown'?1:0):1;
 for(const d of state.deployments.slice(0,3)){
  const status=deploymentStatus(d,at),word={queued:'QUEUED',deploying:'DEPLOYING',succeeded:'DEPLOYED',failed:'FAILED',cancelled:'CANCELLED',unknown:'UNKNOWN'}[status];
  lines.push(`${d.label} ${d.label==='CI'?(status==='succeeded'?'PASSED':status==='deploying'?'RUNNING':word):word}`);severity=Math.max(severity,status==='failed'?3:['queued','deploying'].includes(status)?2:status==='succeeded'?0:1);
 }
 if(!state.deployments.length){lines.push('WAITING FOR DEPLOYS');severity=Math.max(severity,1);}
 const recent=state.deployments.toSorted((a,b)=>b.updatedAt-a.updatedAt)[0];
 if(lines.length<5&&recent?.sha)lines.push(`COMMIT ${recent.sha.toUpperCase()}`);
 return {text:lines.join('\n'),alignment:'center',accent:severity===3?63:severity===2?65:severity===1?69:66};
}

import {authorizedEngineeringRunner,runEngineeringTick,getEngineeringStatus,BoardError} from '@/lib/controller';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){if(!await authorizedEngineeringRunner(request))return json({error:'Unauthorized.'},401);try{return json(await getEngineeringStatus());}catch{return json({error:'Status is unavailable.'},503);}}
export async function POST(request:Request){if(!await authorizedEngineeringRunner(request))return json({error:'Unauthorized.'},401);try{return json(await runEngineeringTick());}catch(e){return json({error:e instanceof BoardError?e.message:'The engineering check failed.'},e instanceof BoardError?e.status:503);}}

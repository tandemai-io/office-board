import {authorizedController,backgroundTick,BoardError} from '@/lib/controller';
export const dynamic='force-dynamic';
export async function POST(request:Request){if(!await authorizedController(request))return Response.json({error:'Unauthorized.'},{status:401});try{return Response.json(await backgroundTick(),{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:e instanceof BoardError?e.message:'The controller could not run.'},{status:e instanceof BoardError?e.status:500});}}

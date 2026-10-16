import {waitUntil} from 'cloudflare:workers';
import {receiveEngineeringEvent,runEngineeringTick,BoardError} from '@/lib/controller';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{
  if(Number(request.headers.get('content-length')||0)>524288)return Response.json({error:'Payload too large.'},{status:413});
  const reader=request.body?.getReader();if(!reader)throw new BoardError('Empty payload.');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>524288){await reader.cancel();return Response.json({error:'Payload too large.'},{status:413});}chunks.push(value);}
  const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
  const result=await receiveEngineeringEvent(raw,request.headers.get('x-hub-signature-256'),request.headers.get('x-github-event'));
  // The event is already durable. Keep delivery responses fast; periodic checks
  // retry physical writes if the board is busy or unavailable.
  if(result.changed)waitUntil(runEngineeringTick(false).catch(()=>{}));
  return Response.json({ok:true},{status:202,headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof BoardError?error.message:'Could not save this event.'},{status:error instanceof BoardError?error.status:503});}
}

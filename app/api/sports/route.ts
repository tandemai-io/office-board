import {getChatGPTUser} from '@/app/chatgpt-auth';
import {BoardError,getSportsGames} from '@/lib/controller';
import {validLeague} from '@/lib/sports';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const response=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
 try{const user=await getChatGPTUser();if(!user)return response({error:'Please sign in.'},401);const league=new URL(request.url).searchParams.get('league');if(!validLeague(league))return response({error:'Choose NFL or NBA.'},400);return response(await getSportsGames(user,league));}
 catch(e){return response({error:e instanceof BoardError?e.message:'The games could not be loaded. Please try again.'},e instanceof BoardError?e.status:502);}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const root=new URL('../',import.meta.url),realRequire=createRequire(import.meta.url);
const user={userId:'test-owner',email:'owner@example.test',fullName:'Test Owner'};
const json=value=>JSON.parse(JSON.stringify(value));
const blank=()=>Array.from({length:6},()=>Array(22).fill(0));
function harness(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('drizzle/',root)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL(`drizzle/${file}`,root),'utf8'));
 let clock=Date.parse('2026-10-02T18:00:00Z');
 class TestDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 const DB={prepare(query){const statement=sql.prepare(query);let args=[];return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){const r=statement.run(...args);return {meta:{changes:r.changes}};}};}};
 const env={DB,OWNER_EMAIL:user.email,SECRET_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')};
 let primaryUsed=0,backupUsed=0,primaryFailure=0,backupFailure=0,backupWrong=false,backupDuplicate=false,primaryStatusError=null,primaryStatusCode=200,primaryStatusRetry=0;
 let hardwareFailure=false,hardwareQuiet=false,hardwareStatus="ok",hardwareStale=false,cloudGrid=blank();const hardwareBodies=[];
 let score=10,state='in_progress',failure=false,home='HOM',away='AWY',possession=null,possessionFailure=false,possessionHalftime=false,possessionWrong=false;const requests=[],writes=[];
 const game=(id=101)=>({id,date:'2026-10-02',datetime:'2026-10-02T18:00:00Z',status:state==='in_progress'?'In Progress':state==='final'?'Final':state,status_state:state,period:2,time:'4:31',home_team_score:score,visitor_team_score:7,home_team:{full_name:'Test Home',abbreviation:home},visitor_team:{full_name:'Test Away',abbreviation:away}});
 const collegeId='11111111-1111-4111-8111-111111111111';
 const college=(backup=false,id=101)=>backup?{id:collegeId,sport:'american_football',league:'NCAA Football',kickoff_utc:'2026-10-02T18:00:00Z',status:state==='in_progress'?'live':state==='final'?'finished':state,home:{name:backupWrong?'Miami (OH)':'Virginia Tech'},away:{name:'Pittsburgh'},score:{home:score,away:7}}:{game:{id,date:{timestamp:Date.parse('2026-10-02T18:00:00Z')/1000},status:{short:state==='in_progress'?'Q2':state==='final'?'FT':'NS',timer:'4:31'}},teams:{home:{name:'Virginia Tech Hokies'},away:{name:'Pittsburgh Panthers'}},scores:{home:{total:score},away:{total:7}}};
 async function fetchMock(input,options={}){const url=new URL(String(input));requests.push(url.href);if(url.hostname==='cloud.vestaboard.com'){if(options.method==='POST'){const body=JSON.parse(options.body);hardwareBodies.push(body);if(hardwareFailure)return Response.json({error:'unavailable'},{status:503});if(hardwareStatus!=='ok')return Response.json({status:hardwareStatus});writes.push(body.characters);if(!hardwareStale&&(!hardwareQuiet||body.forced===true))cloudGrid=json(body.characters);return Response.json({status:'ok',id:'test-message',created:clock});}return Response.json({currentMessage:{layout:JSON.stringify(cloudGrid),id:'test-message'}});}if(url.hostname==='v1.american-football.api-sports.io'){
  if(url.pathname==='/status')return primaryStatusError?Response.json({errors:typeof primaryStatusError==='string'?{rateLimit:primaryStatusError}:primaryStatusError},{status:primaryStatusCode,headers:primaryStatusRetry?{'Retry-After':String(primaryStatusRetry)}:{}}):Response.json({response:{subscription:{active:true},requests:{current:primaryUsed,limit_day:100}},errors:[]});
  primaryUsed++;if(primaryFailure)return Response.json({errors:{problem:'provider error with test-key'}},{status:primaryFailure});
  if(url.pathname==='/leagues')return Response.json({response:[{league:{id:2},seasons:[{year:2026,current:true}]}],errors:[]});
  assert.equal(url.pathname,'/games');return Response.json({response:[college()],errors:[]},{headers:{'x-ratelimit-requests-remaining':String(100-primaryUsed)}});
 }
 if(url.hostname==='api.bigballsdata.com'){
  backupUsed++;if(backupFailure)return Response.json({error:{code:'unavailable'},meta:{limiting_bucket:backupFailure===429?'day':undefined}},{status:backupFailure});
  if(url.pathname==='/v1/usage')return Response.json({data:{used_today:backupUsed,remaining_today:250-backupUsed,limits:{per_day:250}}});
  assert.ok(url.pathname.startsWith('/v1/matches'));assert.equal(url.searchParams.get('sport'),'american_football');
  return Response.json({data:url.pathname==='/v1/matches'?(backupDuplicate?[college(true),{...college(true),id:'99999999-1111-4111-8111-111111111111'}]:[college(true)]):college(true)},{headers:{'X-RateLimit-Remaining':'0','X-RateLimit-Limit':'100'}});
 }
 if(url.hostname==='site.api.espn.com'){
  if(possessionFailure)return Response.json({error:'unavailable'},{status:503});
  if(url.pathname.endsWith('/scoreboard'))assert.match(url.searchParams.get('dates')||'',/^\d{8}$/);
  const college=url.pathname.includes('college-football');
  const competition={id:'401858245',date:'2026-10-02T18:00:00Z',status:{type:{state:state==='in_progress'?'in':'post',completed:state==='final',name:possessionHalftime?'STATUS_HALFTIME':'STATUS_IN_PROGRESS',description:possessionHalftime?'Halftime':'In Progress'}},competitors:[{id:'259',homeAway:'home',possession:possession==='home',team:{id:'259',displayName:possessionWrong?'Virginia Cavaliers':college?'Virginia Tech Hokies':'Test Home',abbreviation:possessionWrong?'WRONG':college?'VT':home}},{id:'221',homeAway:'away',possession:possession==='away',team:{id:'221',displayName:college?'Pittsburgh Panthers':'Test Away',abbreviation:college?'PITT':away}}]};
  return Response.json(url.pathname.endsWith('/summary')?{header:{competitions:[competition]}}:{events:[{id:'401858245',date:competition.date,competitions:[competition]}]});
 }
 assert.equal(url.hostname,'api.balldontlie.io');if(failure)return Response.json({error:'unavailable'},{status:503});const id=/\/games\/(\d+)$/.exec(url.pathname);return Response.json({data:id?game(Number(id[1])):url.searchParams.get('season_type')==='preseason'?[]:[game(101),game(102),game(103),game(104)],meta:{next_cursor:null}});}
 const cache={};function load(name,reload=false){if(reload)delete cache[name];if(cache[name])return cache[name];const exports={};cache[name]=exports;const code=ts.transpileModule(readFileSync(new URL(`lib/${name}.ts`,root),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const require=specifier=>specifier==='cloudflare:workers'?{env}:specifier.startsWith('./')?load(specifier.slice(2)):realRequire(specifier);vm.runInNewContext(code,{exports,require,Date:TestDate,Intl,crypto,fetch:fetchMock,Response,URL,URLSearchParams,AbortSignal,TextEncoder,TextDecoder,Uint8Array,btoa,atob,console},{filename:name});return exports;}
 const controller=load('controller'),board=load('board'),sports=load('sports'),colors=load('team-colors');
 return {controller,board,sports,colors,sql,requests,writes,hardwareBodies,hardwareQuiet(value){hardwareQuiet=value;},hardwareStatus(value){hardwareStatus=value;},hardwareStale(value){hardwareStale=value;},cloudGrid(value){cloudGrid=json(value);},advance(ms){clock+=ms;},now(){return clock;},setScore(value){score=value;},hardwareFail(value){hardwareFailure=value;},setPossession(value){possession=value;},possessionFail(value){possessionFailure=value;},possessionHalf(value){possessionHalftime=value;},wrongPossession(value){possessionWrong=value;},collegeId,setPrimaryUsed(v){primaryUsed=v;},setBackupUsed(v){backupUsed=v;},primaryFail(v){primaryFailure=v;},primaryStatus(error,code=200,retry=0){primaryStatusError=error;primaryStatusCode=code;primaryStatusRetry=retry;},backupFail(v){backupFailure=v;},wrongBackup(v){backupWrong=v;},duplicateBackup(v){backupDuplicate=v;},load,setTeams(left,right){away=left;home=right;},setState(value){state=value;},fail(value){failure=value;},close(){sql.close();}};
}
async function configured(h,hardware=false){await h.controller.getState(user);await h.controller.mutate(user,{action:'settings',settings:{quietEnabled:false,quietStart:'19:00',quietEnd:'08:00'}});if(hardware)await h.controller.mutate(user,{action:'connect',kind:'vestaboard',secret:'test-hardware-key'});}
async function following(h,hardware=false){await configured(h,hardware);await h.controller.mutate(user,{action:'connect',kind:'sports',secret:'test-sports-key'});await h.controller.mutate(user,{action:'sports-select',league:'NFL',gameId:'101'});}

test('every message overrides native Vestaboard quiet hours and cloud readback matches the sent frame',async()=>{
 const h=harness();try{
  h.hardwareQuiet(true);await following(h,true);let state=await h.controller.getState(user);
  assert.equal(h.hardwareBodies.at(-1).forced,true);assert.equal(state.controller.hardware.matches,true);assert.deepEqual(json(h.hardwareBodies.at(-1).characters),json(state.current.grid));
  h.advance(31000);await h.controller.mutate(user,{action:'message',text:'TEAM NOTE',duration:60,scheduledAt:h.now()});assert.equal(h.hardwareBodies.at(-1).forced,true);assert.equal((await h.controller.getState(user)).controller.hardware.matches,true);
 }finally{h.close();}
});
test('an old unforced accepted sports frame is resent once with the quiet-hours override',async()=>{
 const h=harness();try{
  await following(h,true);const row=h.sql.prepare('SELECT runtime FROM controller').get();const runtime=JSON.parse(row.runtime);delete runtime.lastForced;delete runtime.hardware;
  h.sql.prepare('UPDATE controller SET runtime=?').run(JSON.stringify(runtime));const before=h.writes.length;h.advance(31000);await h.load('controller',true).backgroundTick();assert.equal(h.writes.length,before+1);assert.equal(h.hardwareBodies.at(-1).forced,true);
  h.advance(31000);await h.controller.backgroundTick();assert.equal(h.writes.length,before+1);
 }finally{h.close();}
});
test('HTTP success without Vestaboard status ok never advances the accepted display',async()=>{
 const h=harness();try{
  await following(h,true);const before=await h.controller.getState(user);h.hardwareStatus('error');h.setScore(24);h.advance(31000);await h.controller.backgroundTick();const state=await h.controller.getState(user);
  assert.deepEqual(json(state.current.grid),json(before.current.grid));assert.equal(state.controller.lastAccepted,before.controller.lastAccepted);assert.match(state.controller.error,/did not confirm/);
 }finally{h.close();}
});
test('owner readback distinguishes a different cloud layout and never writes or exposes credentials',async()=>{
 const h=harness();try{
  await following(h,true);h.hardwareStale(true);h.setScore(24);h.advance(31000);await h.controller.backgroundTick();let state=await h.controller.getState(user);assert.equal(state.controller.hardware.matches,false);
  const writes=h.writes.length,scoreCalls=h.requests.filter(u=>!u.includes('cloud.vestaboard.com')).length;h.cloudGrid(state.current.grid);state=await h.controller.mutate(user,{action:'hardware-check'});assert.equal(state.controller.hardware.matches,true);assert.equal(h.writes.length,writes);assert.equal(h.requests.filter(u=>!u.includes('cloud.vestaboard.com')).length,scoreCalls);assert.ok(!JSON.stringify(state).includes('test-hardware-key'));
  await assert.rejects(h.controller.mutate({...user,userId:'teammate',email:'team@example.test'},{action:'hardware-check'}),/Only the dashboard owner/);
 }finally{h.close();}
});

test('visual cells survive storage, state reload, scheduling and hardware delivery exactly',async()=>{const h=harness();try{await configured(h,true);const grid=blank();grid[0][0]=69;grid[0][21]=70;grid[4][7]=1;grid[5]=Array(22).fill(63);const sent=await h.controller.mutate(user,{action:'message',grid,duration:60,scheduledAt:h.now()});assert.deepEqual(json(sent.current.grid),grid);assert.deepEqual(json(h.writes.at(-1)),grid);assert.deepEqual(json((await h.controller.getState(user)).messages[0].grid),grid);h.advance(61000);const later=blank();later[2][10]=67;await h.controller.mutate(user,{action:'message',grid:later,duration:60,scheduledAt:h.now()+61000});assert.notDeepEqual(json(h.writes.at(-1)),later);h.advance(62000);await h.controller.backgroundTick();assert.deepEqual(json(h.writes.at(-1)),later);}finally{h.close();}});
test('malformed visual data is rejected without inserting or sending it',async()=>{const h=harness();try{await configured(h,true);const before=h.writes.length;const invalid=blank();invalid[3][2]=999;await assert.rejects(h.controller.mutate(user,{action:'message',grid:invalid,duration:60,scheduledAt:h.now()}),/cannot display/);assert.equal(h.writes.length,before);assert.equal(h.sql.prepare('SELECT COUNT(*) AS count FROM messages').get().count,0);}finally{h.close();}});
test('migrations preserve legacy text messages',async()=>{const h=harness();try{await configured(h);h.sql.prepare("INSERT INTO messages(id,title,text,alignment,accent,source,author,scheduled_at,duration,status,created_at) VALUES('legacy','Old note','OLD NOTE','center',0,'manual','Team',?,60,'queued',?)").run(h.now(),h.now());await h.controller.backgroundTick();const state=await h.controller.getState(user);assert.equal(state.current.text,'OLD NOTE');assert.deepEqual(json(state.current.grid),json(h.board.formatBoard('OLD NOTE')));}finally{h.close();}});
test('exact selected game persists across midnight and duplicate scores do not write hardware',async()=>{const h=harness();try{await following(h,true);const before=h.writes.length;h.advance(31000);await h.controller.backgroundTick();assert.equal(h.writes.length,before);h.setScore(14);h.advance(31000);await h.controller.backgroundTick();assert.equal(h.writes.length,before+1);h.advance(86400000);await h.controller.backgroundTick();const state=await h.controller.getState(user);assert.deepEqual(json(state.config.sportsSelection),{league:'NFL',gameId:'101'});assert.equal(state.sports.game.id,'101');assert.ok(h.requests.filter(url=>url.includes('/games/')).every(url=>url.endsWith('/101')));}finally{h.close();}});
test('unlisted game is rejected atomically and selected-game failures retain last scores',async()=>{const h=harness();try{await following(h);await assert.rejects(h.controller.mutate(user,{action:'sports-select',league:'NFL',gameId:'999'}),/available game/);h.fail(true);h.advance(130000);await h.controller.backgroundTick();const state=await h.controller.getState(user);assert.equal(state.sports.game.home.score,10);assert.equal(state.config.sportsSelection.gameId,'101');assert.match(state.current.text,/SCORES DELAYED/);assert.ok(state.sports.error);}finally{h.close();}});
test('canceled and abandoned games stop provider requests while retaining the terminal display',async()=>{for(const terminal of ['canceled','abandoned']){const h=harness();try{h.setState(terminal);await following(h,true);const before=h.writes.length,count=h.requests.length;h.advance(86400000);await h.controller.backgroundTick();const state=await h.controller.getState(user);assert.match(state.current.text,new RegExp(terminal.toUpperCase()));assert.doesNotMatch(state.current.text,/DELAYED/);assert.equal(h.writes.length,before);assert.equal(h.requests.length,count);}finally{h.close();}}});
test('free provider budget is shared and prevents a sixth request inside a minute',async()=>{const h=harness();try{await following(h);await h.controller.getSportsGames(user,'NBA');await h.controller.mutate(user,{action:'sports-select',league:'NFL',gameId:'102'});const count=h.requests.filter(url=>url.includes('balldontlie')).length;assert.equal(count,5);await assert.rejects(h.controller.mutate(user,{action:'sports-select',league:'NFL',gameId:'103'}),/Try again in a minute/);assert.equal(h.requests.filter(url=>url.includes('balldontlie')).length,5);h.advance(61000);await h.controller.mutate(user,{action:'sports-select',league:'NFL',gameId:'103'});assert.equal((await h.controller.getState(user)).sports.game.id,'103');}finally{h.close();}});
test('fresh catalogs are reused and failed catalogs retain their original freshness',async()=>{const h=harness();try{await configured(h);await h.controller.mutate(user,{action:'connect',kind:'sports',secret:'test-sports-key'});const first=await h.controller.getSportsGames(user,'NFL'),count=h.requests.length;await h.controller.getSportsGames(user,'NFL');assert.equal(h.requests.length,count);h.advance(121000);h.fail(true);const failed=await h.controller.getSportsGames(user,'NFL');assert.equal(failed.fetchedAt,first.fetchedAt);assert.equal(failed.games.length,first.games.length);assert.ok(failed.error);}finally{h.close();}});
test('pause and manual hold preserve hardware display while sports keep their selection',async()=>{const h=harness();try{await following(h,true);await h.controller.mutate(user,{action:'pause',paused:true});const before=h.writes.length;h.setScore(17);h.advance(31000);await h.controller.backgroundTick();assert.equal(h.writes.length,before);await h.controller.mutate(user,{action:'pause',paused:false});h.advance(31000);await h.controller.mutate(user,{action:'message',text:'TEAM NOTE',alignment:'center',accent:0,duration:60,scheduledAt:h.now()});h.advance(31000);h.setScore(20);await h.controller.backgroundTick();assert.equal((await h.controller.getState(user)).current.text,'TEAM NOTE');h.advance(31000);await h.controller.backgroundTick();assert.equal((await h.controller.getState(user)).current.source,'sports');}finally{h.close();}});
test('NBA halftime is explicit, upcoming scores are absent and NFL has no invented clock',()=>{const h=harness();try{const raw={id:1,status:'Halftime',status_state:'in_progress',period:2,time:'0:00',home_team_score:54,visitor_team_score:49,home_team:{abbreviation:'BOS'},visitor_team:{abbreviation:'NYK'}};const nba=h.sports.normalizeGame(raw,'NBA');assert.equal(h.sports.gameStatus(nba),'Halftime');assert.equal(h.sports.normalizeGame(raw,'NFL').clock,null);const upcoming=h.sports.normalizeGame({...raw,status_state:'scheduled'},'NBA');assert.equal(upcoming.home.score,null);assert.equal(upcoming.away.score,null);for(const state of ['in_progress','scheduled','final','postponed','canceled','delayed','suspended','abandoned','unknown']){const scene=h.sports.gameScene(h.sports.normalizeGame({...raw,status_state:state},'NBA'));assert.equal(h.board.sceneGrid(scene).length,6);}}finally{h.close();}});
test('team stripes follow left/right labels through score updates, stale data and a different game on hardware',async()=>{const h=harness();try{
 h.setTeams('SF','DAL');await following(h,true);
 const nfl=[...Array(7).fill(63),...Array(3).fill(65),70,70,...Array(3).fill(69),...Array(7).fill(67)];
 let current=(await h.controller.getState(user)).current;assert.match(current.text,/SF 7 - 10 DAL/);assert.deepEqual(json(current.grid[5]),nfl);assert.deepEqual(json(h.writes.at(-1)[5]),nfl);
 h.setScore(17);h.advance(31000);await h.controller.backgroundTick();assert.deepEqual(json(h.writes.at(-1)[5]),nfl);
 h.fail(true);h.advance(130000);await h.controller.backgroundTick();current=(await h.controller.getState(user)).current;assert.match(current.text,/SCORES DELAYED/);assert.deepEqual(json(current.grid[5]),nfl);
 h.fail(false);h.advance(61000);h.setTeams('BOS','LAL');await h.controller.getSportsGames(user,'NBA');await h.controller.mutate(user,{action:'sports-select',league:'NBA',gameId:'101'});
 const nba=[...Array(7).fill(66),...Array(3).fill(69),70,70,...Array(3).fill(65),...Array(7).fill(68)];
 current=(await h.controller.getState(user)).current;assert.match(current.text,/BOS 7 - 17 LAL/);assert.deepEqual(json(current.grid[5]),nba);assert.deepEqual(json(h.writes.at(-1)[5]),nba);
}finally{h.close();}});
test('all NFL and NBA teams have flap colors and aliases resolve within their own league',()=>{const h=harness();try{
 const teams={NFL:'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LV LAC LAR MIA MIN NE NO NYG NYJ PHI PIT SF SEA TB TEN WAS',NBA:'ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS'};
 for(const [league,list] of Object.entries(teams))for(const team of list.split(' ')){const colors=json(h.colors.teamColors(league,team));assert.ok(colors.every(code=>code>=63&&code<=70));assert.notDeepEqual(colors,[69,70],`${league} ${team} needs a team palette`);}
 assert.deepEqual(json(h.colors.teamColors('NFL','LA')),json(h.colors.teamColors('NFL','LAR')));
 for(const [alias,canonical] of Object.entries({GS:'GSW',NO:'NOP',NY:'NYK',SA:'SAS',UTAH:'UTA',WSH:'WAS',PHO:'PHX'}))assert.deepEqual(json(h.colors.teamColors('NBA',alias)),json(h.colors.teamColors('NBA',canonical)));
 assert.notDeepEqual(json(h.colors.teamColors('NFL','NO')),json(h.colors.teamColors('NBA','NO')));assert.notDeepEqual(json(h.colors.teamColors('NFL','LAC')),json(h.colors.teamColors('NBA','LAC')));assert.deepEqual(json(h.colors.teamColors('NBA','UNKNOWN')),[69,70]);
}finally{h.close();}});

async function collegeFollowing(h,hardware=false){await configured(h,hardware);await h.controller.mutate(user,{action:'connect',kind:'api-sports',secret:'test-primary-key'});await h.controller.mutate(user,{action:'connect',kind:'big-balls',secret:'test-backup-key'});await h.controller.getSportsGames(user,'NCAAF');await h.controller.mutate(user,{action:'sports-select',league:'NCAAF',gameId:'as:101'});}

test('legacy quiet settings cannot stop evening score updates or team messages',async()=>{
 const h=harness();try{
  await collegeFollowing(h,true);const config=JSON.parse(h.sql.prepare('SELECT config FROM controller').get().config);config.quietEnabled=true;config.quietStart='19:00';config.quietEnd='08:00';h.sql.prepare('UPDATE controller SET config=?').run(JSON.stringify(config));
  h.advance(8*3600000+121000);h.setScore(33);await h.controller.backgroundTick();let state=await h.controller.getState(user);
  assert.equal(state.config.quietEnabled,false);assert.equal(state.controller.pausedByQuietHours,false);assert.equal(state.controller.sportsDuringQuietHours,false);assert.match(state.current.text,/33/);assert.equal(JSON.parse(h.sql.prepare('SELECT config FROM controller').get().config).quietEnabled,false);
  h.advance(31000);state=await h.controller.mutate(user,{action:'message',text:'EVENING NOTE',duration:60,scheduledAt:h.now()});assert.equal(state.current.text,'EVENING NOTE');assert.equal(state.messages[0].status,'accepted');assert.equal(h.hardwareBodies.at(-1).forced,true);
 }finally{h.close();}
});

test('a failed final write retries without polling the finished game',async()=>{
 const h=harness();try{
  await collegeFollowing(h,true);await h.controller.mutate(user,{action:'settings',settings:{quietEnabled:true,quietStart:'19:00',quietEnd:'08:00'}});
  h.advance(8*3600000+121000);h.setState('final');h.setScore(42);h.hardwareFail(true);const writes=h.writes.length;
  await h.controller.backgroundTick();let state=await h.controller.getState(user);assert.equal(state.sports.game.state,'final');assert.equal(h.writes.length,writes);assert.ok(state.controller.error);
  const scoreCalls=h.requests.filter(u=>!u.includes('cloud.vestaboard.com')).length;
  h.hardwareFail(false);h.advance(61000);await h.load('controller',true).backgroundTick();state=await h.controller.getState(user);
  assert.equal(h.requests.filter(u=>!u.includes('cloud.vestaboard.com')).length,scoreCalls);assert.equal(h.writes.length,writes+1);assert.equal(state.controller.error,null);assert.match(state.current.text,/FINAL/);assert.match(state.current.text,/42/);
 }finally{h.close();}
});
function exhaustPrimary(h){const runtime=JSON.parse(h.sql.prepare('SELECT runtime FROM controller').get().runtime);runtime.college.usage['api-sports'].remaining=10;h.sql.prepare('UPDATE controller SET runtime=?').run(JSON.stringify(runtime));}
test('college failover follows the same teams and clears unavailable clock while retaining team flaps',async()=>{const h=harness();try{await collegeFollowing(h,true);let state=await h.controller.getState(user);assert.equal(state.sports.game.provider,'api-sports');assert.equal(state.sports.game.clock,'4:31');const stripe=json(state.current.grid[5]);assert.deepEqual(stripe,[...Array(7).fill(67),...Array(3).fill(65),70,70,...Array(3).fill(64),...Array(7).fill(63)]);exhaustPrimary(h);h.setScore(17);h.advance(121000);await h.controller.backgroundTick();state=await h.controller.getState(user);assert.equal(state.sports.game.provider,'big-balls');assert.equal(state.sports.game.id,'as:101');assert.equal(state.sports.game.clock,null);assert.equal(state.sports.game.period,null);assert.equal(state.sports.game.home.score,17);assert.deepEqual(json(state.current.grid[5]),stripe);assert.deepEqual(json(h.writes.at(-1)[5]),stripe);assert.equal(state.current.author,'Big Balls');const apiCount=h.requests.filter(u=>u.includes('api-sports.io')).length;h.advance(121000);await h.controller.backgroundTick();assert.equal(h.requests.filter(u=>u.includes('api-sports.io')).length,apiCount);assert.ok(h.requests.filter(u=>u.includes('api.bigballsdata.com')).at(-1).includes('/v1/matches/'+h.collegeId));}finally{h.close();}});
test('college failover refuses different or ambiguous games and retains the selected scores',async()=>{for(const kind of ['wrong','ambiguous']){const h=harness();try{await collegeFollowing(h);exhaustPrimary(h);if(kind==='wrong')h.wrongBackup(true);else h.duplicateBackup(true);h.advance(361000);await h.controller.backgroundTick();const state=await h.controller.getState(user);assert.equal(state.sports.game.provider,'api-sports');assert.equal(state.sports.game.home.score,10);assert.match(state.sports.error,/uniquely match/);assert.match(state.current.text,/SCORES DELAYED/);}finally{h.close();}}});
test('college daily reset returns to primary and exact game survives midnight',async()=>{const h=harness();try{await collegeFollowing(h);exhaustPrimary(h);h.advance(121000);await h.controller.backgroundTick();h.setPrimaryUsed(0);h.setBackupUsed(0);h.advance(86400000);await h.controller.backgroundTick();const state=await h.controller.getState(user);assert.equal(state.sports.game.provider,'api-sports');assert.equal(state.config.sportsSelection.gameId,'as:101');assert.ok(h.requests.filter(u=>u.includes('/games?')&&u.includes('id=')).every(u=>u.endsWith('id=101')));}finally{h.close();}});
test('college provider failures durably reserve quota and reject keys outside the minute-limit path',async()=>{const h=harness();try{await configured(h);h.backupFail(503);await assert.rejects(h.controller.mutate(user,{action:'connect',kind:'big-balls',secret:'test-bad-key'}),/unavailable/);const runtime=JSON.parse(h.sql.prepare('SELECT runtime FROM controller').get().runtime);assert.equal(runtime.college.usage['big-balls'].calls,1);assert.equal((await h.controller.getState(user)).connections.bigBalls,false);assert.equal(h.sql.prepare("SELECT COUNT(*) AS count FROM credentials WHERE kind='big-balls'").get().count,0);}finally{h.close();}});
test('college external daily usage is bootstrapped while minute headers do not exhaust the daily budget',async()=>{const h=harness();try{await configured(h);h.setBackupUsed(100);await h.controller.mutate(user,{action:'connect',kind:'big-balls',secret:'test-backup-key'});await h.controller.getSportsGames(user,'NCAAF');const state=await h.controller.getState(user);assert.equal(state.sports.college.quota['big-balls'].used,103);assert.equal(state.sports.college.quota['big-balls'].remaining,147);assert.equal(state.connections.bigBalls,true);assert.ok(!JSON.stringify(state).includes('test-backup-key'));const cipher=h.sql.prepare("SELECT ciphertext FROM credentials WHERE kind='big-balls'").get().ciphertext;assert.ok(!cipher.includes('test-backup-key'));}finally{h.close();}});
test('college pause, scheduled cadence and terminal games conserve quota',async()=>{const h=harness();try{h.advance(-3600000);h.setState('scheduled');await collegeFollowing(h);let count=h.requests.length;h.advance(121000);await h.controller.backgroundTick();assert.equal(h.requests.length,count);h.advance(901000);h.setState('in_progress');await h.controller.backgroundTick();await h.controller.mutate(user,{action:'pause',paused:true});count=h.requests.length;h.advance(121000);await h.controller.backgroundTick();assert.equal(h.requests.length,count);await h.controller.mutate(user,{action:'pause',paused:false});h.setState('final');h.advance(121000);await h.controller.backgroundTick();count=h.requests.length;h.advance(1801000);await h.controller.backgroundTick();assert.equal(h.requests.length,count);assert.match((await h.controller.getState(user)).current.text,/FINAL/);}finally{h.close();}});
test('college catalogs share one cache and disconnecting BALLDONTLIE preserves college selection',async()=>{const h=harness();try{await collegeFollowing(h);const count=h.requests.length;await h.controller.getSportsGames(user,'NCAAF');h.advance(121000);await h.controller.getSportsGames(user,'NCAAF');assert.equal(h.requests.length,count);await h.controller.mutate(user,{action:'disconnect',kind:'sports'});const state=await h.controller.getState(user);assert.equal(state.config.sportsSelection.gameId,'as:101');assert.equal(state.connections.apiSports,true);assert.equal(state.connections.bigBalls,true);}finally{h.close();}});
test('college aliases separate Miami, USC, Louisiana and unknown schools; null scores stay absent',()=>{const h=harness();try{const api=h.load('college-api');for(const pair of [['Miami (OH)','Miami'],['USC','South Carolina'],['Louisiana','UL Monroe']])assert.notEqual(api.collegeTeam(pair[0],null).identity,api.collegeTeam(pair[1],null).identity);const game=api.normalizeCollege({id:h.collegeId,kickoff_utc:'2026-10-02T18:00:00Z',status:'live',home:{name:'Virginia Tech'},away:{name:'Pittsburgh'},score:{home:0,away:null}},'big-balls');assert.equal(game.home.score,0);assert.equal(game.away.score,null);assert.equal(game.clock,null);assert.ok(api.sameCollegeGame(game,{...game,home:api.collegeTeam('Virginia Tech Hokies',0)}));assert.equal(api.sameCollegeGame(game,{...game,home:api.collegeTeam('Virginia Cavaliers',0)}),false);}finally{h.close();}});

test('both college providers near their reserves hold scores without any further score-provider requests',async()=>{const h=harness();try{await collegeFollowing(h);exhaustPrimary(h);const runtime=JSON.parse(h.sql.prepare('SELECT runtime FROM controller').get().runtime);runtime.college.usage['big-balls'].remaining=10;h.sql.prepare('UPDATE controller SET runtime=?').run(JSON.stringify(runtime));const scoreCalls=()=>h.requests.filter(u=>u.includes('api-sports.io')||u.includes('bigballsdata.com')).length,count=scoreCalls();h.advance(361000);await h.controller.backgroundTick();const state=await h.controller.getState(user);assert.equal(scoreCalls(),count);assert.equal(state.sports.game.home.score,10);assert.match(state.sports.error,/free limits/);assert.match(state.current.text,/SCORES DELAYED/);}finally{h.close();}});


test('minute-limited primary credentials are encrypted as pending and recover automatically without changing the selected game',async()=>{const h=harness();try{
 await configured(h,true);await h.controller.mutate(user,{action:'connect',kind:'big-balls',secret:'test-backup-key'});await h.controller.getSportsGames(user,'NCAAF');await h.controller.mutate(user,{action:'sports-select',league:'NCAAF',gameId:'bb:'+h.collegeId});
 h.primaryStatus('Too many requests. You have exceeded the limit of requests per minute of your subscription.');
 let state=await h.controller.mutate(user,{action:'connect',kind:'api-sports',secret:'test-primary-key'});assert.equal(state.connections.apiSports,true);assert.equal(state.sports.college.quota['api-sports'].verified,false);assert.match(state.sports.college.quota['api-sports'].error,/requests per minute/);assert.equal(state.sports.college.quota['api-sports'].retryAt,h.now()+60000);assert.ok(!JSON.stringify(state).includes('test-primary-key'));
 const cipher=h.sql.prepare("SELECT ciphertext FROM credentials WHERE kind='api-sports'").get().ciphertext;assert.ok(!cipher.includes('test-primary-key'));
 const count=h.requests.filter(u=>u.includes('api-sports.io')).length;await h.controller.backgroundTick();assert.equal(h.requests.filter(u=>u.includes('api-sports.io')).length,count);assert.equal((await h.controller.getState(user)).sports.game.provider,'big-balls');
 h.primaryStatus(null);h.advance(121000);h.setScore(17);await h.controller.backgroundTick();state=await h.controller.getState(user);assert.equal(state.sports.college.quota['api-sports'].verified,true);assert.equal(state.sports.college.quota['api-sports'].error,null);assert.equal(state.sports.game.provider,'api-sports');assert.equal(state.sports.game.home.score,17);assert.equal(state.config.sportsSelection.gameId,'bb:'+h.collegeId);assert.equal(state.sports.game.id,'bb:'+h.collegeId);assert.equal(state.current.author,'API-Sports');
}finally{h.close();}});
test('authentication failures never enter the pending credential path even if the error mentions a minute limit',async()=>{const h=harness();try{
 await configured(h);h.primaryStatus('Too many requests per minute for test-primary-key at owner@example.test',401);await assert.rejects(h.controller.mutate(user,{action:'connect',kind:'api-sports',secret:'test-primary-key'}),/rejected its key/);assert.equal((await h.controller.getState(user)).connections.apiSports,false);assert.equal(h.sql.prepare("SELECT COUNT(*) AS count FROM credentials WHERE kind='api-sports'").get().count,0);
}finally{h.close();}});


test('invalid replacement preserves saved college credential health and still accounts for the attempted verification',async()=>{const h=harness();try{
 await configured(h);await h.controller.mutate(user,{action:'connect',kind:'api-sports',secret:'test-primary-key'});const cipher=h.sql.prepare("SELECT ciphertext FROM credentials WHERE kind='api-sports'").get().ciphertext;
 h.primaryStatus('Invalid API key.',401);await assert.rejects(h.controller.mutate(user,{action:'connect',kind:'api-sports',secret:'test-bad-key'}),/rejected its key/);const state=await h.controller.getState(user);assert.equal(state.sports.college.quota['api-sports'].verified,true);assert.equal(state.sports.college.quota['api-sports'].blocked,false);assert.equal(state.sports.college.quota['api-sports'].retryAt,0);assert.equal(h.sql.prepare("SELECT ciphertext FROM credentials WHERE kind='api-sports'").get().ciphertext,cipher);assert.equal(JSON.parse(h.sql.prepare('SELECT runtime FROM controller').get().runtime).college.usage['api-sports'].recent.length,2);
 h.primaryStatus(null);const games=await h.controller.getSportsGames(user,'NCAAF');assert.equal(games.games[0].provider,'api-sports');
}finally{h.close();}});
test('pending college credentials honor longer provider Retry-After and mixed auth errors never save',async()=>{const h=harness();try{
 await configured(h);h.primaryStatus({token:'Invalid API key test-bad-key at owner@example.test',rateLimit:'Too many requests per minute.'});await assert.rejects(h.controller.mutate(user,{action:'connect',kind:'api-sports',secret:'test-bad-key'}),error=>/Invalid API key/.test(error.message)&&!error.message.includes('test-bad-key')&&!error.message.includes('owner@example.test'));assert.equal((await h.controller.getState(user)).connections.apiSports,false);
 h.primaryStatus('Too many requests per minute.',429,300);const state=await h.controller.mutate(user,{action:'connect',kind:'api-sports',secret:'test-primary-key'});assert.equal(state.sports.college.quota['api-sports'].retryAt,h.now()+300000);const count=h.requests.length;h.advance(121000);await h.controller.getSportsGames(user,'NCAAF');assert.equal(h.requests.length,count);
}finally{h.close();}});

for(const feed of ['NFL','NBA','api-sports','big-balls']){
 test(`${feed} stops all automatic provider calls after final, including a restart and midnight`,async()=>{
  const h=harness();
  try{
   const college=feed==='api-sports'||feed==='big-balls';
   if(college){await collegeFollowing(h,true);if(feed==='big-balls')exhaustPrimary(h);}
   else{await following(h,true);if(feed==='NBA'){await h.controller.getSportsGames(user,'NBA');await h.controller.mutate(user,{action:'sports-select',league:'NBA',gameId:'101'});}}
   h.setState('final');h.setScore(24);h.advance(121000);
   await h.controller.backgroundTick();
   let state=await h.controller.getState(user);
   assert.equal(state.sports.game.state,'final');assert.equal(state.sports.game.home.score,24);
   if(college)assert.equal(state.sports.game.provider,feed);
   assert.match(state.current.text,/FINAL/);
   const count=h.requests.length,writes=h.writes.length,updatedAt=state.sports.updatedAt,selection=json(state.config.sportsSelection);
   // New controller instance reads the persisted terminal result, not a process flag.
   const restarted=h.load('controller',true);
   h.fail(true);h.primaryFail(503);h.backupFail(503);
   for(const elapsed of [31000,600000,3600000,86400000]){
    h.advance(elapsed);await restarted.backgroundTick();await restarted.mutate(user,{action:'refresh'});
    state=await restarted.getState(user);
    assert.equal(h.requests.length,count);assert.equal(h.writes.length,writes);
    assert.equal(state.sports.updatedAt,updatedAt);assert.equal(state.sports.error,null);
    assert.deepEqual(json(state.config.sportsSelection),selection);assert.equal(state.sports.game.home.score,24);
    assert.match(state.current.text,/FINAL/);assert.doesNotMatch(state.current.text,/DELAYED/);
   }
   // Choosing another matchup restarts the score feed instead of leaving it latched off.
   h.fail(false);h.setState('in_progress');
   const league=college?'NFL':feed;
   if(college)await restarted.mutate(user,{action:'connect',kind:'sports',secret:'test-sports-key'});
   await restarted.mutate(user,{action:'sports-select',league,gameId:'102'});
   const resumed=h.requests.length;assert.ok(resumed>count);
   h.setScore(31);h.advance(31000);await restarted.backgroundTick();
   assert.ok(h.requests.length>resumed);state=await restarted.getState(user);
   assert.equal(state.sports.game.id,'102');assert.equal(state.sports.game.home.score,31);
  }finally{h.close();}
 });
}

test('terminal status text is recognized when the provider state is missing or unfamiliar',()=>{
 const h=harness();
 try{
  const raw={id:101,home_team:{abbreviation:'HOM'},visitor_team:{abbreviation:'AWY'}};
  for(const status_state of [undefined,'unrecognized'])for(const [status,state] of [['Final/OT','final'],['Finished','final'],['Canceled','canceled'],['Abandoned','abandoned']]){
   const game=h.sports.normalizeGame({...raw,status_state,status},'NFL');
   assert.equal(game.state,state);assert.equal(h.sports.isTerminalGame(game),true);
  }
 }finally{h.close();}
});

const scoreRow=(h,state)=>state.current.grid[2].map(code=>code===69?'■':h.board.characterFor(code)).join('');
test('NFL possession white flap switches sides next to the team names and clears on unknown or failure',async()=>{
 const h=harness();
 try{
  h.setPossession('away');await following(h,true);
  let state=await h.controller.getState(user);assert.match(scoreRow(h,state),/■AWY 7 - 10 HOM/);
  assert.deepEqual(json(h.writes.at(-1)),json(state.current.grid));
  const count=h.requests.length;await h.controller.mutate(user,{action:'refresh'});assert.equal(h.requests.length,count);
  h.setPossession('home');h.advance(31000);await h.controller.backgroundTick();
  state=await h.controller.getState(user);assert.match(scoreRow(h,state),/AWY 7 - 10 HOM■/);
  h.setPossession(null);h.advance(31000);await h.controller.backgroundTick();assert.doesNotMatch(scoreRow(h,await h.controller.getState(user)),/■/);
  h.setPossession('away');h.advance(31000);await h.controller.backgroundTick();
  h.possessionFail(true);h.advance(31000);await h.controller.backgroundTick();state=await h.controller.getState(user);
  assert.doesNotMatch(scoreRow(h,state),/■/);assert.equal(state.sports.error,null);assert.equal(state.sports.game.home.score,10);
 }finally{h.close();}
});
test('college possession updates every thirty seconds without spending extra college score quota',async()=>{
 const h=harness();
 try{
  h.setPossession('away');await collegeFollowing(h,true);
  let state=await h.controller.getState(user);assert.match(scoreRow(h,state),/■PITT 7 - 10 VT/);
  const scoreCalls=h.requests.filter(u=>u.includes('api-sports.io')||u.includes('bigballsdata.com')).length;
  h.setPossession('home');h.advance(31000);await h.controller.backgroundTick();
  state=await h.controller.getState(user);assert.match(scoreRow(h,state),/PITT 7 - 10 VT■/);
  assert.equal(h.requests.filter(u=>u.includes('api-sports.io')||u.includes('bigballsdata.com')).length,scoreCalls);
  h.possessionHalf(true);h.advance(31000);await h.controller.backgroundTick();assert.doesNotMatch(scoreRow(h,await h.controller.getState(user)),/■/);
  h.possessionHalf(false);h.wrongPossession(true);h.advance(31000);await h.controller.backgroundTick();assert.doesNotMatch(scoreRow(h,await h.controller.getState(user)),/■/);
  await h.controller.mutate(user,{action:'pause',paused:true});const requests=h.requests.length;h.advance(31000);await h.controller.backgroundTick();assert.equal(h.requests.length,requests);
 }finally{h.close();}
});
test('possession is never guessed from a last play and rejects mismatched, ambiguous or terminal data',()=>{
 const h=harness();
 try{
  const raw={id:101,datetime:'2026-10-02T18:00:00Z',status_state:'in_progress',home_team_score:10,visitor_team_score:7,home_team:{abbreviation:'HOM'},visitor_team:{abbreviation:'AWY'}};
  const game=h.sports.normalizeGame(raw,'NFL'),possession=h.load('football-possession');
  const c={date:game.startsAt,status:{type:{state:'in',completed:false}},competitors:[{id:'1',homeAway:'home',possession:true,team:{abbreviation:'HOM'}},{id:'2',homeAway:'away',possession:false,team:{abbreviation:'AWY'}}]};
  assert.equal(possession.possessionFromCompetition(game,c),'home');
  assert.equal(possession.possessionFromCompetition(game,{...c,date:'2026-10-03T18:00:00Z'}),null);
  assert.equal(possession.possessionFromCompetition(game,{...c,status:{type:{state:'post',completed:true}}}),null);
  assert.equal(possession.possessionFromCompetition(game,{...c,competitors:c.competitors.map(t=>({...t,possession:true}))}),null);
  assert.equal(possession.possessionFromCompetition(game,{...c,situation:{possession:'2'}}),null);
  assert.equal(possession.possessionFromCompetition(game,{...c,competitors:c.competitors.map(t=>({...t,possession:false})),situation:{lastPlay:{team:{id:'1'}}}}),null);
  for(const side of ['home','away']){
   const marked={...game,possession:side,possessionUpdatedAt:h.now()};
   assert.equal(h.sports.gameScene(marked).grid[2].filter(code=>code===69).length,1);
   assert.equal(h.sports.gameScene(marked,true).grid[2].filter(code=>code===69).length,0);
   assert.equal(h.sports.gameScene({...marked,state:'final'}).grid[2].filter(code=>code===69).length,0);
   assert.equal(h.sports.gameScene({...marked,status:'Halftime'}).grid[2].filter(code=>code===69).length,0);
   assert.equal(h.sports.gameScene({...marked,league:'NBA'}).grid[2].filter(code=>code===69).length,0);
   assert.equal(h.sports.gameScene({...marked,possessionUpdatedAt:h.now()-91000}).grid[2].filter(code=>code===69).length,0);
   const wide={...marked,home:{...game.home,abbreviation:'ABCDE',score:999},away:{...game.away,abbreviation:'FGHIJ',score:999}};
   assert.equal(h.sports.gameScene(wide).grid[2].length,22);
   assert.equal(h.sports.gameScene(wide).grid[2].filter(code=>code===69).length,1);
  }
 }finally{h.close();}
});

test('a score-feed halftime clears possession even when ESPN still reports a live team',async()=>{
 const h=harness();
 try{
  const api=h.load('football-possession'),cache=api.newPossessionCache();
  cache.team='home';cache.updatedAt=h.now();
  const game={id:'101',league:'NFL',state:'in_progress',status:'Halftime',possession:'home',possessionUpdatedAt:h.now()};
  const count=h.requests.length,result=await api.updateFootballPossession(game,cache,h.now());
  assert.equal(result.possession,null);assert.equal(cache.team,null);assert.equal(h.requests.length,count);
 }finally{h.close();}
});

test('possession discovery uses the Eastern game date for an evening kickoff after UTC midnight',async()=>{
 const h=harness();
 try{
  const api=h.load('football-possession');
  const game=h.sports.normalizeGame({id:101,datetime:'2026-10-03T01:00:00Z',status_state:'in_progress',home_team:{abbreviation:'HOM'},visitor_team:{abbreviation:'AWY'}},'NFL');
  await api.updateFootballPossession(game,api.newPossessionCache(),h.now());
  const url=new URL(h.requests[0]);assert.equal(url.searchParams.get('dates'),'20261002');
 }finally{h.close();}
});

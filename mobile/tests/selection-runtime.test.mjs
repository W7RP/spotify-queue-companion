import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {Miniflare,Log,LogLevel} from 'miniflare';

let source="import { env } from 'cloudflare:workers';\n";
for(const file of ['core.mjs','curation.ts','domain.ts','review.mjs','http.mjs','server.ts','select.ts']) {
  let value=await readFile(new URL('../lib/queue/'+file,import.meta.url),'utf8');
  value=value.replace(/^import .*;\r?\n/gm,'').replace('export { boundedFetch };','');
  source+=file.endsWith('.ts')?ts.transpileModule(value,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText:value;
  source+='\n';
}
source=source.replace(/^export /gm,'');
const schema=await readFile(new URL('../drizzle/0000_low_thunderbolt.sql',import.meta.url),'utf8');
source+=`
const proposeOnComputer=()=>{throw Error('Unexpected provider');};
export default {async fetch(request) {try {
  const params=new URL(request.url).searchParams;
  if(new URL(request.url).pathname==='/init') {
    for(const sql of ${JSON.stringify(schema)}.split(';').map(s=>s.trim()).filter(Boolean))await db().prepare(sql).run();
    await saveAccount('owner',{provider:'claude',model:'',claudeKey:'FAKE_KEY',spotify:{access:'FAKE_ACCESS',refresh:'FAKE_REFRESH',expires:Date.now()+3600000,subject:'owner'}},-1);
    return response({ok:true});
  }
  return response(await makeSelection('owner',params.get('prompt'),10));
}catch(error){return fail(error);}}};`;

async function fixture(scenario="normal") {
  const inference=[],lookups=[],writes=[];
  let proposals=[...Array.from({length:6},(_,i)=>({title:`Familiar ${i}`,artist:'Pearl Jam'})),...Array.from({length:9},(_,i)=>({title:`Discovery ${i}`,artist:`Related ${Math.floor(i/2)}`}))];
  const initial=scenario==='normal'?proposals:proposals.slice(6,11);
  const extras=Array.from({length:8},(_,i)=>({title:`Refill ${i}`,artist:`New ${i}`}));
  proposals=[...proposals,...extras];
  const worker=new Miniflare({modules:true,compatibilityDate:'2026-05-15',script:source,d1Databases:['DB'],bindings:{DATA_ENCRYPTION_KEY:'01'.repeat(32),SPOTIFY_REPLACE_ENABLED:'true'},log:new Log(LogLevel.NONE),outboundService:async request=>{
    const url=new URL(request.url);
    if(url.hostname==='api.anthropic.com'&&url.pathname.endsWith('/models'))return Response.json({data:[{id:'claude-opus-5-5'},{id:'claude-haiku-4-5'},{id:'claude-haiku-5-5'},{id:'claude-haiku-6-0',lifecycle:'retired'}]});
    if(url.hostname==='api.anthropic.com') {
      const body=await request.json();inference.push(body);const input=JSON.parse(body.messages[0].content);
      const brief={kind:'similarity',referenceArtists:['Pearl Jam'],excludedArtists:[],genre:'grunge',mood:'',era:'',discovery:'balanced',referenceCount:input.request.includes('include more')?6:-1,excludedVersions:[]};
      if(scenario==='changed'&&input.refillCount)brief.mood='changed';
      const songs=input.refillCount?(scenario==='exhausted'?initial:extras):initial;
      return Response.json({stop_reason:'end_turn',content:[{type:'thinking',thinking:'Private fixture thought'},{type:'text',text:JSON.stringify({songs,brief})}]});
    }
    if(request.method!=='GET'){writes.push(url.pathname);throw Error('Selection must never mutate Spotify');}
    if(url.pathname.endsWith('/me/player/queue'))return Response.json({currently_playing:null,queue:[]});
    if(url.pathname.endsWith('/search')) {
      const query=url.searchParams.get('q');lookups.push(query);const row=proposals.find(s=>query.includes(JSON.stringify(s.title))&&query.includes(JSON.stringify(s.artist)));
      return Response.json({tracks:{items:row?[{type:'track',id:String(proposals.indexOf(row)+1).padStart(22,'0'),name:row.title+' - 2024 Remaster',artists:[{id:'artist',name:row.artist}],album:{images:[]}}]:[]}});
    }
    throw Error('Unexpected read '+url.pathname);
  }});
  try {const init=await worker.dispatchFetch('https://fixture.test/init');assert.equal(init.status,200,await init.text());}catch(error){await worker.dispose();throw error;}
  return {worker,inference,lookups,writes};
}

test('actual selection route uses offered Haiku, one inference, reserves for variety and safe remaster matching',async()=>{
  const {worker,inference,lookups,writes}=await fixture();
  try {
    const reply=await worker.dispatchFetch('https://fixture.test/select?prompt='+encodeURIComponent('songs like Pearl Jam'));
    assert.equal(reply.status,200);const result=await reply.json();
    assert.equal(result.tracks.length,10);assert.notEqual(result.tracks[0].artist,'Pearl Jam');
    assert.equal(result.tracks.filter(t=>t.artist==='Pearl Jam').length,2);
    assert.equal(inference.length,1);assert.equal(inference[0].model,'claude-haiku-5-5');
    assert.equal(inference[0].output_config.effort,'low');assert.equal(inference[0].output_config.format.type,'json_schema');
    assert(!JSON.stringify(inference).includes('FAKE_ACCESS'));assert(!JSON.stringify(inference).includes('spotify:'));
    assert.equal(lookups.length,15);assert.equal(writes.length,0);
    for(let i=1;i<result.tracks.length;i++)assert.notEqual(result.tracks[i].artist,result.tracks[i-1].artist);
  }finally{await worker.dispose();}
});

test('explicit artist allocation is preserved rather than overridden by the default discovery quota',async()=>{
  const {worker,inference}=await fixture();
  try {
    const reply=await worker.dispatchFetch('https://fixture.test/select?prompt='+encodeURIComponent('songs like Pearl Jam, include more from them'));
    assert.equal(reply.status,200);const result=await reply.json();
    assert.equal(result.tracks.length,10);assert.equal(result.tracks.filter(t=>t.artist==='Pearl Jam').length,6);
    assert.equal(inference.length,1);
  }finally{await worker.dispose();}
});

test('actual selection route fills rejected slots once, preserves the first accepted songs and sends only prior model proposals as exclusions',async()=>{
 const {worker,inference,writes}=await fixture('refill');
 try {
  const result=await worker.dispatchFetch('https://fixture.test/select?prompt='+encodeURIComponent('songs like Pearl Jam'));
  assert.equal(result.status,200);const value=await result.json();assert.equal(value.tracks.length,10);assert.equal(inference.length,2);
  const refill=JSON.parse(inference[1].messages[0].content);assert.equal(refill.count,10);assert.equal(refill.refillCount,5);assert.equal(refill.avoid.length,5);
  assert(!JSON.stringify(refill).includes('spotify:'));assert.equal(value.tracks.filter(t=>t.title.startsWith('Discovery')).length,5);assert.equal(writes.length,0);
 }finally{await worker.dispose();}
});
test('exhausted and changed-brief refills cannot loop or silently change the request',async()=>{
 for(const scenario of ['exhausted','changed']) {
  const {worker,inference,writes}=await fixture(scenario);
  try {const result=await worker.dispatchFetch('https://fixture.test/select?prompt='+encodeURIComponent('songs like Pearl Jam'));assert.equal(result.status,scenario==='changed'?502:200);if(scenario==='exhausted')assert.equal((await result.json()).tracks.length,5);assert.equal(inference.length,2);assert.equal(writes.length,0);}
  finally{await worker.dispose();}
 }
});

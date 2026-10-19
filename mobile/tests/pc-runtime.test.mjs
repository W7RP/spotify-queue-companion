import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {Miniflare,Log,LogLevel} from 'miniflare';
let source="import {env} from 'cloudflare:workers';\n";
for(const file of ['core.mjs','curation.ts','pc-jobs.mjs','http.mjs','server.ts','pc.ts']) {
 let value=await readFile(new URL('../lib/queue/'+file,import.meta.url),'utf8');value=value.replace(/^import .*;\r?\n/gm,'').replace('export { boundedFetch };','');
 source+=(file.endsWith('.ts')?ts.transpileModule(value,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText:value)+'\n';
}
source=source.replace(/^export /gm,'');
const schema=(await Promise.all(['0000_low_thunderbolt.sql','0001_optimal_drax.sql'].map(file=>readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')))).join('\n');
source+=`
export default {async fetch(request){try {
 const path=new URL(request.url).pathname;
 if(path==='/init') {
  for(const sql of ${JSON.stringify(schema)}.split(';').map(s=>s.replace(/--> statement-breakpoint/g,'').trim()).filter(Boolean))await db().prepare(sql).run();
  await db().prepare('INSERT INTO pc_bridge(id,user_id,models) VALUES (1,?,?)').bind('owner','[]').run();
  await db().prepare('INSERT INTO pc_requests VALUES (?,?,?,?,?,?,?)').bind('job','owner','running',await seal({prompt:'songs like Pearl Jam',count:10,reserve:2,refillCount:3,structured:true},'owner'),null,'x'.repeat(43),Date.now()+60000).run();
  return response({ready:true});
 }
 if(path==='/inspect') {const row=await db().prepare('SELECT state,result FROM pc_requests WHERE id=?').bind('job').first();return response({state:row.state,value:await open(row.result,'owner')});}
 return await computerEndpoint(request);
}catch(error){return fail(error);}}};`;
const token='a'.repeat(43),brief={kind:'similarity',referenceArtists:['Pearl Jam'],excludedArtists:[],genre:'grunge',mood:'',era:'',discovery:'balanced',referenceCount:-1,excludedVersions:[]};
async function fixture() {
 const worker=new Miniflare({modules:true,compatibilityDate:'2026-05-15',script:source,d1Databases:['DB'],bindings:{DATA_ENCRYPTION_KEY:'01'.repeat(32),PC_BRIDGE_TOKEN_HASH:createHash('sha256').update(token).digest('base64url')},log:new Log(LogLevel.NONE)});
 try {const init=await worker.dispatchFetch('https://fixture.test/init');assert.equal(init.status,200,await init.text());}catch(error){await worker.dispose();throw error;}
 const complete=(changes={})=>worker.dispatchFetch('https://fixture.test/api/pc/complete',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({id:'job',claim:'x'.repeat(43),ok:true,songs:[{title:'Different',artist:'Other'}],brief,...changes})});
 return {worker,complete};
}
test('PC completion carries a validated brief across the encrypted mailbox, is single-use, and rejects a wrong claim',async()=>{
 const {worker,complete}=await fixture();try {
  assert.equal((await complete({claim:'y'.repeat(43)})).status,409);
  assert.equal((await complete()).status,200);
  const result=await (await worker.dispatchFetch('https://fixture.test/inspect')).json();assert.equal(result.state,'complete');assert.deepEqual(result.value.brief,brief);
  assert.equal((await complete()).status,409);
 }finally{await worker.dispose();}
});
test('an invalid or missing PC brief finishes as a clear failure instead of leaving a running job until timeout',async()=>{
 const {worker,complete}=await fixture();try {
  assert.equal((await complete({brief:null})).status,200);
  const result=await (await worker.dispatchFetch('https://fixture.test/inspect')).json();assert.equal(result.state,'failed');assert.match(result.value.error,/invalid music brief/);
 }finally{await worker.dispose();}
});

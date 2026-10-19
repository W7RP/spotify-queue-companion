import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
const {curateArtists,selectionBrief,fastModel,isReferenceArtist,validateMusicBrief,canRefill}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(await readFile(new URL('../lib/queue/curation.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));

const song=(artist,n)=>({artist,artistNames:[artist],title:`Track ${n}`});
const musicBrief=(overrides={})=>({kind:'similarity',referenceArtists:['Pearl Jam'],excludedArtists:[],genre:'grunge',mood:'',era:'',discovery:'balanced',referenceCount:-1,excludedVersions:[],...overrides});
test('structured briefs handle relative language and enforce exclusions without relying on similarity keywords',()=>{
  const brief=selectionBrief('heavier than Pearl Jam, without Pearl Jam or live versions',10,musicBrief({referenceCount:0,excludedArtists:['Pearl Jam'],excludedVersions:['live']}));
  const tracks=[song('Pearl Jam',1),{...song('Related',2),title:'Song - Live'},song('Other',3)];
  assert.deepEqual(curateArtists(tracks,brief).map(t=>t.artist),['Other']);
  assert.equal(curateArtists([{...song('Oasis',4),title:'Live Forever'}],brief).length,1);
  assert(!isReferenceArtist(song('Jam',5),selectionBrief('songs like Pearl Jam',10,musicBrief())));
});
test('explicit half-and-half keeps its allocation while balancing artist order',()=>{
  const brief=selectionBrief('songs like Pearl Jam, half by Pearl Jam and half other artists',10,musicBrief({referenceCount:5}));
  const tracks=[...Array.from({length:8},(_,i)=>song('Pearl Jam',i)),...Array.from({length:10},(_,i)=>song('Related '+i,20+i))];
  const result=curateArtists(tracks,brief);assert.equal(result.length,10);assert.equal(result.filter(t=>t.artist==='Pearl Jam').length,5);assert.notEqual(result[0].artist,'Pearl Jam');
});
test('unrequested artist restrictions, malformed briefs and inspiration relabeled as artist-only are rejected',()=>{
  assert.throws(()=>validateMusicBrief(musicBrief({referenceArtists:['Unmentioned']}),'songs like Pearl Jam',10),/not requested/);
  assert.throws(()=>validateMusicBrief(musicBrief({kind:'artist-only'}),'songs like Pearl Jam',10),/artist-only/);
  assert.throws(()=>validateMusicBrief(musicBrief({referenceCount:100}),'songs like Pearl Jam',10),/limits/);
  assert.throws(()=>validateMusicBrief(musicBrief({excludedArtists:['Pearl Jam']}),'songs like Pearl Jam',10),/exclusion/);
  assert.equal(canRefill(10,10,Date.now()),false);assert.equal(canRefill(4,10,Date.now()-100000),false);assert.equal(canRefill(4,10,Date.now(),false),false);assert.equal(canRefill(4,10,Date.now()),true);
});
test('a reference artist remains a small familiar portion and never opens discovery',()=>{
  const pool=[...Array.from({length:8},(_,i)=>song('Pearl Jam',i)),...Array.from({length:15},(_,i)=>song(`Related ${Math.floor(i/3)}`,20+i))];
  const brief=selectionBrief('songs like Pearl Jam',10), selected=curateArtists(pool,brief);
  assert.equal(selected.length,10);
  assert.equal(selected.filter(t=>t.artist==='Pearl Jam').length,2);
  assert.notEqual(selected[0].artist,'Pearl Jam');
  for(let i=1;i<selected.length;i++)assert.notEqual(selected[i].artist,selected[i-1].artist);
});
test('reference quota applies across several named bands and matching respects artist boundaries',()=>{
  const brief=selectionBrief('music similar to "Pearl Jam" and Soundgarden',20);
  assert(isReferenceArtist(song('Pearl Jam',1),brief));assert(isReferenceArtist(song('Soundgarden',1),brief));
  assert(!isReferenceArtist(song('Jam',1),selectionBrief('songs like Jamiroquai',20)));
  const selected=curateArtists([...Array.from({length:8},(_,i)=>song(i%2?'Pearl Jam':'Soundgarden',i)),...Array.from({length:25},(_,i)=>song(`Related ${i}`,20+i))],brief);
  assert.equal(selected.filter(t=>isReferenceArtist(t,brief)).length,4);
});
test('single-artist requests, source restrictions and explicit allocations retain their choices',()=>{
  const pool=Array.from({length:10},(_,i)=>song('Pearl Jam',i));
  for(const prompt of ['songs by Pearl Jam','only Pearl Jam','songs like Pearl Jam but only Pearl Jam','songs like Pearl Jam, half from them','songs like Pearl Jam, include more of them'])assert.equal(curateArtists(pool,selectionBrief(prompt,10)).length,10,prompt);
  assert.equal(curateArtists(pool,selectionBrief('songs like Pearl Jam',10),true).length,10);
});
test('an all-reference response cannot masquerade as discovery, including a one-song request',()=>{
  assert.equal(curateArtists([song('Pearl Jam',1)],selectionBrief('songs like Pearl Jam',10)).length,0);
  assert.deepEqual(curateArtists([song('Pearl Jam',1),song('Related',2)],selectionBrief('songs like Pearl Jam',1)).map(t=>t.artist),['Related']);
});
test('a recording or era restriction does not turn artist similarity into an artist-only request',()=>{
  assert.equal(selectionBrief('songs like Pearl Jam but only studio recordings',20).balance,true);
  assert.equal(selectionBrief('songs like Pearl Jam but only 90s music',20).balance,true);
  assert.equal(selectionBrief('songs like Pearl Jam but only songs by Pearl Jam',20).balance,false);
});
test('offered fast models are selected numerically, preserving explicit selections and catalogue fallback',()=>{
  assert.equal(fastModel([{id:'gpt-6-astra'},{id:'gpt-5.6-luna'},{id:'gpt-6-luna'}],'chatgpt'),'gpt-6-luna');
  assert.equal(fastModel([{id:'claude-sonnet-5-5'},{id:'claude-haiku-4-5'},{id:'claude-haiku-5-5'}],'claude'),'claude-haiku-5-5');
  assert.equal(fastModel([{id:'claude-haiku-5-5'},{id:'claude-sonnet-5-5'}],'claude','claude-sonnet-5-5'),'claude-sonnet-5-5');
  assert.equal(fastModel([{id:'offered'}],'chatgpt'),'offered');assert.equal(fastModel([],'claude'),undefined);
});

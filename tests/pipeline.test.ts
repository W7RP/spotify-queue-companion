import test from 'node:test';import assert from 'node:assert/strict';
import {Pipeline} from '../extension/src/pipeline';import type {Track} from '../extension/src/domain';
const t=(n:number,source='liked'):Track=>({id:String(n).padStart(22,'0'),uri:'spotify:track:'+String(n).padStart(22,'0'),title:`Song ${n}`,artist:'Artist',source});
const preferences={length:1,cap:50,mode:'append' as const,history:true};
function fixture(options:{snapshot?:()=>Promise<any>;recent?:()=>Promise<Track[]>;history?:()=>Promise<any>;likes?:()=>Promise<Track[]>;search?:(term:string,limit:number)=>Promise<Track[]>;resolve?:(title:string,artist:string)=>Promise<Track|null>;generate?:(data:any,signal?:AbortSignal)=>Promise<any>}={}){
  const writes:Track[][]=[];const requests:any[]=[];
  const spotify:any={snapshot:options.snapshot??(async()=>({account:'a',local:true,current:t(9).uri,revision:'r',entries:[]})),account:async()=>'a',recent:options.recent??(async()=>[t(1),t(2)]),liked:options.likes??(async()=>[t(1),t(2)]),playlists:async()=>[{name:'Road',uri:'spotify:playlist:'+String(1).padStart(22,'0')}],playlist:async(uri:string)=>[t(1,uri),t(2,uri)],validate:async(x:Track[])=>x,search:options.search??(async()=>[t(1,'catalogue'),t(2,'catalogue')]),resolve:options.resolve??(async()=>t(99,'catalogue'))};
  const helper:any={request:async(type:string,data:any,signal?:AbortSignal)=>{if(type==='history')return options.history?options.history():{tracks:[t(1),t(2)],coverage:'Local counts'};assert.equal(type,'generate');requests.push(data);return options.generate?options.generate(data,signal):{ids:[data.candidates[0].id],suggestions:[],generationMs:1};}};
  const writer:any={commit:async(tracks:Track[])=>{writes.push(tracks);return{count:tracks.length,insertionMs:1};}};
  return {pipeline:new Pipeline(spotify,helper,writer,async()=>{throw Error('Unexpected chooser');},()=>{}),writes,requests};
}
test('pipeline intersects playlist and liked restrictions before selecting',async()=>{const f=fixture({likes:async()=>[t(1)]});await f.pipeline.run('Add 1 metal songs only from my liked songs and "Road" playlist',preferences);assert.deepEqual(f.requests[0].candidates.map((x:Track)=>x.uri),[t(1).uri]);assert.equal(f.requests[0].restricted,true);assert.equal(f.writes[0][0].uri,t(1).uri);});
test('a liked-song removed during generation stops the native write',async()=>{let reads=0;const f=fixture({likes:async()=>++reads===1?[t(1)]:[]});await assert.rejects(f.pipeline.run('Add 1 metal songs only from my liked songs',preferences),/source/);assert.equal(f.writes.length,0);});
test('pipeline rejects suggestions outside an explicit source even if a provider misbehaves',async()=>{const f=fixture({generate:async()=>({ids:[],suggestions:[{title:'Other',artist:'Other'}],generationMs:1})});await assert.rejects(f.pipeline.run('Add 1 metal songs only from my liked songs',preferences),/source/);assert.equal(f.writes.length,0);});
test('add more inherits the liked source, carries compact context and excludes the last selection',async()=>{const f=fixture();await f.pipeline.run('Add 1 metal songs only from my liked songs',preferences);await f.pipeline.run('Add another one songs like these',preferences);assert.equal(f.requests[1].restricted,true);assert.deepEqual(f.requests[1].previous,[{title:'Song 1',artist:'Artist'}]);assert(!f.requests[1].candidates.some((x:Track)=>x.uri===t(1).uri));assert.equal(f.writes[1][0].uri,t(2).uri);});
test('a second generation cancels the first before mutation',async()=>{let call=0;let started!:()=>void;const pending=new Promise<void>(r=>started=r);const f=fixture({generate:async(data,signal)=>{if(++call===1){started();await new Promise((_,reject)=>signal!.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));}return{ids:[data.candidates[0].id],suggestions:[],generationMs:1};}});const first=f.pipeline.run('Add 1 metal songs only from my liked songs',preferences);const rejected=assert.rejects(first,e=>e instanceof DOMException&&e.name==='AbortError');await pending;await f.pipeline.run('Add 1 calm songs only from my liked songs',preferences);await rejected;assert.equal(f.writes.length,1);});

const discoveryPrompt='classic rock hits, but not the most listened to. find me hidden gems';
const fifty={...preferences,length:50};
const suggestions=(count:number)=>Array.from({length:count},(_,i)=>({title:String(i+1),artist:'Artist'}));

test('50-song discovery fills seven failed matches from reserves in one inference and one write',async()=>{
  let searched=0,resolved=0;
  const f=fixture({search:async(_term,limit)=>{searched=limit;return Array.from({length:100},(_,i)=>t(i+1,'catalogue'));},generate:async()=>({ids:[],suggestions:suggestions(75),generationMs:1}),resolve:async title=>{resolved++;const n=Number(title);return n<=7?null:t(n+100,'catalogue');}});
  const result=await f.pipeline.run(discoveryPrompt,fifty);
  assert.equal(searched,100);assert.equal(f.requests.length,1);assert.equal(f.requests[0].count,50);assert.equal(f.requests[0].reserve,25);
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].length,50);assert.equal(new Set(f.writes[0].map(t=>t.uri)).size,50);
  assert.equal(result.selection.unmatched,7);assert.equal(result.shortfall,'');assert(resolved<75,'Unused reserves should not all be looked up');
});

test('43 of 50 reports seven unmatched Spotify suggestions instead of implying seven queue failures',async()=>{
  const f=fixture({generate:async()=>({ids:[],suggestions:suggestions(50),generationMs:1}),resolve:async title=>Number(title)<=7?null:t(Number(title)+100,'catalogue')});
  const result=await f.pipeline.run(discoveryPrompt,fifty);
  assert.equal(result.count,43);assert.equal(result.requested,50);assert.equal(result.selection.proposed,50);assert.equal(result.selection.unmatched,7);
  assert.match(result.shortfall,/7 suggested songs could not be matched on Spotify/);assert.equal(f.writes[0].length,43);
});

test('a model shortfall is distinguished from duplicate Spotify matches',async()=>{
  const f=fixture({generate:async()=>({ids:[],suggestions:suggestions(4),generationMs:1}),resolve:async title=>t(Number(title)===2?1:Number(title),'catalogue')});
  const result=await f.pipeline.run(discoveryPrompt,{...preferences,length:5});
  assert.equal(result.count,3);assert.equal(result.selection.duplicates,1);assert.match(result.shortfall,/model returned 4 choices/);assert.match(result.shortfall,/1 duplicate match was skipped/);
});

test('unused reserve IDs cannot hide invalid choices but valid duplicates can be recovered',async()=>{
  const f=fixture({generate:async data=>({ids:[data.candidates[0].id,data.candidates[1].id,'unknown'],suggestions:[],generationMs:1})});
  await assert.rejects(f.pipeline.run(discoveryPrompt,{...preferences,length:2}),/Invalid model/);assert.equal(f.writes.length,0);
  const duplicate=fixture({generate:async data=>({ids:[data.candidates[0].id,data.candidates[1].id,data.candidates[0].id],suggestions:[],generationMs:1})});
  const result=await duplicate.pipeline.run(discoveryPrompt,{...preferences,length:2});assert.equal(result.count,2);assert.equal(duplicate.writes.length,1);
});

test('music like recent plays discovers new tracks on a fresh session instead of replaying history',async()=>{
  const seedA={...t(1),artist:'Rock Artist'},seedB={...t(2),artist:'Soul Artist'};const searches:string[]=[];
  const f=fixture({recent:async()=>[seedA,seedA,seedB],search:async artist=>{searches.push(artist);return [seedA,seedB,t(9),t(20,'catalogue'),t(21,'catalogue')];},generate:async data=>({ids:data.candidates.map((t:Track)=>t.id),suggestions:[{title:'Song 1',artist:'Rock Artist'},{title:'Related song',artist:'Related Artist'}],generationMs:1}),resolve:async title=>{assert.equal(title,'Related song');return {...t(22,'catalogue'),title,artist:'Related Artist'};}});
  const result=await f.pipeline.run('more music just like my recently played tracks',{...preferences,length:3});
  assert.deepEqual(searches,['Rock Artist','Soul Artist']);assert.equal(f.requests.length,1);assert.equal(f.requests[0].restricted,false);assert.equal(f.requests[0].seeds.length,2);
  assert.equal(result.count,3);assert.deepEqual(f.writes[0].map(t=>t.id),[20,22,21].map(n=>t(n).id));assert.equal(result.selection.previous,1);assert.match(result.coverage,/Inspired/);
});

test('plain recent replay removes repeated history entries before taking the target',async()=>{
  const f=fixture({recent:async()=>[t(1),t(1),t(2),t(1),t(3)]});
  const result=await f.pipeline.run('Play my recently played tracks',{...preferences,length:3});
  assert.equal(result.count,3);assert.equal(f.requests.length,0);assert.deepEqual(f.writes[0].map(t=>t.id),[1,2,3].map(n=>t(n).id));
});

test('valid duplicate model IDs are skipped and replaced by reserve candidates',async()=>{
  const f=fixture({search:async()=>[t(1),t(2),t(3)],generate:async data=>({ids:[data.candidates[0].id,data.candidates[0].id,data.candidates[1].id,data.candidates[2].id],suggestions:[],generationMs:1})});
  const result=await f.pipeline.run('rock songs, no duplicates',{...preferences,length:3});
  assert.equal(result.count,3);assert.equal(result.selection.duplicates,1);assert.equal(f.requests.length,1);assert.equal(new Set(f.writes[0].map(t=>t.uri)).size,3);
});

test('duplicate and already-known suggestions are removed before Spotify lookups',async()=>{
  let lookups=0;const f=fixture({recent:async()=>[t(1)],search:async()=>[],generate:async()=>({ids:[],suggestions:[{title:'Song 1',artist:'Artist'},{title:'New',artist:'Artist'},{title:'New',artist:'Artist'},{title:'Other',artist:'Other'}],generationMs:1}),resolve:async(title,artist)=>{lookups++;return {...t(title==='New'?20:21),title,artist};}});
  const result=await f.pipeline.run('Find new songs like my recently played tracks',{...preferences,length:3});
  assert.equal(result.count,2);assert.equal(lookups,2);assert.equal(result.selection.duplicates,1);assert.equal(result.selection.previous,1);
});

test('alternate album editions of recent seed songs cannot be reintroduced as discovery',async()=>{
  const f=fixture({recent:async()=>[{...t(1),title:'Familiar'}],search:async()=>[{...t(2),title:'Familiar - 2011 Remaster'},t(3)],generate:async data=>({ids:data.candidates.map((t:Track)=>t.id),suggestions:[{title:'Familiar',artist:'Artist'},{title:'New',artist:'Artist'}],generationMs:1}),resolve:async title=>({...t(4),title})});
  const result=await f.pipeline.run('music similar to my recently played tracks',{...preferences,length:2});
  assert.equal(result.count,2);assert.equal(f.requests[0].candidates.length,1);assert.deepEqual(f.writes[0].map(t=>t.id),[t(3).id,t(4).id]);
});

test('recent-inspired discovery still respects an explicit liked-song restriction',async()=>{
  const f=fixture({recent:async()=>[t(1)],likes:async()=>[t(1),t(2),t(3)]});
  const result=await f.pipeline.run('songs like my recently played tracks, only from my liked songs',preferences);
  assert.equal(result.count,1);assert.equal(f.requests[0].restricted,true);assert.equal(f.requests[0].reserve,0);assert.deepEqual(f.requests[0].candidates.map((t:Track)=>t.uri),[t(2).uri,t(3).uri]);
});

test('locally most-played songs can seed discovery without being queued again',async()=>{
  const f=fixture({history:async()=>({tracks:[t(1)],coverage:'Locally observed counts'}),search:async()=>[t(1),t(2)]});
  const result=await f.pipeline.run('discover music similar to my most played songs',preferences);
  assert.equal(result.count,1);assert.equal(f.writes[0][0].uri,t(2).uri);assert.equal(f.requests[0].seeds[0].title,t(1).title);assert.match(result.coverage,/Locally observed/);
});

test('an empty history cannot silently become unrelated discovery',async()=>{
  const f=fixture({recent:async()=>[]});await assert.rejects(f.pipeline.run('music like my recently played tracks',preferences),/No listening references/);assert.equal(f.requests.length,0);assert.equal(f.writes.length,0);
});

test('source replacement can reuse songs from the queue that it is replacing',async()=>{
  const f=fixture({snapshot:async()=>({account:'a',local:true,current:t(9).uri,revision:'r',entries:[{uri:t(1).uri,uid:'old',manual:true}]}),likes:async()=>[t(1)]});
  const result=await f.pipeline.run('start over with songs only from my liked songs',preferences);
  assert.equal(result.mode,'replace');assert.equal(result.count,1);assert.equal(f.writes[0][0].uri,t(1).uri);
});

test('a restricted source shortfall stays restricted and never generates catalogue reserves',async()=>{
  const f=fixture({likes:async()=>Array.from({length:100},(_,i)=>t(i+1)),generate:async data=>({ids:data.candidates.slice(0,19).map((t:Track)=>t.id),suggestions:[],generationMs:1})});
  const result=await f.pipeline.run('classic rock only from my liked songs',{...preferences,length:25});
  assert.equal(result.count,19);assert.equal(f.requests[0].reserve,0);assert.equal(f.requests[0].restricted,true);assert.match(result.shortfall,/19 matches.*99 source songs checked/);assert.equal(f.requests.length,1);
});

test('repeated requests retain cancellation while resolving reserve suggestions',async()=>{
  let started!:()=>void,finish!:()=>void;const resolving=new Promise<void>(r=>started=r),pending=new Promise<void>(r=>finish=r);let call=0;
  const f=fixture({generate:async data=>++call===1?{ids:[],suggestions:suggestions(2),generationMs:1}:{ids:[data.candidates[0].id],suggestions:[],generationMs:1},resolve:async()=>{started();await pending;return t(99,'catalogue');}});
  const first=f.pipeline.run(discoveryPrompt,preferences);const rejection=assert.rejects(first,e=>e instanceof DOMException&&e.name==='AbortError');await resolving;
  await f.pipeline.run('something calm',preferences);finish();await rejection;assert.equal(f.writes.length,1);
});

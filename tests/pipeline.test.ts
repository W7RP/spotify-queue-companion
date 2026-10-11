import test from 'node:test';import assert from 'node:assert/strict';
import {Pipeline} from '../extension/src/pipeline';import type {Track,Playlist} from '../extension/src/domain';
const t=(n:number,source='liked'):Track=>({id:String(n).padStart(22,'0'),uri:'spotify:track:'+String(n).padStart(22,'0'),title:`Song ${n}`,artist:'Artist',source});
const preferences={length:1,cap:50,mode:'append' as const,history:true};
function fixture(options:{snapshot?:()=>Promise<any>;recent?:()=>Promise<Track[]>;history?:()=>Promise<any>;likes?:()=>Promise<Track[]>;playlist?:(uri:string)=>Promise<Track[]>;playlists?:()=>Promise<Playlist[]>;choose?:(name:string,options:Playlist[],signal:AbortSignal)=>Promise<Playlist>;search?:(term:string,limit:number)=>Promise<Track[]>;resolve?:(title:string,artist:string)=>Promise<Track|null>;generate?:(data:any,signal?:AbortSignal)=>Promise<any>}={}){
  const writes:Track[][]=[];const requests:any[]=[];
  const spotify:any={snapshot:options.snapshot??(async()=>({account:'a',local:true,current:t(9).uri,revision:'r',entries:[]})),account:async()=>'a',recent:options.recent??(async()=>[t(1),t(2)]),liked:options.likes??(async()=>[t(1),t(2)]),playlists:options.playlists??(async()=>[{name:'Road',uri:'spotify:playlist:'+String(1).padStart(22,'0')}]),playlist:options.playlist??(async(uri:string)=>[t(1,uri),t(2,uri)]),validate:async(x:Track[])=>x,search:options.search??(async()=>[t(1,'catalogue'),t(2,'catalogue')]),resolve:options.resolve??(async()=>t(99,'catalogue'))};
  const helper:any={request:async(type:string,data:any,signal?:AbortSignal)=>{if(type==='history')return options.history?options.history():{tracks:[t(1),t(2)],coverage:'Local counts'};assert.equal(type,'generate');requests.push(data);return options.generate?options.generate(data,signal):{ids:[data.candidates[0].id],suggestions:[],generationMs:1};}};
  const writer:any={commit:async(tracks:Track[])=>{writes.push(tracks);return{count:tracks.length,insertionMs:1};}};
  return {pipeline:new Pipeline(spotify,helper,writer,options.choose??(async()=>{throw Error('Unexpected chooser');}),()=>{}),writes,requests};
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


test('playlist similarity discovers outside the playlist on a fresh session in one inference',async()=>{
  let reads=0;const f=fixture({playlist:async uri=>{reads++;return [t(1,uri),t(2,uri)];},search:async()=>[t(1),t(2),{...t(3),title:'Song 1 - 2011 Remaster'},t(20),t(21)],generate:async data=>({ids:data.candidates.map((t:Track)=>t.id),suggestions:[{title:'Song 2',artist:'Artist'},{title:'Related',artist:'Related Artist'}],generationMs:1}),resolve:async(title,artist)=>{assert.equal(title,'Related');return {...t(22),title,artist};}});
  const result=await f.pipeline.run('more songs similar to the ones in my "Road" playlist, but branch out a bit',{...preferences,length:3});
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].restricted,false);assert.equal(f.requests[0].reserve,2);assert.equal(f.requests[0].seeds.length,2);assert.equal(reads,1);
  assert.deepEqual(new Set(f.writes[0].map(t=>t.uri)),new Set([t(20).uri,t(21).uri,t(22).uri]));assert.equal(result.count,3);assert.match(result.coverage,/playlist songs/);assert.equal(result.selection.previous,1);
});
test('plain playlist selection remains deterministic and does not search or infer',async()=>{
  const f=fixture({search:async()=>{throw Error('Unexpected catalogue search');}});await f.pipeline.run('songs from my "Road" playlist',{...preferences,length:2});assert.equal(f.requests.length,0);assert.deepEqual(f.writes[0].map(t=>t.uri),[t(1).uri,t(2).uri]);
});
test('playlist inspiration preserves an explicit liked-song restriction',async()=>{
  const f=fixture({likes:async()=>[t(1),t(20)]});await f.pipeline.run('songs similar to my "Road" playlist, only from my liked songs',preferences);
  assert.equal(f.requests[0].restricted,true);assert.equal(f.requests[0].reserve,0);assert.equal(f.requests[0].seeds.length,2);assert.deepEqual(f.writes[0].map(t=>t.uri),[t(20).uri]);
});
test('one playlist can inspire a selection restricted to another, with fresh membership checks',async()=>{
  const source='spotify:playlist:'+String(2).padStart(22,'0');let reads=0;
  const f=fixture({playlist:async uri=>{if(uri===source){reads++;return reads===1?[t(20,uri)]:[];}return [t(1,uri)];}});
  await assert.rejects(f.pipeline.run('songs like "Road", only from '+source,preferences),/source/);assert.equal(f.requests[0].restricted,true);assert.equal(f.requests[0].seeds[0].title,'Song 1');assert.equal(f.writes.length,0);
});
test('reference exclusions cover all retrieved playlists beyond the 200 candidate bound',async()=>{
  const f=fixture({playlist:async uri=>Array.from({length:200},(_,i)=>t(i+(uri.endsWith('1')?1:201),uri)),search:async()=>[t(300),t(500)],generate:async data=>({ids:data.candidates.map((t:Track)=>t.id),suggestions:[],generationMs:1})});
  await f.pipeline.run('songs like "Road" and spotify:playlist:0000000000000000000002',preferences);assert.deepEqual(f.writes[0].map(t=>t.uri),[t(500).uri]);assert.equal(f.requests[0].seeds.length,12);
});
test('empty or missing reference playlists never silently fall back to catalogue discovery',async()=>{
  const empty=fixture({playlist:async()=>[]});await assert.rejects(empty.pipeline.run('songs like "Road" playlist',preferences),/reference playlist/);assert.equal(empty.requests.length,0);assert.equal(empty.writes.length,0);
  const missing=fixture();await assert.rejects(missing.pipeline.run('songs like "Missing" playlist',preferences),/No playlist/);assert.equal(missing.requests.length,0);assert.equal(missing.writes.length,0);
});
test('follow-up to playlist discovery stays unrestricted and excludes the previous selection',async()=>{
  let call=0;const f=fixture({search:async()=>++call===1?[t(20)]:[t(1),t(20),t(21)]});await f.pipeline.run('songs like "Road" playlist',preferences);await f.pipeline.run('add another song like these',preferences);
  assert.equal(f.requests[1].restricted,false);assert.deepEqual(f.requests[1].previous,[{title:'Song 20',artist:'Artist'}]);assert.deepEqual(f.writes[1].map(t=>t.uri),[t(21).uri]);
});


const blendPrompt='songs similar to my "Road" playlist, but include a few songs from the playlist too';
test('a blend fills both portions in one inference and interleaves familiar songs',async()=>{
 const f=fixture({playlist:async uri=>Array.from({length:5},(_,i)=>t(i+1,uri)),search:async()=>Array.from({length:45},(_,i)=>t(i+20)),generate:async data=>({ids:data.candidates.slice(0,data.count+data.reserve).map((t:Track)=>t.id),suggestions:[],generationMs:1})});
 const result=await f.pipeline.run(blendPrompt,{...preferences,length:25});const originals=f.writes[0].filter(t=>Number(t.id)<10);
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].restricted,false);assert.equal(f.requests[0].playlistCount,3);assert.equal(f.requests[0].playlistIds.length,5);assert.equal(result.count,25);assert.equal(originals.length,3);assert.deepEqual(result.blend,{requested:3,included:3,discovered:22});
 assert(Number(f.writes[0][0].id)>=20);assert(f.writes[0].slice(0,12).some(t=>Number(t.id)<10));assert.equal(new Set(f.writes[0].map(t=>t.uri)).size,25);
});
test('the client preserves the split when a model omits originals instead of padding with discoveries',async()=>{
 const f=fixture({search:async()=>Array.from({length:40},(_,i)=>t(i+20)),generate:async data=>({ids:data.candidates.filter((t:Track)=>!data.playlistIds.includes(t.id)).slice(0,data.count+data.reserve).map((t:Track)=>t.id),suggestions:[],generationMs:1})});
 const result=await f.pipeline.run(blendPrompt,{...preferences,length:25});assert.equal(result.count,22);assert.deepEqual(result.blend,{requested:3,included:0,discovered:22});assert.match(result.shortfall,/0 of 3 requested playlist songs/);
});
test('too few available originals produce an explained partial blend',async()=>{
 const f=fixture({search:async()=>Array.from({length:40},(_,i)=>t(i+20)),generate:async data=>({ids:data.candidates.slice(0,data.count+data.reserve).map((t:Track)=>t.id),suggestions:[],generationMs:1})});
 const result=await f.pipeline.run(blendPrompt,{...preferences,length:25});assert.equal(result.count,24);assert.deepEqual(result.blend,{requested:3,included:2,discovered:22});assert.match(result.shortfall,/2 of 3 requested playlist songs/);
});
test('original-only model output cannot consume discovery slots',async()=>{
 const f=fixture({playlist:async uri=>Array.from({length:8},(_,i)=>t(i+1,uri)),search:async()=>[t(20)],generate:async data=>({ids:data.playlistIds,suggestions:[],generationMs:1})});
 await assert.rejects(f.pipeline.run(blendPrompt,{...preferences,length:25}),/No matching discoveries/);assert.equal(f.writes.length,0);
});
test('blend discovery excludes reference remasters and suggestions cannot fake playlist membership',async()=>{
 let lookups=0;const f=fixture({search:async()=>[{...t(10),title:'Song 1 - 2011 Remaster'},t(20),t(21)],generate:async data=>{assert(!data.candidates.some((candidate:Track)=>candidate.uri===t(10).uri));return {ids:[data.playlistIds[0],...data.candidates.filter((t:Track)=>!data.playlistIds.includes(t.id)).map((t:Track)=>t.id)],suggestions:[{title:'Song 1',artist:'Artist'},{title:'New',artist:'Other'}],generationMs:1};},resolve:async(title,artist)=>{lookups++;return {...t(22),title,artist};}});
 const result=await f.pipeline.run('songs like "Road", include one song from it',{...preferences,length:4});assert.deepEqual(result.blend,{requested:1,included:1,discovered:3});assert.equal(lookups,1);
});
test('a playlist original removed during generation prevents the entire blend write',async()=>{
 let reads=0;const f=fixture({playlist:async uri=>++reads===1?[t(1,uri),t(2,uri)]:[],search:async()=>[t(20)],generate:async data=>({ids:[data.playlistIds[0],data.candidates.find((t:Track)=>!data.playlistIds.includes(t.id)).id],suggestions:[],generationMs:1})});
 await assert.rejects(f.pipeline.run('songs like "Road", include one song from it',{...preferences,length:2}),/source/);assert.equal(f.writes.length,0);
});
test('blends respect liked membership for originals and discoveries and recheck both',async()=>{
 let reads=0;const f=fixture({likes:async()=>++reads===1?[t(1),t(20),t(21)]:[t(20),t(21)],generate:async data=>({ids:data.candidates.map((t:Track)=>t.id),suggestions:[],generationMs:1})});
 await assert.rejects(f.pipeline.run('songs like "Road", include one song from it, only from my liked songs',{...preferences,length:3}),/source/);assert.equal(f.requests[0].restricted,true);assert.equal(f.requests[0].reserve,0);assert.deepEqual(f.requests[0].candidates.map((t:Track)=>t.uri),[t(1).uri,t(20).uri,t(21).uri]);assert.equal(f.writes.length,0);
});
test('already queued originals are excluded while replacement can reuse them',async()=>{
 const make=(mode:'append'|'replace')=>fixture({snapshot:async()=>({account:'a',local:true,current:t(9).uri,revision:'r',entries:[{uri:t(1).uri,uid:'old',manual:true}]}),search:async()=>[t(20)],generate:async data=>({ids:[data.playlistIds[0],data.candidates.find((t:Track)=>!data.playlistIds.includes(t.id)).id],suggestions:[],generationMs:1})});
 for(const mode of ['append','replace'] as const){const f=make(mode);await f.pipeline.run('songs like "Road", include one song from it',{...preferences,length:2,mode});assert.equal(f.writes[0].find(t=>Number(t.id)<10)?.uri,t(mode==='append'?2:1).uri);}
});


test('a playlist reused as reference and original source needs only one ambiguity choice',async()=>{
 let choices=0;const chosen='spotify:playlist:'+String(2).padStart(22,'0');const f=fixture({playlists:async()=>[{name:'Road',uri:'spotify:playlist:'+String(1).padStart(22,'0')},{name:'Road',uri:chosen}],choose:async(_name,options)=>{choices++;return options[1];},playlist:async uri=>{assert.equal(uri,chosen);return [t(1,uri)];},search:async()=>[t(20)],generate:async data=>({ids:[data.playlistIds[0],data.candidates.find((t:Track)=>!data.playlistIds.includes(t.id)).id],suggestions:[],generationMs:1})});
 const result=await f.pipeline.run('songs like "Road", include one song from it',{...preferences,length:2});assert.equal(result.count,2);assert.equal(choices,1);assert.equal(f.writes[0].find(candidate=>candidate.uri===t(1).uri)?.source,chosen);
});


test('a mixed selection skips recordings with reordered artist credits and fills from reserves',async()=>{
 const familiar={...t(1),artist:'Singer, Guest',artistNames:['Singer','Guest']};
 const alternate={...t(3),title:'Song 1',artist:'Guest, Singer',artistNames:['Guest','Singer']};
 const newSong={...t(20),artist:'Band, Guest',artistNames:['Band','Guest']};
 const duplicate={...t(21),title:'Song 20',artist:'Guest, Band, Soundtrack',artistNames:['Guest','Band','Soundtrack']};
 const f=fixture({playlist:async uri=>[{...familiar,source:uri},t(2,uri)],search:async()=>[alternate,newSong,duplicate,t(22),t(23)],generate:async data=>({ids:[data.playlistIds[0],...data.candidates.filter((c:Track)=>!data.playlistIds.includes(c.id)).map((c:Track)=>c.id)],suggestions:[],generationMs:1})});
 const result=await f.pipeline.run('songs like "Road", include one song from it',{...preferences,length:4});assert.deepEqual(result.blend,{requested:1,included:1,discovered:3});assert.deepEqual(new Set(f.writes[0].map(t=>t.uri)),new Set([familiar.uri,newSong.uri,t(22).uri,t(23).uri]));
});

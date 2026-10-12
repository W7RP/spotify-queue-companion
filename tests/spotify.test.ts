import test from 'node:test';import assert from 'node:assert/strict';import {Spotify} from '../extension/src/spotify';
const track={id:'0000000000000000000001',uri:'spotify:track:0000000000000000000001',title:'Track',artist:'Artist',source:'liked'};

test('macOS cannot enable unverified queue replacement on an otherwise accepted Spotify version',()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  (globalThis as any).Spicetify={Platform:{version:'1.3.4.258'},removeFromQueue(){},Player:{origin:{_queue:{removeFromQueue(){}}}}};
  try{
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}});
    assert.equal(new Spotify({} as any).replaceSupported(),false);
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}});
    assert.equal(new Spotify({} as any).replaceSupported(),true);
  }finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete (globalThis as any).navigator;}
});

function searchFixture(page:(offset:number,limit:number)=>any){
  const calls:{offset:number;limit:number}[]=[];const cached:any[]=[];
  (globalThis as any).Spicetify={Platform:{UserAPI:{getUser:async()=>({username:'a'})}},GraphQL:{Request:async(_definition:any,args:any)=>{calls.push({offset:args.offset,limit:args.limit});return {data:{searchV2:{tracksV2:page(args.offset,args.limit)}}};}}};
  const helper:any={request:async(type:string,data:any)=>{if(type==='cache.put')cached.push(data);return null;}};
  return {spotify:new Spotify(helper),calls,cached};
}
const raw=(n:number)=>({uri:'spotify:track:'+String(n).padStart(22,'0'),name:'Song '+n,artists:[{name:'Artist'}],playability:{playable:true}});

test('large catalogue requests page beyond the old forty-candidate ceiling',async()=>{
  const f=searchFixture((offset,limit)=>({items:Array.from({length:limit},(_,i)=>raw(offset+i)),totalCount:150,pagingInfo:{nextOffset:offset+limit}}));
  const tracks=await f.spotify.search('classic rock',100);
  assert.equal(tracks.length,100);assert.deepEqual(f.calls,[{offset:0,limit:40},{offset:40,limit:40},{offset:80,limit:20}]);assert.equal(f.cached[0].value.length,100);
});

test('server-capped pages honor nextOffset while excluding unavailable and duplicate tracks',async()=>{
  const f=searchFixture((offset)=>({items:Array.from({length:20},(_,i)=>i===0?raw(1):i===1?{...raw(offset+i),playability:{playable:false}}:raw(offset+i)),totalCount:100,pagingInfo:{nextOffset:offset+20}}));
  const tracks=await f.spotify.search('rock',100);
  assert.equal(f.calls.length,5);assert.equal(tracks.length,91);assert.equal(new Set(tracks.map(t=>t.uri)).size,tracks.length);assert.deepEqual(f.calls.map(c=>c.offset),[0,20,40,60,80]);
});

test('stalled pagination stops and search remains bounded to five pages',async()=>{
  const stalled=searchFixture(()=>({items:[raw(1)],pagingInfo:{nextOffset:0}}));
  assert.equal((await stalled.spotify.search('rock',100)).length,1);assert.equal(stalled.calls.length,1);
  const capped=searchFixture(offset=>({items:[raw(offset)],pagingInfo:{nextOffset:offset+1}}));
  assert.equal((await capped.spotify.search('rock',200)).length,5);assert.equal(capped.calls.length,5);
  await assert.rejects(capped.spotify.search('rock',201),/candidate limit/);
});

test('a changed Spotify account cannot cache paginated results for the old account',async()=>{
  const f=searchFixture(()=>({items:[raw(1)],totalCount:1}));let reads=0;
  (globalThis as any).Spicetify.Platform.UserAPI.getUser=async()=>({username:++reads===1?'a':'b'});
  await assert.rejects(f.spotify.search('rock',50),/account changed/);assert.equal(f.cached.length,0);
});

test('availability checks use ten bounded parallel requests and preserve selection order',async()=>{
  let active=0,maximum=0,calls=0;
  (globalThis as any).Spicetify={GraphQL:{Definitions:{getTrack:{}},Request:async()=>{calls++;maximum=Math.max(maximum,++active);await new Promise(r=>setTimeout(r,2));active--;return {data:{trackUnion:{__typename:'Track',playability:{playable:true}}}};}}};
  const tracks=Array.from({length:25},(_,i)=>({...track,id:String(i).padStart(22,'0'),uri:raw(i).uri}));
  assert.deepEqual(await new Spotify({} as any).validate(tracks),tracks);assert.equal(maximum,10);assert.equal(calls,25);
});

test('recent history is bounded and rejects an account change before it can seed inference',async()=>{
  let reads=0;
  (globalThis as any).Spicetify={Platform:{UserAPI:{getUser:async()=>({username:++reads===1?'a':'b'})},PlayHistoryAPI:{getContents:async()=>({items:[raw(1)]})}}};
  await assert.rejects(new Spotify({} as any).recent(),/account changed/);
  (globalThis as any).Spicetify.Platform.UserAPI.getUser=async()=>({username:'a'});
  (globalThis as any).Spicetify.Platform.PlayHistoryAPI.getContents=async()=>({items:Array.from({length:250},(_,i)=>raw(i))});
  assert.equal((await new Spotify({} as any).recent()).length,200);
});
test('native track availability must be explicit before queueing',async()=>{let response:any={data:{trackUnion:{__typename:'Track',playability:{playable:true}}}};(globalThis as any).Spicetify={GraphQL:{Definitions:{getTrack:{}},Request:async()=>response}};const spotify=new Spotify({} as any);assert.deepEqual(await spotify.validate([track]),[track]);response={data:{trackUnion:{__typename:'Track'}}};await assert.rejects(spotify.validate([track]),/unavailable/);response={data:{trackUnion:{__typename:'Track',playability:{playable:false}}}};await assert.rejects(spotify.validate([track]),/unavailable/);});
test('catalogue resolution accepts exact artists and editions, rejecting other artists and partial titles',async()=>{const spotify=new Spotify({} as any);const edition={...track,title:'A Song',artist:'José González, Collaborator',artistNames:['José González','Collaborator']};(spotify as any).search=async()=>[edition,{...edition,id:'0000000000000000000002',uri:'spotify:track:0000000000000000000002'}];assert.equal((await spotify.resolve('A Song','Jose Gonzalez'))?.uri,track.uri);assert.equal(await spotify.resolve('A Song','Jose'),null);assert.equal(await spotify.resolve('Song','Jose Gonzalez'),null);});

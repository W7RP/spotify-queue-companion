import test from 'node:test';import assert from 'node:assert/strict';
import {songKey,spread,tasteSeeds,uniqueMusic} from '../extension/src/music';
const track=(n:number,title='Song '+n,artist='Artist')=>({id:String(n).padStart(22,'0'),uri:'spotify:track:'+String(n).padStart(22,'0'),title,artist,source:'recent'});
test('reissued album editions are familiar songs while live and remix recordings stay distinct',()=>{
  const seed=track(1,'A Song','José González');
  for(const title of ['A Song - 2011 Remaster','A Song (Remastered 2011)','A Song [Stereo Version]'])assert.equal(songKey({...seed,title,artist:'Jose Gonzalez'}),songKey(seed));
  for(const title of ['A Song - Live','A Song (Acoustic)','A Song - Remix'])assert.notEqual(songKey({...seed,title}),songKey(seed));
  assert.equal(uniqueMusic([seed,seed,{...seed,uri:track(2).uri,title:'A Song - 2011 Remaster'},track(3)]).length,2);
});
test('references and artist searches cover the history instead of only its newest cluster',()=>{
  const recent=Array.from({length:36},(_,i)=>track(i,'Song '+i,'Artist '+i));const seeds=tasteSeeds(recent);
  assert.equal(seeds.length,12);assert.equal(seeds[0].artist,'Artist 0');assert.equal(seeds.at(-1)?.artist,'Artist 35');
  const searches=spread(seeds.map(t=>t.artist),4);assert.equal(searches.length,4);assert.equal(searches[0],'Artist 0');assert.equal(searches.at(-1),'Artist 35');
});
test('bounded taste references cover artists before repeating an artist',()=>{
  const recent=[track(1),track(2),track(3),track(4,'Other','Other Artist'),track(5,'Third','Third Artist')];
  assert.deepEqual(tasteSeeds(recent,3).map(t=>t.id),[1,4,5].map(n=>track(n).id));
  assert.equal(tasteSeeds(Array.from({length:50},(_,i)=>track(i))).length,12);
});

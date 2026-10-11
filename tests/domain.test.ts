import test from 'node:test';import assert from 'node:assert/strict';
import {balancedMix,parseIntent,playlistMatches,validateSelection,inserted,type Track,type QueueSnapshot} from '../extension/src/domain';
const t=(n:number,source='a'):Track=>({id:String(n).padStart(22,'0'),uri:'spotify:track:'+String(n).padStart(22,'0'),title:'Song '+n,artist:'Artist',source});
test('intent defaults, word counts, cap, explicit replace and add more',()=>{assert.equal(parseIntent('something mellow').count,15);assert.equal(parseIntent('add another ten songs like these',15,50,'replace').mode,'append');assert.equal(parseIntent('add another ten songs').count,10);assert.equal(parseIntent('start over with 999 songs').count,50);assert.equal(parseIntent('replace my queue').mode,'replace');assert.equal(parseIntent('Add 3 mellow songs for working').count,3);assert.equal(parseIntent('Only six jazz tracks from my liked songs').count,6);assert.equal(parseIntent('Add one mellow song').count,1);assert.equal(parseIntent('Mix my "3 mellow songs" playlist').count,15);});
test('playlist mixing remains balanced and does not duplicate overlap',()=>{assert.deepEqual(balancedMix([[t(1),t(2),t(3)],[t(1),t(4),t(5)],[t(6),t(7)]],6).map(x=>x.id),[1,4,6,2,5,7].map(x=>String(x).padStart(22,'0')));});
test('ambiguous names are retained, exact names outrank partial matches',()=>{const lists=[{uri:'a',name:'Road Trip'},{uri:'b',name:'road trip'},{uri:'c',name:'Road Trip 2'}];assert.equal(playlistMatches('Road Trip',lists).length,2);assert.equal(playlistMatches('Road',lists).length,3);});
test('source constraints and accidental duplicates fail closed',()=>{assert.throws(()=>validateSelection([t(2)],new Set([t(1).uri]),15),/source/);assert.throws(()=>validateSelection([t(1),t(1)],null,15),/duplicates/);assert.equal(validateSelection([t(1),t(1)],null,15,true).length,2);assert.throws(()=>parseIntent('only these playlists'),/playlist names/);assert.throws(()=>parseIntent('only from my chill playlist'),/playlist names/);});
test('unlisted genres still require classification; simple named mashups do not',()=>{assert.equal(parseIntent('Add 3 blues songs only from my liked songs').filtered,true);assert.equal(parseIntent('Mix my Road Trip, Summer and Indie playlists').filtered,false);assert.equal(parseIntent('Mix 3 songs from my "THE NEW DYNASTY FALL/WINTER 2026", "jim" and "divorced father" playlists').filtered,false);});
test('append confirmation requires fresh identities and ordered multiplicity',()=>{const before:QueueSnapshot={revision:'r',current:t(9).uri,account:'a',local:true,entries:[{uri:t(1).uri,uid:'old',manual:true,raw:null}]};const after={...before,revision:'s',entries:[...before.entries,{uri:t(1).uri,uid:'new1',manual:true,raw:null},{uri:t(1).uri,uid:'new2',manual:true,raw:null}]};assert.equal(inserted(before,after,[t(1).uri,t(1).uri]),true);assert.equal(inserted(before,before,[t(1).uri]),false);assert.equal(inserted(before,{...after,local:false},[t(1).uri]),false);});

test('history discovery and direct replay are distinct intents',()=>{
  for(const prompt of ['more music just like my recently played tracks','recommend songs based on my listening history','new music similar to my recent plays']){const intent=parseIntent(prompt);assert.equal(intent.history,false);assert.equal(intent.inspiration,'recent');assert.equal(intent.more,false);}
  assert.equal(parseIntent('discover songs like my most played tracks').inspiration,'history');
  for(const prompt of ['Play my recently played tracks','My most played songs recently','Replay songs from my listening history','Only from recently played tracks']){const intent=parseIntent(prompt);assert.equal(intent.history,true);assert.equal(intent.inspiration,null);}
  assert.equal(parseIntent('Mix my "Recently Played" playlist').history,false);
});

test('negated repetition never enables intentional duplicates',()=>{
  for(const prompt of ['rock without duplicates','rock, no repeats','do not repeat songs','avoid any duplicates','do not include duplicates'])assert.equal(parseIntent(prompt).repeat,false);
  assert.equal(parseIntent('repeat these songs twice').repeat,true);assert.equal(parseIntent('allow duplicates').repeat,true);
  assert.equal(parseIntent('more music like these').more,true);
});


test('playlist similarity uses references, including fresh more-music requests and links',()=>{
  for(const prompt of ['songs similar to the ones in my "Road" playlist, but branch out a bit','more music just like my "Road" playlist','recommend songs based on my "Road" playlist','songs from my "Road" playlist, but branch out a bit']){
    const intent=parseIntent(prompt);assert.deepEqual(intent.referencePlaylistNames,['Road']);assert.deepEqual(intent.playlistNames,[]);assert.equal(intent.more,false);
  }
  const linked=parseIntent('songs like https://open.spotify.com/playlist/0000000000000000000001?si=test');
  assert.deepEqual(linked.referencePlaylistUris,['spotify:playlist:0000000000000000000001']);assert.deepEqual(linked.playlistUris,[]);
});
test('direct playlist requests and explicit only remain source restrictions',()=>{
  for(const prompt of ['songs from my "Road" playlist','songs only from my "Road" playlist','similar rock songs, but only from my "Road" playlist','songs like my "Road" playlist, but only from it','songs from "Road" playlist only','only from "Road", but branch out a bit']){
    const intent=parseIntent(prompt);assert.deepEqual(intent.playlistNames,['Road'],prompt);assert.deepEqual(intent.referencePlaylistNames,[],prompt);
  }
  assert.deepEqual(parseIntent('songs from spotify:playlist:0000000000000000000001').playlistUris,['spotify:playlist:0000000000000000000001']);
  assert.equal(parseIntent('more songs from "Road" playlist').more,false);
});
test('playlist references and restricted sources can coexist in either order',()=>{
  for(const prompt of ['songs like "Road", only from "Summer" playlist','songs like "Road", only "Summer" playlist','songs only from "Summer" playlist, similar to "Road"']){
    const intent=parseIntent(prompt);assert.deepEqual(intent.referencePlaylistNames,['Road']);assert.deepEqual(intent.playlistNames,['Summer']);
  }
  const liked=parseIntent('only from my liked songs, similar to "Road" playlist');assert.equal(liked.liked,true);assert.deepEqual(liked.playlistNames,[]);assert.deepEqual(liked.referencePlaylistNames,['Road']);
  assert.deepEqual(parseIntent('songs like "Road" and "Summer" playlists').referencePlaylistNames,['Road','Summer']);
});
test('playlist title words cannot turn a mix into discovery',()=>{
  const intent=parseIntent('Mix my "Songs Like Summer" and "Branch Out" playlists');assert.deepEqual(intent.playlistNames,['Songs Like Summer','Branch Out']);assert.deepEqual(intent.referencePlaylistNames,[]);
});


test('similarity with a few playlist originals creates a bounded blend',()=>{
 const i=parseIntent('songs similar to my "Road" playlist, but include a few songs from the playlist too',25);
 assert.equal(i.count,25);assert.equal(i.playlistCount,3);assert.deepEqual(i.referencePlaylistNames,['Road']);assert.deepEqual(i.includedPlaylistNames,['Road']);assert.deepEqual(i.playlistNames,[]);
 const named=parseIntent('songs like "Road", including a few songs from "Road" too',25);assert.deepEqual(named.playlistNames,[]);assert.deepEqual(named.includedPlaylistNames,['Road']);assert.equal(named.playlistCount,3);
 const link=parseIntent('songs like spotify:playlist:0000000000000000000001, include two original songs too',10);assert.equal(link.playlistCount,2);assert.deepEqual(link.includedPlaylistUris,['spotify:playlist:0000000000000000000001']);
});
test('explicit playlist portions do not replace the total or dropdown count',()=>{
 const i=parseIntent('songs like "Road", but include four songs from it',25);assert.equal(i.count,25);assert.equal(i.playlistCount,4);
 const total=parseIntent('10 songs similar to "Road", including 4 songs from that playlist',25);assert.equal(total.count,10);assert.equal(total.playlistCount,4);
 const couple=parseIntent('songs like "Road", mix in a couple songs from the playlist',15);assert.equal(couple.playlistCount,2);
 assert.throws(()=>parseIntent('songs like "Road", include a few songs from it',1),/at least two/);
 assert.throws(()=>parseIntent('5 songs like "Road", include six songs from it'),/smaller than the total/);
});
test('blends can name a different included playlist while keeping a separate source restriction',()=>{
 const i=parseIntent('songs like "Road", include three songs from "Summer", only from "Liked Mix"',25);
 assert.deepEqual(i.referencePlaylistNames,['Road']);assert.deepEqual(i.includedPlaylistNames,['Summer']);assert.deepEqual(i.playlistNames,['Liked Mix']);assert.equal(i.playlistCount,3);
 const multiple=parseIntent('songs like "Road", include three songs from "Summer" and "Winter"',25);assert.deepEqual(multiple.includedPlaylistNames,['Summer','Winter']);assert.deepEqual(multiple.playlistNames,[]);
});
test('negated inclusion and playlist title words never enable a blend',()=>{
 for(const prompt of ['songs like "Road", do not include a few songs from it','songs like "Road", without including three songs from it','songs like "Road", never include songs from the playlist'])assert.equal(parseIntent(prompt,25).playlistCount,0);
 assert.equal(parseIntent('songs similar to "Include Three Original Songs" playlist',25).playlistCount,0);
 assert.equal(parseIntent('include 3 songs from "Road" playlist').count,3);assert.equal(parseIntent('include 3 songs from "Road" playlist').playlistCount,0);
});

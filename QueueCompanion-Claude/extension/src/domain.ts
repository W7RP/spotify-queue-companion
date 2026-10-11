export type Mode = 'append'|'replace';
export interface Track {id:string;uri:string;title:string;artist:string;source:string;artistNames?:string[]}
export interface Intent {prompt:string;count:number;mode:Mode;liked:boolean;history:boolean;more:boolean;repeat:boolean;playlistNames:string[];playlistUris:string[];filtered:boolean}
export interface Playlist {uri:string;name:string;owner?:string}
export function parseIntent(prompt:string, length=15, cap=50, preference:Mode='append'):Intent {
  const text=prompt.trim(); if(!text||text.length>1000) throw Error('Use a request between 1 and 1,000 characters.');
  const words:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,hundred:100};
  // Counts may precede a few mood/genre words. Playlist titles and links are data,
  // so a number inside them must not become the requested queue length.
  const countText=text.replace(/[“"][^”"]+[”"]/g,'').replace(/(?:spotify:playlist:|https:\/\/open\.spotify\.com\/playlist\/)[A-Za-z0-9]{22}[^\s]*/g,'');
  const number=countText.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred)\s+(?:(?!songs?\b|tracks?\b)[\p{L}-]+\s+){0,4}(?:songs?|tracks?)\b/iu)?.[1]?.toLowerCase();
  const count=Math.max(1,Math.min(cap,number?(words[number]??Number(number)):length));
  const more=/\b(add (?:another|more)|more songs|like these)\b/i.test(text);
  const replace=/\b(replace (?:the |my )?queue|start over|make a new queue)\b/i.test(text);
  const liked=/\b(liked songs|my likes|favorites|favourites)\b/i.test(text);
  const history=/\b(most played|top tracks|listening history|recently played)\b/i.test(text);
  const playlistUris=[...text.matchAll(/(?:spotify:playlist:|https:\/\/open\.spotify\.com\/playlist\/)([A-Za-z0-9]{22})/g)].map(m=>'spotify:playlist:'+m[1]);
  const quoted=[...text.matchAll(/[“"]([^”"]+)[”"]/g)].map(m=>m[1]);
  const mash=text.match(/(?:mix|mashup|combine)\s+(?:my\s+)?(.+?)\s+playlists?\b/i)?.[1];
  const playlistNames=quoted.length?quoted:(mash?mash.split(/\s*,\s*|\s+and\s+|\s*&\s*/).map(s=>s.trim()).filter(Boolean):[]);
  // Unsupported source restrictions fail closed; no silent catalogue fallback.
  if (/\bplaylist(?:s)?\b|\bmy library\b/i.test(text)&&!liked&&!playlistNames.length&&!playlistUris.length) throw Error('Put playlist names in quotes, mix named playlists, or paste their Spotify links.');
  let remaining=text;for(const name of playlistNames)remaining=remaining.replace(name,'');remaining=remaining.replace(/(?:spotify:playlist:|https:\/\/open\.spotify\.com\/playlist\/)[A-Za-z0-9]{22}[^\s]*/g,'');
  remaining=remaining.replace(/\b(mix|mashup|combine|add|another|more|songs?|tracks?|only|from|my|these|the|and|playlists?|liked|likes|favorites|favourites|please|repeat|duplicates|twice|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred)\b|\d+|[^\p{L}\p{N}\s]/giu,' ').trim();
  return {prompt:text,count,mode:replace?'replace':more?'append':preference,liked,history,more,repeat:/\b(repeat|duplicates|twice)\b/i.test(text),playlistNames,playlistUris,filtered:remaining.length>0};
}
export function playlistMatches(name:string, playlists:Playlist[]):Playlist[] {
  const normalize=(s:string)=>s.normalize('NFKC').trim().toLocaleLowerCase(); const target=normalize(name);
  const exact=playlists.filter(p=>normalize(p.name)===target); return exact.length?exact:playlists.filter(p=>normalize(p.name).includes(target));
}
export function balancedMix(groups:Track[][], count:number, repeat=false):Track[] {
  const out:Track[]=[]; const seen=new Set<string>(); const positions=groups.map(()=>0);
  while(out.length<count) {let progressed=false; for(let i=0;i<groups.length&&out.length<count;i++) {let t:Track|undefined; while(positions[i]<groups[i].length){const c=groups[i][positions[i]++]; if(repeat||!seen.has(c.uri)){t=c;break;}} if(t){out.push(t);seen.add(t.uri);progressed=true;}}if(!progressed)break;} return out;
}
export function validateSelection(tracks:Track[], sources:Set<string>|null, count:number, repeat=false):Track[] {
  if(!tracks.length)throw Error('No matching playable songs were found. Try a broader request.');
  if(tracks.length>count)throw Error('Selection exceeded the requested count.');
  if(tracks.some(t=>!/^spotify:track:[A-Za-z0-9]{22}$/.test(t.uri)))throw Error('Selection contains an invalid track.');
  if(sources&&tracks.some(t=>!sources.has(t.uri)))throw Error('Selection left the requested source. Nothing was queued.');
  if(!repeat&&new Set(tracks.map(t=>t.uri)).size!==tracks.length)throw Error('Selection contains accidental duplicates.');
  return tracks;
}
export interface QueueEntry {uri:string;uid:string;manual:boolean;raw:unknown}
export interface QueueSnapshot {revision:string;current:string;entries:QueueEntry[];account:string;local:boolean}
export function sameQueue(a:QueueSnapshot,b:QueueSnapshot):boolean {
 return a.account===b.account&&a.local&&b.local&&a.current===b.current&&a.revision===b.revision&&JSON.stringify(a.entries.map(e=>[e.uid,e.uri,e.manual]))===JSON.stringify(b.entries.map(e=>[e.uid,e.uri,e.manual]));
}
export function inserted(before:QueueSnapshot, after:QueueSnapshot, uris:string[]):boolean {
  if(before.account!==after.account||!after.local)return false;
  const old=new Set(before.entries.map(e=>e.uid));
  const fresh=after.entries.filter(e=>e.manual&&e.uid&&!old.has(e.uid));
  const wanted=uris.slice(); let at=0; for(const e of fresh)if(e.uri===wanted[at])at++;
  return at===wanted.length;
}

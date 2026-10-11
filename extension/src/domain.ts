export type Mode = 'append'|'replace';
export interface Track {id:string;uri:string;title:string;artist:string;source:string;artistNames?:string[]}
export interface Intent {prompt:string;count:number;mode:Mode;liked:boolean;history:boolean;inspiration:'recent'|'history'|null;more:boolean;repeat:boolean;playlistNames:string[];playlistUris:string[];referencePlaylistNames:string[];referencePlaylistUris:string[];includedPlaylistNames:string[];includedPlaylistUris:string[];playlistCount:number;filtered:boolean}
export interface Playlist {uri:string;name:string;owner?:string}
export function parseIntent(prompt:string, length=15, cap=50, preference:Mode='append'):Intent {
  const text=prompt.trim(); if(!text||text.length>1000) throw Error('Use a request between 1 and 1,000 characters.');
  const words:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,hundred:100};
  // Counts may precede a few mood/genre words. Playlist titles and links are data,
  // so a number inside them must not become the requested queue length.
  const countText=text.replace(/[“"][^”"]+[”"]/g,'').replace(/(?:spotify:playlist:|https:\/\/open\.spotify\.com\/playlist\/)[A-Za-z0-9]{22}[^\s]*/g,'');
  const inclusionPattern=/\b(?:include|including|mix in|add in|throw in|keep)\s+(?:(a few|a couple|few|couple|some|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\s+)?(?:of\s+)?(?:the\s+|its\s+)?(?:(original)\s+)?(?:songs?|tracks?)\s*(?:(?:from|off|of)\b|(?=too\b|as well\b|[,.!?]|$))/gi;
  const positiveInclusions=(value:string)=>[...value.matchAll(inclusionPattern)].filter(m=>!/(?:\b(?:do not|don't|never|not|without)\s+)$/i.test(value.slice(0,m.index)));
  const hasSimilarity=/\b(?:like|similar|based on|inspired by|in the style of|branch out)\b/i.test(countText);
  const inclusions=hasSimilarity?positiveInclusions(countText):[];
  // An included-playlist count is a portion of the requested total, not the total.
  const totalText=inclusions.reduceRight((s,m)=>s.slice(0,m.index)+s.slice(m.index!+m[0].length),countText);
  const number=totalText.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred)\s+(?:(?!songs?\b|tracks?\b)[\p{L}-]+\s+){0,4}(?:songs?|tracks?)\b/iu)?.[1]?.toLowerCase();
  const count=Math.max(1,Math.min(cap,number?(words[number]??Number(number)):length));
  const semantic=countText;
  const followup=/\b(add (?:another|more)|more (?:music|songs|tracks)|like (?:these|this))\b/i.test(semantic);
  const replace=/\b(replace (?:the |my )?queue|start over|make a new queue)\b/i.test(semantic);
  const liked=/\b(liked songs|my likes|favorites|favourites)\b/i.test(semantic);
  const mentionsHistory=/\b(most played|top tracks|listening history|recently played|recent (?:plays|tracks|songs))\b/i.test(semantic);
  const discover=mentionsHistory&&/\b(like|similar|based on|inspired by|discover|recommend|suggest|new|different)\b/i.test(semantic)&&!/\b(?:replay|play again)\b|\bonly\s+(?:(?:songs?|tracks?)\s+)?from\s+(?:my\s+)?(?:recently played|recent (?:plays|tracks|songs)|listening history|most played|top tracks)\b/i.test(semantic);
  const inspiration=discover?(/\b(most played|top tracks)\b/i.test(semantic)?'history':'recent'):null;
  const history=mentionsHistory&&!discover;
  const playlistUris:string[]=[],playlistNames:string[]=[],referencePlaylistUris:string[]=[],referencePlaylistNames:string[]=[],includedPlaylistUris:string[]=[],includedPlaylistNames:string[]=[];
  // A named playlist can constrain the answer or describe the user's taste.
  // Classify each mention, allowing "like X, only from Y" in the same request.
  const mentions=[...text.matchAll(/[“"]([^”"]+)[”"]|(?:spotify:playlist:|https:\/\/open\.spotify\.com\/playlist\/)([A-Za-z0-9]{22})/g)];
  const similarity=/\b(?:like|similar|based on|inspired by|in the style of|branch out)\b/gi;
  let reference=false,includedRole=false,previousEnd=0;
  for(const mention of mentions){
    const prefix=text.slice(previousEnd,mention.index);
    const similar=[...prefix.matchAll(similarity)].at(-1)?.index??-1;
    const strict=[...prefix.matchAll(/\b(?:only|exclusively|strictly)\b/gi)].at(-1)?.index??-1;
    const included=positiveInclusions(prefix).at(-1);
    const includeAt=included?.index??-1;
    if(strict>similar&&strict>includeAt){reference=false;includedRole=false;}
    else if(similar>=0&&similar>includeAt){reference=true;includedRole=false;}
    else if(included&&hasSimilarity){reference=false;includedRole=true;}
    else if(/\b(?:from|within|mix|mashup|combine)\b/i.test(prefix)){reference=false;includedRole=false;}
    if(mentions.length===1){
      const suffix=text.slice(mention.index!+mention[0].length);
      if(/\bbranch out\b/i.test(suffix)&&strict<0)reference=true;
      if(/\bonly\s+from\s+(?:it|that|this)|\b(?:playlist\s+only|only\s+(?:that|this)\s+playlist)\b/i.test(suffix))reference=false;
    }
    if(includedRole){
      if(mention[1])includedPlaylistNames.push(mention[1]);else includedPlaylistUris.push('spotify:playlist:'+mention[2]);
    }else if(mention[1])(reference?referencePlaylistNames:playlistNames).push(mention[1]);
    else (reference?referencePlaylistUris:playlistUris).push('spotify:playlist:'+mention[2]);
    previousEnd=mention.index!+mention[0].length;
  }
  const mash=text.match(/(?:mix|mashup|combine)\s+(?:my\s+)?(.+?)\s+playlists?\b/i)?.[1];
  if(!mentions.length&&mash)playlistNames.push(...mash.split(/\s*,\s*|\s+and\s+|\s*&\s*/).map(s=>s.trim()).filter(Boolean));
  if(inclusions.length&&!referencePlaylistNames.length&&!referencePlaylistUris.length){referencePlaylistNames.push(...includedPlaylistNames);referencePlaylistUris.push(...includedPlaylistUris);}
  let playlistCount=0;
  if(inclusions.length&&(referencePlaylistNames.length||referencePlaylistUris.length)){
    const amount=inclusions.at(-1)![1]?.toLowerCase();
    playlistCount=amount&&words[amount]!==undefined?words[amount]:amount&&/^\d+$/.test(amount)?Number(amount):/couple/.test(amount??'')?2:Math.min(3,Math.max(1,Math.round(count/5)));
    if(playlistCount&&count<2)throw Error('Choose at least two songs to mix playlist songs with discoveries.');
    if(playlistCount>=count)throw Error('The playlist portion must be smaller than the total song count.');
    if(!includedPlaylistNames.length&&!includedPlaylistUris.length){includedPlaylistNames.push(...referencePlaylistNames);includedPlaylistUris.push(...referencePlaylistUris);}
  }
  const more=followup&&!mentionsHistory&&!mentions.length&&!playlistNames.length;
  // Unsupported source restrictions fail closed; no silent catalogue fallback.
  if (/\bplaylist(?:s)?\b|\bmy library\b/i.test(text)&&!liked&&!mentions.length&&!playlistNames.length) throw Error('Put playlist names in quotes, mix named playlists, or paste their Spotify links.');
  let remaining=text;for(const name of [...playlistNames,...referencePlaylistNames,...includedPlaylistNames])remaining=remaining.replace(name,'');remaining=remaining.replace(/(?:spotify:playlist:|https:\/\/open\.spotify\.com\/playlist\/)[A-Za-z0-9]{22}[^\s]*/g,'');
  remaining=remaining.replace(/\b(mix|mashup|combine|add|another|more|songs?|tracks?|only|from|my|these|the|and|playlists?|liked|likes|favorites|favourites|please|repeat|duplicates|twice|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred)\b|\d+|[^\p{L}\p{N}\s]/giu,' ').trim();
  const repeat=!/\b(no|without|avoid|skip|exclude)\s+(?:any\s+)?(?:repeats?|duplicates?)\b|\b(?:do not|don't|never)\s+(?:(?:allow|include|add|use)\s+)?(?:repeat|duplicates)\b/i.test(semantic)&&/\b(repeat|allow duplicates|include duplicates|twice)\b/i.test(semantic);
  return {prompt:text,count,mode:replace?'replace':followup?'append':preference,liked,history,inspiration,more,repeat,playlistNames,playlistUris,referencePlaylistNames,referencePlaylistUris,includedPlaylistNames,includedPlaylistUris,playlistCount,filtered:remaining.length>0};
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

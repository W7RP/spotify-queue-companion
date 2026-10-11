import type {Track} from './domain';

const clean=(value:string)=>value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]/gu,'');
export const primaryArtist=(track:Track)=>track.artistNames?.[0]??track.artist;
export function spread<T>(items:T[],limit:number):T[] {
  if(items.length<=limit)return items.slice();if(limit===1)return items.slice(0,1);
  return Array.from({length:limit},(_,i)=>items[Math.round(i*(items.length-1)/(limit-1))]);
}
export function songKeys(track:{title:string;artist:string;artistNames?:string[]}):string[] {
  // Album reissues should not turn a familiar song into a discovery. Keep live,
  // acoustic and remix titles distinct; only strip explicit mastering suffixes.
  const title=track.title.replace(/\s*(?:-\s*|\(|\[)(?:\d{4}\s+)?(?:remaster(?:ed)?(?:\s+\d{4})?|mono(?: version)?|stereo(?: version)?)\s*[)\]]?$/i,'');
  // Release credits may reorder performers or add a soundtrack artist.
  // Matching the same title through any shared performer catches those editions.
  return [...new Set((track.artistNames?.length?track.artistNames:[track.artist]).map(artist=>clean(title)+'|'+clean(artist)))];
}
export const songKey=(track:{title:string;artist:string;artistNames?:string[]})=>songKeys(track)[0];
export function uniqueMusic(tracks:Track[],limit=200):Track[] {
  const uris=new Set<string>(),songs=new Set<string>();const out:Track[]=[];
  for(const track of tracks){const keys=songKeys(track);if(uris.has(track.uri)||keys.some(key=>songs.has(key)))continue;uris.add(track.uri);for(const key of keys)songs.add(key);out.push(track);if(out.length===limit)break;}
  return out;
}
export function tasteSeeds(tracks:Track[],limit=12):Track[] {
  const groups=new Map<string,Track[]>();for(const track of uniqueMusic(tracks)){const artist=clean(primaryArtist(track));const group=groups.get(artist)??[];group.push(track);groups.set(artist,group);}
  const representative=spread([...groups.values()],limit);
  const out:Track[]=[];
  for(let row=0;out.length<limit;row++){let found=false;for(const group of representative){if(group[row]){out.push(group[row]);found=true;if(out.length===limit)break;}}if(!found)break;}
  return out;
}

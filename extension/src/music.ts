import type {Track} from './domain';

const clean=(value:string)=>value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]/gu,'');
export const primaryArtist=(track:Track)=>track.artistNames?.[0]??track.artist;
export function songKey(track:{title:string;artist:string;artistNames?:string[]}):string {
  // Album reissues should not turn a familiar song into a discovery. Keep live,
  // acoustic and remix titles distinct; only strip explicit mastering suffixes.
  const title=track.title.replace(/\s*(?:-\s*|\(|\[)(?:\d{4}\s+)?(?:remaster(?:ed)?(?:\s+\d{4})?|mono(?: version)?|stereo(?: version)?)\s*[)\]]?$/i,'');
  return clean(title)+'|'+clean(track.artistNames?.[0]??track.artist);
}
export function uniqueMusic(tracks:Track[],limit=200):Track[] {
  const uris=new Set<string>(),songs=new Set<string>();const out:Track[]=[];
  for(const track of tracks){const key=songKey(track);if(uris.has(track.uri)||songs.has(key))continue;uris.add(track.uri);songs.add(key);out.push(track);if(out.length===limit)break;}
  return out;
}
export function tasteSeeds(tracks:Track[],limit=12):Track[] {
  const groups=new Map<string,Track[]>();for(const track of uniqueMusic(tracks)){const artist=clean(primaryArtist(track));const group=groups.get(artist)??[];group.push(track);groups.set(artist,group);}
  const out:Track[]=[];
  for(let row=0;out.length<limit;row++){let found=false;for(const group of groups.values()){if(group[row]){out.push(group[row]);found=true;if(out.length===limit)break;}}if(!found)break;}
  return out;
}

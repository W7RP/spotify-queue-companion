// Canonical curation logic. App copies are generated, never edited directly.
import selectionPolicy from './policy.json';
type ArtistTrack = { artist: string; artistNames?: string[]; title?: string };
export type MusicBrief = { kind:'similarity'|'artist-only'|'discovery'; referenceArtists:string[]; excludedArtists:string[]; genre:string; mood:string; era:string; discovery:'balanced'|'deep-cuts'|'new-artists'|'familiar'; referenceCount:number; excludedVersions:string[]; referenceType?:'artist'|'collective'|'none'; collectiveMembers?:string[] };
const words = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const artistKey = (track: ArtistTrack) => words(track.artistNames?.[0] ?? track.artist);

export function validateMusicBrief(value: unknown, prompt: string, count: number): MusicBrief {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('The music brief could not be read. Nothing was queued.');
  let b=value as MusicBrief;
  const names=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=6&&v.every(s=>typeof s==='string'&&!!s.trim()&&s.length<=120&&!/[\u0000-\u001f]/.test(s));
  if(!['similarity','artist-only','discovery'].includes(b.kind)||!names(b.referenceArtists)||!names(b.excludedArtists)||!['balanced','deep-cuts','new-artists','familiar'].includes(b.discovery)||!Number.isInteger(b.referenceCount)||b.referenceCount< -1||b.referenceCount>count||!Array.isArray(b.excludedVersions)||b.excludedVersions.length>4||b.excludedVersions.some(v=>!['live','acoustic','remix','cover'].includes(v))||[b.genre,b.mood,b.era].some(s=>typeof s!=='string'||s.length>200||/[\u0000-\u001f]/.test(s)))throw Error('The music brief exceeded selection limits. Nothing was queued.');
  const text=' '+words(prompt)+' ';
  const knownCollectives=selectionPolicy.collectives.filter(group=>b.referenceArtists.some(name=>words(name)===words(group.name)));
  const collective=b.referenceType==='collective'||knownCollectives.length>0;
  const members=knownCollectives.length?knownCollectives.flatMap(group=>[...group.members]):b.collectiveMembers??[];
  if(b.referenceType!=null&&!['artist','collective','none'].includes(b.referenceType)||b.collectiveMembers!=null&&(!Array.isArray(b.collectiveMembers)||b.collectiveMembers.length>12||b.collectiveMembers.some(s=>typeof s!=='string'||!s.trim()||s.length>120||/[\u0000-\u001f]/.test(s)))||collective&&(!b.referenceArtists.length||!members.length)||!collective&&(b.collectiveMembers?.length??0)>0)throw Error('The music brief exceeded selection limits. Nothing was queued.');
  // A genre/mood brief has no artist to restrict. Repair this contradictory
  // classification without dropping songs or introducing an artist constraint.
  if(b.kind==='artist-only'&&!b.referenceArtists.length)b={...b,kind:'discovery',referenceCount:-1};
  if([...b.referenceArtists,...b.excludedArtists].some(a=>!text.includes(' '+words(a)+' ')))throw Error('The music brief introduced an artist restriction that was not requested. Nothing was queued.');
  if(b.kind==='artist-only'&&(!b.referenceArtists.length||!b.referenceArtists.some(a=>{
    const name=words(a);return text.trim()===name||['only ','only songs by ','only music by ','only tracks by ','exclusively ','exclusively by ','songs by ','music by ','tracks by ','songs from ','music from ','tracks from ','nothing but '].some(prefix=>text.includes(' '+prefix+name+' '));
  })))throw Error('The music brief changed an inspiration into an artist-only request. Nothing was queued.');
  if(b.excludedArtists.length&&!/\b(?:no|not|without|avoid|exclude|excluding|except|none)\b/.test(words(prompt)))throw Error('The music brief invented an artist exclusion. Nothing was queued.');
  return {kind:b.kind,referenceArtists:[...new Set(b.referenceArtists.map(a=>a.trim()))],excludedArtists:[...new Set(b.excludedArtists.map(a=>a.trim()))],genre:b.genre,mood:b.mood,era:b.era,discovery:b.discovery,referenceCount:b.referenceCount,excludedVersions:[...new Set(b.excludedVersions)],...(collective?{referenceType:'collective' as const,collectiveMembers:[...new Set(members)]}:b.referenceType!=null?{referenceType:b.referenceType,collectiveMembers:[]}:{})};
}

const referenceNames=(music:MusicBrief)=>music.referenceType==='collective'?[...music.referenceArtists,...(music.collectiveMembers??[])]:music.referenceArtists;

export function selectionBrief(prompt: string, count: number, modelBrief?: unknown) {
  const music=modelBrief==null?null:validateMusicBrief(modelBrief,prompt,count);
  const text = words(prompt);
  const similarity = /\b(?:like|similar to|similar music to|inspired by|in the style of|sounds like)\b/.test(text);
  const referenceText = text.split(/\b(?:similar to|similar music to|inspired by|in the style of|sounds like|like)\b/).slice(1).map(part => part.split(/\b(?:but|without|except|excluding|only|include|including)\b/)[0].trim()).filter(Boolean);
  // Explicit artist allocations belong to the user's request, not our default.
  const narrow = text.match(/\b(?:only|exclusively|nothing but|all by)\s+(?:(?:songs?|tracks?|music)\s+)?(?:(?:by|from)\s+)?(.+)/)?.[1];
  const artistOnly = !!narrow && (/^(?:them|that band|that artist)\b/.test(narrow) || referenceText.some(part => (' ' + narrow + ' ').includes(' ' + part + ' ')));
  const allocation = artistOnly || /\b(?:mostly|mainly|more (?:of|from)|half|percent|equal|evenly|\d+\s+(?:songs?|tracks?)\s+(?:by|from)|include|including|mix in)\b/.test(text) || /\d\s*%/.test(prompt);
  const explicitCount=music&&music.referenceCount>=0?music.referenceCount:null;
  return { similarity:music?music.kind==='similarity':similarity, balance:music?music.kind==='similarity'&&explicitCount===null:similarity&&!allocation, referenceText:music?referenceNames(music).map(words):referenceText, count, music, explicitCount,
    referenceLimit:explicitCount??Math.min(count - 1, Math.max(1, Math.floor(count / selectionPolicy.defaults.artistShareDivisor))), artistLimit:Math.max(selectionPolicy.defaults.minimumOtherArtistSongs,Math.ceil(count/selectionPolicy.defaults.artistShareDivisor)) };
}

export function isReferenceArtist(track: ArtistTrack, brief: ReturnType<typeof selectionBrief>) {
  return (track.artistNames?.length ? track.artistNames : [track.artist]).some(name => {
    const key = words(name);
    return !!key && (brief.music?brief.referenceText.includes(key):brief.referenceText.some(part => (' ' + part + ' ').includes(' ' + key + ' ')));
  });
}

export function curateArtists<T extends ArtistTrack>(tracks: T[], brief: ReturnType<typeof selectionBrief>, restricted = false): T[] {
  if (restricted) return tracks.slice(0, brief.count);
  const references: T[] = [], others: T[] = [], totals = new Map<string, number>();
  for (const track of tracks) {
    if(!allowedByBrief(track,brief))continue;
    const reference = isReferenceArtist(track, brief), key = artistKey(track);
    if ((reference&&(brief.balance||brief.explicitCount!==null)&&references.length>=brief.referenceLimit)||(!reference&&brief.balance&&(totals.get(key)??0)>=brief.artistLimit)) continue;
    totals.set(key, (totals.get(key) ?? 0) + 1);
    (reference ? references : others).push(track);
  }
  // Do not claim discovery if the provider returned only the named artist.
  if (brief.balance && !others.length) return [];
  // Interleave the familiar portion across the entire selection, starting outside it.
  const referenceCount = brief.balance ? Math.min(references.length, brief.count - 1) : Math.min(references.length, brief.explicitCount??brief.count);
  const familiar = references.slice(0, referenceCount);
  const remaining = others.slice();
  const ordered: T[] = []; let previous = '';
  while (ordered.length < brief.count - (brief.explicitCount??familiar.length) && remaining.length) {
    let index = remaining.findIndex(track => artistKey(track) !== previous);
    if (index < 0) index = 0;
    const [track] = remaining.splice(index, 1); ordered.push(track); previous = artistKey(track);
  }
  // If explicit allocation leaves only the reference artist, retain those choices.
  if (!ordered.length) {
    if(brief.music?.referenceType!=='collective')return familiar.slice(0,brief.count);
    const pool=familiar.slice(), result:T[]=[];let previous='';
    while(pool.length&&result.length<brief.count){let index=pool.findIndex(track=>artistKey(track)!==previous);if(index<0)index=0;const [track]=pool.splice(index,1);result.push(track);previous=artistKey(track);}
    return result;
  }
  const result: T[] = []; let at = 0;
  for (let i = 0; i < ordered.length; i++) {
    result.push(ordered[i]);
    while (at < familiar.length && Math.floor((i + 1) * familiar.length / ordered.length) > at) result.push(familiar[at++]);
  }
  return result.slice(0, brief.count);
}

export function allowedByBrief(track: ArtistTrack, brief: ReturnType<typeof selectionBrief>) {
  const artists=(track.artistNames?.length?track.artistNames:[track.artist]).map(words),music=brief.music;
  if(!music)return true;
  if(music.excludedArtists.some(a=>artists.includes(words(a))))return false;
  if(music.kind==='artist-only'&&!referenceNames(music).some(a=>artists.includes(words(a))))return false;
  const rawTitle=track.title??'';
  return !music.excludedVersions.some(v=>v==='live'?/(?:[-–—(\[]\s*[^)\]]*\blive\b)|\blive (?:at|from|in|version|recording)\b/i.test(rawTitle):new RegExp('[-–—(\\[]\\s*[^)\\]]*\\b'+v+'\\b','i').test(rawTitle));
}

export function canRefill(selected:number,target:number,started:number,eligible=true) {
  return eligible&&selected<target&&Date.now()-started<selectionPolicy.refill.deadlineMs;
}


export function fastModel<T extends { id: string }>(models: T[], provider: 'chatgpt' | 'claude', selected?: string): string | undefined {
  const explicit = models.find(model => model.id === selected);
  if (explicit) return explicit.id;
  const family = selectionPolicy.models[provider].preferredFamily;
  const offered = models.filter(model => model.id.toLowerCase().includes(family));
  // Numeric comparison avoids depending on API catalogue ordering (5-5 > 4-5).
  offered.sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }));
  return offered[0]?.id ?? models.find(model => selectionPolicy.models[provider].fallbackFamilies.some(family => model.id.includes(family)))?.id ?? models[0]?.id;
}

export function claudeRequestOptions(model: string, structured=false, schema?: object) {
  return selectionPolicy.models.claude.lowEffortModels.some(id => id === model) ? { output_config: { effort: selectionPolicy.models.effort, ...(structured&&schema?{format:{type:'json_schema',schema}}:{}) } } : {};
}

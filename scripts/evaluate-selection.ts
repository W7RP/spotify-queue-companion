// Score model-generated proposals without Spotify data or playback writes.
// Run: cd extension && npm run eval:selection -- /absolute/path/results.json
import {readFileSync} from 'node:fs';
import {curateArtists,selectionBrief} from '../extension/src/curation';
const input=process.argv[2];if(!input)throw Error('Pass a JSON array of {provider,model,prompt,count,songs,generationMs} results.');
const cases=JSON.parse(readFileSync(new URL('../evals/music-selection.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const rows=JSON.parse(readFileSync(input,'utf8').replace(/^\uFEFF/,''));
const key=(s:string)=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
for(const row of rows) {
  const spec=cases.find((item:any)=>item.prompt===row.prompt), count=row.count??spec?.count??15;
  if(!Array.isArray(row.songs)||row.songs.length>100||row.songs.some((song:any)=>typeof song?.title!=='string'||typeof song?.artist!=='string'))throw Error('Invalid proposal result.');
  const seen=new Set<string>(), proposals=row.songs.filter((song:any)=>{const id=key(song.title)+'|'+key(song.artist);if(seen.has(id))return false;seen.add(id);return true;});
  let selected:typeof proposals=[];
  for(let end=5;selected.length<count&&end<proposals.length+5;end+=5)selected=curateArtists(proposals.slice(0,end),selectionBrief(row.prompt,count));
  const reference=(song:any)=>(spec?.references??[]).some((artist:string)=>key(artist)===key(song.artist));
  const artistCounts=new Map<string,number>();for(const song of selected)artistCounts.set(key(song.artist),(artistCounts.get(key(song.artist))??0)+1);
  const violations:string[]=[];
  if(selected.length<count)violations.push('short selection');
  if(spec?.kind==='similarity') {
    if(selected[0]&&reference(selected[0]))violations.push('reference artist opens');
    if(selected.filter(reference).length>Math.min(count-1,Math.max(1,Math.floor(count/5))))violations.push('reference quota exceeded');
  }
  if(spec?.kind==='artist-only'&&selected.some(song=>!spec.allowed.some((artist:string)=>key(artist)===key(song.artist))))violations.push('outside artist-only restriction');
  if(spec?.kind==='exclude'&&selected.some(song=>spec.excluded.some((artist:string)=>key(artist)===key(song.artist))))violations.push('excluded artist present');
  if(spec?.kind==='allocation'&&selected.filter(reference).length!==spec.referenceCount)violations.push('explicit artist allocation missed');
  console.log(JSON.stringify({provider:row.provider,model:row.model,prompt:row.prompt,generationMs:row.generationMs,proposed:row.songs.length,selected:selected.length,artists:artistCounts.size,referenceSongs:selected.filter(reference).length,adjacentArtistPairs:selected.slice(1).filter((song,i)=>key(song.artist)===key(selected[i].artist)).length,violations,humanReviewRequired:true,catalogMatchesVerified:false}));
}

import {balancedMix,parseIntent,playlistMatches,validateSelection,type Playlist,type Track,type Intent,type Mode} from './domain';
import {Spotify} from './spotify';import {Helper} from './ipc';import {QueueWriter} from './queue';
import {shortfallReason,type SelectionDiagnostics} from './selection';
import {primaryArtist,songKey,spread,tasteSeeds,uniqueMusic} from './music';
export interface Preferences {length:number;cap:number;mode:Mode;model?:string;history:boolean;provider?:'claude'|'chatgpt';claudeModel?:string}
export class Pipeline {
  private generation?:AbortController;private mutation=false;private previous:Track[]=[];private previousReferences:Track[]=[];private previousAccount='';private previousSources:{liked:boolean;playlists:string[]}={liked:false,playlists:[]};
  constructor(private spotify:Spotify,private helper:Helper,private writer:QueueWriter,private choose:(name:string,options:Playlist[],signal:AbortSignal)=>Promise<Playlist>,private activity:(text:string,writing?:boolean)=>void){}
  async run(prompt:string,settings:Preferences) {
    if(this.mutation)throw Error('Finishing the current queue change. Please wait.');
    this.generation?.abort();const abort=new AbortController();this.generation=abort;const signal=abort.signal;
    const check=()=>{if(signal.aborted)throw new DOMException('Cancelled','AbortError');};
    const intent=parseIntent(prompt,settings.length,settings.cap,settings.mode);const start=performance.now();this.activity('Selecting songs…');
    const initial=await this.spotify.snapshot();if(!initial.local)throw Error('Choose this computer in Spotify’s device menu before queueing.');
    const account=initial.account;if(this.previousAccount!==account){this.previous=[];this.previousReferences=[];this.previousSources={liked:false,playlists:[]};this.previousAccount=account;}
    if(intent.more&&!this.previous.length)throw Error('Make a selection first, then ask for more like it.');
    if(intent.more&&!intent.liked&&!intent.playlistNames.length&&!intent.playlistUris.length){intent.liked=this.previousSources.liked;intent.playlistUris=this.previousSources.playlists.slice();}
    const usedSources:{liked:boolean;playlists:string[]}={liked:intent.liked,playlists:[]};let tracks:Track[]=[];let coverage='';let generationMs=0,retrievalMs=0,resolutionMs=0;let sourceSet:Set<string>|null=null;
    const selection:SelectionDiagnostics={kind:intent.history?'history':'discovery',candidates:0,proposed:0,unmatched:0,duplicates:0,previous:0,invalid:0,truncated:0};
    let references:Track[]=[],seeds:Track[]=[];
    if(intent.inspiration){
      this.activity('Reading your listening references…');
      if(intent.inspiration==='history'){
        const result=await this.helper.request('history',{account,count:50,days:30},signal);
        references=result.tracks.map((t:any)=>({id:t.uri.split(':')[2],uri:t.uri,title:t.title,artist:t.artist,source:'observed history'}));
        coverage=result.coverage+' · Used as taste references; the selected songs are different.';
      }else {references=await this.spotify.recent();coverage='Inspired by Spotify’s available recent plays; seed songs are excluded.';}
      check();if(await this.spotify.account()!==account)throw Error('Spotify account changed while reading your listening references.');
      references=uniqueMusic(references);seeds=tasteSeeds(references);
      if(!seeds.length)throw Error('No listening references are available yet. Play a few songs or describe a genre or mood.');
    }
    const sourcePlaylists:Playlist[]=[],referencePlaylists:Playlist[]=[];const playlistTracks=new Map<string,Track[]>();
    if(intent.playlistNames.length||intent.playlistUris.length||intent.referencePlaylistNames.length||intent.referencePlaylistUris.length){
      this.activity('Reading your playlists…');
      const playlists=await this.spotify.playlists();
      const resolve=async(names:string[],uris:string[],target:Playlist[])=>{
        for(const name of names){check();const matches=playlistMatches(name,playlists);if(!matches.length)throw Error(`No playlist named “${name}” was found.`);target.push(matches.length===1?matches[0]:await this.choose(name,matches,signal));}
        for(const uri of uris)target.push(playlists.find(p=>p.uri===uri)??{uri,name:uri});
      };
      await resolve(intent.playlistNames,intent.playlistUris,sourcePlaylists);
      await resolve(intent.referencePlaylistNames,intent.referencePlaylistUris,referencePlaylists);
      const resolved=[...new Map([...sourcePlaylists,...referencePlaylists].map(p=>[p.uri,p])).values()];
      if(resolved.length>6)throw Error('Use up to six playlists per request.');
      for(const p of resolved){check();playlistTracks.set(p.uri,await this.spotify.playlist(p.uri,200));}
      check();if(await this.spotify.account()!==account)throw Error('Spotify account changed while reading your playlists.');
      usedSources.playlists=[...new Set(sourcePlaylists.map(p=>p.uri))];
      if(referencePlaylists.length){
        const groups=referencePlaylists.map(p=>playlistTracks.get(p.uri)!);
        if(groups.some(g=>!g.length))throw Error('A reference playlist has no available playable songs. Choose another playlist or describe a genre or mood.');
        // Exclude every retrieved reference song, not just the compact seed sample.
        seeds=tasteSeeds([...seeds,...balancedMix(groups,200)]);
        references=uniqueMusic([...references,...groups.flat()],1400);
        coverage+=(coverage?' · ':'')+'Inspired by the available playlist songs; reference songs are excluded.';
      }
    }
    if(intent.more){seeds=tasteSeeds(this.previous);references=uniqueMusic([...references,...this.previousReferences],1400);}
    const excludedUris=new Set<string>(),excludedSongs=new Set<string>();
    if(!intent.repeat&&!intent.history){
      const previous=intent.more||!intent.liked&&!intent.playlistNames.length&&!intent.playlistUris.length?this.previous:[];
      for(const t of [...references,...previous]){excludedUris.add(t.uri);excludedSongs.add(songKey(t));}
      excludedUris.add(initial.current);if(intent.mode==='append')for(const entry of initial.entries)excludedUris.add(entry.uri);
    }
    const excluded=(track:Track)=>excludedUris.has(track.uri)||excludedSongs.has(songKey(track));
    if(intent.history) {
      if(/most played|top tracks/i.test(prompt)){
        const result=await this.helper.request('history',{account,count:intent.count,days:30},signal);coverage=result.coverage;
        if(!result.tracks.length)throw Error('No local listening counts yet. Meaningful plays will be counted from now on; Spotify does not provide complete past counts here.');
        tracks=result.tracks.map((t:any)=>({id:t.uri.split(':')[2],uri:t.uri,title:t.title,artist:t.artist,source:'observed history'}));
      }else{const recent=await this.spotify.recent();tracks=(intent.repeat?recent:uniqueMusic(recent)).slice(0,intent.count);coverage='Spotify’s available recent songs; no play counts or complete historical coverage.';}
      if(!intent.repeat)tracks=uniqueMusic(tracks,intent.count);
      if(intent.liked||sourcePlaylists.length||referencePlaylists.length)throw Error('Combine history with a library restriction in a separate request for now.');
    } else {
      let candidates:Track[]=[];let groups:Track[][]=[];
      const likedTracks=intent.liked?await this.spotify.liked(200):[];
      if(intent.liked&&!intent.playlistNames.length&&!intent.playlistUris.length)groups.push(likedTracks);
      if(sourcePlaylists.length) {
        const likedSet=new Set(likedTracks.map(t=>t.uri));
        for(const p of [...new Map(sourcePlaylists.map(p=>[p.uri,p])).values()]){const songs=playlistTracks.get(p.uri)!;groups.push(intent.liked?songs.filter(t=>likedSet.has(t.uri)):songs);}
      }
      if(!intent.repeat)groups=groups.map(g=>g.filter(t=>!excluded(t)));
      if(groups.length){candidates=intent.repeat?balancedMix(groups,200):uniqueMusic(balancedMix(groups,200));sourceSet=new Set(candidates.map(t=>t.uri));selection.kind='sources';}
      else if(seeds.length||intent.more&&this.previous.length){
        const references=seeds.length?seeds:tasteSeeds(this.previous);
        const artists=spread([...new Set(references.map(primaryArtist))],4);
        const perArtist=Math.max(20,Math.ceil(intent.count*2/artists.length));
        this.activity('Searching for similar music…');
        const found=await Promise.all(artists.map(artist=>this.spotify.search(artist,perArtist)));check();
        candidates=uniqueMusic(balancedMix(found,200).filter(t=>!excluded(t)));
      }
      else {
        const term=prompt.replace(/\b(something|songs?|tracks?|for|working|listening|add|another|start over|please|my|only)\b/gi,' ').replace(/\d+/g,' ').trim();
        candidates=await this.spotify.search(term||'mellow',Math.max(40,intent.count*2));
      }
      if(!intent.repeat)candidates=uniqueMusic(candidates.filter(t=>!excluded(t)));
      check();
      selection.candidates=candidates.length;
      retrievalMs=Math.round(performance.now()-start);
      if(groups.length&&!intent.filtered) {
        // A simple mashup is deterministic and evenly interleaved; no inference needed.
        tracks=intent.repeat?balancedMix(groups,intent.count,true):uniqueMusic(balancedMix(groups,200),intent.count);
      } else {
        const compact=candidates.map((t,i)=>({...t,id:'c'+i}));
        const reserve=sourceSet?0:Math.min(25,Math.ceil(intent.count/2));
        this.activity('Choosing matching songs…');
        const response=await this.helper.request('generate',{prompt:intent.prompt,count:intent.count,reserve,candidates:compact,restricted:!!sourceSet,previous:intent.more?this.previous.slice(-10).map(t=>({title:t.title,artist:t.artist})):[],seeds:seeds.map(t=>({title:t.title,artist:primaryArtist(t)}))},signal);generationMs=response.generationMs;
        const resolvingAt=performance.now();
        const suggestions=response.suggestions??[];selection.proposed=response.ids.length+suggestions.length;
        selection.invalid=response.rejectedSuggestions??0;selection.truncated=response.extraChoices??0;
        if(selection.proposed>intent.count+reserve)throw Error('Selection exceeded the bounded selection limit.');
        if(sourceSet&&suggestions.length)throw Error('Selection left the requested source. Nothing was queued.');
        const proposed:Track[]=response.ids.map((id:string)=>{const index=compact.findIndex(c=>c.id===id);if(index<0)throw Error('Invalid model track selection.');return candidates[index];});
        // Validate all model IDs, including unused reserves, before taking the queue target.
        if(proposed.length)validateSelection(proposed,sourceSet,intent.count+reserve,true);
        const acceptedUris=new Set<string>(),acceptedSongs=new Set<string>();
        const accept=(t:Track|null)=>{
          if(!t){selection.unmatched++;return;}
          const key=songKey(t);
          if(!intent.repeat&&(acceptedUris.has(t.uri)||acceptedSongs.has(key))){selection.duplicates++;return;}
          if(!intent.repeat&&excluded(t)){selection.previous++;return;}
          if(tracks.length<intent.count){tracks.push(t);acceptedUris.add(t.uri);acceptedSongs.add(key);}
        };
        for(const t of proposed){if(tracks.length===intent.count)break;accept(t);}
        const suggestedKeys=new Set<string>();const pending:any[]=[];
        for(const song of suggestions){const key=songKey(song);if(!intent.repeat&&(suggestedKeys.has(key)||acceptedSongs.has(key))){selection.duplicates++;continue;}if(!intent.repeat&&excludedSongs.has(key)){selection.previous++;continue;}suggestedKeys.add(key);pending.push(song);}
        for(let i=0;i<pending.length&&tracks.length<intent.count;i+=10){
          check();const resolved=await Promise.all(pending.slice(i,i+10).map(song=>this.spotify.resolve(song.title,song.artist)));check();
          for(const t of resolved){if(tracks.length===intent.count)break;accept(t);}
        }
        if(groups.length>1){const selected=new Set(tracks.map(t=>t.uri));const mixed=balancedMix(groups.map(g=>g.filter(t=>selected.has(t.uri))),200,intent.repeat);tracks=intent.repeat?mixed.slice(0,intent.count):uniqueMusic(mixed,intent.count);}
        resolutionMs=Math.round(performance.now()-resolvingAt);
      }
    }
    if(seeds.length&&!sourceSet){
      const artists=new Map<string,Track[]>();for(const track of tracks){const artist=primaryArtist(track);const group=artists.get(artist)??[];group.push(track);artists.set(artist,group);}
      tracks=balancedMix([...artists.values()],intent.count,intent.repeat);
    }
    check();validateSelection(tracks,sourceSet,intent.count,intent.repeat);
    if(intent.history)retrievalMs=Math.round(performance.now()-start);
    const validatingAt=performance.now();
    this.activity('Checking songs…');tracks=await this.spotify.validate(tracks);check();
    if(await this.spotify.account()!==account)throw Error('Spotify account changed during selection. Try again.');
    // Source membership is re-read immediately before commit to honor playlist changes during generation.
    if(sourceSet){let fresh=new Set<string>();const playlists=[...new Set(tracks.map(t=>t.source).filter(s=>s.startsWith('spotify:playlist:')))];for(const source of playlists){for(const t of await this.spotify.playlist(source,200))fresh.add(t.uri);}if(intent.liked){const likes=new Set((await this.spotify.liked(200)).map(t=>t.uri));fresh=playlists.length?new Set([...fresh].filter(uri=>likes.has(uri))):likes;}validateSelection(tracks,fresh,intent.count,intent.repeat);}
    const validationMs=Math.round(performance.now()-validatingAt);
    check();this.mutation=true;this.activity('Updating Spotify’s queue…',true);
    try{const result=await this.writer.commit(tracks,intent.mode,initial);this.previous=tracks;this.previousReferences=sourceSet?[]:references;this.previousSources=usedSources;return {...result,requested:intent.count,generationMs,totalMs:Math.round(performance.now()-start),timings:{retrievalMs,resolutionMs,validationMs},coverage,mode:intent.mode,selection,shortfall:shortfallReason(result.count,intent.count,selection)};}
    finally{this.mutation=false;if(this.generation===abort)this.generation=undefined;}
  }
  cancel(){if(!this.mutation)this.generation?.abort();}
}

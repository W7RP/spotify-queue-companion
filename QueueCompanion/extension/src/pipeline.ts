import {balancedMix,parseIntent,playlistMatches,validateSelection,type Playlist,type Track,type Intent,type Mode} from './domain';
import {Spotify} from './spotify';import {Helper} from './ipc';import {QueueWriter} from './queue';
export interface Preferences {length:number;cap:number;mode:Mode;model?:string;history:boolean}
export class Pipeline {
  private generation?:AbortController;private mutation=false;private previous:Track[]=[];private previousAccount='';private previousSources:{liked:boolean;playlists:string[]}={liked:false,playlists:[]};
  constructor(private spotify:Spotify,private helper:Helper,private writer:QueueWriter,private choose:(name:string,options:Playlist[],signal:AbortSignal)=>Promise<Playlist>,private activity:(text:string,writing?:boolean)=>void){}
  async run(prompt:string,settings:Preferences) {
    if(this.mutation)throw Error('Finishing the current queue change. Please wait.');
    this.generation?.abort();const abort=new AbortController();this.generation=abort;const signal=abort.signal;
    const check=()=>{if(signal.aborted)throw new DOMException('Cancelled','AbortError');};
    const intent=parseIntent(prompt,settings.length,settings.cap,settings.mode);const start=performance.now();this.activity('Selecting songs…');
    const initial=await this.spotify.snapshot();if(!initial.local)throw Error('Choose this computer in Spotify’s device menu before queueing.');
    const account=initial.account;if(this.previousAccount!==account){this.previous=[];this.previousSources={liked:false,playlists:[]};this.previousAccount=account;}
    if(intent.more&&!this.previous.length)throw Error('Make a selection first, then ask for more like it.');
    if(intent.more&&!intent.liked&&!intent.playlistNames.length&&!intent.playlistUris.length){intent.liked=this.previousSources.liked;intent.playlistUris=this.previousSources.playlists.slice();}
    const usedSources:{liked:boolean;playlists:string[]}={liked:intent.liked,playlists:[]};let tracks:Track[]=[];let coverage='';let generationMs=0;let sourceSet:Set<string>|null=null;
    if(intent.history) {
      if(/most played|top tracks/i.test(prompt)){
        const result=await this.helper.request('history',{account,count:intent.count,days:30},signal);coverage=result.coverage;
        if(!result.tracks.length)throw Error('No local listening counts yet. Meaningful plays will be counted from now on; Spotify does not provide complete past counts here.');
        tracks=result.tracks.map((t:any)=>({id:t.uri.split(':')[2],uri:t.uri,title:t.title,artist:t.artist,source:'observed history'}));
      }else{tracks=(await this.spotify.recent()).slice(0,intent.count);coverage='Spotify’s available recent songs; no play counts or complete historical coverage.';}
      if(intent.liked||intent.playlistNames.length||intent.playlistUris.length)throw Error('Combine history with a library restriction in a separate request for now.');
    } else {
      let candidates:Track[]=[];let groups:Track[][]=[];
      const likedTracks=intent.liked?await this.spotify.liked(200):[];
      if(intent.liked&&!intent.playlistNames.length&&!intent.playlistUris.length)groups.push(likedTracks);
      if(intent.playlistNames.length||intent.playlistUris.length) {
        const playlists=await this.spotify.playlists();const resolved:Playlist[]=[];
        for(const name of intent.playlistNames){check();const matches=playlistMatches(name,playlists);if(!matches.length)throw Error(`No playlist named “${name}” was found.`);resolved.push(matches.length===1?matches[0]:await this.choose(name,matches,signal));}
        for(const uri of intent.playlistUris)resolved.push(playlists.find(p=>p.uri===uri)??{uri,name:uri});
        if(resolved.length>6)throw Error('Mix up to six playlists per request.');
        usedSources.playlists=[...new Set(resolved.map(p=>p.uri))];
        const likedSet=new Set(likedTracks.map(t=>t.uri));
        for(const p of [...new Map(resolved.map(p=>[p.uri,p])).values()]){check();const songs=await this.spotify.playlist(p.uri,200);groups.push(intent.liked?songs.filter(t=>likedSet.has(t.uri)):songs);}
      }
      if(intent.more&&!intent.repeat)groups=groups.map(g=>g.filter(t=>!this.previous.some(p=>p.uri===t.uri)));
      if(groups.length){candidates=balancedMix(groups,200);sourceSet=new Set(candidates.map(t=>t.uri));}
      else if(intent.more&&this.previous.length){const found=await Promise.all([...new Set(this.previous.slice(0,3).map(t=>t.artist))].map(artist=>this.spotify.search(artist,20)));candidates=[...new Map(found.flat().map(t=>[t.uri,t])).values()].filter(t=>!this.previous.some(p=>p.uri===t.uri)).slice(0,60);}
      else {
        const term=prompt.replace(/\b(something|songs?|tracks?|for|working|listening|add|another|start over|please|my|only)\b/gi,' ').replace(/\d+/g,' ').trim();
        candidates=await this.spotify.search(term||'mellow',40);
      }
      check();
      if(groups.length&&!intent.filtered) {
        // A simple mashup is deterministic and evenly interleaved; no inference needed.
        tracks=balancedMix(groups,intent.count,intent.repeat);
      } else {
        const compact=candidates.map((t,i)=>({...t,id:'c'+i}));
        const response=await this.helper.request('generate',{prompt:intent.prompt,count:intent.count,candidates:compact,restricted:!!sourceSet,previous:intent.more?this.previous.slice(-10).map(t=>({title:t.title,artist:t.artist})):[]},signal);generationMs=response.generationMs;
        tracks=response.ids.map((id:string)=>{const index=compact.findIndex(c=>c.id===id);if(index<0)throw Error('Invalid model track selection.');return candidates[index];});
        const suggestions=response.suggestions??[];for(let i=0;i<suggestions.length;i+=5){check();const resolved=await Promise.all(suggestions.slice(i,i+5).map((song:any)=>this.spotify.resolve(song.title,song.artist)));for(const t of resolved){if(t&&!tracks.some(x=>x.uri===t.uri)&&(!intent.more||intent.repeat||!this.previous.some(p=>p.uri===t.uri)))tracks.push(t);}}
        if(groups.length>1){const selected=new Set(tracks.map(t=>t.uri));tracks=balancedMix(groups.map(g=>g.filter(t=>selected.has(t.uri))),intent.count,intent.repeat);}
      }
    }
    check();validateSelection(tracks,sourceSet,intent.count,intent.repeat);
    this.activity('Checking songs…');tracks=await this.spotify.validate(tracks);check();
    if(await this.spotify.account()!==account)throw Error('Spotify account changed during selection. Try again.');
    // Source membership is re-read immediately before commit to honor playlist changes during generation.
    if(sourceSet){let fresh=new Set<string>();const playlists=[...new Set(tracks.map(t=>t.source).filter(s=>s.startsWith('spotify:playlist:')))];for(const source of playlists){for(const t of await this.spotify.playlist(source,200))fresh.add(t.uri);}if(intent.liked){const likes=new Set((await this.spotify.liked(200)).map(t=>t.uri));fresh=playlists.length?new Set([...fresh].filter(uri=>likes.has(uri))):likes;}validateSelection(tracks,fresh,intent.count,intent.repeat);}
    check();this.mutation=true;this.activity('Updating Spotify’s queue…',true);
    try{const result=await this.writer.commit(tracks,intent.mode,initial);this.previous=tracks;this.previousSources=usedSources;return {...result,requested:intent.count,generationMs,totalMs:Math.round(performance.now()-start),coverage,mode:intent.mode};}
    finally{this.mutation=false;if(this.generation===abort)this.generation=undefined;}
  }
  cancel(){if(!this.mutation)this.generation?.abort();}
}

import {type Track,type Playlist,type QueueSnapshot} from './domain';
import type {QueueAdapter} from './queue';
import {Helper} from './ipc';
declare global {var Spicetify:any;}
const TRACK=/^spotify:track:[A-Za-z0-9]{22}$/;
// Spotifly PathfinderOperations.swift, commit 8b22d236e060121c122d9b7f8dbf791ef949066c.
// Validated through this client's authenticated GraphQL wrapper; no public Web API or developer app.
const SEARCH={name:'searchTracks',operation:'query',sha256Hash:'b02683192a98dde7966b5e6655a79eeb62713eab703eda9902c932818dd52751',value:null};
export function normalize(raw:any,source='catalogue'):Track|null {
  const item=raw?.item?.data??raw?.data??raw?.track??raw;
  if(!TRACK.test(item?.uri??''))return null;
  if(item.isPlayable===false||item.playability?.playable===false||item.isLocal||item.isBanned)return null;
  const artists=Array.isArray(item.artists)?item.artists:(item.artists?.items??[]);
  const title=item.name??item.title??item.metadata?.title;
  const artist=artists.map((a:any)=>a.name??a.profile?.name).filter(Boolean).join(', ')||(item.artist??item.metadata?.artist_name);
  if(typeof title!=='string'||typeof artist!=='string')return null;
  return {id:item.uri.split(':')[2],uri:item.uri,title:title.slice(0,200),artist:artist.slice(0,200),source,artistNames:artists.map((a:any)=>a.name??a.profile?.name).filter((s:any)=>typeof s==='string').map((s:string)=>s.slice(0,200))};
}
export class Spotify implements QueueAdapter {
  constructor(private helper:Helper){}
  async account():Promise<string> {const u=await Spicetify.Platform.UserAPI.getUser();if(!u.username)throw Error('Spotify sign-in is unavailable.');return u.username;}
  async snapshot():Promise<QueueSnapshot> {
    const account=await this.account();const q=Spicetify.Queue;const device=Spicetify.Platform.ConnectAPI.getState().activeDevice;
    if(!q?.track?.contextTrack||!Array.isArray(q.nextTracks))throw Error('Start a song on this computer before adding to the queue.');
    return {account,local:device?.isLocal===true&&device?.isActive===true,revision:String(q.queueRevision),current:q.track.contextTrack.uri,entries:q.nextTracks.map((e:any)=>({uri:e.contextTrack.uri,uid:e.contextTrack.uid??'',manual:e.provider==='queue'&&e.contextTrack.metadata?.is_queued==='true',raw:{uri:e.contextTrack.uri,uid:e.contextTrack.uid}}))};
  }
  replaceSupported():boolean {
    // Semantics accepted against 1.3.4.258 only. A new client must be revalidated before destructive writes.
    return Spicetify.Platform.version==='1.3.4.258'&&typeof Spicetify.removeFromQueue==='function'&&typeof Spicetify.Player.origin?._queue?.removeFromQueue==='function';
  }
  async append(uris:string[]) {if(typeof Spicetify.Player.origin?._queue?.addToQueue!=='function')throw Error('Native queue integration is unavailable. Repair Spicetify.');await Spicetify.addToQueue(uris.map(uri=>({uri})));}
  async remove(before:QueueSnapshot) {
    const q=Spicetify.Queue;
    if(String(q.queueRevision)!==before.revision||q.track.contextTrack.uri!==before.current||Spicetify.Platform.ConnectAPI.getState().activeDevice?.isLocal!==true)throw Error('The queue changed immediately before replacement. Nothing was removed.');
    const manual=before.entries.filter(e=>e.manual);if(manual.some(e=>!e.uid))throw Error('Queue entry identity is unavailable. Replacement stopped.');
    const all=Spicetify.Player.origin._queue.getQueue().queued;
    if(Array.isArray(all)&&all.length!==manual.length)throw Error('The full manual queue is not visible. Replacement stopped.');
    await Spicetify.removeFromQueue(manual.map(e=>({uri:e.uri,uid:e.uid})));
    for(let i=0;i<20;i++){if(!Spicetify.Queue.nextTracks.some((e:any)=>manual.some(m=>m.uid===e.contextTrack.uid)))return;await new Promise(r=>setTimeout(r,100));}
    throw Error('Native queue removal could not be confirmed.');
  }
  private async cached<T>(key:string,ttl:number,load:()=>Promise<T>,fresh=false):Promise<T> {
    const account=await this.account();if(!fresh){const item=await this.helper.request<T|null>('cache.get',{account,key});if(item!=null)return item;}
    const data=await load();if(account!==await this.account())throw Error('Spotify account changed during retrieval.');await this.helper.request('cache.put',{account,key,ttl,value:data});return data;
  }
  async search(term:string,limit=30):Promise<Track[]> {
    if(!Number.isInteger(limit)||limit<1||limit>200)throw Error('Catalogue search exceeds the candidate limit.');
    return this.cached('search:v3:'+term+':'+limit,300,async()=>{
      const tracks=new Map<string,Track>();let offset=0;
      for(let pages=0;offset<limit&&pages<5;pages++){
        const pageLimit=Math.min(40,limit-offset);
        const result=await Spicetify.GraphQL.Request(SEARCH,{searchTerm:term,offset,limit:pageLimit,numberOfTopResults:Math.min(pageLimit,30),includeAudiobooks:true,includeAuthors:true,includePreReleases:false,includeArtistHasConcertsField:false,includeEpisodeContentRatingsV2:false});
        if(result.errors?.length)throw Error('Spotify catalogue search is unavailable on this build. Repair and retry.');
        const page=result.data?.searchV2?.tracksV2;const items=page?.items;if(!Array.isArray(items))throw Error('Spotify search returned an unsupported response.');
        for(const item of items){const track=normalize(item);if(track)tracks.set(track.uri,track);}
        if(!items.length||typeof page.totalCount==='number'&&offset+items.length>=page.totalCount)break;
        const next=page.pagingInfo?.nextOffset??offset+items.length;
        if(!Number.isInteger(next)||next<offset+items.length||items.length<pageLimit&&page.pagingInfo?.nextOffset==null)break;
        offset=next;
      }
      return [...tracks.values()].slice(0,limit);
    });
  }
  async resolve(title:string,artist:string):Promise<Track|null> {
    const found=await this.search(title+' '+artist,5);const clean=(s:string)=>s.normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]/gu,'');
    const sameArtist=(t:Track)=>clean(t.artist)===clean(artist)||(t.artistNames??t.artist.split(', ')).some(name=>clean(name)===clean(artist));
    // Multiple album editions of the same exact title/artist are resolved by Spotify's catalogue ranking.
    return found.find(t=>clean(t.title)===clean(title)&&sameArtist(t))??null;
  }
  async liked(limit=200):Promise<Track[]> {return this.pageTracks('liked',o=>Spicetify.Platform.LibraryAPI.getTracks(o),limit,'liked');}
  async playlist(uri:string,limit=200):Promise<Track[]> {return this.pageTracks('playlist:'+uri,o=>Spicetify.Platform.PlaylistAPI.getContents(uri,o),limit,uri);}
  private async pageTracks(key:string,loader:(options:any)=>Promise<any>,maximum:number,source:string):Promise<Track[]> {
    // Page live on every request: cached metadata is useful, but source membership must be fresh.
    const items:Track[]=[];let offset=0;let total=Infinity;const account=await this.account();
    while(offset<total&&offset<maximum){const page=await loader({offset,limit:Math.min(100,maximum-offset)});if(!Array.isArray(page.items))throw Error('Spotify library response changed. Repair Queue Companion.');
      total=page.totalLength??page.unfilteredTotalLength??page.items.length;for(const raw of page.items){const t=normalize(raw,source);if(t)items.push(t);}if(!page.items.length)break;offset+=page.items.length;}
    if(account!==await this.account())throw Error('Spotify account changed during library retrieval.');
    await this.helper.request('cache.put',{account,key,ttl:60,value:items});return items;
  }
  async playlists():Promise<Playlist[]> {
    const out:Playlist[]=[];const account=await this.account();
    // The tested root-list service returns the folder tree in one response and accepts no paging arguments.
    const result=await Spicetify.Platform.RootlistAPI.getContents();
    if(!Array.isArray(result.items))throw Error('Spotify playlist listing changed. Repair Queue Companion.');
    const walk=(items:any[])=>{for(const x of items){if(x.type==='playlist')out.push({uri:x.uri,name:x.name,owner:x.owner?.displayName});else if(x.type==='folder'&&Array.isArray(x.items))walk(x.items);}};
    walk(result.items);if(account!==await this.account())throw Error('Spotify account changed.');return [...new Map(out.map(p=>[p.uri,p])).values()];
  }
  async recent():Promise<Track[]> {const account=await this.account();const data=await Spicetify.Platform.PlayHistoryAPI.getContents();if(account!==await this.account())throw Error('Spotify account changed during history retrieval.');return (data.items??[]).slice(0,200).map((x:any)=>normalize(x,'recently played')).filter(Boolean);}
  async validate(tracks:Track[]):Promise<Track[]> {
    const validated:Track[]=[];for(let at=0;at<tracks.length;at+=10){const batch=await Promise.all(tracks.slice(at,at+10).map(async t=>{
      const response=await Spicetify.GraphQL.Request(Spicetify.GraphQL.Definitions.getTrack,{uri:t.uri});
      const raw=response.data?.trackUnion??response.data?.track;if(response.errors?.length||!raw||raw.__typename!=='Track'||raw.playability?.playable!==true)throw Error('A selected song is unavailable. Nothing was queued.');
      return t;
    }));validated.push(...batch);}return validated;
  }
  startHistory(onError?:(message:string)=>void):()=>void {
    let session=crypto.randomUUID(),uri='',position=0,at=performance.now(),listened=0,sent=false,account='';let checking=false;
    const tick=async()=>{const state=Spicetify.Platform.PlayerAPI.getState();const now=performance.now();const progress=Spicetify.Player.getProgress();const item=state.item;const local=Spicetify.Platform.ConnectAPI.getState().activeDevice?.isLocal===true;
      if(!item?.uri||!local){at=now;position=progress;return;}
      if(item.uri!==uri||progress<position-1000){uri=item.uri;session=crypto.randomUUID();listened=0;sent=false;position=progress;at=now;}
      const delta=progress-position;const elapsed=now-at;if(!state.isPaused&&!state.isBuffering&&delta>0&&delta<2000&&elapsed<2000)listened+=Math.min(delta,elapsed+100);
      position=progress;at=now;
      if(sent||checking||listened<Math.min(30_000,state.duration/2))return;checking=true;
      try{const current=await this.account();if(account&&account!==current){listened=0;session=crypto.randomUUID();sent=false;}else {await this.helper.request('observe',{account:current,duration:state.duration,listen:{uri,title:item.metadata.title,artist:item.metadata.artist_name,session,milliseconds:Math.round(listened),at:new Date().toISOString()}});sent=true;}account=current;}
      catch(e){onError?.(e instanceof Error?e.message:'History recording unavailable.');}finally{checking=false;}
    };
    const reset=()=>{at=performance.now();position=Spicetify.Player.getProgress();};
    Spicetify.Player.addEventListener('onprogress',tick);Spicetify.Player.addEventListener('onplaypause',reset);
    return()=>{Spicetify.Player.removeEventListener('onprogress',tick);Spicetify.Player.removeEventListener('onplaypause',reset);};
  }
}

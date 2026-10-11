import {inserted,sameQueue,validateSelection,type QueueSnapshot,type Track,type Mode} from './domain';
export interface QueueAdapter {snapshot():Promise<QueueSnapshot>;append(uris:string[]):Promise<void>;remove(snapshot:QueueSnapshot):Promise<void>;replaceSupported():boolean}
export class QueueWriter {
  private chain:Promise<unknown>=Promise.resolve(); private uncertain=false;
  constructor(private adapter:QueueAdapter,private journal:(x:unknown)=>void){}
  get blocked(){return this.uncertain;}
  acknowledge(){this.uncertain=false;}
  commit(tracks:Track[],mode:Mode,expected:QueueSnapshot):Promise<{count:number;insertionMs:number}> {
    const run=()=>this.mutate(tracks,mode,expected); const task=this.chain.then(run,run);this.chain=task.catch(()=>{});return task;
  }
  private async mutate(tracks:Track[],mode:Mode,expected:QueueSnapshot) {
    if(this.uncertain)throw Error('A previous write is uncertain. Inspect Spotify’s Queue, then restart Spotify to reconcile.');
    validateSelection(tracks,null,50,true);
    const before=await this.adapter.snapshot();
    if(before.account!==expected.account)throw Error('Spotify account changed. Submit your request again.');
    if(!before.local)throw Error('Playback moved to another device. Select this computer in Spotify before queueing.');
    if(mode==='replace'&&!sameQueue(expected,before))throw Error('The queue changed while selecting songs. Review it and retry.');
    if(mode==='replace'&&!this.adapter.replaceSupported())throw Error('Queue replacement is unavailable on this Spotify build. Use append.');
    const uris=tracks.map(t=>t.uri); const start=performance.now();
    this.journal({state:'writing',mode,before,uris,at:Date.now()});
    let writeError:unknown;
    try {
      if(mode==='replace'&&before.entries.some(e=>e.manual)) {
        // Exact identities only. Never clear nextTracks or change the playback context.
        await this.adapter.remove(before);
        const afterRemove=await this.adapter.snapshot();
        if(afterRemove.entries.some(e=>e.manual)||afterRemove.current!==before.current||afterRemove.account!==before.account||!afterRemove.local)throw Error('Queue removal was partial or playback changed. Replacement stopped.');
      }
      await this.adapter.append(uris);
    } catch(e){writeError=e;}
    // A resolved promise is not success. Reconcile actual native entries, even after a rejected write.
    for(let attempt=0;attempt<20;attempt++) {
      let after:QueueSnapshot; try{after=await this.adapter.snapshot();}catch{await new Promise(r=>setTimeout(r,150));continue;}
      if(inserted(before,after,uris)) {this.journal({state:'confirmed',mode,uris,revision:after.revision,at:Date.now()});return {count:uris.length,insertionMs:Math.round(performance.now()-start)};}
      await new Promise(r=>setTimeout(r,150));
    }
    this.uncertain=true; this.journal({state:'uncertain',mode,before,uris,at:Date.now()});
    throw Error('Queue write could not be confirmed. Some songs may have been added. Inspect Spotify’s Queue; do not repeat append.'+(writeError instanceof Error?' '+writeError.message:''));
  }
}

declare global {interface Window {__queueCompanionPairing?:{token:string;port:number;v:number};__queueCompanion?:{dispose:()=>void;[key:string]:unknown}}}
export class Helper {
  private socket?:WebSocket; private ready?:Promise<void>; private pending=new Map<string,{resolve:(x:any)=>void;reject:(e:Error)=>void;timer:number}>();
  private closed=false;
  async connect():Promise<void> {
    if(this.ready)return this.ready;
    const config=window.__queueCompanionPairing;if(!config)throw Error('Queue Companion needs repair. Open Queue Companion Setup from Start.');
    this.closed=false;
    this.ready=new Promise((resolve,reject)=>{
      const ws=new WebSocket(`ws://127.0.0.1:${config.port}/v1`); this.socket=ws;
      const deadline=window.setTimeout(()=>{ws.close();reject(Error('Local helper is unavailable. Open Queue Companion from Start.'));},5000);
      ws.onopen=()=>ws.send(JSON.stringify({v:1,type:'pair',token:config.token}));
      ws.onmessage=e=>{let m:any;try{m=JSON.parse(e.data);}catch{return;}if(m.v!==1)return;
        if(m.type==='paired'){clearTimeout(deadline);resolve();return;}
        const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.ok?p.resolve(m.data):p.reject(Error(m.error));
      };
      ws.onerror=()=>reject(Error('Cannot connect to the local helper. Open Queue Companion from Start.'));
      ws.onclose=()=>{clearTimeout(deadline);this.ready=undefined;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Helper disconnected. No queue write has been retried.'));}this.pending.clear();if(!this.closed)reject(Error('Local pairing failed. Repair Queue Companion from Start.'));};
    });
    return this.ready;
  }
  async request<T=any>(type:string,data:unknown={},signal?:AbortSignal):Promise<T> {
    await this.connect();if(signal?.aborted)throw new DOMException('Cancelled','AbortError');const id=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const abort=()=>{this.socket?.send(JSON.stringify({v:1,type:'cancel',id}));const p=this.pending.get(id);if(p){clearTimeout(p.timer);this.pending.delete(id);p.reject(new DOMException('Cancelled','AbortError'));}};
      const timer=window.setTimeout(()=>{this.pending.delete(id);signal?.removeEventListener('abort',abort);reject(Error('Helper timed out. Nothing was queued.'));},55_000);
      this.pending.set(id,{resolve:(x)=>{signal?.removeEventListener('abort',abort);resolve(x);},reject:(e)=>{signal?.removeEventListener('abort',abort);reject(e);},timer});
      signal?.addEventListener('abort',abort,{once:true});this.socket!.send(JSON.stringify({v:1,type,id,data}));
    });
  }
  dispose(){this.closed=true;this.socket?.close();this.ready=undefined;}
}

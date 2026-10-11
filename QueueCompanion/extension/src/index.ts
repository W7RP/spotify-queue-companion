import {Helper} from './ipc';import {Spotify} from './spotify';import {QueueWriter} from './queue';import {Pipeline,type Preferences} from './pipeline';import type {Playlist} from './domain';

window.__queueCompanion?.dispose();
const lifecycle=new AbortController();const helper=new Helper();const spotify=new Spotify(helper);
let preferences:Preferences={length:15,cap:50,mode:'append',history:true};
let host:HTMLElement|undefined,root:ShadowRoot|undefined,anchor:HTMLInputElement|undefined,resize:ResizeObserver|undefined;
let input:HTMLInputElement,feedback:HTMLElement,submit:HTMLButtonElement,popover:HTMLElement;
let feedbackTimer:number|undefined,authTimer:number|undefined,historyDispose:(()=>void)|undefined,epoch=0,disposing=false;
let lastPrompt='',lastSuccessPrompt='',lastSuccessAt=0,status:any;
const journalKey=()=>`queue-companion-write:${Spicetify.Platform.username}`;
const writer=new QueueWriter(spotify,x=>localStorage.setItem(journalKey(),JSON.stringify(x)));
function message(text:string,error=false,retry=false) {
  if(!feedback)return;clearTimeout(feedbackTimer);feedback.replaceChildren();feedback.append(document.createTextNode(text));feedback.dataset.error=String(error);
  if(retry&&!writer.blocked){const b=document.createElement('button');b.textContent='Retry';b.type='button';b.onclick=()=>void run(lastPrompt);feedback.append(b);}
  if(!error)feedbackTimer=window.setTimeout(()=>feedback.replaceChildren(),5000);
}
async function choose(name:string,choices:Playlist[],signal:AbortSignal):Promise<Playlist> {
  return new Promise((resolve,reject)=>{
    clearTimeout(feedbackTimer);
    feedback.replaceChildren();const title=document.createElement('span');title.textContent=`Choose “${name}”: `;feedback.append(title);
    const select=document.createElement('select');select.setAttribute('aria-label',`Choose playlist ${name}`);const placeholder=document.createElement('option');placeholder.textContent='Select playlist';placeholder.value='';select.append(placeholder);
    for(const p of choices){const option=document.createElement('option');option.value=p.uri;option.textContent=p.name+(p.owner?' — '+p.owner:'')+' · '+p.uri.slice(-6);select.append(option);}
    feedback.append(select);select.focus();
    const abort=()=>{feedback.replaceChildren();reject(new DOMException('Cancelled','AbortError'));};signal.addEventListener('abort',abort,{once:true});
    select.onchange=()=>{const p=choices.find(c=>c.uri===select.value);if(p){signal.removeEventListener('abort',abort);feedback.replaceChildren();resolve(p);input.focus();}};
  });
}
const pipeline=new Pipeline(spotify,helper,writer,choose,(text,writing)=>{if(writing)submit.disabled=true;message(text);});
async function refreshSettings() {const account=await spotify.account();status=await helper.request('status',{account});preferences=status.settings;return status;}
async function reconcile() {
  const raw=localStorage.getItem(journalKey());if(!raw)return;
  try{const j=JSON.parse(raw);if(j.state==='writing'||j.state==='uncertain'){
    await spotify.snapshot();
    message('A previous queue write was interrupted. Inspect Spotify’s Queue before submitting another request.',true);
    // Do not infer success from URI counts: intentional duplicates or user edits could have produced them.
    const b=document.createElement('button');b.textContent='I checked the Queue';b.onclick=()=>{localStorage.removeItem(journalKey());writer.acknowledge();submit.disabled=false;feedback.replaceChildren();input.focus();};feedback.append(b);submit.disabled=true;
  }}catch{message('The saved queue receipt could not be read. Inspect Spotify’s Queue, then repair Queue Companion.',true);submit.disabled=true;}
}
async function run(prompt:string) {
  if(submit.disabled) return;
  if(submit.dataset.busy==='true'&&prompt.trim()===lastPrompt.trim()||prompt.trim()===lastSuccessPrompt&&performance.now()-lastSuccessAt<1500)return;
  pipeline.cancel();const call=++epoch;lastPrompt=prompt;
  submit.dataset.busy='true';submit.textContent='…';submit.setAttribute('aria-label','Selecting songs');
  try {
    await refreshSettings();
    const result=await pipeline.run(prompt,preferences);if(call!==epoch)return;
    const amount=`${result.count}${result.count<result.requested?' of '+result.requested:''} ${result.count===1?'song':'songs'}`;
    message((result.mode==='replace'?'Updated your queue'+(result.count<result.requested?' · '+amount:'.'):'Added '+amount)+(result.coverage?' · '+result.coverage:''));
    window.__queueCompanion!.lastResult=result;
    lastSuccessPrompt=prompt.trim();lastSuccessAt=performance.now();
  }catch(e){if(call!==epoch||e instanceof DOMException&&e.name==='AbortError')return;message(e instanceof Error?e.message:'Selection failed. Try again.',true,true);}
  finally{if(call===epoch){submit.disabled=writer.blocked;submit.dataset.busy='false';submit.textContent='↵';submit.setAttribute('aria-label','Add songs');}}
}
function element<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string){const e=document.createElement(tag);if(text)e.textContent=text;return e;}
async function showSettings() {
  if(!popover.hidden){popover.hidden=true;clearTimeout(authTimer);input.focus();return;}
  popover.hidden=false;popover.replaceChildren(element('p','Connecting to helper…'));
  try {
    const s=await refreshSettings();if(popover.hidden)return;popover.replaceChildren();
    const title=element('strong','Queue Companion');popover.append(title);
    popover.append(element('p',s.auth.connected?`ChatGPT connected · ${s.auth.email}`:'Connect ChatGPT to select by mood. Eligible plans and quota apply.'));
    if(s.auth.error)popover.append(element('p',s.auth.error));
    const connect=element('button',s.auth.connected?'Reconnect ChatGPT':'Continue with ChatGPT');connect.type='button';connect.onclick=async()=>{try{await helper.request('connect',{});message('Finish ChatGPT sign-in in your browser.');let attempts=0;const check=async()=>{try{const s=await refreshSettings();if(!s.auth.pending){if(!popover.hidden){popover.hidden=true;await showSettings();}return;}if(++attempts<80&&!popover.hidden)authTimer=window.setTimeout(check,1500);}catch{}};authTimer=window.setTimeout(check,1500);}catch(e){message((e as Error).message,true);}};popover.append(connect);
    if(s.auth.connected){const disconnect=element('button','Disconnect');disconnect.type='button';disconnect.onclick=async()=>{try{await helper.request('disconnect');popover.hidden=true;await showSettings();}catch(e){message((e as Error).message,true);}};popover.append(disconnect);}
    const label=element('label','Default songs ');const length=element('input');length.type='number';length.min='1';length.max='50';length.value=String(preferences.length);label.append(length);popover.append(label);
    const capLabel=element('label','Maximum songs ');const cap=element('input');cap.type='number';cap.min='1';cap.max='50';cap.value=String(preferences.cap);capLabel.append(cap);popover.append(capLabel);
    const modeLabel=element('label','Queue preference ');const mode=element('select');for(const value of ['append','replace']){const option=element('option',value==='append'?'Append':'Replace manually queued songs');option.value=value;option.disabled=value==='replace'&&!spotify.replaceSupported();mode.append(option);}mode.value=preferences.mode;modeLabel.append(mode);popover.append(modeLabel);
    const historyLabel=element('label','Count meaningful listening locally ');const history=element('input');history.type='checkbox';history.checked=preferences.history;historyLabel.append(history);popover.append(historyLabel);
    let model:HTMLSelectElement|undefined;
    if(s.auth.connected&&s.auth.planUsage){try{const choices=await helper.request('models');model=element('select');model.setAttribute('aria-label','ChatGPT model');const auto=element('option','Automatic · fast available model');auto.value='';model.append(auto);for(const m of choices){const option=element('option',m.displayName);option.value=m.slug;model.append(option);}model.value=preferences.model??'';const label=element('label','Model ');label.append(model);popover.append(label);}catch(e){popover.append(element('p',(e as Error).message));}}
    popover.append(element('p',`${s.history.coverage}. ${s.history.meaningfulPlays} meaningful plays. ${s.history.threshold}`));
    popover.append(element('p',s.quota));
    const save=element('button','Save');save.type='button';save.onclick=async()=>{try{preferences=await helper.request('settings',{length:Number(length.value),cap:Number(cap.value),mode:mode.value,history:history.checked,model:model?.value||null});popover.hidden=true;message('Settings saved.');input.focus();}catch(e){message((e as Error).message,true);}};popover.append(save);
    const erase=element('button','Clear local listening counts');erase.type='button';erase.onclick=async()=>{try{await helper.request('history.clear',{account:await spotify.account()});popover.hidden=true;message('Local listening counts cleared.');}catch(e){message((e as Error).message,true);}};popover.append(erase);
  }catch(e){popover.replaceChildren(element('p',(e as Error).message));const reconnect=element('a','Start helper');reconnect.href='queue-companion://start';popover.append(reconnect);const repair=element('a','Repair installation');repair.href='queue-companion://repair';popover.append(repair);}
}
function mount() {
  if(disposing)return;
  const search=document.querySelector<HTMLInputElement>('input[data-testid="search-input"][data-top-bar-search="true"]');
  if(!search)return;if(host?.isConnected&&anchor===search){position();return;}
  if(!host){
    host=element('div');host.id='queue-companion';root=host.attachShadow({mode:'open'});
    const style=element('style');style.textContent=`
      :host{display:block;position:fixed;z-index:1001;width:420px;color:var(--qc-text);font-family:var(--qc-font);font-size:12px;line-height:1.4}
      *{box-sizing:border-box} [hidden]{display:none!important} form{height:26px;display:flex;align-items:center;background:var(--qc-bg);border:1px solid var(--qc-border);border-radius:16px;padding:0 5px 0 12px;gap:4px}
      form:focus-within{outline:2px solid var(--qc-text);outline-offset:1px} input,button,select,a{font:inherit;color:inherit} input[type=text]{background:transparent;border:0;outline:0;min-width:0;flex:1;padding:0;height:24px} input::placeholder{color:var(--qc-muted)}
      button{border:0;border-radius:12px;background:transparent;cursor:pointer;padding:3px 7px;white-space:nowrap} button:hover,a:hover{background:var(--qc-border)} button:focus-visible,a:focus-visible,select:focus-visible{outline:2px solid var(--qc-text)} button:disabled{opacity:.5;cursor:default}
      button[data-busy=true]{animation:pulse 1s ease-in-out infinite} @keyframes pulse{50%{opacity:.35}} @media(prefers-reduced-motion:reduce){button[data-busy=true]{animation:none}}
      .feedback:empty{display:none}.feedback{position:absolute;top:30px;left:0;max-width:100%;background:var(--qc-bg);border-radius:8px;padding:5px 10px;box-shadow:0 4px 12px #0005}.feedback[data-error=true]{border:1px solid var(--qc-muted)}
      .popover{position:absolute;right:0;top:32px;width:320px;max-width:90vw;max-height:70vh;overflow:auto;background:var(--qc-bg);padding:14px;border-radius:8px;border:1px solid var(--qc-border);box-shadow:0 8px 24px #0008}.popover p{margin:8px 0;color:var(--qc-muted)}.popover label{display:flex;justify-content:space-between;align-items:center;margin:10px 0;gap:8px}.popover input[type=number]{width:55px}.popover select{max-width:210px}select,input[type=number]{background:var(--qc-bg);border:1px solid var(--qc-muted);border-radius:4px;padding:3px}.popover a{display:inline-block;margin:6px;padding:4px}
    `;root!.append(style);
    const form=element('form');form.setAttribute('aria-label','Queue Companion');input=element('input');input.type='text';input.maxLength=1000;input.autocomplete='off';input.placeholder='What do you feel like listening to?';input.setAttribute('aria-label',input.placeholder);input.setAttribute('aria-describedby','feedback');
    submit=element('button','↵');submit.type='submit';submit.setAttribute('aria-label','Add songs');const settings=element('button','⚙');settings.type='button';settings.setAttribute('aria-label','Queue Companion settings');settings.setAttribute('aria-haspopup','dialog');settings.onclick=()=>void showSettings();
    form.append(input,submit,settings);form.onsubmit=e=>{e.preventDefault();void run(input.value);};form.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'&&e.repeat){e.preventDefault();return;}if(e.key==='Escape'){pipeline.cancel();popover.hidden=true;input.focus();}};
    feedback=element('div');feedback.id='feedback';feedback.className='feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');popover=element('div');popover.className='popover';popover.hidden=true;popover.setAttribute('role','dialog');popover.setAttribute('aria-label','Queue Companion settings');popover.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape'){popover.hidden=true;input.focus();}};
    root!.append(form,feedback,popover);
  }
  // The tested search container already establishes a positioning context. Anchoring
  // locally follows its movement even when Spotify moves it without resizing input.
  const container=search.closest('form')?.parentElement;
  const local=container&&getComputedStyle(container).position!=='static';
  anchor=search;host.style.position=local?'absolute':'fixed';(local?container:document.body).append(host);
  resize?.disconnect();resize=new ResizeObserver(position);resize.observe(search);position();
}
function position() {
  if(!anchor||!host)return;const r=anchor.getBoundingClientRect();if(r.width<100){host.style.visibility='hidden';return;}host.style.visibility='visible';
  const style=getComputedStyle(anchor);host.style.setProperty('--qc-font',style.fontFamily);host.style.setProperty('--qc-text',style.color);host.style.setProperty('--qc-bg',style.backgroundColor==='rgba(0, 0, 0, 0)'?'var(--background-elevated-base, #282828)':style.backgroundColor);host.style.setProperty('--qc-muted','var(--text-subdued, #b3b3b3)');host.style.setProperty('--qc-border','var(--background-tinted-highlight, #404040)');
  const parent=host.style.position==='absolute'?host.parentElement:null;const p=parent?.getBoundingClientRect();
  host.style.left=`${parent&&p?r.left-p.left-parent.clientLeft+parent.scrollLeft:Math.max(8,r.left)}px`;
  host.style.top=`${parent&&p?r.bottom-p.top-parent.clientTop+parent.scrollTop+2:r.bottom+2}px`;host.style.width=`${Math.min(r.width,window.innerWidth-16)}px`;
}
let scheduled=false;const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;mount();});});
function dispose(){disposing=true;lifecycle.abort();observer.disconnect();resize?.disconnect();clearTimeout(feedbackTimer);clearTimeout(authTimer);pipeline.cancel();historyDispose?.();helper.dispose();host?.remove();}
window.__queueCompanion={dispose,run:(prompt:string)=>run(prompt),snapshot:()=>spotify.snapshot(),status:()=>refreshSettings(),history:()=>helper.request('history',{account:Spicetify.Platform.username,count:15,days:30})};
async function start() {
  // Bounded startup wait only; there is no continuous readiness polling.
  for(let i=0;i<120;i++){if(disposing)return;if(globalThis.Spicetify?.Platform?.PlayerAPI&&Spicetify.Queue&&Spicetify.GraphQL?.Definitions?.getTrack&&Spicetify.Platform.ConnectAPI)break;if(i===119)return;await new Promise(r=>setTimeout(r,250));}
  mount();observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('resize',()=>requestAnimationFrame(position),{signal:lifecycle.signal});window.addEventListener('beforeunload',dispose,{once:true,signal:lifecycle.signal});
  historyDispose=spotify.startHistory();try{await refreshSettings();await reconcile();}catch{ /* Show actionable connection errors when the user submits or opens settings. */ }
}
void start();

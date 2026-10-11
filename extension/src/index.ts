import {Helper} from './ipc';import {Spotify} from './spotify';import {QueueWriter} from './queue';import {Pipeline,type Preferences} from './pipeline';import type {Playlist} from './domain';import {QueuePlacement} from './placement';

window.__queueCompanion?.dispose();
const lifecycle=new AbortController();const helper=new Helper();const spotify=new Spotify(helper);
let preferences:Preferences={length:15,cap:50,mode:'append',history:true};
let host:HTMLElement|undefined,root:ShadowRoot|undefined,placement:QueuePlacement|undefined;
let input:HTMLInputElement,feedback:HTMLElement,submit:HTMLButtonElement,popover:HTMLElement;
let feedbackTimer:number|undefined,authTimer:number|undefined,settingsEpoch=0,historyDispose:(()=>void)|undefined,epoch=0,disposing=false;
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
    message((result.mode==='replace'?'Updated your queue'+(result.count<result.requested?' · '+amount:'.'):'Added '+amount)+(result.shortfall?' · '+result.shortfall:'')+(result.coverage?' · '+result.coverage:''));
    window.__queueCompanion!.lastResult=result;
    lastSuccessPrompt=prompt.trim();lastSuccessAt=performance.now();
  }catch(e){if(call!==epoch||e instanceof DOMException&&e.name==='AbortError')return;message(e instanceof Error?e.message:'Selection failed. Try again.',true,true);}
  finally{if(call===epoch){submit.disabled=writer.blocked;submit.dataset.busy='false';submit.textContent='↵';submit.setAttribute('aria-label','Add songs');}}
}
function element<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string){const e=document.createElement(tag);if(text)e.textContent=text;return e;}
function closeSettings(){settingsEpoch++;clearTimeout(authTimer);popover.querySelectorAll<HTMLInputElement>('input[type=password]').forEach(key=>key.value='');popover.hidden=true;}
async function showSettings() {
  if(!popover.hidden){closeSettings();input.focus();return;}
  const settingsCall=++settingsEpoch;pipeline.cancel();
  popover.hidden=false;popover.replaceChildren(element('p','Connecting to helper…'));
  try {
    const s=await refreshSettings();if(popover.hidden||settingsCall!==settingsEpoch)return;popover.replaceChildren();
    const title=element('strong','Queue Companion');popover.append(title);
    const provider=element('select');provider.setAttribute('aria-label','Music selection provider');for(const [value,name] of [['claude','Claude API'],['chatgpt','ChatGPT']]){const option=element('option',name);option.value=value;provider.append(option);}provider.value=preferences.provider??'claude';const providerLabel=element('label','Provider ');providerLabel.append(provider);popover.append(providerLabel);
    const connection=element('div');popover.append(connection);
    const label=element('label','Default songs ');const length=element('input');length.type='number';length.min='1';length.max='50';length.value=String(preferences.length);label.append(length);popover.append(label);
    const capLabel=element('label','Maximum songs ');const cap=element('input');cap.type='number';cap.min='1';cap.max='50';cap.value=String(preferences.cap);capLabel.append(cap);popover.append(capLabel);
    const modeLabel=element('label','Queue preference ');const mode=element('select');for(const value of ['append','replace']){const option=element('option',value==='append'?'Append':'Replace manually queued songs');option.value=value;option.disabled=value==='replace'&&!spotify.replaceSupported();mode.append(option);}mode.value=preferences.mode;modeLabel.append(mode);popover.append(modeLabel);
    const historyLabel=element('label','Count meaningful listening locally ');const history=element('input');history.type='checkbox';history.checked=preferences.history;historyLabel.append(history);popover.append(historyLabel);
    let model:HTMLSelectElement|undefined;let connectionEpoch=0;
    const reopen=async()=>{if(!popover.hidden&&settingsCall===settingsEpoch){closeSettings();await showSettings();}};
    const renderConnection=async()=>{
      clearTimeout(authTimer);const call=++connectionEpoch,chosen=provider.value;model=undefined;connection.replaceChildren();
      const error=element('p');
      if(chosen==='claude'){
        connection.append(element('p',s.claude.connected?'Claude API connected':'Connect an Anthropic API key to select by mood.'));
        connection.append(element('p',s.claude.billing));
        if(s.claude.lastUsage){const u=s.claude.lastUsage;connection.append(element('p',`Last selection: ${u.inputTokens} input / ${u.outputTokens} output tokens.`));}
        const key=element('input');key.type='password';key.autocomplete='off';key.spellcheck=false;key.maxLength=512;key.placeholder='Anthropic API key';key.setAttribute('aria-label','Anthropic API key');const keyLabel=element('label','API key ');keyLabel.append(key);connection.append(keyLabel);
        const connect=element('button',s.claude.connected?'Replace API key':'Connect Claude');connect.type='button';connect.onclick=async()=>{const apiKey=key.value;key.value='';connect.disabled=true;try{await helper.request('claude.connect',{apiKey});preferences=await helper.request('settings',{...preferences,provider:'claude',claudeModel:null});message('Claude API connected.');await reopen();}catch(e){error.textContent=(e as Error).message;}finally{connect.disabled=false;}};connection.append(connect);
        if(s.claude.connected){const remove=element('button','Remove API key');remove.type='button';remove.onclick=async()=>{try{await helper.request('claude.disconnect');message('API key removed here. Revoke it in Claude Console if needed.');await reopen();}catch(e){error.textContent=(e as Error).message;}};connection.append(remove);}
      }else{
        connection.append(element('p',s.auth.connected?`ChatGPT connected · ${s.auth.email}`:'Connect ChatGPT to select by mood. Eligible plans and quota apply.'));
        if(s.auth.error)connection.append(element('p',s.auth.error));
        const connect=element('button',s.auth.connected?'Reconnect ChatGPT':'Continue with ChatGPT');connect.type='button';connect.onclick=async()=>{try{await helper.request('connect',{});message('Finish ChatGPT sign-in in your browser.');let attempts=0;const check=async()=>{try{const status=await refreshSettings();if(!status.auth.pending){await reopen();return;}if(++attempts<80&&!popover.hidden&&provider.value==='chatgpt')authTimer=window.setTimeout(check,1500);}catch{}};authTimer=window.setTimeout(check,1500);}catch(e){error.textContent=(e as Error).message;}};connection.append(connect);
        if(s.auth.connected){const disconnect=element('button','Disconnect ChatGPT');disconnect.type='button';disconnect.onclick=async()=>{try{await helper.request('disconnect');await reopen();}catch(e){error.textContent=(e as Error).message;}};connection.append(disconnect);}
        connection.append(element('p','ChatGPT plan usage applies. Exact remaining quota is unavailable.'));
      }
      connection.append(error);
      if(chosen==='claude'?s.claude.connected:s.auth.connected&&s.auth.planUsage){try{const choices=await helper.request('models',{provider:chosen});if(call!==connectionEpoch||popover.hidden||settingsCall!==settingsEpoch)return;model=element('select');model.setAttribute('aria-label',chosen==='claude'?'Claude model':'ChatGPT model');const auto=element('option','Automatic · fast available model');auto.value='';model.append(auto);for(const m of choices){const option=element('option',m.displayName);option.value=m.slug;model.append(option);}model.value=(chosen==='claude'?preferences.claudeModel:preferences.model)??'';const modelLabel=element('label','Model ');modelLabel.append(model);connection.append(modelLabel);}catch(e){if(call===connectionEpoch&&settingsCall===settingsEpoch)error.textContent=(e as Error).message;}}
    };
    provider.onchange=()=>void renderConnection();await renderConnection();if(settingsCall!==settingsEpoch||popover.hidden)return;
    popover.append(element('p',`${s.history.coverage}. ${s.history.meaningfulPlays} meaningful plays. ${s.history.threshold}`));
    const save=element('button','Save');save.type='button';save.onclick=async()=>{try{preferences=await helper.request('settings',{length:Number(length.value),cap:Number(cap.value),mode:mode.value,history:history.checked,provider:provider.value,model:provider.value==='chatgpt'?model?.value||null:preferences.model??null,claudeModel:provider.value==='claude'?model?.value||null:preferences.claudeModel??null});closeSettings();message('Settings saved.');input.focus();}catch(e){message((e as Error).message,true);}};popover.append(save);
    const erase=element('button','Clear local listening counts');erase.type='button';erase.onclick=async()=>{try{await helper.request('history.clear',{account:await spotify.account()});closeSettings();message('Local listening counts cleared.');}catch(e){message((e as Error).message,true);}};popover.append(erase);
  }catch(e){if(settingsCall!==settingsEpoch||popover.hidden)return;popover.replaceChildren(element('p',(e as Error).message));const reconnect=element('a','Start helper');reconnect.href='queue-companion://start';popover.append(reconnect);const repair=element('a','Repair installation');repair.href='queue-companion://repair';popover.append(repair);}
}
function createUI() {
  if(!host){
    host=element('div');host.id='queue-companion';
    // Spotify's outer reset wins over shadow-host rules; size the owned host here.
    Object.assign(host.style,{display:'block',flex:'0 0 auto',minWidth:'0',padding:'0 16px 12px',boxSizing:'border-box'});
    root=host.attachShadow({mode:'open'});
    const style=element('style');style.textContent=`
      :host{display:block;flex:0 0 auto;min-width:0;padding:0 16px 12px;color:var(--qc-text,#fff);font-family:var(--qc-font, sans-serif);font-size:16px;line-height:1.4}
      *{box-sizing:border-box} [hidden]{display:none!important} form{height:44px;display:flex;align-items:center;background:var(--qc-bg);border:1px solid var(--qc-border);border-radius:24px;padding:0 6px 0 12px;gap:6px}.queue-icon{flex:0 0 16px;color:var(--qc-muted)} form button{width:32px;height:32px;flex:0 0 32px;padding:3px}
      form:focus-within{outline:2px solid var(--qc-text);outline-offset:1px} input,button,select,a{font:inherit;color:inherit} input[type=text]{background:transparent;border:0;outline:0;min-width:0;flex:1;padding:0;height:42px} input::placeholder{color:var(--qc-muted)}
      button{border:0;border-radius:12px;background:transparent;cursor:pointer;padding:3px 7px;white-space:nowrap} button:hover,a:hover{background:var(--qc-border)} button:focus-visible,a:focus-visible,select:focus-visible{outline:2px solid var(--qc-text)} button:disabled{opacity:.5;cursor:default}
      button[data-busy=true]{animation:pulse 1s ease-in-out infinite} @keyframes pulse{50%{opacity:.35}} @media(prefers-reduced-motion:reduce){button[data-busy=true]{animation:none}}
      .feedback:empty{display:none}.feedback{font-size:12px;margin-top:8px;max-height:96px;overflow:auto;overflow-wrap:anywhere;background:var(--qc-bg);border-radius:8px;padding:8px 10px}.feedback[data-error=true]{border:1px solid var(--qc-muted)}
      .popover{font-size:12px;margin-top:8px;width:100%;max-height:min(40vh,max(80px,calc(100vh - 380px)));overflow:auto;overflow-wrap:anywhere;background:var(--qc-bg);padding:14px;border-radius:8px;border:1px solid var(--qc-border)}.popover p{margin:8px 0;color:var(--qc-muted)}.popover label{display:flex;justify-content:space-between;align-items:center;margin:10px 0;gap:8px}.popover input[type=number]{width:55px}.popover input[type=password]{width:200px;min-width:0;max-width:65%}.popover select{min-width:0;max-width:65%}select,input[type=number],input[type=password]{background:var(--qc-bg);border:1px solid var(--qc-muted);border-radius:4px;padding:3px}.popover a{display:inline-block;margin:6px;padding:4px}
    `;root!.append(style);
    const form=element('form');form.setAttribute('aria-label','Queue Companion');input=element('input');input.type='text';input.maxLength=1000;input.autocomplete='off';input.placeholder='What do you feel like listening to?';input.setAttribute('aria-label',input.placeholder);input.setAttribute('aria-describedby','feedback');
    submit=element('button','↵');submit.type='submit';submit.setAttribute('aria-label','Add songs');const settings=element('button','⚙');settings.type='button';settings.setAttribute('aria-label','Queue Companion settings');settings.setAttribute('aria-haspopup','dialog');settings.onclick=()=>void showSettings();
    const icon=element('span');icon.className='queue-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h16M3 10h16M3 15h9M16 15l5 3-5 3z"/></svg>';
    form.append(icon,input,submit,settings);form.onsubmit=e=>{e.preventDefault();void run(input.value);};form.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'&&e.repeat){e.preventDefault();return;}if(e.key==='Escape'){pipeline.cancel();closeSettings();input.focus();}};
    feedback=element('div');feedback.id='feedback';feedback.className='feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');popover=element('div');popover.className='popover';popover.hidden=true;popover.setAttribute('role','dialog');popover.setAttribute('aria-label','Queue Companion settings');popover.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape'){closeSettings();input.focus();}};
    root!.append(form,feedback,popover);
  }
  placement=new QueuePlacement(host!,()=>input.focus(),closeSettings,text=>Spicetify.showNotification?.(text,true));
  placement.start();
}
function dispose(){if(popover)closeSettings();disposing=true;lifecycle.abort();placement?.dispose();clearTimeout(feedbackTimer);clearTimeout(authTimer);pipeline.cancel();historyDispose?.();helper.dispose();host?.remove();}
window.__queueCompanion={dispose,run:(prompt:string)=>run(prompt),snapshot:()=>spotify.snapshot(),status:()=>refreshSettings(),history:()=>helper.request('history',{account:Spicetify.Platform.username,count:15,days:30})};
async function start() {
  // Bounded startup wait only; there is no continuous readiness polling.
  for(let i=0;i<120;i++){if(disposing)return;if(globalThis.Spicetify?.Platform?.PlayerAPI&&Spicetify.Queue&&Spicetify.GraphQL?.Definitions?.getTrack&&Spicetify.Platform.ConnectAPI)break;if(i===119)return;await new Promise(r=>setTimeout(r,250));}
  createUI();window.addEventListener('beforeunload',dispose,{once:true,signal:lifecycle.signal});
  historyDispose=spotify.startHistory();try{await refreshSettings();await reconcile();}catch{ /* Show actionable connection errors when the user submits or opens settings. */ }
}
void start();

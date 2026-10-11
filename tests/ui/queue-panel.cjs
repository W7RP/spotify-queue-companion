const {createRequire}=require('node:module');
const {resolve}=require('node:path');
const {writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const project=resolve(__dirname,'../..');
const {chromium}=createRequire(resolve(project,'extension/package.json'))('playwright');
const html=`<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#000;color:#fff;font-family:Arial,sans-serif;--text-base:#fff;--text-subdued:#b3b3b3;--background-elevated-base:#282828;--background-tinted-highlight:#404040}#nav{height:64px;display:flex;justify-content:center;align-items:center}form[role=search]{position:relative;width:min(474px,calc(100vw - 80px));height:48px}#search-wrap input{width:100%;height:48px;border:0;border-radius:24px;padding:12px 96px 12px 48px;background:#1f1f1f;color:#fff;font:16px Arial}#hint{position:absolute;top:12px;width:100%;padding:0 64px 0 48px;pointer-events:none;color:#b3b3b3;font-size:16px;display:flex;white-space:nowrap}#hint span{min-width:0;overflow:hidden;text-overflow:ellipsis}#hint kbd{margin-left:12px}#trailing{position:absolute;right:12px;top:50%;transform:translateY(-50%);display:flex;align-items:center}#browse-wrap{padding:0 4px 0 12px;border-left:1px solid #777}button[data-testid=browse-button]{border:0;background:none;color:#fff;width:24px;height:24px;padding:0}#clear{display:none;width:48px;height:32px;background:transparent;border:0;color:white}aside{position:absolute;right:8px;top:64px;bottom:88px;width:var(--panel-width,420px);background:#121212;border-radius:8px;overflow:hidden}#queue-layout{display:flex;flex-direction:column;height:100%;min-height:0}#header{flex:0 0 64px;padding:8px 16px;display:flex;gap:16px;align-items:center}#header button{background:none;color:#fff;border:0;height:48px}#scroll{min-height:0;flex:1;overflow:auto;padding:0 16px}#queue-panel,#history-panel{padding:0 0 16px}#queue-panel .row{height:64px;border-bottom:1px solid #333;padding:12px 0}#native-queue{position:absolute;bottom:30px;right:40px}#main{padding:24px;width:40%;color:#b3b3b3}
</style></head><body>
<div id=nav><form role=search><div id=search-wrap><input data-testid=search-input data-top-bar-search=true aria-label="What do you want to play?"><div id=hint><span>What do you want to play?</span><kbd>Ctrl K</kbd></div></div><div id=trailing><button id=clear data-testid=clear-button type=button>×</button><div id=browse-wrap><button data-testid=browse-button aria-label=Browse type=button>▥</button></div></div></form></div>
<div id=main>Spotify layout fixture</div><div id=sidebar></div><button id=native-queue data-testid=control-button-queue aria-pressed=false>Queue</button>
<script>
window.stats={nativeSubmits:0,nativeKeys:0,browseClicks:0,queueWrites:0,requests:[],notices:[]};
document.querySelector('form').onsubmit=e=>{e.preventDefault();stats.nativeSubmits++};document.querySelector('form').onkeydown=()=>stats.nativeKeys++;
document.querySelector('[data-testid=browse-button]').onclick=()=>stats.browseClicks++;
window.renderQueue=()=>{const side=document.getElementById('sidebar');side.innerHTML='<aside id="Desktop_PanelContainer_Id" aria-label="Queue"><div id="queue-layout"><div id="header"><button id="queue-tab" role="tab" aria-controls="queue-panel" aria-selected="true">Queue</button><button id="history-tab" role="tab" aria-controls="history-panel" aria-selected="false">Recently played</button></div><div id="scroll"><div id="queue-panel" role="tabpanel">'+Array.from({length:10},(_,i)=>'<div class="row">Queued song '+(i+1)+'</div>').join('')+'</div><div id="history-panel" role="tabpanel" hidden>Recently played</div></div></div></aside>';
 const setTab=queue=>{document.getElementById('queue-tab').setAttribute('aria-selected',String(queue));document.getElementById('history-tab').setAttribute('aria-selected',String(!queue));document.getElementById('queue-panel').hidden=!queue;document.getElementById('history-panel').hidden=queue};
 document.getElementById('queue-tab').onclick=()=>setTab(true);document.getElementById('history-tab').onclick=()=>setTab(false);
};
document.getElementById('native-queue').onclick=()=>{const b=document.getElementById('native-queue'),open=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(open));const side=document.getElementById('sidebar');if(open&&!side.firstChild)renderQueue();side.hidden=!open};
const status={settings:{length:15,cap:50,mode:'append',history:true,provider:'claude'},claude:{connected:false,billing:'Anthropic API credits apply.'},auth:{connected:false},history:{coverage:'Local listening counts',meaningfulPlays:0,threshold:'30 seconds'}};
window.WebSocket=class{constructor(){queueMicrotask(()=>this.onopen?.())}send(raw){const m=JSON.parse(raw);stats.requests.push(m.type);queueMicrotask(()=>this.onmessage?.({data:JSON.stringify(m.type==='pair'?{v:1,type:'paired'}:{v:1,id:m.id,ok:true,data:m.type==='status'?status:{}})}))}close(){}};
window.__queueCompanionPairing={port:43829,token:'fixture',v:1};
window.Spicetify={Platform:{version:'1.3.4.258',username:'fixture',UserAPI:{getUser:async()=>({username:'fixture'})},PlayerAPI:{getState:()=>({})},ConnectAPI:{getState:()=>({activeDevice:{isLocal:true,isActive:true}})}},Queue:{nextTracks:[]},GraphQL:{Definitions:{getTrack:{}}},Player:{getProgress:()=>0,addEventListener(){},removeEventListener(){}},showNotification:t=>stats.notices.push(t)};
</script></body></html>`;

(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.QC_BROWSER_CHANNEL||'msedge'});
 const page=await browser.newPage({viewport:{width:1355,height:791}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const checks=[];const check=(name,condition)=>{assert(condition,name);checks.push(name)};
 const delay=()=>page.waitForTimeout(80);
 try{
  await page.route('http://127.0.0.1/queue-companion-test',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.goto('http://127.0.0.1/queue-companion-test');await page.addScriptTag({path:resolve(project,'extension/dist/queue-companion.js')});
  await page.locator('#queue-companion-shortcut').waitFor();
  check('composer absent with Queue closed',await page.locator('#queue-companion').count()===0);
  await page.locator('#queue-companion-shortcut').focus();await page.keyboard.press('Enter');await delay();
  check('Enter opens Queue and focuses input',await page.locator('#queue-companion input[type=text]').evaluate(e=>e.getRootNode().activeElement===e));
  const input=page.locator('#queue-companion input[type=text]');await input.fill('keep my draft');
  await page.locator('#queue-companion-shortcut').click();await delay();
  check('repeat activation keeps Queue open',await page.locator('#queue-companion').count()===1);
  await page.locator('#native-queue').click();await delay();
  await page.locator('#queue-companion-shortcut').focus();await page.keyboard.press('Space');await delay();
  check('Space reopens and preserves draft',await input.inputValue()==='keep my draft');
  await page.locator('#history-tab').click();await delay();check('Recently played hides composer',await page.locator('#queue-companion').count()===0);
  await page.locator('#queue-companion-shortcut').click();await delay();check('shortcut switches history to Queue',await page.locator('#queue-tab').getAttribute('aria-selected')==='true');
  await page.locator('#queue-companion button[aria-label="Queue Companion settings"]').click();await delay();
  check('settings populated',await page.locator('#queue-companion [aria-label="Anthropic API key"]').count()===1);
  await page.locator('#queue-companion [aria-label="Anthropic API key"]').fill('not-a-real-key');
  await page.locator('#native-queue').click();await delay();await page.locator('#queue-companion-shortcut').click();await delay();
  check('closing panel clears masked key and closes settings',await page.locator('#queue-companion .popover').evaluate(e=>e.hidden&&e.querySelector('input[type=password]').value===''));
  const views=[];
  for(const [width,height,panelWidth] of [[1355,791,420],[1024,740,320],[780,620,280],[600,440,240]]){
   await page.setViewportSize({width,height});await page.evaluate(w=>document.body.style.setProperty('--panel-width',w+'px'),panelWidth);await delay();
   await page.locator('#queue-companion button[aria-label="Queue Companion settings"]').click();await delay();
   const geometry=await page.evaluate(()=>{const h=document.getElementById('queue-companion'),r=h.shadowRoot,rect=e=>{const x=e.getBoundingClientRect();return{x:x.x,y:x.y,width:x.width,height:x.height,right:x.right,bottom:x.bottom}};return{form:rect(r.querySelector('form')),settings:rect(r.querySelector('.popover')),input:rect(r.querySelector('input[type=text]')),scroll:rect(document.getElementById('scroll')),aside:rect(h.closest('aside')),icon:rect(document.getElementById('queue-companion-shortcut')),browse:rect(document.querySelector('[data-testid=browse-button]')),font:getComputedStyle(r.querySelector('input[type=text]')).fontSize,overflow:document.documentElement.scrollWidth>innerWidth};});
   check('no overlap or clipping at '+width,geometry.form.height===44&&geometry.font==='16px'&&geometry.input.width>80&&geometry.icon.right<=geometry.browse.x&&geometry.settings.bottom<=geometry.scroll.y&&geometry.scroll.height>32&&geometry.settings.right<=geometry.aside.right&&!geometry.overflow);
   views.push({viewport:{width,height,panelWidth},geometry});
   if(process.env.QC_UI_SCREENSHOT)await page.screenshot({path:resolve(process.env.QC_UI_SCREENSHOT,'queue-panel-'+width+'.png')});
   await input.focus();await page.keyboard.press('Escape');await delay();
  }
  await page.evaluate(()=>{document.getElementById('search-wrap').querySelector('input').value='actual search';document.getElementById('hint').hidden=true;document.getElementById('clear').style.display='block'});await delay();
  const nonOverlap=await page.evaluate(()=>{const c=document.getElementById('clear').getBoundingClientRect(),q=document.getElementById('queue-companion-shortcut').getBoundingClientRect(),b=document.querySelector('[data-testid=browse-button]').getBoundingClientRect(),s=document.querySelector('[data-testid=search-input]'),r=s.getBoundingClientRect();return c.right<=q.left&&q.right<=b.left&&r.right-parseFloat(getComputedStyle(s).paddingRight)<=c.left});
  check('typing search preserves clear and Browse space',nonOverlap);
  await page.locator('[data-testid=browse-button]').click();check('native Browse still works',await page.evaluate(()=>stats.browseClicks===1));
  await page.evaluate(()=>{const f=document.querySelector('form[role=search]'),clone=f.cloneNode(true);clone.querySelector('#queue-companion-shortcut')?.remove();clone.querySelector('input').style.removeProperty('padding-right');clone.querySelector('#hint').style.removeProperty('padding-right');f.replaceWith(clone)});await delay();
  check('search remount has one shortcut',await page.locator('#queue-companion-shortcut').count()===1);
  await page.evaluate(()=>renderQueue());await delay();check('Queue remount keeps draft',await input.inputValue()==='keep my draft');
  check('shortcut never submits native Search',await page.evaluate(()=>stats.nativeSubmits===0&&stats.nativeKeys===0));
  check('layout tests never generate or write music',await page.evaluate(()=>!stats.requests.includes('generate')));
  check('no browser errors',errors.length===0);
  await page.evaluate(()=>window.__queueCompanion.dispose());await delay();
  check('dispose removes both UI elements and style',await page.locator('#queue-companion,#queue-companion-shortcut,#queue-companion-shortcut-style').count()===0);
  check('dispose restores native search padding',await page.locator('[data-testid=search-input]').evaluate(e=>e.style.paddingRight===''&&getComputedStyle(e).paddingRight==='96px'));
  const report={passed:true,checks:checks.length,names:checks,views,browserErrors:errors};
  if(process.env.QC_UI_REPORT)writeFileSync(resolve(process.env.QC_UI_REPORT),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:true,checks:checks.length,viewports:views.length,browserErrors:errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

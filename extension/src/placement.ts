const SEARCH='input[data-testid="search-input"][data-top-bar-search="true"]';
const BROWSE='[data-testid="browse-button"]';
const NATIVE_QUEUE='button[data-testid="control-button-queue"]';

/** Owns only the shortcut, reserved search space, and an in-flow Queue composer. */
export class QueuePlacement {
  private shortcut?:HTMLButtonElement;
  private shortcutStyle?:HTMLStyleElement;
  private search?:HTMLInputElement;
  private restorers:Array<()=>void>=[];
  private observer?:MutationObserver;
  private scheduled=false;
  private disposed=false;
  private focusPending=false;
  private openTimer?:number;
  constructor(private host:HTMLElement,private focus:()=>void,private hidden:()=>void,private notify:(text:string)=>void){}

  start(){
    this.update();
    this.observer=new MutationObserver(()=>{
      if(this.scheduled||this.disposed)return;
      this.scheduled=true;queueMicrotask(()=>{this.scheduled=false;if(!this.disposed)this.update();});
    });
    this.observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-selected','aria-pressed']});
  }

  private reserve(element:HTMLElement,property:string,amount:number){
    const base=parseFloat(getComputedStyle(element).getPropertyValue(property))||0;
    this.ownStyle(element,property,`${base+amount}px`);
  }

  private ownStyle(element:HTMLElement,property:string,owned:string){
    const old=element.style.getPropertyValue(property),priority=element.style.getPropertyPriority(property);
    element.style.setProperty(property,owned);
    this.restorers.push(()=>{if(element.style.getPropertyValue(property)===owned){if(old)element.style.setProperty(property,old,priority);else element.style.removeProperty(property);}});
  }

  private removeShortcut(){
    this.shortcut?.remove();this.shortcutStyle?.remove();this.restorers.splice(0).forEach(restore=>restore());
    this.shortcut=undefined;this.shortcutStyle=undefined;this.search=undefined;
  }

  private mountShortcut(){
    const search=document.querySelector<HTMLInputElement>(SEARCH);
    const form=search?.closest('form');
    const browse=form?.querySelector<HTMLButtonElement>(BROWSE);
    const wrapper=browse?.parentElement;
    const trailing=wrapper?.parentElement;
    if(!search||!form||!browse||!wrapper||!trailing){this.removeShortcut();return;}
    if(this.search===search&&this.shortcut?.isConnected&&this.shortcut.parentElement===trailing&&this.shortcut.nextElementSibling===wrapper)return;
    this.removeShortcut();this.search=search;
    const button=document.createElement('button');button.id='queue-companion-shortcut';button.type='button';
    button.className=browse.className;button.title='Open Queue Companion';button.setAttribute('aria-label','Open Queue Companion');button.setAttribute('aria-controls',this.host.id);
    button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h16M3 10h16M3 15h9M16 15l5 3-5 3z"/></svg>';
    button.onclick=e=>{e.preventDefault();e.stopPropagation();this.open();};
    button.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'&&e.repeat)e.preventDefault();};
    button.onkeyup=e=>e.stopPropagation();
    this.shortcutStyle=document.createElement('style');this.shortcutStyle.id='queue-companion-shortcut-style';
    this.shortcutStyle.textContent='#queue-companion-shortcut{display:inline-flex;align-items:center;justify-content:center;flex:0 0 32px;width:32px;height:32px;padding:4px;margin:0;border:0;background:transparent;border-radius:50%;cursor:pointer;color:var(--text-subdued,#b3b3b3)}#queue-companion-shortcut:hover{color:var(--text-base,#fff)}#queue-companion-shortcut[aria-expanded=true]{color:var(--text-positive,#1ed760)}#queue-companion-shortcut:focus-visible{outline:2px solid var(--text-base,#fff);outline-offset:2px}#queue-companion-shortcut:disabled{opacity:.5;cursor:default}';
    document.head.append(this.shortcutStyle);trailing.insertBefore(button,wrapper);this.shortcut=button;
    this.ownStyle(trailing,'align-items','center');
    this.reserve(search,'padding-right',40);
    // Spotify renders its placeholder and keyboard hint in a separate overlay.
    const overlay=Array.from(search.parentElement!.children).find(e=>e.querySelector('kbd'));
    if(overlay instanceof HTMLElement)this.reserve(overlay,'padding-right',40);
  }

  private queueTarget():{parent:HTMLElement;before:HTMLElement}|undefined{
    if(document.querySelector(NATIVE_QUEUE)?.getAttribute('aria-pressed')!=='true')return;
    const tab=document.querySelector<HTMLElement>('#queue-tab[role="tab"][aria-controls="queue-panel"]');
    const panel=document.getElementById('queue-panel');
    if(!tab||!panel||tab.getAttribute('aria-selected')!=='true'||panel.hidden)return;
    const aside=tab.closest('aside');if(!aside||!aside.contains(panel))return;
    // The lowest common ancestor contains Spotify's fixed header and scroll area.
    // Inserting between them makes the scroll area shrink, preserving its controls.
    let before:HTMLElement=panel,parent=before.parentElement;
    while(parent&&parent!==aside){if(parent.contains(tab))return{parent,before};before=parent;parent=parent.parentElement;}
  }

  private update(){
    this.mountShortcut();
    const target=this.queueTarget();
    if(target){
      if(this.host.parentElement!==target.parent||this.host.nextElementSibling!==target.before)target.parent.insertBefore(this.host,target.before);
    }else if(this.host.parentElement){this.hidden();this.host.remove();}
    const source=this.search??document.querySelector<HTMLElement>(NATIVE_QUEUE);
    if(source){const s=getComputedStyle(source);const properties:Record<string,string>={'--qc-font':s.fontFamily,'--qc-text':s.color,'--qc-bg':'var(--background-elevated-base, #282828)','--qc-muted':'var(--text-subdued, #b3b3b3)','--qc-border':'var(--background-tinted-highlight, #404040)'};for(const [key,value] of Object.entries(properties))if(this.host.style.getPropertyValue(key)!==value)this.host.style.setProperty(key,value);}
    this.shortcut?.setAttribute('aria-expanded',String(!!target));
    if(target&&this.focusPending){this.focusPending=false;clearTimeout(this.openTimer);this.focus();}
  }

  open(){
    if(this.disposed)return;
    this.update();
    if(this.queueTarget()){this.focus();return;}
    if(this.focusPending)return;
    const queue=document.querySelector<HTMLButtonElement>(NATIVE_QUEUE);
    if(!queue||queue.disabled){this.notify('Start a song on this computer to open Spotify’s Queue.');return;}
    this.focusPending=true;
    this.openTimer=window.setTimeout(()=>{if(!this.focusPending)return;this.focusPending=false;this.notify('Spotify’s Queue did not open. Try its Queue button beside the playback controls.');},3000);
    const tab=document.querySelector<HTMLButtonElement>('#queue-tab[role="tab"][aria-controls="queue-panel"]');
    // If Recently played is showing, choose Queue rather than toggling the panel shut.
    if(queue.getAttribute('aria-pressed')!=='true')queue.click();else if(tab)tab.click();
    this.update();
  }

  dispose(){this.disposed=true;this.observer?.disconnect();clearTimeout(this.openTimer);this.focusPending=false;this.hidden();this.host.remove();this.removeShortcut();}
}

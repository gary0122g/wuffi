import {currentLanguage,translate} from './i18n'
const icon=(path:string)=>`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
export function installWritingSettings(open:()=>void){
 const button=document.createElement('button');button.className='writing-settings';button.type='button'
 button.innerHTML=icon('<path d="m9 3-.6 2.4-1.2.7-2.4-.7-3 5.2 1.8 1.7v1.4l-1.8 1.7 3 5.2 2.4-.7 1.2.7L9 23h6l.6-2.4 1.2-.7 2.4.7 3-5.2-1.8-1.7v-1.4l1.8-1.7-3-5.2-2.4.7-1.2-.7L15 3z" transform="translate(1 0) scale(.9)"/><circle cx="12" cy="12" r="3"/>')
 button.setAttribute('aria-controls','preferences');button.setAttribute('aria-expanded','false');button.onclick=open
 document.body.append(button)
 const updateLanguage=()=>{button.setAttribute('aria-label',translate('偏好設定'));button.title=`${translate('偏好設定')} (Ctrl+,)`}
 document.addEventListener('ui-language-change',updateLanguage);updateLanguage()
 const preferences=document.getElementById('preferences')!
 const sync=()=>button.setAttribute('aria-expanded',String(!preferences.hidden))
 new MutationObserver(sync).observe(preferences,{attributes:true,attributeFilter:['hidden']});sync()
 const reveal=()=>document.body.classList.remove('chrome-collapsed')
 button.addEventListener('focus',reveal)
 document.addEventListener('beforeinput',event=>{
  if(event.target instanceof Element&&event.target.closest('.ProseMirror,#source-code')){document.body.classList.add('chrome-collapsed');document.body.classList.remove('writing-menu-visible')}
 },true)
 document.addEventListener('keydown',event=>{if(event.key==='F10'||event.key==='Alt')reveal()})
 document.addEventListener('pointermove',event=>{if(event.clientY<=32)reveal()},{passive:true})
}
export function installDesktopChrome(togglePreview:()=>void,changeLanguage:()=>void){
 const header=document.createElement('header');header.className='desktop-chrome'
 header.innerHTML=`<div class="chrome-titlebar"><button class="chrome-sidebar" aria-label="切換側欄" title="切換側欄 (Ctrl+Shift+L)">${icon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>')}</button><span id="seamless-document-title">wuffi</span></div><div class="chrome-menubar"><nav role="menubar" aria-label="主選單"></nav><div class="chrome-actions"><button class="chrome-language" title="切換語言">EN</button><button class="chrome-preview" aria-label="切換預覽" title="原始碼／預覽對照" aria-pressed="false">${icon('<path d="m7 4 13 8-13 8z"/>')}</button></div></div>`
 document.body.prepend(header)
 header.querySelector<HTMLButtonElement>('.chrome-sidebar')!.onclick=()=>document.getElementById('sidebar-toggle')?.click()
 header.querySelector<HTMLButtonElement>('.chrome-preview')!.onclick=togglePreview
 header.querySelector<HTMLButtonElement>('.chrome-language')!.onclick=changeLanguage
 const reveal=()=>{document.body.classList.remove('chrome-collapsed');document.body.classList.add('writing-menu-visible')}
 // Only real pointer movement should reveal controls. Hiding the gear under a
 // stationary pointer must not immediately reveal the titlebar again.
 header.addEventListener('focusin',event=>{if(!(event.target as Element).closest('.chrome-sidebar'))reveal()})
 const dismiss=()=>document.body.classList.remove('writing-menu-visible')
 const menuActive=()=>header.querySelector('.chrome-menubar :focus-visible,.chrome-menubar [aria-expanded=true]')
 window.desktop?.onChromeHover(inside=>{if(inside)reveal();else if(!menuActive())dismiss()})
 document.addEventListener('pointermove',event=>{
  if(event.clientY<=32&&!(event.target as Element).closest?.('.chrome-sidebar'))reveal()
  else if(event.clientY>68&&!menuActive())dismiss()
 },{passive:true})
 document.addEventListener('pointerdown',event=>{if(event.target instanceof Node&&!header.contains(event.target))dismiss()},true)
 header.addEventListener('keydown',event=>{if(event.key==='Escape')dismiss()})
 document.addEventListener('keydown',event=>{if(event.key==='Alt')reveal()})
 const nav=header.querySelector('nav')!
 const updateLanguage=()=>{header.querySelector('.chrome-language')!.textContent=currentLanguage()==='en'?'繁':'EN';for(const button of nav.querySelectorAll<HTMLButtonElement>('button'))button.textContent=translate(button.dataset.label!)}
 void window.desktop?.settings({action:'menus'}).then((menus:{index:number;label:string}[])=>{
  for(const menu of menus){const button=document.createElement('button');button.type='button';button.dataset.label=menu.label;button.textContent=translate(menu.label);button.setAttribute('role','menuitem');button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');button.tabIndex=menu.index===0?0:-1
   button.onclick=async()=>{const rect=button.getBoundingClientRect();button.setAttribute('aria-expanded','true');try{await window.desktop?.settings({action:'menu',index:menu.index,x:Math.round(rect.left),y:Math.round(rect.bottom)})}finally{button.setAttribute('aria-expanded','false')}}
   button.onkeydown=event=>{const buttons=Array.from(nav.querySelectorAll<HTMLButtonElement>('button')),i=buttons.indexOf(button);if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length];buttons.forEach(b=>b.tabIndex=b===next?0:-1);next.focus()}else if(event.key==='ArrowDown'){event.preventDefault();button.click()}else if(event.key==='Escape'){event.preventDefault();button.blur()}}
   nav.append(button)
  }
 }).catch(console.error)
 document.addEventListener('ui-language-change',updateLanguage);updateLanguage()
 document.addEventListener('keydown',event=>{if(event.key==='F10'&&!event.shiftKey){event.preventDefault();reveal();nav.querySelector<HTMLButtonElement>('button')?.focus()}})
 const sidebar=document.getElementById('sidebar')!,sidebarButton=header.querySelector<HTMLButtonElement>('.chrome-sidebar')!
 const sync=()=>{const open=getComputedStyle(sidebar).display!=='none',label=translate(open?'收合側邊欄':'展開側邊欄');sidebarButton.setAttribute('aria-pressed',String(open));sidebarButton.setAttribute('aria-expanded',String(open));sidebarButton.setAttribute('aria-controls','sidebar');sidebarButton.setAttribute('aria-label',label);sidebarButton.title=label+' (Ctrl+Shift+L)'}
 const observer=new MutationObserver(sync);observer.observe(sidebar,{attributes:true,attributeFilter:['class']});observer.observe(document.body,{attributes:true,attributeFilter:['class']})
 document.addEventListener('ui-language-change',sync);window.addEventListener('resize',sync);sync()
}

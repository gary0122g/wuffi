// Tauri desktop bridge. Credentials and filesystem access stay in Rust.
export {}
type TauriGlobal={core:{invoke<T>(command:string,args?:Record<string,unknown>):Promise<T>};event:{listen<T>(name:string,callback:(event:{payload:T})=>void):Promise<()=>void>}}
declare global { interface Window { __TAURI__?:TauriGlobal; __LIUBAI_BENCHMARK__?:boolean } }
function installTauriDesktop(){
 const tauri=window.__TAURI__;if(!tauri||window.desktop)return
 document.body.dataset.runtime='tauri'
 const call=<T=any>(method:string,data:unknown={})=>tauri.core.invoke<T>('desktop_call',{method,data})
 // The dialog plugin replaces browser confirm with a Promise and its JS API
 // has separate permissions. Route messages through our scoped native bridge.
 window.alert=(message?:any)=>{void call('message',{message:String(message??''),confirm:false}).catch(console.error)}
 const commands=new Set<(command:string)=>void>()
 let zoom=1
 let editTarget:HTMLElement|null=null
 const editable=(element:Element|null):element is HTMLElement=>element instanceof HTMLElement&&(element instanceof HTMLInputElement||element instanceof HTMLTextAreaElement||element.isContentEditable)
 document.addEventListener('focusin',event=>{if(editable(event.target as Element))editTarget=event.target as HTMLElement})
 const editCommand=async(name:string)=>{
  const target=editable(document.activeElement)?document.activeElement:editTarget
  if(!target?.isConnected)return
  target.focus({preventScroll:true})
  if(name!=='native:paste'){document.execCommand(name.slice(7));return}
  const data=await window.desktop!.readClipboard()
  if(!target.isConnected||document.activeElement!==target&&!target.contains(document.activeElement))return
  if(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement){
   if(target.readOnly||target.disabled)return
   try{target.setRangeText(data.text,target.selectionStart??0,target.selectionEnd??0,'end');target.dispatchEvent(new Event('input',{bubbles:true}))}catch{/* Non-text controls have no editable selection. */}
  }else{
   const transfer=new DataTransfer();transfer.setData('text/plain',data.text);if(data.html)transfer.setData('text/html',data.html)
   target.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer}))
  }
 }
 const command=(name:string)=>{
  if(name==='window:new'){void call('newWindow').catch(console.error);return}
  if(['app:close','fullscreen','alwaysOnTop','devtools','app:reload'].includes(name)){void call('window',{action:({'app:close':'close','app:reload':'reload'} as Record<string,string>)[name]||name}).catch(console.error);return}
  if(name.startsWith('zoom:')){zoom=name==='zoom:reset'?1:Math.max(.5,Math.min(2,Math.round((zoom+(name==='zoom:in'?.1:-.1))*10)/10));void call('preferences',{zoom}).catch(console.error);return}
  if(name.startsWith('native:')){void editCommand(name).catch(console.error);return}
  if(name==='agent'){document.querySelector<HTMLButtonElement>('.agent-entry')?.click();return}
  if(name==='about'){alert(`wuffi 1.0.0-rc.7\nTauri + Milkdown + CodeMirror`);return}
  for(const callback of commands)callback(name)
 }
 void tauri.event.listen<string>('desktop:command',event=>command(event.payload)).catch(console.error)
 window.desktop={
  updates:data=>call('updates',data),
  onUpdateProgress:callback=>{void tauri.event.listen<{received:number;total?:number;installing?:boolean}>('updater:progress',event=>callback(event.payload))},
  confirm:message=>call<boolean>('message',{message,confirm:true}),
  drafts:data=>call('drafts',data),
  benchmarkReport:window.__LIUBAI_BENCHMARK__?data=>call('benchmark:ready',data):undefined,
  onChromeHover:()=>{},
  cloudAccount:data=>call('cloudAccount',data),
  agentConnection:data=>call('agentConnection',data),agentRequest:data=>call('agentRequest',data),agentCancel:()=>call('agentCancel'),
  exportTemplates:data=>call('exportTemplates',data),settings:async data=>{if(data.action==='menu')data={...data,uiState:{readonly:document.body.classList.contains('read-only'),focus:document.body.classList.contains('focus-mode'),typewriter:document.body.classList.contains('typewriter-mode')}};const value=await call('settings',data);if(['shortcut','resetShortcuts'].includes(String(data.action)))await loadShortcuts();return value},uploadImage:data=>call('uploadImage',data),
  clearRecent:()=>call('clearRecent'),recentFolder:index=>call('recentFolder',{index}),onFolderChanged:callback=>{void tauri.event.listen<Parameters<typeof callback>[0]>('desktop:folder-changed',event=>callback(event.payload)).catch(console.error)},
  renderMarkdown:data=>call('renderMarkdown',data),
  editorContext:data=>{void call('editorContext',data).catch(console.error)},searchFolder:data=>call('searchFolder',data),onFileChanged:callback=>{void tauri.event.listen<Parameters<typeof callback>[0]>('desktop:file-changed',event=>callback(event.payload)).catch(console.error)},
  convert:data=>call('convert',data),importDocument:()=>call('importDocument'),nativeContext:()=>{void call('nativeContext').catch(console.error)},
  readClipboard:()=>call('readClipboard'),clipboard:data=>call('clipboard',data),fileOperation:data=>call('fileOperation',data),
  pickImage:data=>call('pickImage',data),resolveImage:data=>call('resolveImage',data),inspect:data=>call('inspect',data),
  exportDocument:data=>call('exportDocument',data),preferences:data=>{if(typeof data.zoom==='number')zoom=data.zoom;void call('preferences',data).catch(console.error)},
  open:()=>call('open'),initialFiles:()=>call('initialFiles'),openFolder:()=>call('openFolder'),listFolder:token=>call('listFolder',{token}),readFolderFile:token=>call('readFolderFile',{token}),
  save:data=>call('save',data),state:data=>{void call('state',data).catch(console.error)},onCommand:callback=>{commands.add(callback)},
 }
 type Shortcut={accelerator:string;defaultAccelerator:string;command:string}
 let shortcuts:Shortcut[]=[]
 const normalize=(value:string)=>value.toLowerCase().replace(/cmdorctrl|control/g,'ctrl').split('+').sort().join('+')
 async function loadShortcuts(){shortcuts=await call<Shortcut[]>('settings',{action:'shortcuts'})}
 void loadShortcuts().catch(console.error)
 document.addEventListener('keydown',event=>{
  if(event.isComposing)return
  const key=/^Digit\d$/.test(event.code)?event.code.slice(5):({' ':'Space',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right','+':'=','_':'-','{':'[','}':']','~':'`','?':'/'} as Record<string,string>)[event.key]||event.key
  const stroke=normalize([event.ctrlKey||event.metaKey?'Ctrl':'',event.altKey?'Alt':'',event.shiftKey?'Shift':'',key].filter(Boolean).join('+'))
  const action=event.key==='F10'?'chrome-menu':shortcuts.find(row=>row.accelerator&&normalize(row.accelerator)===stroke)?.command
  if(action){event.preventDefault();event.stopImmediatePropagation();command(action)}
  else if(shortcuts.some(row=>row.defaultAccelerator&&normalize(row.defaultAccelerator)===stroke)){event.preventDefault();event.stopImmediatePropagation()}
 },true)
 let progressDialog:HTMLDialogElement|undefined
 const text=(zh:string,en:string)=>document.documentElement.lang.startsWith('en')?en:zh
 void tauri.event.listen<{phase:string;received?:number;total?:number}>('desktop:component-progress',({payload})=>{
  if(payload.phase==='done'){progressDialog?.close();progressDialog?.remove();progressDialog=undefined;return}
  if(!progressDialog){progressDialog=document.createElement('dialog');progressDialog.className='utility-dialog';const title=document.createElement('h2');title.textContent=text('下載轉檔工具','Download document converter');const status=document.createElement('p');status.setAttribute('role','status');const meter=document.createElement('progress');meter.max=1;meter.style.width='100%';const cancel=document.createElement('button');cancel.textContent=text('取消','Cancel');cancel.onclick=()=>{void call('cancelConversion')};progressDialog.oncancel=event=>{event.preventDefault();void call('cancelConversion')};progressDialog.append(title,status,meter,cancel);document.body.append(progressDialog);progressDialog.showModal()}
  const installing=payload.phase==='installing';progressDialog.querySelector('p')!.textContent=installing?text('正在驗證並安裝，完成後會自動繼續。','Verifying and installing. Conversion will continue automatically.'):`${text('正在下載…','Downloading…')} ${Math.round((payload.received||0)/(payload.total||1)*100)}%`;const meter=progressDialog.querySelector('progress')!;if(installing)meter.removeAttribute('value');else meter.value=(payload.received||0)/(payload.total||1)
 }).catch(console.error)
 const observer=new MutationObserver(()=>{
  const bar=document.querySelector<HTMLElement>('.chrome-titlebar');if(!bar)return
  observer.disconnect();bar.setAttribute('data-tauri-drag-region','')
  const controls=document.createElement('div');controls.className='tauri-window-controls'
  for(const [action,label,symbol]of [['minimize','最小化','−'],['maximize','最大化／還原','□'],['close','關閉','×']]){
   const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',label);button.textContent=symbol
   button.onclick=()=>{void call('window',{action}).catch(console.error)};controls.append(button)
  }
  document.body.append(controls)
 });observer.observe(document.body,{childList:true})
}
installTauriDesktop()

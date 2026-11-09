import {currentLanguage} from './i18n'
const text=(zh:string,en:string)=>currentLanguage()==='en'?en:zh
const preference='wuffi.updates.auto'
let mounted:HTMLElement|undefined,busy=false,status='',notes='',current='',available:string|undefined,started=false
function paint(){
 document.body.classList.toggle('update-available',!!available)
 if(!mounted)return
 mounted.querySelector<HTMLElement>('[data-update=status]')!.textContent=status
 mounted.querySelector<HTMLElement>('[data-update=current]')!.textContent=current?`wuffi ${current}`:''
 mounted.querySelector<HTMLElement>('[data-update=notes]')!.textContent=notes
 const check=mounted.querySelector<HTMLButtonElement>('[data-update=check]')!,install=mounted.querySelector<HTMLButtonElement>('[data-update=install]')!
 check.disabled=busy;install.disabled=busy;install.hidden=!available
 install.textContent=text('下載並安裝 ','Download and install ')+(available||'')
}
export async function checkAppUpdate(quiet=false){
 if(busy||!window.desktop?.updates)return
 busy=true;status=text('正在檢查更新…','Checking for updates…');paint()
 try{const result=await window.desktop.updates({action:'check'});current=result.currentVersion;available=result.available?result.version:undefined;notes=result.notes||'';status=available?text('有新版本可安裝。','An update is available.'):text('已是最新版本。','You are up to date.')}
 catch{status=quiet?'':text('暫時無法檢查更新，請確認網路後重試。','Could not check for updates. Check your connection and try again.')}
 finally{busy=false;paint()}
}
async function install(){
 if(busy||!available||!window.desktop?.updates)return
 const confirmed=await window.desktop.confirm?.(text('更新將關閉並重新啟動 wuffi。請先儲存所有視窗的文件。現在下載並安裝嗎？','Updating will close and restart wuffi. Save all documents first. Download and install now?'))
 if(!confirmed)return
 busy=true;status=text('正在下載並驗證更新…','Downloading and verifying the update…');paint()
 try{await window.desktop.updates({action:'install'});status=text('安裝程式已啟動。','The installer has started.')}
 catch(error){status=text('更新未完成：','Update not completed: ')+String(error)}
 finally{busy=false;paint()}
}
export function mountAppUpdates(parent:HTMLElement){
 const section=document.createElement('section');section.className='app-updates';section.setAttribute('aria-label',text('軟體更新','Software updates'))
 const heading=document.createElement('h2');heading.className='preferences-group';heading.textContent=text('軟體更新','Software updates')
 const version=document.createElement('p');version.dataset.update='current'
 const label=document.createElement('label'),auto=document.createElement('input');auto.type='checkbox';auto.setAttribute('role','switch');auto.checked=localStorage.getItem(preference)!=='false';auto.onchange=()=>{localStorage.setItem(preference,String(auto.checked));if(auto.checked)void checkAppUpdate(true)}
 label.append(auto,document.createTextNode(text('啟動時自動檢查更新','Check for updates on startup')))
 const hint=document.createElement('p');hint.className='update-hint';hint.textContent=text('從 GitHub Releases 下載，確認後才安裝。','Downloads from GitHub Releases. Installation requires your confirmation.')
 const actions=document.createElement('div');actions.className='update-actions'
 const check=document.createElement('button');check.type='button';check.dataset.update='check';check.textContent=text('檢查更新','Check for updates');check.onclick=()=>{void checkAppUpdate()}
 const apply=document.createElement('button');apply.type='button';apply.dataset.update='install';apply.onclick=()=>{void install()}
 const message=document.createElement('p');message.dataset.update='status';message.setAttribute('role','status')
 const details=document.createElement('p');details.dataset.update='notes';details.className='update-notes'
 actions.append(check,apply);section.append(heading,version,label,hint,actions,message,details);parent.append(section);mounted=section;paint()
 if(!current)void window.desktop?.updates?.({action:'status'}).then(r=>{current=r.currentVersion;paint()}).catch(()=>{})
}
export function initializeAppUpdates(){
 if(started)return;started=true
 window.desktop?.onUpdateProgress?.(progress=>{status=progress.installing?text('正在安裝更新…','Installing update…'):progress.total?text('下載進度：','Downloading: ')+Math.min(100,Math.round(progress.received/progress.total*100))+'%':text('正在下載更新…','Downloading update…');paint()})
 if(!('__WUFFI_BACKGROUND_TEST__' in window)&&!window.__LIUBAI_BENCHMARK__&&localStorage.getItem(preference)!=='false')window.setTimeout(()=>{if(localStorage.getItem(preference)!=='false')void checkAppUpdate(true)},15000)
}

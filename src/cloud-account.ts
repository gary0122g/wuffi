import {currentLanguage} from './i18n'
const t=(zh:string,en:string)=>currentLanguage()==='en'?en:zh

export function installCloudAccount(panel:HTMLElement,changed:()=>void){
  const api=window.desktop?.cloudAccount
  if(!api)return {provider:()=> 'local',refresh:async()=>{}}
  const section=document.createElement('section');section.className='cloud-account'
  const label=document.createElement('label');label.textContent=t('AI 來源','AI service')
  const badge=document.createElement('small');badge.textContent='Local AI';badge.className='cloud-service-label'
  panel.querySelector('.agent-scope-label')?.append(badge)
  const select=document.createElement('select');select.setAttribute('aria-label',label.textContent)
  for(const [value,text] of [['local',t('Local AI · 免費','Local AI · Free')],['cloud',t('wuffi 雲端 AI · 會員額度','wuffi Cloud AI · Member allowance')]]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option)}
  label.append(select)
  const localForm=panel.querySelector<HTMLFormElement>('.agent-connection form')!
  const details=document.createElement('div');details.hidden=true
  try{if(localStorage.getItem('wuffi.ai.provider')==='cloud'){select.value='cloud';details.hidden=false;localForm.hidden=true;badge.textContent=t('wuffi 雲端 AI','wuffi Cloud AI')}}catch{}
  const saveProvider=()=>{try{localStorage.setItem('wuffi.ai.provider',select.value)}catch{}}
  const privacy=document.createElement('p');privacy.textContent=t('送出時會將本次文章內容與對話傳至 wuffi 雲端。修改仍由你確認。本機編輯與 Local AI 不需會員。','Sending shares this request’s document context and conversation with wuffi Cloud. You review all edits. Local editing and Local AI need no membership.')
  const state=document.createElement('p');state.setAttribute('role','status');state.textContent=t('尚未登入','Not signed in')
  const controls=document.createElement('div')
  let timer:ReturnType<typeof setTimeout>|undefined,epoch=0
  const stop=()=>{epoch++;clearTimeout(timer)}
  function render(value:CloudAccount){
    const names:Record<string,string>={monthly:t('月繳會員','Monthly'),annual:t('年繳會員','Annual'),member:t('會員','Member'),trial:t('雲端試用','Cloud trial'),expired:t('雲端方案已到期','Cloud plan expired')}
    state.textContent=value.user?`${value.user.name || value.user.email} · ${value.user.email}\n${t('方案','Plan')}: ${names[value.plan?.plan||'']||value.plan?.plan||'—'} · ${t('已用額度','Tokens used')}: ${value.plan?.usage.tokens??0} / ${value.plan?.limits.tokens??0}${value.plan?.resetsAt?' · '+t('重設','Resets')+': '+new Date(value.plan.resetsAt).toLocaleString():''}`:t('尚未登入；關閉程式後需重新登入','Not signed in. Sign in again after closing the app.')
  }
  async function refresh(){const current=epoch;try{const value=await api!({action:'status'});if(current===epoch)render(value)}catch(error){if(current===epoch)state.textContent=String(error)}}
  const add=(text:string,action:()=>Promise<void>)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=async()=>{b.disabled=true;try{await action()}catch(error){state.textContent=String(error)}finally{b.disabled=false}};controls.append(b)}
  add(t('登入 wuffi','Sign in to wuffi'),async()=>{
    stop();const current=epoch,value=await api({action:'start'});if(current!==epoch)return
    const deadline=Date.now()+Math.min(value.expiresIn||600,600)*1000
    state.textContent=t('請在瀏覽器登入並按「連結桌面版」，完成後會自動返回。','Sign in in your browser and choose “Connect desktop”. The app will return automatically.')
    async function poll(){
      if(current!==epoch)return
      if(Date.now()>=deadline){state.textContent=t('配對已過期，請重新登入','Pairing expired. Please sign in again.');return}
      try{const result=await api!({action:'poll'});if(current!==epoch)return;if(result.pending){timer=setTimeout(poll,5000)}else{await refresh()}}
      catch(error){if(current===epoch){state.textContent=t('正在重新確認登入… ','Checking sign-in again… ')+String(error);timer=setTimeout(poll,5000)}}
    }
    timer=setTimeout(poll,5000)
  })
  add(t('更新會員狀態','Refresh membership'),refresh)
  add(t('官網／管理方案','Website / Manage plan'),async()=>{await api({action:'website'})})
  add(t('登出／取消登入','Sign out / Cancel sign-in'),async()=>{
    stop();select.value='local';saveProvider();badge.textContent='Local AI';details.hidden=true;localForm.hidden=false;changed()
    try{await api({action:'logout'})}finally{render({signedIn:false})}
  })
  details.append(privacy,state,controls);section.append(label,details)
  panel.querySelector('.agent-connection')!.prepend(section)
  select.onchange=()=>{saveProvider();changed();badge.textContent=select.value==='cloud'?t('wuffi 雲端 AI','wuffi Cloud AI'):'Local AI';details.hidden=select.value!=='cloud';localForm.hidden=select.value==='cloud';if(select.value==='cloud')void refresh()}
  window.addEventListener('beforeunload',stop,{once:true})
  return {provider:()=>select.value,refresh}
}

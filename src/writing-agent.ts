import {currentLanguage,translate} from './i18n'
import type {WritingAPI,WritingSnapshot,WritingAction} from './writing-api'
import type {Preferences} from './preferences'
import {installFloatingAgent} from './floating-agent'
import {installCloudAccount} from './cloud-account'
import {installDogCompanion} from './dog-companion'

export function installWritingAgent(api:WritingAPI,getPreferences:()=>Preferences){
  const en=()=>currentLanguage()==='en',t=(zh:string,english:string)=>en()?english:zh
  const entry=document.createElement('button');entry.className='agent-entry';entry.setAttribute('aria-expanded','false');entry.setAttribute('aria-controls','writing-agent');entry.setAttribute('aria-haspopup','dialog')
  const panel=document.createElement('aside');panel.id='writing-agent';panel.hidden=true;panel.dataset.stage='prompt';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-label',t('寫作協作','Writing collaborator'))
  panel.innerHTML=`<header><strong></strong><div><button data-agent="new" title="${t('開始新對話','New conversation')}">＋</button><button data-agent="connect" title="${t('AI 連線','AI connection')}">⋯</button><button data-agent="close" aria-label="${t('關閉協作','Close collaborator')}">×</button></div></header><section class="agent-connection" hidden><form><label>${t('服務位址','Base URL')}<input name="baseURL" type="url" required></label><label>${t('模型','Model')}<input name="model" required></label><div><button type="submit">${t('儲存連線','Save connection')}</button><button type="button" data-agent="test">${t('測試連線','Test connection')}</button></div><p class="connection-status" role="status"></p></form></section><div class="agent-thread" role="log" aria-live="polite"></div><form class="agent-composer"><label class="agent-scope-label">${t('本次參考','Context')} <select aria-label="${t('參考範圍','Context scope')}"><option value="document">${t('整篇文章','Whole document')}</option><option value="selection">${t('選取文字','Selection')}</option></select></label><textarea rows="3" aria-label="${t('告訴 AI 你的想法或需求','Your thoughts or request')}" placeholder="${t('一起想想，或告訴我想修改哪裡…','Think together, or tell me what to change…')}"></textarea><footer><button type="button" data-agent="functions">${t('功能','Actions')}</button><span class="agent-status" role="status"></span><button type="button" data-agent="stop" hidden>${t('停止','Stop')}</button><button type="submit">${t('送出','Send')}</button></footer></form><section class="agent-functions" hidden><input type="search" aria-label="${t('搜尋功能','Search actions')}" placeholder="${t('搜尋功能…','Search actions…')}"><div></div></section>`
  document.body.append(entry,panel)
  panel.querySelector('header strong')!.textContent='wuffi · '+t('一起寫','Write together')
  const thread=panel.querySelector<HTMLElement>('.agent-thread')!,form=panel.querySelector<HTMLFormElement>('.agent-composer')!,input=form.querySelector('textarea')!,scope=form.querySelector('select')!,status=panel.querySelector<HTMLElement>('.agent-status')!,connection=panel.querySelector<HTMLElement>('.agent-connection')!,connectionForm=connection.querySelector('form')!,connectionStatus=connection.querySelector<HTMLElement>('.connection-status')!,functions=panel.querySelector<HTMLElement>('.agent-functions')!
  input.rows=1
  const inputRow=document.createElement('div');inputRow.className='agent-input-row';input.before(inputRow);inputRow.append(input,form.querySelector<HTMLButtonElement>('[type=submit]')!)
  panel.querySelector('header>div')!.prepend(form.querySelector<HTMLButtonElement>('[data-agent=functions]')!)
  let history:{role:'user'|'assistant';content:string}[]=[],conversationDocument='',previousFocus:HTMLElement|null=null,busy=false,generation=0
  const floating=installFloatingAgent(entry,panel,animate=>open(animate))
  function labelEntry(){entry.title=t('拖曳可移動；點一下展開或收合 AI (Ctrl+J)','Drag to move; click to expand or collapse AI (Ctrl+J)');entry.setAttribute('aria-label',entry.title)}
  labelEntry();document.addEventListener('ui-language-change',labelEntry)
  installDogCompanion(entry,panel,()=>floating.place())
  function sizeInput(){input.style.height='auto';input.style.height=`${Math.min(128,Math.max(42,input.scrollHeight))}px`;floating.place()}
  input.addEventListener('input',sizeInput)
  function say(role:'user'|'assistant',text:string){panel.dataset.stage='conversation';const item=document.createElement('article');item.className='agent-message '+role;const label=document.createElement('small');label.textContent=role==='user'?t('你','You'):'AI';const body=document.createElement('div');body.className='agent-message-text';body.textContent=text;item.append(label,body);thread.append(item);requestAnimationFrame(()=>thread.scrollTop=thread.scrollHeight);return item}
  function intro(){thread.replaceChildren();panel.dataset.stage='prompt'}
  function pending(value:boolean){busy=value;entry.setAttribute('aria-busy',String(value));input.readOnly=value;form.querySelector<HTMLButtonElement>('[type=submit]')!.disabled=value;form.querySelector<HTMLButtonElement>('[data-agent=stop]')!.hidden=!value;status.textContent=value?t('正在思考…','Thinking…'):''}
  function cancel(){generation++;void window.desktop?.agentCancel();pending(false)}
  function close(animate=true){if(panel.hidden)return;floating.hide(animate);entry.setAttribute('aria-expanded','false');document.body.classList.remove('agent-open');if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true})}
  function open(animate=true){
    if(!panel.hidden){close(animate);return}
    previousFocus=document.activeElement as HTMLElement
    const snapshot=api.snapshot()
    if(conversationDocument!==snapshot.documentId){cancel();history=[];conversationDocument=snapshot.documentId;intro()}
    scope.value=snapshot.selection.from!==snapshot.selection.to?'selection':'document'
    floating.show(animate);entry.setAttribute('aria-expanded','true');document.body.classList.add('agent-open');sizeInput();input.focus({preventScroll:true})
  }
  function button(label:string,click:()=>void){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=click;return b}
  function undoSettings(patch:Record<string,unknown>,before:Preferences){
    const undo=button(t('復原設定','Undo setting'),()=>{void(async()=>{
      try{
        if(Object.keys(patch).some(key=>getPreferences()[key as keyof Preferences]!==patch[key]))throw Error(t('設定已再次變更，請直接提出新的調整需求','Settings have changed again. Please request a new adjustment.'))
        const keys=[...Object.keys(patch),...(patch.theme&&!('followSystem' in patch)?['followSystem']:[])]
        await api.apply({kind:'settings',values:Object.fromEntries(keys.map(key=>[key,before[key as keyof Preferences]]))},api.snapshot());undo.disabled=true
      }catch(error){say('assistant',error instanceof Error?error.message:String(error))}
    })()});return undo
  }
  function proposal(action:WritingAction,snapshot:WritingSnapshot,parent:HTMLElement){
    const card=document.createElement('section');card.className='agent-proposal'
    const title=document.createElement('strong');title.textContent=action.kind==='replace'?t('修改提案','Suggested edit'):action.kind==='settings'?t('設定提案','Suggested settings'):t('操作提案','Suggested action');card.append(title)
    if(action.kind==='replace'){
      const progress=document.createElement('p');progress.className='review-progress';progress.setAttribute('role','status')
      const show=button(t('查看內文建議','Review in document'),()=>{close();requestAnimationFrame(()=>document.querySelector('.inline-review')?.scrollIntoView({block:'center'}))})
      card.append(progress,show);parent.append(card)
      try{
        api.review(action,snapshot,(remaining,reason)=>{
          progress.textContent=reason==='pending'?t(`還有 ${remaining} 處建議，請在內文逐句接受或拒絕。`,`${remaining} suggestions remaining. Accept or reject each in the document.`):reason==='changed'?t('文章已變更，未處理的建議已取消，請重新提出修改。','The document changed. Remaining suggestions were cancelled; request a fresh revision.'):reason==='closed'?t('已離開編輯模式，未處理的建議已取消。','Review closed. Remaining suggestions were cancelled.'):reason==='replaced'?t('已由新的修改建議取代。','Replaced by a newer revision.'):t('沒有待處理的建議。已接受的修改可在文章中復原。','No suggestions remaining. Accepted edits can be undone in the editor.')
          show.hidden=remaining===0
        })
      }catch(error){progress.textContent=error instanceof Error?error.message:String(error);show.hidden=true}
      return
    }
    const description=document.createElement('pre');description.textContent=action.kind==='settings'?Object.entries(action.values).map(([key,value])=>`${translate(api.capabilities().preferences.find(p=>p.key===key)?.label||key)}: ${value}`).join('\n'):translate(api.capabilities().commands.find(c=>c.name===action.name)?.label||action.name);card.append(description)
    const controls=document.createElement('div');controls.className='proposal-controls'
    const apply=button(t('採用','Apply'),()=>{void(async()=>{
      try{
        apply.disabled=true;const before={...getPreferences()};await api.apply(action,snapshot)
        controls.replaceChildren(document.createTextNode(action.kind==='settings'?t('已套用設定','Settings applied'):t('已送出操作','Action dispatched')))
        if(action.kind==='settings')controls.append(undoSettings(action.values,before))
        history.push({role:'user',content:'[Author applied the proposed action.]'})
      }catch(error){apply.disabled=false;say('assistant',String(error instanceof Error?error.message:error))}
    })()})
    const discard=button(t('捨棄','Discard'),()=>{controls.replaceChildren(document.createTextNode(t('已捨棄','Discarded')));history.push({role:'user',content:'[Author discarded the proposed action.]'})})
    controls.append(apply,discard);card.append(controls);parent.append(card)
  }
  function localSettings(prompt:string):Record<string,unknown>|null{
    if(/[?？]|什麼|多少|為什麼|討論|解釋|建議|比較|會怎樣|why\b|what\b|how\b|discuss|explain|compare|suggest/i.test(prompt))return null
    const spacing=prompt.match(/(?:行距|line\s*(?:height|spacing))[^\d+\-]{0,12}([+-]?\d+(?:\.\d+)?)/i)
    const size=prompt.match(/(?:字級|字體大小|font\s*size)[^\d+\-]{0,12}([+-]?\d+(?:\.\d+)?)/i)
    return spacing||size?{...(spacing?{lineHeight:Number(spacing[1])}:{}),...(size?{fontSize:Number(size[1])}:{})}:null
  }
  form.onsubmit=event=>{event.preventDefault();void(async()=>{
    const prompt=input.value.trim();if(!prompt||busy)return
    const snapshot=api.snapshot()
    if(snapshot.documentId!==conversationDocument){cancel();history=[];conversationDocument=snapshot.documentId;intro()}
    if(scope.value==='selection'&&snapshot.selection.from===snapshot.selection.to){status.textContent=t('請先選取文章中的文字','Select a passage first');return}
    const requestedScope=scope.value
    say('user',prompt);input.value='';sizeInput();const current=++generation
    try{
      const patch=localSettings(prompt)
      if(patch){
        const before={...getPreferences()};await api.apply({kind:'settings',values:patch},snapshot)
        const answer=say('assistant',t('已調整：','Updated: ')+Object.entries(patch).map(([key,value])=>`${translate(api.capabilities().preferences.find(p=>p.key===key)?.label||key)} ${value}`).join(', '))
        answer.append(undoSettings(patch,before));history.push({role:'user',content:prompt},{role:'assistant',content:'Settings were applied: '+JSON.stringify(patch)});return
      }
      if(!window.desktop)throw Error(t('AI 協作需要桌面客戶端','AI collaboration requires the desktop app'))
      pending(true)
      const reply=api.validate(await window.desktop.agentRequest({provider:cloud.provider(),prompt,context:{...snapshot,markdown:requestedScope==='selection'?'':snapshot.markdown},scope:requestedScope,history:history.slice(-24),capabilities:api.capabilities(),preferences:getPreferences()}))
      if(current!==generation)return
      if(reply.actions.some(action=>action.kind==='replace'&&action.scope!==requestedScope))throw Error(t('AI 回覆的修改範圍與本次要求不符，已保留原文，請重新提出修改。','The AI returned a different edit scope. Your document is unchanged; request a fresh revision.'))
      const answer=say('assistant',reply.message);for(const action of reply.actions)proposal(action,snapshot,answer)
      history.push({role:'user',content:prompt},{role:'assistant',content:JSON.stringify(reply)})
      thread.scrollTop=thread.scrollHeight
    }catch(error){if(current===generation)say('assistant',error instanceof Error?error.message:String(error))}
    finally{if(current===generation){pending(false);if(cloud.provider()==='cloud')void cloud.refresh();if(!panel.hidden&&panel.contains(document.activeElement))input.focus()}}
  })()}
  input.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit()}}
  panel.querySelector<HTMLButtonElement>('[data-agent=close]')!.onclick=event=>close(event.detail>0)
  panel.querySelector<HTMLButtonElement>('[data-agent=stop]')!.onclick=cancel
  panel.querySelector<HTMLButtonElement>('[data-agent=new]')!.onclick=()=>{cancel();history=[];conversationDocument=api.snapshot().documentId;intro();input.focus()}
  const connectionValue=()=>({baseURL:(connectionForm.elements.namedItem('baseURL') as HTMLInputElement).value,model:(connectionForm.elements.namedItem('model') as HTMLInputElement).value})
  panel.querySelector<HTMLButtonElement>('[data-agent=connect]')!.onclick=()=>{connection.hidden=!connection.hidden;if(!connection.hidden)void window.desktop?.agentConnection().then(value=>{for(const key of ['baseURL','model'] as const)(connectionForm.elements.namedItem(key) as HTMLInputElement).value=value[key]}).catch(error=>connectionStatus.textContent=String(error))}
  connectionForm.onsubmit=e=>{e.preventDefault();void window.desktop?.agentConnection({action:'save',...connectionValue()}).then(()=>{connectionStatus.textContent=t('已儲存，只有送出訊息時才傳送文章','Saved. Document content is sent only when you send a message.')}).catch(error=>connectionStatus.textContent=String(error))}
  panel.querySelector<HTMLButtonElement>('[data-agent=test]')!.onclick=()=>{connectionStatus.textContent=t('正在連線…','Connecting…');void window.desktop?.agentConnection({action:'test',...connectionValue()}).then(value=>connectionStatus.textContent=value.models?.includes(connectionValue().model)?t('模型已就緒','Model ready'):t('服務可連線，但模型未出現在清單中','Connected, but the model is not listed')).catch(error=>connectionStatus.textContent=String(error))}
  const search=functions.querySelector('input')!,list=functions.querySelector('div')!
  function renderFunctions(){list.replaceChildren();const query=search.value.toLowerCase();for(const item of api.capabilities().commands.filter(c=>(c.name+' '+c.label+' '+translate(c.label)).toLowerCase().includes(query)))list.append(button(translate(item.label),()=>{functions.hidden=true;proposal({kind:'command',name:item.name},api.snapshot(),say('assistant',t('請確認要執行的操作','Review this action')))}))}
  panel.querySelector<HTMLButtonElement>('[data-agent=functions]')!.onclick=()=>{functions.hidden=!functions.hidden;if(!functions.hidden){renderFunctions();search.focus()}}
  search.oninput=renderFunctions
  document.addEventListener('keydown',event=>{if(event.isComposing)return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='j'){event.preventDefault();open(false)}else if(event.key==='Escape'&&!panel.hidden&&!document.querySelector('dialog[open]')&&!document.querySelector('#preferences:not([hidden])')){event.preventDefault();event.stopPropagation();close(false)}})
  const cloud=installCloudAccount(panel,()=>{cancel();history=[];intro()})
  intro();return {open,close}
}

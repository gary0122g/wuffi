import english from '../resources/locales/en.json'
const dictionary:Record<string,string>=english
export type Language='zh-TW'|'en'
let language:Language=localStorage.getItem('liubai.language')==='en'?'en':'zh-TW'
export const currentLanguage=()=>language
export function translate(text:string):string {
  if(language!=='en')return text
  if(text.startsWith('Error: '))return 'Error: '+translate(text.slice(7))
  if(dictionary[text]!==undefined)return dictionary[text]
  const review=text.match(/^還有 (\d+) 處建議，請在內文逐句接受或拒絕。$/);if(review)return `${review[1]} suggestions remaining. Accept or reject each in the document.`
  const clean=text.trim();if(dictionary[clean]!==undefined)return text.replace(clean,dictionary[clean])
  for(const [pattern,replacement] of [[/^(\d[\d,]*) 字$/,'$1 words'],[/^(\d+) 行$/,'$1 lines'],[/^(\d+) 分鐘前編輯$/,'Edited $1 minutes ago'],[/^(\d+) 小時前編輯$/,'Edited $1 hours ago'],[/^約 (\d+) 分鐘閱讀$/,'About $1 min read'],[/^資料夾全文搜尋 · (\d+) 筆$/,'Folder search · $1 results'],[/^(\d+) 欄 × (\d+) 列$/,'$1 columns × $2 rows']] as const)if(pattern.test(text))return text.replace(pattern,replacement)
  for(const key of Object.keys(dictionary).filter(k=>k.endsWith('：')||k==='匯出 '||k==='標題 '||k==='縮放 '||k==='展開／折疊 '))if(text.startsWith(key))return dictionary[key]+text.slice(key.length)
  const shortcut=text.split('/');if(shortcut.length>1&&shortcut.every(part=>dictionary[part]||!/[\u3400-\u9fff]/.test(part)))return shortcut.map(part=>dictionary[part]||part).join(' / ')
  const deleted=text.match(/^磁碟檔案已移除：(.*)，草稿仍保留$/);if(deleted)return `File removed from disk: ${deleted[1]}. The draft is kept.`
  const changed=text.match(/^(.*) 已由其他程式修改；目前未儲存的內容已保留$/);if(changed)return `${changed[1]} was modified by another application. Your unsaved changes are kept.`
  const removed=text.match(/^確定要移除「(.*)」的草稿？未儲存的修改將遺失，磁碟上的檔案會保留。$/);if(removed)return `Remove the draft “${removed[1]}”? Unsaved changes will be lost. The file on disk will be kept.`
  return text
}
const originals=new WeakMap<Text,{original:string;rendered:string}>()
const attributes=new WeakMap<Element,Map<string,{original:string;rendered:string}>>()
const contentSelector='.agent-thread,.ProseMirror,#source-code,#preview-content,#document-title,#seamless-document-title,.document-item-title,.document-item-date,.document-folder[data-user-content],.outline-item,#tree-list,.library-match strong,.library-match small'
const controlSelector='button,[role=button],.review-progress'
function translateText(text:Text){
  const parent=text.parentElement
  if(!parent||parent.closest('script,style,textarea')||parent.closest(contentSelector)&&!parent.closest(controlSelector))return
  // Document headings and file names are user content even when clickable.
  if(parent.closest('.document-item-title,.document-item-date,.document-folder[data-user-content],.outline-item,#tree-list,#seamless-document-title,.library-match strong,.library-match small'))return
  const previous=originals.get(text),original=previous&&text.data===previous.rendered?previous.original:text.data,rendered=translate(original)
  if(text.data!==rendered)text.data=rendered
  originals.set(text,{original,rendered})
}
function refresh(){
  observer.disconnect()
  // User content (a long article holds tens of thousands of nodes) is never
  // translated, so walk only its controls instead of every text node inside it.
  const containers:Element[]=[]
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode(node){
    if(node.nodeType===Node.TEXT_NODE)return NodeFilter.FILTER_ACCEPT
    const element=node as Element
    if(element.matches('script,style,textarea'))return NodeFilter.FILTER_REJECT
    if(element.matches(contentSelector)&&!element.closest(controlSelector)){containers.push(element);return NodeFilter.FILTER_REJECT}
    return NodeFilter.FILTER_SKIP
  }})
  let node:Node|null
  while((node=walker.nextNode()))translateText(node as Text)
  for(const container of containers)for(const control of container.querySelectorAll(controlSelector)){
    if(control.parentElement?.closest(controlSelector))continue // An outer control covers it.
    const texts=document.createTreeWalker(control,NodeFilter.SHOW_TEXT)
    while((node=texts.nextNode()))translateText(node as Text)
  }
  for(const element of document.querySelectorAll('[title],[aria-label],[placeholder]')){
    if(element.closest('.document-item-title,#tree-list,#seamless-document-title'))continue
    const records=attributes.get(element)||new Map()
    for(const name of ['title','aria-label','placeholder']){const value=element.getAttribute(name);if(value===null)continue;const previous=records.get(name),original=previous&&value===previous.rendered?previous.original:value,rendered=translate(original);if(value!==rendered)element.setAttribute(name,rendered);records.set(name,{original,rendered})}
    attributes.set(element,records)
  }
  // Rewriting lang, even with the same value, restyles the whole page.
  const lang=language==='en'?'en':'zh-Hant';if(document.documentElement.lang!==lang)document.documentElement.lang=lang
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']})
}
let scheduled=false
// The interface is written in Traditional Chinese, so only English needs a
// pass after the interface changes; switching back restores via setLanguage.
const observer=new MutationObserver(records=>{if(language!=='en'||records.every(record=>(record.target instanceof Element?record.target:record.target.parentElement)?.closest('.ProseMirror,#source-code,#preview-content')))return;if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;refresh()})}})
export function setLanguage(value:Language){language=value;localStorage.setItem('liubai.language',value);refresh();document.dispatchEvent(new Event('ui-language-change'));void window.desktop?.settings({action:'save',language:value})}
export function installLocalization(){refresh()}

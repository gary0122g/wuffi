let content:HTMLElement|undefined
let load:(()=>void)|undefined
export function registerAISettings(node:HTMLElement,onOpen:()=>void){content=node;load=onOpen}
export function mountAISettings(target:HTMLElement){
  if(!content){const message=document.createElement('p');message.textContent='AI 設定正在載入…';target.append(message);return}
  content.hidden=false;target.append(content);load?.()
}
export function openAISettings(){document.dispatchEvent(new Event('wuffi:open-ai-settings'))}

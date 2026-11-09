import { readPreferences } from './preferences'
import DOMPurify from 'dompurify'
let serial=0
export function renderDiagram(language:string,content:string,apply:(value:null|string|HTMLElement)=>void) {
  language=language.toLowerCase()
  if(!['mermaid','flow','flowchart','sequence'].includes(language)||!readPreferences().diagrams)return null
  const container=document.createElement('div');container.className='mermaid-preview';container.textContent='正在繪製圖表…'
  if(language!=='mermaid'){void import('./legacy-diagrams').then(module=>module.legacyDiagram(language,content)).then(svg=>{container.innerHTML=svg;apply(container.outerHTML)}).catch(error=>{container.className='diagram-error';container.textContent='圖表語法錯誤：'+String(error);apply(container.outerHTML)});return container}
  void import('mermaid').then(async({default:mermaid})=>{
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:false,flowchart:{htmlLabels:false},theme:(readPreferences().mermaidTheme==='auto'?(document.body.classList.contains('night')?'dark':'default'):readPreferences().mermaidTheme) as 'default'|'forest'|'dark'|'neutral',suppressErrorRendering:true})
    try { const result=await mermaid.render('diagram-'+(++serial),content);container.innerHTML=DOMPurify.sanitize(result.svg,{USE_PROFILES:{svg:true,svgFilters:true},ADD_TAGS:['foreignObject'],ADD_ATTR:['xmlns']});apply(container.outerHTML) }
    catch(error){container.className='diagram-error';container.textContent='圖表語法錯誤：'+String(error);apply(container.outerHTML)}
  }).catch(error=>{container.textContent=String(error);apply(container.outerHTML)})
  return container
}
export async function diagramsForDocument(markdown:string):Promise<string>{
  if(!readPreferences().diagrams)return markdown
  const matches=[...markdown.matchAll(/^(`{3,}|~{3,})(mermaid|flow|flowchart|sequence)[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm)]
  for(const match of matches){
    const html=await new Promise<string>(resolve=>renderDiagram(match[2],match[3],value=>resolve(typeof value==='string'?value:value?.outerHTML||'')))
    const container=document.createElement('div');container.innerHTML=html;const svg=container.querySelector('svg');if(!svg)throw Error(container.textContent||'無法匯出圖表')
    const box=svg.getAttribute('viewBox')?.split(/[ ,]+/).map(Number)||[0,0,800,600],width=Math.max(1,Math.ceil(box[2]||800)),height=Math.max(1,Math.ceil(box[3]||600));svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));svg.setAttribute('xmlns','http://www.w3.org/2000/svg')
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}))
    try{const img=new Image();img.src=url;await img.decode();const scale=Math.min(2,4096/width,4096/height),canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);const context=canvas.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);markdown=markdown.replace(match[0],`![圖表](${canvas.toDataURL('image/png')})`)}finally{URL.revokeObjectURL(url)}
  }
  return markdown
}

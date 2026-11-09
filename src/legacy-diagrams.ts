import DOMPurify from 'dompurify'
import { readPreferences } from './preferences'
let loaded:Promise<void>|undefined
const script=(name:string)=>new Promise<void>((resolve,reject)=>{const element=document.createElement('script');element.src=new URL('vendor/sequence/'+name,document.baseURI).href;element.onload=()=>resolve();element.onerror=()=>reject(Error('無法載入序列圖元件：'+name));document.head.append(element)})
function sequenceLibrary(){return loaded??=(async()=>{for(const name of ['webfont.js','snap.svg-min.js','underscore-min.js','sequence-diagram-min.js'])await script(name)})()}
export async function legacyDiagram(language:string,source:string){
  const host=document.createElement('div');host.style.cssText='position:fixed;left:-20000px;top:0;visibility:hidden';document.body.append(host)
  try{
    await document.fonts.ready
    if(language==='sequence'){
      await sequenceLibrary()
      const diagram=(window as any).Diagram.parse(source)
      await new Promise<void>((resolve,reject)=>{let timer:number;const observer=new MutationObserver(()=>{if(host.querySelector('svg text')){observer.disconnect();clearTimeout(timer);resolve()}});observer.observe(host,{childList:true,subtree:true});timer=window.setTimeout(()=>{observer.disconnect();reject(Error('序列圖排版逾時'))},10000);try{diagram.drawSVG(host,{theme:readPreferences().sequenceTheme,'font-family':'Consolas, monospace','font-size':16})}catch(error){observer.disconnect();clearTimeout(timer);reject(error)}})
    }else{
      const {default:flowchart}=await import('flowchart.js'),night=document.body.classList.contains('night')
      flowchart.parse(source).drawSVG(host,{'font-size':16,'line-width':2,'font-color':night?'#dedede':'#333','line-color':night?'#aaa':'#333','element-color':night?'#aaa':'#333',fill:night?'#363b40':'#fff','yes-text':'yes','no-text':'no'})
    }
    const svg=host.querySelector('svg');if(!svg)throw Error('圖表沒有產生 SVG')
    if(!svg.getAttribute('viewBox'))svg.setAttribute('viewBox',`0 0 ${parseFloat(svg.getAttribute('width')||'800')} ${parseFloat(svg.getAttribute('height')||'600')}`)
    svg.setAttribute('xmlns','http://www.w3.org/2000/svg')
    if(language==='sequence'&&document.body.classList.contains('night'))for(const element of svg.querySelectorAll<SVGElement>('[fill],[stroke]'))for(const key of ['fill','stroke']){const value=element.getAttribute(key);if(value==='#000'||value==='#000000'||value==='black')element.setAttribute(key,'#dedede');if(value==='#fff'||value==='#ffffff'||value==='white')element.setAttribute(key,'#363b40')}
    return DOMPurify.sanitize(svg.outerHTML,{USE_PROFILES:{svg:true,svgFilters:true},ADD_ATTR:['xmlns']})
  }finally{host.remove()}
}

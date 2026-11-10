import { $prose,$remark } from '@milkdown/kit/utils'
import { Plugin } from '@milkdown/kit/prose/state'
import { codeBlockConfig } from '@milkdown/kit/component/code-block'
import { openInlineSource } from './inline-source'
import { readPreferences } from './preferences'
import { previewCache } from './preview-cache'
let engine:Promise<typeof import('./math-renderer')>|undefined
export async function renderMath(source:string,display=true,format:'svg'|'mathml'='svg'){const module=await(engine??=import('./math-renderer'));return module.mathSVG(source,display,readPreferences().mathPhysics,format)}
// Typeset formulas survive Milkdown rebuilding a block that scrolled back into
// view. A cached block needs no new batch pass, so it does not announce itself.
const typeset=previewCache()
const mathKey=(source:string)=>{const prefs=readPreferences();return prefs.mathPhysics+'\0'+prefs.mathNumbering+'\0'+source}
function preview(source:string,apply:(html:string)=>void){const cached=typeset.get(mathKey(source));if(cached!==undefined)return cached;const placeholder=document.createElement('div');placeholder.className='mathjax-preview';placeholder.textContent='正在排版公式…';void renderMath(source).then(html=>{apply('<div class="mathjax-preview">'+html+'</div>');requestAnimationFrame(()=>document.dispatchEvent(new Event('formula-preview-ready')))}).catch(error=>{placeholder.textContent=String(error);apply(placeholder.outerHTML)});return placeholder}
export const advancedMath=$prose(ctx=>{
  const config=ctx.get(codeBlockConfig.key),previous=config.renderPreview
  config.renderPreview=(language,content,apply)=>{if(language.toLowerCase()==='latex'||(language.toLowerCase()==='math'&&readPreferences().codeMath))return preview(content,apply);return previous(language,content,apply)}
  return new Plugin({
    props:{nodeViews:{math_inline(node,view,getPos){const dom=document.createElement('span');dom.dataset.type='math_inline';dom.setAttribute('role','math');let current='';const update=(value:string)=>{current=value;dom.dataset.value=value;dom.textContent=value;void renderMath(value,false).then(html=>{if(current===value)dom.innerHTML=html}).catch(error=>{if(current===value)dom.textContent=String(error)})};update(node.attrs.value);dom.addEventListener('mousedown',event=>{if(event.button!==0||!view.editable)return;event.preventDefault();event.stopPropagation();const pos=getPos();if(typeof pos!=='number')return;view.dom.dispatchEvent(new Event('editor-change',{bubbles:true}));openInlineSource(view,pos,pos+1,'$'+current+'$','open',1)});return{dom,update(next){if(next.type.name!=='math_inline')return false;if(next.attrs.value!==current)update(next.attrs.value);return true},ignoreMutation:()=>true}}}},
    // Typing elsewhere must not re-typeset every formula: MathJax runs only when a
    // formula or a math preference changes. Rebuilt node views get the cached result.
    view(view){let timer:number,generation=0,destroyed=false,signature='',rendered:string[]=[],shown=new WeakMap<HTMLElement,Element|null>()
      const refresh=()=>{clearTimeout(timer);const revision=++generation;timer=window.setTimeout(async()=>{
        const nodes:{source:string;display:boolean;pos:number}[]=[];view.state.doc.descendants((node,pos)=>{if(node.type.name==='math_inline')nodes.push({source:node.attrs.value,display:false,pos});else if(node.type.name==='code_block'&&(String(node.attrs.language).toLowerCase()==='latex'||String(node.attrs.language).toLowerCase()==='math'&&readPreferences().codeMath))nodes.push({source:node.textContent,display:true,pos})})
        if(!nodes.length)return
        const prefs=readPreferences(),key=[prefs.mathPhysics,prefs.mathNumbering,prefs.mathLineBreaks,...nodes.map(node=>(node.display?'D':'I')+node.source)].join('\0')
        if(key!==signature){
          const module=await(engine??=import('./math-renderer')),html=module.mathBatch(nodes,prefs.mathPhysics,prefs.mathNumbering)
          if(destroyed||revision!==generation)return
          signature=key;rendered=html;shown=new WeakMap()
        }
        const html=rendered
        nodes.forEach((node,index)=>{if(node.display)typeset.set(mathKey(node.source),'<div class="mathjax-preview">'+html[index]+'</div>');const dom=view.nodeDOM(node.pos);if(!(dom instanceof HTMLElement))return;const target=node.display?dom.querySelector<HTMLElement>('.preview'):dom;if(target&&shown.has(target)&&shown.get(target)===target.firstElementChild&&target.firstElementChild?.isConnected)return;if(node.display){if(target)target.innerHTML='<div class="mathjax-preview">'+html[index]+'</div>';if(dom.dataset.mathNumber!==String(index))dom.dataset.mathNumber=String(index)}else dom.innerHTML=html[index];if(target)shown.set(target,target.firstElementChild)})
      },30)}
      document.addEventListener('formula-preview-ready',refresh);refresh();return{update(current,previous){if(current.state.doc!==previous.doc)refresh()},destroy(){destroyed=true;clearTimeout(timer);document.removeEventListener('formula-preview-ready',refresh)}}
    },
  })
})
export function latexDelimiters(source:string){
  let fence='';return source.split('\n').map(line=>{const match=line.match(/^\s*(`{3,}|~{3,})/);if(match){if(!fence)fence=match[1][0];else if(fence===match[1][0])fence='';return line}if(fence)return line;return line.split(/(`+[^`]*`+)/g).map((part,index)=>index%2?part:part.replace(/(?<!\\)\\\((.*?)\\\)/g,'$ $1 $').replace(/(?<!\\)\\\[/g,()=> '$$').replace(/(?<!\\)\\\]/g,()=> '$$')).join('')}).join('\n')
}
export const mathDelimiters=$remark('latexDelimiters',()=>function(this:any){
  const parser=this.parser;if(typeof parser==='function')this.parser=(text:string,file:unknown)=>{const enabled=readPreferences().latexDelimiters,tree=parser(enabled?latexDelimiters(text):text,file);{const visit=(node:any)=>{for(const child of node.children||[]){const raw=text.slice(child.position?.start.offset,child.position?.end.offset),match=raw.match(/^\\\[([\s\S]*?)\\\]$/);if(enabled&&child.type==='paragraph'&&match){child.type='math';child.value=match[1].trim();delete child.children}else if(child.type==='inlineMath'&&!readPreferences().mathLegacy&&raw.startsWith('$')&&(/^[\$]+[ \t]|[ \t\\]\$$/.test(raw)||/\d/.test(text.charAt(child.position.end.offset)))){child.type='text';child.value=raw}else visit(child)}};visit(tree)}return tree}
})
export async function renderExportMath(fragment:HTMLElement){
  const entries:{element:Element;source:string;display:boolean;code:boolean}[]=[]
  for(const math of fragment.querySelectorAll('math,span.math:not(:has(math)),pre.math code,pre code.language-math')){
    const code=math.tagName==='CODE';if(code&&!readPreferences().codeMath)continue
    const source=math.getAttribute('data-wuffi-tex')||math.querySelector('annotation[encoding="application/x-tex"]')?.textContent||(math.matches('span.math')?(math.textContent||'').replace(/^\$\$?|\$\$?$/g,''):code?math.textContent:'');if(!source)continue
    entries.push({element:math,source,display:code||math.getAttribute('display')==='block'||math.classList.contains('display'),code})
  }
  const module=await(engine??=import('./math-renderer')),prefs=readPreferences(),rendered=module.mathBatch(entries,prefs.mathPhysics,prefs.mathNumbering,prefs.mathExport==='mathml'?'mathml':'svg')
  entries.forEach((entry,index)=>{const wrapper=document.createElement(entry.display?'div':'span');wrapper.className='export-math';wrapper.innerHTML=rendered[index];if(entry.code)entry.element.closest('pre')!.replaceWith(wrapper);else entry.element.replaceWith(wrapper)})
}

import { inlineSource,openInlineSource } from './inline-source'
import { $nodeSchema, $markSchema, $remark, $prose } from '@milkdown/kit/utils'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import frontmatter from 'remark-frontmatter'
import { serializerCtx } from '@milkdown/kit/core'

export const yamlRemark = $remark('yamlSyntax', () => frontmatter, ['yaml'])
export const yamlNode = $nodeSchema('yaml', () => ({
  group:'block',content:'text*',code:true,defining:true,marks:'',
  parseDOM:[{tag:'pre[data-yaml]'}],toDOM:()=>['pre',{'data-yaml':'true',class:'yaml-block'},['code',0]],
  parseMarkdown:{match:n=>n.type==='yaml',runner:(s,n,t)=>{s.openNode(t);if(n.value)s.addText(String(n.value));s.closeNode()}},
  toMarkdown:{match:n=>n.type.name==='yaml',runner:(s,n)=>{s.addNode('yaml',undefined,n.textContent)}},
}))
export const footnoteNode = $nodeSchema('footnote_definition',()=>({
  group:'block',content:'block+',defining:true,attrs:{identifier:{default:'1'},label:{default:'1'}},
  parseDOM:[{tag:'section[data-footnote]',getAttrs:el=>({identifier:(el as HTMLElement).dataset.footnote,label:(el as HTMLElement).dataset.footnote})}],
  toDOM:n=>['section',{'data-footnote':n.attrs.identifier,class:'footnote-definition'},0],
  parseMarkdown:{match:n=>n.type==='footnoteDefinition',runner:(s,n,t)=>{s.openNode(t,{identifier:n.identifier,label:n.label||n.identifier});s.next(n.children);s.closeNode()}},
  toMarkdown:{match:n=>n.type.name==='footnote_definition',runner:(s,n)=>{s.openNode('footnoteDefinition',undefined,{...n.attrs});s.next(n.content);s.closeNode()}},
}))
export const footnoteReference = $nodeSchema('footnote_reference',()=>({
  group:'inline',inline:true,atom:true,attrs:{identifier:{default:'1'},label:{default:'1'}},
  parseDOM:[{tag:'sup[data-footnote-ref]',getAttrs:el=>({identifier:(el as HTMLElement).dataset.footnoteRef,label:(el as HTMLElement).dataset.footnoteRef})}],
  toDOM:n=>['sup',{'data-footnote-ref':n.attrs.identifier,class:'footnote-reference'},String(n.attrs.label)],
  parseMarkdown:{match:n=>n.type==='footnoteReference',runner:(s,n,t)=>{s.addNode(t,{identifier:n.identifier,label:n.label||n.identifier})}},
  toMarkdown:{match:n=>n.type.name==='footnote_reference',runner:(s,n)=>{s.addNode('footnoteReference',undefined,undefined,{...n.attrs})}},
}))
export const referenceDefinition = $nodeSchema('reference_definition',()=>({
  group:'block',atom:true,attrs:{identifier:{default:''},label:{default:''},url:{default:''},title:{default:null}},
  parseDOM:[{tag:'div[data-reference]'}],toDOM:n=>['div',{'data-reference':n.attrs.identifier,class:'reference-definition'},`[${n.attrs.label}]: ${n.attrs.url}${n.attrs.title?' "'+n.attrs.title+'"':''}`],
  parseMarkdown:{match:n=>n.type==='definition',runner:(s,n,t)=>{s.addNode(t,{identifier:n.identifier,label:n.label||n.identifier,url:n.url,title:n.title||null})}},
  toMarkdown:{match:n=>n.type.name==='reference_definition',runner:(s,n)=>{s.addNode('definition',undefined,undefined,{...n.attrs})}},
}))
export const referenceMark = $markSchema('reference_link',()=>({
  attrs:{identifier:{default:''},label:{default:''},referenceType:{default:'full'}},
  parseDOM:[{tag:'a[data-reference]'}],toDOM:m=>['a',{'data-reference':m.attrs.identifier,class:'reference-link'},0],
  parseMarkdown:{match:n=>n.type==='linkReference',runner:(s,n,t)=>{s.openMark(t,{identifier:n.identifier,label:n.label||n.identifier,referenceType:n.referenceType});s.next(n.children);s.closeMark(t)}},
  toMarkdown:{match:m=>m.type.name==='reference_link',runner:(s,m)=>{s.withMark(m,'linkReference',undefined,{...m.attrs})}},
}))
export const referenceImage=$nodeSchema('reference_image',()=>({
  group:'inline',inline:true,atom:true,attrs:{identifier:{default:''},label:{default:''},referenceType:{default:'full'},alt:{default:''}},
  parseDOM:[{tag:'img[data-reference-image]',getAttrs:el=>({identifier:(el as HTMLElement).dataset.referenceImage,alt:(el as HTMLImageElement).alt})}],
  toDOM:n=>['img',{'data-reference-image':n.attrs.identifier,alt:n.attrs.alt}],
  parseMarkdown:{match:n=>n.type==='imageReference',runner:(s,n,t)=>{s.addNode(t,{identifier:n.identifier,label:n.label||n.identifier,referenceType:n.referenceType,alt:n.alt||''})}},
  toMarkdown:{match:n=>n.type.name==='reference_image',runner:(s,n)=>{s.addNode('imageReference',undefined,undefined,{...n.attrs})}},
}))
export const tocRemark=$remark('tableOfContents',()=>function(this:any){
  const data=this.data();data.toMarkdownExtensions=[...(data.toMarkdownExtensions||[]),{handlers:{toc:()=> '[TOC]'}}]
  return (tree:any)=>{for(const node of tree.children||[])if(node.type==='paragraph' && node.children?.length===1 && /^\[toc\]$/i.test(node.children[0].value||'')){node.type='toc';delete node.children}}
})
export const tocNode=$nodeSchema('toc',()=>({
  group:'block',atom:true,parseDOM:[{tag:'nav[data-toc]'}],toDOM:()=>['nav',{'data-toc':'true',class:'document-toc'}],
  parseMarkdown:{match:n=>n.type==='toc',runner:(s,_n,t)=>{s.addNode(t)}},
  toMarkdown:{match:n=>n.type.name==='toc',runner:(s)=>{s.addNode('toc')}},
}))
export const commentRemark=$remark('markdownComments',()=>()=>function visit(node:any){for(const child of node.children||[]){if(child.type==='html'&&/^<!--[\s\S]*-->$/.test(child.value||'')){child.type=node.type==='paragraph'?'inline_comment':'block_comment';child.value=child.value.slice(4,-3)}visit(child)}})
export const comments=['inline_comment','block_comment'].map(name=>$nodeSchema(name,()=>({
  group:name==='inline_comment'?'inline':'block',inline:name==='inline_comment',content:'text*',code:true,marks:'',
  parseDOM:[{tag:name==='inline_comment'?'span[data-comment]':'pre[data-comment]'}],toDOM:()=>[name==='inline_comment'?'span':'pre',{'data-comment':'true',class:'markdown-comment'},0],
  parseMarkdown:{match:n=>n.type===name,runner:(s,n,t)=>{s.openNode(t);if(n.value)s.addText(String(n.value));s.closeNode()}},
  toMarkdown:{match:n=>n.type.name===name,runner:(s,n)=>{s.addNode('html',undefined,'<!--'+n.textContent+'-->')}},
})))
export const alerts=$prose(()=>new Plugin({props:{decorations(state){const decorations:Decoration[]=[];state.doc.descendants((node,pos)=>{if(node.type.name!=='blockquote')return;const match=node.firstChild?.textContent.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/);if(!match)return;decorations.push(Decoration.node(pos,pos+node.nodeSize,{'data-alert':match[1].toLowerCase(),class:'markdown-alert'}));decorations.push(Decoration.inline(pos+2,pos+2+match[0].length,{class:'alert-marker'}))});return DecorationSet.create(state.doc,decorations)}}}))
export const alertSerialization=$remark('alertSerialization',()=>function(this:any){const data=this.data();data.toMarkdownExtensions=[...(data.toMarkdownExtensions||[]),{handlers:{blockquote(node:any,_parent:any,state:any,info:any){const exit=state.enter('blockquote');const tracker=state.createTracker(info);tracker.move('> ');tracker.shift(2);let value=state.containerFlow(node,tracker.current());value=value.replace(/^\\\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/,'[!$1]');value=state.indentLines(value,(_line:string,_index:number,blank:boolean)=>(blank?'>':'> ')+_line);exit();return value}}}]})
let resolveReferenceImage:(src:string)=>Promise<string>=async src=>src
export function setReferenceImageResolver(resolve:(src:string)=>Promise<string>){resolveReferenceImage=resolve}
export const documentExtras=$prose(()=>new Plugin({
  view(view){
    const refresh=()=>{
      const headings:{text:string;level:number;pos:number}[]=[]
      view.state.doc.descendants((node,pos)=>{if(node.type.name==='heading')headings.push({text:node.textContent,level:node.attrs.level,pos})})
      const definitions=new Map<string,string>();view.state.doc.descendants(node=>{if(node.type.name==='reference_definition')definitions.set(node.attrs.identifier,String(node.attrs.url))})
      for(const link of view.dom.querySelectorAll<HTMLAnchorElement>('a[data-reference]')){const url=definitions.get(link.dataset.reference||'');if(url&&/^(https?:|mailto:|#)/i.test(url))link.href=url}
      for(const img of view.dom.querySelectorAll<HTMLImageElement>('img[data-reference-image]')){const url=definitions.get(img.dataset.referenceImage||'');if(url&&img.dataset.resolving!==url){img.dataset.resolving=url;void resolveReferenceImage(url).then(resolved=>{if(img.isConnected&&img.dataset.resolving===url&&/^(https?:|data:image\/|file:|liubai:)/i.test(resolved))img.src=resolved}).catch(()=>{img.removeAttribute('src')})}}
      for(const toc of view.dom.querySelectorAll<HTMLElement>('[data-toc]')){toc.contentEditable='false';toc.replaceChildren();for(const heading of headings){const link=document.createElement('a');link.textContent=heading.text;link.style.paddingLeft=`${(heading.level-1)*18}px`;link.href='#';link.onclick=event=>{event.preventDefault();view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(heading.pos+1))).scrollIntoView());view.focus()};toc.append(link)}}
    }
    refresh();return {update(current,previous){if(current.state.doc!==previous.doc)refresh()}}
  },
  props:{handleDoubleClickOn(view,pos,node){
    if(node.type.name!=='reference_definition'||!view.editable)return false
    const dialog=document.createElement('dialog');dialog.className='utility-dialog';const form=document.createElement('form'),heading=document.createElement('h2');heading.textContent='參照連結';form.append(heading)
    const fields:Record<string,HTMLInputElement>={};for(const [name,label]of [['label','名稱'],['url','網址'],['title','標題']]){const input=document.createElement('input');input.value=node.attrs[name]||'';input.placeholder=label;input.setAttribute('aria-label',label);fields[name]=input;form.append(input)}
    const save=document.createElement('button');save.textContent='確定';save.type='submit';const cancel=document.createElement('button');cancel.textContent='取消';cancel.type='button';cancel.onclick=()=>dialog.close();form.append(save,cancel);form.onsubmit=e=>{e.preventDefault();const label=fields.label.value.trim(),identifier=label.replace(/\s+/g,' ').toLowerCase();if(!identifier)return;const tr=view.state.tr.setNodeMarkup(pos,undefined,{identifier,label,url:fields.url.value,title:fields.title.value||null});if(identifier!==node.attrs.identifier){view.state.doc.descendants((child,at)=>{if(child.type.name==='reference_image'&&child.attrs.identifier===node.attrs.identifier)tr.setNodeMarkup(at,undefined,{...child.attrs,identifier,label,referenceType:'full'});for(const mark of child.marks){if(mark.type.name==='reference_link'&&mark.attrs.identifier===node.attrs.identifier){tr.removeMark(at,at+child.nodeSize,mark);tr.addMark(at,at+child.nodeSize,mark.type.create({...mark.attrs,identifier,label,referenceType:'full'}))}}})}view.dispatch(tr);dialog.close();view.focus()};dialog.append(form);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();return true
  },handleClick(view,_pos,event){const ref=(event.target as HTMLElement).closest<HTMLElement>('[data-footnote-ref]');if(!ref)return false;let target=-1;view.state.doc.descendants((node,pos)=>{if(node.type.name==='footnote_definition' && node.attrs.identifier===ref.dataset.footnoteRef)target=pos});if(target<0)return false;view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(target+1))).scrollIntoView());return true}},
}))
export const activeSyntax=$prose(ctx=>new Plugin({
  props:{handleDOMEvents:{click(view,event){
    const marker=(event.target as HTMLElement).closest<HTMLElement>('.inline-syntax');if(!marker||!view.editable)return false
    const from=Number(marker.dataset.from),to=Number(marker.dataset.to),schema=view.state.schema
    const fragment=view.state.doc.slice(from,to).content,source=ctx.get(serializerCtx)(schema.nodes.doc.create(null,schema.nodes.paragraph.create(null,fragment))).trimEnd()
    openInlineSource(view,from,to,source,marker.dataset.side||'open');event.preventDefault();return true
  }},decorations(state){
    if(!state.selection.empty)return null
    const {$from}=state.selection, decorations:Decoration[]=[]
    if(!$from.parent.isTextblock || $from.parent.type.spec.code)return null
    const start=$from.start(), end=$from.end()
    const markers:Record<string,[string,string]>={syntax_sub:['~','~'],syntax_sup:['^','^'],syntax_mark:['==','=='],strong:['**','**'],emphasis:['*','*'],strike_through:['~~','~~'],inlineCode:['`','`'],html_u:['<u>','</u>'],html_sub:['<sub>','</sub>'],html_sup:['<sup>','</sup>'],html_mark:['<mark>','</mark>']}
    const widget=(text:string,from:number,to:number,side:string)=>()=>{const span=document.createElement('span');span.className='inline-syntax';span.textContent=text;span.dataset.from=String(from);span.dataset.to=String(to);span.dataset.side=side;span.title='編輯 Markdown 標記';return span}
    const ranges=new Set<string>()
    state.doc.nodesBetween(start,end,(node,pos)=>{if(!node.isText || pos>state.selection.from || pos+node.nodeSize<state.selection.from)return;for(const mark of node.marks){const pair=markers[mark.type.name];if(!pair)continue;let from=pos,to=pos+node.nodeSize;let changed=true;while(changed){changed=false;$from.parent.forEach((sibling,offset)=>{const at=start+offset;if(sibling.isText&&mark.isInSet(sibling.marks)&&at<=to&&at+sibling.nodeSize>=from){const lo=Math.min(from,at),hi=Math.max(to,at+sibling.nodeSize);if(lo!==from||hi!==to){changed=true;from=lo;to=hi}}})}const key=mark.type.name+':'+from+':'+to;if(ranges.has(key))continue;ranges.add(key);decorations.push(Decoration.widget(from,widget(pair[0],from,to,'open'),{side:-1}),Decoration.widget(to,widget(pair[1],from,to,'close'),{side:1}))}})
    return DecorationSet.create(state.doc,decorations)
  }},
}))
export const markdownExtensions=[yamlRemark,yamlNode,footnoteNode,footnoteReference,referenceDefinition,referenceMark,referenceImage,tocRemark,tocNode,commentRemark,...comments,alerts,alertSerialization,documentExtras,inlineSource,activeSyntax]

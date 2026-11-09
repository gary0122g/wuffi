import { $prose } from '@milkdown/kit/utils'
import { Plugin,PluginKey,TextSelection } from '@milkdown/kit/prose/state'
import { Decoration,DecorationSet,type EditorView } from '@milkdown/kit/prose/view'
import { parserCtx,serializerCtx,editorViewCtx } from '@milkdown/kit/core'
import type { Fragment } from '@milkdown/kit/prose/model'
import type { Ctx } from '@milkdown/kit/ctx'
type Range={from:number;to:number;original:Fragment}
const key=new PluginKey<Range|null>('inline-source')
function finish(ctx:Ctx,view:EditorView,cancel=false){
  const range=key.getState(view.state);if(!range)return false
  const raw=view.state.doc.textBetween(range.from,range.to),doc=ctx.get(parserCtx)(raw)
  const content=cancel?range.original:doc.childCount===1&&doc.firstChild?.isTextblock?doc.firstChild.content:raw?view.state.schema.text(raw):[]
  const tr=view.state.tr.replaceWith(range.from,range.to,content).setMeta(key,{close:true})
  view.dispatch(tr);return true
}
export function openInlineSource(view:EditorView,from:number,to:number,source:string,side:string,offset?:number){
  const original=view.state.doc.slice(from,to).content
  const tr=view.state.tr.replaceWith(from,to,view.state.schema.text(source)).setMeta(key,{open:{from,to:from+source.length,original}})
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc,offset===undefined?(side==='open'?from:from+source.length):from+offset)));view.focus()
}
// Serialize a parsed copy while the live document keeps real, editable delimiters.
export function inlineDocument(ctx:Ctx){
  const view=ctx.get(editorViewCtx),range=key.getState(view.state)
  if(!range)return view.state.doc
  const raw=view.state.doc.textBetween(range.from,range.to),doc=ctx.get(parserCtx)(raw)
  const content=doc.childCount===1&&doc.firstChild?.isTextblock?doc.firstChild.content:raw?view.state.schema.text(raw):[]
  return view.state.tr.replaceWith(range.from,range.to,content).doc
}
export const inlineSource=$prose(ctx=>new Plugin<Range|null>({
  key,
  state:{init:()=>null,apply(tr,range){const meta=tr.getMeta(key);if(meta?.close)return null;if(meta?.open)return meta.open;if(!range)return null;const from=tr.mapping.map(range.from,-1),to=tr.mapping.map(range.to,1);if(from>=to||!tr.doc.resolve(from).sameParent(tr.doc.resolve(to)))return null;return {...range,from,to}}},
  view(view){let queued=false;return{update(){const range=key.getState(view.state);if(!range||view.composing||queued)return;const selection=view.state.selection;if(selection.from<range.from||selection.to>range.to){queued=true;queueMicrotask(()=>{queued=false;if(!view.isDestroyed)finish(ctx,view)})}},destroy(){queued=false}}},
  props:{
    handleKeyDown(view,event){
      if(view.composing||event.isComposing||!view.editable)return false
      if(!key.getState(view.state)){
        const selection=view.state.selection
        if(!selection.empty||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey||!['ArrowLeft','ArrowRight'].includes(event.key))return false
        const {$from}=selection,node=event.key==='ArrowLeft'?$from.nodeAfter:$from.nodeBefore
        if(node?.type.name==='math_inline'){const from=event.key==='ArrowLeft'?selection.from:selection.from-node.nodeSize,source='$'+node.attrs.value+'$';view.dom.dispatchEvent(new Event('editor-change',{bubbles:true}));openInlineSource(view,from,from+node.nodeSize,source,'open',event.key==='ArrowLeft'?1:source.length-1);event.preventDefault();return true}
        const mark=node?.marks.find(mark=>/^(strong|emphasis|strike_through|inlineCode|html_(u|sub|sup|mark)|syntax_(sub|sup|mark))$/.test(mark.type.name))
        if(!mark)return false
        let from=selection.from,to=selection.from,changed=true
        while(changed){changed=false;$from.parent.forEach((child,offset)=>{const at=$from.start()+offset;if(child.isText&&mark.isInSet(child.marks)&&at<=to&&at+child.nodeSize>=from){const low=Math.min(from,at),high=Math.max(to,at+child.nodeSize);if(low!==from||high!==to){from=low;to=high;changed=true}}})}
        if(event.key==='ArrowLeft'?selection.from!==from:selection.from!==to)return false
        const fragment=view.state.doc.slice(from,to).content,schema=view.state.schema,source=ctx.get(serializerCtx)(schema.nodes.doc.create(null,schema.nodes.paragraph.create(null,fragment))).trimEnd()
        const opening=source.match(/^(?:[*_~`^=]+|<[^>]+>)/)?.[0].length||1,closing=source.match(/(?:[*_~`^=]+|<\/[^>]+>)$/)?.[0].length||1
        openInlineSource(view,from,to,source,event.key==='ArrowLeft'?'open':'close',event.key==='ArrowLeft'?Math.max(0,opening-1):Math.min(source.length,source.length-closing+1));event.preventDefault();return true
      }
      if(event.key==='Escape'||event.key==='Enter'){event.preventDefault();return finish(ctx,view,event.key==='Escape')}return false
    },
    handleDOMEvents:{blur(view){if(!view.composing)finish(ctx,view);return false}},
    decorations(state){const range=key.getState(state);if(!range)return null;const decorations=[Decoration.inline(range.from,range.to,{class:'inline-source-active'})],raw=state.doc.textBetween(range.from,range.to)
      for(const match of raw.matchAll(/(\$|\*\*|__|~~|`|\*|_)([^\n]+?)\1/g)){const start=range.from+match.index!,size=match[1].length,end=start+match[0].length;decorations.push(Decoration.inline(start,start+size,{class:'inline-source-delimiter'}),Decoration.inline(end-size,end,{class:'inline-source-delimiter'}));const kind=size===2&&match[1]!=='~~'?'strong':match[1]==='~~'?'strike':['`','$'].includes(match[1])?'code':'em';decorations.push(Decoration.inline(start+size,end-size,{class:'inline-source-'+kind}))}
      return DecorationSet.create(state.doc,decorations)
    },
  },
}))

export function inlineMarkdown(ctx:Ctx){return ctx.get(serializerCtx)(inlineDocument(ctx))}

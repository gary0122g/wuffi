import {$prose} from '@milkdown/kit/utils'
import {Plugin,PluginKey} from '@milkdown/kit/prose/state'
import {Decoration,DecorationSet,type EditorView} from '@milkdown/kit/prose/view'
import {Slice,type Node as PMNode} from '@milkdown/kit/prose/model'
import {closeHistory} from '@milkdown/kit/prose/history'
import {changedPairs,sentences,reviewWidget,reviewLabels,type ReviewOptions,type ReviewStatus} from './review-diff'
import {sameWritingNode,sameWritingMarkup,writingDocument} from './writing-document'

type Edit={id:number;from:number;to:number;slice:Slice;text:string}
type Review={items:Edit[];options?:ReviewOptions;reason:ReviewStatus}
type Meta={start:Review}|{resolve:number;accept:boolean}|{clear:ReviewStatus}
const key=new PluginKey<Review>('writing-inline-review')
let editId=0

function changes(before:PMNode,after:PMNode):Edit[]{
  const edits:Edit[]=[]
  function add(from:number,to:number,slice:Slice){edits.push({id:editId++,from,to,slice,text:slice.content.textBetween(0,slice.content.size,'\n','\uFFFC')||(slice.size?reviewLabels().structure:'')})}
  function compare(a:PMNode,b:PMNode,pos:number){
    if(sameWritingNode(a,b))return
    if(sameWritingMarkup(a,b)&&a.isTextblock&&!a.type.spec.code){
      const text=(node:PMNode)=>node.textBetween(0,node.content.size,'','\uFFFC')
      const old=sentences(text(a)),next=sentences(text(b))
      const pairs=changedPairs(old,next,(x,y)=>a.content.cut(x.from,x.to).eq(b.content.cut(y.from,y.to)))
      let anchor=pos+1
      for(const [i,j] of pairs){
        const x=i===null?null:old[i],y=j===null?null:next[j]
        if(x)anchor=pos+1+x.from
        if(!x||!y||!a.content.cut(x.from,x.to).eq(b.content.cut(y.from,y.to)))add(anchor,x?pos+1+x.to:anchor,new Slice(y?b.content.cut(y.from,y.to):Slice.empty.content,0,0))
        if(x)anchor=pos+1+x.to
      }
    }else if(sameWritingMarkup(a,b)&&!a.isLeaf&&!a.isTextblock){children(a,b,pos+1)}
    else add(pos,pos+a.nodeSize,new Slice(b.type.schema.nodes.doc.create(null,b).content,0,0))
  }
  function children(a:PMNode,b:PMNode,start:number){
    const old:{node:PMNode;pos:number}[]=[],next:PMNode[]=[]
    a.forEach((node,offset)=>old.push({node,pos:start+offset}));b.forEach(node=>next.push(node))
    // Runs share a stable anchor after the last old sibling, including insertions.
    let cursor=start
    for(const [i,j] of changedPairs(old,next,(x,y)=>sameWritingNode(x.node,y))){
      // Crepe adds an empty trailing paragraph after lists/tables so the author
      // can move the caret past them. It is not a model-requested deletion.
      if(j===null&&i===old.length-1&&a.type.name==='doc'&&old.length>1&&old[i].node.type.name==='paragraph'&&!old[i].node.content.size)continue
      if(i!==null){cursor=old[i].pos;if(j!==null)compare(old[i].node,next[j],cursor);else add(cursor,cursor+old[i].node.nodeSize,Slice.empty);cursor+=old[i].node.nodeSize}
      else if(j!==null){
        add(cursor,cursor,new Slice(b.type.schema.nodes.doc.create(null,next[j]).content,0,0))
      }
    }
  }
  children(before,after,0)
  return edits
}

function decide(view:EditorView,id:number,accept:boolean){
  const review=key.getState(view.state),item=review?.items.find(i=>i.id===id)
  if(!item||!review?.options)return
  if(accept&&review.options.readonly()){window.alert(reviewLabels().readonly);return}
  let tr=view.state.tr
  if(accept){review.options.edited();tr=closeHistory(tr).replaceRange(item.from,item.to,item.slice)}
  tr.setMeta(key,{resolve:id,accept} satisfies Meta).setMeta('addToHistory',accept)
  view.dispatch(tr)
  if(accept)view.dispatch(closeHistory(view.state.tr))
  view.focus()
}

export const inlineReview=$prose(()=>new Plugin<Review>({
  key,
  state:{
    init:()=>({items:[],reason:'closed'}),
    apply(tr,value,previous){
      const meta=tr.getMeta(key) as Meta|undefined
      if(meta&&'start'in meta)return meta.start
      if(meta&&'clear'in meta)return {...value,items:[],reason:meta.clear}
      if(meta&&'resolve'in meta){
        const items=value.items.filter(i=>i.id!==meta.resolve).map(i=>{
          const assoc=i.id<meta.resolve?-1:1
          return {...i,from:tr.mapping.map(i.from,i.from===i.to?assoc:1),to:tr.mapping.map(i.to,i.from===i.to?assoc:-1)}
        })
        return {...value,items,reason:items.length?'pending':'complete'}
      }
      // Crepe may append its caret paragraph only after the next transaction.
      // Keep the review through that exact normalization, mapping endpoints
      // before the added paragraph. Every existing document node must match.
      const trailingCaret=previous.doc.lastChild?.type.name!=='paragraph'&&tr.doc.childCount===previous.doc.childCount+1&&tr.doc.lastChild?.type.name==='paragraph'&&!tr.doc.lastChild.content.size&&previous.doc.content.eq(tr.doc.content.cut(0,previous.doc.content.size))
      if(tr.docChanged&&trailingCaret&&value.items.length)return {...value,items:value.items.map(i=>({...i,from:tr.mapping.map(i.from,i.from===i.to?-1:1),to:tr.mapping.map(i.to,-1)}))}
      if(tr.docChanged&&value.items.length&&!writingDocument(tr.doc).eq(writingDocument(previous.doc)))return {...value,items:[],reason:'changed'}
      return value
    },
  },
  props:{decorations(state){
    const decorations:Decoration[]=[]
    for(const item of key.getState(state)?.items||[]){
      if(item.to>item.from){
        const node=state.doc.nodeAt(item.from)
        decorations.push(node&&!node.isText&&node.nodeSize===item.to-item.from?Decoration.node(item.from,item.to,{class:'review-original'}):Decoration.inline(item.from,item.to,{class:'review-original'}))
      }
      decorations.push(Decoration.widget(item.to,view=>reviewWidget(item.text,accept=>decide(view,item.id,accept)),{key:'review-'+item.id,side:1,stopEvent:()=>true,ignoreSelection:true}))
    }
    return DecorationSet.create(state.doc,decorations)
  }},
  view(){return {update(view,previous){const current=key.getState(view.state),old=key.getState(previous);if(current!==old&&current?.options){const {options,items,reason}=current;queueMicrotask(()=>options.status(items.length,reason))}}}},
}))

export function startInlineReview(view:EditorView,target:PMNode,options:ReviewOptions){
  clearInlineReview(view,'replaced')
  const items=changes(view.state.doc,target)
  view.dispatch(view.state.tr.setMeta(key,{start:{items,options,reason:items.length?'pending':'complete'}} satisfies Meta).setMeta('addToHistory',false))
  return items.length
}
export function clearInlineReview(view:EditorView,reason:ReviewStatus='closed'){
  if(key.getState(view.state)?.items.length)view.dispatch(view.state.tr.setMeta(key,{clear:reason} satisfies Meta).setMeta('addToHistory',false))
}

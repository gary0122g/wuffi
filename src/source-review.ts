import {StateEffect,StateField} from '@codemirror/state'
import {EditorView,Decoration,WidgetType,type DecorationSet} from '@codemirror/view'
import {isolateHistory} from '@codemirror/commands'
import {changedPairs,sentences,reviewWidget,reviewLabels,type ReviewOptions,type ReviewStatus} from './review-diff'

type Edit={id:number;from:number;to:number;text:string}
type Review={items:Edit[];options?:ReviewOptions;reason:ReviewStatus}
const setReview=StateEffect.define<Review>(),resolve=StateEffect.define<number>()
const field=StateField.define<Review>({
  create:()=>({items:[],reason:'closed'}),
  update(value,tr){
    const reset=tr.effects.find(e=>e.is(setReview));if(reset)return reset.value
    const decision=tr.effects.find(e=>e.is(resolve))
    if(decision){
      const items=value.items.filter(i=>i.id!==decision.value).map(i=>{
        const assoc=i.id<decision.value?-1:1
        return {...i,from:tr.changes.mapPos(i.from,i.from===i.to?assoc:1),to:tr.changes.mapPos(i.to,i.from===i.to?assoc:-1)}
      })
      return {...value,items,reason:items.length?'pending':'complete'}
    }
    return tr.docChanged&&value.items.length?{...value,items:[],reason:'changed'}:value
  },
})
class Suggestion extends WidgetType {
  constructor(readonly item:Edit){super()}
  eq(other:Suggestion){return this.item.id===other.item.id&&this.item.text===other.item.text}
  toDOM(view:EditorView){return reviewWidget(this.item.text,accept=>{
    const state=view.state.field(field),item=state.items.find(i=>i.id===this.item.id)
    if(!item||!state.options)return
    if(accept&&state.options.readonly()){window.alert(reviewLabels().readonly);return}
    if(accept)state.options.edited()
    view.dispatch({...(accept?{changes:{from:item.from,to:item.to,insert:item.text},annotations:isolateHistory.of('full'),userEvent:'input.agent-review'}:{}),effects:resolve.of(item.id)})
    view.focus()
  })}
  ignoreEvent(){return true}
}
function decorations(value:Review):DecorationSet{
  return Decoration.set(value.items.flatMap(item=>[
    ...(item.from<item.to?[Decoration.mark({class:'review-original'}).range(item.from,item.to)]:[]),
    Decoration.widget({widget:new Suggestion(item),side:1}).range(item.to),
  ]),true)
}
export const sourceReview=[field,EditorView.decorations.compute([field],state=>decorations(state.field(field))),EditorView.updateListener.of(update=>{
  const state=update.state.field(field)
  if(state!==update.startState.field(field)&&state.options)queueMicrotask(()=>state.options!.status(state.items.length,state.reason))
})]

export function clearSourceReview(view:EditorView,reason:ReviewStatus='closed'){
  const state=view.state.field(field)
  if(state.items.length)view.dispatch({effects:setReview.of({...state,items:[],reason})})
}
export function startSourceReview(view:EditorView,from:number,to:number,markdown:string,options:ReviewOptions){
  clearSourceReview(view,'replaced')
  const old=sentences(view.state.sliceDoc(from,to)),next=sentences(markdown),items:Edit[]=[]
  let cursor=from
  for(const [i,j] of changedPairs(old,next,(a,b)=>a.text===b.text)){
    const a=i===null?null:old[i],b=j===null?null:next[j]
    if(a)cursor=from+a.from
    if(!a||!b||a.text!==b.text)items.push({id:items.length,from:cursor,to:a?from+a.to:cursor,text:b?.text||''})
    if(a)cursor=from+a.to
  }
  view.dispatch({effects:setReview.of({items,options,reason:items.length?'pending':'complete'})})
  return items.length
}

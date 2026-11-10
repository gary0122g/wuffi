import { editorViewCtx,remarkCtx,serializerCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { inlineDocument } from './inline-source'
import { blockMatches } from './block-matches'
import { withoutCaretHost } from './writing-document'
// Keep untouched source blocks verbatim, including their Markdown delimiters,
// indentation and blank lines. Only the edited span passes through serialization.
export function preserveSource(ctx:Ctx,source:string){
  // Without the caret host the editor blocks line up with the source blocks;
  // otherwise every keystroke falls back to serializing the whole document.
  const original=withoutCaretHost(ctx.get(editorViewCtx).state.doc),remark=ctx.get(remarkCtx)
  // Untouched blocks keep their node identity across edits, so their keys are reused.
  const cache=new WeakMap<object,string>(),keyOf=(node:typeof original)=>{let key=cache.get(node);if(key===undefined){key=JSON.stringify(node.toJSON());cache.set(node,key)}return key}
  // Locating the source blocks parses the whole document a second time. Opening
  // a document does not need it: it runs when the editor is idle, or on the
  // first edit if that comes sooner. It only reads the original text and model.
  let layout:{positions:{from?:number;to?:number}[];keys:string[]}|undefined
  const prepare=()=>{
    if(layout)return layout
    const positions=remark.parse(source).children.map(node=>({from:node.position?.start.offset,to:node.position?.end.offset}))
    const keys:string[]=[];original.forEach(node=>keys.push(keyOf(node)))
    return layout={positions,keys}
  }
  if(typeof requestIdleCallback==='function')requestIdleCallback(()=>prepare(),{timeout:3000});else setTimeout(prepare,500)
  return (current:Ctx)=>{
    const doc=withoutCaretHost(inlineDocument(current)),serialize=current.get(serializerCtx)
    if(doc.eq(original))return source
    const {positions,keys}=prepare()
    if(positions.length!==original.childCount||positions.some(position=>position.from===undefined||position.to===undefined))return serialize(doc)
    const currentKeys:string[]=[];doc.forEach(node=>currentKeys.push(keyOf(node)))
    const matches=blockMatches(keys,currentKeys)
    let oldIndex=0,newIndex=0,cursor=0,output=''
    for(const [oldEnd,newEnd] of [...matches,[original.childCount,doc.childCount]]){
      if(oldEnd>oldIndex||newEnd>newIndex){
        const from=positions[oldIndex]?.from??source.length
        const to=oldEnd>oldIndex?positions[oldEnd-1].to!:from
        const nodes=[];for(let i=newIndex;i<newEnd;i++)nodes.push(doc.child(i))
        let replacement=nodes.length?serialize(doc.type.create(doc.attrs,nodes)).trimEnd():''
        if(oldEnd===oldIndex&&replacement){
          if(from===source.length&&source&&!/\n\s*\n$/.test(source))replacement='\n\n'+replacement
          if(from<source.length)replacement+='\n\n'
        }
        output+=source.slice(cursor,from)+replacement;cursor=to
      }
      oldIndex=oldEnd+1;newIndex=newEnd+1
    }
    return output+source.slice(cursor)
  }
}

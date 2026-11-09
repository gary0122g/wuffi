import { $markSchema, $remark } from '@milkdown/kit/utils'

type Node = {type:string;value?:string;children?:Node[]}
const tags = ['u','sub','sup','mark']
export const inlineMarks = tags.map(tag => $markSchema('html_'+tag, () => ({
  parseDOM:[{tag}], toDOM:()=>[tag,0],
  parseMarkdown:{match:node=>node.type==='html_'+tag,runner:(state,node,type)=>{state.openMark(type);state.next(node.children);state.closeMark(type)}},
  toMarkdown:{match:mark=>mark.type.name==='html_'+tag,runner:(state,mark)=>{state.withMark(mark,'html_'+tag)}},
})))
export const inlineRemark = $remark('inlineHtmlMarks', () => function(this:any) {
  const data=this.data()
  const handlers = Object.fromEntries(tags.map(tag=>['html_'+tag,(node:any,_parent:any,state:any,info:any)=>`<${tag}>${state.containerPhrasing(node,info)}</${tag}>`]))
  data.toMarkdownExtensions=[...(data.toMarkdownExtensions||[]),{handlers}]
  function visit(node:Node) {
    if(!node.children) return
    for(let i=0;i<node.children.length;i++) {
      const child=node.children[i]
      const tag=child.type==='html' && child.value?.match(/^<(u|sub|sup|mark)>$/i)?.[1].toLowerCase()
      if(tag){
        let depth=1, end=i+1
        for(;end<node.children.length;end++){const item=node.children[end];if(item.type!=='html')continue;if(item.value?.toLowerCase()===`<${tag}>`)depth++;if(item.value?.toLowerCase()===`</${tag}>` && --depth===0)break}
        if(end<node.children.length){const marked:Node={type:'html_'+tag,children:node.children.slice(i+1,end)};visit(marked);node.children.splice(i,end-i+1,marked);continue}
      }
      visit(child)
    }
  }
  return visit
})

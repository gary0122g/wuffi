import { $markSchema,$remark } from '@milkdown/kit/utils'
import { readPreferences } from './preferences'
const formats=[['sub','~'],['sup','^'],['mark','==']] as const
export const optionalMarks=formats.map(([tag])=>$markSchema('syntax_'+tag,()=>({
  parseDOM:[{tag:`${tag}[data-markdown]`}],toDOM:()=>[tag,{'data-markdown':'true'},0],
  parseMarkdown:{match:node=>node.type==='syntax_'+tag,runner:(state,node,type)=>{state.openMark(type);state.next(node.children);state.closeMark(type)}},
  toMarkdown:{match:mark=>mark.type.name==='syntax_'+tag,runner:(state,mark)=>{state.withMark(mark,'syntax_'+tag)}},
})))
export const syntaxPreferences=$remark('syntaxPreferences',()=>function(this:any){
  const data=this.data();data.toMarkdownExtensions=[...(data.toMarkdownExtensions||[]),{handlers:Object.fromEntries(formats.map(([tag,delimiter])=>['syntax_'+tag,(node:any,_parent:any,state:any,info:any)=>delimiter+state.containerPhrasing(node,info)+delimiter]))}]
  return function visit(node:any){
    const p=readPreferences();if(!node.children)return
    for(let i=0;i<node.children.length;i++){
      let child=node.children[i]
      if(child.type==='inlineMath'&&!p.inlineMath){child={type:'text',value:'$'+child.value+'$'};node.children[i]=child}
      if(child.type==='link'&&!p.autoLink&&child.children?.length===1&&child.children[0].value===child.url&&child.position?.end.offset-child.position?.start.offset===child.url.length){child={type:'text',value:child.url};node.children[i]=child}
      if(child.type==='text'){
        const value=child.value||'',matches=[...value.matchAll(/(?<![~^=\\])(~|\^|==)([^\s~^=](?:[^\n~^=]*?[^\s~^=])?)\1(?![~^=])/g)]
        const parts:any[]=[];let last=0
        for(const match of matches){const tag=match[1]==='~'?'sub':match[1]==='^'?'sup':'mark';if(!(tag==='sub'?p.subscript:tag==='sup'?p.superscript:p.highlight))continue;if(match.index!>last)parts.push({type:'text',value:value.slice(last,match.index)});parts.push({type:'syntax_'+tag,children:[{type:'text',value:match[2]}]});last=match.index!+match[0].length}
        if(parts.length){if(last<value.length)parts.push({type:'text',value:value.slice(last)});node.children.splice(i,1,...parts);i+=parts.length-1;continue}
      }
      visit(child)
    }
  }
})

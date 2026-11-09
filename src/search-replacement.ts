export function expandReplacement(value:string,match:RegExpMatchArray,text:string):string {
  return value.replace(/\$(\$|&|`|'|\d{1,2}|<[^>]*>)/g,(literal,token:string)=>{
    if(token==='$')return '$'
    if(token==='&')return match[0]
    if(token==='`')return text.slice(0,match.index||0)
    if(token==="'")return text.slice((match.index||0)+match[0].length)
    if(token.startsWith('<'))return match.groups===undefined?literal:match.groups[token.slice(1,-1)]||''
    const index=Number(token)
    if(index>0&&index<match.length)return match[index]||''
    const first=Number(token[0])
    if(token.length===2&&first>0&&first<match.length)return (match[first]||'')+token[1]
    return literal
  })
}

import { marked } from 'marked'
export function documentMetrics(markdown:string){
  const source=markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'')
  const textOf=(token:any):string=>{
    if(token.type==='image')return ' \ufffc '
    if(token.type==='table')return [...token.header,...token.rows.flat()].map(cell=>textOf(cell)).join(' ')
    if(token.items)return token.items.map(textOf).join('\n')
    if(token.tokens)return token.tokens.map(textOf).join('')+(['paragraph','heading','blockquote'].includes(token.type)?'\n':'')
    if(token.type==='html')return (token.text||'').replace(/<img\b[^>]*>/gi,' \ufffc ').replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]*>/g,'')
    return token.text||''
  }
  const text=marked.lexer(source).map(textOf).join('\n').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim()
  const cjk=(text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)||[]).length
  const words=(text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu,' ').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*|\ufffc/gu)||[]).length
  return {words:cjk+words,characters:[...text].length}
}

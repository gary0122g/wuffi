import {Fragment,type Node as PMNode} from '@milkdown/kit/prose/model'

// Heading IDs belong to Milkdown's automatic navigation sync. Text, heading
// levels, marks, links, code languages and all other attributes remain exact.
// Line endings are not writing either: a \r\n document and an AI reply written
// with \n must not make every code block, diagram and formula look changed.
const lf=(text:string)=>text.replace(/\r\n?/g,'\n')
function writingAttrs(node:PMNode){
  const attrs:Record<string,unknown>=node.type.name==='heading'?{...node.attrs,id:''}:{...node.attrs}
  for(const [key,value] of Object.entries(attrs))if(typeof value==='string'&&value.includes('\r'))attrs[key]=lf(value)
  return attrs
}
export function writingNode(node:PMNode):PMNode{
  if(node.isText)return node.text?.includes('\r')?node.type.schema.text(lf(node.text),node.marks):node
  if(node.isLeaf)return node.type.create(writingAttrs(node),undefined,node.marks)
  const children:PMNode[]=[];node.forEach(child=>children.push(writingNode(child)))
  return node.type.create(writingAttrs(node),Fragment.fromArray(children),node.marks)
}
export function sameWritingNode(a:PMNode,b:PMNode){return a.eq(b)||writingNode(a).eq(writingNode(b))}
export function sameWritingMarkup(a:PMNode,b:PMNode){
  if(a.type!==b.type)return false
  if(a.type.name!=='heading')return a.sameMarkup(b)
  return a.type.create({...a.attrs,id:''},undefined,a.marks).sameMarkup(b.type.create({...b.attrs,id:''},undefined,b.marks))
}
// The trailing plugin adds an empty caret host paragraph after a
// list/table/code block. It is editor chrome, not part of the Markdown source.
function hasCaretHost(doc:PMNode){
  const last=doc.lastChild
  return doc.childCount>1&&last?.type.name==='paragraph'&&!last.content.size&&doc.child(doc.childCount-2).type.name!=='paragraph'
}
export function withoutCaretHost(doc:PMNode){
  return hasCaretHost(doc)?doc.copy(doc.content.cut(0,doc.content.size-doc.lastChild!.nodeSize)):doc
}
export function writingDocument(doc:PMNode){return withoutCaretHost(writingNode(doc))}
// Same result as writingDocument(a).eq(writingDocument(b)) without rebuilding
// both documents: a keystroke shares every untouched block with the previous
// document, so only the changed blocks need normalizing.
export function sameWritingDocument(a:PMNode,b:PMNode){
  if(a===b)return true
  if(a.type!==b.type||!a.sameMarkup(b))return false
  const count=a.childCount-(hasCaretHost(a)?1:0)
  if(count!==b.childCount-(hasCaretHost(b)?1:0))return false
  for(let i=0;i<count;i++){const x=a.child(i),y=b.child(i);if(x!==y&&!sameWritingNode(x,y))return false}
  return true
}

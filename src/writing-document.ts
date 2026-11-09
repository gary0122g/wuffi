import {Fragment,type Node as PMNode} from '@milkdown/kit/prose/model'

// Heading IDs belong to Milkdown's automatic navigation sync. Text, heading
// levels, marks, links, code languages and all other attributes remain exact.
export function writingNode(node:PMNode):PMNode{
  if(node.isText||node.isLeaf)return node
  const children:PMNode[]=[];node.forEach(child=>children.push(writingNode(child)))
  return node.type.create(node.type.name==='heading'?{...node.attrs,id:''}:node.attrs,Fragment.fromArray(children),node.marks)
}
export function sameWritingNode(a:PMNode,b:PMNode){return a.eq(b)||writingNode(a).eq(writingNode(b))}
export function sameWritingMarkup(a:PMNode,b:PMNode){
  if(a.type!==b.type)return false
  if(a.type.name!=='heading')return a.sameMarkup(b)
  return a.type.create({...a.attrs,id:''},undefined,a.marks).sameMarkup(b.type.create({...b.attrs,id:''},undefined,b.marks))
}
export function writingDocument(doc:PMNode){
  const normalized=writingNode(doc),last=normalized.lastChild
  // The trailing plugin adds this caret host after a list/table/code block.
  if(normalized.childCount>1&&last?.type.name==='paragraph'&&!last.content.size&&normalized.child(normalized.childCount-2).type.name!=='paragraph')return normalized.copy(normalized.content.cut(0,normalized.content.size-last.nodeSize))
  return normalized
}

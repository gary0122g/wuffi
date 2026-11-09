import { $prose } from '@milkdown/kit/utils'
import { Plugin,TextSelection } from '@milkdown/kit/prose/state'
import { EditorView } from '@codemirror/view'
function settings(){try{return JSON.parse(localStorage.getItem('liubai.preferences')||'{}')}catch{return {}}}
function transform(text:string,before:string,after:string,selected=''){
  const p=settings(),pairs:Record<string,string>={'(':')','[':']','{':'}','"':'"',"'":"'"}
  if(p.smartDashes&&text==='-'&&['-','–'].includes(before))return {insert:before==='-'?'–':'—',offset:1,replaceBefore:1}
  if(p.markdownPair){pairs['*']='*';pairs['_']='_';pairs['`']='`'}
  if(text==="'" && /[\p{L}\p{N}]/u.test(before))return p.smartQuotes ? {insert:'’',offset:1} : null
  if(p.smartQuotes && (text==='"'||text==="'"))return {insert:(/\s|^$/.test(before)?(text==='"'?'“':'‘'):(text==='"'?'”':'’')),offset:1}
  if(p.autoPair!==false && pairs[text]){if(!selected && after===text && ['"',"'",'`','*','_'].includes(text))return {skip:true};return {insert:text+selected+pairs[text],offset:1+selected.length}}
  if(p.autoPair!==false && [')',']','}'].includes(text) && after===text)return {skip:true}
  return null
}
export const typingRules=$prose(()=>new Plugin({props:{
  handleTextInput(view,from,to,text){if(view.composing||text.length!==1||!view.editable)return false;const result=transform(text,view.state.doc.textBetween(Math.max(0,from-1),from),view.state.doc.textBetween(to,Math.min(view.state.doc.content.size,to+1)),view.state.doc.textBetween(from,to));if(!result)return false;const tr=view.state.tr;if(result.skip)tr.setSelection(TextSelection.create(tr.doc,to+1));else{const start=from-('replaceBefore'in result?(result.replaceBefore||0):0);tr.insertText(result.insert!,start,to);tr.setSelection(TextSelection.create(tr.doc,start+result.offset!))}view.dispatch(tr);return true},
  handleKeyDown(view,event){if(view.composing||!view.editable||!view.state.selection.empty||!['Backspace','Delete'].includes(event.key))return false;const s=view.state.selection,marks=s.$from.marks();if(!marks.length)return false;const parent=s.$from.parent,offset=s.$from.parentOffset;let target:any=null;parent.forEach((node,pos)=>{if(node.isText && ((event.key==='Backspace'&&pos===offset)||(event.key==='Delete'&&pos+node.nodeSize===offset)))target={node,pos}});if(!target)return false;const mark=target.node.marks.at(-1);if(!mark)return false;view.dispatch(view.state.tr.removeMark(s.$from.start()+target.pos,s.$from.start()+target.pos+target.node.nodeSize,mark));return true},
}}))
export const sourceTyping=EditorView.inputHandler.of((view,from,to,text)=>{if(view.state.readOnly||view.composing||text.length!==1)return false;const result=transform(text,view.state.sliceDoc(Math.max(0,from-1),from),view.state.sliceDoc(to,to+1),view.state.sliceDoc(from,to));if(!result)return false;if(result.skip)view.dispatch({selection:{anchor:to+1}});else {const start=from-('replaceBefore'in result?(result.replaceBefore||0):0);view.dispatch({changes:{from:start,to,insert:result.insert!},selection:{anchor:start+result.offset!},userEvent:'input.type'})};return true})

import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { sourceTyping } from './typing'
import {sourceReview,startSourceReview,clearSourceReview} from './source-review'
import type {ReviewOptions} from './review-diff'
import {isSelectingText} from './typewriter'

function initializeSourceEditor(parent: HTMLElement, changed: (value: string) => void) {
  const readonly = new Compartment()
  const display = new Compartment()
  let activeDocument = ''
  let readOnly = false
  let settings = {sourceNumbers:true,sourceWrap:true,tabSize:4}
  const documents = new Map<string,{state:EditorState;scrollTop:number;scrollLeft:number}>()
  const displayExtensions = () => [...(settings.sourceNumbers ? [lineNumbers({ formatNumber: n => n % 10 === 0 ? String(n) : '' })] : []), ...(settings.sourceWrap ? [EditorView.lineWrapping] : []), EditorState.tabSize.of(settings.tabSize)]
  const makeState = (doc:string) => EditorState.create({ doc, extensions: [
    markdown(), history(), sourceTyping, sourceReview, keymap.of([...defaultKeymap, ...historyKeymap]),
    display.of(displayExtensions()),
    highlightActiveLine(), highlightActiveLineGutter(),
    readonly.of([EditorState.readOnly.of(readOnly),EditorView.editable.of(!readOnly)]),
    EditorView.contentAttributes.of({ 'aria-label': 'Markdown 原始碼', spellcheck: 'false', tabindex:'0' }),
    syntaxHighlighting(HighlightStyle.define([
      { tag: tags.heading1, fontFamily: 'Open Sans, sans-serif', color: 'var(--source-heading, #d44981)', fontWeight: 'bold', fontSize: '28px' },
      { tag: tags.heading2, fontFamily: 'Open Sans, sans-serif', color: 'var(--source-heading, #d44981)', fontWeight: 'bold', fontSize: '24px' },
      { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontFamily: 'Open Sans, sans-serif', color: 'var(--source-heading, #d44981)', fontWeight: 'bold' },
      { tag: tags.strong, fontWeight: 'bold' }, { tag: tags.emphasis, fontStyle: 'italic' },
      { tag: tags.quote, color: 'var(--source-quote, #998f85)' }, { tag: tags.link, color: 'var(--source-link, #4183c4)' },
      { tag: tags.monospace, color: 'var(--source-code, #c7254e)' },
    ])),
    EditorView.updateListener.of(update => {
      if (update.docChanged) changed(update.state.doc.toString())
      if((update.docChanged||update.selectionSet)&&update.view.hasFocus&&document.body.classList.contains('typewriter-mode'))queueMicrotask(()=>{
        if(view.hasFocus&&view.state.selection.ranges.every(r=>r.empty)&&!isSelectingText()&&document.body.classList.contains('typewriter-mode'))view.dispatch({effects:EditorView.scrollIntoView(view.state.selection.main.head,{y:'center'})})
      })
    }),
  ] })
  const view = new EditorView({parent,state:makeState('')})
  return {
    view,
    centerCursor() { if(view.state.selection.ranges.every(r=>r.empty)&&!isSelectingText())view.dispatch({effects:EditorView.scrollIntoView(view.state.selection.main.head,{y:'center'})}) },
    review(from:number,to:number,markdown:string,options:ReviewOptions){return startSourceReview(view,from,to,markdown,options)},
    clearReview(){clearSourceReview(view)},
    configure(value: { sourceNumbers: boolean; sourceWrap: boolean; tabSize: number }) { settings=value;view.dispatch({ effects: display.reconfigure(displayExtensions()) }) },
    setDocument(id:string,value:string) {
      if(id===activeDocument&&view.state.doc.toString()===value)return
      if(activeDocument)documents.set(activeDocument,{state:view.state,scrollTop:view.scrollDOM.scrollTop,scrollLeft:view.scrollDOM.scrollLeft})
      const cached=documents.get(id),restore=cached?.state.doc.toString()===value?cached:undefined
      activeDocument=id
      view.setState(restore?.state||makeState(value))
      view.dispatch({effects:[display.reconfigure(displayExtensions()),readonly.reconfigure([EditorState.readOnly.of(readOnly),EditorView.editable.of(!readOnly)])]})
      view.scrollDOM.scrollTop=restore?.scrollTop||0;view.scrollDOM.scrollLeft=restore?.scrollLeft||0
    },
    retainDocuments(ids:string[]) { const keep=new Set(ids);for(const id of documents.keys())if(!keep.has(id))documents.delete(id) },
    setContent(value: string) { if (view.state.doc.toString() !== value) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } }) },
    setReadonly(value: boolean) { readOnly=value;view.dispatch({ effects: readonly.reconfigure([EditorState.readOnly.of(value),EditorView.editable.of(!value)]) }) },
    focus() { view.focus() },
  }
}

// Visual startup does not need a second, hidden CodeMirror editor.
export function createSourceEditor(parent: HTMLElement, changed: (value: string) => void): ReturnType<typeof initializeSourceEditor> {
  let instance:ReturnType<typeof initializeSourceEditor>|undefined
  let settings:{sourceNumbers:boolean;sourceWrap:boolean;tabSize:number}|undefined
  let readOnly=false,content:string|undefined
  function get(){
    if(!instance){
      instance=initializeSourceEditor(parent,changed)
      if(settings)instance.configure(settings)
      if(readOnly)instance.setReadonly(readOnly)
      if(content!==undefined)instance.setContent(content)
    }
    return instance
  }
  return {
    get view(){return get().view},
    centerCursor(){get().centerCursor()},
    review(from,to,markdown,options){return get().review(from,to,markdown,options)},
    clearReview(){instance?.clearReview()},
    configure(value){settings=value;instance?.configure(value)},
    setDocument(id,value){content=value;get().setDocument(id,value)},
    retainDocuments(ids){instance?.retainDocuments(ids)},
    setContent(value){content=value;instance?.setContent(value)},
    setReadonly(value){readOnly=value;instance?.setReadonly(value)},
    focus(){get().focus()},
  }
}

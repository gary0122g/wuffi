import { editorViewCtx, serializerCtx } from '@milkdown/kit/core'
import { TextSelection, AllSelection } from '@milkdown/kit/prose/state'
import { DOMSerializer } from '@milkdown/kit/prose/model'
import { undo, redo, closeHistory } from '@milkdown/kit/prose/history'
import { sinkListItem, liftListItem } from '@milkdown/kit/prose/schema-list'
import { addRowBefore, addRowAfter, addColumnBefore, addColumnAfter, deleteRow, deleteColumn, deleteTable, findTable, selectedRect } from '@milkdown/kit/prose/tables'
import { undo as sourceUndo, redo as sourceRedo, isolateHistory } from '@codemirror/commands'
import type { Crepe } from '@milkdown/crepe'
import type { EditorView as SourceView } from '@codemirror/view'
import { expandReplacement } from './search-replacement'

type Host = { visual(): Crepe | null; source(): SourceView; mode(): string; readonly(): boolean; edited(): void; insert(text: string): void }
export function createEditing(host: Host) {
  function range() {
    const editor = host.visual()
    if (host.mode() === 'visual' && editor) return editor.editor.action(ctx => {
      const view = ctx.get(editorViewCtx), selection = view.state.selection
      return { from: selection.from, to: selection.to, text: view.state.doc.textBetween(selection.from, selection.to, '\n') }
    })
    const view = host.source(), selection = view.state.selection.main
    return { from: selection.from, to: selection.to, text: view.state.sliceDoc(selection.from, selection.to) }
  }
  function replace(from: number, to: number, text: string) {
    if (host.readonly()) return
    host.edited()
    const editor = host.visual()
    if (host.mode() === 'visual' && editor) editor.editor.action(ctx => { const view = ctx.get(editorViewCtx); view.dispatch(view.state.tr.insertText(text, from, to)); view.focus() })
    else { const view = host.source(); view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } }); view.focus() }
  }
  function select(from: number, to: number) {
    const editor = host.visual()
    if (host.mode() === 'visual' && editor) editor.editor.action(ctx => { const view = ctx.get(editorViewCtx); view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)).scrollIntoView()); view.focus() })
    else { const view = host.source(); view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true }); view.focus() }
  }
  function block() {
    const editor = host.visual()
    if (host.mode() === 'visual' && editor) return editor.editor.action(ctx => { const s = ctx.get(editorViewCtx).state.selection; return { from: s.$from.start(), to: s.$from.end(), text: s.$from.parent.textContent } })
    const view = host.source(), line = view.state.doc.lineAt(view.state.selection.main.head)
    return { from: line.from, to: line.to, text: line.text }
  }
  async function command(name: string) {
    const focused = document.activeElement
    if ((focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) && !focused.closest('#source-view')) {
      if (name === 'all') { focused.select(); return }
      if (name === 'undo' || name === 'redo' || name === 'delete') { document.execCommand(name); return }
      if (name.startsWith('copy:')) { await window.desktop?.clipboard({action:'write',text:focused.value.slice(focused.selectionStart || 0,focused.selectionEnd || 0)}); return }
      if (name === 'paste:plain') { const text=await window.desktop?.clipboard({action:'read'}); if(text!==undefined && !focused.readOnly){focused.setRangeText(text,focused.selectionStart||0,focused.selectionEnd||0,'end');focused.dispatchEvent(new Event('input',{bubbles:true}))}return }
    }
    const editor = host.visual()
    if (['headingUp','headingDown','indent','outdent','paragraphAbove','paragraphBelow','taskToggle'].includes(name)) {
      if(host.readonly())return
      host.edited()
      if(host.mode()==='visual' && editor) editor.editor.action(ctx=>{
        const view=ctx.get(editorViewCtx), {state}=view, {$from}=state.selection
        if(name==='indent'||name==='outdent'){const type=state.schema.nodes.list_item;if(type)(name==='indent'?sinkListItem(type):liftListItem(type))(state,view.dispatch)}
        else if(name.startsWith('heading')){const current=$from.parent.type.name==='heading'?Number($from.parent.attrs.level):0; const level=Math.max(0,Math.min(6,current+(name==='headingUp'?1:-1))); if($from.depth)view.dispatch(state.tr.setNodeMarkup($from.before(),level?state.schema.nodes.heading:state.schema.nodes.paragraph,level?{level}:undefined))}
        else if(name==='taskToggle'){for(let depth=$from.depth;depth>0;depth--){const node=$from.node(depth);if(node.type.name==='list_item' && typeof node.attrs.checked==='boolean'){view.dispatch(state.tr.setNodeMarkup($from.before(depth),undefined,{...node.attrs,checked:!node.attrs.checked}));break}}}
        else if($from.depth){const position=name==='paragraphAbove'?$from.before(1):$from.after(1);const tr=state.tr.insert(position,state.schema.nodes.paragraph.create());view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(position+1))).scrollIntoView())}
        view.focus()
      })
      else {const b=block();if(name==='indent')replace(b.from,b.to,'  '+b.text);else if(name==='outdent')replace(b.from,b.to,b.text.replace(/^ {1,4}|^\t/,''));else if(name==='paragraphAbove')replace(b.from,b.from,'\n');else if(name==='paragraphBelow')replace(b.to,b.to,'\n');else if(name==='taskToggle')replace(b.from,b.to,b.text.replace(/^(\s*[-*+] \[)([ xX])(\])/,(_m,a,b,c)=>a+(b===' '?'x':' ')+c));else{const match=b.text.match(/^(#{1,6}) /);const level=Math.max(0,Math.min(6,(match?.[1].length||0)+(name==='headingUp'?1:-1)));replace(b.from,b.to,(level?'#'.repeat(level)+' ':'')+b.text.replace(/^#{1,6} /,''))}}
      return
    }
    if (name === 'undo' || name === 'redo') {
      if (host.readonly()) return
      host.edited()
      if (host.mode() === 'visual' && editor) editor.editor.action(ctx => { const view = ctx.get(editorViewCtx); (name === 'undo' ? undo : redo)(view.state, view.dispatch); view.focus() })
      else (name === 'undo' ? sourceUndo : sourceRedo)(host.source())
      return
    }
    if (name.startsWith('copy:')) {
      let text = range().text, html = ''
      if (host.mode() === 'visual' && editor) editor.editor.action(ctx => {
        const view = ctx.get(editorViewCtx), fragment = view.state.selection.content().content
        if(name==='copy:code') { const selection=view.state.selection as any;if(selection.node?.type.spec.code)text=selection.node.textContent;else for(let depth=selection.$from.depth;depth>0;depth--)if(selection.$from.node(depth).type.spec.code){text=selection.$from.node(depth).textContent;break} }
        if (name === 'copy:markdown') text = ctx.get(serializerCtx)(view.state.doc.copy(fragment))
        if (name === 'copy:html'||name==='copy:rich') { const container = document.createElement('div'); container.append(DOMSerializer.fromSchema(view.state.schema).serializeFragment(fragment)); html = container.innerHTML; if(name==='copy:html')text = html }
      })
      await window.desktop?.clipboard({ action: 'write', text, html }); return
    }
    if (name === 'paste:plain') { const text = await window.desktop?.clipboard({ action: 'read' }); if (text !== undefined) { const s = range(); replace(s.from, s.to, text) } return }
    if (name === 'all') {
      if (host.mode() === 'visual' && editor) editor.editor.action(ctx => { const view = ctx.get(editorViewCtx); view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc))); view.focus() })
      else select(0, host.source().state.doc.length)
      return
    }
    if (name === 'block') { const b = block(); select(b.from,b.to); return }
    if (name === 'line') { const b=block(),offset=range().from-b.from;let from=0,to=b.text.length;for(const match of b.text.matchAll(/[。！？.!?](?:[”’"']?)(?:\s+|$)|\n/g)){const end=match.index!+match[0].length;if(end<=offset)from=end;else{to=end;break}}select(b.from+from,b.from+to);return }
    if (name === 'formatted') {
      if(host.mode()==='visual' && editor){editor.editor.action(ctx=>{const view=ctx.get(editorViewCtx),s=view.state.selection,marks=s.$from.marks();if(!marks.length){const b=block();select(b.from,b.to);return}const mark=marks[marks.length-1];let from=s.from,to=s.to;view.state.doc.nodesBetween(s.$from.start(),s.$from.end(),(node,pos)=>{if(node.isText && mark.isInSet(node.marks) && pos<=to && pos+node.nodeSize>=from){from=Math.min(from,pos);to=Math.max(to,pos+node.nodeSize)}});select(from,to)})}
      else{const b=block(),offset=range().from-b.from;const match=[...b.text.matchAll(/(\*\*|__|~~|`|\*|_)(.+?)\1/g)].find(m=>m.index!<=offset && m.index!+m[0].length>=offset);select(b.from+(match?.index||0),b.from+(match?match.index!+match[0].length:b.text.length))}
      return
    }
    if (name === 'word') { const b = block(), s = range(); const offset = s.from - b.from; const left = b.text.slice(0, offset).match(/[\p{L}\p{N}_]+$/u)?.[0].length || 0; const right = b.text.slice(offset).match(/^[\p{L}\p{N}_]+/u)?.[0].length || 0; select(s.from-left, s.from+right); return }
    if (name === 'top' || name === 'bottom' || name === 'lineStart' || name === 'lineEnd' || name === 'selection') {
      if (name === 'selection') { const s = range(); select(s.from,s.to); return }
      const b = block()
      const end = host.mode() === 'visual' && editor ? editor.editor.action(ctx => ctx.get(editorViewCtx).state.doc.content.size - 1) : host.source().state.doc.length
      const pos = name === 'top' ? (host.mode() === 'visual' ? 1 : 0) : name === 'bottom' ? end : name === 'lineStart' ? b.from : b.to
      select(pos,pos); return
    }
    if (name.startsWith('table:') && host.mode() === 'visual' && editor && !host.readonly()) {
      const commands = { rowBefore:addRowBefore, rowAfter:addRowAfter, colBefore:addColumnBefore, colAfter:addColumnAfter, deleteRow, deleteColumn, deleteTable }
      const operation = commands[name.slice(6) as keyof typeof commands]
      if (operation) editor.editor.action(ctx => {
        const view = ctx.get(editorViewCtx), found=findTable(view.state.selection.$from)
        host.edited()
        if(found && ['rowBefore','deleteRow'].includes(name.slice(6))){
          const rect=selectedRect(view.state),table=found.node,rows=Array.from({length:table.childCount},(_,i)=>table.child(i))
          const deleting=name==='table:deleteRow',removingHeader=deleting&&rect.top===0
          const removingLastBody=deleting&&rect.top>0&&table.childCount-(rect.bottom-rect.top)===1
          if((name==='table:rowBefore'&&rect.top===0)||removingHeader||removingLastBody){
            if(deleting&&rect.top===0&&rect.bottom===table.childCount){deleteTable(view.state,view.dispatch);view.focus();return}
            // Milkdown requires a distinct header row followed by a body row.
            // Generic prosemirror-tables operations at that boundary otherwise
            // let schema fitting create empty headers or split the table.
            if(rows.some(row=>Array.from({length:row.childCount},(_,i)=>row.child(i)).some(cell=>cell.attrs.colspan>1||cell.attrs.rowspan>1)))throw Error('此列操作尚不支援合併儲存格，原表格已保留')
            const schema=view.state.schema
            const convert=(row:typeof table,header:boolean,blank=false)=>{
              const cellType=schema.nodes[header?'table_header':'table_cell'],rowType=schema.nodes[header?'table_header_row':'table_row']
              return rowType.createChecked(row.attrs,Array.from({length:row.childCount},(_,i)=>{const cell=row.child(i);return blank?cellType.createAndFill(cell.attrs)!:cellType.createChecked(cell.attrs,cell.content)}))
            }
            let next=rows
            if(!deleting)next=[convert(rows[0],true,true),convert(rows[0],false),...rows.slice(1)]
            else if(removingHeader){next=rows.slice(rect.bottom);next[0]=convert(next[0],true);if(next.length===1)next.push(convert(next[0],false,true))}
            else next=[rows[0],convert(rows[0],false,true)]
            const replacement=table.type.createChecked(table.attrs,next),tr=view.state.tr.replaceWith(found.pos,found.pos+table.nodeSize,replacement)
            const offset=removingLastBody?next[0].nodeSize:0
            view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(found.pos+offset+4))))
            view.focus();return
          }
        }
        operation(view.state,view.dispatch);view.focus()
      })
      return
    }
    if (name === 'up' || name === 'down') {
      if (host.readonly()) return
      host.edited()
      if (host.mode() === 'visual' && editor) editor.editor.action(ctx => {
        const view = ctx.get(editorViewCtx), s = view.state.selection, depth = 1
        if (s.$from.depth < depth) return
        const start = s.$from.before(depth), node = s.$from.node(depth), end = start + node.nodeSize
        const neighbor = name === 'up' ? view.state.doc.resolve(start).nodeBefore : view.state.doc.resolve(end).nodeAfter
        if (!neighbor) return
        const from = name === 'up' ? start-neighbor.nodeSize : start, to = name === 'up' ? end : end+neighbor.nodeSize
        const slice = name === 'up' ? [node,neighbor] : [neighbor,node]
        const tr = view.state.tr.replaceWith(from,to,slice)
        const destination = name === 'up' ? from + 1 : from + neighbor.nodeSize + 1
        view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(destination))).scrollIntoView()); view.focus()
      })
      else {
        const view = host.source(), line = view.state.doc.lineAt(view.state.selection.main.head), n = line.number + (name === 'up' ? -1 : 1)
        if (n < 1 || n > view.state.doc.lines) return
        const neighbor = view.state.doc.line(n), from = Math.min(line.from,neighbor.from), to = Math.max(line.to,neighbor.to)
        replace(from,to,name === 'up' ? line.text+'\n'+neighbor.text : neighbor.text+'\n'+line.text)
      }
      return
    }
    const s = range(), b = block()
    if (name === 'delete') replace(s.from,s.to,'')
    if (name === 'deleteBlock') replace(b.from,b.to,'')
    if (name === 'upper') replace(s.from,s.to,s.text.toLocaleUpperCase())
    if (name === 'lower') replace(s.from,s.to,s.text.toLocaleLowerCase())
    if (name === 'trim') replace(b.from,b.to,b.text.trimEnd())
    if (name === 'smartQuotes') replace(s.from,s.to,s.text.replace(/"([^"]+)"/g,'“$1”').replace(/'([^']+)'/g,'‘$1’'))
    if (name === 'smartDashes') replace(s.from,s.to,s.text.replace(/---/g,'—').replace(/--/g,'–'))
    if (name === 'smartEllipses') replace(s.from,s.to,s.text.replace(/\.\.\./g,'…'))
  }
  const panel = document.createElement('div'); panel.id = 'find-panel'; panel.hidden = true
  panel.innerHTML = '<div class="find-line"><button data-find="toggle">搜尋 ▾</button><div class="find-field"><input id="find-text" aria-label="搜尋" placeholder="搜尋"><span id="find-count">0 / 0</span><label title="區分大小寫"><input id="find-case" type="checkbox">Aa</label><label title="尋找整個單字"><input id="find-word" type="checkbox">▣</label><label title="正規表達式"><input id="find-regex" type="checkbox">(.*)</label></div><div class="find-actions"><button data-find="prev" title="上一個">⌃</button><button data-find="next" title="下一個">⌄</button><button data-find="close" aria-label="關閉尋找">×</button></div></div><div id="replace-row" class="find-line"><button data-find="toggle">取代 ▴</button><input id="replace-text" aria-label="取代為" placeholder="取代為"><div class="find-actions"><button data-find="all">全部</button><button data-find="replace">取代</button></div></div>'
  document.querySelector('.main-shell')!.prepend(panel)
  const input = panel.querySelector<HTMLInputElement>('#find-text')!, replacement = panel.querySelector<HTMLInputElement>('#replace-text')!
  let matches: {from:number;to:number;replacement:string}[] = [], active = -1
  function scan() {
    matches = []; active = -1
    if (!input.value) { count(); return }
    let pattern: RegExp
    try { pattern = new RegExp(panel.querySelector<HTMLInputElement>('#find-regex')!.checked ? input.value : input.value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), panel.querySelector<HTMLInputElement>('#find-case')!.checked ? 'gu' : 'giu') }
    catch { panel.querySelector('#find-count')!.textContent = '無效運算式'; return }
    function collect(text: string, offset: number) { for (const match of text.matchAll(pattern)) { const start = match.index!, end = start + match[0].length; if (!match[0].length) continue; if (panel.querySelector<HTMLInputElement>('#find-word')!.checked && (/[\p{L}\p{N}_]/u.test(text[start-1] || '') || /[\p{L}\p{N}_]/u.test(text[end] || ''))) continue; matches.push({from:offset+start,to:offset+end,replacement:panel.querySelector<HTMLInputElement>('#find-regex')!.checked?expandReplacement(replacement.value,match,text):replacement.value}) } }
    const editor = host.visual()
    if (host.mode() === 'visual' && editor) editor.editor.action(ctx => {
      ctx.get(editorViewCtx).state.doc.descendants((node,pos) => { if (node.isTextblock) { collect(node.textBetween(0,node.content.size,'','\ufffc'),pos+1); return false } })
    })
    else collect(host.source().state.doc.toString(),0)
    count()
  }
  function count() { panel.querySelector('#find-count')!.textContent = `${active+1} / ${matches.length}` }
  function move(direction: number) { const selection = range(); scan(); if (!matches.length) return; const current = matches.findIndex(m => m.from === selection.from && m.to === selection.to); active = current < 0 ? (direction > 0 ? 0 : matches.length - 1) : (current+direction+matches.length)%matches.length; const match = matches[active]; select(match.from,match.to); count() }
  panel.querySelectorAll('input').forEach(node => node.addEventListener('input', () => { if (node !== replacement) scan() }))
  panel.addEventListener('click', event => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-find]')?.dataset.find
    if (action === 'close') panel.hidden = true
    if (action === 'toggle') { const row = panel.querySelector<HTMLElement>('#replace-row')!; row.hidden = !row.hidden }
    if (action === 'next' || action === 'prev') move(action === 'next' ? 1 : -1)
    if (action === 'replace') { const selected=range(); scan(); active=matches.findIndex(match=>match.from===selected.from && match.to===selected.to); if (active < 0) move(1); const match = matches[active]; if (match) { replace(match.from,match.to,match.replacement); scan(); move(1) } }
    if (action === 'all') {
      scan();if(host.readonly()||!matches.length)return
      host.edited();const editor=host.visual()
      if(host.mode()==='visual'&&editor)editor.editor.action(ctx=>{
        const view=ctx.get(editorViewCtx),tr=closeHistory(view.state.tr)
        for(const match of [...matches].reverse())tr.insertText(match.replacement,match.from,match.to)
        view.dispatch(tr);view.dispatch(closeHistory(view.state.tr));view.focus()
      })
      else {const view=host.source();view.dispatch({changes:matches.map(match=>({from:match.from,to:match.to,insert:match.replacement})),annotations:isolateHistory.of('full'),userEvent:'input.replace.all'});view.focus()}
      scan()
    }
  })
  panel.addEventListener('keydown', event => { if(event.isComposing)return; if (event.key === 'Escape') panel.hidden = true; if (event.key === 'Enter') { event.preventDefault(); move(event.shiftKey ? -1 : 1) } })
  return { command, find(withReplace = false) { panel.hidden = false; panel.querySelector<HTMLElement>('#replace-row')!.hidden = !withReplace; const selected = range().text; if (selected && selected.length < 100) input.value = selected; scan(); input.focus(); input.select() }, next: () => move(1), previous: () => move(-1) }
}

import './tauri-desktop'
import {confirmDialog} from './confirm-dialog'
import {createDraftJournal} from './draft-journal'
import {Plugin, TextSelection} from '@milkdown/kit/prose/state'
import {$prose} from '@milkdown/kit/utils'
import {installDesktopChrome,installWritingSettings} from './desktop-chrome'
import {createWritingAPI,type WritingSnapshot} from './writing-api'
import {installWritingAgent} from './writing-agent'
import {dogCompanions} from './dog-companion'
import {inlineReview,startInlineReview,clearInlineReview} from './inline-review'
import type {ReviewOptions} from './review-diff'
import {isSelectingText} from './typewriter'
import {writingDocument} from './writing-document'
import type {Node as WritingNode} from '@milkdown/kit/prose/model'
import {Slice} from '@milkdown/kit/prose/model'
import {closeHistory} from '@milkdown/kit/prose/history'
import {isolateHistory} from '@codemirror/commands'
import {installLocalization,setLanguage,currentLanguage,translate} from './i18n'
import { advancedMath,mathDelimiters,renderExportMath } from './advanced-math'
import { preserveSource } from './preserve-source'
import { focusMode } from './focus-mode'
import { installContextMenu } from './context-menu'
import { optionalMarks,syntaxPreferences } from './syntax-preferences'
import { inlineMarkdown } from './inline-source'
import { styleExport } from './export-style'
import { createPreferences, readPreferences, type Preferences } from './preferences'
import { createEditing } from './editing'
import { inlineMarks, inlineRemark } from './inline-marks'
import { markdownExtensions,setReferenceImageResolver } from './markdown-extensions'
import { renderDiagram,diagramsForDocument,warmDiagrams } from './diagrams'
import { remarkInlineLinkPlugin } from '@milkdown/kit/preset/commonmark'
import { showDesktopSettings,restoreCustomTheme } from './desktop-settings'
import { languages } from '@codemirror/language-data'
import { typingRules } from './typing'
import { tableTools,flexibleTable } from './table-tools'
import { preservedImage,imageHtml,imageTools } from './image-tools'
import { toggleMark } from '@milkdown/kit/prose/commands'
import { insert } from '@milkdown/kit/utils'
import { toggleStrikethroughCommand,remarkGFMPlugin } from '@milkdown/kit/preset/gfm'
import { createSourceEditor } from './source-editor'
import { Crepe } from '@milkdown/crepe'
import { commandsCtx, editorViewCtx,remarkStringifyOptionsCtx,parserCtx,serializerCtx } from '@milkdown/kit/core'
import { toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand, wrapInHeadingCommand, turnIntoTextCommand, wrapInBlockquoteCommand, wrapInBulletListCommand, wrapInOrderedListCommand } from '@milkdown/kit/preset/commonmark'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { documentMetrics } from './metrics'
import './styles.css'
import './themes.css'
import './fonts.css'
import './desktop-chrome.css'
import './writing-agent.css'
import './liquid-glass.css'
import './tauri-desktop.css'
import '@fontsource/pt-serif/latin-400.css'
import '@fontsource/pt-serif/latin-400-italic.css'
import '@fontsource/pt-serif/latin-700-italic.css'
import '@fontsource/merriweather/latin-300.css'
import '@fontsource/merriweather/latin-300-italic.css'
import '@fontsource/merriweather/latin-700.css'
import '@fontsource/merriweather/latin-700-italic.css'
import '@fontsource/lato/latin-300.css'
import '@fontsource/lato/latin-900.css'
import '@fontsource/lato/latin-900-italic.css'
import '@fontsource/vollkorn/latin-400-italic.css'
import '@fontsource/vollkorn/latin-700.css'
import '@fontsource/vollkorn/latin-700-italic.css'
import '@fontsource/pt-serif/latin-700.css'
import '@fontsource/merriweather/latin-400.css'
import '@fontsource/lato/latin-700.css'
import '@fontsource/vollkorn/latin-400.css'
import '@fontsource/open-sans/latin-400.css'
import '@fontsource/open-sans/latin-700.css'
import '@fontsource/open-sans/latin-400-italic.css'
import '@fontsource/open-sans/latin-700-italic.css'

type Mode = 'visual' | 'source' | 'split'
type SidebarTab = 'documents' | 'outline'
type DocumentRecord = { id: string; title: string; content: string; updatedAt: number; path?: string; token?: string; savedContent?: string; savedDiskContent?:string }

let preferences = readPreferences()
let manualReadOnly = false
let initialDesktopReady = false
let autoSaveTimer = 0
const windowKey = new URLSearchParams(location.search).get('window') || ''
const STORAGE_KEY = 'liubai.documents.v1' + (windowKey ? '.' + windowKey : '')
const ACTIVE_KEY = 'liubai.active.v1' + (windowKey ? '.' + windowKey : '')
const MODE_KEY = 'liubai.mode.v1'

const icons: Record<string, string> = {
  menu: '<circle cx="12" cy="12" r="7.5"/>',
  collapse: '<path d="m14 6-6 6 6 6"/>',
  list: '<path d="M4 4h6v6H4zM13 5h7M13 9h7M4 14h16M4 18h16"/>',
  close: '<path d="M5 5l14 14M19 5 5 19"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.2 4.2"/>',
  file: '<path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4M9 12h6M9 16h6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10H3Z"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  empty: '<path d="M5 4h14v16H5zM8 9h8M8 13h5"/>',
}

function svg(name: string, size = 18): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing element: ${id}`)
  return found as T
}

const ui = {
  sidebar: element<HTMLElement>('sidebar'),
  backdrop: element<HTMLElement>('mobile-backdrop'),
  sidebarToggle: element<HTMLButtonElement>('sidebar-toggle'),
  sidebarClose: element<HTMLButtonElement>('sidebar-close'),
  documentsTab: element<HTMLButtonElement>('tab-documents'),
  outlineTab: element<HTMLButtonElement>('tab-outline'),
  documentsPanel: element<HTMLElement>('documents-panel'),
  outlinePanel: element<HTMLElement>('outline-panel'),
  documentList: element<HTMLElement>('document-list'),
  documentCount: element<HTMLElement>('document-count'),
  search: element<HTMLInputElement>('document-search'),
  outlineList: element<HTMLElement>('outline-list'),
  title: element<HTMLInputElement>('document-title'),
  breadcrumb: element<HTMLElement>('breadcrumb-title'),
  updated: element<HTMLElement>('updated-label'),
  readingTime: element<HTMLElement>('reading-time'),
  visual: element<HTMLElement>('visual-view'),
  visualRoot: element<HTMLElement>('milkdown-root'),
  source: element<HTMLElement>('source-view'),
  sourceInput: element<HTMLTextAreaElement>('source-editor'),
  split: element<HTMLElement>('split-view'),
  splitInput: element<HTMLTextAreaElement>('split-editor'),
  preview: element<HTMLElement>('preview-content'),
  saveStatus: element<HTMLElement>('save-status'),
  wordCount: element<HTMLElement>('word-count'),
  lineCount: element<HTMLElement>('line-count'),
  fileInput: element<HTMLInputElement>('file-input'),
  moreButton: element<HTMLButtonElement>('more-menu-button'),
  moreMenu: element<HTMLElement>('more-menu'),
  toast: element<HTMLElement>('toast'),
  shortcuts: element<HTMLDialogElement>('shortcuts-dialog'),
}

let usedDraftBackup=true
function readDocuments(): DocumentRecord[] {
  for (const key of [STORAGE_KEY, STORAGE_KEY + '.backup']) try {
    const value = JSON.parse(localStorage.getItem(key) || 'null')
    if (!Array.isArray(value)) continue
    const valid = value.filter((doc): doc is DocumentRecord =>
      typeof doc?.id === 'string' && typeof doc?.title === 'string' &&
      typeof doc?.content === 'string' && typeof doc?.updatedAt === 'number')
    if (valid.length&&valid.length===value.length){usedDraftBackup=key!==STORAGE_KEY;return valid}
  } catch { /* Try the previous valid snapshot before starting a blank document. */ }
  return []
}

let documents = readDocuments()
if (documents.length === 0) {
  documents = [{ id: crypto.randomUUID(), title: '未命名', content: '', savedContent: '', updatedAt: Date.now() }]
}
let activeId = localStorage.getItem(ACTIVE_KEY) || documents[0].id
if (!documents.some((doc) => doc.id === activeId)) activeId = documents[0].id
let mode: Mode = (['visual', 'source', 'split'].includes(localStorage.getItem(MODE_KEY) || '')
  ? localStorage.getItem(MODE_KEY) : 'visual') as Mode
let crepe: Crepe | null = null
let mountToken = 0
let visualReady = false
const documentRevisions=new Map<string,number>()
let visualEdited = false
let visualBaseline = ''
let toastTimer = 0

function activeDocument(): DocumentRecord {
  return documents.find((doc) => doc.id === activeId) || documents[0]
}
const draftJournal=createDraftJournal(windowKey,()=>updateNativeState())
let draftSavedAt=usedDraftBackup?0:Number(localStorage.getItem(STORAGE_KEY+'.savedAt'))||0

function persist(): void {
  draftSavedAt=Math.max(Date.now(),draftSavedAt+1)
  draftJournal.write({savedAt:draftSavedAt,active:activeId,documents:documents.map(doc=>({...doc}))})
  try {
    const serialized=JSON.stringify(documents),previous=localStorage.getItem(STORAGE_KEY)
    if(previous&&previous!==serialized){
      // Backup failure must not prevent storing the latest article near quota.
      try{if(Array.isArray(JSON.parse(previous)))localStorage.setItem(STORAGE_KEY+'.backup',previous)}catch{}
    }
    localStorage.setItem(STORAGE_KEY, serialized)
    localStorage.setItem(ACTIVE_KEY, activeId)
    localStorage.setItem(STORAGE_KEY+'.savedAt',String(draftSavedAt))
    updateNativeState()
  } catch {
    ui.saveStatus.textContent = '草稿儲存空間不足，請儲存至檔案'
    notify('草稿儲存失敗，請按 Ctrl+S 儲存 Markdown 備份')
  }
}

function schedulePersist(): void {
  // Do not leave the last keystrokes only in a debounce timer.
  persist()
}

function isDirty(doc: DocumentRecord): boolean {
  return doc.savedContent !== doc.content
}

function updateNativeState(): void {
  const doc = activeDocument()
  ui.saveStatus.textContent = draftJournal.failed ? translate('草稿儲存失敗，請按 Ctrl+S 儲存 Markdown 備份') : isDirty(doc) ? '● 尚未儲存至檔案 · 草稿自動保留' : '✓ 已儲存至檔案'
  ui.saveStatus.title = doc.path || '按 Ctrl+S 選擇儲存位置'
  ui.breadcrumb.title = doc.path || '未儲存的草稿'
  ui.title.readOnly = Boolean(doc.path)
  window.desktop?.state({ dirty: documents.some(isDirty), activeDirty: isDirty(doc), draftSafe:draftJournal.safe, title: doc.path || (doc.title==='未命名'?translate('未命名'):doc.title) })
  const windowTitle=document.getElementById('seamless-document-title');if(windowTitle)windowTitle.textContent=`${doc.path?.split(/[\\/]/).at(-1)||(doc.title==='未命名'?translate('未命名'):doc.title)}${isDirty(doc)?' •':''} - wuffi`
}

async function openNativeFile(initialFiles?: NativeFile[]): Promise<void> {
  flushVisual()
  if (!window.desktop) { ui.fileInput.click(); return }
  try {
    for (const file of initialFiles || await window.desktop.open()) {
      const existing = documents.find((doc) => doc.path?.toLocaleLowerCase() === file.path.toLocaleLowerCase())
      if (existing) {
        // Refresh file authorization, keeping the recovered draft's disk baseline.
        existing.token=file.token
        if (!isDirty(existing)) { existing.token = file.token; existing.content = file.content; existing.savedContent = file.content;existing.savedDiskContent=file.content }
        activeId = existing.id
      } else {
        const doc = { ...file, id: crypto.randomUUID(), savedContent: file.content, updatedAt: Date.now() }
        documents.unshift(doc)
        activeId = doc.id
      }
    }
    persist()
    renderCurrentDocument()
  } catch (error) { notify(`無法開啟檔案：${String(error)}`) }
}

let saveQueue:Promise<void>=Promise.resolve()
function saveNativeFile(saveAs = false, target = activeDocument()): Promise<void> {
  flushVisual()
  const work=saveQueue.then(()=>performNativeSave(saveAs,target))
  saveQueue=work.catch(()=>{})
  return work
}
async function performNativeSave(saveAs: boolean, target:DocumentRecord): Promise<void> {
  flushVisual()
  if (!window.desktop) { downloadDocument(); return }
  const doc = target
  const submitted = doc.content
  const content = preferences.formatOnSave ? doc.content.replace(/^\t+/gm, tabs => ' '.repeat(tabs.length * preferences.tabSize)) : doc.content
  const ending = preferences.lineEnding === 'crlf' || (preferences.lineEnding === 'preserve' && (doc.savedDiskContent??doc.savedContent)?.includes('\r\n')) ? '\r\n' : '\n'
  const diskContent = content.replace(/\r?\n/g, ending)
  try {
    const result = await window.desktop.save({ token: doc.token, title: doc.title, content: diskContent, expectedContent:doc.savedDiskContent??doc.savedContent, saveAs, extension: preferences.extension })
    if (!result) return
    flushVisual()
    Object.assign(doc, result, { savedContent: content, savedDiskContent:diskContent })
    if(doc.content===submitted){
      doc.content=content
      if(doc.id===activeId){
        ui.sourceInput.value=content;if(mode==='source')sourceEditor.setContent(content);ui.splitInput.value=content
        if(content!==submitted)renderCurrentDocument()
      }
    }
    persist()
    renderDocuments()
    if (doc.id === activeId) { ui.title.value = doc.title; ui.breadcrumb.textContent = doc.title }
    notify(`已儲存：${result.path}`)
  } catch (error) { notify(`儲存失敗：${String(error)}`) }
}

function notify(message: string): void {
  ui.toast.textContent = message
  ui.toast.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => ui.toast.classList.remove('show'), 3200)
}

function formatUpdated(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return '剛剛編輯'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分鐘前編輯`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小時前編輯`
  return new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric' }).format(timestamp) + ' 編輯'
}

function updateMetrics(): void {
  const doc = activeDocument()
  const count = documentMetrics(doc.content).words
  ui.wordCount.textContent = `${count.toLocaleString()} 字`
  ui.lineCount.textContent = `${doc.content ? doc.content.split('\n').length : 0} 行`
  ui.readingTime.textContent = `約 ${Math.max(1, Math.ceil(count / preferences.readingSpeed))} 分鐘閱讀`
  ui.updated.textContent = formatUpdated(doc.updatedAt)
}

function renderDocuments(): void {
  const query = ui.search.value.trim().toLocaleLowerCase()
  ui.documentCount.textContent = String(documents.length)
  ui.documentList.replaceChildren()
  const filtered = [...documents]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((doc) => doc.title.toLocaleLowerCase().includes(query) || doc.content.toLocaleLowerCase().includes(query))

  if (!filtered.length) {
    const empty = document.createElement('p')
    empty.className = 'empty-list'
    empty.textContent = query ? '找不到符合的文件' : '尚無文件'
    ui.documentList.append(empty)
    return
  }

  for (const doc of filtered) {
    const button = document.createElement('button')
    button.className = `document-item${doc.id === activeId ? ' selected' : ''}`
    button.type = 'button'
    button.setAttribute('role', 'listitem')
    button.setAttribute('aria-current', doc.id === activeId ? 'page' : 'false')
    button.innerHTML = `<span class="document-item-copy"><span class="document-item-meta"><span class="document-folder"></span><span class="document-time"></span></span><span class="document-item-title"></span><span class="document-item-date"></span></span>`
    if(doc.path)button.querySelector('.document-folder')!.setAttribute('data-user-content','true')
    button.querySelector('.document-folder')!.textContent = doc.path?.split(/[\\/]/).slice(-2,-1)[0] || '未儲存'
    button.querySelector('.document-time')!.textContent = formatUpdated(doc.updatedAt)
    button.querySelector('.document-item-title')!.textContent = `${isDirty(doc) ? '● ' : ''}${!doc.path&&doc.title==='未命名'?translate('未命名'):(doc.title || translate('未命名文件'))}`
    button.title = doc.path || '本機草稿'
    button.querySelector('.document-item-date')!.textContent = doc.content.replace(/[#*_`>\[\]]/g, '').trim().slice(0, 100) || ''
    button.addEventListener('click', () => selectDocument(doc.id))
    ui.documentList.append(button)
  }
}

type Heading = { level: number; text: string; line: number }
function headingsFromMarkdown(markdown: string): Heading[] {
  const headings: Heading[] = []
  let line = 0
  for(const token of marked.lexer(markdown.replace(/\r\n?/g,'\n'))){
    if(token.type==='heading'){
      const label=document.createElement('span');label.innerHTML=DOMPurify.sanitize(marked.parseInline(token.text) as string)
      headings.push({level:token.depth,text:label.textContent||token.text,line})
    }
    line+=(token.raw.match(/\n/g)||[]).length
  }
  return headings
}

const collapsedHeadings = new Set<string>()
function renderOutline(): void {
  const headings = headingsFromMarkdown(activeDocument().content)
  ui.outlineList.replaceChildren()
  if (!headings.length) {
    const empty = document.createElement('p')
    empty.className = 'empty-outline'
    empty.textContent = '加入 # 標題後，這裡會顯示文件大綱。'
    ui.outlineList.append(empty)
    return
  }
  let hiddenBelow = 7
  headings.forEach((heading, index) => {
    if (heading.level > hiddenBelow) return
    hiddenBelow = 7
    const foldKey = activeId + ':' + index + ':' + heading.text
    const hasChildren = headings[index + 1]?.level > heading.level
    if (preferences.outlineFold && collapsedHeadings.has(foldKey)) hiddenBelow = heading.level
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'outline-item'
    button.style.setProperty('--depth', String(Math.min(heading.level - 1, 3)))
    button.textContent = heading.text
    button.title = heading.text
    if (preferences.outlineFold && hasChildren) {
      const toggle = document.createElement('span'); toggle.textContent = collapsedHeadings.has(foldKey) ? '▸ ' : '▾ '
      toggle.setAttribute('role','button'); toggle.setAttribute('aria-label','展開／折疊 ' + heading.text)
      toggle.onclick = event => { event.stopPropagation(); collapsedHeadings.has(foldKey) ? collapsedHeadings.delete(foldKey) : collapsedHeadings.add(foldKey); renderOutline() }
      button.prepend(toggle)
    }
    button.addEventListener('click', () => {
      closeMobileSidebar()
      if (mode === 'visual') {
        const nodes = ui.visualRoot.querySelectorAll('h1,h2,h3,h4,h5,h6')
        nodes[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        const textarea = mode === 'source' ? ui.sourceInput : ui.splitInput
        const lines = textarea.value.split('\n')
        const offset = lines.slice(0, heading.line).reduce((total, line) => total + line.length + 1, 0)
        textarea.focus()
        textarea.setSelectionRange(offset, offset)
        textarea.scrollTop = Math.max(0, heading.line * 25 - textarea.clientHeight / 3)
      }
    })
    ui.outlineList.append(button)
  })
}

function updateContent(content: string): void {
  const doc = activeDocument()
  if (doc.content === content) return
  documentRevisions.set(doc.id,(documentRevisions.get(doc.id)||0)+1)
  doc.content = content
  doc.updatedAt = Date.now()
  updateMetrics()
  renderOutline()
  renderDocuments()
  schedulePersist()
  window.clearTimeout(autoSaveTimer)
  if (preferences.autoSave && doc.token) autoSaveTimer = window.setTimeout(() => { if (activeDocument().id === doc.id) void saveNativeFile() }, 1500)
}

function renderPreview(): void {
  const html = marked.parse(ui.splitInput.value, { gfm: true, breaks: false })
  ui.preview.innerHTML = DOMPurify.sanitize(String(html), { USE_PROFILES: { html: true } })
  ui.preview.querySelectorAll('a').forEach((link) => {
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
  })
}

type VisualSession={editor:Crepe;root:HTMLElement;content:string;serialize:typeof inlineMarkdown;baseline:string;edited:boolean;revision:number;scroll:number}
const visualSessions=new Map<string,VisualSession>()
let visualDocumentId='',visualContainer:HTMLElement|null=null,syntaxRevision=0,mountedSyntaxRevision=0
function unmountVisual(): void {
  mountToken++
  visualReady = false
  if (crepe && visualContainer) {
    const scroll=document.querySelector<HTMLElement>('.workspace')!.scrollTop
    visualContainer.remove()
    const view=crepe.editor.action(ctx=>ctx.get(editorViewCtx));clearInlineReview(view);view.dispatch(view.state.tr)
    visualSessions.set(visualDocumentId,{editor:crepe,root:visualContainer,content:documents.find(doc=>doc.id===visualDocumentId)?.content||'',serialize:serializeVisual,baseline:visualBaseline,edited:visualEdited,revision:mountedSyntaxRevision,scroll})
    crepe = null
  }
  visualContainer=null
  ui.visualRoot.replaceChildren()
  for(const [id,session] of visualSessions)if(!documents.some(doc=>doc.id===id)||visualSessions.size>12){void session.editor.destroy();visualSessions.delete(id)}
}
let serializeVisual:typeof inlineMarkdown=inlineMarkdown
function flushVisual(): void {
  if (mode === 'visual' && crepe && visualReady && visualEdited) {
    const markdown=crepe.editor.action(serializeVisual)
    if (markdown!==visualBaseline) { visualBaseline=markdown; updateContent(markdown) }
    persist()
  }
}

async function mountVisual(): Promise<void> {
  unmountVisual()
  visualEdited = false
  const token = mountToken
  const docId = activeId
  const restored=visualSessions.get(docId)
  if(restored){
    visualSessions.delete(docId)
    if(restored.content===activeDocument().content&&restored.revision===syntaxRevision){
      crepe=restored.editor;visualContainer=restored.root;visualDocumentId=docId;mountedSyntaxRevision=syntaxRevision
      ui.visualRoot.append(restored.root);serializeVisual=restored.serialize;visualBaseline=restored.baseline;visualEdited=restored.edited
      crepe.setReadonly(document.body.classList.contains('read-only'));visualReady=true
      const view=crepe.editor.action(ctx=>ctx.get(editorViewCtx));view.dispatch(view.state.tr);view.dom.setAttribute('spellcheck',String(preferences.spellcheck))
      document.querySelector<HTMLElement>('.workspace')!.scrollTop=restored.scroll
      refreshTypewriter()
      return
    }
    void restored.editor.destroy()
  }
  const root=document.createElement('div');root.className='editor-instance';ui.visualRoot.append(root)
  const editor = new Crepe({
    root,
    defaultValue: activeDocument().content,
    features: { [Crepe.Feature.Toolbar]: false, [Crepe.Feature.BlockEdit]: false },
    featureConfigs: { [Crepe.Feature.CodeMirror]: {languages,renderPreview:renderDiagram,previewLabel:'預覽',previewLoading:'正在繪製…',searchPlaceholder:'搜尋語言',copyText:'複製',noResultText:'沒有符合的語言'}, [Crepe.Feature.Placeholder]: { text: '', mode: 'block' }, [Crepe.Feature.ImageBlock]: { onUpload: file => new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file)}), inlineUploadButton:'選擇圖片',blockUploadButton:'選擇圖片',blockCaptionPlaceholderText:'圖片說明',blockUploadPlaceholderText:'或貼上圖片連結',blockConfirmButton:'確定', proxyDomURL: async (src: string) => { try { return await window.desktop?.resolveImage({ token: activeDocument().token, src }) || src } catch { return src } } } },
  })
  editor.editor.config(ctx=>ctx.set(remarkGFMPlugin.options.key,{singleTilde:false}))
  editor.editor.config(ctx=>ctx.update(remarkStringifyOptionsCtx,options=>({...options,setext:preferences.headingStyle==='setext',bullet:preferences.bulletStyle as '-'|'*'|'+',incrementListMarker:preferences.orderedIncrement})))
  for(const mark of optionalMarks)editor.editor.use(mark)
  editor.editor.use(syntaxPreferences)
  for (const mark of inlineMarks) editor.editor.use(mark)
  editor.editor.use(inlineRemark)
  for (const extension of markdownExtensions) editor.editor.use(extension)
  editor.editor.use(typingRules).use(mathDelimiters).use(advancedMath).use(focusMode).use(inlineReview)
  editor.editor.use($prose(()=>new Plugin({view(){return {update(view,previous){
    if(writingDocument(view.state.doc).eq(writingDocument(previous.doc)))return
    // The transaction has completed: serialize its actual model immediately,
    // including IME and programmatic edits, without the listener debounce.
    if(crepe===editor&&visualReady&&docId===activeId){visualEdited=true;flushVisual()}
  }}}})))
  setReferenceImageResolver(async src=>await window.desktop?.resolveImage({token:activeDocument().token,src})||src)
  editor.editor.use(flexibleTable).use(tableTools)
  editor.editor.use(preservedImage).use(imageHtml).use(imageTools)
  await editor.editor.remove(remarkInlineLinkPlugin)
  editor.on((listener) => {
    listener.markdownUpdated((_ctx, markdown, previous) => {
      if (crepe !== editor || !visualReady || !visualEdited || docId !== activeId || markdown === previous) return
      markdown=serializeVisual(_ctx)
      if (markdown === visualBaseline) return
      visualBaseline = markdown
      updateContent(markdown)
    })
  })
  try {
    await editor.create()
    if (token !== mountToken || docId !== activeId || mode !== 'visual') {
      editor.destroy()
      return
    }
    crepe = editor
    visualContainer=root;visualDocumentId=docId;mountedSyntaxRevision=syntaxRevision
    serializeVisual=editor.editor.action(ctx=>preserveSource(ctx,activeDocument().content))
    visualBaseline = editor.editor.action(serializeVisual)
    crepe.setReadonly(document.body.classList.contains('read-only'))
    ui.visualRoot.querySelector('.ProseMirror')?.setAttribute('spellcheck', String(preferences.spellcheck))
    visualReady = true
    refreshTypewriter()
    {
      const blocks:{language:string;content:string}[]=[]
      editor.editor.action(ctx=>ctx.get(editorViewCtx).state.doc.descendants(node=>{if(node.type.name==='code_block')blocks.push({language:String(node.attrs.language||''),content:node.textContent});return true}))
      warmDiagrams(blocks,()=>crepe===editor&&visualDocumentId===docId)
    }
  } catch (error) {
    console.error('Failed to start visual editor', error)
    notify('視覺編輯器無法啟動，已切換至原始碼')
    if (mode === 'visual') setMode('source')
  }
}

const sourceEditor = createSourceEditor(element('source-code'), value => {
  ui.sourceInput.value = value
  if (mode === 'source') updateContent(value)
})

// Native safety-test builds opt in before page scripts run. This fixture only
// prepares selections and inspects the real editor state in a hidden WebView;
// production builds never set the flag and expose no test accessor.
if((window as any).__WUFFI_BACKGROUND_TEST__){
  Object.defineProperty(window,'__WUFFI_TEST_EDITOR',{value:()=>({visual:crepe?.editor.action(ctx=>ctx.get(editorViewCtx)),source:sourceEditor.view,TextSelection,ready:initialDesktopReady})})
}

function renderMode(): void {
  sourceEditor.clearReview()
  document.querySelector('.chrome-preview')?.setAttribute('aria-pressed',String(mode==='split'))
  document.body.classList.toggle('source-mode', mode === 'source')
  element('source-toggle').textContent = mode === 'source' ? '</> 離開原始碼模式' : '</>'
  element<HTMLButtonElement>('source-toggle').classList.toggle('active', mode === 'source')
  ui.visual.hidden = mode !== 'visual'
  ui.source.hidden = mode !== 'source'
  ui.split.hidden = mode !== 'split'
  document.querySelectorAll<HTMLButtonElement>('.mode-button').forEach((button) => {
    const selected = button.dataset.mode === mode
    button.classList.toggle('active', selected)
    button.setAttribute('aria-pressed', String(selected))
  })
  if (mode === 'visual') {
    void mountVisual()
  } else {
    unmountVisual()
    ui.sourceInput.value = activeDocument().content
    sourceEditor.setDocument(activeId,activeDocument().content)
    sourceEditor.retainDocuments(documents.map(doc=>doc.id))
    ui.splitInput.value = activeDocument().content
    if (mode === 'split') renderPreview()
  }
}

function setMode(next: Mode): void {
  if (next === mode) return
  flushVisual()
  mode = next
  localStorage.setItem(MODE_KEY, mode)
  renderMode()
  refreshTypewriter()
  if (mode === 'source') sourceEditor.focus()
  if (mode === 'split') ui.splitInput.focus()
}

function renderCurrentDocument(): void {
  const doc = activeDocument()
  ui.title.value = doc.title
  ui.breadcrumb.textContent = doc.title || '未命名文件'
  renderDocuments()
  renderOutline()
  updateMetrics()
  renderMode()
  updateNativeState()
}

async function selectDocument(id: string): Promise<void> {
  if (id === activeId || !documents.some((doc) => doc.id === id)) return
  flushVisual()
  if (preferences.saveOnSwitch && isDirty(activeDocument()) && activeDocument().token) await saveNativeFile()
  activeId = id
  persist()
  renderCurrentDocument()
  closeMobileSidebar()
}

function createDocument(title = '未命名', content = ''): void {
  flushVisual()
  const doc = { id: crypto.randomUUID(), title, content, savedContent: content === '' ? '' : undefined, updatedAt: Date.now() }
  documents.unshift(doc)
  activeId = doc.id
  ui.search.value = ''
  persist()
  renderCurrentDocument()
  closeMobileSidebar()
  refreshTypewriter()
  if (mode === 'source') sourceEditor.focus()
  notify('已建立新文件')
}

function duplicateDocument(): void {
  const doc = activeDocument()
  createDocument(`${doc.title} 副本`, doc.content)
  closeMoreMenu()
}

async function deleteDocument(): Promise<void> {
  const doc = activeDocument()
  const before=doc.content
  if (!await confirmDialog(translate(`確定要移除「${doc.title}」的草稿？未儲存的修改將遺失，磁碟上的檔案會保留。`))) return
  if(activeId!==doc.id||doc.content!==before){notify('確認期間文章已變更，目前的內容已保留');return}
  documents = documents.filter((item) => item.id !== doc.id)
  if (!documents.length) documents.push({ id: crypto.randomUUID(), title: '未命名文件', content: '', updatedAt: Date.now() })
  activeId = documents[0].id
  closeMoreMenu()
  persist()
  renderCurrentDocument()
  notify('已移除草稿，磁碟上的檔案仍然保留')
}

function downloadDocument(): void {
  const doc = activeDocument()
  const fileName = `${(doc.title || '未命名文件').replace(/[\\/:*?"<>|]/g, '-').trim() || '未命名文件'}.md`
  const blob = new Blob([doc.content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  notify(`已下載 ${fileName}`)
}

function setSidebarTab(next: SidebarTab): void {
  ui.documentsPanel.hidden = next !== 'documents'
  ui.outlinePanel.hidden = next !== 'outline'
  document.querySelector('.sidebar-footer')!.classList.toggle('outline-footer', next === 'outline')
  for (const [button, tab] of [[ui.documentsTab, 'documents'], [ui.outlineTab, 'outline']] as const) {
    button.classList.toggle('active', next === tab)
    button.setAttribute('aria-selected', String(next === tab))
  }
}

function closeMobileSidebar(): void {
  ui.sidebar.classList.remove('mobile-open')
  ui.backdrop.hidden = true
}

function closeMoreMenu(): void {
  ui.moreMenu.hidden = true
  ui.moreButton.setAttribute('aria-expanded', 'false')
}

function installIcons(): void {
  element<HTMLElement>('new-icon').innerHTML = svg('plus', 17)
  element<HTMLElement>('search-icon').innerHTML = svg('search', 16)
  ui.sidebarToggle.innerHTML = svg('menu')
  ui.sidebarClose.innerHTML = svg('close')
  element<HTMLButtonElement>('open-file').innerHTML = svg('folder')
  element<HTMLButtonElement>('download-file').innerHTML = svg('download')
  ui.moreButton.innerHTML = svg('dots')
  element<HTMLButtonElement>('close-shortcuts').innerHTML = svg('close')
}

async function executeDesktopCommand(command:string):Promise<void>{
    if(!availableDesktopCommand(command)){notify(currentLanguage()==='en'?'This desktop integration is not available in the Tauri prototype yet.':'Tauri 原型尚未支援這項桌面整合。');return}
    handleExtraCommand(command)
    if (command === 'new') createDocument()
    if (command === 'open') await openNativeFile()
    if (command === 'save') await saveNativeFile()
    if (command === 'saveAs') await saveNativeFile(true)
    if(command==='chrome-menu'){document.body.classList.remove('chrome-collapsed');document.body.classList.add('writing-menu-visible');document.querySelector<HTMLButtonElement>('.chrome-menubar nav button')?.focus()}
    if (command === 'source') setMode(mode === 'visual' ? 'source' : 'visual')
    if (command === 'sidebar') ui.sidebarToggle.click()
    if (command === 'outline') { showSidebar(); setSidebarTab('outline') }
    if (command === 'articles') { showSidebar(); setSidebarTab('documents'); element('tree-list').hidden = true; ui.documentList.hidden = false }
    if (command === 'tree') { showSidebar(); setSidebarTab('documents'); element('tree-list').hidden = false; ui.documentList.hidden = true; if (!folderRoot) void openFolder() }
    if (command === 'folder') void openFolder()
    if (command === 'search') { showSidebar(); setSidebarTab('documents'); element('search-field').hidden = false; ui.search.focus() }
    if (command === 'status') changePreferences({ ...preferences, status: !preferences.status })
    if (command === 'toolbar') changePreferences({ ...preferences, toolbar: !preferences.toolbar })
    if (command === 'words') { updateWordPopover(); element('word-popover').hidden = !element('word-popover').hidden }
    if (command === 'readonly') {
      manualReadOnly = !manualReadOnly
      syncReadOnly()
    }
    if (command === 'split') setMode(mode === 'split' ? 'visual' : 'split')
    if (command === 'focus') { document.body.classList.toggle('focus-mode'); updateFocusedBlock() }
    if (command === 'typewriter') { document.body.classList.toggle('typewriter-mode');refreshTypewriter() }
    if (command === 'light' || command === 'night') {
      document.body.classList.toggle('night', command === 'night')
      changePreferences({ ...preferences, theme: command, followSystem:false })
    }
    if (command === 'shortcuts') ui.shortcuts.showModal()
    if (command.startsWith('format:')) applyFormat(command.slice(7))

}

function bindEvents(): void {
  for (const event of ['beforeinput', 'pointerdown', 'keydown', 'editor-change']) ui.visualRoot.addEventListener(event, () => { visualEdited = true })
  element<HTMLButtonElement>('source-toggle').addEventListener('click', () => setMode(mode === 'source' ? 'visual' : 'source'))
  element<HTMLButtonElement>('new-document').addEventListener('click', () => createDocument())
  ui.search.addEventListener('input', renderDocuments)
  ui.documentsTab.addEventListener('click', () => setSidebarTab('documents'))
  ui.outlineTab.addEventListener('click', () => setSidebarTab('outline'))
  ui.sidebarToggle.addEventListener('click', () => {
    if(getComputedStyle(ui.sidebar).display==='none')showSidebar();else hideSidebar()
  })
  ui.sidebarClose.addEventListener('click', closeMobileSidebar)
  ui.backdrop.addEventListener('click', closeMobileSidebar)
  document.querySelectorAll<HTMLButtonElement>('.mode-button').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode as Mode))
  })
  ui.title.addEventListener('input', () => {
    const doc = activeDocument()
    doc.title = ui.title.value
    doc.updatedAt = Date.now()
    ui.breadcrumb.textContent = doc.title || '未命名文件'
    renderDocuments()
    updateMetrics()
    schedulePersist()
  })
  ui.title.addEventListener('blur', () => {
    if (!ui.title.value.trim()) {
      ui.title.value = '未命名文件'
      activeDocument().title = ui.title.value
      ui.breadcrumb.textContent = ui.title.value
      schedulePersist()
    }
  })
  ui.sourceInput.addEventListener('input', () => { updateContent(ui.sourceInput.value); sourceEditor.setContent(ui.sourceInput.value) })
  ui.splitInput.addEventListener('input', () => {
    updateContent(ui.splitInput.value)
    renderPreview()
  })
  element<HTMLButtonElement>('open-file').addEventListener('click', () => void openNativeFile())
  ui.fileInput.addEventListener('change', async () => {
    const file = ui.fileInput.files?.[0]
    if (!file) return
    try {
      const content = await file.text()
      createDocument(file.name.replace(/\.(md|markdown|txt)$/i, ''), content)
      notify(`已開啟 ${file.name}`)
    } catch {
      notify('無法讀取這個檔案')
    }
    ui.fileInput.value = ''
  })
  element<HTMLButtonElement>('download-file').addEventListener('click', () => void saveNativeFile())
  ui.moreButton.addEventListener('click', () => {
    const expanded = ui.moreMenu.hidden
    ui.moreMenu.hidden = !expanded
    ui.moreButton.setAttribute('aria-expanded', String(expanded))
  })
  element<HTMLButtonElement>('rename-document').addEventListener('click', () => {
    closeMoreMenu()
    if (window.desktop) { void saveNativeFile(true); return }
    ui.title.focus()
    ui.title.select()
  })
  element<HTMLButtonElement>('duplicate-document').addEventListener('click', duplicateDocument)
  element<HTMLButtonElement>('delete-document').addEventListener('click', deleteDocument)
  element<HTMLButtonElement>('show-shortcuts').addEventListener('click', () => {
    closeMoreMenu()
    ui.shortcuts.showModal()
  })
  element<HTMLButtonElement>('close-shortcuts').addEventListener('click', () => ui.shortcuts.close())
  document.addEventListener('click', (event) => {
    if (!ui.moreMenu.hidden && !ui.moreMenu.contains(event.target as Node) && !ui.moreButton.contains(event.target as Node)) closeMoreMenu()
  })
  document.addEventListener('keydown', (event) => {
    const modifier = event.ctrlKey || event.metaKey
    if (event.key === 'Escape') { closeMoreMenu(); closeMobileSidebar(); return }
    if (!modifier) return
    const key = event.key.toLowerCase()
    if (window.desktop) return // Native menu owns accelerators.
    if (key === 's') { event.preventDefault(); void saveNativeFile(event.shiftKey) }
    if (key === 'o') { event.preventDefault(); void openNativeFile() }
    if (key === 'n') { event.preventDefault(); createDocument() }
    if (event.key === '/') { event.preventDefault(); setMode(mode === 'visual' ? 'source' : 'visual') }
  })
  window.addEventListener('beforeunload', () => { flushVisual(); persist() })
  window.desktop?.onCommand(command=>{void executeDesktopCommand(command).catch(error=>notify(String(error)))})
  document.addEventListener('selectionchange', updateFocusedBlock)
  element('folder-button').addEventListener('click', () => void openFolder())
  element('sidebar-search').addEventListener('click', () => { element('search-field').hidden = !element('search-field').hidden; if (!element('search-field').hidden) ui.search.focus() })
  element('sidebar-list').addEventListener('click', () => { element('sidebar-view-menu').hidden = !element('sidebar-view-menu').hidden })
  element('show-articles').addEventListener('click', () => { element('sidebar-view-menu').hidden = true; element('tree-list').hidden = true; ui.documentList.hidden = false })
  element('show-tree').addEventListener('click', () => { element('sidebar-view-menu').hidden = true; element('tree-list').hidden = false; ui.documentList.hidden = true; if (!folderRoot) void openFolder() })
  element('word-count').addEventListener('click', () => { updateWordPopover(); element('word-popover').hidden = !element('word-popover').hidden })
  document.querySelectorAll<HTMLElement>('[data-format]').forEach(button => button.addEventListener('click', () => applyFormat(button.dataset.format!)))
}

let folderRoot = ''
let folderToken = ''
let folderSearchVersion=0
async function searchLibrary():Promise<void>{
  const query=ui.search.value.trim(),version=++folderSearchVersion
  document.getElementById('library-results')?.remove()
  if(!folderToken||!query||!window.desktop)return
  const results=await window.desktop.searchFolder({token:folderToken,query})
  if(version!==folderSearchVersion)return
  const container=document.createElement('div');container.id='library-results'
  const title=document.createElement('div');title.className='section-label';title.textContent=`資料夾全文搜尋 · ${results.length} 筆`;container.append(title)
  for(const result of results){const button=document.createElement('button');button.className='library-match';const label=document.createElement('strong');label.textContent=`${result.path}:${result.line}`;const excerpt=document.createElement('small');excerpt.textContent=result.text;button.append(label,excerpt);button.onclick=async()=>{const file=await window.desktop!.readFolderFile(result.token);await openNativeFile([file]);setMode('source');const line=sourceEditor.view.state.doc.line(Math.min(result.line,sourceEditor.view.state.doc.lines));sourceEditor.view.dispatch({selection:{anchor:line.from},scrollIntoView:true});sourceEditor.focus()};container.append(button)}
  ui.documentsPanel.append(container)
}
function showSidebar(): void {
  document.body.classList.add('writing-navigation')
  ui.sidebar.classList.remove('collapsed')
  localStorage.setItem('liubai.sidebar', 'true')
  ui.sidebarToggle.innerHTML = svg('collapse')
}
function hideSidebar(): void {
  document.body.classList.remove('writing-navigation')
  ui.sidebar.classList.add('collapsed')
  localStorage.setItem('liubai.sidebar','false')
  ui.sidebarToggle.innerHTML=svg('menu')
  closeMobileSidebar()
  if(ui.sidebar.contains(document.activeElement))document.querySelector<HTMLButtonElement>('.chrome-sidebar')?.focus({preventScroll:true})
}
async function openFolder(recentIndex?:number): Promise<void> {
  if (!window.desktop) return
  try {
    const root = recentIndex===undefined?await window.desktop.openFolder():await window.desktop.recentFolder(recentIndex)
    if (!root) return
    expandedFolders.clear()
    folderRoot = root.name
    folderToken = root.token
    element('folder-button').textContent = root.name
    element('folder-button').title = root.path
    showSidebar()
    setSidebarTab('documents')
    ui.documentList.hidden = true
    element('tree-list').hidden = false
    element('tree-list').replaceChildren()
    await renderTree(root.entries, element('tree-list'), 0)
  } catch (error) { notify(`無法開啟資料夾：${String(error)}`) }
}
const expandedFolders=new Set<string>()
async function refreshTree():Promise<void>{if(!folderToken||!window.desktop)return;const token=folderToken,entries=await window.desktop.listFolder(token),next=document.createElement('div');await renderTree(entries,next,0);if(token===folderToken)element('tree-list').replaceChildren(...Array.from(next.childNodes))}
async function renderTree(entries: FolderEntry[], container: HTMLElement, depth: number,parent=''): Promise<void> {
  for (const entry of entries) {
    const row = document.createElement('button')
    const relative=parent+'/'+entry.name
    row.className = 'tree-item'
    row.style.paddingLeft = `${12 + depth * 16}px`
    row.textContent = `${entry.directory ? '▸  ' : '    '}${entry.name}`
    const children = document.createElement('div')
    children.hidden = true
    container.append(row, children)
    if(entry.directory && expandedFolders.has(relative)){await renderTree(await window.desktop!.listFolder(entry.token),children,depth+1,relative);children.hidden=false;row.textContent='▾  '+entry.name}
    row.addEventListener('click', async () => {
      try {
        if (entry.directory) {
          if (!children.childElementCount) await renderTree(await window.desktop!.listFolder(entry.token), children, depth + 1,relative)
          children.hidden = !children.hidden
          if(children.hidden)expandedFolders.delete(relative);else expandedFolders.add(relative)
          row.textContent = `${children.hidden ? '▸' : '▾'}  ${entry.name}`
        } else {
          const file = await window.desktop!.readFolderFile(entry.token)
          const existing = documents.find(doc => doc.path === file.path)
          if (existing) activeId = existing.id
          else { const doc = { ...file, id: crypto.randomUUID(), savedContent: file.content, updatedAt: Date.now() }; documents.unshift(doc); activeId = doc.id }
          persist(); renderCurrentDocument()
          element('tree-list').querySelectorAll('.selected').forEach(node => node.classList.remove('selected'))
          row.classList.add('selected')
        }
      } catch (error) { notify(String(error)) }
    })
  }
}
function updateWordPopover(): void {
  const text = activeDocument().content
  element('stat-words').textContent = ui.wordCount.textContent.replace(/\s*字$/,'')
  element('stat-chars').textContent = String(documentMetrics(text).characters)
  element('stat-lines').textContent = String(text.split('\n').length)
  const minutes=Math.ceil(Number(ui.wordCount.textContent.replace(/[^\d]/g,''))/preferences.readingSpeed)
  element('stat-read').textContent = minutes<=1?'≤ 1':String(minutes)
}

function refreshTypewriter(): void {
  const workspace=document.querySelector<HTMLElement>('.workspace')!
  document.body.style.setProperty('--typewriter-space', `${workspace.clientHeight/2}px`)
  requestAnimationFrame(()=>{
    if(!document.body.classList.contains('typewriter-mode'))return
    if(mode==='source')sourceEditor.centerCursor()
    else updateFocusedBlock()
  })
}

function updateFocusedBlock(event?:Event): void {
  if (mode !== 'visual' || !crepe || !visualReady || !document.body.classList.contains('typewriter-mode')) return
  const view=crepe.editor.action(ctx=>ctx.get(editorViewCtx))
  if(!view.state.selection.empty||isSelectingText())return
  const selection=window.getSelection()
  if(event&&(!view.hasFocus()||!selection?.isCollapsed||!selection.anchorNode||!view.dom.contains(selection.anchorNode)))return
  const caret=view.coordsAtPos(view.state.selection.head)
  const workspace=document.querySelector<HTMLElement>('.workspace')!
  const bounds=workspace.getBoundingClientRect()
  workspace.scrollTop+=(caret.top+caret.bottom)/2-(bounds.top+workspace.clientHeight/2)
}

function applyFormat(format: string): void {
  if (document.body.classList.contains('read-only')) return
  if (mode === 'visual' && crepe && visualReady) {
    visualEdited = true
    crepe.editor.action((ctx) => {
      const commands = ctx.get(commandsCtx)
      if (format.startsWith('h')) commands.call(wrapInHeadingCommand.key, Number(format.slice(1)))
      if (format === 'paragraph') commands.call(turnIntoTextCommand.key)
      if (format === 'bold') commands.call(toggleStrongCommand.key)
      if (format === 'italic') commands.call(toggleEmphasisCommand.key)
      if (format === 'code') commands.call(toggleInlineCodeCommand.key)
      if (format === 'quote') commands.call(wrapInBlockquoteCommand.key)
      if (format === 'list') commands.call(wrapInBulletListCommand.key)
      if (format === 'ordered') commands.call(wrapInOrderedListCommand.key)
      if (format === 'strike') commands.call(toggleStrikethroughCommand.key)
      if (['underline','sub','sup','highlight'].includes(format)) { const view=ctx.get(editorViewCtx); const name = ({underline:'u',sub:'sub',sup:'sup',highlight:'mark'} as Record<string,string>)[format]; toggleMark(view.state.schema.marks['html_'+name])(view.state,view.dispatch) }
      if (format === 'clear') { const view = ctx.get(editorViewCtx); view.dispatch(view.state.tr.removeMark(view.state.selection.from, view.state.selection.to)) }
      ctx.get(editorViewCtx).focus()
    })
    return
  }
  const input = mode === 'split' ? ui.splitInput : ui.sourceInput
  if (mode === 'source') { const selection = sourceEditor.view.state.selection.main; input.setSelectionRange(selection.from, selection.to) }
  const start = input.selectionStart, end = input.selectionEnd
  const marker = format === 'bold' ? '**' : format === 'italic' ? '*' : format === 'code' ? '`' : format === 'strike' ? '~~' : ''
  if (['underline','sub','sup','highlight'].includes(format)) { const tag=({underline:'u',sub:'sub',sup:'sup',highlight:'mark'} as Record<string,string>)[format]; input.setRangeText(`<${tag}>${input.value.slice(start,end)}</${tag}>`,start,end,'select') }
  else if (format === 'clear') input.setRangeText(input.value.slice(start, end).replace(/(\*\*|__|~~|`|\*)/g, ''), start, end, 'select')
  else if (marker) input.setRangeText(marker + input.value.slice(start, end) + marker, start, end, 'select')
  else {
    const lineStart = input.value.lastIndexOf('\n', start - 1) + 1
    const prefix = format.startsWith('h') ? '#'.repeat(Number(format.slice(1))) + ' ' : format === 'quote' ? '> ' : format === 'list' ? '- ' : format === 'ordered' ? '1. ' : ''
    const line = input.value.slice(lineStart, end).replace(/^#{1,6}\s+/, '')
    input.setRangeText(prefix + line, lineStart, end, 'end')
  }
  updateContent(input.value)
  if (mode === 'split') renderPreview()
  if (mode === 'source') { sourceEditor.setContent(input.value); sourceEditor.view.dispatch({ selection: { anchor: input.selectionStart, head: input.selectionEnd } }); sourceEditor.focus() }
  else input.focus()
}


function changePreferences(value: Preferences): void {
  const syntaxChanged=['sequenceTheme','mermaidTheme','mathLegacy','mathLineBreaks','mathPhysics','mathNumbering','mathExport','latexDelimiters','codeMath','headingStyle','bulletStyle','orderedIncrement','autoLink','inlineMath','subscript','superscript','highlight','diagrams'].some(key=>value[key as keyof Preferences]!==preferences[key as keyof Preferences])
  if(syntaxChanged){flushVisual();syntaxRevision++}
  const hiddenChanged=value.showHidden!==preferences.showHidden
  if(value.theme!==preferences.theme){document.getElementById('custom-theme')?.remove();localStorage.removeItem('liubai.customTheme')}
  if(value.uiLanguage!==currentLanguage())setLanguage(value.uiLanguage)
  preferences = value
  localStorage.setItem('liubai.preferences', JSON.stringify(value))
  localStorage.setItem('liubai.theme', value.theme)
  const effectiveTheme=value.followSystem&&matchMedia('(prefers-color-scheme: dark)').matches?'night':value.theme
  document.body.classList.toggle('night', effectiveTheme === 'night')
  document.body.dataset.theme=effectiveTheme
  if(value.fontFamily.trim())document.body.style.setProperty('--document-font',value.fontFamily);else document.body.style.removeProperty('--document-font')
  document.body.style.setProperty('--code-font',value.codeFontFamily||'Sarasa Mono TC')
  document.body.classList.toggle('code-numbers',value.codeNumbers)
  document.body.classList.toggle('code-wrap',value.codeWrap)
  document.documentElement.style.setProperty('--editor-line-height', String(value.lineHeight))
  document.documentElement.style.setProperty('--editor-size', `${value.fontSize}px`)
  document.documentElement.style.setProperty('--image-width', `${value.imageWidth}%`)
  document.querySelector('.statusbar')!.classList.toggle('status-hidden', !value.status)
  element('format-toolbar').hidden = !value.toolbar
  ui.visualRoot.querySelector('.ProseMirror')?.setAttribute('spellcheck', String(value.spellcheck))
  sourceEditor.configure(value)
  refreshTypewriter()
  window.desktop?.preferences({ zoom: value.zoom, status: value.status, toolbar: value.toolbar, showHidden:value.showHidden, rememberRecent:value.rememberRecent,night:effectiveTheme==='night',theme:effectiveTheme,writingFirst:true,paper:getComputedStyle(document.body).getPropertyValue('--paper').trim() })
  if(syntaxChanged&&mode==='visual')void mountVisual()
  if(hiddenChanged)void refreshTree().catch(error=>notify(String(error)))
  preferencesUI.sync()
  renderOutline()
  updateMetrics()
}
function makeDialog(title: string): HTMLDialogElement {
  const dialog = document.createElement('dialog'); dialog.className = 'utility-dialog'
  const header = document.createElement('header'); const heading = document.createElement('h2'); heading.textContent = title
  const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', '關閉'); close.onclick = () => dialog.close()
  header.append(heading, close); dialog.append(header)
  dialog.addEventListener('close', () => dialog.remove())
  document.body.append(dialog); return dialog
}
function quickOpen(draftsOnly = false): void {
  const dialog = makeDialog(draftsOnly ? '復原未儲存的草稿' : '快速開啟')
  dialog.id = 'quick-open'
  const input = document.createElement('input'); input.type = 'search'; input.placeholder = '搜尋檔案名稱…'; input.setAttribute('aria-label', '快速開啟搜尋')
  const results = document.createElement('div'); results.className = 'quick-results'
  const render = () => {
    results.replaceChildren()
    const otherDrafts: DocumentRecord[] = []
    if (draftsOnly) for (const key of Object.keys(localStorage).filter(key => key.startsWith('liubai.documents.v1') && key !== STORAGE_KEY)) {
      try { for (const doc of JSON.parse(localStorage.getItem(key) || '[]')) if (typeof doc.content === 'string' && !documents.some(item => item.id === doc.id)) otherDrafts.push(doc) } catch { /* Ignore a damaged draft store. */ }
    }
    const list = [...documents,...otherDrafts].filter(doc => (!draftsOnly || isDirty(doc)) && (doc.title + (doc.path || '')).toLowerCase().includes(input.value.toLowerCase()))
    for (const doc of list) {
      const button = document.createElement('button'); const title = document.createElement('strong'); title.textContent = doc.title
      const path = document.createElement('small'); path.textContent = doc.path || '未儲存的草稿'
      button.append(title, path); button.onclick = () => { dialog.close(); if (!documents.some(item => item.id === doc.id)) documents.push({...doc}); void selectDocument(doc.id) }; results.append(button)
    }
    if (!list.length) results.textContent = '找不到符合的檔案'
  }
  input.oninput = render
  input.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); results.querySelector('button')?.click() } }
  dialog.append(input, results); render(); dialog.showModal(); input.focus()
}
async function fileAction(action: 'info' | 'reload' | 'reveal'): Promise<void> {
  flushVisual()
  const doc = activeDocument()
  if (!doc.token || !window.desktop) { notify('請先將文件儲存至檔案'); return }
  if (action === 'reload' && isDirty(doc) && !await confirmDialog(translate('從磁碟重新載入將取代目前尚未儲存的內容，是否繼續？'))) return
  const before=doc.content,token=doc.token
  try {
    const result = await window.desktop.inspect({ token: doc.token, action })
    if (action === 'reload' && result && 'content' in result) {
      flushVisual()
      if(doc.content!==before||doc.token!==token){notify('重新載入期間文章已變更，目前的內容已保留');return}
      Object.assign(doc, result, { savedContent: result.content,savedDiskContent:result.content }); persist(); if(doc.id===activeId)renderCurrentDocument();else renderDocuments()
    } else if (action === 'info' && result && 'size' in result) {
      const dialog = makeDialog('屬性')
      const list = document.createElement('dl'); list.className = 'file-properties'
      for (const [key,value] of [['位置',result.path],['大小',`${result.size.toLocaleString()} bytes`],['建立時間',new Date(result.created).toLocaleString()],['修改時間',new Date(result.modified).toLocaleString()]]) {
        const term = document.createElement('dt'); term.textContent = key; const detail = document.createElement('dd'); detail.textContent = value; list.append(term, detail)
      }
      dialog.append(list); dialog.showModal()
    }
  } catch (error) { notify(`檔案操作失敗：${String(error)}`) }
}
function insertMarkdown(markdown: string): void {
  if (document.body.classList.contains('read-only')) return
  if (mode === 'visual' && crepe) { visualEdited = true; crepe.editor.action(insert(markdown)); crepe.editor.action(ctx => ctx.get(editorViewCtx).focus()); return }
  if (mode === 'source') {
    const selection = sourceEditor.view.state.selection.main
    sourceEditor.view.dispatch({ changes: { from: selection.from, to: selection.to, insert: markdown }, selection: { anchor: selection.from + markdown.length } }); sourceEditor.focus()
  } else { ui.splitInput.setRangeText(markdown, ui.splitInput.selectionStart, ui.splitInput.selectionEnd, 'end'); updateContent(ui.splitInput.value); renderPreview() }
}
function insertLink(image: boolean): void {
  const dialog = makeDialog(image ? '插入圖片' : '插入超連結')
  const form = document.createElement('form'); const label = document.createElement('input'); const url = document.createElement('input')
  label.placeholder = image ? '圖片描述' : '顯示文字'; label.setAttribute('aria-label', label.placeholder)
  url.placeholder = 'https://'; url.type = 'url'; url.required = true; url.setAttribute('aria-label', '網址')
  const button = document.createElement('button'); button.type = 'submit'; button.textContent = '插入'
  form.append(label,url,button); form.onsubmit = event => { event.preventDefault(); if (!/^https?:\/\//i.test(url.value)) { url.setCustomValidity('請輸入 http 或 https 網址'); url.reportValidity(); return } dialog.close(); insertMarkdown(`${image ? '!' : ''}[${label.value.replace(/[\[\]\\]/g,'') || (image ? '圖片' : '連結')}](<${url.value.replace(/[<>\r\n]/g,'')}>)`) }
  url.oninput = () => url.setCustomValidity('')
  dialog.append(form); dialog.showModal(); label.focus()
}
async function exportDocument(format: 'html' | 'pdf' | 'print'): Promise<void> {
  if (!window.desktop) return
  flushVisual()
  const doc = activeDocument()
  const fragment = document.createElement('div')
  try {
    // Pandoc stores TeX in an annotation that the sanitizer correctly removes.
    // Keep only its text in an inert attribute before sanitizing, so the chosen
    // SVG/MathML renderer can process it without allowing annotation elements.
    const template = document.createElement('template')
    template.innerHTML = await window.desktop.renderMarkdown({markdown:doc.content,syntax:preferences})
    for(const math of template.content.querySelectorAll('math')){
      const tex=math.querySelector('annotation[encoding="application/x-tex"]')?.textContent
      if(tex)math.setAttribute('data-wuffi-tex',tex)
    }
    fragment.innerHTML = DOMPurify.sanitize(template.innerHTML, { USE_PROFILES: { html: true, mathMl:true } })
  }
  catch(error){notify(`匯出失敗：${String(error)}`);return}
  if(preferences.diagrams)for(const code of fragment.querySelectorAll('pre.mermaid code,pre.flow code,pre.flowchart code,pre.sequence code,pre code.language-mermaid,pre code.mermaid,pre code.language-flow,pre code.language-flowchart,pre code.language-sequence')){
    const rendered=await new Promise<string>(resolve=>renderDiagram((code.className+' '+code.closest('pre')!.className).match(/(?:language-)?(mermaid|flowchart|flow|sequence)/)?.[1]||'mermaid',code.textContent||'',value=>resolve(typeof value==='string'?value:(value?.outerHTML||''))))
    const container=document.createElement('div');container.innerHTML=rendered;code.closest('pre')!.replaceWith(container)
  }
  for(const p of fragment.querySelectorAll('p'))if(/^\[toc\]$/i.test(p.textContent||'')){const nav=document.createElement('nav');for(const heading of fragment.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')){const a=document.createElement('a');a.href='#'+heading.id;a.textContent=heading.textContent;a.style.cssText=`display:block;padding-left:${(Number(heading.tagName[1])-1)*18}px`;nav.append(a)}p.replaceWith(nav)}
  for (const img of fragment.querySelectorAll('img')) { try { img.src = await window.desktop.resolveImage({token:doc.token,src:img.getAttribute('src')||'',embed:true}) } catch { img.replaceWith(document.createTextNode(img.alt)) } }
  await renderExportMath(fragment)
  const styled = await styleExport(fragment)
  const body = styled.body
  const title = doc.title.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;"><title>${title}</title><style>${styled.fonts}body{background:${styled.paper};color:${styled.ink};max-width:${styled.width};margin:32px auto;padding:0 30px}table{width:100%}img,svg{max-width:100%}pre{overflow-wrap:anywhere}a{color:inherit}@page{margin:${preferences.pdfMargin}mm}@media print{body{margin:0;padding:0;max-width:none}h1,h2,h3,h4,h5,h6{break-after:avoid}img,svg,tr{break-inside:avoid}}</style></head><body>${body}</body></html>`
  try { const path = await window.desktop.exportDocument({ format, html, title: doc.title, paperSize: preferences.paperSize,landscape:preferences.pdfLandscape,margin:preferences.pdfMargin,scale:preferences.pdfScale/100,header:preferences.pdfHeader,footer:preferences.pdfFooter,pageNumbers:preferences.pdfPageNumbers }); if (path) notify(`已匯出：${path}`) }
  catch (error) { notify(`匯出失敗：${String(error)}`) }
}
async function prepareDocumentExport(doc:DocumentRecord):Promise<string>{
  let markdown=await diagramsForDocument(doc.content)
  for(const match of [...markdown.matchAll(/^\s*<img\s[^>]*>\s*$/gm)]){
    const img=new DOMParser().parseFromString(match[0],'text/html').querySelector('img');if(!img)continue
    const src=img.getAttribute('src')||'',ratio=Number(img.dataset.ratio)||1
    const embedded=await window.desktop!.resolveImage({token:doc.token,src,embed:true}),image=new Image();image.src=embedded;await image.decode()
    const alt=img.alt.replace(/[\[\]\\]/g,''),title=img.title.replace(/["\r\n]/g,'')
    markdown=markdown.replace(match[0],`![${alt}](<${embedded}>${title?' "'+title+'"':''}){width="${Math.round(image.naturalWidth*ratio)}px"}`)
  }
  return markdown
}
function handleExtraCommand(command: string): void {
  if(command.startsWith('companion:'))document.dispatchEvent(new CustomEvent('wuffi-companion-command',{detail:command.slice(10)}))
  if(command.startsWith('recentFolder:'))void openFolder(Number(command.slice(13)))
  if(command==='clearRecent')void window.desktop?.clearRecent().then(()=>notify('已清除最近使用的紀錄'))
  if(command==='image:upload')void(async()=>{try{const src=await window.desktop?.pickImage({token:activeDocument().token});if(!src)return;const image=await window.desktop!.resolveImage({token:activeDocument().token,src,embed:true});const url=await window.desktop!.uploadImage({image});insertMarkdown(`![圖片](<${url}>)`)}catch(error){notify(String(error))}})()
  if(command.startsWith('alert:'))insertMarkdown('> [!'+command.slice(6)+']\n> 提醒內容\n')
  if(command.startsWith('theme:'))changePreferences({...preferences,theme:command.slice(6),followSystem:false})
  if(command==='settings:window')preferencesUI.open()
  else if(command.startsWith('settings:'))void showDesktopSettings(command.slice(9) as 'shortcuts'|'themes'|'upload'|'templates')
  if(command==='import')void window.desktop?.importDocument().then(doc=>{if(doc)createDocument(doc.title,doc.content)}).catch(error=>notify(String(error)))
  if(command.startsWith('convert:')){flushVisual();const doc=activeDocument(),format=command.slice(8);void(async()=>{const markdown=['docx','epub','odt','rtf'].includes(format)?await prepareDocumentExport(doc):doc.content;const path=await window.desktop?.convert({markdown,title:doc.title,token:doc.token,format,syntax:preferences});if(path)notify('已匯出：'+path)})().catch(error=>notify(String(error)))}
  if (command.startsWith('recent:')) void window.desktop?.inspect({token:command.slice(7),action:'reload'}).then(file=>{if(file && 'content' in file)void openNativeFile([file])}).catch(error=>notify(`無法開啟：${String(error)}`))
  if (command === 'nextDocument') void selectDocument(documents[(documents.findIndex(doc => doc.id === activeId)+1)%documents.length].id)
  if (command === 'frontmatter' && !document.body.classList.contains('read-only')) { flushVisual(); if (!activeDocument().content.startsWith('---\n')) updateContent('---\ntitle: '+JSON.stringify(activeDocument().title)+'\n---\n\n'+activeDocument().content); renderCurrentDocument() }
  if (command === 'image:local') void window.desktop?.pickImage({token:activeDocument().token,relative:preferences.imageRelative,copy:preferences.imageCopy}).then(src => { if (src) insertMarkdown(`![圖片](<${src}>)`) }).catch(error => notify(String(error)))
  if (command.startsWith('file:') || command.startsWith('encoding:')) void (async () => {
    const doc = activeDocument(); if (!doc.token) { notify('請先將文件儲存至本機'); return }
    const action = command.startsWith('encoding:') ? 'encoding' : command.slice(5) as 'move'|'trash'
    if (action === 'encoding' && isDirty(doc) && !await confirmDialog(translate('重新載入會取代目前的修改。是否繼續？'))) return
    try {
      const result = await window.desktop!.fileOperation({token:doc.token,action,encoding:command.slice(9)})
      if (!result) return
      if (result.deleted) { delete doc.token; delete doc.path; delete doc.savedContent; notify('已移至資源回收筒，編輯內容保留為草稿') }
      else { Object.assign(doc,result); if (action === 'encoding') doc.savedContent = undefined }
      persist(); renderCurrentDocument()
    } catch (error) { notify(`檔案操作失敗：${String(error)}`) }
  })()
  if (command === 'preferences:editor') { preferencesUI.open(); Array.from(document.querySelectorAll<HTMLButtonElement>('.preferences-tabs button')).find(button => button.dataset.page === '編輯器')?.click() }
  if (command === 'lineEnding:lf' || command === 'lineEnding:crlf') changePreferences({ ...preferences, lineEnding: command.slice(11) as 'lf' | 'crlf' })
  if (command.startsWith('edit:')) void editing.command(command.slice(5)).catch(error => notify(String(error)))
  if (command === 'find' || command === 'replace') editing.find(command === 'replace')
  if (command === 'findNext') editing.next()
  if (command === 'findPrevious') editing.previous()
  if (command === 'preferences') preferencesUI.open()
  if (command === 'quick' || command === 'drafts') quickOpen(command === 'drafts')
  if (command === 'properties') void fileAction('info')
  if (command === 'reload' || command === 'reveal') void fileAction(command)
  if (command === 'saveAll') void (async () => { for (const doc of documents.filter(isDirty)) await saveNativeFile(false, doc) })()
  if (command === 'image' || command === 'link') insertLink(command === 'image')
  if (command === 'reset-focus') document.body.classList.remove('focus-mode', 'typewriter-mode')
  if (command === 'shortcuts' && !ui.shortcuts.open) ui.shortcuts.showModal()
  if (command === 'export:pdf' || command === 'export:html' || command === 'export:print') void exportDocument(command.slice(7) as 'pdf' | 'html' | 'print')
  if (command.startsWith('insert:')) {
    const content: Record<string,string> = { flow:'```flow\nst=>start: 開始\ne=>end: 完成\nst->e\n```\n',sequence:'```sequence\nAlice->Bob: Hello\nBob-->Alice: Hi\n```\n',comment:'<!-- 註解 -->', inlineMath:'$x^2$', table: '| 欄位一 | 欄位二 |\n| --- | --- |\n', math: '$$\nx^2 + y^2 = z^2\n$$\n', codeblock: '```'+preferences.defaultCodeLanguage.replace(/[\r\n`]/g,'')+'\n\n```\n', task: '- [ ] 待辦事項\n', rule: '\n---\n', toc:'\n[TOC]\n',footnote:'註腳[^1]\n\n[^1]: 註腳內容\n',reference:'[連結][ref]\n\n[ref]: https://example.com\n',mermaid:'```mermaid\nflowchart LR\n  A[開始] --> B[完成]\n```\n' }
    insertMarkdown(content[command.slice(7)] || '')
  }
}
const preferencesUI = createPreferences(() => preferences, changePreferences, handleExtraCommand)
const editing = createEditing({ visual: () => crepe, source: () => sourceEditor.view, mode: () => mode, readonly: () => document.body.classList.contains('read-only'), edited: () => { visualEdited = true }, insert: insertMarkdown })
const writingModels=new WeakMap<WritingSnapshot,WritingNode>()
function writingSnapshot():WritingSnapshot{
  flushVisual()
  const doc=activeDocument()
  let selection={from:0,to:0,markdown:''}
  if(mode==='visual'&&crepe&&visualReady)selection=crepe.editor.action(ctx=>{
    const view=ctx.get(editorViewCtx),s=view.state.selection
    return {from:s.from,to:s.to,markdown:s.empty?'':ctx.get(serializerCtx)(view.state.doc.type.create(null,s.content().content)).trimEnd()}
  })
  else if(mode==='source'){const view=sourceEditor.view,s=view.state.selection.main;selection={from:s.from,to:s.to,markdown:view.state.sliceDoc(s.from,s.to)}}
  else if(mode==='split')selection={from:ui.splitInput.selectionStart,to:ui.splitInput.selectionEnd,markdown:ui.splitInput.value.slice(ui.splitInput.selectionStart,ui.splitInput.selectionEnd)}
  const metrics=documentMetrics(doc.content)
  const snapshot:WritingSnapshot={documentId:doc.id,title:doc.title,markdown:doc.content,revision:documentRevisions.get(doc.id)||0,selection,mode,readonly:document.body.classList.contains('read-only'),focus:document.body.classList.contains('focus-mode'),typewriter:document.body.classList.contains('typewriter-mode'),statistics:{words:metrics.words,characters:metrics.characters,lines:doc.content.split('\n').length}}
  if(mode==='visual'&&crepe&&visualReady)writingModels.set(snapshot,crepe.editor.action(ctx=>writingDocument(ctx.get(editorViewCtx).state.doc)))
  return snapshot
}
function writingUnchanged(snapshot:WritingSnapshot){
  if(activeId!==snapshot.documentId||mode!==snapshot.mode)return false
  if(mode==='visual'&&crepe&&visualReady){
    const original=writingModels.get(snapshot)
    return !!original&&crepe.editor.action(ctx=>original.eq(writingDocument(ctx.get(editorViewCtx).state.doc)))
  }
  return activeDocument().content===snapshot.markdown
}
function applyWritingReplacement(snapshot:WritingSnapshot,scope:'selection'|'document',markdown:string){
  if(mode!==snapshot.mode)throw Error('編輯模式已變更，請重新提出修改')
  if(mode==='visual'&&crepe&&visualReady)crepe.editor.action(ctx=>{
    const view=ctx.get(editorViewCtx),parsed=ctx.get(parserCtx)(markdown)
    if(!parsed)throw Error('無法解析修改內容')
    const from=scope==='document'?0:snapshot.selection.from,to=scope==='document'?view.state.doc.content.size:snapshot.selection.to
    const fragment=scope==='selection'&&parsed.childCount===1&&parsed.firstChild?.type.name==='paragraph'?parsed.firstChild.content:parsed.content
    visualEdited=true
    view.dispatch(closeHistory(view.state.tr).replaceRange(from,to,new Slice(fragment,0,0)))
    view.dispatch(closeHistory(view.state.tr))
    flushVisual();view.focus()
  })
  else if(mode==='source'){
    const view=sourceEditor.view,from=scope==='document'?0:snapshot.selection.from,to=scope==='document'?view.state.doc.length:snapshot.selection.to
    view.dispatch({changes:{from,to,insert:markdown},annotations:isolateHistory.of('full'),userEvent:'input.agent'});view.focus()
  }else if(mode==='split'){
    // Use the source editor history for agent changes even in split preview.
    setMode('source');const view=sourceEditor.view,from=scope==='document'?0:snapshot.selection.from,to=scope==='document'?view.state.doc.length:snapshot.selection.to
    view.dispatch({changes:{from,to,insert:markdown},annotations:isolateHistory.of('full'),userEvent:'input.agent'});view.focus()
  }else throw Error('編輯器尚未就緒，請稍後重試')
}
function reviewWritingReplacement(snapshot:WritingSnapshot,scope:'selection'|'document',markdown:string,options:ReviewOptions){
  if(mode!==snapshot.mode)throw Error('編輯模式已變更，請重新提出修改')
  if(mode==='visual'&&crepe&&visualReady)return crepe.editor.action(ctx=>{
    const view=ctx.get(editorViewCtx),parsed=ctx.get(parserCtx)(markdown)
    if(!parsed)throw Error('無法解析修改內容')
    const from=scope==='document'?0:snapshot.selection.from,to=scope==='document'?view.state.doc.content.size:snapshot.selection.to
    const fragment=scope==='selection'&&parsed.childCount===1&&parsed.firstChild?.type.name==='paragraph'?parsed.firstChild.content:parsed.content
    const target=view.state.tr.replaceRange(from,to,new Slice(fragment,0,0)).doc
    return startInlineReview(view,target,{...options,edited:()=>{visualEdited=true;options.edited()}})
  })
  if(mode==='split')setMode('source')
  if(mode==='source')return sourceEditor.review(scope==='document'?0:snapshot.selection.from,scope==='document'?sourceEditor.view.state.doc.length:snapshot.selection.to,markdown,options)
  throw Error('編輯器尚未就緒，請稍後重試')
}
const agentCommands=[
  ['companion:choose','選擇狗狗夥伴'],...dogCompanions.map(dog=>['companion:'+dog.id,'狗狗夥伴：'+dog.zh]),
  ['theme:glass','使用 Liquid Glass 主題'],
  ['mode:visual','使用視覺編輯'],['mode:source','使用原始碼編輯'],['mode:split','使用對照預覽'],['focus:on','開啟專注模式'],['focus:off','關閉專注模式'],['typewriter:on','開啟打字機模式'],['typewriter:off','關閉打字機模式'],['readonly:on','設為唯讀'],['readonly:off','允許編輯'],
  ['new','新增文章'],['open','開啟文章'],['save','儲存文章'],['saveAs','另存新檔'],['saveAll','儲存所有文章'],['nextDocument','切換下一篇文章'],['quick','切換文章'],['drafts','恢復草稿'],
  ['source','切換原始碼模式'],['split','切換對照預覽'],['focus','切換專注模式'],['typewriter','切換打字機模式'],['readonly','切換唯讀'],['outline','查看大綱'],['articles','查看文章清單'],['tree','查看檔案樹'],['folder','開啟資料夾'],['search','搜尋文件'],['find','搜尋文章'],['replace','搜尋與取代'],['words','字數統計'],['writing:hide-navigation','收起導覽，回到寫作'],
  ['preferences','偏好設定'],['settings:themes','自訂主題'],['settings:shortcuts','快捷鍵設定'],['settings:upload','圖片上傳設定'],['settings:templates','匯出模板'],['shortcuts','查看快捷鍵'],
  ['edit:undo','復原'],['edit:redo','重做'],['edit:all','全選'],['edit:copy:markdown','複製 Markdown'],['edit:copy:html','複製 HTML'],['edit:paste:plain','貼上純文字'],['image:local','插入圖片'],['image:upload','上傳圖片'],['link','插入連結'],['frontmatter','插入文件資訊'],['properties','檔案資訊'],['reveal','在資料夾顯示'],['reload','重新載入文件'],['file:move','移動檔案'],['file:trash','移至資源回收筒'],['import','匯入文件'],['export:pdf','匯出 PDF'],['export:html','匯出 HTML'],['export:print','列印'],['convert:docx','匯出 Word'],['convert:epub','匯出 EPUB'],['convert:odt','匯出 ODT'],['convert:rtf','匯出 RTF'],['clearRecent','清除最近檔案'],
  ...['h1','h2','h3','bold','italic','code','quote','list'].map(name=>['format:'+name,'格式 '+name]),
  ...['table','codeblock','math','inlineMath','task','rule','toc','footnote','reference','mermaid','flow','sequence','comment'].map(name=>['insert:'+name,'插入 '+name]),
  ...['rowBefore','rowAfter','colBefore','colAfter','deleteRow','deleteColumn','deleteTable'].map(name=>['edit:table:'+name,'表格 '+name]),
].map(([name,label])=>({name,label}))
function availableDesktopCommand(name:string){return !window.desktop?.unavailableCommands?.some(rule=>rule.endsWith(':*')?name.startsWith(rule.slice(0,-1)):name===rule)}
const writingAPI=createWritingAPI({snapshot:writingSnapshot,unchanged:writingUnchanged,replace:applyWritingReplacement,review:reviewWritingReplacement,preferences:()=>preferences,configure:changePreferences,commands:agentCommands.filter(command=>availableDesktopCommand(command.name)),command:async name=>{
  if(name.startsWith('mode:')){setMode(name.slice(5) as Mode);return}
  if(name.startsWith('focus:')){document.body.classList.toggle('focus-mode',name.endsWith(':on'));updateFocusedBlock();return}
  if(name.startsWith('typewriter:')){document.body.classList.toggle('typewriter-mode',name.endsWith(':on'));refreshTypewriter();return}
  if(name.startsWith('readonly:')){if(document.body.classList.contains('read-only')!==name.endsWith(':on'))await executeDesktopCommand('readonly');return}
  if(name==='writing:hide-navigation'){hideSidebar();return}
  if(name==='words'){
    const dialog=makeDialog('字數統計'),stats=writingSnapshot().statistics,p=document.createElement('p')
    p.textContent=`${stats.words} ${translate('字')} · ${stats.characters} ${translate('字元數')} · ${stats.lines} ${translate('行')}`;dialog.append(p);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove(),{once:true});return
  }
  if(name.startsWith('format:')){applyFormat(name.slice(7));return}
  if(name.startsWith('edit:')){
    if(mode==='visual'&&crepe)crepe.editor.action(ctx=>ctx.get(editorViewCtx).focus());else if(mode==='source')sourceEditor.focus()
    await editing.command(name.slice(5));return
  }
  await executeDesktopCommand(name)
}})
installWritingAgent(writingAPI,()=>preferences)
installContextMenu((command,target)=>{
  if(command.startsWith('imageAction:')){visualEdited=true;target?.dispatchEvent(new CustomEvent('image-action',{bubbles:true,detail:command.slice(12)}));return}
  if(command.startsWith('format:'))applyFormat(command.slice(7))
  else if(command==='context:cut')void editing.command('copy:rich').then(()=>editing.command('delete'))
  else if(command==='context:paste')void(async()=>{if(document.body.classList.contains('read-only'))return;const clip=await window.desktop?.readClipboard();if(!clip)return;if(mode==='visual'&&crepe){visualEdited=true;crepe.editor.action(ctx=>{const view=ctx.get(editorViewCtx);view.focus();if(clip.html)view.pasteHTML(DOMPurify.sanitize(clip.html));else view.pasteText(clip.text)})}else await editing.command('paste:plain')})().catch(error=>notify(String(error)))
  else handleExtraCommand(command)
})
let contextTimer=0
function updateEditorContext(){
  clearTimeout(contextTimer);contextTimer=window.setTimeout(()=>{
    const anchor=window.getSelection()?.anchorNode,element=anchor instanceof Element?anchor:anchor?.parentElement
    window.desktop?.editorContext({table:!!element?.closest('td,th'),list:!!element?.closest('li'),task:!!element?.closest('li[data-item-type="task"],li[data-checked]'),code:!!element?.closest('.milkdown-code-block,pre'),readonly:document.body.classList.contains('read-only'),selection:!window.getSelection()?.isCollapsed})
  },50)
}
document.addEventListener('selectionchange',updateEditorContext)
document.addEventListener('focusin',updateEditorContext)

marked.setOptions({ gfm: true, breaks: false })
let librarySearchTimer=0
ui.search.addEventListener('input',()=>{clearTimeout(librarySearchTimer);librarySearchTimer=window.setTimeout(()=>void searchLibrary().catch(error=>notify(String(error))),250)})
window.desktop?.onFileChanged(async data=>{
  flushVisual()
  const doc=documents.find(doc=>doc.token===data.token || doc.path===(data.oldPath||data.path));if(!doc)return
  if(data.type==='change'&&typeof data.content==='string'&&data.content===(doc.savedDiskContent??doc.savedContent))return
  if(data.type==='rename'){doc.path=data.path;doc.title=data.title||doc.title;persist();if(doc.id===activeId)renderCurrentDocument();else renderDocuments();return}
  if(data.type==='change' && !isDirty(doc)){
    const before=doc.content,token=doc.token
    try{const result=await window.desktop!.inspect({token:token!,action:'reload'});flushVisual();if(doc.content!==before||doc.token!==token)return;if(result && 'content'in result){Object.assign(doc,result,{savedContent:result.content,savedDiskContent:result.content});persist();if(doc.id===activeId)renderCurrentDocument();else renderDocuments()}}catch(error){notify(String(error))}
  } else notify(data.type==='delete'?`磁碟檔案已移除：${doc.title}，草稿仍保留`:`${doc.title} 已由其他程式修改；目前未儲存的內容已保留`)
})
window.desktop?.onFolderChanged(data=>{if(data.path===element('folder-button').title)void refreshTree().then(()=>searchLibrary()).catch(error=>notify(String(error)))})
document.addEventListener('wheel',event=>{if(event.ctrlKey){event.preventDefault();if(preferences.wheelZoom)changePreferences({...preferences,zoom:Math.max(.5,Math.min(2,Math.round((preferences.zoom+(event.deltaY<0?.1:-.1))*10)/10))})}},{passive:false})
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(preferences.followSystem)changePreferences(preferences)})
document.body.classList.add('writing-first')
installWritingSettings(()=>preferencesUI.open())
installIcons()
document.body.classList.add('seamless')
installDesktopChrome(()=>setMode(mode==='split'?'visual':'split'),()=>changePreferences({...preferences,uiLanguage:currentLanguage()==='en'?'zh-TW':'en'}))
void restoreCustomTheme()
bindEvents()
document.body.classList.toggle('night', localStorage.getItem('liubai.theme') === 'night')
ui.sidebar.classList.toggle('collapsed', localStorage.getItem('liubai.sidebar') !== 'true')
ui.sidebarToggle.innerHTML = svg(ui.sidebar.classList.contains('collapsed') ? 'menu' : 'collapse')
void (async()=>{
  try{
    const restored=await window.desktop?.drafts?.({action:'read',window:windowKey})
    if(restored&&typeof restored==='object'&&restored.savedAt>draftSavedAt){
      documents=restored.documents as DocumentRecord[];draftSavedAt=restored.savedAt
      activeId=documents.some(doc=>doc.id===restored.active)?restored.active:documents[0].id
    }
  }catch{notify('無法讀取本機草稿備份，已使用編輯器內的草稿')}
  // Choose the startup document before exposing an editable surface. An async
  // initialFiles reply must not switch documents after the writer starts typing.
  let initialFiles:NativeFile[]|undefined
  try{initialFiles=await window.desktop?.initialFiles()}catch(error){notify(`無法開啟檔案：${String(error)}`)}
  if(initialFiles?.length)await openNativeFile(initialFiles)
  else if(preferences.startup==='new')createDocument()
  else {persist();renderCurrentDocument()}
  changePreferences(preferences)
  initialDesktopReady=true
})()

new ResizeObserver(refreshTypewriter).observe(document.querySelector('.workspace')!)

installLocalization()

document.addEventListener('ui-language-change',()=>{updateNativeState();renderDocuments()})
function syncReadOnly(){
  document.body.classList.toggle('read-only',manualReadOnly)
  crepe?.setReadonly(manualReadOnly);sourceEditor.setReadonly(manualReadOnly);ui.sourceInput.readOnly=manualReadOnly;ui.splitInput.readOnly=manualReadOnly
  ui.title.readOnly=Boolean(activeDocument().path)
}
if(window.desktop?.benchmarkReport)void import('./runtime-benchmark').then(module=>module.runRuntimeBenchmark())

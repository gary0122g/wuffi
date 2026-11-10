import DOMPurify from 'dompurify'
import { latexDelimiters, renderMath } from './advanced-math'
import { blockMatches } from './block-matches'
import { renderDiagram } from './diagrams'
import { readPreferences } from './preferences'
import { previewBlocks } from './preview-markdown'
import { previewCache } from './preview-cache'

// Typed formulas are reused while the writer keeps typing, so each keystroke
// only typesets what changed.
const typeset = previewCache(300)

// Each top-level Markdown block owns the preview nodes it produced. Unchanged
// blocks keep their nodes, so a keystroke rebuilds and re-lays-out one block
// instead of the whole preview of a long document.
type Block = { key: string; nodes: ChildNode[] }
/** The first element a source block rendered, and the 0-based source line the block starts on. */
export type PreviewAnchor = { line: number; element: Element }
const states = new WeakMap<HTMLElement, { context: string; blocks: Block[]; anchors: PreviewAnchor[] }>()

/** Where each rendered block of the preview starts in the source, in document order. */
export function previewAnchors(target: HTMLElement): PreviewAnchor[] {
  return states.get(target)?.anchors ?? []
}

/** Renders the split preview like the visual editor: Markdown, formulas and diagrams. */
export function renderSplitPreview(target: HTMLElement, markdown: string): void {
  const prefs = readPreferences()
  const { blocks, links } = previewBlocks(prefs.latexDelimiters ? latexDelimiters(markdown) : markdown)
  // Anything outside a block's own text that changes its rendering starts over.
  const context = JSON.stringify([links, prefs.inlineMath, prefs.codeMath, prefs.mathPhysics, prefs.mathLineBreaks, prefs.mermaidTheme, prefs.sequenceTheme, prefs.diagrams, document.documentElement.className, document.body.className])
  let state = states.get(target)
  if (!state || state.context !== context || state.blocks.some((block) => block.nodes.some((node) => node.parentNode !== target))) {
    target.replaceChildren()
    state = { context, blocks: [], anchors: [] }
    states.set(target, state)
  }
  const previous = state.blocks, next: Block[] = new Array(blocks.length), kept = new Set<number>()
  for (const [from, to] of blockMatches(previous.map((block) => block.key), blocks.map((block) => block.raw))) { next[to] = previous[from]; kept.add(from) }
  previous.forEach((block, index) => { if (!kept.has(index)) block.nodes.forEach((node) => node.remove()) })
  blocks.forEach((block, index) => { next[index] ??= { key: block.raw, nodes: renderBlock(block.html(), prefs) } })
  // Kept nodes stay where they are; new nodes are inserted in document order.
  let cursor = target.firstChild
  for (const block of next) for (const node of block.nodes) { if (node === cursor) cursor = node.nextSibling; else target.insertBefore(node, cursor) }
  while (cursor) { const following = cursor.nextSibling; cursor.remove(); cursor = following }
  state.blocks = next
  // Block sources follow each other, so a block starts after the lines of those before it.
  const anchors: PreviewAnchor[] = []
  let line = 0
  next.forEach((block, index) => {
    const element = block.nodes.find((node): node is Element => node instanceof Element)
    if (element) anchors.push({ line, element })
    line += blocks[index].raw.split('\n').length - 1
  })
  state.anchors = anchors
}

function renderBlock(html: string, prefs: ReturnType<typeof readPreferences>): ChildNode[] {
  const container = document.createElement('div')
  container.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
  container.querySelectorAll('a').forEach((link) => { link.target = '_blank'; link.rel = 'noopener noreferrer' })

  for (const node of container.querySelectorAll<HTMLElement>('.preview-math')) {
    const tex = node.dataset.tex || '', display = node.dataset.display === 'true'
    if (!display && !prefs.inlineMath) { node.replaceWith('$' + tex + '$'); continue }
    math(node, tex, display)
  }
  for (const code of container.querySelectorAll<HTMLElement>('pre > code[class*="language-"]')) {
    const language = (code.className.match(/language-(\S+)/)?.[1] || '').toLowerCase(), text = code.textContent || '', pre = code.parentElement!
    if (language === 'latex' || (language === 'math' && prefs.codeMath)) {
      const holder = document.createElement('div'); holder.className = 'preview-math'; holder.dataset.display = 'true'
      pre.replaceWith(holder); math(holder, text, true); continue
    }
    const holder = document.createElement('div'); holder.className = 'preview-diagram'
    const show = (value: null | string | HTMLElement) => { if (value !== null) holder.innerHTML = typeof value === 'string' ? value : value.outerHTML }
    const result = renderDiagram(language, text, (value) => { if (holder.isConnected) show(value) })
    if (result === null) continue
    show(result); pre.replaceWith(holder)
  }
  return [...container.childNodes]
}

// A block that was replaced or removed before its formula finished stays untouched.
function math(node: HTMLElement, tex: string, display: boolean): void {
  const prefs = readPreferences(), key = [display, prefs.mathPhysics, tex].join('\0'), cached = typeset.get(key)
  if (cached !== undefined) { node.innerHTML = cached; return }
  node.textContent = tex
  void renderMath(tex, display).then((svg) => { typeset.set(key, svg); if (node.isConnected) node.innerHTML = svg })
    .catch((error) => { if (node.isConnected) { node.textContent = String(error); node.classList.add('preview-math-error') } })
}

import DOMPurify from 'dompurify'
import { latexDelimiters, renderMath } from './advanced-math'
import { renderDiagram } from './diagrams'
import { readPreferences } from './preferences'
import { previewMarkdown } from './preview-markdown'
import { previewCache } from './preview-cache'

// Typed formulas are reused while the writer keeps typing, so each keystroke
// only typesets what changed.
const typeset = previewCache(300)
let generation = 0

/** Renders the split preview like the visual editor: Markdown, formulas and diagrams. */
export function renderSplitPreview(target: HTMLElement, markdown: string): void {
  const current = ++generation, active = () => current === generation && target.isConnected
  const prefs = readPreferences()
  const html = previewMarkdown(prefs.latexDelimiters ? latexDelimiters(markdown) : markdown)
  target.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
  target.querySelectorAll('a').forEach((link) => { link.target = '_blank'; link.rel = 'noopener noreferrer' })

  for (const node of target.querySelectorAll<HTMLElement>('.preview-math')) {
    const tex = node.dataset.tex || '', display = node.dataset.display === 'true'
    if (!display && !prefs.inlineMath) { node.replaceWith('$' + tex + '$'); continue }
    math(node, tex, display, active)
  }
  for (const code of target.querySelectorAll<HTMLElement>('pre > code[class*="language-"]')) {
    const language = (code.className.match(/language-(\S+)/)?.[1] || '').toLowerCase(), text = code.textContent || '', pre = code.parentElement!
    if (language === 'latex' || (language === 'math' && prefs.codeMath)) {
      const holder = document.createElement('div'); holder.className = 'preview-math'; holder.dataset.display = 'true'
      pre.replaceWith(holder); math(holder, text, true, active); continue
    }
    const holder = document.createElement('div'); holder.className = 'preview-diagram'
    const show = (value: null | string | HTMLElement) => { if (value !== null) holder.innerHTML = typeof value === 'string' ? value : value.outerHTML }
    const result = renderDiagram(language, text, (value) => { if (active()) show(value) })
    if (result === null) continue
    show(result); pre.replaceWith(holder)
  }
}

function math(node: HTMLElement, tex: string, display: boolean, active: () => boolean): void {
  const prefs = readPreferences(), key = [display, prefs.mathPhysics, tex].join('\0'), cached = typeset.get(key)
  if (cached !== undefined) { node.innerHTML = cached; return }
  node.textContent = tex
  void renderMath(tex, display).then((svg) => { typeset.set(key, svg); if (active()) node.innerHTML = svg })
    .catch((error) => { if (active()) { node.textContent = String(error); node.classList.add('preview-math-error') } })
}

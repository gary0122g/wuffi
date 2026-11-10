import type { EditorView } from '@codemirror/view'
import { previewAnchors } from './preview-render'

// Keeps the split preview and the Markdown editor showing the same part of the
// document. Each preview block knows the source line it starts on, so both
// panes share a list of matching points; positions between two points are
// interpolated, which keeps tall images, tables and formulas in step too.
/** `content` holds the rendered blocks; `preview` is the pane that scrolls them. */
export function createSplitScroll(editor: () => EditorView, content: HTMLElement, preview: HTMLElement, active: () => boolean) {
  // Scrolling one pane scrolls the other, which fires its own scroll event.
  // That echo is recognised by the position it was sent to and ignored.
  const echoes = new Map<HTMLElement, number>()

  function follow(leader: 'source' | 'preview'): void {
    if (!active()) return
    const view = editor(), anchors = previewAnchors(content)
    if (!anchors.length) return
    const scroller = view.scrollDOM, doc = view.state.doc
    // Both panes are measured in their own scroll coordinates (0 = scrolled to the top).
    const sourceBase = view.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop
    const previewBase = preview.scrollTop - preview.getBoundingClientRect().top
    const sourceAt = (index: number) => view.lineBlockAt(doc.line(Math.min(anchors[index].line + 1, doc.lines)).from).top + sourceBase
    const previewAt = (index: number) => anchors[index].element.getBoundingClientRect().top + previewBase
    const [from, to, fromAt, toAt] = leader === 'source'
      ? [scroller, preview, sourceAt, previewAt] as const
      : [preview, scroller, previewAt, sourceAt] as const
    const position = from.scrollTop, fromEnd = from.scrollHeight - from.clientHeight, toEnd = to.scrollHeight - to.clientHeight
    let target: number
    if (position >= fromEnd - 1) target = toEnd
    else {
      // The last matching point at or above the top of the leading pane.
      let low = 0, high = anchors.length - 1, index = -1
      while (low <= high) { const middle = (low + high) >> 1; if (fromAt(middle) <= position) { index = middle; low = middle + 1 } else high = middle - 1 }
      const [startFrom, startTo] = index < 0 ? [0, 0] : [fromAt(index), toAt(index)]
      const [endFrom, endTo] = index + 1 < anchors.length ? [fromAt(index + 1), toAt(index + 1)] : [from.scrollHeight, to.scrollHeight]
      target = startTo + (endFrom > startFrom ? (position - startFrom) / (endFrom - startFrom) : 0) * (endTo - startTo)
    }
    target = Math.round(Math.max(0, Math.min(toEnd, target)))
    if (Math.abs(to.scrollTop - target) < 1) return
    echoes.set(to, target)
    to.scrollTop = target
  }

  function listen(element: HTMLElement, leader: 'source' | 'preview'): void {
    element.addEventListener('scroll', () => {
      const echo = echoes.get(element)
      echoes.delete(element)
      if (echo !== undefined && Math.abs(element.scrollTop - echo) < 2) return
      follow(leader)
    }, { passive: true })
  }

  listen(preview, 'preview')
  let bound: HTMLElement | undefined, frame = 0
  return {
    /** Starts following both panes; safe to call every time split mode opens. */
    attach(): void {
      const scroller = editor().scrollDOM
      if (bound !== scroller) { bound = scroller; listen(scroller, 'source') }
    },
    /** Lines the preview up with the editor again, after the preview changed. */
    refresh(): void {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => follow('source'))
    },
  }
}

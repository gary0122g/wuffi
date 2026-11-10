import { $prose } from '@milkdown/kit/utils'
import { Plugin } from '@milkdown/kit/prose/state'

// Off-screen text blocks only have estimated heights (content-visibility). A
// long jump lands near the target, the blocks around it render with their real
// heights, and the target moves. Re-measure each frame until it stays put.
type Place = 'center' | 'nearest'
function scrollerOf(element: Element): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)) return node
  }
  return null
}
function settle(from: Element, locate: () => { top: number; bottom: number } | null, place: Place): void {
  const scroller = scrollerOf(from)
  if (!scroller) return
  let frames = 0
  const step = () => {
    const target = locate()
    if (!target) return
    // Same margin as ProseMirror's own scrolling, so typing near an edge scrolls as before.
    const box = scroller.getBoundingClientRect(), margin = 5
    const delta = place === 'center' ? (target.top + target.bottom) / 2 - (box.top + box.bottom) / 2
      : target.top < box.top + margin ? target.top - box.top - margin
      : target.bottom > box.bottom - margin ? target.bottom - box.bottom + margin : 0
    if (Math.abs(delta) < 2) return
    scroller.scrollTop += delta
    if (++frames < 8) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/** Scrolls an element to the middle of the workspace and keeps it there while blocks render. */
export function scrollToElement(element: Element): void {
  element.scrollIntoView({ block: 'center' })
  settle(element, () => element.isConnected ? element.getBoundingClientRect() : null, 'center')
}

/** Keeps the selection in view after ProseMirror scrolls to it (search, footnotes, contents, moves). */
export const scrollSettle = $prose(() => new Plugin({
  props: {
    handleScrollToSelection(view) {
      settle(view.dom, () => {
        if (view.isDestroyed) return null
        try { return view.coordsAtPos(view.state.selection.head) } catch { return null }
      }, 'nearest')
      return false
    },
  },
}))

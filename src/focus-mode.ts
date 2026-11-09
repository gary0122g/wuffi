import { $prose } from '@milkdown/kit/utils'
import { Plugin } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'

// The editor selection remains valid when native menus own focus, the DOM
// selection points at an empty element, or an editor session is reattached.
export const focusMode = $prose(() => new Plugin({
  props: {
    decorations(state) {
      const {from,to,empty} = state.selection
      const decorations:Decoration[] = []
      state.doc.forEach((node,pos) => {
        const end = pos + node.nodeSize
        if(empty ? from >= pos && from < end : from < end && to > pos)
          decorations.push(Decoration.node(pos,end,{class:'focused-block'}))
      })
      return DecorationSet.create(state.doc,decorations)
    },
  },
}))

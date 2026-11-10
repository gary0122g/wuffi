import { Marked, type TokenizerAndRendererExtension } from 'marked'

// The split preview marks formulas as placeholders; the editor's renderers fill them in.
const attribute = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const placeholder = (tag: 'div' | 'span', tex: string) => `<${tag} class="preview-math" data-tex="${attribute(tex)}"${tag === 'div' ? ' data-display="true"' : ''}></${tag}>`

const mathBlock: TokenizerAndRendererExtension = {
  name: 'mathBlock', level: 'block',
  start: (src) => src.match(/^\$\$/m)?.index,
  tokenizer(src) {
    const match = /^\$\$[ \t]*\n?([\s\S]+?)\n?[ \t]*\$\$[ \t]*(?:\n+|$)/.exec(src)
    if (match) return { type: 'mathBlock', raw: match[0], text: match[1].trim() }
  },
  renderer: (token) => placeholder('div', token.text) + '\n',
}
// Same rule as the editor: no space just inside the dollars, and no digit right after the closing one ($5 and $6), and no backticks, which belong to code.
const mathInline: TokenizerAndRendererExtension = {
  name: 'mathInline', level: 'inline',
  start: (src) => src.indexOf('$') < 0 ? undefined : src.indexOf('$'),
  tokenizer(src) {
    const match = /^\$(?![\s$])((?:\\.|[^\\$`\n])+?)(?<![\s\\])\$(?!\d)/.exec(src)
    if (match) return { type: 'mathInline', raw: match[0], text: match[1] }
  },
  renderer: (token) => placeholder('span', token.text),
}
const parser = new Marked({ gfm: true, breaks: false, extensions: [mathBlock, mathInline] })

export function previewMarkdown(markdown: string): string {
  return String(parser.parse(markdown))
}

// Top-level blocks render independently; only reference link definitions are
// shared, so the preview can re-render just the blocks that changed.
export type PreviewBlocks = { blocks: { raw: string; html: () => string }[]; links: string }
export function previewBlocks(markdown: string): PreviewBlocks {
  const tokens = parser.lexer(markdown)
  return {
    links: JSON.stringify(tokens.links),
    blocks: tokens.map((token) => ({ raw: token.raw, html: () => String(parser.parser(Object.assign([token], { links: tokens.links }))) })),
  }
}

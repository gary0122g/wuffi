import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import ts from 'typescript'

// The split preview turns $…$ and $$…$$ into placeholders that the editor's
// formula renderer fills in, and leaves prices and code alone.
const source=ts.transpileModule(await fs.readFile(new URL('../src/preview-markdown.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText
  .replace(`from 'marked'`,`from '${import.meta.resolve('marked')}'`)
const {previewMarkdown}=await import('data:text/javascript,'+encodeURIComponent(source))
const formulas=html=>[...html.matchAll(/<(span|div) class="preview-math" data-tex="([^"]*)"/g)].map(m=>m[1]+':'+m[2])

test('inline and display formulas become placeholders',()=>{
 assert.deepEqual(formulas(previewMarkdown('複雜度是 $O(1)$，比 $O(n^2 \\cdot d)$ 慢。\n\n$$\nE=mc^2\n$$\n')),['span:O(1)','span:O(n^2 \\cdot d)','div:E=mc^2'])
})

test('formulas inside table cells are found',()=>{
 const html=previewMarkdown('| 層 | 循序操作 |\n|---|---|\n| Self-Attention | $O(1)$ |\n')
 assert.match(html,/<td><span class="preview-math" data-tex="O\(1\)"><\/span><\/td>/)
})

test('prices, spaced dollars and code are not formulas',()=>{
 assert.deepEqual(formulas(previewMarkdown('It costs $5 and $6 today, $ not math $, and `$x$` stays code.')),[])
})

test('LaTeX commands keep their backslashes',()=>{
 assert.deepEqual(formulas(previewMarkdown(String.raw`$$
\mathrm{A}=\left(\frac{a}{\sqrt{b}}\right)
$$
Inline $\sqrt{d_k}$ too.`)),[String.raw`div:\mathrm{A}=\left(\frac{a}{\sqrt{b}}\right)`,String.raw`span:\sqrt{d_k}`])
})

test('formula source is escaped inside the attribute',()=>{
 assert.deepEqual(formulas(previewMarkdown('$a<b \\& "c"$')),['span:a&lt;b \\&amp; &quot;c&quot;'])
})

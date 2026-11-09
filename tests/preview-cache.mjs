import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import ts from 'typescript'

// Diagrams and formulas keep their rendered previews when Milkdown rebuilds a
// code block that scrolls back into view.
const source=ts.transpileModule(await fs.readFile(new URL('../src/preview-cache.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText
const {previewCache}=await import('data:text/javascript,'+encodeURIComponent(source))

test('a rendered preview is returned again for the same block',()=>{
 const cache=previewCache()
 assert.equal(cache.get('mermaid\0default\0graph TD'),undefined)
 cache.set('mermaid\0default\0graph TD','<svg/>')
 assert.equal(cache.get('mermaid\0default\0graph TD'),'<svg/>')
 assert.equal(cache.get('mermaid\0dark\0graph TD'),undefined,'another theme renders again')
})

test('the cache keeps the most recently used previews within its limit',()=>{
 const cache=previewCache(2)
 cache.set('a','A');cache.set('b','B')
 cache.get('a') // a is now the most recent
 cache.set('c','C')
 assert.equal(cache.get('b'),undefined,'least recently used preview is dropped')
 assert.equal(cache.get('a'),'A');assert.equal(cache.get('c'),'C')
})

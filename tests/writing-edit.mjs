import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

// The AI names one passage of the document; the editor turns it into a
// reviewable change without asking the writer to select it first.
const source=ts.transpileModule(await fs.readFile(new URL('../src/writing-api.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const exports={}
vm.runInNewContext(source,{exports,require:name=>{if(name==='./preferences')return {preferenceCapabilities:()=>[],validatePreferencePatch:value=>value};throw Error(name)}})
const {resolveEdit,createWritingAPI}=exports
const markdown='# Notes\n\n## 09\n\n```mermaid\ntimeline\n  2017 : Transformer\n```\n\nAfter the diagram.\n'
const snapshot={documentId:'d',title:'t',markdown,revision:1,selection:{from:0,to:0,markdown:''},mode:'visual',readonly:false,focus:false,typewriter:false,statistics:{words:0,characters:0,lines:0}}

test('an edit replaces only the passage it names, as a document change',()=>{
 const action=resolveEdit({kind:'edit',find:'```mermaid\ntimeline\n  2017 : Transformer\n```',markdown:'```mermaid\nflowchart TD\n  A[2017 Transformer]\n```'},snapshot,'document')
 assert.equal(action.kind,'replace');assert.equal(action.scope,'document')
 assert.equal(action.markdown,'# Notes\n\n## 09\n\n```mermaid\nflowchart TD\n  A[2017 Transformer]\n```\n\nAfter the diagram.\n')
})

test('an edit inside a selection stays inside the selection',()=>{
 const selected={...snapshot,selection:{from:1,to:9,markdown:'First line\nSecond line'}}
 assert.deepEqual({...resolveEdit({kind:'edit',find:'Second line',markdown:'2nd line'},selected,'selection')},{kind:'replace',scope:'selection',markdown:'First line\n2nd line'})
})

test('an edit that matches nothing or more than once leaves the document unchanged',()=>{
 assert.throws(()=>resolveEdit({kind:'edit',find:'Not in the text',markdown:'x'},snapshot,'document'),/找不到/)
 assert.throws(()=>resolveEdit({kind:'edit',find:'Transformer',markdown:'x'},{...snapshot,markdown:'Transformer and Transformer'},'document'),/不只一次/)
 assert.throws(()=>resolveEdit({kind:'edit',find:'  ',markdown:'x'},snapshot,'document'),/找不到/)
})

test('line endings follow the document, so untouched blocks stay identical',()=>{
 // A reply with Windows line endings still matches a Unix document.
 const action=resolveEdit({kind:'edit',find:'## 09\r\n\r\n```mermaid',markdown:'## 09 (new)\r\n\r\n```mermaid'},snapshot,'document')
 assert(action.markdown.startsWith('# Notes\n\n## 09 (new)\n\n```mermaid\ntimeline'))
 // A Windows document keeps its line endings everywhere, including other code blocks.
 const windows={...snapshot,markdown:'```python\r\nx = 1\r\n```\r\n\r\n```mermaid\r\ntimeline\r\n```\r\n'}
 assert.equal(resolveEdit({kind:'edit',find:'```mermaid\ntimeline\n```',markdown:'```mermaid\nflowchart TD\n```'},windows,'document').markdown,'```python\r\nx = 1\r\n```\r\n\r\n```mermaid\r\nflowchart TD\r\n```\r\n')
 // A whole-document replacement written with \n also keeps the document's \r\n.
 assert.equal(resolveEdit({kind:'replace',scope:'document',markdown:'```python\nx = 1\n```\n\n```mermaid\nflowchart TD\n```\n'},windows,'document').markdown,'```python\r\nx = 1\r\n```\r\n\r\n```mermaid\r\nflowchart TD\r\n```\r\n')
 assert.equal(resolveEdit({kind:'replace',scope:'document',markdown:'a\r\nb'},snapshot,'document').markdown,'a\nb')
})

test('a passage matches a document that mixes \\r\\n and \\n',()=>{
 // Seen in a real note: lines end in \r\n except the one before a closing fence.
 const mixed={...snapshot,markdown:'Intro\r\n\r\n```mermaid\r\ntimeline\r\n  2020 : ViT\n```\r\n\r\nEnd ($5).\r\n'}
 assert.equal(resolveEdit({kind:'edit',find:'```mermaid\r\ntimeline\r\n  2020 : ViT\r\n```',markdown:'```mermaid\nflowchart TD\n```'},mixed,'document').markdown,'Intro\r\n\r\n```mermaid\r\nflowchart TD\r\n```\r\n\r\nEnd ($5).\r\n')
 // Regex characters in the passage are matched literally.
 assert.equal(resolveEdit({kind:'edit',find:'End ($5).',markdown:'Fin.'},mixed,'document').markdown.endsWith('Fin.\r\n'),true)
})

test('replies may carry one edit, which counts like a replace',()=>{
 const api=createWritingAPI({commands:[],snapshot:()=>snapshot,unchanged:()=>true})
 assert.equal(api.validate({message:'ok',actions:[{kind:'edit',find:'After',markdown:'Before'}]}).actions.length,1)
 assert.throws(()=>api.validate({message:'',actions:[{kind:'edit',find:'After',markdown:'B'},{kind:'replace',scope:'document',markdown:'x'}]}),/一次只能/)
 assert.throws(()=>api.validate({message:'',actions:[{kind:'edit',find:'',markdown:'B'}]}),/格式不正確/)
})

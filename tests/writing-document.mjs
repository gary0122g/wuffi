import assert from 'node:assert/strict'
import {Schema} from '@milkdown/kit/prose/model'
import {writingDocument,sameWritingDocument,withoutCaretHost} from '../src/writing-document.ts'

const schema=new Schema({nodes:{
 doc:{content:'block+'},
 paragraph:{group:'block',content:'text*'},
 heading:{group:'block',content:'text*',attrs:{level:{default:1},id:{default:''}}},
 code_block:{group:'block',content:'text*',attrs:{language:{default:''}}},
 text:{},
}})
const p=text=>schema.node('paragraph',null,text?[schema.text(text)]:[])
const h=(text,id='')=>schema.node('heading',{level:2,id},[schema.text(text)])
const code=(text,language='js')=>schema.node('code_block',{language},[schema.text(text)])
const doc=(...blocks)=>schema.node('doc',null,blocks)
const reference=(a,b)=>writingDocument(a).eq(writingDocument(b))

// The editor appends an empty caret host after a trailing list/table/code block.
// It must not count as a source block, or every keystroke serializes the whole document.
const tail=doc(p('Intro'),code('let a=1'))
assert.equal(withoutCaretHost(doc(p('Intro'),code('let a=1'),p(''))).childCount,2)
assert.equal(withoutCaretHost(doc(p('Intro'),p(''))).childCount,2,'an empty paragraph after a paragraph is real')
assert.equal(withoutCaretHost(tail),tail,'nothing to remove keeps the same document')

// The incremental comparison gives the same answer as rebuilding both documents.
const shared=p('Unchanged block')
const cases=[
 [doc(shared,h('Title','a')),doc(shared,h('Title','b'))],
 [doc(shared,p('Typed')),doc(shared,p('Typed!'))],
 [tail,doc(p('Intro'),code('let a=1'),p(''))],
 [doc(p('Intro'),code('let a=1')),doc(p('Intro'),code('let a=1'),p('typed in caret host'))],
 [doc(code('a\r\nb')),doc(code('a\nb'))],
 [doc(code('x','js')),doc(code('x','ts'))],
 [doc(h('T')),doc(p('T'))],
 [doc(shared),doc(shared,p('new'))],
]
for(const [a,b] of cases){
 assert.equal(sameWritingDocument(a,b),reference(a,b))
 assert.equal(sameWritingDocument(b,a),reference(b,a))
}
assert.equal(sameWritingDocument(tail,tail),true)
console.log('Writing document comparison passed')

import assert from 'node:assert/strict'
import {expandReplacement} from '../src/search-replacement.ts'
for(const pattern of [/(a)(b)?/gu,/(?<first>a)(b)?/gu])for(const replacement of ['$1-$2','$&','$$','$0','$12','$99','$01','$<first>','$<missing>',"$`-$'"]){
 const text='ab a',expected=text.replace(pattern,replacement)
 let cursor=0,actual=''
 for(const match of text.matchAll(pattern)){actual+=text.slice(cursor,match.index)+expandReplacement(replacement,match,text);cursor=match.index+match[0].length}
 actual+=text.slice(cursor);assert.equal(actual,expected,pattern+' '+replacement)
}
console.log('Regex replacement matches native substitution semantics')

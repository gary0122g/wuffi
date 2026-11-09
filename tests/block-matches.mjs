import assert from 'node:assert/strict'
import {blockMatches} from '../src/block-matches.ts'
assert.deepEqual(blockMatches(['a','b','c','d','e'],['x','b','c','d','y']),[[1,1],[2,2],[3,3]])
assert.deepEqual(blockMatches(['a','b','a'],['a','x','b','a']),[[0,0],[1,2],[2,3]])
assert.deepEqual(blockMatches([],['new']),[])
for(let run=0;run<200;run++){
 const a=Array.from({length:50},()=>String(Math.floor(Math.random()*12))),b=a.filter(()=>Math.random()>.25)
 b.splice(5,0,'insert')
 let x=-1,y=-1
 for(const [i,j]of blockMatches(a,b)){assert(i>x&&j>y);assert.equal(a[i],b[j]);x=i;y=j}
}
const many=Array.from({length:10000},(_,i)=>String(i%5));assert.equal(blockMatches(many,[...many,'new']).length,many.length)
console.log('Block preservation alignment passed')

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
const source=ts.transpileModule(await fs.readFile(new URL('../src/cloud-account.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function setup(){
 class Element{children=[];hidden=false;value='';textContent='';append(...nodes){this.children.push(...nodes);if(this.tag==='select'&&!this.value)this.value=nodes[0].value}prepend(...nodes){this.children.unshift(...nodes)}setAttribute(){}}
 const nodes=[],connection=new Element(),localForm=new Element(),panel={querySelector:s=>s.endsWith(' form')?localForm:connection},calls=[],timers=[];let changed=0
 const context={exports:{},require:()=>({currentLanguage:()=> 'en'}),document:{createElement:tag=>{const e=new Element();e.tag=tag;nodes.push(e);return e}},window:{addEventListener(){},desktop:{cloudAccount:async data=>{calls.push(data.action);return data.action==='start'?{code:'123456ABCDEF',expiresIn:600}:data.action==='poll'?{signedIn:true}:data.action==='status'?{user:{name:'Writer',email:'writer@test'},plan:{plan:'monthly',limits:{tokens:100},usage:{tokens:12}}}:{signedIn:false}}}},setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},Date}
 vm.runInNewContext(source,context)
 const ui=context.exports.installCloudAccount(panel,()=>changed++)
 return {ui,nodes,calls,timers,localForm,get changed(){return changed}}
}
test('local is free by default; cloud requires explicit selection and pairing; logout restores local',async()=>{
 const h=setup();assert.equal(h.ui.provider(),'local');assert.deepEqual(h.calls,[])
 const select=h.nodes.find(e=>e.tag==='select');select.value='cloud';select.onchange();await Promise.resolve();await Promise.resolve()
 assert.equal(h.localForm.hidden,true);assert.equal(h.changed,1)
 await h.nodes.find(e=>e.textContent==='Sign in to wuffi').onclick()
 assert(h.nodes.some(e=>e.textContent.includes('123456ABCDEF')))
 await h.timers[0]();assert(h.nodes.some(e=>e.textContent.includes('writer@test')&&e.textContent.includes('12 / 100')))
 await h.nodes.find(e=>e.textContent==='Sign out / Cancel sign-in').onclick()
 assert.equal(h.ui.provider(),'local');assert.equal(h.localForm.hidden,false);assert.equal(h.calls.at(-1),'logout')
})

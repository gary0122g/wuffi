import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
const source=ts.transpileModule(await fs.readFile(new URL('../src/app-updates.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function setup({auto=true,background=false,confirmed=false,failCheck=false,mounted=true}={}){
 class Element{dataset={};children=[];hidden=false;disabled=false;textContent='';append(...nodes){this.children.push(...nodes)}setAttribute(){}querySelector(selector){const key=selector.match(/data-update=([^\]]+)/)?.[1];const search=el=>el.dataset?.update===key?el:el.children?.map(search).find(Boolean);return this.children.map(search).find(Boolean)}}
 const parent=new Element(),calls=[],timers=[],classes=new Map(),store=new Map([['wuffi.updates.auto',String(auto)]]),context={exports:{},require:()=>({currentLanguage:()=> 'en'}),localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},document:{body:{classList:{toggle:(name,value)=>classes.set(name,value)}},createElement:()=>new Element(),createTextNode:text=>text},window:{setTimeout:fn=>timers.push(fn),desktop:{updates:async({action})=>{calls.push(action);if(action==='check'&&failCheck)throw Error('offline');if(action==='install')throw Error('Please save all documents');return {currentVersion:'1.0.0-rc.4',available:action==='check',version:'1.0.0',notes:'Update notes'}},confirm:async()=>confirmed,onUpdateProgress(){}}}}
 if(background)context.window.__WUFFI_BACKGROUND_TEST__=true
 vm.runInNewContext(source,context);if(mounted)context.exports.mountAppUpdates(parent)
 return {api:context.exports,parent,calls,timers,store,classes}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve))
test('startup check respects opt-out and isolated background tests',async()=>{
 for(const options of [{auto:false},{background:true}]){const h=setup(options);h.api.initializeAppUpdates();assert.equal(h.timers.length,0);assert(!h.calls.includes('install'))}
 const h=setup();h.api.initializeAppUpdates();assert.equal(h.timers.length,1);h.timers[0]();await flush();assert(h.calls.includes('check'));assert(!h.calls.includes('install'))
})
test('checking reports version but installation requires confirmation',async()=>{
 const h=setup();await h.api.checkAppUpdate();assert.equal(h.parent.querySelector('[data-update=install]').hidden,false)
 h.parent.querySelector('[data-update=install]').onclick();await flush();assert(!h.calls.includes('install'))
})
test('background discovery shows the badge even before settings are opened',async()=>{const h=setup({mounted:false});await h.api.checkAppUpdate(true);assert.equal(h.classes.get('update-available'),true);assert(!h.calls.includes('install'))})
test('offline checks and blocked installs leave a retryable UI',async()=>{
 const offline=setup({failCheck:true});await offline.api.checkAppUpdate();assert.match(offline.parent.querySelector('[data-update=status]').textContent,/Could not check/);assert.equal(offline.parent.querySelector('[data-update=check]').disabled,false)
 const h=setup({confirmed:true});await h.api.checkAppUpdate();h.parent.querySelector('[data-update=install]').onclick();await flush();assert(h.calls.includes('install'));assert.match(h.parent.querySelector('[data-update=status]').textContent,/save all documents/);assert.equal(h.parent.querySelector('[data-update=install]').disabled,false)
})

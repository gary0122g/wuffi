import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
test('distribution contains only Tauri and keeps optional cloud separate',async()=>{
 for(const path of ['electron','src-gpui','server'])await assert.rejects(fs.stat(new URL('../'+path,import.meta.url)),{code:'ENOENT'})
 const pkg=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'))
 assert.equal(pkg.license,'MIT');assert(!pkg.devDependencies.electron)
 const source=await fs.readFile(new URL('../src-tauri/src/main.rs',import.meta.url),'utf8')
 assert(!/host\.license|entitlements|license-locked/.test(source))
 assert(source.includes('agent::request(&host.client, connection(&host), data).await'))
})

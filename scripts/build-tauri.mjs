import {spawn} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
const root=path.resolve(import.meta.dirname,'..')
const cargo=process.platform==='win32'?path.join(process.env.USERPROFILE,'.cargo/bin/cargo.exe'):'cargo'
async function run(executable,args){await new Promise((resolve,reject)=>{const child=spawn(executable,args,{cwd:root,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${executable} exited ${code}`)))})}
await run(process.execPath,['node_modules/typescript/bin/tsc','--noEmit'])
await run(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir','out','--emptyOutDir','false'])
await run(cargo,['build','--manifest-path','src-tauri/Cargo.toml','--locked',...(process.argv.includes('--debug')?[]:['--release'])])
const binary=path.join(root,'src-tauri/target',process.argv.includes('--debug')?'debug':'release','wuffi'+(process.platform==='win32'?'.exe':''))
console.log('Tauri development executable: '+binary+' ('+Math.round(fs.statSync(binary).size/1048576)+' MiB)')

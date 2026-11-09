import {spawn} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
const root=path.resolve(import.meta.dirname,'..'),binary=path.join(root,'src-tauri/target/'+(process.argv.includes('--debug')?'debug':'release')+'/wuffi'+(process.platform==='win32'?'.exe':''))
if(!fs.existsSync(binary))throw Error('Build the desktop app first: npm run tauri:build')
const child=spawn(binary,process.argv.slice(2).filter(a=>a!=='--debug'),{cwd:root,stdio:'inherit',windowsHide:true})
child.on('error',error=>{console.error(error);process.exitCode=1})
child.on('exit',code=>{process.exitCode=code??1})

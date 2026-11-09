import {spawnSync,spawn} from 'node:child_process'
const build=spawnSync(process.execPath,['scripts/build-tauri.mjs','--debug'],{stdio:'inherit',windowsHide:true})
if(build.status!==0)process.exit(build.status||1)
const app=spawn(process.execPath,['scripts/start-tauri.mjs','--debug'],{stdio:'inherit',windowsHide:true})
app.on('exit',code=>process.exit(code||0))

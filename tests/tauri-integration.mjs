import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import {connect,freePort,wait} from './helpers/cdp.mjs'
const exec=promisify(execFile),root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'outputs','tauri-integration-'+Date.now()),profile=path.join(output,'profile')
await fs.mkdir(profile,{recursive:true})
const requests=[];let pending,cancelledRequest=false
const server=http.createServer(async(req,res)=>{
 if(req.url.endsWith('/models')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'test-model'}]}));return}
 let raw='';for await(const chunk of req)raw+=chunk
 const payload=JSON.parse(raw),data=JSON.parse(payload.messages.at(-1).content);requests.push({payload,data})
 if(data.request==='slow')res.on('close',()=>{if(!res.writableEnded)cancelledRequest=true})
 const reply=()=>{if(res.destroyed)return;res.setHeader('Content-Type','application/json');const value=data.request==='rewrite'?{message:'請在內文逐句確認。',actions:[{kind:'replace',scope:'document',markdown:data.document.content.replace('今天下雨。','今天放晴。').replace('路上很安靜。','路上很熱鬧。')}]}:{message:'我們可以先討論你的想法，再依你的要求修改。',actions:[]};res.end(JSON.stringify({choices:[{message:{content:'<think>Keep the writer in control.</think>\n```json\n'+JSON.stringify(value)+'\n```'}}]}))}
 if(data.request==='slow')pending=reply;else reply()
});await new Promise(r=>server.listen(0,'127.0.0.1',r))
const port=await freePort(),log=await fs.open(path.join(output,'native.log'),'w'),binary=path.resolve(root,process.env.WUFFI_TAURI_BINARY||'src-tauri/target/release/wuffi'+(process.platform==='win32'?'.exe':''))
if(process.env.WUFFI_TEST_BACKGROUND==='1'&&!/^wuffi-safety(?:\.exe)?$/i.test(path.basename(binary)))throw Error('Background tests require a safety-tests binary')
const child=spawn(binary,['--profile',profile,'--cdp-port',String(port),...(process.env.WUFFI_TEST_BACKGROUND==='1'?['--background-test']:[])],{cwd:root,stdio:['ignore',log.fd,log.fd],windowsHide:true});let client
try{
 client=await connect(port);const js=client.evaluate
 await client.until('!!document.querySelector(".ProseMirror[contenteditable=true]")&&document.querySelectorAll(".chrome-menubar nav button").length===7','editor and desktop bridge')
 assert.equal(await js('document.body.dataset.runtime'),'tauri')
 assert.equal(await js('document.querySelectorAll(".tauri-window-controls button").length'),3)
 assert.equal(await js('document.querySelector("#writing-agent").hidden'),true);assert.equal(requests.length,0,'Writing does not automatically call AI')
 await js("document.dispatchEvent(new Event('wuffi:open-ai-settings'))")
 await client.until("!document.querySelector('#preferences').hidden && !!document.querySelector('#preferences .agent-connection form')",'dedicated AI settings page')
 assert.equal(await js("document.querySelector('#preferences .preferences-tabs .selected').dataset.page"),'AI')
 await js("document.querySelector('#preferences .cloud-account select').value='cloud';document.querySelector('#preferences .cloud-account select').dispatchEvent(new Event('change'))")
 assert.equal(await js("document.querySelector('#preferences .agent-connection form').hidden"),true)
 await js("document.querySelector('#preferences .cloud-account select').value='local';document.querySelector('#preferences .cloud-account select').dispatchEvent(new Event('change'))")
 assert.equal(await js("document.querySelector('#preferences .agent-connection form').hidden"),false)
 await js("document.querySelector('#preferences [data-page=檔案]').click();document.querySelector('#preferences [data-page=AI]').click()")
 assert.equal(await js("document.querySelectorAll('.agent-connection').length"),1,'settings share a single state')
 const settingsCapture=await client.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,'ai-settings.png'),Buffer.from(settingsCapture.data,'base64'))
 const settingsInventory=await js(`(()=>{const seen=[];for(const page of ['一般','外觀','編輯器','檔案','Markdown','匯出']){document.querySelector('#preferences [data-page="'+page+'"]').click();for(const input of document.querySelectorAll('#preferences [id^=pref-]'))seen.push({page,key:input.id.slice(5)})}return seen})()`)
 assert.equal(settingsInventory.length,60,'All 60 settings remain reachable')
 assert.equal(new Set(settingsInventory.map(item=>item.key)).size,60,'Each setting has one home')
 for(const [key,page]of [['uiLanguage','一般'],['startup','一般'],['fontFamily','編輯器'],['fontSize','編輯器'],['imageCopy','檔案'],['theme','外觀']])assert.equal(settingsInventory.find(item=>item.key===key)?.page,page)
 await js("document.querySelector('#preferences [data-page=編輯器]').click()")
 const editorSettings=await client.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,'editor-settings.png'),Buffer.from(editorSettings.data,'base64'))
 await js("document.querySelector('#preferences [data-page=外觀]').click();document.querySelector('[data-theme-choice=night]').click()")
 assert.equal(await js("JSON.parse(localStorage.getItem('liubai.preferences')).theme"),'night','Theme tiles update real preferences')
 assert.equal(await js("document.querySelector('[data-theme-choice=night]').getAttribute('aria-pressed')"),'true')
 const nightSettings=await client.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,'preferences-night.png'),Buffer.from(nightSettings.data,'base64'))
 await js("document.querySelector('#pref-followSystem').click()")
 assert.equal(await js("JSON.parse(localStorage.getItem('liubai.preferences')).followSystem"),true,'System appearance switch persists')
 await js("document.querySelector('[data-theme-choice=light]').click()")
 assert.equal(await js("JSON.parse(localStorage.getItem('liubai.preferences')).followSystem"),false,'Manual theme disables system override')
 await client.send('Emulation.setDeviceMetricsOverride',{width:927,height:870,deviceScaleFactor:1,mobile:false})
 const appearance=await client.send('Page.captureScreenshot',{format:'png',clip:{x:0,y:32,width:927,height:838,scale:1}});await fs.writeFile(path.join(output,'preferences-reference.png'),Buffer.from(appearance.data,'base64'))
 await client.send('Emulation.setDeviceMetricsOverride',{width:500,height:800,deviceScaleFactor:1,mobile:false})
 assert(await js("document.querySelector('#preferences').scrollWidth<=innerWidth"),'Preferences fit a narrow window')
 const compact=await client.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,'preferences-compact.png'),Buffer.from(compact.data,'base64'))
 await client.send('Emulation.clearDeviceMetricsOverride')
 await js("{const search=document.querySelector('#preferences nav input');search.value='模型';search.dispatchEvent(new Event('input'))}")
 assert(await js("!!document.querySelector('#preferences .agent-connection form')"),'Settings search finds AI configuration')
 await js("{const search=document.querySelector('#preferences nav input');search.value='字體';search.dispatchEvent(new Event('input'))}")
 assert(await js("!!document.querySelector('#pref-fontFamily')"),'Common font synonym finds typography')
 assert(await js("document.querySelector('.preferences-group').textContent.includes('編輯器')"),'Search results identify the setting category')
 await js("{const search=document.querySelector('#preferences nav input');search.value='帳號';search.dispatchEvent(new Event('input'))}")
 assert(await js("!!document.querySelector('#preferences .agent-connection')"),'Account search finds AI account settings')
 await js("document.querySelector('#preferences header button').click()")
 const command=async name=>{await js(`window.__TAURI__.event.emit('desktop:command',${JSON.stringify(name)})`);await wait(250)}
 const setDocument=async markdown=>{if(!await js('document.body.classList.contains("source-mode")'))await command('source');await js(`document.querySelector('#source-editor').value=${JSON.stringify(markdown)};document.querySelector('#source-editor').dispatchEvent(new Event('input',{bubbles:true}))`);await command('source');await wait(150)}
 const content=async()=>{await client.until('!!document.querySelector(".ProseMirror")','visual editor after async remount');return js('(()=>{const e=document.querySelector(".ProseMirror").cloneNode(true);e.querySelectorAll(".inline-review").forEach(w=>w.remove());return e.textContent})()')}
 const submit=async prompt=>{if(await js('document.querySelector("#writing-agent").hidden'))await js('document.querySelector(".agent-entry").click()');await js(`document.querySelector('.agent-composer select').value='document';document.querySelector('.agent-composer textarea').value=${JSON.stringify(prompt)};document.querySelector('.agent-composer').requestSubmit()`)}
 const idle=()=>client.until('!document.querySelector(".agent-composer textarea").readOnly','AI reply')
 const old='今天下雨。我帶著筆記本出門。路上很安靜。\n\n保留 **粗體** 與 [連結](https://example.com)。'
 await setDocument(old);assert((await content()).includes('今天下雨。'))
 const lanBaseURL='http://192.168.0.120:8080/v1'
 assert.equal((await js(`window.desktop.agentConnection({action:'save',baseURL:${JSON.stringify(lanBaseURL)},model:'test-model'})`)).baseURL,lanBaseURL,'Rust accepts a private LAN HTTP endpoint')
 assert.equal((await js('window.desktop.agentConnection()')).baseURL,lanBaseURL,'LAN endpoint persists')
 const liveBaseURL=process.argv.find(arg=>arg.startsWith('--ai-base-url='))?.slice('--ai-base-url='.length)
 if(liveBaseURL){const result=await js(`window.desktop.agentConnection({action:'test',baseURL:${JSON.stringify(liveBaseURL)},model:'test-model'})`);assert(result.models.length>0,'Native LAN endpoint returns models');console.log('PASS: native AI endpoint connection, '+result.models.length+' model(s)')}
 await js(`window.desktop.agentConnection({action:'save',baseURL:'http://127.0.0.1:${server.address().port}/v1',model:'test-model'})`)
 assert.deepEqual(await js(`window.desktop.agentConnection({action:'test',baseURL:'http://127.0.0.1:${server.address().port}/v1',model:'test-model'}).then(r=>r.models)`),['test-model'])
 assert(await js(`window.desktop.agentConnection({action:'save',baseURL:'http://example.com/v1',model:'test'}).then(()=>false,()=>true)`),'Rust rejects insecure remote endpoints')
 const original=await content();await submit('discuss');await idle();assert.equal(await content(),original,'Discussion leaves article intact');assert.equal(requests.length,1)
 assert(await js('document.querySelector(".agent-thread").textContent.includes("先討論")'))
 assert(requests[0].payload.messages[0].content.includes('convert:docx'),'Ported conversion integrations are available to AI capabilities')
 await submit('rewrite');await idle();await client.until('document.querySelectorAll("[data-review=accept]").length===2','sentence-level changes')
 assert.equal(await content(),original,'Inline preview does not replace the original')
 await js('document.querySelector("[data-review=accept]").click()');await wait(150);await js('document.querySelector("[data-review=reject]").click()');await wait(150)
 assert((await content()).includes('今天放晴。'));assert((await content()).includes('路上很安靜。'));assert.equal(await js('document.querySelector(".ProseMirror strong").textContent'),'粗體')
 await command('edit:undo');assert((await content()).includes('今天下雨。'),'Sentence acceptance has independent undo')
 await submit('行距 2.2');await idle();assert.equal(await js('JSON.parse(localStorage.getItem("liubai.preferences")).lineHeight'),2.2,'AI entry adjusts shared settings');assert.equal(requests.length,2,'Numeric setting does not call the model')
 await submit('slow');await client.until('document.querySelector(".agent-composer textarea").readOnly','pending request');for(let i=0;i<150&&!requests.some(r=>r.data.request==='slow');i++)await wait(40);assert(requests.some(r=>r.data.request==='slow'),'Wait for an actual HTTP request before testing connection cancellation');await js('document.querySelector("[data-agent=stop]").click()');await idle();for(let i=0;i<50&&!cancelledRequest;i++)await wait(50);assert(cancelledRequest,'Native cancellation closes the pending HTTP request');pending?.()
 await js('document.querySelector("[data-agent=close]").click()');await command('source');assert.equal(await js('document.querySelector("#source-code").hidden'),false);await command('source')
 await command('theme:night');await js('document.querySelector(".writing-settings").click()');assert.equal(await js('document.querySelector("#preferences").hidden'),false);await js('document.querySelector(".preferences-header button").click()')
 await command('theme:glass');await js('document.querySelector(".agent-entry").click()')
 const capture=await client.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,'glass.png'),Buffer.from(capture.data,'base64'))
 await js('document.querySelector("[data-agent=close]").click()');await wait(500)
 const beforeReload=await content();await client.send('Page.reload');await client.until('!!document.querySelector(".ProseMirror[contenteditable=true]")','restored editor');await wait(300);assert.equal(await content(),beforeReload,'Draft survives WebView reload')
 assert(requests.every(r=>r.payload.messages[0].content.includes('quiet writing collaborator')),'AI instructions preserved')
 await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:true,checks:['shared Milkdown editor and CodeMirror','quiet startup','Rust native bridge','private LAN HTTP saved and persisted','public HTTP rejected','OpenAI-compatible model test and request','writing instructions','discussion without edits','per-sentence accept/reject and undo','local numeric settings','request cancellation','preferences and themes','draft persistence'],liveEndpointTested:!!liveBaseURL,requests:requests.length},null,2));console.log('PASS: '+output)
}catch(error){if(client)try{const capture=await client.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,'failure.png'),Buffer.from(capture.data,'base64'))}catch{}await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:false,error:String(error),stack:error.stack},null,2));console.error(error);process.exitCode=1
}finally{client?.close();if(process.platform==='win32')await exec('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true}).catch(()=>{});else child.kill();server.closeAllConnections();server.close();await log.close()}

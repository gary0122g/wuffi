import net from 'node:net'
export const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
export async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port}
export async function connect(port,timeout=60000,pageFilter=()=>true){
 const started=Date.now();let page
 while(Date.now()-started<timeout){try{const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();page=pages.find(p=>p.type==='page'&&/^(file:|https?:\/\/(?:tauri|wuffi)\.localhost(?:\/|$)|tauri:|wuffi:)/.test(p.url)&&pageFilter(p));if(page)break}catch{}await wait(50)}
 if(!page)throw Error('No local application debugger target')
 const ws=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let serial=0
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
 ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const task=pending.get(message.id);pending.delete(message.id);if(task){clearTimeout(task.timer);message.error?task.reject(Error(message.error.message)):task.resolve(message.result)}}})
 ws.addEventListener('close',()=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error('Debugger closed'))}pending.clear()})
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Debugger timeout: '+method))},30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))})
 const evaluate=async(expression)=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||String(result.exceptionDetails.exception?.value??result.exceptionDetails.text));return result.result?.value}
 return {send,evaluate,close:()=>ws.close(),async until(expression,label,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await wait(80)}throw Error('Timed out: '+label)}}
}

// Explicit benchmark launches only. Normal launches never insert test content.
const fixture='寫作效能測試。Writing should feel immediate.\n\n'+('這是一份相同的中英文測試文章，用來比較編輯器初始化與閒置記憶體。Keep the writer in control and let ideas flow.\n\n').repeat(12)+'基準文章結束。'
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
export async function runRuntimeBenchmark(){
 const report=window.desktop?.benchmarkReport;if(!report)return
 try{
  let editor:HTMLElement|null=null;const deadline=Date.now()+60000
  while(!(editor=document.querySelector<HTMLElement>('.ProseMirror[contenteditable=true]'))){if(Date.now()>deadline)throw Error('Editor initialization timed out');await new Promise(r=>setTimeout(r,5))}
  editor.focus();document.execCommand('insertText',false,'開始寫作。')
  if(!editor.textContent?.includes('開始寫作。'))throw Error('Editor did not accept input')
  await frame();await frame();const readyAt=Date.now()
  // Restore the exact same memory fixture even when reusing a persisted profile.
  const range=document.createRange();range.selectNodeContents(editor);const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range)
  document.execCommand('insertText',false,fixture);await frame()
  if(!editor.textContent?.includes('基準文章結束。'))throw Error('Benchmark document was not accepted')
  await report({readyAt,acceptedInput:true,fixtureCharacters:fixture.length,viewport:{width:innerWidth,height:innerHeight},runtime:document.body.dataset.runtime||'tauri'})
 }catch(error){await report({error:String(error)})}
}

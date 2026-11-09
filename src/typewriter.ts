// Centering during a pointer drag moves the target under the pointer and
// feeds another selectionchange back into scrolling. Wait for a caret instead.
let selecting=false
document.addEventListener('pointerdown',event=>{
  if(event.button===0&&(event.target as Element)?.closest('.ProseMirror,.cm-content'))selecting=true
},true)
for(const event of ['pointerup','pointercancel','dragend'])document.addEventListener(event,()=>{selecting=false},true)
window.addEventListener('blur',()=>{selecting=false})
export function isSelectingText(){return selecting}

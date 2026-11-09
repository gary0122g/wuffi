type Point={x:number;y:number}
const POSITION_KEY='liubai.agent-position.v1'
const margin=12,gap=10

// Positioning and gestures stay independent of the conversation and document.
export function installFloatingAgent(entry:HTMLButtonElement,panel:HTMLElement,toggle:(animate:boolean)=>void){
  let ratio:Point={x:.78,y:.76},frame=0,ignoreClick=false
  let drag:{id:number;start:Point;origin:Point;moved:boolean}|undefined
  try{const saved=JSON.parse(localStorage.getItem(POSITION_KEY)||'null');if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))ratio={x:Math.max(0,Math.min(1,saved.x)),y:Math.max(0,Math.min(1,saved.y))}}catch{/* Use the default when the saved position is unavailable. */}
  const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(Math.max(min,max),n))
  function bounds(){
    const size=entry.offsetWidth,top=Math.max(margin,(document.querySelector('.chrome-titlebar')?.getBoundingClientRect().bottom||0)+margin)
    return {size,top,maxX:Math.max(margin,innerWidth-size-margin),maxY:Math.max(top,innerHeight-size-margin)}
  }
  function point(){const b=bounds();return {x:margin+ratio.x*(b.maxX-margin),y:b.top+ratio.y*(b.maxY-b.top)}}
  function save(){try{localStorage.setItem(POSITION_KEY,JSON.stringify(ratio))}catch{/* Dragging remains available without storage. */}}
  function move(value:Point){
    const b=bounds(),x=clamp(value.x,margin,b.maxX),y=clamp(value.y,b.top,b.maxY)
    ratio={x:(x-margin)/(b.maxX-margin||1),y:(y-b.top)/(b.maxY-b.top||1)}
    entry.style.translate=`${x}px ${y}px`;schedule()
  }
  function place(){
    const b=bounds(),p=point()
    entry.style.translate=`${p.x}px ${p.y}px`
    if(panel.hidden)return
    const width=Math.min(440,innerWidth-2*margin),above=p.y-b.top-gap,below=innerHeight-margin-p.y-b.size-gap
    let side=above>=below?'above':'below'
    let available=Math.max(above,below)
    // Short windows can use the space beside the dot without covering it.
    const leftRoom=p.x-margin-gap,rightRoom=innerWidth-margin-p.x-b.size-gap
    if(available<220&&Math.max(leftRoom,rightRoom)>=width){side=leftRoom>=rightRoom?'left':'right';available=innerHeight-b.top-margin}
    panel.style.width=`${Math.max(0,width)}px`
    panel.style.maxHeight=`${Math.max(0,Math.min(560,available))}px`
    const height=panel.offsetHeight
    const left=side==='left'?p.x-gap-width:side==='right'?p.x+b.size+gap:clamp(p.x+b.size-width,margin,innerWidth-width-margin)
    const top=side==='above'?p.y-gap-height:side==='below'?p.y+b.size+gap:clamp(p.y+b.size-height,b.top,innerHeight-height-margin)
    panel.style.left=`clamp(0px, ${left}px, 100vw)`;panel.style.top=`${Math.max(b.top,top)}px`
    panel.style.transformOrigin=`${p.x+b.size/2-left}px ${p.y+b.size/2-top}px`
    panel.dataset.placement=side
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;place()})}
  function motion(animate:boolean){panel.classList.toggle('agent-instant',!animate)}
  entry.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.isPrimary===false||drag)return
    event.preventDefault() // Preserve the editor selection/context while clicking or dragging.
    ignoreClick=false
    drag={id:event.pointerId,start:{x:event.clientX,y:event.clientY},origin:point(),moved:false}
    entry.setPointerCapture(event.pointerId)
  })
  entry.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return
    const dx=event.clientX-drag.start.x,dy=event.clientY-drag.start.y
    if(!drag.moved&&Math.hypot(dx,dy)<5)return
    drag.moved=true;entry.classList.add('is-dragging');panel.classList.add('agent-instant')
    move({x:drag.origin.x+dx,y:drag.origin.y+dy})
  })
  function release(event:PointerEvent){
    if(!drag||drag.id!==event.pointerId)return
    if(drag.moved){ignoreClick=true;save()}
    drag=undefined;entry.classList.remove('is-dragging')
    if(entry.hasPointerCapture(event.pointerId))entry.releasePointerCapture(event.pointerId)
  }
  for(const name of ['pointerup','pointercancel','lostpointercapture'])entry.addEventListener(name,release as EventListener)
  entry.addEventListener('click',event=>{if(drag)return;if(ignoreClick&&event.detail>0){ignoreClick=false;return}toggle(event.detail>0)})
  entry.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return
    event.preventDefault();event.stopPropagation()
    const p=point(),step=event.shiftKey?24:8
    move({x:p.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),y:p.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)});save()
  })
  window.addEventListener('resize',schedule)
  new ResizeObserver(schedule).observe(panel)
  new MutationObserver(schedule).observe(panel,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','data-stage']})
  place()
  schedule() // The desktop caption is installed later in the startup task.
  return {
    place:schedule,
    show(animate=true){motion(animate);panel.hidden=false;place()},
    hide(animate=true){motion(animate);panel.hidden=true},
  }
}

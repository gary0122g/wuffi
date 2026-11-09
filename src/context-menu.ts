import {translate} from './i18n'
const icons:Record<string,string>={'剪下':'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8 8l12 12M8 16L20 4"/>','複製':'<rect x="8" y="8" width="12" height="13" rx="1"/><path d="M16 8V3H3v13h5"/>','貼上':'<rect x="5" y="5" width="14" height="16" rx="1"/><rect x="9" y="3" width="6" height="4"/><path d="M8 11h8M8 15h8"/>','刪除':'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>','超連結':'<path d="M10 14l4-4M8 16l-1 1a4 4 0 01-6-6l5-5a4 4 0 016 0M16 8l1-1a4 4 0 016 6l-5 5a4 4 0 01-6 0"/>'}
type Action={label:string;command?:string;icon?:string;disabled?:boolean;children?:Action[]}
export function installContextMenu(run:(command:string,target?:HTMLElement)=>void){
  let menu:HTMLElement|null=null
  let activeSubmenu:HTMLElement|null=null,anchor={x:0,y:0}
  const viewport=()=>{const view=window.visualViewport;return {left:(view?.offsetLeft||0)+8,top:(view?.offsetTop||0)+8,right:(view?.offsetLeft||0)+(view?.width||innerWidth)-8,bottom:(view?.offsetTop||0)+(view?.height||innerHeight)-8}}
  const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(value,max))
  const closeSubmenu=()=>{if(!activeSubmenu)return;activeSubmenu.classList.remove('expanded');activeSubmenu.querySelector('button')?.setAttribute('aria-expanded','false');activeSubmenu=null}
  const close=()=>{closeSubmenu();menu?.remove();menu=null}
  const placeSubmenu=()=>{
    if(!activeSubmenu||!menu)return
    const entry=activeSubmenu.querySelector<HTMLButtonElement>('button')!,panel=activeSubmenu.querySelector<HTMLElement>('.context-children')!,bounds=viewport(),parent=entry.getBoundingClientRect()
    panel.style.maxWidth=Math.max(0,bounds.right-bounds.left)+'px';panel.style.maxHeight=Math.max(0,bounds.bottom-bounds.top)+'px'
    const size=panel.getBoundingClientRect(),rightSpace=bounds.right-parent.right,leftSpace=parent.left-bounds.left
    const left=rightSpace<size.width&&(leftSpace>=size.width||leftSpace>rightSpace)
    panel.style.left=clamp(left?parent.left-size.width:parent.right,bounds.left,bounds.right-size.width)+'px'
    panel.style.top=clamp(parent.top,bounds.top,bounds.bottom-size.height)+'px'
    activeSubmenu.classList.toggle('opens-left',left)
    entry.textContent=entry.dataset.label+'　'+(left?'◂':'▸')
  }
  const placeMenu=()=>{
    if(!menu)return
    const bounds=viewport();menu.style.maxWidth=Math.max(0,bounds.right-bounds.left)+'px';menu.style.maxHeight=Math.max(0,bounds.bottom-bounds.top)+'px'
    const size=menu.getBoundingClientRect();menu.style.left=clamp(anchor.x,bounds.left,bounds.right-size.width)+'px';menu.style.top=clamp(anchor.y,bounds.top,bounds.bottom-size.height)+'px'
    placeSubmenu()
  }
  const openSubmenu=(wrap:HTMLElement)=>{if(activeSubmenu!==wrap)closeSubmenu();activeSubmenu=wrap;wrap.classList.add('expanded');wrap.querySelector('button')?.setAttribute('aria-expanded','true');placeSubmenu()}
  window.addEventListener('resize',placeMenu)
  window.visualViewport?.addEventListener('resize',placeMenu)
  window.visualViewport?.addEventListener('scroll',placeMenu)
  document.addEventListener('scroll',event=>{if(!menu)return;if(event.target===menu)closeSubmenu();else if(event.target instanceof Node&&!menu.contains(event.target))close()},true)
  document.addEventListener('pointerdown',event=>{if(menu&&!menu.contains(event.target as Node))close()})
  document.addEventListener('keydown',event=>{
    if(!menu)return
    const panel=document.activeElement?.closest<HTMLElement>('.context-children')
    if(event.key==='ArrowLeft'&&panel){const entry=activeSubmenu?.querySelector<HTMLButtonElement>('button');closeSubmenu();entry?.focus();event.preventDefault()}
    if(event.key==='Escape'){if(panel){const entry=activeSubmenu?.querySelector<HTMLButtonElement>('button');closeSubmenu();entry?.focus()}else close();event.preventDefault()}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();const scope=panel||menu,buttons=[...scope.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(button=>button.offsetParent&&(panel||!button.closest('.context-children')))
      const index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus()
    }
  })
  document.addEventListener('contextmenu',event=>{
    const target=event.target as HTMLElement
    if(!target.closest('.ProseMirror,.cm-editor,textarea,input'))return
    event.preventDefault();close()
    if(target.closest('textarea,input')&&!target.closest('.ProseMirror,.cm-editor')){window.desktop?.nativeContext();return}
    const readonly=document.body.classList.contains('read-only'),selected=Boolean(window.getSelection()?.toString()),table=!!target.closest('table'),list=!!target.closest('li')
    menu=document.createElement('div');menu.className='editor-context-menu';menu.setAttribute('role','menu')
    menu.addEventListener('pointerover',event=>{if(!(event.target as HTMLElement).closest('.context-submenu'))closeSubmenu()})
    const button=(action:Action)=>{const el=document.createElement('button');el.type='button';el.setAttribute('role','menuitem');el.setAttribute('aria-label',action.label);el.title=action.label;el.disabled=!!action.disabled;el.textContent=action.icon||translate(action.label);if(action.icon&&icons[action.label])el.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5">'+icons[action.label]+'</svg>';el.onmousedown=e=>e.preventDefault();if(action.command)el.onclick=()=>{close();run(action.command!,target)};return el}
    const row=(actions:Action[])=>{const div=document.createElement('div');div.className='context-icons';for(const action of actions)div.append(button(action));menu!.append(div)}
    const sub=(action:Action)=>{
      const wrap=document.createElement('div');wrap.className='context-submenu';const entry=button(action);entry.dataset.label=translate(action.label);entry.textContent=entry.dataset.label+'　▸';entry.setAttribute('aria-haspopup','menu');entry.setAttribute('aria-expanded','false')
      const children=document.createElement('div');children.className='context-children';children.setAttribute('role','menu');for(const child of action.children||[])children.append(button(child))
      entry.onclick=()=>openSubmenu(wrap);wrap.onpointerenter=()=>openSubmenu(wrap);wrap.onpointerleave=e=>{if(!(e.relatedTarget instanceof Node)||!wrap.contains(e.relatedTarget)){if(activeSubmenu===wrap)closeSubmenu()}}
      entry.onkeydown=e=>{if(e.key==='ArrowRight'){e.preventDefault();openSubmenu(wrap);children.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()}}
      wrap.append(entry,children);menu!.append(wrap)
    }
    row([{label:'剪下',icon:'✂',command:'context:cut',disabled:readonly||!selected},{label:'複製',icon:'▢',command:'edit:copy:rich',disabled:!selected},{label:'貼上',icon:'▣',command:'context:paste',disabled:readonly},{label:'刪除',icon:'♧',command:'edit:delete',disabled:readonly||!selected}])
    sub({label:'複製或貼上為…',children:[{label:'複製為 Markdown',command:'edit:copy:markdown',disabled:!selected},{label:'複製為 HTML',command:'edit:copy:html',disabled:!selected},{label:'貼上純文字',command:'edit:paste:plain',disabled:readonly}]})
    row([{label:'粗體',icon:'B',command:'format:bold',disabled:readonly},{label:'斜體',icon:'𝘐',command:'format:italic',disabled:readonly},{label:'行內程式碼',icon:'</>',command:'format:code',disabled:readonly},{label:'超連結',icon:'↗',command:'link',disabled:readonly}])
    row([{label:'引用',icon:'❞',command:'format:quote',disabled:readonly},{label:'有次序清單',icon:'≡',command:'format:ordered',disabled:readonly},{label:'無次序清單',icon:'☷',command:'format:list',disabled:readonly},{label:'工作清單',icon:'☑',command:'insert:task',disabled:readonly}])
    const divider=document.createElement('hr');menu.append(divider)
    if(target.closest('img,.milkdown-image-block'))sub({label:'圖片',children:[{label:'圖片屬性…',command:'imageAction:properties',disabled:readonly},{label:'複製圖片路徑',command:'imageAction:copyPath'},...[25,50,75,100,150,200].map(percent=>({label:'縮放 '+percent+'%',command:'imageAction:scale:'+percent,disabled:readonly||!target.closest('.milkdown-image-block')})),{label:'刪除圖片',command:'imageAction:delete',disabled:readonly}]})
    if(table)sub({label:'表格',children:[['上方插入列','rowBefore'],['下方插入列','rowAfter'],['左側插入欄','colBefore'],['右側插入欄','colAfter'],['刪除列','deleteRow'],['刪除欄','deleteColumn'],['刪除表格','deleteTable']].map(([label,command])=>({label,command:'edit:table:'+command,disabled:readonly}))})
    else sub({label:'段落',children:[...Array.from({length:6},(_,i)=>({label:'標題 '+(i+1),command:'format:h'+(i+1),disabled:readonly})),{label:'一般段落',command:'format:paragraph',disabled:readonly},...(list?[{label:'增加縮排',command:'edit:indent',disabled:readonly},{label:'減少縮排',command:'edit:outdent',disabled:readonly}]:[])]})
    sub({label:'插入',children:[['表格','insert:table'],['程式碼區塊','insert:codeblock'],['數學公式','insert:math'],['圖片…','image:local'],['水平線','insert:rule'],['註腳','insert:footnote']].map(([label,command])=>({label,command,disabled:readonly}))})
    anchor={x:event.clientX,y:event.clientY};document.body.append(menu);placeMenu()
  })
}

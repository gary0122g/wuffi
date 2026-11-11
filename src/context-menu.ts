import {translate} from './i18n'

type Action = {label: string; command: string; disabled?: boolean}
type Group = {label: string; actions: Action[]}

export function installContextMenu(run: (command: string, target?: HTMLElement) => void) {
  let menu: HTMLElement | null = null
  let anchor = {x: 0, y: 0}
  let previousFocus: HTMLElement | null = null

  function close() {
    const restore = menu?.contains(document.activeElement)
    menu?.remove()
    menu = null
    if (restore && previousFocus?.isConnected) previousFocus.focus({preventScroll: true})
  }

  function place() {
    if (!menu) return
    const view = window.visualViewport
    const left = (view?.offsetLeft ?? 0) + 8
    const top = (view?.offsetTop ?? 0) + 8
    const width = (view?.width ?? innerWidth) - 16
    const height = (view?.height ?? innerHeight) - 16
    menu.style.maxWidth = width + 'px'
    menu.style.maxHeight = height + 'px'
    menu.style.left = Math.max(left, Math.min(anchor.x, left + width - menu.offsetWidth)) + 'px'
    menu.style.top = Math.max(top, Math.min(anchor.y, top + height - menu.offsetHeight)) + 'px'
  }
  window.addEventListener('resize', place)
  window.visualViewport?.addEventListener('resize', place)
  window.visualViewport?.addEventListener('scroll', place)
  document.addEventListener('scroll', e => {
    if (menu && e.target instanceof Node && !menu.contains(e.target)) close()
  }, true)
  document.addEventListener('pointerdown', e => {
    if (menu && !menu.contains(e.target as Node)) close()
  })
  document.addEventListener('keydown', e => {
    if (menu && e.key === 'Escape') { e.preventDefault(); close() }
  })

  document.addEventListener('contextmenu', event => {
    const target = event.target as HTMLElement
    if (!target.closest('.ProseMirror,.cm-editor,textarea,input')) return
    event.preventDefault()
    close()
    if (!target.closest('.ProseMirror,.cm-editor')) { window.desktop?.nativeContext(); return }
    previousFocus = document.activeElement as HTMLElement
    const readonly = document.body.classList.contains('read-only')
    const selected = Boolean(window.getSelection()?.toString())
    const table = !!target.closest('table'), list = !!target.closest('li')
    const groups: Group[] = []
    const group = (label: string, actions: Action[]) => groups.push({label, actions})
    group('剪貼', [{label:'剪下',command:'context:cut',disabled:readonly||!selected},{label:'複製',command:'edit:copy:rich',disabled:!selected},{label:'貼上',command:'context:paste',disabled:readonly},{label:'刪除',command:'edit:delete',disabled:readonly||!selected}])
    groups[0].actions.push(...[{label:'複製為 Markdown',command:'edit:copy:markdown',disabled:!selected},{label:'複製為 HTML',command:'edit:copy:html',disabled:!selected},{label:'貼上純文字',command:'edit:paste:plain',disabled:readonly}])
    group('文字', [{label:'粗體',command:'format:bold',disabled:readonly},{label:'斜體',command:'format:italic',disabled:readonly},{label:'行內程式碼',command:'format:code',disabled:readonly},{label:'超連結',command:'link',disabled:readonly}])
    group('區塊', [{label:'引用',command:'format:quote',disabled:readonly},{label:'有次序清單',command:'format:ordered',disabled:readonly},{label:'無次序清單',command:'format:list',disabled:readonly},{label:'工作清單',command:'insert:task',disabled:readonly}])
    if(target.closest('img,.milkdown-image-block'))group('圖片', [{label:'圖片屬性…',command:'imageAction:properties',disabled:readonly},{label:'複製圖片路徑',command:'imageAction:copyPath'},...[25,50,75,100,150,200].map(percent=>({label:'縮放 '+percent+'%',command:'imageAction:scale:'+percent,disabled:readonly||!target.closest('.milkdown-image-block')})),{label:'刪除圖片',command:'imageAction:delete',disabled:readonly}])
    if(table)group('表格', [['上方插入列','rowBefore'],['下方插入列','rowAfter'],['左側插入欄','colBefore'],['右側插入欄','colAfter'],['刪除列','deleteRow'],['刪除欄','deleteColumn'],['刪除表格','deleteTable']].map(([label,command])=>({label,command:'edit:table:'+command,disabled:readonly})))
    else group('段落', [...Array.from({length:6},(_,i)=>({label:'標題 '+(i+1),command:'format:h'+(i+1),disabled:readonly})),{label:'一般段落',command:'format:paragraph',disabled:readonly},...(list?[{label:'增加縮排',command:'edit:indent',disabled:readonly},{label:'減少縮排',command:'edit:outdent',disabled:readonly}]:[])])
    group('插入', [['表格','insert:table'],['程式碼區塊','insert:codeblock'],['數學公式','insert:math'],['圖片…','image:local'],['水平線','insert:rule'],['註腳','insert:footnote']].map(([label,command])=>({label,command,disabled:readonly})))

    const palette = document.createElement('div')
    palette.className = 'writing-palette'
    palette.setAttribute('role', 'dialog')
    palette.setAttribute('aria-label', translate('編輯工具'))
    const categories = document.createElement('div')
    categories.className = 'palette-categories'
    const commands = document.createElement('div')
    commands.className = 'palette-commands'
    function activate(index: number) {
      Array.from(categories.children).forEach((item, i) => item.setAttribute('aria-pressed', String(i === index)))
      commands.replaceChildren()
      for (const action of groups[index].actions) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = translate(action.label)
        button.disabled = !!action.disabled
        button.onclick = () => { close(); run(action.command, target) }
        commands.append(button)
      }
      place()
    }
    for (const [index, category] of groups.entries()) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = translate(category.label)
      button.onclick = () => activate(index)
      categories.append(button)
    }
    palette.onmousedown = e => e.preventDefault()
    palette.onkeydown = e => {
      const inCategories = categories.contains(document.activeElement)
      const buttons = [...(inCategories ? categories : commands).querySelectorAll<HTMLButtonElement>('button:enabled')]
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        buttons[next]?.focus()
        if (inCategories) activate(next)
      } else if (e.key === 'ArrowRight' && inCategories) {
        e.preventDefault()
        commands.querySelector<HTMLButtonElement>('button:enabled')?.focus()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        categories.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus()
      }
    }
    palette.addEventListener('focusout', e => {
      if (e.relatedTarget && !palette.contains(e.relatedTarget as Node)) queueMicrotask(() => { if (menu === palette) close() })
    })
    menu = palette
    anchor = {x: event.clientX, y: event.clientY}
    palette.append(categories, commands)
    document.body.append(palette)
    const initial = groups.findIndex(g => g.label === '圖片' || g.label === '表格')
    activate(Math.max(0, initial))
    categories.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus({preventScroll: true})
  })
}

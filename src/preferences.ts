import {translate,currentLanguage} from './i18n'
export type Preferences = {
  uiLanguage:'zh-TW'|'en'; startup: string; autoSave: boolean; saveOnSwitch: boolean; extension: string;
  fontSize: number; lineHeight: number; zoom: number; status: boolean; toolbar: boolean; theme: string;
  lineEnding: string; spellcheck: boolean; sourceNumbers: boolean; sourceWrap: boolean;
  tabSize: number; readingSpeed: number; imageWidth: number; paperSize: string;
  imageRelative: boolean; imageCopy: boolean; wheelZoom: boolean; codeNumbers: boolean; codeWrap: boolean;
  smartDashes:boolean;defaultCodeLanguage:string;autoPair:boolean;markdownPair:boolean;smartQuotes:boolean;formatOnSave:boolean;showHidden:boolean;outlineFold:boolean;rememberRecent:boolean;
  sequenceTheme:string;mermaidTheme:string;mathLegacy:boolean;mathLineBreaks:boolean;mathPhysics:boolean;mathNumbering:string;mathExport:string;latexDelimiters:boolean;codeMath:boolean;
  headingStyle:string;bulletStyle:string;orderedIncrement:boolean;autoLink:boolean;inlineMath:boolean;subscript:boolean;superscript:boolean;highlight:boolean;diagrams:boolean;
  pdfMargin:number;pdfScale:number;pdfHeader:string;pdfFooter:string;pdfPageNumbers:boolean;fontFamily:string;codeFontFamily:string;followSystem:boolean;pdfLandscape:boolean;
}
const defaults: Preferences = {
  uiLanguage:currentLanguage(), startup: 'restore', autoSave: false, saveOnSwitch: false, extension: 'md',
  fontSize: 16, lineHeight: 1.6, zoom: 1, status: true, toolbar: false, theme: 'light',
  lineEnding: 'preserve', spellcheck: false, sourceNumbers: true, sourceWrap: true,
  tabSize: 4, readingSpeed: 382, imageWidth: 100, paperSize: 'A4',
  imageRelative: false, imageCopy: false, wheelZoom: false, codeNumbers:false, codeWrap:true,
  smartDashes:false,defaultCodeLanguage:'',autoPair:true,markdownPair:false,smartQuotes:false,formatOnSave:false,showHidden:false,outlineFold:true,rememberRecent:true,
  sequenceTheme:'simple',mermaidTheme:'auto',mathLegacy:false,mathLineBreaks:false,mathPhysics:false,mathNumbering:'none',mathExport:'svg',latexDelimiters:true,codeMath:true,
  headingStyle:'atx',bulletStyle:'-',orderedIncrement:true,autoLink:true,inlineMath:true,subscript:false,superscript:false,highlight:false,diagrams:true,
  pdfMargin:18,pdfScale:100,pdfHeader:'',pdfFooter:'',pdfPageNumbers:false,fontFamily:'',codeFontFamily:'Sarasa Mono TC',followSystem:false,pdfLandscape:false,
}
export function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem('liubai.preferences') || '{}')
    // Migrate the previous default once; subsequent explicit font choices remain intact.
    if (!localStorage.getItem('liubai.sarasa-font-v1')) {
      if (!saved.codeFontFamily || saved.codeFontFamily === 'Consolas') saved.codeFontFamily = defaults.codeFontFamily
      localStorage.setItem('liubai.preferences', JSON.stringify(saved))
      localStorage.setItem('liubai.sarasa-font-v1', '1')
    }
    return { ...defaults, ...saved }
  }
  catch { return { ...defaults } }
}
type Field = { key: keyof Preferences; label: string; options?: [string, string][]; min?: number; max?: number; step?: number; check?: boolean;text?:boolean }
type Row = { title: string; fields?: Field[]; action?: string; actionLabel?: string; description?: string }
const pages: Record<string, Row[]> = {
  '檔案': [
    { title: '啟動選項', fields: [{ key: 'startup', label: '啟動選項', options: [['restore','復原上次開啟的檔案'],['new','開啟新檔']] }] },
    { title:'大綱',fields:[{key:'outlineFold',label:'允許展開／折疊側邊欄大綱',check:true}] },
    { title: '預設檔案類型或副檔名', fields: [{ key: 'extension', label: '副檔名', options: [['md','Markdown (.md)'],['markdown','Markdown (.markdown)'],['txt','純文字 (.txt)']] }] },
    { title: '儲存並復原', fields: [{ key: 'autoSave', label: '自動儲存', check: true }, { key: 'saveOnSwitch', label: '在側邊欄切換檔案時自動儲存無需詢問', check: true }], action: 'drafts', actionLabel: '復原未儲存的草稿' },
    { title: '最近位置',fields:[{key:'rememberRecent',label:'記錄最近使用的檔案與資料夾',check:true}], action: 'clearRecent', actionLabel: '清除最近使用的資料夾與檔案' },
    { title:'檔案樹狀目錄／檔案庫',fields:[{key:'showHidden',label:'顯示隱藏的檔案與資料夾',check:true}] },
  ],
  '編輯器': [
    { title:'儲存時調整縮排',fields:[{key:'tabSize',label:'縮排',options:[['2','2'],['4','4'],['8','8']]},{key:'formatOnSave',label:'整理縮排',check:true}] },
    { title:'自動配對',fields:[{key:'autoPair',label:'自動配對括號與引號',check:true},{key:'markdownPair',label:'自動配對常用 Markdown 符號',check:true}] },
    { title: '預設換行符號', description: '儲存檔案時使用的換行符號', fields: [{ key: 'lineEnding', label: '換行符號', options: [['preserve','保留原檔'],['lf','LF (Unix Style)'],['crlf','CRLF (Windows Style)']] }] },
    { title: '拼字檢查', fields: [{ key: 'spellcheck', label: '啟用拼字檢查', check: true }] },
    { title: '打字機模式', action: 'reset-focus', actionLabel: '關閉打字機／專注模式' },
  ],
  '圖片': [
    { title: '圖片上傳設定',action:'settings:upload',actionLabel:'設定上傳服務…' },
    { title: '插入圖片時…', fields:[{key:'imageCopy',label:'將本機圖片複製到文件的 .assets 資料夾',check:true}], action: 'image:local', actionLabel: '插入本機圖片…' },
    { title: '圖片語法偏好設定', fields:[{key:'imageRelative',label:'優先使用相對路徑',check:true}] },
    { title: '圖片顯示', fields: [{ key: 'imageWidth', label: '最大寬度（文章寬度百分比）', min: 10, max: 100 }] },
  ],
  'Markdown': [
    {title:'Markdown 語法偏好設定',fields:[{key:'headingStyle',label:'標題樣式',options:[['atx','atx (#)'],['setext','setext (=== / ---)']]},{key:'bulletStyle',label:'無次序清單',options:[['-','-'],['*','*'],['+','+']]},{key:'orderedIncrement',label:'有次序清單使用連續編號',check:true}]},
    {title:'Markdown 語法擴充支援',fields:[{key:'autoLink',label:'自動鏈接連結',check:true},{key:'inlineMath',label:'行內數學式',check:true},{key:'subscript',label:'下標（H~2~O）',check:true},{key:'superscript',label:'上標（X^2^）',check:true},{key:'highlight',label:'醒目標示（==key==）',check:true},{key:'diagrams',label:'圖表（Mermaid）',check:true}]},
    {title:'圖表選項',fields:[{key:'sequenceTheme',label:'序列圖主題',options:[['simple','Simple'],['hand','Hand drawn']]},{key:'mermaidTheme',label:'Mermaid 主題',options:[['auto','跟隨編輯器'],['default','Default'],['forest','Forest'],['dark','Dark'],['neutral','Neutral']]}]},
    {title:'數學式',fields:[{key:'latexDelimiters',label:'LaTeX Math Delimiter：\\( \\) 與 \\[ \\]',check:true},{key:'codeMath',label:'程式碼區塊數學式（math）',check:true},{key:'mathLegacy',label:'使用舊版行內公式解析（相容模式）',check:true},{key:'mathLineBreaks',label:'在數學式中套用換行',check:true},{key:'mathPhysics',label:'啟用 physics 套件',check:true},{key:'mathNumbering',label:'自動編號數學式',options:[['none','不啟用自動編號'],['all','所有區塊數學式'],['ams','AMS 數學環境']]},{key:'mathExport',label:'匯出公式',options:[['svg','使用 SVG 渲染'],['mathml','使用 MathML']]}]},
    { title:'智慧型標點符號',fields:[{key:'smartQuotes',label:'智慧型引號',check:true},{key:'smartDashes',label:'智慧型破折號',check:true}] },
    { title: '原始碼模式', fields: [{ key: 'sourceNumbers', label: '顯示行號', check: true }, { key: 'sourceWrap', label: '自動折行', check: true }] },
    { title: '縮排', fields: [{ key: 'tabSize', label: 'Tab 寬度', options: [['2','2'],['4','4'],['8','8']] }] },
    { title: '程式碼區塊', fields:[{key:'defaultCodeLanguage',label:'程式碼區塊預設語言',text:true},{key:'codeNumbers',label:'顯示程式碼行號',check:true},{key:'codeWrap',label:'程式碼自動換行',check:true}] },
  ],
  '匯出': [
    {title:'自訂匯出',action:'settings:templates',actionLabel:'管理各格式模板與參考文件…'},
    {title:'頁面方向',fields:[{key:'pdfLandscape',label:'橫向',check:true}]},
    { title: 'PDF', fields: [{ key: 'paperSize', label: '紙張大小', options: [['A3','A3'],['A4','A4'],['A5','A5'],['Letter','Letter'],['Legal','Legal'],['Tabloid','Tabloid']] }], action: 'export:pdf', actionLabel: '匯出 PDF…' },
    {title:'PDF 排版',fields:[{key:'pdfMargin',label:'邊界（mm）',min:0,max:50},{key:'pdfScale',label:'縮放（%）',min:50,max:200},{key:'pdfHeader',label:'頁首',text:true},{key:'pdfFooter',label:'頁尾',text:true},{key:'pdfPageNumbers',label:'頁尾顯示頁碼',check:true}]},
    { title: 'HTML', action: 'export:html', actionLabel: '匯出 HTML…' },
    ...[['Word','docx'],['OpenOffice','odt'],['RTF','rtf'],['Epub','epub'],['LaTeX','tex'],['MediaWiki','wiki'],['reStructuredText','rst'],['Textile','textile'],['OPML','opml']].map(([title,format])=>({title,action:'convert:'+format,actionLabel:'匯出 '+title+'…'})),
  ],
  '外觀': [
    {title:'語言',fields:[{key:'uiLanguage',label:'介面語言',options:[['zh-TW','繁體中文'],['en','English']]}]},
    {title:'字型',fields:[{key:'fontFamily',label:'文章字型（留空使用主題預設）',text:true},{key:'codeFontFamily',label:'程式碼字型',text:true}]},
    {title:'深色模式',fields:[{key:'followSystem',label:'依系統外觀自動切換 Night 主題',check:true}]},
    { title: '字型大小', fields: [{ key: 'fontSize', label: '字型大小（px）', min: 12, max: 32 }] },
    { title: '行距', fields: [{key:'lineHeight',label:'行距倍數（文章與原始碼）',min:1,max:3,step:0.1}] },
    { title: '縮放', fields: [{ key: 'zoom', label: '縮放', options: [['0.75','75%'],['0.9','90%'],['1','100%'],['1.1','110%'],['1.25','125%'],['1.5','150%']] }] },
    { title: '', fields:[{key:'wheelZoom',label:'按住 Ctrl 鍵並使用滑鼠滾輪進行縮放',check:true}] },
    { title: '狀態欄', fields: [{ key: 'status', label: '顯示狀態欄', check: true }] },
    { title: '字數統計', fields: [{ key: 'readingSpeed', label: '朗讀速度（字數／分）', min: 60, max: 1000 }] },
    { title: '工具列', fields: [{ key: 'toolbar', label: '顯示編輯器工具列', check: true }] },
    { title: '佈景主題', fields: [{ key: 'theme', label: '主題', options: [['light','Github'],['newsprint','Newsprint'],['night','Night'],['pixyll','Pixyll'],['whitey','Whitey'],['glass','Liquid Glass']] }],action:'settings:themes',actionLabel:'自訂主題與主題資料夾…' },
  ],
  '一般': [
    {title:'語言',fields:[{key:'uiLanguage',label:'介面語言',options:[['zh-TW','繁體中文'],['en','English']]}]},
    { title: '快捷鍵', action: 'settings:shortcuts', actionLabel: '自訂快捷鍵' },
    { title: '關於', description: 'wuffi · Windows Markdown 編輯器' },
  ],
}
export function preferenceCapabilities(){
  return [...new Map(Object.values(pages).flatMap(rows=>rows.flatMap(row=>row.fields||[])).map(field=>[field.key,field])).values()]
    .map(field=>({...field,type:typeof defaults[field.key]}))
}
export function validatePreferencePatch(patch:Record<string,unknown>):Partial<Preferences>{
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('設定格式不正確')
  const fields=preferenceCapabilities(),result:Record<string,unknown>={}
  for(const [key,value] of Object.entries(patch)){
    const field=fields.find(field=>field.key===key)
    if(!field||typeof value!==field.type)throw Error('不支援的設定：'+key)
    if(field.options&&!field.options.some(([option])=>option===String(value)))throw Error('設定選項不正確：'+key)
    if(typeof value==='number'&&(!Number.isFinite(value)||(field.min!==undefined&&value<field.min)||(field.max!==undefined&&value>field.max)))throw Error('設定數值超出範圍：'+key)
    if(typeof value==='string'&&value.length>500)throw Error('設定文字過長')
    result[key]=value
  }
  return result as Partial<Preferences>
}
export function createPreferences(get: () => Preferences, change: (value: Preferences) => void, action: (value: string) => void) {
  const root = document.createElement('section')
  root.id = 'preferences'; root.hidden = true; root.setAttribute('aria-label', '偏好設定')
  root.innerHTML = '<header class="preferences-header"><span>偏好設定</span><button aria-label="關閉偏好設定">×</button></header><div class="preferences-layout"><nav><input type="search" placeholder="搜尋…" aria-label="搜尋偏好設定"><div class="preferences-tabs"></div></nav><main class="preferences-content"></main><aside class="preferences-preview" aria-label="即時預覽"><h2>即時預覽</h2><div class="preview-paper"><h3>寫作，從這一行開始</h3><p>調整字型與行距，找到舒服的閱讀節奏。<br>Write clearly. Make room for your ideas.</p><pre><code>const message = "Hello 世界";\nconsole.log(message);</code></pre></div><small>設定立即套用，範例不會修改文件。</small></aside></div>'
  document.body.append(root)
  let selected = '檔案'
  let previousFocus:HTMLElement|null=null
  const search = root.querySelector('input')!
  const panel = root.querySelector('main')!
  const nav = root.querySelector('.preferences-tabs')!
  function preview(){const value=get(),paper=root.querySelector<HTMLElement>('.preview-paper')!;paper.style.fontFamily=value.fontFamily||getComputedStyle(document.body).getPropertyValue('--document-font');paper.style.fontSize=value.fontSize+'px';paper.style.lineHeight=String(value.lineHeight)}
  function close() { root.hidden = true;previousFocus?.focus() }
  function sync() {
    const value=get()
    for(const control of root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[id^="pref-"]')){
      const key=control.id.slice(5) as keyof Preferences
      if(control instanceof HTMLInputElement&&control.type==='checkbox')control.checked=Boolean(value[key])
      else if(control.value!==String(value[key]))control.value=String(value[key])
    }
    preview()
  }
  function render() {
    preview()
    nav.replaceChildren(); panel.replaceChildren()
    const query = search.value.trim().toLowerCase()
    for (const name of Object.keys(pages)) {
      const button = document.createElement('button'); button.textContent = name
      button.dataset.page = name
      button.className = selected === name && !query ? 'selected' : ''
      button.setAttribute('aria-current',selected===name&&!query?'page':'false')
      button.onclick = () => { selected = name; search.value = ''; root.scrollTop=0;render();nav.querySelector<HTMLButtonElement>('.selected')?.focus() }
      nav.append(button)
    }
    const heading = document.createElement('h1'); heading.textContent = query ? '搜尋結果' : selected; panel.append(heading)
    for (const [name, rows] of Object.entries(pages)) {
      if (!query && name !== selected) continue
      for (const row of rows) {
        if (query && !JSON.stringify(row).toLowerCase().includes(query) && !name.toLowerCase().includes(query) && !translate(name).toLowerCase().includes(query) && !JSON.stringify(row,(_key,value)=>typeof value==='string'?translate(value):value).toLowerCase().includes(query)) continue
        const section = document.createElement('section'); section.className = 'preference-row'
        const label = document.createElement('div'); const title = document.createElement('h2'); title.textContent = row.title; label.append(title)
        if (row.description) { const detail = document.createElement('p'); detail.textContent = row.description; label.append(detail) }
        const controls = document.createElement('div'); controls.className = 'preference-controls'
        for (const field of row.fields || []) {
          const wrap = document.createElement('label')
          const control = document.createElement(field.options ? 'select' : 'input')
          control.id = `pref-${field.key}`; control.setAttribute('aria-label', field.label)
          if (control instanceof HTMLSelectElement) {
            for (const [value, text] of field.options!) { const option = document.createElement('option'); option.value = value; option.textContent = text; control.append(option) }
            control.value = String(get()[field.key])
          } else if (field.check) { control.type = 'checkbox'; control.checked = Boolean(get()[field.key]) }
          else { control.type = field.text?'text':'number'; if(field.step!==undefined)control.step=String(field.step);if(field.min!==undefined)control.min=String(field.min);if(field.max!==undefined)control.max=String(field.max); control.value = String(get()[field.key]) }
          control.onchange = () => {
            let value: string | boolean | number = control.value
            if (field.check && control instanceof HTMLInputElement) value = control.checked
            else if (typeof defaults[field.key] === 'number') {
              value = Number(value)
              if (!Number.isFinite(value) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) { control.value = String(get()[field.key]); return }
            }
            change({ ...get(), [field.key]: value, ...(field.key==='theme'?{followSystem:false}:{}) });preview()
          }
          if(control instanceof HTMLInputElement&&!field.check)control.addEventListener('input',()=>{if(control.type==='number'&&(control.value===''||!control.validity.valid))return;control.onchange?.call(control,new Event('change'))})
          wrap.append(control)
          if (field.check) wrap.append(document.createTextNode(field.label))
          else if (!field.options) { const suffix = document.createElement('span'); suffix.textContent = field.label; wrap.append(suffix) }
          controls.append(wrap)
        }
        if (row.action) { const button = document.createElement('button'); button.textContent = row.actionLabel!; button.onclick = () => { close(); action(row.action!) }; controls.append(button) }
        section.append(label, controls); panel.append(section)
      }
    }
  }
  search.oninput = render
  root.querySelector('header button')!.addEventListener('click', close)
  root.addEventListener('keydown', event => {
    if(event.isComposing)return
    if (event.key === 'Escape') { event.stopPropagation(); close() }
    if(event.key==='Tab'){
      const controls=Array.from(root.querySelectorAll<HTMLElement>('button,input,select')).filter(el=>!el.hasAttribute('disabled'))
      const first=controls[0],last=controls.at(-1)
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
    }
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&nav.contains(document.activeElement)){
      event.preventDefault();const buttons=Array.from(nav.querySelectorAll('button')),index=buttons.indexOf(document.activeElement as HTMLButtonElement)
      buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].click()
    }
  })
  return { open() { if(root.hidden)previousFocus=document.activeElement as HTMLElement;root.hidden = false;root.scrollTop=0; search.value = ''; render(); search.focus() }, close, sync }
}

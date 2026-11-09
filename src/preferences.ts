import {translate,currentLanguage} from './i18n'
import {mountAISettings} from './ai-settings'
import {mountAppUpdates} from './app-updates'
import {createElement, Palette, Type, FolderOpen, FileCode, Upload, Settings, Sparkles} from 'lucide'
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
    if(saved.theme==='pixyll'||saved.theme==='whitey'){saved.theme='light';localStorage.setItem('liubai.preferences',JSON.stringify(saved));localStorage.setItem('liubai.theme','light')}
    return { ...defaults, ...saved }
  }
  catch { return { ...defaults } }
}
type Field = { key: keyof Preferences; label: string; options?: [string, string][]; min?: number; max?: number; step?: number; check?: boolean;text?:boolean }
type Row = { title: string; fields?: Field[]; action?: string; actionLabel?: string; description?: string; group?:string }
const pages: Record<string, Row[]> = {
  '一般': [
    {group:'啟動與語言', title: '啟動選項', fields: [{ key: 'startup', label: '啟動選項', options: [['restore','復原上次開啟的檔案'],['new','開啟新檔']] }] },
    {group:'啟動與語言',title:'語言',fields:[{key:'uiLanguage',label:'介面語言',options:[['zh-TW','繁體中文'],['en','English']]}]},
    {group:'快捷鍵與版本', title: '快捷鍵', action: 'settings:shortcuts', actionLabel: '自訂快捷鍵' },
    {group:'快捷鍵與版本', title: '關於', description: 'wuffi · Windows Markdown 編輯器' },
  ],
  '外觀': [
    {group:'主題', title: '佈景主題', fields: [{ key: 'theme', label: '主題', options: [['light','明亮白'],['newsprint','紙感米'],['night','深夜灰'],['glass','Liquid Glass']] }],action:'settings:themes',actionLabel:'自訂主題與主題資料夾…' },
    {group:'主題',title:'跟隨系統外觀',description:'隨系統自動在淺色與深色佈景主題之間切換',fields:[{key:'followSystem',label:'跟隨系統外觀',check:true}]},
    {group:'工作區', title: '工具列', fields: [{ key: 'toolbar', label: '顯示編輯器工具列', check: true }] },
    {group:'工作區', title: '狀態欄', fields: [{ key: 'status', label: '顯示狀態欄', check: true }] },
    {group:'工作區', title:'大綱',fields:[{key:'outlineFold',label:'允許展開／折疊側邊欄大綱',check:true}] },
  ],
  '編輯器': [
    {group:'文字與閱讀',title:'字型',fields:[{key:'fontFamily',label:'文章字型（留空使用主題預設）',text:true},{key:'codeFontFamily',label:'程式碼字型',text:true}]},
    {group:'文字與閱讀', title: '字型大小', fields: [{ key: 'fontSize', label: '字型大小（px）', min: 12, max: 32 }] },
    {group:'文字與閱讀', title: '行距', fields: [{key:'lineHeight',label:'行距倍數（文章與原始碼）',min:1,max:3,step:0.1}] },
    {group:'文字與閱讀', title: '縮放', fields: [{ key: 'zoom', label: '縮放', options: [['0.75','75%'],['0.9','90%'],['1','100%'],['1.1','110%'],['1.25','125%'],['1.5','150%']] }] },
    {group:'文字與閱讀', title: '', fields:[{key:'wheelZoom',label:'按住 Ctrl 鍵並使用滑鼠滾輪進行縮放',check:true}] },
    {group:'文字與閱讀', title: '字數統計', fields: [{ key: 'readingSpeed', label: '朗讀速度（字數／分）', min: 60, max: 1000 }] },
    {group:'輸入輔助', title:'自動配對',fields:[{key:'autoPair',label:'自動配對括號與引號',check:true},{key:'markdownPair',label:'自動配對常用 Markdown 符號',check:true}] },
    {group:'輸入輔助', title:'智慧型標點符號',fields:[{key:'smartQuotes',label:'智慧型引號',check:true},{key:'smartDashes',label:'智慧型破折號',check:true}] },
    {group:'輸入輔助', title: '拼字檢查', fields: [{ key: 'spellcheck', label: '啟用拼字檢查', check: true }] },
    {group:'輸入輔助', title: '打字機模式', action: 'reset-focus', actionLabel: '關閉打字機／專注模式' },
    {group:'原始碼與程式碼', title: '原始碼模式', fields: [{ key: 'sourceNumbers', label: '顯示行號', check: true }, { key: 'sourceWrap', label: '自動折行', check: true }] },
    {group:'原始碼與程式碼', title:'儲存時調整縮排',fields:[{key:'tabSize',label:'縮排',options:[['2','2'],['4','4'],['8','8']]},{key:'formatOnSave',label:'整理縮排',check:true}] },
    {group:'原始碼與程式碼', title: '程式碼區塊', fields:[{key:'defaultCodeLanguage',label:'程式碼區塊預設語言',text:true},{key:'codeNumbers',label:'顯示程式碼行號',check:true},{key:'codeWrap',label:'程式碼自動換行',check:true}] },
  ],
  '檔案': [
    {group:'儲存與復原', title: '儲存並復原', fields: [{ key: 'autoSave', label: '自動儲存', check: true }, { key: 'saveOnSwitch', label: '在側邊欄切換檔案時自動儲存無需詢問', check: true }], action: 'drafts', actionLabel: '復原未儲存的草稿' },
    {group:'儲存與復原', title: '最近位置',fields:[{key:'rememberRecent',label:'記錄最近使用的檔案與資料夾',check:true}], action: 'clearRecent', actionLabel: '清除最近使用的資料夾與檔案' },
    {group:'儲存與復原', title: '預設檔案類型或副檔名', fields: [{ key: 'extension', label: '副檔名', options: [['md','Markdown (.md)'],['markdown','Markdown (.markdown)'],['txt','純文字 (.txt)']] }] },
    {group:'儲存與復原', title: '預設換行符號', description: '儲存檔案時使用的換行符號', fields: [{ key: 'lineEnding', label: '換行符號', options: [['preserve','保留原檔'],['lf','LF (Unix Style)'],['crlf','CRLF (Windows Style)']] }] },
    {group:'儲存與復原', title:'檔案樹狀目錄／檔案庫',fields:[{key:'showHidden',label:'顯示隱藏的檔案與資料夾',check:true}] },
    {group:'圖片', title: '插入圖片時…', fields:[{key:'imageCopy',label:'將本機圖片複製到文件的 .assets 資料夾',check:true}], action: 'image:local', actionLabel: '插入本機圖片…' },
    {group:'圖片', title: '圖片語法偏好設定', fields:[{key:'imageRelative',label:'優先使用相對路徑',check:true}] },
    {group:'圖片', title: '圖片顯示', fields: [{ key: 'imageWidth', label: '最大寬度（文章寬度百分比）', min: 10, max: 100 }] },
    {group:'圖片', title: '圖片上傳設定',action:'settings:upload',actionLabel:'設定上傳服務…' },
  ],
  'Markdown': [
    {group:'語法與擴充',title:'Markdown 語法偏好設定',fields:[{key:'headingStyle',label:'標題樣式',options:[['atx','atx (#)'],['setext','setext (=== / ---)']]},{key:'bulletStyle',label:'無次序清單',options:[['-','-'],['*','*'],['+','+']]},{key:'orderedIncrement',label:'有次序清單使用連續編號',check:true}]},
    {group:'語法與擴充',title:'Markdown 語法擴充支援',fields:[{key:'autoLink',label:'自動鏈接連結',check:true},{key:'inlineMath',label:'行內數學式',check:true},{key:'subscript',label:'下標（H~2~O）',check:true},{key:'superscript',label:'上標（X^2^）',check:true},{key:'highlight',label:'醒目標示（==key==）',check:true},{key:'diagrams',label:'圖表（Mermaid）',check:true}]},
    {group:'圖表與公式',title:'圖表選項',fields:[{key:'sequenceTheme',label:'序列圖主題',options:[['simple','Simple'],['hand','Hand drawn']]},{key:'mermaidTheme',label:'Mermaid 主題',options:[['auto','跟隨編輯器'],['default','Default'],['forest','Forest'],['dark','Dark'],['neutral','Neutral']]}]},
    {group:'圖表與公式',title:'數學式',fields:[{key:'latexDelimiters',label:'LaTeX Math Delimiter：\\( \\) 與 \\[ \\]',check:true},{key:'codeMath',label:'程式碼區塊數學式（math）',check:true},{key:'mathLegacy',label:'使用舊版行內公式解析（相容模式）',check:true},{key:'mathLineBreaks',label:'在數學式中套用換行',check:true},{key:'mathPhysics',label:'啟用 physics 套件',check:true},{key:'mathNumbering',label:'自動編號數學式',options:[['none','不啟用自動編號'],['all','所有區塊數學式'],['ams','AMS 數學環境']]},{key:'mathExport',label:'匯出公式',options:[['svg','使用 SVG 渲染'],['mathml','使用 MathML']]}]},
  ],
  '匯出': [
    {group:'PDF 排版', title: 'PDF', fields: [{ key: 'paperSize', label: '紙張大小', options: [['A3','A3'],['A4','A4'],['A5','A5'],['Letter','Letter'],['Legal','Legal'],['Tabloid','Tabloid']] }], action: 'export:pdf', actionLabel: '匯出 PDF…' },
    {group:'PDF 排版',title:'頁面方向',fields:[{key:'pdfLandscape',label:'橫向',check:true}]},
    {group:'PDF 排版',title:'PDF 排版',fields:[{key:'pdfMargin',label:'邊界（mm）',min:0,max:50},{key:'pdfScale',label:'縮放（%）',min:50,max:200},{key:'pdfHeader',label:'頁首',text:true},{key:'pdfFooter',label:'頁尾',text:true},{key:'pdfPageNumbers',label:'頁尾顯示頁碼',check:true}]},
    {group:'其他格式', title: 'HTML', action: 'export:html', actionLabel: '匯出 HTML…' },
    ...[['Word','docx'],['OpenOffice','odt'],['RTF','rtf'],['Epub','epub'],['LaTeX','tex'],['MediaWiki','wiki'],['reStructuredText','rst'],['Textile','textile'],['OPML','opml']].map(([title,format])=>({title,action:'convert:'+format,actionLabel:'匯出 '+title+'…'})),
    {group:'匯出模板',title:'自訂匯出',action:'settings:templates',actionLabel:'管理各格式模板與參考文件…'},
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
  let selected = '外觀'
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
    for(const card of root.querySelectorAll<HTMLButtonElement>('[data-theme-choice]'))card.setAttribute('aria-pressed',String(card.dataset.themeChoice===value.theme))
    preview()
  }
  function render() {
    preview()
    nav.replaceChildren(); panel.replaceChildren()
    const query = search.value.trim().toLowerCase().replace(/字體/g,'字型').replace(/自動存檔/g,'自動儲存').replace(/行高/g,'行距')
    const categoryIcons:Record<string,typeof Palette>={'外觀':Palette,'編輯器':Type,'檔案':FolderOpen,'Markdown':FileCode,'匯出':Upload,'一般':Settings,'AI':Sparkles}
    const categoryNames:Record<string,string>={'檔案':'檔案與圖片','AI':'AI 與帳號'}
    const descriptions:Record<string,string>={'一般':'啟動方式、介面語言與快捷鍵。','外觀':'主題與工作區顯示；文章字型請到「編輯器」。','編輯器':'字型、閱讀間距、輸入輔助與原始碼設定。','檔案':'自動儲存、草稿復原，以及圖片的儲存方式。','Markdown':'調整 Markdown 語法、圖表與數學公式。','匯出':'PDF 紙張與版面、其他格式及匯出模板。','AI':'選擇本機模型，或管理 wuffi 雲端登入與會員。'}
    for (const name of ['一般','外觀','編輯器','檔案','Markdown','匯出','AI']) {
      const button = document.createElement('button'); const caption=document.createElement('span');caption.textContent=categoryNames[name]||name
      const icon=createElement(categoryIcons[name]);icon.setAttribute('aria-hidden','true');button.append(icon,caption)
      button.dataset.page = name
      button.className = selected === name && !query ? 'selected' : ''
      button.setAttribute('aria-current',selected===name&&!query?'page':'false')
      button.onclick = () => { selected = name; search.value = ''; root.scrollTop=0;render();nav.querySelector<HTMLButtonElement>('.selected')?.focus() }
      nav.append(button)
    }
    const heading = document.createElement('h1'); heading.textContent = query ? '搜尋結果' : categoryNames[selected]||selected; panel.append(heading)
    if(!query){const intro=document.createElement('p');intro.className='preferences-intro';intro.textContent=descriptions[selected];panel.append(intro)}
    const ai=(!query&&selected==='AI')||!!query&&/ai|模型|人工智慧|會員|登入|帳號|雲端|本機|連線|model|cloud|ollama|account|local|lm studio/i.test(query)
    root.querySelector<HTMLElement>('.preferences-preview')!.hidden=ai||selected!=='編輯器'||!!query
    if(ai){mountAISettings(panel);if(!query)return}
    for (const [name, rows] of Object.entries(pages)) {
      if (!query && name !== selected) continue
      let previousGroup=''
      for (const row of rows) {
        if (query && !JSON.stringify(row).toLowerCase().includes(query) && !(categoryNames[name]||name).toLowerCase().includes(query) && !translate(categoryNames[name]||name).toLowerCase().includes(query) && !JSON.stringify(row,(_key,value)=>typeof value==='string'?translate(value):value).toLowerCase().includes(query)) continue
        const group=query?`${categoryNames[name]||name} · ${row.group||'其他格式'}`:row.group||'其他格式'
        if(group!==previousGroup){const subheading=document.createElement('h2');subheading.className='preferences-group';subheading.textContent=group;panel.append(subheading);previousGroup=group}
        const section = document.createElement('section'); section.className = 'preference-row'
        if(row.fields?.length===1&&row.fields[0].check&&row.title&&!row.action)section.classList.add('toggle-row')
        const label = document.createElement('div'); const title = document.createElement('h2'); title.textContent = section.classList.contains('toggle-row')?row.fields![0].label:row.title; label.append(title)
        if (row.description) { const detail = document.createElement('p'); detail.textContent = row.description; label.append(detail) }
        const controls = document.createElement('div'); controls.className = 'preference-controls'
        for (const field of row.fields || []) {
          const wrap = document.createElement('label')
          const control = document.createElement(field.options ? 'select' : 'input')
          control.id = `pref-${field.key}`; control.setAttribute('aria-label', field.label)
          if (control instanceof HTMLSelectElement) {
            for (const [value, text] of field.options!) { const option = document.createElement('option'); option.value = value; option.textContent = text; control.append(option) }
            control.value = String(get()[field.key])
          } else if (field.check) { control.type = 'checkbox';control.setAttribute('role','switch'); control.checked = Boolean(get()[field.key]) }
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
          if (field.check) {const text=document.createElement('span');text.textContent=field.label;wrap.append(text)}
          else if ((row.fields?.length||0)>1) { const caption = document.createElement('span');caption.className='preference-field-label';caption.textContent = field.label; wrap.prepend(caption) }
          else if (!field.options) { const suffix = document.createElement('span'); suffix.textContent = field.label; wrap.append(suffix) }
          controls.append(wrap)
        }
        if (row.action) { const button = document.createElement('button'); button.textContent = row.actionLabel!; button.onclick = () => { close(); action(row.action!) }; controls.append(button) }
        if(row.fields?.some(field=>field.key==='theme')){
          section.classList.add('theme-row')
          const select=controls.querySelector<HTMLSelectElement>('select')!,custom=controls.querySelector('button')!
          select.hidden=true;select.tabIndex=-1
          controls.replaceChildren()
          const choices=document.createElement('div');choices.className='theme-choices'
          for(const [value,zh,en]of [['light','明亮白','Bright'],['newsprint','紙感米','Paper'],['night','深夜灰','Midnight'],['glass','Liquid Glass','Liquid Glass']]){
            const choice=document.createElement('button');choice.type='button';choice.dataset.themeChoice=value;choice.setAttribute('aria-pressed',String(get().theme===value))
            const sample=document.createElement('span');sample.className='theme-sample';sample.textContent='Aa';sample.setAttribute('aria-hidden','true')
            const caption=document.createElement('span');caption.textContent=currentLanguage()==='en'?en:zh;choice.append(sample,caption)
            choice.onclick=()=>{change({...get(),theme:value,followSystem:false});sync()};choices.append(choice)
          }
          controls.append(choices,custom,select)
        }
        section.append(label, controls); panel.append(section)
      }
    }
    if((!query&&selected==='一般')||(query&&/更新|update|版本|version/.test(query)))mountAppUpdates(panel)
    if(query&&!panel.querySelector('.preference-row,.agent-connection,.app-updates')){const empty=document.createElement('p');empty.className='preferences-intro';empty.textContent='找不到符合的設定，試試「字型」、「自動儲存」或「模型」。';panel.append(empty)}
  }
  search.oninput = render
  document.addEventListener('wuffi:open-ai-settings',()=>{if(root.hidden)previousFocus=document.activeElement as HTMLElement;selected='AI';root.hidden=false;search.value='';render();nav.querySelector<HTMLButtonElement>('.selected')?.focus()})
  root.querySelector('header button')!.addEventListener('click', close)
  root.addEventListener('keydown', event => {
    if(event.isComposing)return
    if (event.key === 'Escape') { event.stopPropagation(); close() }
    if(event.key==='Tab'){
      const controls=Array.from(root.querySelectorAll<HTMLElement>('button,input,select,textarea,summary')).filter(el=>!el.hasAttribute('disabled')&&el.getClientRects().length>0)
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

export async function showDesktopSettings(kind:'shortcuts'|'themes'|'upload'|'templates'){
  if(!window.desktop)return
  const dialog=document.createElement('dialog');dialog.className='utility-dialog desktop-settings'
  const header=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');title.textContent=({shortcuts:'自訂快捷鍵',themes:'自訂主題',upload:'圖片上傳設定',templates:'匯出模板'})[kind];close.textContent='×';close.onclick=()=>dialog.close();header.append(title,close);dialog.append(header)
  dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog)
  const status=document.createElement('p');status.className='settings-status'
  const request=async(data:Record<string,unknown>)=>{try{const result=await window.desktop!.settings(data);status.textContent='已儲存';return result}catch(error){status.textContent=String(error);return null}}
  if(kind==='templates'){
    let templates=await window.desktop.exportTemplates({action:'list'})
    for(const [format,label]of [['docx','Word 參考文件'],['odt','OpenOffice 參考文件'],['rtf','RTF'],['epub','Epub'],['tex','LaTeX'],['wiki','MediaWiki'],['rst','reStructuredText'],['textile','Textile'],['opml','OPML']]){
      const row=document.createElement('section'),name=document.createElement('h3'),value=document.createElement('p'),choose=document.createElement('button'),clear=document.createElement('button');name.textContent=label;value.textContent=templates[format]||'使用預設';choose.textContent='選擇…';clear.textContent='重設'
      const update=async(action:'choose'|'clear')=>{try{templates=await window.desktop!.exportTemplates({action,format});value.textContent=templates[format]||'使用預設';status.textContent='已儲存'}catch(error){status.textContent=String(error)}};choose.onclick=()=>void update('choose');clear.onclick=()=>void update('clear');row.append(name,value,choose,clear);dialog.append(row)
    }
  }else if(kind==='shortcuts'){
    const rows=await window.desktop.settings({action:'shortcuts'}),list=document.createElement('div');list.className='shortcut-editor'
    for(const row of rows){const label=document.createElement('label'),name=document.createElement('span'),input=document.createElement('input');name.textContent=row.label;input.value=row.accelerator;input.setAttribute('aria-label',row.label);input.placeholder='例如 Ctrl+Shift+K';input.onchange=()=>void request({action:'shortcut',key:row.key,accelerator:input.value.trim()});label.append(name,input);list.append(label)}
    const reset=document.createElement('button');reset.textContent='重設快捷鍵';reset.onclick=async()=>{await request({action:'resetShortcuts'});dialog.close();void showDesktopSettings('shortcuts')};dialog.append(list,reset)
  }else if(kind==='themes'){
    const names:string[]=await window.desktop.settings({action:'themes'}),list=document.createElement('div')
    for(const name of names){const button=document.createElement('button');button.textContent=name;button.onclick=async()=>{const css=await request({action:'theme',name});if(css!==null){let style=document.getElementById('custom-theme');if(!style){style=document.createElement('style');style.id='custom-theme';document.head.append(style)}style.textContent=css;localStorage.setItem('liubai.customTheme',name);dialog.close()}};list.append(button)}
    if(!names.length)list.textContent='將 .css 主題放入主題資料夾後重新開啟此視窗。'
    const folder=document.createElement('button');folder.textContent='開啟主題資料夾';folder.onclick=()=>void window.desktop!.settings({action:'themeFolder'})
    const reset=document.createElement('button');reset.textContent='停用自訂主題';reset.onclick=()=>{document.getElementById('custom-theme')?.remove();localStorage.removeItem('liubai.customTheme');dialog.close()};dialog.append(list,folder,reset)
  }else{
    const settings=await window.desktop.settings({action:'get'})
      const provider=document.createElement('select');provider.setAttribute('aria-label','圖片上傳服務');for(const [value,label]of [['https','自訂 HTTPS 服務'],['picgo','PicGo / PicList']]){const option=document.createElement('option');option.value=value;option.textContent=label;provider.append(option)}provider.value=settings.uploadProvider||'https';
      const url=document.createElement('input'),token=document.createElement('input'),save=document.createElement('button');url.type='url';url.placeholder='HTTPS 圖片上傳端點';url.value=settings.uploadURL;url.setAttribute('aria-label','圖片上傳端點');token.type='password';token.placeholder='Bearer token（選填）';token.value=settings.uploadToken;token.setAttribute('aria-label','上傳授權 token');save.textContent='儲存';save.onclick=()=>void request({action:'save',uploadProvider:provider.value,uploadURL:url.value,uploadToken:token.value});const help=document.createElement('p');help.textContent='以 multipart/form-data 的 image 欄位上傳，回應需包含 url 或 data.url。只有執行「上傳圖片」才會傳送圖片。';const picgoHelp=document.createElement('p');picgoHelp.textContent='PicGo / PicList：先啟動應用程式並在其中設定圖床，啟用本機 36677 連接埠的服務。';dialog.append(provider,picgoHelp,help,url,token,save)
  }
  dialog.append(status);dialog.showModal()
}
export async function restoreCustomTheme(){const name=localStorage.getItem('liubai.customTheme');if(name&&window.desktop){try{const css=await window.desktop.settings({action:'theme',name});const style=document.createElement('style');style.id='custom-theme';style.textContent=css;document.head.append(style)}catch{}}}

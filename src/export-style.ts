// Measure exported Markdown with the same theme selectors as the editor.
// Inline the resulting styles so the saved HTML has no dependency on the app.
const properties=['display','float','zoom','color','background-color','font-family','font-size','font-weight','font-style','font-variant-ligatures','line-height','letter-spacing','text-align','text-decoration','white-space','word-break','overflow-wrap','border-top','border-right','border-bottom','border-left','border-collapse','border-spacing','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-bottom','margin-left','margin-right','list-style-type','vertical-align']
export async function styleExport(fragment:HTMLElement):Promise<{body:string;fonts:string;paper:string;ink:string;width:string}>{
  const host=document.createElement('div');host.className='milkdown';host.style.cssText='position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none;width:'+document.querySelector('#milkdown-root')!.clientWidth+'px'
  const editor=document.createElement('div');editor.className='editor';const content=document.createElement('div');content.className='ProseMirror';content.append(...Array.from(fragment.childNodes));editor.append(content);host.append(editor);document.querySelector('#milkdown-root')!.append(host)
  try{
    await document.fonts.ready
    const families=new Set<string>(),rootStyle=getComputedStyle(document.body),paper=rootStyle.getPropertyValue('--paper').trim()||'#fff',ink=rootStyle.getPropertyValue('--ink').trim()||'#333',width=getComputedStyle(editor).maxWidth
    for(const element of [content,...content.querySelectorAll<HTMLElement>('*')]){
      if(element.namespaceURI!=='http://www.w3.org/1999/xhtml')continue
      const computed=getComputedStyle(element),style=properties.map(property=>`${property}:${computed.getPropertyValue(property)}`).join(';')
      computed.fontFamily.split(',').forEach(family=>families.add(family.trim().replace(/^['"]|['"]$/g,'')))
      element.setAttribute('style',style)
      // Preserve theme-generated ornaments, such as Whitey's heading rule.
      const after=getComputedStyle(element,'::after')
      if(after.content==='""'&&after.display==='block'){const ornament=document.createElement('span');ornament.style.cssText=`display:block;width:${after.width};height:${after.height};margin:${after.margin};border-bottom:${after.borderBottom}`;element.append(ornament)}
    }
    const rules:CSSFontFaceRule[]=[]
    for(const sheet of document.styleSheets){try{for(const rule of sheet.cssRules)if(rule.type===CSSRule.FONT_FACE_RULE&&families.has((rule as CSSFontFaceRule).style.fontFamily.replace(/^['"]|['"]$/g,'')))rules.push(rule as CSSFontFaceRule)}catch{/* Cross-origin custom styles cannot be inspected. */}}
    const cache=new Map<string,Promise<string>>()
    const embed=(url:string)=>{if(!cache.has(url))cache.set(url,(async()=>{const response=await fetch(url);if(!response.ok)throw new Error('Unable to embed font');const blob=await response.blob();return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob)})})());return cache.get(url)!}
    const fonts=(await Promise.all(rules.map(async rule=>{let text=rule.cssText;for(const match of [...text.matchAll(/url\(["']?([^"')]+)["']?\)/g)]){try{text=text.replace(match[0],`url("${await embed(new URL(match[1],rule.parentStyleSheet?.href||location.href).href)}")`)}catch{text=text.replace(match[0],'local("unavailable")')}}return text}))).join('\n')
    return{body:content.outerHTML,fonts,paper,ink,width:width==='none'?'860px':width}
  }finally{host.remove()}
}

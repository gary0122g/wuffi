import {currentLanguage} from './i18n'
import golden from './assets/dogs/golden-retriever.png'
import corgi from './assets/dogs/corgi.png'
import shiba from './assets/dogs/shiba-inu.png'
import husky from './assets/dogs/husky.png'
import dachshund from './assets/dogs/dachshund.png'
import poodle from './assets/dogs/poodle.png'

export const dogCompanions=[
  {id:'golden-retriever',zh:'黃金獵犬',en:'Golden Retriever',image:golden},
  {id:'corgi',zh:'柯基',en:'Corgi',image:corgi},
  {id:'shiba-inu',zh:'柴犬',en:'Shiba Inu',image:shiba},
  {id:'husky',zh:'哈士奇',en:'Husky',image:husky},
  {id:'dachshund',zh:'臘腸犬',en:'Dachshund',image:dachshund},
  {id:'poodle',zh:'貴賓犬',en:'Poodle',image:poodle},
] as const
const STORAGE_KEY='wuffi.companion.v1'
type Choice={id:string;photo?:string}
const validPhoto=(value:unknown):value is string=>typeof value==='string'&&value.length<=500000&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)
function readChoice():Choice{
  try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'),photo=validPhoto(saved.photo)?saved.photo:undefined;return {id:saved.id==='custom'&&photo?'custom':dogCompanions.some(d=>d.id===saved.id)?saved.id:'golden-retriever',photo}}catch{return {id:'golden-retriever'}}
}
export function installDogCompanion(entry:HTMLButtonElement,panel:HTMLElement,place:()=>void){
  const t=(zh:string,en:string)=>currentLanguage()==='en'?en:zh
  let choice=readChoice(),uploadGeneration=0
  const avatar=document.createElement('img');avatar.className='agent-dog-avatar';avatar.alt='';avatar.draggable=false;entry.append(avatar)
  const toggle=document.createElement('button');toggle.type='button';toggle.dataset.agent='dog';toggle.setAttribute('aria-controls','agent-dog-picker');toggle.setAttribute('aria-expanded','false')
  toggle.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><ellipse cx="6" cy="8" rx="2" ry="3" transform="rotate(-25 6 8)"/><ellipse cx="18" cy="8" rx="2" ry="3" transform="rotate(25 18 8)"/><ellipse cx="10" cy="5" rx="1.6" ry="2.5"/><ellipse cx="14" cy="5" rx="1.6" ry="2.5"/><path d="M12 11c-2 0-3 3-5 4-3 3 0 6 3 4l2-1 2 1c3 2 6-1 3-4-2-1-3-4-5-4z"/></svg>'
  panel.querySelector('header>div')!.prepend(toggle)
  const picker=document.createElement('section');picker.id='agent-dog-picker';picker.className='agent-dog-picker';picker.hidden=true
  picker.innerHTML='<h3></h3><div class="companion-dogs" role="group"></div><div class="companion-upload"><button type="button" data-companion-upload></button><input id="companion-photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden><small></small></div><p class="companion-status" role="status" aria-live="polite"></p>'
  panel.querySelector('header')!.after(picker)
  const grid=picker.querySelector<HTMLElement>('.companion-dogs')!,status=picker.querySelector<HTMLElement>('.companion-status')!,file=picker.querySelector<HTMLInputElement>('input')!,upload=picker.querySelector<HTMLButtonElement>('[data-companion-upload]')!
  function hide(){picker.hidden=true;delete panel.dataset.dogPicker;toggle.setAttribute('aria-expanded','false');place()}
  function save(value:Choice){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(value));choice=value;sync();hide();panel.querySelector<HTMLTextAreaElement>('.agent-composer textarea')?.focus({preventScroll:true})}
    catch{status.textContent=t('無法儲存狗狗選擇，請檢查本機儲存空間。','Unable to save your companion. Check local storage space.')}
  }
  function sync(){
    const dog=dogCompanions.find(d=>d.id===choice.id)||dogCompanions[0],custom=choice.id==='custom'&&choice.photo,name=custom?t('我的狗狗','My dog'):dog[currentLanguage()==='en'?'en':'zh']
    entry.dataset.companion=choice.id;avatar.src=custom||dog.image
    entry.title=name+' · '+t('拖曳可移動；點一下展開或收合 AI (Ctrl+J)','Drag to move; click to expand or collapse AI (Ctrl+J)');entry.setAttribute('aria-label',entry.title)
    toggle.title=t('選擇狗狗夥伴','Choose your dog');toggle.setAttribute('aria-label',toggle.title)
    panel.querySelector('header strong')!.textContent='wuffi · '+t('一起寫','Write together')
    picker.querySelector('h3')!.textContent=t('選一位寫作夥伴','Choose your writing companion');grid.setAttribute('aria-label',toggle.title)
    grid.replaceChildren()
    const options=[...dogCompanions.map(d=>({id:d.id,label:d[currentLanguage()==='en'?'en':'zh'],image:d.image})),...(choice.photo?[{id:'custom',label:t('我的狗狗','My dog'),image:choice.photo}]:[])]
    for(const option of options){const button=document.createElement('button');button.type='button';button.dataset.dog=option.id;button.setAttribute('aria-pressed',String(choice.id===option.id));const image=document.createElement('img');image.src=option.image;image.alt='';image.draggable=false;const label=document.createElement('span');label.textContent=option.label;button.append(image,label);button.onclick=()=>{uploadGeneration++;save({...choice,id:option.id})};grid.append(button)}
    upload.textContent=t('選擇自己的狗狗圖片…','Choose your own dog photo…');file.setAttribute('aria-label',upload.textContent)
    picker.querySelector('small')!.textContent=t('圖片只儲存在這台裝置，不會傳送給 AI。','Photos stay on this device and are never sent to AI.')
  }
  toggle.onclick=()=>{if(!picker.hidden){hide();return}for(const section of panel.querySelectorAll<HTMLElement>('.agent-connection,.agent-functions'))section.hidden=true;status.textContent='';picker.hidden=false;panel.dataset.dogPicker='open';toggle.setAttribute('aria-expanded','true');toggle.focus({preventScroll:true});place()}
  panel.addEventListener('click',event=>{if((event.target as Element).closest('[data-agent=connect],[data-agent=functions]'))hide()})
  upload.onclick=()=>file.click()
  file.onchange=()=>{void(async()=>{
    const selected=file.files?.[0];file.value='';if(!selected)return
    const generation=++uploadGeneration;upload.disabled=true;status.textContent=''
    try{
      if(!['image/png','image/jpeg','image/webp','image/gif'].includes(selected.type)||selected.size>4*1024*1024)throw Error(t('請選擇 4 MB 以下的 PNG、JPEG、WebP 或 GIF 圖片。','Choose a PNG, JPEG, WebP or GIF image under 4 MB.'))
      const image=await createImageBitmap(selected)
      try{
        if(!image.width||!image.height||image.width*image.height>24000000)throw Error(t('圖片尺寸過大，請先縮小後再選擇。','This image is too large. Resize it before choosing it.'))
        const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const context=canvas.getContext('2d')!,scale=Math.max(256/image.width,256/image.height),width=image.width*scale,height=image.height*scale
        context.drawImage(image,(256-width)/2,(256-height)/2,width,height)
        if(generation===uploadGeneration)save({id:'custom',photo:canvas.toDataURL('image/png')})
      }finally{image.close()}
    }catch(error){if(generation===uploadGeneration)status.textContent=error instanceof Error?error.message:t('無法讀取圖片，請選擇其他檔案。','Unable to read this image. Choose another file.')}
    finally{upload.disabled=false}
  })()}
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&!picker.hidden){event.preventDefault();event.stopPropagation();hide();toggle.focus()}},true)
  new MutationObserver(()=>{if(panel.hidden)hide()}).observe(panel,{attributes:true,attributeFilter:['hidden']})
  document.addEventListener('ui-language-change',sync)
  document.addEventListener('wuffi-companion-command',event=>{const id=(event as CustomEvent<string>).detail;if(id==='choose'){if(panel.hidden)entry.click();if(picker.hidden)toggle.click()}else if(dogCompanions.some(d=>d.id===id))save({...choice,id})})
  sync()
}

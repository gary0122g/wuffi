// Publish discovery metadata only after the signed installer is available.
import fs from 'node:fs/promises'
const repo=process.env.GITHUB_REPOSITORY||'gary0122g/wuffi',token=process.env.GITHUB_TOKEN
if(!token)throw Error('GITHUB_TOKEN is required')
const version=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8')).version
const base=`https://api.github.com/repos/${repo}`,headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json'}
async function api(url,options={}){const response=await fetch(url,{...options,headers:{...headers,...options.headers}});if(!response.ok)throw Error(`GitHub request failed: ${response.status}`);return response.status===204?null:response.json()}
const release=await api(`${base}/releases/tags/v${version}`)
if(release.draft)throw Error('Publish the versioned release before updating the channel')
const installer=release.assets.find(a=>a.name===`wuffi_${version}_x64-setup.exe`),signature=release.assets.find(a=>a.name===`wuffi_${version}_x64-setup.exe.sig`)
if(!installer||!signature)throw Error('Installer and updater signature are required')
const response=await fetch(signature.browser_download_url);if(!response.ok)throw Error('Signature is not publicly accessible')
const sig=(await response.text()).trim();if(!sig||sig.length>4096)throw Error('Invalid signature asset')
const manifest={version,notes:release.body||'',pub_date:release.published_at,platforms:{'windows-x86_64':{url:installer.browser_download_url,signature:sig}}}
let channel;const lookup=await fetch(`${base}/releases/tags/update-channel`,{headers})
if(lookup.status===404){channel=await api(`${base}/releases`,{method:'POST',body:JSON.stringify({tag_name:'update-channel',target_commitish:process.env.GITHUB_SHA||'main',name:'Automatic update channel',body:'Discovery metadata for the in-app updater. Download installers from the versioned releases.',prerelease:true,draft:false})})}
else{if(!lookup.ok)throw Error('Cannot read update channel');channel=await lookup.json()}
for(const asset of channel.assets||[])if(asset.name==='latest.json')await api(`${base}/releases/assets/${asset.id}`,{method:'DELETE'})
await api(channel.upload_url.replace(/\{.*$/,'')+'?name=latest.json',{method:'POST',body:JSON.stringify(manifest,null,2),headers:{'Content-Type':'application/json'}})
console.log(`Update channel now points to ${version}`)

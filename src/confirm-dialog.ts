// Electron/browser confirm is synchronous; Tauri's native bridge is async.
// Always await the actual boolean so cancelling cannot become a truthy Promise.
export async function confirmDialog(message:string):Promise<boolean>{
 return window.desktop?.confirm?await window.desktop.confirm(message):Boolean(await window.confirm(message))
}

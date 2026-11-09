// Milkdown tears down off-screen code blocks and rebuilds them when they scroll
// back into view, asking for their preview again. Rendering a diagram or formula
// takes tens to hundreds of milliseconds, so remember recent results: scrolling
// back over a block then reuses its preview instead of stalling a frame.
export function previewCache(limit=120){
  const entries=new Map<string,string>()
  return {
    get(key:string){const value=entries.get(key);if(value!==undefined){entries.delete(key);entries.set(key,value)}return value},
    set(key:string,value:string){entries.delete(key);entries.set(key,value);if(entries.size>limit)entries.delete(entries.keys().next().value!)},
  }
}

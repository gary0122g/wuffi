import { defineConfig } from 'vite'
import fs from 'node:fs/promises'
import path from 'node:path'

export default defineConfig({
  base:'./',build:{outDir:'out',emptyOutDir:false},
  plugins:[{
    name:'remove-obsolete-bundles',apply:'build',
    async writeBundle(options,bundle){
      // Repeated builds must not accumulate old hashed chunks in the next release.
      const output=path.resolve(options.dir||'out'),assets=path.join(output,'assets')
      const current=new Set(Object.keys(bundle).map(name=>path.resolve(output,name)))
      for(const entry of await fs.readdir(assets,{withFileTypes:true}).catch(()=>[])){
        if(!entry.isFile()||!/-[\w-]{8,}\.(?:js|css|woff2?)$/.test(entry.name))continue
        const target=path.resolve(assets,entry.name),relative=path.relative(assets,target)
        if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Unexpected asset path')
        if(!current.has(target))await fs.unlink(target)
      }
    },
  }],
})

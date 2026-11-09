import { SerializedMmlVisitor } from 'mathjax-full/js/core/MmlTree/SerializedMmlVisitor.js'
import { STATE } from 'mathjax-full/js/core/MathItem.js'
import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js'
import DOMPurify from 'dompurify'
import { readPreferences } from './preferences'
const adaptor=liteAdaptor();RegisterHTMLHandler(adaptor)
export function mathSVG(source:string,display:boolean,physics:boolean,format:'svg'|'mathml'='svg'){
  return mathBatch([{source,display}],physics,'none',format)[0]
}
export function mathBatch(items:{source:string;display:boolean}[],physics:boolean,numbering:string,format:'svg'|'mathml'='svg'){
  const packages=AllPackages.filter(name=>!['html','action','setoptions'].includes(name))
  if(physics)packages.push('physics')
  const tex=new TeX({packages,tags:['all','ams'].includes(numbering)?numbering:'none',ignoreDuplicateLabels:true,maxBuffer:100000,maxMacros:10000}),svg=new SVG({fontCache:'none'}),document=mathjax.document('',{InputJax:tex,OutputJax:svg})
  items=items.map(item=>readPreferences().mathLineBreaks&&item.display&&/\\\\|\\newline/.test(item.source)&&!item.source.includes('\\begin{')?{...item,source:'\\displaylines{'+item.source+'}'}:item)
  const convert=({source,display}:{source:string;display:boolean})=>document.convert(source,{display,em:16,ex:8,containerWidth:800,end:format==='mathml'?STATE.CONVERT:STATE.LAST})
  // Resolve forward references against the complete document, then render in order.
  items.forEach(convert);const labels={...tex.parseOptions.tags.allLabels};tex.reset();tex.parseOptions.tags.allLabels=labels
  return items.map(item=>{const result=convert(item)
    if(format==='mathml')return DOMPurify.sanitize(new SerializedMmlVisitor().visitTree(result as any),{USE_PROFILES:{mathMl:true}})
    return DOMPurify.sanitize(adaptor.outerHTML(result),{USE_PROFILES:{html:true,svg:true,svgFilters:true},ADD_TAGS:['mjx-container'],ADD_ATTR:['jax','display','focusable','data-mml-node','data-mjx-error']})
  })
}

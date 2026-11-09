// Align unchanged units first, then pair only the changed runs. The size cap
// keeps large rewrites bounded; it does not omit any proposed changes.
export function changedPairs<A,B>(before:A[],after:B[],equal:(a:A,b:B)=>boolean):[number|null,number|null][] {
  let start=0,endA=before.length,endB=after.length
  while(start<endA&&start<endB&&equal(before[start],after[start]))start++
  while(endA>start&&endB>start&&equal(before[endA-1],after[endB-1])){endA--;endB--}
  const n=endA-start,m=endB-start,anchors:[number,number][]=[]
  if(n*m<=250000){
    const rows=Array.from({length:n+1},()=>new Uint32Array(m+1))
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)rows[i][j]=equal(before[start+i],after[start+j])?rows[i+1][j+1]+1:Math.max(rows[i+1][j],rows[i][j+1])
    let i=0,j=0
    while(i<n&&j<m){if(equal(before[start+i],after[start+j])){anchors.push([start+i++,start+j++])}else if(rows[i+1][j]>=rows[i][j+1])i++;else j++}
  }
  const pairs:[number|null,number|null][]=Array.from({length:start},(_,i)=>[i,i])
  let a=start,b=start
  for(const [nextA,nextB] of [...anchors,[endA,endB] as [number,number]]){
    while(a<nextA||b<nextB)pairs.push([a<nextA?a++:null,b<nextB?b++:null])
    if(nextA<endA&&nextB<endB)pairs.push([nextA,nextB])
    a=nextA+1;b=nextB+1
  }
  for(let i=endA,j=endB;i<before.length;i++,j++)pairs.push([i,j])
  return pairs
}

const segmenter=new Intl.Segmenter('zh-TW',{granularity:'sentence'})
export function sentences(text:string):{from:number;to:number;text:string}[]{
  // A hard line break is also a review boundary (lists, code and Markdown).
  const result:{from:number;to:number;text:string}[]=[]
  let offset=0
  for(const line of text.match(/[^\n]*\n|[^\n]+$/g)||[]){
    for(const part of segmenter.segment(line))result.push({from:offset+part.index,to:offset+part.index+part.segment.length,text:part.segment})
    offset+=line.length
  }
  return result
}

export type ReviewStatus='pending'|'complete'|'changed'|'closed'|'replaced'
export type ReviewOptions={readonly:()=>boolean;edited:()=>void;status:(remaining:number,reason:ReviewStatus)=>void}

export function reviewLabels(){
  const en=document.documentElement.lang.startsWith('en')
  return en?{accept:'Accept',reject:'Reject',label:'Suggested sentence',remove:'Delete',structure:'Formatting / structure change',readonly:'The document is read-only'}:{accept:'接受',reject:'拒絕',label:'單句修改建議',remove:'刪除此句',structure:'格式／結構變更',readonly:'目前文章為唯讀'}
}

export function reviewWidget(text:string,decide:(accept:boolean)=>void):HTMLElement{
  const labels=reviewLabels(),root=document.createElement('span')
  root.className='inline-review';root.contentEditable='false';root.setAttribute('role','group');root.setAttribute('aria-label',labels.label)
  const suggestion=document.createElement('span');suggestion.className='review-text';suggestion.textContent=text||labels.remove
  const controls=document.createElement('span');controls.className='review-controls'
  for(const [action,label,accept] of [['accept',labels.accept,true],['reject',labels.reject,false]] as const){
    const button=document.createElement('button');button.type='button';button.dataset.review=action;button.textContent=label
    button.onmousedown=e=>e.preventDefault()
    button.onclick=e=>{e.preventDefault();e.stopPropagation();decide(accept)}
    controls.append(button)
  }
  root.append(suggestion,controls);return root
}

import type {Preferences} from './preferences'
import {preferenceCapabilities,validatePreferencePatch} from './preferences'
import type {ReviewOptions,ReviewStatus} from './review-diff'

export type WritingSnapshot={documentId:string;title:string;markdown:string;revision:number;selection:{from:number;to:number;markdown:string};mode:string;readonly:boolean;focus:boolean;typewriter:boolean;statistics:{words:number;characters:number;lines:number}}
export type WritingAction={kind:'replace';scope:'selection'|'document';markdown:string}|{kind:'edit';find:string;markdown:string}|{kind:'settings';values:Record<string,unknown>}|{kind:'command';name:string}

/** Turn an AI "edit" (one passage of the requested scope) into a replacement of that scope, for review. */
export type ResolvedAction=Exclude<WritingAction,{kind:'edit'}>
export function resolveEdit(action:WritingAction,snapshot:WritingSnapshot,scope:'selection'|'document'):ResolvedAction{
  // Keep the document's own line endings: models answer with \n, and a
  // \r\n document would otherwise show every code block and formula as changed.
  const eol=snapshot.markdown.includes('\r\n')?'\r\n':'\n',lines=(text:string)=>text.replace(/\r\n/g,'\n').replace(/\n/g,eol)
  if(action.kind==='replace')return {...action,markdown:lines(action.markdown)}
  if(action.kind!=='edit')return action
  const base=scope==='selection'?snapshot.selection.markdown:snapshot.markdown,find=lines(action.find)
  const at=base.indexOf(find)
  if(!find.trim()||at<0)throw Error('AI 找不到要修改的段落，原文沒有變更。請換個說法，或先選取那一段再試。')
  if(base.indexOf(find,at+1)>=0)throw Error('要修改的段落在文章中出現不只一次，原文沒有變更。請先選取那一段再試。')
  return {kind:'replace',scope,markdown:base.slice(0,at)+lines(action.markdown)+base.slice(at+find.length)}
}
export type WritingReply={message:string;actions:WritingAction[]}
export type WritingHost={snapshot():WritingSnapshot;unchanged(snapshot:WritingSnapshot):boolean;replace(snapshot:WritingSnapshot,scope:'selection'|'document',markdown:string):void;review(snapshot:WritingSnapshot,scope:'selection'|'document',markdown:string,options:ReviewOptions):number;preferences():Preferences;configure(value:Preferences):void;command(name:string):Promise<void>;commands:{name:string;label:string}[]}

export function createWritingAPI(host:WritingHost){
  return {
    snapshot:()=>host.snapshot(),
    capabilities:()=>({preferences:preferenceCapabilities(),commands:host.commands}),
    review(action:Extract<WritingAction,{kind:'replace'}>,snapshot:WritingSnapshot,status:(remaining:number,reason:ReviewStatus)=>void){
      this.validate({message:'',actions:[action]})
      const current=host.snapshot()
      if(current.documentId!==snapshot.documentId||!host.unchanged(snapshot))throw Error('文章已變更，請重新提出修改，避免覆蓋你剛寫的內容。')
      if(current.readonly)throw Error('目前文章為唯讀')
      if(action.scope==='selection'&&snapshot.selection.from===snapshot.selection.to)throw Error('請先選取要修改的文字')
      return host.review(snapshot,action.scope,action.markdown,{status,edited:()=>{},readonly:()=>host.snapshot().readonly})
    },
    validate(reply:unknown):WritingReply{
      if(!reply||typeof reply!=='object')throw Error('AI 回覆格式不正確，請重試')
      const value=reply as WritingReply
      if(typeof value.message!=='string'||value.message.length>50000||!Array.isArray(value.actions)||value.actions.length>8)throw Error('AI 回覆格式不正確')
      if(value.actions.filter(action=>action?.kind==='replace'||action?.kind==='edit').length>1)throw Error('一次只能提出一個文章修改，請分次處理')
      for(const action of value.actions){
        if(!action||typeof action!=='object')throw Error('AI 操作格式不正確')
        if(action.kind==='replace'){
          if(!['selection','document'].includes(action.scope)||typeof action.markdown!=='string'||action.markdown.length>200000)throw Error('修改提案格式不正確')
        }else if(action.kind==='edit'){
          if(typeof action.find!=='string'||!action.find.trim()||action.find.length>200000||typeof action.markdown!=='string'||action.markdown.length>200000)throw Error('修改提案格式不正確')
        }else if(action.kind==='settings')validatePreferencePatch(action.values)
        else if(action.kind==='command'){if(!host.commands.some(c=>c.name===action.name))throw Error('不支援的操作：'+action.name)}
        else throw Error('不支援的 AI 操作')
      }
      return {message:value.message,actions:value.actions}
    },
    async apply(action:WritingAction,snapshot:WritingSnapshot){
      // Validate again at execution; responses are never executable code.
      this.validate({message:'',actions:[action]})
      const current=host.snapshot()
      if(current.documentId!==snapshot.documentId||!host.unchanged(snapshot))throw Error('文章已變更，請重新提出修改，避免覆蓋你剛寫的內容。')
      if(action.kind==='replace'){
        if(current.readonly)throw Error('目前文章為唯讀')
        if(action.scope==='selection'&&snapshot.selection.from===snapshot.selection.to)throw Error('請先選取要修改的文字')
        host.replace(snapshot,action.scope,action.markdown)
      }else if(action.kind==='settings'){
        const patch=validatePreferencePatch(action.values)
        host.configure({...host.preferences(),...patch,...(patch.theme&&patch.followSystem===undefined?{followSystem:false}:{})})
      }else if(action.kind==='edit'){
        throw Error('修改提案需要先在文章中審閱')
      }else {
        if(/^(?:format:|insert:|edit:table:)/.test(action.name)&&(current.mode!==snapshot.mode||current.selection.from!==snapshot.selection.from||current.selection.to!==snapshot.selection.to))throw Error('選取位置已變更，請重新提出操作')
        await host.command(action.name)
      }
      return host.snapshot()
    },
  }
}
export type WritingAPI=ReturnType<typeof createWritingAPI>

export type DraftSnapshot={savedAt:number;active:string;documents:{id:string;title:string;content:string;updatedAt:number}[]}

// Coalesce while a native fsync is in flight, then acknowledge the newest copy.
// A pending/failed write is never advertised as safely stored on close.
export function createDraftJournal(windowId:string,changed:()=>void){
  let pending:DraftSnapshot|null=null,running=false,safe=true,failed=false,last=''
  async function drain(){
    running=true
    try{
      while(pending){const snapshot=pending;pending=null;await window.desktop!.drafts!({action:'write',window:windowId,snapshot})}
      safe=true;failed=false
    }catch{safe=false;failed=true;last=''}
    finally{running=false;changed()}
  }
  return {
    get safe(){return safe},get failed(){return failed},
    write(snapshot:DraftSnapshot){
      if(!window.desktop?.drafts)return
      const content=JSON.stringify([snapshot.active,snapshot.documents]);if(content===last)return
      last=content;pending=snapshot;safe=false;changed();if(!running)void drain()
    },
  }
}

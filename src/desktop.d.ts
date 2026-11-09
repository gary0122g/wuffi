type NativeFile = { token: string; path: string; title: string; content: string }
type FolderEntry = { token: string; name: string; directory: boolean }
interface Window {
  desktop?: {
    confirm?(message:string):Promise<boolean>
    drafts?(data:{action:'read'|'write';window:string;snapshot?:import('./draft-journal').DraftSnapshot}):Promise<import('./draft-journal').DraftSnapshot|null|boolean>
    benchmarkReport?(data:Record<string,unknown>):Promise<unknown>
    unavailableCommands?:readonly string[]
    onChromeHover(callback:(inside:boolean)=>void):void
    cloudAccount?(data:{action:'start'|'poll'|'status'|'logout'|'website'}):Promise<CloudAccount>
    agentConnection(data?:Record<string,unknown>):Promise<{baseURL:string;model:string;models?:string[]}>
    agentRequest(data:Record<string,unknown>):Promise<unknown>
    agentCancel():Promise<boolean>
    exportTemplates(data:{action:'list'|'choose'|'clear';format?:string}):Promise<Record<string,string>>
    clearRecent():Promise<void>
    recentFolder(index:number):ReturnType<NonNullable<Window['desktop']>['openFolder']>
    onFolderChanged(callback:(data:{path:string;token:string})=>void):void
    renderMarkdown(data:{markdown:string;syntax?:Record<string,unknown>}):Promise<string>
    editorContext(data:{table:boolean;list:boolean;task:boolean;code:boolean;readonly:boolean;selection:boolean}):void
    settings(data:Record<string,unknown>):Promise<any>
    uploadImage(data:{image:string}):Promise<string>
    searchFolder(data:{token:string;query:string}):Promise<{token:string;path:string;line:number;text:string}[]>
    onFileChanged(callback:(data:{type:string;token:string;path:string;oldPath?:string;title?:string;content?:string})=>void):void
    convert(data:{markdown:string;title:string;format:string;token?:string;syntax?:Record<string,unknown>}):Promise<string|null>
    importDocument():Promise<{title:string;content:string}|null>
    nativeContext():void
    readClipboard():Promise<{text:string;html:string}>
    clipboard(data: { action: 'read' | 'write'; text?: string; html?: string }): Promise<string>
    fileOperation(data: {token: string;action: 'move'|'trash'|'encoding';encoding?:string}): Promise<Partial<NativeFile> & {deleted?:boolean} | null>
    pickImage(data?:{token?:string;relative?:boolean;copy?:boolean}): Promise<string|null>
    resolveImage(data:{token?:string;src:string;embed?:boolean}): Promise<string>
    inspect(data: { token: string; action: 'info' | 'reload' | 'reveal' }): Promise<NativeFile | { path: string; size: number; modified: string; created: string } | null>
    exportDocument(data: { html: string; title: string; format: 'pdf' | 'html' | 'print'; paperSize: string;landscape?:boolean;margin?:number;scale?:number;header?:string;footer?:string;pageNumbers?:boolean }): Promise<string | null>
    preferences(data: { zoom: number; status?: boolean; toolbar?: boolean; showHidden?:boolean; rememberRecent?:boolean;night?:boolean;theme?:string;writingFirst?:boolean;paper?:string }): void
    open(): Promise<NativeFile[]>
    initialFiles(): Promise<NativeFile[]>
    openFolder(): Promise<{ token:string; name: string; path: string; entries: FolderEntry[] } | null>
    listFolder(token: string): Promise<FolderEntry[]>
    readFolderFile(token: string): Promise<NativeFile>
    save(data: { token?: string; title: string; content: string; expectedContent?:string; saveAs: boolean; extension?: string }): Promise<Omit<NativeFile, 'content'> | null>
    state(data: { dirty: boolean; activeDirty: boolean; title: string; draftSafe?:boolean }): void
    onCommand(callback: (command: string) => void): void
  }
}
type CloudAccount={signedIn?:boolean;pending?:boolean;code?:string;expiresIn?:number;user?:{email:string;name:string};plan?:{plan:string;limits:{tokens:number};usage:{tokens:number;reservedTokens?:number};resetsAt?:string;periodEnd?:string}}

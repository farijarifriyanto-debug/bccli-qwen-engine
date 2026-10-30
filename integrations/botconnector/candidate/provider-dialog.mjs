// The BCCLI provider picker is injected into the locked upstream Ink AuthDialog
// slot. Only provider/model IDs are passed through local in-memory state.
// Real API keys live solely in the parent proxy's native Windows dialog.
export const BCCLI_PROVIDER_DIALOG = String.raw`function AuthDialog(){
  const ui=useUIActions();
  const close=ui.auth.closeAuthDialog;
  const config=useConfig();
  const [stage,setStage]=(0,import_react27.useState)("providers");
  const [providers,setProviders]=(0,import_react27.useState)([]);
  const [providerId,setProviderId]=(0,import_react27.useState)("");
  const [models,setModels]=(0,import_react27.useState)([]);
  const [search,setSearch]=(0,import_react27.useState)("");
  const [providerSearch,setProviderSearch]=(0,import_react27.useState)("");
  const [searchEditing,setSearchEditing]=(0,import_react27.useState)(false);
  const [cursor,setCursor]=(0,import_react27.useState)(0);
  const [busy,setBusy]=(0,import_react27.useState)(false);
  const [message,setMessage]=(0,import_react27.useState)("");
  const [active,setActive]=(0,import_react27.useState)("");
  const base=process.env.OPENAI_BASE_URL||"";
  const token=process.env.OPENAI_API_KEY||"";
  const request=async(path,options={})=>{
    if(!/^http:\/\/127\.0\.0\.1:[0-9]{1,5}\/v1$/.test(base)||!token) throw Error("Local provider session unavailable");
    const timeoutMs=options.timeoutMs||12000;
    const result=await fetch(base+path,{method:options.method||"GET",
      headers:{Authorization:"Bearer "+token,Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{})},
      ...(options.body?{body:JSON.stringify(options.body)}:{}),
      redirect:"error",signal:AbortSignal.timeout(timeoutMs)});
    const json=await result.json().catch(()=>null);
    if(!result.ok)throw Error(json?.error||"Provider operation failed");
    return json;
  };
  const load=async()=>{
    const value=await request("/bccli/providers");
    setProviders(value.providers||[]);
    setActive(value.active||"");
    return value.providers||[];
  };
  (0,import_react27.useEffect)(()=>{
    let mounted=true;
    request("/bccli/providers").then(value=>{
      if(!mounted)return;
      const items=value.providers||[];
      setProviders(items);setActive(value.active||"");
      const focus=process.env.BCCLI_PROVIDER_PICKER_FOCUS||"";
      delete process.env.BCCLI_PROVIDER_PICKER_FOCUS;
      if(focus&&items.some(x=>x.id===focus)){
        setProviderId(focus);
        setStage("actions");
        setSearchEditing(false);
        setCursor(0);
      }
    }).catch(()=>{if(mounted)setMessage("Could not read providers from the local BCCLI proxy.")});
    return()=>{mounted=false};
  },[]);
  const actions=[
    {label:"Browse and select model",value:"models"},
    {label:"Add / replace API key (hidden)",value:"add"},
    {label:"Delete saved API key (confirmation)",value:"remove"},
    {label:"Back to providers",value:"back"}
  ];
  const selected=providers.find(x=>x.id===providerId);
  const filtered=stage==="models"?models.filter(x=>x.toLowerCase().includes(search.toLowerCase())):[];
  const filteredProviders=providers.filter(p=>p.id.toLowerCase().includes(providerSearch.toLowerCase())||
    p.name.toLowerCase().includes(providerSearch.toLowerCase()));
  // A dedicated visible Search control belongs to each list. Users can
  // reach it with arrows+Enter or press / or Ctrl+F from the list.
  const searchRow=stage==="providers"?{label:"🔎 Search provider: "+(providerSearch||"(all)")+(searchEditing?" █":"   [Enter to search]"),value:"__search__"}:
    {label:"🔎 Search model: "+(search||"(all)")+(searchEditing?" █":"   [Enter to search]"),value:"__search__"};
  const rows=stage==="providers"?[searchRow,{label:"+ Add Provider (custom HTTPS API)",value:"__new_provider__"},...filteredProviders.map(p=>({
    label:p.name+" ["+p.id+"]"+(p.active?" (ACTIVE)":"")+(p.configured?"  key OK":"  ADD KEY"),value:p.id
  }))]:stage==="actions"?actions:[searchRow,...filtered.map(m=>({label:m,value:m}))];
  const count=rows.length;
  const searchValue=stage==="providers"?providerSearch:search;
  const updateSearch=stage==="providers"?setProviderSearch:setSearch;
  const listStage=stage==="providers"||stage==="models";
  const run=async(task)=>{
    setBusy(true);setMessage("");
    try{await task()}catch{setMessage("Operation failed. Previous provider and credentials are preserved.")}finally{setBusy(false)}
  };
  const manage=async(action,id)=>{
    const result=await request("/bccli/provider/key/"+action,{method:"POST",timeoutMs:190000,
      body:{action:"user-confirmed-local-key-dialog",provider:id}});
    if(result.cancelled){setMessage("Cancelled. No saved key changed.");return false}
    if(action==="add"&&result.saved){setMessage("API key securely saved for "+id+".");await load();return true}
    if(action==="remove"&&result.removed){setMessage("Saved API key removed for "+id+". An active removed key cannot be used.");await load();return true}
    throw Error("Key operation unavailable");
  };
  const browse=async(id)=>{
    const value=await request("/bccli/providers/"+id+"/models");
    const ids=Array.isArray(value.models)?value.models:[];
    if(!ids.length)throw Error("No models available");
    setModels(ids);setSearch("");setSearchEditing(false);setCursor(0);setStage("models");
  };
  const selectModel=async(id)=>{
    const previous=config.getModel?.();
    if(!config||typeof config.setModel!=="function")throw Error("Config unavailable");
    if(id!==previous)await config.setModel(id,{reason:"bccli-provider-picker"});
    try{
      const chosen=await request("/bccli/provider/switch",{method:"POST",
        body:{action:"user-selected-provider",provider:providerId,model:id}});
      if(chosen.provider!==providerId||chosen.model!==id)throw Error("Switch not acknowledged");
      close();
    }catch{
      if(previous&&id!==previous)await config.setModel(previous,{reason:"bccli-provider-picker-rollback"}).catch(()=>{});
      throw Error("Provider not switched");
    }
  };
  useKeypress(key=>{
    if(busy)return;
    if(key.name==="escape"){
      if(searchEditing){setSearchEditing(false);setCursor(0);return}
      if(stage==="models"){setStage("actions");setSearch("");setCursor(0)}
      else if(stage==="actions"){setStage("providers");setCursor(0)}
      else close();
      return;
    }
    if(listStage&&(key.ctrl&&key.name==="f"||key.sequence==="/"&&!key.ctrl&&!key.meta)){
      setSearchEditing(true);setCursor(0);return;
    }
    if(key.name==="up"||key.ctrl&&key.name==="p"){
      setSearchEditing(false);setCursor(c=>count?(c-1+count)%count:0);return;
    }
    if(key.name==="down"||key.ctrl&&key.name==="n"){
      setSearchEditing(false);setCursor(c=>count?(c+1)%count:0);return;
    }
    if(listStage&&(key.name==="backspace"||key.name==="delete")){
      if(searchEditing){updateSearch(x=>x.slice(0,-1));setCursor(0)}
      return;
    }
    if(listStage&&key.ctrl&&key.name==="u"){
      updateSearch("");setCursor(0);setSearchEditing(true);return;
    }
    if(key.name==="return"){
      if(listStage&&cursor===0){
        if(searchEditing){setSearchEditing(false);setCursor(count>1?1:0)}
        else setSearchEditing(true);
        return;
      }
      if(stage==="providers"){
        if(cursor===1){
          void run(async()=>{
            const result=await request("/bccli/provider/custom/add",{method:"POST",timeoutMs:190000,
              body:{action:"user-confirmed-local-custom-provider-dialog"}});
            if(result?.cancelled){setMessage("Add Provider cancelled. Nothing was changed.");return}
            if(!result?.added||!result?.provider)throw Error("Registration failed")
            await load();
            setProviderId(result.provider);
            setStage("actions");setCursor(0);setSearchEditing(false);setProviderSearch("");
            await manage("add",result.provider);
          });
          return;
        }
        const item=filteredProviders[cursor-2];if(!item)return;
        setProviderId(item.id);setCursor(0);setStage("actions");setSearchEditing(false);
        if(!item.configured)void run(async()=>{await manage("add",item.id)});
        return;
      }
      if(stage==="actions"){
        const action=actions[cursor]?.value;if(!action)return;
        if(action==="back"){setStage("providers");setCursor(0);return}
        if(action==="add"||action==="remove"){void run(async()=>{await manage(action,providerId)});return}
        if(action==="models")void run(async()=>{await browse(providerId)});
        return;
      }
      if(stage==="models"&&filtered[cursor-1])void run(async()=>{await selectModel(filtered[cursor-1])});
      return;
    }
    if(listStage&&(searchEditing||stage==="models")&&!key.ctrl&&!key.meta){
      const incoming=String(key.sequence||"");
      if(incoming&&incoming.length<=128&&/^[a-zA-Z0-9._:/+ -]+$/.test(incoming)){
        updateSearch(x=>(x+incoming).slice(0,64));setSearchEditing(true);setCursor(0);
      }
    }
  },{isActive:true});
  const start=Math.max(0,Math.min(cursor-4,Math.max(0,rows.length-9)));
  const visible=rows.slice(start,start+9);
  const title=stage==="providers"?"BCCLI | Choose AI provider":stage==="actions"?"BCCLI | "+(selected?.name||providerId):"BCCLI | "+providerId+" | Select model";
  return (0,import_jsx_runtime32.jsxs)(Box_default,{borderStyle:"single",borderColor:theme?.border?.default,
    flexDirection:"column",padding:1,width:"100%",children:[
    (0,import_jsx_runtime32.jsx)(Text,{bold:true,color:theme.text.primary,children:title}),
    (0,import_jsx_runtime32.jsx)(Text,{color:theme.text.secondary,children:stage==="models"?
      "Search models ("+filtered.length+"/"+models.length+") · choose 🔎 Search model with Enter or press /":
      stage==="providers"?"Search providers ("+filteredProviders.length+"/"+providers.length+") · + Add Provider · choose Search with Enter or /":
      "Enter to select an action; keys are never placed in chat."}),
    ...(visible.length?visible.map((row,index)=>{
      const absolute=start+index,focused=absolute===cursor;
      return (0,import_jsx_runtime32.jsx)(Box_default,{
        children:(0,import_jsx_runtime32.jsx)(Text,{bold:focused,color:focused?theme.text.link:theme.text.primary,
          children:(focused?"❯ ":"  ")+row.label})},String(absolute))
    }):[(0,import_jsx_runtime32.jsx)(Text,{color:theme.text.secondary,children:busy?"Working...":"No items. Backspace to adjust search."},"empty")]),
    (0,import_jsx_runtime32.jsx)(Text,{color:theme.text.secondary,
      children:(rows.length?((start+1)+"-"+(start+visible.length)+" of "+rows.length+"  |  "):"")+
      "↑↓ navigate · Enter select · Esc back"+(listStage?" · / search · Ctrl+U clear · Backspace edit":"")}),
    busy?(0,import_jsx_runtime32.jsx)(Text,{color:theme.text.secondary,children:"Waiting for secure provider operation..." }):null,
    message?(0,import_jsx_runtime32.jsx)(Text,{color:theme.status.error,children:message}):null,
    (0,import_jsx_runtime32.jsx)(Text,{color:theme.text.secondary,children:"Active provider: "+active+" | Active model: "+(config.getModel?.()||"(unknown)")})
  ]})
}`;

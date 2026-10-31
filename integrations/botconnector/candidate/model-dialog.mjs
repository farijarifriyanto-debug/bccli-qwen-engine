// BCCLI-owned model picker, injected into the locked upstream `ModelDialog`
// slot. The upstream dialog renders one flat numbered list with no way to type
// a name, while the gateway catalog is long; this replacement adds the same
// search row BCCLI's provider picker already ships.
//
// Only the primary model goes through this picker. The auxiliary dialogs
// (fast / vision / voice / compaction / image / advisor) keep the upstream
// implementation, because they own per-mode eligibility and persistence rules
// that this picker must not re-implement.
//
// Runtime identifiers are the aliases the surrounding engine chunk already
// uses for this region: import_react31 for hooks, import_jsx_runtime36 for jsx.
export const BCCLI_MODEL_DIALOG = String.raw`function BccliModelPicker(props){
  const config=useConfig();
  const settings=useSettings();
  const [models,setModels]=(0,import_react31.useState)([]);
  const [search,setSearch]=(0,import_react31.useState)("");
  const [editing,setEditing]=(0,import_react31.useState)(false);
  const [cursor,setCursor]=(0,import_react31.useState)(0);
  const [message,setMessage]=(0,import_react31.useState)("");
  const [busy,setBusy]=(0,import_react31.useState)(false);
  const [active,setActive]=(0,import_react31.useState)(config.getModel?.()||"");
  const base=process.env.OPENAI_BASE_URL||"";
  const token=process.env.OPENAI_API_KEY||"";
  const request=async(path,options={})=>{
    if(!/^http:\/\/127\.0\.0\.1:[0-9]{1,5}\/v1$/.test(base)||!token) throw Error("Local provider session unavailable");
    const result=await fetch(base+path,{method:options.method||"GET",
      headers:{Authorization:"Bearer "+token,Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{})},
      ...(options.body?{body:JSON.stringify(options.body)}:{}),
      redirect:"error",signal:AbortSignal.timeout(12000)});
    const json=await result.json().catch(()=>null);
    if(!result.ok)throw Error(json?.error||"Provider request failed");
    return json;
  };
  (0,import_react31.useEffect)(()=>{
    let mounted=true;
    request("/models").then(value=>{
      if(!mounted)return;
      const ids=[...new Set((Array.isArray(value?.data)?value.data:[]).map(x=>x?.id).filter(x=>typeof x==="string"))].sort();
      setModels(ids);
      setActive(config.getModel?.()||"");
    }).catch(()=>{if(mounted)setMessage("Could not read the model catalog from the local BCCLI gateway.")});
    return()=>{mounted=false};
  },[]);
  const needle=search.trim().toLowerCase();
  const filtered=needle?models.filter(x=>x.toLowerCase().includes(needle)):models;
  const count=filtered.length;
  const at=count?Math.min(cursor,count-1):0;
  const searchRow="🔎 Search model: "+(search||"(all)")+(editing?" █":"   [Enter to search]");
  // Switching keeps the loopback proxy: setModel refreshes the live content
  // generator, then the gateway records the choice for the next launch. If the
  // record fails, the previous model is restored so the dialog never lies.
  const choose=async(id)=>{
    if(busy)return;
    setBusy(true);setMessage("");
    const previous=config.getModel?.();
    try{
      await config.setModel(id,{reason:"bccli-gateway-model-picker"});
      if(config.getModel?.()!==id)throw Error("Model switch did not take effect");
      try{
        const providers=await request("/bccli/providers");
        await request("/bccli/provider/switch",{method:"POST",
          body:{action:"user-selected-provider",provider:providers.active,model:id}});
      }catch{
        if(previous&&previous!==id)await config.setModel(previous,{reason:"bccli-gateway-model-picker-rollback"}).catch(()=>{});
        throw Error("Model selection was not saved");
      }
      persistModelSelection(settings,id,base,props.persistScope);
      setActive(id);
      props.onClose?.();
    }catch(error){
      setMessage(String(error?.message||"Model selection failed"));
    }finally{setBusy(false)}
  };
  useKeypress(key=>{
    if(busy)return;
    if(key.name==="escape"){
      if(editing){setEditing(false);return}
      if(search){setSearch("");setCursor(0);return}
      props.onClose?.();return;
    }
    if(key.ctrl&&key.name==="f"||key.sequence==="/"&&!key.ctrl&&!key.meta){
      setEditing(true);return;
    }
    if(key.name==="up"||key.ctrl&&key.name==="p"){setEditing(false);setCursor(Math.max(0,at-1));return}
    if(key.name==="down"||key.ctrl&&key.name==="n"){setEditing(false);setCursor(Math.min(Math.max(0,count-1),at+1));return}
    if(key.name==="backspace"||key.name==="delete"){
      if(editing){setSearch(s=>s.slice(0,-1));setCursor(0)}
      return;
    }
    if(key.ctrl&&key.name==="u"){setSearch("");setCursor(0);setEditing(true);return}
    if(key.name==="return"){
      const picked=filtered[at];
      if(picked)void choose(picked);
      return;
    }
    if(!key.ctrl&&!key.meta){
      const incoming=String(key.sequence||"");
      if(incoming&&incoming.length<=128&&/^[a-zA-Z0-9._:/+ -]+$/.test(incoming)){
        setSearch(s=>(s+incoming).slice(0,64));setEditing(true);setCursor(0);
      }
    }
  },{isActive:true});
  const start=Math.max(0,Math.min(at-4,Math.max(0,count-10)));
  const visible=filtered.slice(start,start+10);
  const title="BCCLI | Select model"+(props.persistScope==="workspace"?" (this project)":props.persistScope==="user"?" (global)":"");
  return (0,import_jsx_runtime36.jsxs)(Box_default,{borderStyle:"round",borderColor:theme?.border?.default,
    flexDirection:"column",padding:1,width:"100%",children:[
    (0,import_jsx_runtime36.jsx)(Text,{bold:true,children:title}),
    (0,import_jsx_runtime36.jsx)(Text,{color:theme.text.secondary,children:models.length?
      "Search models ("+count+"/"+models.length+") · type to filter · Esc stops editing, then clears, then closes":
      "Loading the provider model catalog..."}),
    (0,import_jsx_runtime36.jsx)(Text,{color:editing?theme.text.link:theme.text.secondary,children:searchRow}),
    ...(visible.length?visible.map((label,index)=>{
      const absolute=start+index,focused=absolute===at;
      return (0,import_jsx_runtime36.jsx)(Box_default,{
        children:(0,import_jsx_runtime36.jsx)(Text,{bold:focused,color:focused?theme.text.link:theme.text.primary,
          children:(focused?"❯ ":"  ")+label+(label===active?"  [ACTIVE]":"")})},String(absolute))
    }):[(0,import_jsx_runtime36.jsx)(Text,{color:theme.text.secondary,
      children:models.length?"No models match the search. Backspace to adjust.":(busy?"Switching model...":"Loading...")},"empty")]),
    (0,import_jsx_runtime36.jsx)(Text,{color:theme.text.secondary,
      children:(count?(Math.min(start+1,count)+"-"+(start+visible.length)+" of "+count+"  |  "):"")+
      "↑↓ navigate · Enter select · / search · Ctrl+U clear · Backspace edit · Esc close"}),
    message?(0,import_jsx_runtime36.jsx)(Text,{color:theme.status.error,children:message}):null,
    (0,import_jsx_runtime36.jsx)(Text,{color:theme.text.secondary,children:"Active model: "+(active||"(unknown)")})
  ]})
}
function ModelDialog(props){
  const auxiliary=props.isFastModelMode||props.isAdvisorModelMode||props.isVoiceModelMode||props.isVisionModelMode||props.isCompactionModelMode||props.isImageModelMode;
  if(auxiliary)return (0,import_jsx_runtime36.jsx)(UpstreamModelDialog,props);
  return (0,import_jsx_runtime36.jsx)(BccliModelPicker,props);
}`;

// Native slash command for safely switching configured providers without
// restarting the engine or losing the in-memory conversation / tool approvals.
// API keys are never exposed to the renderer; the parent owns the key store.
export const BCCLI_PROVIDER_COMMAND = String.raw`var authCommand={name:"provider",altNames:["auth","connect","login"],get description(){return "List or switch configured AI providers in this chat"},argumentHint:"[PROVIDER [MODEL_ID|NUMBER]]",kind:"built-in",supportedModes:["interactive"],action:__name(async(context,argumentText)=>{
  var response=(type,content)=>({type:"message",messageType:type,content});
  var base=process.env.OPENAI_BASE_URL||"",token=process.env.OPENAI_API_KEY||"";
  if(!/^http:\/\/127\.0\.0\.1:[0-9]{1,5}\/v1$/.test(base)||!token) return response("error","BCCLI requires a local, authenticated provider session.");
  var headers={Authorization:"Bearer "+token,Accept:"application/json"};
  var request=async(path,options={})=>{
    var result=await fetch(base+path,{...options,headers:{...headers,...(options.headers||{})},redirect:"error",signal:AbortSignal.timeout(12000)});
    var payload=await result.json().catch(()=>null);
    if(!result.ok)throw Error(typeof payload?.error==="string"?payload.error:"Local provider operation unavailable.");
    return payload;
  };
  try{
    var raw=String(context.invocation?.args||argumentText||"").trim();
    var params=raw.split(/\s+/).filter(Boolean);
    if(params.length>2)return response("error","Use /provider to list, /provider NAME for models or /provider NAME NUMBER|MODEL_ID to switch.");
    var data=await request("/bccli/providers");
    if(!Array.isArray(data?.providers))return response("error","Provider list unavailable.");
    var providers=data.providers;
    var current=data.active||"(unknown)";
    if(!params.length){
      return response("info","BCCLI providers — active: "+current+"\n\n"+providers.map((p,i)=>(i+1)+". "+p.id+" — "+p.name+(p.active?" [ACTIVE]":"")+(p.configured?" [configured]":" [API key required]")).join("\n")+"\n\nUse /provider NUMBER or /provider NAME to see its models; /provider NAME MODEL_ID to switch in this chat. For a missing key run bccli provider add NAME in another terminal; never paste a key in chat.");
    }
    var id=/^[0-9]+$/.test(params[0])?providers[Number(params[0])-1]?.id:params[0].toLowerCase();
    var item=providers.find(p=>p.id===id);
    if(!item)return response("error","Unknown provider. Run /provider to see configured providers.");
    if(!item.configured)return response("error","Provider "+id+" has no configured key. Set it with bccli provider add "+id+" in another terminal. This chat remains open.");
    var catalog=await request("/bccli/providers/"+id+"/models");
    if(!Array.isArray(catalog?.models)||!catalog.models.length)return response("error","No available models for "+id+".");
    var models=catalog.models;
    if(params.length===1){
      return response("info","Models for "+id+" ("+models.length+")\n\n"+models.slice(0,24).map((m,i)=>(i+1)+". "+m).join("\n")+(models.length>24?"\n...more models: specify full model ID to select.":"")+"\n\nUse /provider "+id+" MODEL_ID or /provider "+id+" NUMBER to switch provider and model now, without exiting this chat. No AI request is sent by selecting.");
    }
    var pick=/^[0-9]+$/.test(params[1])?models[Number(params[1])-1]:params[1];
    if(!pick||!models.includes(pick))return response("error","That model is unavailable for "+id+". Use /provider "+id+" to list eligible models.");
    var config=context.services?.config;
    if(!config||typeof config.setModel!=="function")return response("error","The live chat model cannot be changed.");
    var previous=config.getModel?.();
    var currentProvider=current;
    // Update the local renderer first; if the parent rejects the new route,
    // restore the old model so display and actual billing remain consistent.
    if(pick!==previous)await config.setModel(pick,{reason:"bccli-provider-switch"});
    try{
      var result=await request("/bccli/provider/switch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"user-selected-provider",provider:id,model:pick})});
      if(result?.provider!==id||result?.model!==pick)throw Error("Parent switch not confirmed");
      return response("info","Provider switched to "+id+"; active model: "+pick+". The current chat remains open. Your next request routes through "+id+".");
    }catch{
      if(previous&&pick!==previous)await config.setModel(previous,{reason:"bccli-provider-switch-rollback"}).catch(()=>{});
      return response("error","Provider switch was rejected by the local gateway; previous provider "+currentProvider+" and model remain active.");
    }
  }catch{
    return response("error","Provider selection failed. The existing chat and current route were preserved.");
  }
},"action")};`

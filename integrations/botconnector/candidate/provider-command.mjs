// Native slash command for safely switching configured providers without
// restarting the engine or losing the in-memory conversation / tool approvals.
// API keys are never exposed to the renderer; the parent owns the key store.
export const BCCLI_PROVIDER_COMMAND = String.raw`var authCommand={name:"provider",altNames:["auth","connect","login"],get description(){return "Select AI provider, add/replace or delete its API key in this chat"},argumentHint:"[PROVIDER|add|remove [NAME|NUMBER]]",kind:"built-in",supportedModes:["interactive"],action:__name(async(context,argumentText)=>{
  var response=(type,content)=>({type:"message",messageType:type,content});
  var base=process.env.OPENAI_BASE_URL||"",token=process.env.OPENAI_API_KEY||"";
  if(!/^http:\/\/127\.0\.0\.1:[0-9]{1,5}\/v1$/.test(base)||!token) return response("error","BCCLI requires a local, authenticated provider session.");
  var headers={Authorization:"Bearer "+token,Accept:"application/json"};
  var request=async(path,options={})=>{
    var { timeoutMs=12000, ...fetchOptions }=options;
    var result=await fetch(base+path,{...fetchOptions,headers:{...headers,...(fetchOptions.headers||{})},redirect:"error",signal:AbortSignal.timeout(timeoutMs)});
    var payload=await result.json().catch(()=>null);
    if(!result.ok)throw Error(typeof payload?.error==="string"?payload.error:"Local provider operation unavailable.");
    return payload;
  };
  try{
    var raw=String(context.invocation?.args||argumentText||"").trim();
    var params=raw.split(/\s+/).filter(Boolean);
    if(params.length>2)return response("error","Use /provider; /provider NAME; /provider add NAME; /provider remove NAME; or /provider NAME MODEL_ID.");
    var data=await request("/bccli/providers");
    if(!Array.isArray(data?.providers))return response("error","Provider list unavailable.");
    var providers=data.providers;
    var current=data.active||"(unknown)";
    if(!params.length){
      delete process.env.BCCLI_PROVIDER_PICKER_FOCUS;
      return {type:"dialog",dialog:"auth"};
    }
    if(params[0]==="list"){
      return response("info","BCCLI providers — active: "+current+"\n\n"+providers.map((p,i)=>(i+1)+". "+p.id+" — "+p.name+(p.active?" [ACTIVE]":"")+(p.configured?" [configured]":" [API key required]")).join("\n")+"\n\nChoose: /provider NUMBER or /provider NAME\nSave/replace key: /provider add NAME\nDelete saved key: /provider remove NAME\nSelect AI: /provider NAME MODEL_ID\nKeys open a hidden Windows dialog; NEVER paste keys into chat.");
    }
    if(["add","replace","remove","delete"].includes(params[0].toLowerCase())){
      if(params.length!==2)return response("error","Specify a provider. Example: /provider add openrouter or /provider remove openrouter.");
      var action=params[0].toLowerCase(),target=params[1].toLowerCase();
      var name=/^[0-9]+$/.test(target)?providers[Number(target)-1]?.id:target;
      if(!providers.some(p=>p.id===name))return response("error","Unknown provider. Use /provider to list available providers.");
      var adding=action==="add"||action==="replace";
      // Only provider ID is sent to the parent. The secret is entered into a
      // masked Windows popup owned by the parent and never touches AI chat.
      var result=await request("/bccli/provider/key/"+(adding?"add":"remove"),{
        method:"POST",timeoutMs:190000,headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"user-confirmed-local-key-dialog",provider:name}),
      });
      if(result?.cancelled)return response("info","Cancelled. No API key was modified.");
      if(adding&&result?.saved)return response("info","API key for "+name+" saved with Windows DPAPI (never displayed). Use /provider "+name+" to select a model now; this chat stays open.");
      if(!adding&&result?.removed)return response("info","Saved key for "+name+" removed. "+(result.active?"This provider is now blocked from sending AI requests until you configure or switch providers. ":"")+(result.stillConfigured?"An environment/legacy key still exists; removal does not revoke it.":"")+" Use /provider to view status.");
      return response("error","The key operation was not confirmed.");
    }
    var id=/^[0-9]+$/.test(params[0])?providers[Number(params[0])-1]?.id:params[0].toLowerCase();
    if(params.length===1&&providers.some(p=>p.id===id)){
      process.env.BCCLI_PROVIDER_PICKER_FOCUS=id;
      return {type:"dialog",dialog:"auth"};
    }
    var item=providers.find(p=>p.id===id);
    if(!item)return response("error","Unknown provider. Run /provider to see configured providers.");
    if(!item.configured){
      var saved=await request("/bccli/provider/key/add",{method:"POST",timeoutMs:190000,headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"user-confirmed-local-key-dialog",provider:id})});
      if(saved?.cancelled)return response("info","Cancelled. No API key was saved and your current provider stays active.");
      if(!saved?.saved)return response("error","Provider key was not saved. Current provider remains active.");
    }
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

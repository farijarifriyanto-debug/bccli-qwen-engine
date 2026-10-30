// Generated, version-pinned Qwen slash command overlay for /model.
// Fetches the authenticated model catalog from the existing local BotConnector
// proxy on each invocation. Selection changes Qwen Config in the current
// session; it never opens upstream provider settings or writes project config.
export const BCCLI_MODEL_COMMAND = String.raw`var bccliModelLastList=[];var modelCommand={name:"model",get description(){return "Choose an AI model from the active provider"},argumentHint:"[number|model-id|search WORD|page N]",kind:"built-in",supportedModes:["interactive","non_interactive","acp"],action:__name(async(context,argumentText)=>{
  var response=(type,content)=>({type:"message",messageType:type,content});
  try{
    var base=process.env.OPENAI_BASE_URL||"";
    var key=process.env.OPENAI_API_KEY||"";
    if(!/^http:\/\/127\.0\.0\.1:[0-9]{1,5}\/v1$/.test(base)||!key){
      return response("error","BCCLI requires an authenticated local provider session.");
    }
    var result=await fetch(base+"/models",{method:"GET",headers:{Authorization:"Bearer "+key,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(10000)});
    if(!result.ok)return response("error","Provider model catalog is unavailable (HTTP "+result.status+"). No provider fallback.");
    var payload=await result.json();
    if(!Array.isArray(payload?.data))return response("error","Invalid provider model catalog.");
    var catalog=new Map();
    for(var entry of payload.data){
      if(typeof entry?.id==="string" && /^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,255}$/.test(entry.id) && !catalog.has(entry.id)){
        catalog.set(entry.id,{id:entry.id,name:typeof entry.name==="string"?entry.name.slice(0,90):entry.id});
      }
    }
    var all=[...catalog.values()].sort((a,b)=>a.id.localeCompare(b.id));
    if(!all.length)return response("error","No provider models available for this API key.");
    var text=String(context.invocation?.args||argumentText||"").trim();
    var config=context.services?.config;
    if(!config||typeof config.setModel!=="function")return response("error","BCCLI model switch is unavailable in this session.");
    var current=config.getModel?.()||process.env.OPENAI_MODEL||"(unknown)";
    var list=(entries,page=1)=>{
      bccliModelLastList=entries.map(x=>x.id);
      var size=12;
      var pages=Math.max(1,Math.ceil(entries.length/size));
      if(!Number.isSafeInteger(page)||page<1||page>pages)return response("error","Invalid page. Use /model page 1 ... "+pages);
      var start=(page-1)*size;
      var rows=entries.slice(start,start+size).map((x,i)=>(start+i+1)+". "+x.id+(x.id===current?"  [ACTIVE]":""));
      return response("info","Provider AI models ("+entries.length+" available; page "+page+"/"+pages+")\nActive: "+current+"\n\n"+rows.join("\n")+"\n\nUse /model NUMBER or /model MODEL_ID to switch now; /model page N; /model search KEYWORD. To change providers without leaving this chat, use /provider; then /provider NAME MODEL_ID.");
    };
    if(!text)return list(all);
    var page=text.match(/^page\s+([0-9]+)$/i);
    if(page)return list(all,Number(page[1]));
    var search=text.match(/^search\s+(.{1,80})$/i);
    if(search)return list(all.filter(x=>x.id.toLowerCase().includes(search[1].toLowerCase())||x.name.toLowerCase().includes(search[1].toLowerCase())));
    var item;
    if(/^[0-9]+$/.test(text)){
      var index=Number(text);
      item=Number.isSafeInteger(index)&&index>=1?catalog.get(bccliModelLastList[index-1]||all[index-1]?.id):undefined;
    }else if(/^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,255}$/.test(text)){
      item=catalog.get(text);
    }
    if(!item)return response("error","That model is not available in your active provider catalog. Run /model to view allowed models.");
    if(item.id===current)return response("info","Already using "+item.id+" via the active provider.");
    // Raw model IDs are supported by Config.setModel; this preserves OpenAI
    // auth/loopback proxy instead of switching providers. It refreshes the
    // live content generator, so the next message uses the new model.
    await config.setModel(item.id,{reason:"bccli-gateway-model-picker"});
    if(config.getModel?.()!==item.id)return response("error","Model switch did not take effect; previous model preserved.");
    return response("info","Switched to "+item.id+" in the current session. Routing and billing remain with the active provider.");
  }catch{
    return response("error","Provider model selection failed; no upstream provider fallback was used.");
  }
},"action")};`

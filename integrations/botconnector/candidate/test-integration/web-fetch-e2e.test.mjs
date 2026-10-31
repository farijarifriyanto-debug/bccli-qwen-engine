import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { childEnvironment, qwenArguments, resolveQwenEntrypoint } from '../core.mjs'
import { prepareBrandedQwen } from '../branding.mjs'
import { startGatewayProxy } from '../proxy.mjs'

const chunk=(model,delta,finish)=>'data: '+JSON.stringify({id:'mock-fetch',object:'chat.completion.chunk',created:1,model,choices:[{index:0,delta,finish_reason:finish}]})+'\n\n'
const response=(model,delta,finish)=>new Response(chunk(model,delta,null)+chunk(model,{},finish)+'data: [DONE]\n\n',{status:200,headers:{'content-type':'text/event-stream'}})
const invoke=(model,name,args)=>response(model,{role:'assistant',tool_calls:[{index:0,id:'call_'+name,type:'function',function:{name,arguments:JSON.stringify(args)}}]},'tool_calls')
const complete=(model,text)=>response(model,{role:'assistant',content:text},'stop')

test('full BCCLI agent discovers web_fetch and reads a local fixture through the real tool bridge', {timeout:90000}, async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bccli-web-fetch-'))
 const page='WEB_FETCH_LOCAL_FIXTURE_2026'
 let serverHits=0
 const server=http.createServer((_req,res)=>{serverHits++;res.writeHead(200,{'content-type':'text/plain; charset=utf-8'});res.end(page+'\n')})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const url='http://127.0.0.1:'+server.address().port+'/fixture'
 const observed=[]
 let search=false,invoked=false,sideQuery=false
 const proxy=await startGatewayProxy({key:'FAKE_IN_MEMORY_ONLY',fetchImpl:async(_url,init)=>{
   assert.equal(init.headers.authorization,'Bearer FAKE_IN_MEMORY_ONLY')
   const body=JSON.parse(init.body.toString())
   const model=body.model
   const names=body.tools?.map(t=>t.function?.name)||[]
   const toolReplies=JSON.stringify(body.messages?.filter(m=>m.role==='tool')||[])
   observed.push({names,toolReplies:toolReplies.slice(-1000)})
   if(names.includes('tool_search')&&!search){
     search=true
     return invoke(model,'tool_search',{query:'select:web_fetch'})
   }
   if(names.includes('tool_search')&&!invoked){
     invoked=true
     return invoke(model,'tool_call',{name:'web_fetch',arguments:{url,prompt:'Return exact WEB_FETCH_LOCAL_FIXTURE_2026 token from page.',format:'text'}})
   }
   if(!names.includes('tool_search')){
     sideQuery=true
     return complete(model,'WEB_FETCH_LOCAL_FIXTURE_2026')
   }
   return complete(model,'WEB_FETCH_E2E_COMPLETE')
 }})
 try{
  const env=childEnvironment({...process.env,CI:'true',NO_COLOR:'1',QWEN_CODE_MAX_OUTPUT_TOKENS:'4096'},proxy.token,'ling-3.0-flash',{endpoint:proxy.baseUrl,home:path.join(root,'home')})
  env.QWEN_CODE_SYSTEM_SETTINGS_PATH=path.join(root,'system.json')
  const args=[prepareBrandedQwen(resolveQwenEntrypoint()),...qwenArguments('ling-3.0-flash','Fetch localhost fixture with web_fetch.',proxy.baseUrl,{projectDir:root})]
  args.splice(args.indexOf('--approval-mode'),0,'--allowed-tools','web_fetch')
  const result=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe']})
   let stdout='',stderr=''
   child.stdout.on('data',b=>stdout+=b)
   child.stderr.on('data',b=>stderr+=b)
   const timer=setTimeout(()=>child.kill(),65000)
   child.once('error',reject)
   child.once('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr})})
  })
  assert.equal(result.code,0,'stderr: '+result.stderr.slice(-550))
  assert.equal(search,true,'tool_search must execute')
  assert.equal(invoked,true,'model must invoke tool_call')
  assert.ok(serverHits>=1,'web_fetch must retrieve the HTTP fixture; evidence '+JSON.stringify(observed))
  assert.ok(observed.some(v=>v.toolReplies.includes('parametersJsonSchema')),
    'tool_search must return the web_fetch schema for tool_call')
  assert.equal(sideQuery,true,'web_fetch must invoke its AI side query via the mocked gateway')
  assert.match(result.stdout,/WEB_FETCH_E2E_COMPLETE/)
 }finally{await proxy.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true})}
})

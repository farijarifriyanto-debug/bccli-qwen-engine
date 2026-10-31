import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {childEnvironment,qwenArguments,resolveQwenEntrypoint} from '../core.mjs'
import {prepareBrandedQwen} from '../branding.mjs'
import {startGatewayProxy} from '../proxy.mjs'

const chunk=(model,delta,finish_reason)=>'data: '+JSON.stringify({
  id:'mock-search',object:'chat.completion.chunk',created:1,model,
  choices:[{index:0,delta,finish_reason}],
})+'\n\n'
const response=(model,delta,finish)=>new Response(chunk(model,delta,null)+chunk(model,{},finish)+'data: [DONE]\n\n',{
  status:200,headers:{'content-type':'text/event-stream'},
})
const call=(model,name,args)=>response(model,{role:'assistant',tool_calls:[{
  index:0,id:'call_'+name,type:'function',function:{name,arguments:JSON.stringify(args)}
}]},'tool_calls')
const final=(model,text)=>response(model,{role:'assistant',content:text},'stop')

test('full BCCLI discovers provider-neutral web_search and uses parent-only search key', {timeout:90000},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bccli-web-search-'))
  let used=0,hasSchema=false,hasCitedReply=false
  let invoked=false
  let lastReply=''
  const fakeSearchKey='SEARCH_SECRET_NEVER_EXPOSED'
  const proxy=await startGatewayProxy({
    key:'MODEL_SECRET_NEVER_EXPOSED',searchApiKey:fakeSearchKey,
    searchImpl:async({query,key})=>{
      assert.equal(key,fakeSearchKey)
      assert.equal(query,'BCCLI source reference')
      used++
      return {query,results:[{title:'Verified source',url:'https://docs.example.org/guide',snippet:'Fixture result'}]}
    },
    fetchImpl:async(_url,init)=>{
      assert.equal(init.headers.authorization,'Bearer MODEL_SECRET_NEVER_EXPOSED')
      const body=JSON.parse(init.body.toString())
      const model=body.model
      const names=(body.tools||[]).map(x=>x.function?.name)
      const replies=JSON.stringify((body.messages||[]).filter(x=>x.role==='tool'))
      if(replies.length>2)lastReply=replies.slice(-1800)
      assert.doesNotMatch(JSON.stringify(body),/SEARCH_SECRET_NEVER_EXPOSED|MODEL_SECRET_NEVER_EXPOSED/)
      hasSchema||=replies.includes('parametersJsonSchema')
      hasCitedReply||=replies.includes('https://docs.example.org/guide')
      if(names.includes('web_search')&&!invoked){invoked=true;return call(model,'web_search',{query:'BCCLI source reference'})}
      return final(model,'BCCLI_WEB_SEARCH_E2E_PASS')
    }
  })
  try{
    const env=childEnvironment({...process.env,BRAVE_SEARCH_API_KEY:fakeSearchKey,CI:'true',NO_COLOR:'1'},
      proxy.token,'ling-3.0-flash',{endpoint:proxy.baseUrl,home:path.join(root,'home'),
        providerId:'botconnector',searchAvailable:true})
    assert.equal(env.BRAVE_SEARCH_API_KEY,undefined)
    const entry=prepareBrandedQwen(resolveQwenEntrypoint(),{cacheRoot:path.join(os.tmpdir(),'bccli-e2e-web-search-branded-cache')})
    const args=[entry,...qwenArguments('ling-3.0-flash','Find a source with web_search.',proxy.baseUrl,{projectDir:root})]
    args.splice(args.indexOf('--approval-mode'),0,'--allowed-tools','web_search')
    const result=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,args,{env,cwd:root,stdio:['ignore','pipe','pipe']})
      let out='',err=''
      child.stdout.on('data',d=>out+=d.toString())
      child.stderr.on('data',d=>err+=d.toString())
      const timeout=setTimeout(()=>child.kill(),65000)
      child.once('error',reject)
      child.once('close',code=>{clearTimeout(timeout);resolve({code,out,err})})
    })
    assert.equal(result.code,0,result.err.slice(-450))
    assert.equal(invoked,true,'web_search tool advertised directly and invoked')
    assert.equal(used,1,'one authorized search with parent key; diagnostic '+JSON.stringify({lastReply,out:result.out.slice(-500),err:result.err.slice(-500)}))
    assert.equal(hasSchema,false,'direct web_search does not require deferred schema lookup')
    assert.equal(hasCitedReply,true,'search result URL forwarded to model')
    assert.match(result.out,/BCCLI_WEB_SEARCH_E2E_PASS/)
  }finally{await proxy.close();fs.rmSync(root,{recursive:true,force:true})}
})

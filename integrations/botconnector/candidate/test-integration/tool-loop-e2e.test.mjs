import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { childEnvironment, qwenArguments, resolveQwenEntrypoint } from '../core.mjs'
import { startGatewayProxy } from '../proxy.mjs'
const completion = (model, delta, finish) =>
  'data: ' + JSON.stringify({ id:'mock',object:'chat.completion.chunk',created:1,model,choices:[{index:0,delta,finish_reason:finish}] })+'\n\n'
test('real Qwen reads local fixture and sends tool result to LLM with default approvals', { timeout: 32000 }, async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bccli-tool-loop-'))
  const marker='READ_TOOL_LOOP_MARKER_ONLY'
  const file=path.join(root,'fixture.txt')
  fs.writeFileSync(file,marker+'\n')
  const seen=[]
  let step=0
  const proxy=await startGatewayProxy({key:'FAKE_KEY_FOR_TESTS_ONLY',fetchImpl:async(url,init)=>{
    assert.equal(url,'https://api.botconnector.id/v1/chat/completions')
    const body=JSON.parse(init.body.toString())
    seen.push({tools:body.tools?.map(t=>t.function?.name),roles:body.messages?.map(m=>m.role),toolContent:body.messages?.filter(m=>m.role==='tool').map(m=>m.content)})
    const model=body.model
    let response
    if(step++===0){
      const delta={role:'assistant',tool_calls:[{index:0,id:'call_test_read',type:'function',function:{name:'read_file',arguments:JSON.stringify({file_path:file})}}]}
      response=completion(model,delta,null)+completion(model,{},'tool_calls')+'data: [DONE]\n\n'
    }else{
      response=completion(model,{role:'assistant',content:'READ_TOOL_LOOP_PASS'},null)+completion(model,{},'stop')+'data: [DONE]\n\n'
    }
    return new Response(response,{status:200,headers:{'content-type':'text/event-stream'}})
  }})
  try{
    const env=childEnvironment({...process.env,CI:'true',NO_COLOR:'1',QWEN_CODE_MAX_OUTPUT_TOKENS:'4096'},proxy.token,'ling-3.0-flash',{endpoint:proxy.baseUrl,home:path.join(root,'home')})
    env.QWEN_CODE_SYSTEM_SETTINGS_PATH=path.join(root,'system.json')
    const args=[resolveQwenEntrypoint(),...qwenArguments('ling-3.0-flash','Read fixture.txt using tool, report its content.',proxy.baseUrl)]
    const result=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe']})
      let stdout='',stderr=''
      child.stdout.on('data',b=>stdout+=b)
      child.stderr.on('data',b=>stderr+=b)
      const timer=setTimeout(()=>child.kill(),25000)
      child.once('error',reject)
      child.once('close',(code)=>{clearTimeout(timer);resolve({code,stdout,stderr})})
    })
    console.log('LOOP_OBSERVED='+JSON.stringify({code:result.code,turns:seen.length,readRole:seen[1]?.roles,lastTool:seen[1]?.toolContent?.map(x=>JSON.stringify(x).slice(0,700)),output:result.stdout.slice(-300),error:result.stderr.slice(-270)}))
    assert.equal(result.code,0,result.stderr.slice(-200))
    assert.ok(seen[0].tools?.includes('read_file'),'Qwen must expose read_file tool')
    assert.ok(seen.length>=2,'Qwen must send tool result back to model')
    assert.ok(seen[1].roles?.includes('tool'),'continuation must include tool role')
    assert.ok(JSON.stringify(seen[1].toolContent).includes(marker),'tool result must actually contain file')
    assert.match(result.stdout,/READ_TOOL_LOOP_PASS/)
    assert.equal(fs.readFileSync(file,'utf8'),marker+'\n')
  }finally{await proxy.close();fs.rmSync(root,{recursive:true,force:true})}
})

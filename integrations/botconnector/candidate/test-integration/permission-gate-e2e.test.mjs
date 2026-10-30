import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {childEnvironment,qwenArguments,resolveQwenEntrypoint} from '../core.mjs'
import {startGatewayProxy} from '../proxy.mjs'
const chunk=(model,delta,reason)=>'data: '+JSON.stringify({id:'mock',object:'chat.completion.chunk',created:1,model,choices:[{index:0,delta,finish_reason:reason}]})+'\n\n'
test('Qwen default permissions preserve file without interactive approval', {timeout:35000},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bccli-approval-'))
  const target=path.join(root,'test.txt')
  const original=['one','two','three','four','status=awal','six','seven','eight','nine'].join('\n')+'\n'
  fs.writeFileSync(target,original)
  const turns=[]
  let step=0
  const proxy=await startGatewayProxy({key:'MOCK_ONLY_KEY',fetchImpl:async(url,init)=>{
    const body=JSON.parse(init.body.toString())
    turns.push({roles:body.messages?.map(m=>m.role),toolMessages:body.messages?.filter(m=>m.role==='tool')})
    const model=body.model
    let event
    if(step===0) event=chunk(model,{role:'assistant',tool_calls:[{index:0,id:'call_read',type:'function',function:{name:'read_file',arguments:JSON.stringify({file_path:target})}}]},null)+chunk(model,{},'tool_calls')
    else if(step===1) event=chunk(model,{role:'assistant',tool_calls:[{index:0,id:'call_edit',type:'function',function:{name:'edit',arguments:JSON.stringify({file_path:target,old_string:original,new_string:original.replace('status=awal','status=berhasil')})}}]},null)+chunk(model,{},'tool_calls')
    else event=chunk(model,{role:'assistant',content:'NO_AUTO_EDIT_FINISHED'},null)+chunk(model,{},'stop')
    step++
    return new Response(event+'data: [DONE]\n\n',{status:200,headers:{'content-type':'text/event-stream'}})
  }})
  try {
    const env=childEnvironment({...process.env,CI:'true',NO_COLOR:'1',QWEN_CODE_MAX_OUTPUT_TOKENS:'4096'},proxy.token,'ling-3.0-flash',{endpoint:proxy.baseUrl,home:path.join(root,'home')})
    env.QWEN_CODE_SYSTEM_SETTINGS_PATH=path.join(root,'system.json')
    const args=[resolveQwenEntrypoint(),...qwenArguments('ling-3.0-flash','Read and then edit test.txt; request permission.',proxy.baseUrl)]
    const result=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe']})
      let stdout='',stderr=''
      child.stdout.on('data',d=>stdout+=d)
      child.stderr.on('data',d=>stderr+=d)
      const timer=setTimeout(()=>child.kill(),20000)
      child.once('error',reject)
      child.once('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr})})
    })
    const toolResults=turns.flatMap(t=>t.toolMessages??[])
    const toolText=toolResults.map(t=>JSON.stringify(t.content)).join('\n')
    console.log('APPROVAL_EVIDENCE='+JSON.stringify({code:result.code,modified:fs.readFileSync(target,'utf8')!==original,turns:turns.length,readSucceeded:toolText.includes('status=awal'),editResult:toolText.slice(-520),out:result.stdout.slice(-150),error:result.stderr.slice(-150)}))
    assert.equal(result.code,0)
    assert.ok(toolText.includes('status=awal'), 'read returned actual original content')
    assert.equal(fs.readFileSync(target,'utf8'),original,'editing must not happen without explicit approval')
    assert.ok(turns.length>=3,'edit rejection must feed back to model')
  }finally{await proxy.close();fs.rmSync(root,{recursive:true,force:true})}
})

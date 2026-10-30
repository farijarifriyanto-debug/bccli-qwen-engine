import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {childEnvironment,parseArgs,qwenArguments,resolveQwenEntrypoint} from '../core.mjs'
import {startGatewayProxy} from '../proxy.mjs'

const chunk=(model,delta,reason)=>'data: '+JSON.stringify({id:'mock',object:'chat.completion.chunk',created:1,model,choices:[{index:0,delta,finish_reason:reason}]})+'\n\n'

test('real Qwen resumes last project session without a second BotConnector session store', {timeout:35000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bccli-qwen-resume-'))
 const observed=[]
 let phase=1
 const proxy=await startGatewayProxy({key:'FAKE_GATEWAY_KEY',fetchImpl:async(_url,init)=>{
   const body=JSON.parse(init.body.toString())
   observed.push({phase,roles:body.messages?.map(m=>m.role),hasPriorPrompt:JSON.stringify(body.messages).includes('SESSION_START_MARKER')})
   const content=phase===1?'SESSION_FIRST_OK':'SESSION_RESUME_OK'
   return new Response(chunk(body.model,{role:'assistant',content},null)+chunk(body.model,{},'stop')+'data: [DONE]\n\n',
     {status:200,headers:{'content-type':'text/event-stream'}})
 }})
 async function run(prompt,continueSession){
   const env=childEnvironment({...process.env,CI:'true',NO_COLOR:'1',QWEN_CODE_MAX_OUTPUT_TOKENS:'4096'},
     proxy.token,'ling-3.0-flash',{endpoint:proxy.baseUrl,home:path.join(root,'home')})
   env.QWEN_CODE_SYSTEM_SETTINGS_PATH=path.join(root,'system.json')
   // Use the public BCCLI -c alias for the real resume continuation,
   // rather than bypassing the new CLI parser in this upstream E2E.
   const parsed = continueSession ? parseArgs(['-c',prompt]) : parseArgs(['run',prompt])
   const args=[resolveQwenEntrypoint(),...qwenArguments('ling-3.0-flash',parsed.prompt,proxy.baseUrl,{continueSession:parsed.command==='resume'})]
   return new Promise((resolve,reject)=>{
     const child=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe']})
     let stdout='',stderr=''
     child.stdout.on('data',d=>stdout+=d); child.stderr.on('data',d=>stderr+=d)
     const timer=setTimeout(()=>child.kill(),18000)
     child.once('error',reject)
     child.once('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr})})
   })
 }
 try{
   const first=await run('Say SESSION_FIRST_OK after reading SESSION_START_MARKER.',false)
   phase=2
   const second=await run('Remember the previous prompt. Say SESSION_RESUME_OK.',true)
   assert.equal(first.code,0,first.stderr.slice(-200))
   assert.equal(second.code,0,second.stderr.slice(-200))
   assert.match(first.stdout,/SESSION_FIRST_OK/)
   assert.match(second.stdout,/SESSION_RESUME_OK/)
   assert.equal(observed.length,2)
   assert.equal(observed[1].hasPriorPrompt,true,'last session context must be resumed')
   assert.deepEqual(observed[1].roles,['system','user','assistant','user'])
 }finally{await proxy.close();fs.rmSync(root,{recursive:true,force:true})}
})

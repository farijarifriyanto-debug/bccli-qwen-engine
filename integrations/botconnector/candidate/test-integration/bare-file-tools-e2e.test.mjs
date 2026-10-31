import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { childEnvironment, qwenArguments, resolveQwenEntrypoint } from '../core.mjs'
import { prepareBrandedQwen } from '../branding.mjs'
import { startGatewayProxy } from '../proxy.mjs'

const sse=(model,delta,finish)=>'data: '+JSON.stringify({id:'local-test',object:'chat.completion.chunk',created:1,model,choices:[{index:0,delta,finish_reason:finish}]})+'\n\n'
function agentReply(model, name, args) {
 const chunk={role:'assistant',tool_calls:[{index:0,id:'call_test_'+name,type:'function',function:{name,arguments:JSON.stringify(args)}}]}
 return sse(model,chunk,null)+sse(model,{},'tool_calls')+'data: [DONE]\n\n'
}
const finalReply=(model,text)=>sse(model,{role:'assistant',content:text},null)+sse(model,{},'stop')+'data: [DONE]\n\n'

async function runFixture({ fixture, task, steps, approvalMode = 'default' }) {
 const workspace=mkdtempSync(path.join(os.tmpdir(),'bccli-p0-tool-'))
 const home=path.join(workspace,'isolated-home')
 const seen=[]
 let index=0
 const proxy=await startGatewayProxy({key:'DUMMY_IN_MEMORY_ONLY',fetchImpl:async(url,init)=>{
  assert.equal(url,'https://api.botconnector.id/v1/chat/completions')
  const body=JSON.parse(init.body.toString())
  seen.push(body)
  const next=steps[Math.min(index++,steps.length-1)]
  const data=next.type==='tool'?agentReply(body.model,next.name,next.args(workspace)):finalReply(body.model,next.text)
  return new Response(data,{status:200,headers:{'content-type':'text/event-stream'}})
 }})
 try{
  fixture(workspace)
  const env=childEnvironment({...process.env,CI:'true',NO_COLOR:'1',QWEN_CODE_MAX_OUTPUT_TOKENS:'4096'},proxy.token,'ling-3.0-flash',{endpoint:proxy.baseUrl,home})
  env.QWEN_CODE_SYSTEM_SETTINGS_PATH=path.join(workspace,'system.json')
  const entry=prepareBrandedQwen(resolveQwenEntrypoint())
  // Retain explicit legacy-mode regression coverage; the default BCCLI launcher
  // now uses full mode without --bare.
  const args=[entry,'--bare',...qwenArguments('ling-3.0-flash',task,proxy.baseUrl,{projectDir:workspace})]
  assert.ok(args.includes('--bare'))
  const approvalIndex = args.indexOf('--approval-mode')
  assert.notEqual(approvalIndex, -1)
  args[approvalIndex + 1] = approvalMode
  assert.equal(args[approvalIndex + 1], approvalMode)
  const result=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,args,{cwd:workspace,env,stdio:['ignore','pipe','pipe']})
   let stdout='',stderr=''
   child.stdout.on('data',b=>stdout+=b)
   child.stderr.on('data',b=>stderr+=b)
   const timer=setTimeout(()=>child.kill(),35000)
   child.once('error',reject)
   child.once('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr})})
  })
  return { seen,result,workspace }
 }catch(err){rmSync(workspace,{recursive:true,force:true});throw err}
 finally{await proxy.close()}
}
test('BCCLI bare mode exposes file-create/search tools to model and searches a real fixture', {timeout:55000},async()=>{
 const data=await runFixture({
  fixture:root=>{writeFileSync(path.join(root,'main.py'),'LIVE_PORTFOLIO = True\n');writeFileSync(path.join(root,'AGENTS.md'),'PROJECT_TOOL_GUIDANCE_TEST_MARKER: Use glob and grep before changing files.\n')},
  task:'Locate Python code using glob then grep_search.',
  steps:[
   {type:'tool',name:'glob',args:root=>({pattern:'*.py',path:root})},
   {type:'tool',name:'grep_search',args:root=>({pattern:'LIVE_PORTFOLIO',path:root,glob:'*.py'})},
   {type:'final',text:'SEARCH_TOOL_SMOKE_PASS'},
  ],
 })
 try{
  assert.match(JSON.stringify(data.seen[0].messages),/PROJECT_TOOL_GUIDANCE_TEST_MARKER/,'AGENTS.md must enter active model context under bare mode')
  const names=data.seen[0].tools?.map(x=>x.function?.name)||[]
  for(const name of ['read_file','write_file','edit','run_shell_command','glob','grep_search'])assert.ok(names.includes(name),'missing: '+name)
  assert.equal(data.result.code,0,data.result.stderr)
  const contents=JSON.stringify(data.seen.slice(1).flatMap(v=>v.messages?.filter(m=>m.role==='tool').map(m=>m.content)||[]))
  assert.match(contents,/main\.py/)
  assert.match(contents,/LIVE_PORTFOLIO/)
  assert.match(data.result.stdout,/SEARCH_TOOL_SMOKE_PASS/)
  assert.deepEqual(names.filter(name=>['secret_get','remote_exec','sandbox_exec'].includes(name)),[])
 }finally{rmSync(data.workspace,{recursive:true,force:true})}
})

test('headless default approval denies unauthorized write_file; existing user file remains intact', {timeout:55000},async()=>{
 const marker='USER_OWNED_DO_NOT_OVERWRITE'
 const data=await runFixture({
  fixture:root=>writeFileSync(path.join(root,'account.txt'),marker),
  task:'Attempt write_file to account.txt, awaiting approval.',
  steps:[
   {type:'tool',name:'write_file',args:root=>({file_path:path.join(root,'account.txt'),content:'NOT_AUTHORIZED'})},
   {type:'final',text:'APPROVAL_GATE_CHECKED'},
  ],
 })
 try{
  assert.equal(readFileSync(path.join(data.workspace,'account.txt'),'utf8'),marker)
  assert.equal(data.result.code,0,data.result.stderr)
  assert.match(data.result.stdout,/APPROVAL_GATE_CHECKED/)
  const response=JSON.stringify(data.seen.slice(1).flatMap(v=>v.messages?.filter(m=>m.role==='tool').map(m=>m.content)||[]))
  assert.ok(response.length>0,'engine must provide tool denial feedback')
  assert.doesNotMatch(readFileSync(path.join(data.workspace,'account.txt'),'utf8'),/NOT_AUTHORIZED/)
 }finally{rmSync(data.workspace,{recursive:true,force:true})}
})


test('apply_patch is advertised in --bare and headless approval cannot overwrite user code', {timeout:55000},async()=>{
 const data=await runFixture({
  fixture:root=>writeFileSync(path.join(root,'source.py'),'name = "original"\n'),
  task:'Use apply_patch to change the existing Python file, pending approval.',
  steps:[
   {type:'tool',name:'apply_patch',args:root=>({file_path:path.join(root,'source.py'),replacements:[{old_text:'name = "original"',new_text:'name = "changed"'}]})},
   {type:'final',text:'PATCH_APPROVAL_CHECKED'},
  ],
 })
 try{
  const toolNames=data.seen[0].tools?.map(x=>x.function?.name)||[]
  assert.ok(toolNames.includes('apply_patch'),'model must see apply_patch, not shell workaround')
  assert.equal(readFileSync(path.join(data.workspace,'source.py'),'utf8'),'name = "original"\n','unattended call must not write')
  assert.equal(data.result.code,0,data.result.stderr)
  assert.match(data.result.stdout,/PATCH_APPROVAL_CHECKED/)
  assert.ok(data.seen.length>=2,'denial or error must be returned to the model')
 } finally {rmSync(data.workspace,{recursive:true,force:true})}
})


test('isolated fixture with explicit auto-edit permission executes an actual multi-hunk apply_patch', {timeout:55000},async()=>{
 const data=await runFixture({
  fixture:root=>writeFileSync(path.join(root,'calculation.py'),'amount = 1\nprint(amount)\n'),
  task:'Read calculation.py, then update it with apply_patch.',
  approvalMode:'auto-edit',
  steps:[
   {type:'tool',name:'read_file',args:root=>({file_path:path.join(root,'calculation.py')})},
   {type:'tool',name:'apply_patch',args:root=>({file_path:path.join(root,'calculation.py'),replacements:[
    {old_text:'amount = 1',new_text:'amount = 2'},
    {old_text:'print(amount)',new_text:'print(amount * 2)'},
   ]})},
   {type:'final',text:'PATCH_WITH_EXPLICIT_AUTO_EDIT_COMPLETE'},
  ],
 })
 try{
  assert.equal(data.result.code,0,data.result.stderr)
  assert.match(data.result.stdout,/PATCH_WITH_EXPLICIT_AUTO_EDIT_COMPLETE/)
  assert.equal(readFileSync(path.join(data.workspace,'calculation.py'),'utf8'),'amount = 2\nprint(amount * 2)\n',
    'tool outputs: '+JSON.stringify(data.seen.slice(1).flatMap(v=>v.messages?.filter(m=>m.role==='tool').map(m=>m.content)||[])).slice(-1200))
  const responses=JSON.stringify(data.seen.slice(1).flatMap(v=>v.messages?.filter(m=>m.role==='tool').map(m=>m.content)||[]))
  assert.match(responses,/\\"ok\\":true/,'tool must report actual successful commit')
 }finally{rmSync(data.workspace,{recursive:true,force:true})}
})


test('auto-edit does not allow apply_patch before the agent read_file', {timeout:55000},async()=>{
 const data=await runFixture({
  fixture:root=>writeFileSync(path.join(root,'untouched.py'),'PINNED = True\n'),
  task:'Attempt patch without reading the file first.',
  approvalMode:'auto-edit',
  steps:[
   {type:'tool',name:'apply_patch',args:root=>({file_path:path.join(root,'untouched.py'),replacements:[{old_text:'PINNED = True',new_text:'PINNED = False'}]})},
   {type:'final',text:'PRIOR_READ_DENIAL_TESTED'},
  ],
 })
 try{
  assert.equal(data.result.code,0,data.result.stderr)
  assert.equal(readFileSync(path.join(data.workspace,'untouched.py'),'utf8'),'PINNED = True\n')
  const responses=JSON.stringify(data.seen.slice(1).flatMap(v=>v.messages?.filter(m=>m.role==='tool').map(m=>m.content)||[]))
  assert.ok(responses.length>2,'agent receives tool denial')
  assert.doesNotMatch(responses,/\\\\\"ok\\\\\":true/)
 }finally{rmSync(data.workspace,{recursive:true,force:true})}
})

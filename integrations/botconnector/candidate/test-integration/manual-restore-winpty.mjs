// Manual Windows-only interactive upstream restore proof: fake gateway, temp project,
// per-command approval and checkpoint restoration. Do NOT add to default CI test glob.
// Tested on Windows with Node 22.23.4 and Qwen Code 0.26.3; PTY exit may be nonzero
// due to WinPTY AttachConsole teardown even when file restore succeeds.
import {createRequire} from 'node:module'
import {dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {tmpdir} from 'node:os'
import fs from 'node:fs'
import {childEnvironment,qwenArguments,resolveQwenEntrypoint} from '../core.mjs'
import {startGatewayProxy} from '../proxy.mjs'
const candidateRoot=dirname(dirname(fileURLToPath(import.meta.url)))
const pkg=join(candidateRoot,'node_modules','@qwen-code','qwen-code','package.json')
const pty=createRequire(pkg)('@lydell/node-pty')
const root=fs.mkdtempSync(join(tmpdir(),'bccli-restore-interactive-'))
if(process.platform!=='win32' || !process.versions.node.startsWith('22.')) throw Error('This manual PTY probe requires Windows and Node 22.')
const node=process.execPath
const file=join(root,'test.txt')
const original=['one','two','three','four','status=awal','six','seven','eight','nine'].join('\n')+'\n'
fs.writeFileSync(file,original)
let requests=0
const chunk=(model,delta,reason)=>'data: '+JSON.stringify({id:'mock',object:'chat.completion.chunk',created:1,model,choices:[{index:0,delta,finish_reason:reason}]})+'\n\n'
const proxy=await startGatewayProxy({key:'FAKE_ONLY',fetchImpl:async(url,init)=>{
 const body=JSON.parse(init.body.toString())
 let response
 if(requests++===0){
   response=chunk(body.model,{role:'assistant',tool_calls:[{index:0,id:'call_read',type:'function',function:{name:'read_file',arguments:JSON.stringify({file_path:file})}}]},null)+chunk(body.model,{},'tool_calls')
 }else if(requests===2){
   response=chunk(body.model,{role:'assistant',tool_calls:[{index:0,id:'call_edit',type:'function',function:{name:'edit',arguments:JSON.stringify({file_path:file,old_string:original,new_string:original.replace('status=awal','status=berhasil')})}}]},null)+chunk(body.model,{},'tool_calls')
 }else response=chunk(body.model,{role:'assistant',content:'EDIT_COMPLETED'},null)+chunk(body.model,{},'stop')
 console.log('MOCK_LLM_TURN='+requests)
 return new Response(response+'data: [DONE]\n\n',{status:200,headers:{'content-type':'text/event-stream'}})
}})
const env=childEnvironment({...process.env,TERM:'xterm-256color',COLORTERM:'truecolor',QWEN_CODE_MAX_OUTPUT_TOKENS:'4096'},proxy.token,'ling-3.0-flash',{endpoint:proxy.baseUrl,home:join(root,'qwenhome')})
env.QWEN_CODE_SYSTEM_SETTINGS_PATH=join(root,'system.json')
const args=[resolveQwenEntrypoint(),...qwenArguments('ling-3.0-flash',undefined,proxy.baseUrl),'--prompt-interactive','Read and then edit test.txt by changing status=awal to status=berhasil.']
let all='',ended=false
const child=pty.spawn(node,args,{cwd:root,cols:100,rows:30,env,name:'xterm-256color',useConpty:false})
child.onData((data)=>{all+=data;if(all.length>200000)all=all.slice(-100000)})
function snapshot(){return all.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g,'').replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g,'').replace(/[\x00-\x08\x0b-\x1f]/g,'').slice(-1700)}
child.onExit(({exitCode})=>{ended=true;console.log('TTY_EXIT='+exitCode+' MODIFIED='+fs.readFileSync(file,'utf8').includes('status=berhasil'))})
setTimeout(()=>{if(!ended){console.log('SEND_APPROVE_ONCE');child.write('1\
')}},7300)
setTimeout(()=>{if(!ended){console.log('SEND_RESTORE');child.write('/restore\
')}},15400)
setTimeout(()=>{if(!ended){console.log('SEND_CONFIRM_RESTORE');child.write('\r')}},19400)
setTimeout(()=>{if(!ended){const match=snapshot().match(/Available tool calls to restore:\s*(\S+)/); if(match){console.log('RESTORE_ID='+match[1]);child.write('/restore '+match[1]+'\r')}else{console.log('RESTORE_ID_MISSING')}}},25500)
setTimeout(()=>{if(!ended){console.log('SEND_RESTORE_ID_CONFIRM');child.write('\r')}},28400)
for(const [t,label] of [[6500,'FIRST'],[11000,'SECOND'],[17800,'THIRD'],[24000,'FOURTH'],[31500,'FIFTH'],[35500,'SIXTH']]){
 setTimeout(()=>{console.log('SCREEN_'+label+'='+JSON.stringify(snapshot()));console.log('FILE_'+label+'='+fs.readFileSync(file,'utf8').trim())},t)
}
setTimeout(()=>{if(!ended){child.kill();console.log('TERMINATED_NO_CLEANUP')}},39000)
setTimeout(()=>{proxy.close().catch(()=>{});fs.rmSync(root,{force:true,recursive:true})},42500)

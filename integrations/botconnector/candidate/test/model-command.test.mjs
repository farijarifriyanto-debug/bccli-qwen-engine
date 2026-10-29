import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { BCCLI_MODEL_COMMAND } from '../model-command.mjs'

function createCommand({ data = [{id:'ling-3.0-flash'},{id:'kimi-k2.7-code'},{id:'glm-5.3-flash'}], responseStatus=200 }={}) {
  const fetched=[]
  const state={model:'ling-3.0-flash', switches:[]}
  const env={OPENAI_BASE_URL:'http://127.0.0.1:23456/v1',OPENAI_API_KEY:'ONLY_SHORT_LIVED_LOCAL_TOKEN',OPENAI_MODEL:'ling-3.0-flash'}
  const fetch=async(url,opts)=>{
    fetched.push({url,opts})
    return {ok:responseStatus===200,status:responseStatus,json:async()=>({data})}
  }
  const command=vm.runInNewContext(BCCLI_MODEL_COMMAND+'\nmodelCommand', {
    process:{env},fetch,AbortSignal,Map,Number,RegExp,String,Error,
    __name:(value)=>value,
  })
  function call(args) {
    const config={getModel:()=>state.model,async setModel(id,meta){state.switches.push([id,meta.reason]);state.model=id}}
    return command.action({services:{config},invocation:{args}},args)
  }
  return {call,fetched,state,env}
}
test('in-terminal /model uses authenticated localhost catalog and changes live Config',async()=>{
  const x=createCommand()
  const menu=await x.call('')
  assert.equal(menu.type,'message')
  assert.match(menu.content,/1\. glm-5\.3-flash/)
  assert.match(menu.content,/2\. kimi-k2\.7-code/)
  assert.match(menu.content,/3\. ling-3\.0-flash/)
  const selected=await x.call('2')
  assert.match(selected.content,/Switched to kimi-k2\.7-code/)
  assert.equal(x.state.model,'kimi-k2.7-code')
  assert.equal(x.state.switches[0][1],'bccli-gateway-model-picker')
  assert.equal(x.fetched.length,2)
  assert.deepEqual(x.fetched.map(f=>f.url),Array(2).fill('http://127.0.0.1:23456/v1/models'))
  assert.equal(x.fetched[0].opts.headers.Authorization,'Bearer ONLY_SHORT_LIVED_LOCAL_TOKEN')
})
test('reject unavailable/unsafe model IDs; never switch providers or reveal key', async()=>{
  const x=createCommand()
  for(const input of ['not-eligible','999','../../abc','--provider=alibaba']){
    const answer=await x.call(input)
    assert.equal(answer.messageType,'error')
    assert.equal(x.state.model,'ling-3.0-flash')
    assert.ok(!JSON.stringify(answer).includes(x.env.OPENAI_API_KEY))
  }
  assert.equal(x.state.switches.length,0)
})
test('filter and paginate account-specific models inside the terminal',async()=>{
  const x=createCommand({data:Array.from({length:26},(_,i)=>({id:'valid-'+String(i+1).padStart(2,'0')}))})
  const second=await x.call('page 2')
  assert.match(second.content,/page 2\/3/)
  assert.match(second.content,/13\. valid-13/)
  const found=await x.call('search valid-24')
  assert.match(found.content,/1\. valid-24/)
  const switchAfterFilter=await x.call('1')
  assert.match(switchAfterFilter.content,/Switched to valid-24/)
  assert.equal(x.state.model,'valid-24')
  const wrong=await x.call('page 8')
  assert.equal(wrong.messageType,'error')
})
test('fail closed for unavailable gateway, malformed models and external routing',async()=>{
  const offline=createCommand({responseStatus:503})
  assert.match((await offline.call('')).content,/unavailable/)
  const empty=createCommand({data:[{id:'../../unsafe'}]})
  assert.equal((await empty.call('')).messageType,'error')
  const x=createCommand()
  x.env.OPENAI_BASE_URL='https://alibaba.example/v1'
  assert.match((await x.call('')).content,/authenticated local BotConnector Gateway/)
  assert.equal(x.fetched.length,0)
})

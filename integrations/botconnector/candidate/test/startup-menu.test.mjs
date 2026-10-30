import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'
import { startupMenu, PROVIDER_SWITCH_EXIT } from '../startup-menu.mjs'
import { guardUpstreamProviderCommands } from '../branding.mjs'
import vm from 'node:vm'

test('startup menu adds provider key inside parent and selects a model without a shell command',async()=>{
  const outputs=[]
  const answers=['2','?gpt','2']
  const events=[]
  const configuredKeys=new Set(['botconnector'])
  const all=[{id:'gpt-4.1',name:'GPT 4.1'},{id:'gpt-4.1-mini',name:'GPT mini'},{id:'other'}]
  const selection=await startupMenu({
    ask:async()=>answers.shift(),
    askSecret:async()=> 'FAKE_SECRET_TEST_ONLY',
    out:s=>outputs.push(s),
    currentProvider:()=> 'botconnector',
    configured:id=>configuredKeys.has(id),
    saveKey:(id,key)=>{events.push(['save',id,key]);configuredKeys.add(id)},
    use:id=>events.push(['active',id]),
    resolve:id=>({id,key:'FAKE_SECRET_TEST_ONLY',endpoint:'https://api.openai.com/v1'}),
    list:async({key,endpoint})=>{
      assert.equal(key,'FAKE_SECRET_TEST_ONLY')
      assert.equal(endpoint,'https://api.openai.com/v1')
      return all
    },
  })
  assert.equal(selection.providerId,'openai')
  assert.equal(selection.model,'gpt-4.1-mini')
  assert.deepEqual(events,[['save','openai','FAKE_SECRET_TEST_ONLY'],['active','openai']])
  assert.doesNotMatch(outputs.join(' '),/FAKE_SECRET_TEST_ONLY/)
})

test('menu refuses an invalid choice and never silently switches provider',async()=>{
  const outputs=[]
  const answers=['88','1','']
  const selected=[]
  const value=await startupMenu({
    ask:async()=>answers.shift(),
    out:s=>outputs.push(s),
    currentProvider:()=> 'botconnector',
    configured:id=>id==='botconnector',
    use:id=>selected.push(id),
    resolve:()=>({key:'FAKE',endpoint:'https://api.botconnector.id/v1'}),
    list:async()=>[{id:'ling-3.0-flash'}],
  })
  assert.equal(value.model,'ling-3.0-flash')
  assert.deepEqual(selected,['botconnector'])
  assert.ok(outputs.some(s=>s.includes('tidak dikenal')))
})

test('wrong or missing key aborts before switching or sending AI',async()=>{
  const events=[]
  await assert.rejects(
    startupMenu({
      ask:async()=> '3',
      askSecret:async()=>undefined,
      currentProvider:()=> 'botconnector',
      configured:id=>id==='botconnector',
      use:id=>events.push(id),
      resolve:()=>{throw Error('must not resolve')},
      out:()=>{},
    }),
    /Tidak ada API key/,
  )
  assert.equal(events.length,0)
})

test('real upstream /provider and /auth aliases transfer control to parent menu',()=>{
  const require=createRequire(import.meta.url)
  const filename=join(dirname(require.resolve('@qwen-code/qwen-code/package.json')),'chunks/chunk-7L4WTOM2.js')
  const original=readFileSync(filename,'utf8')
  const patched=guardUpstreamProviderCommands(original)
  const begin=patched.indexOf('var authCommand=')
  const end=patched.indexOf(',"action")};',begin)
  assert.ok(begin > 0)
  assert.ok(end > begin)
  const code=patched.slice(begin,end+11)
  let exitCode
  const command=vm.runInNewContext(code+'\nauthCommand', {process:{exit:v=>{exitCode=v}},__name:f=>f})
  assert.ok(command.altNames.includes('provider'))
  command.action({executionMode:'interactive'})
  assert.equal(exitCode,PROVIDER_SWITCH_EXIT)
  exitCode=undefined
  assert.equal(command.action({executionMode:'non_interactive'}).messageType,'error')
  assert.equal(exitCode,undefined)
})
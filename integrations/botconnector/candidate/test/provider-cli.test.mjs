import assert from 'node:assert/strict'
import test from 'node:test'
import { runProviderCommand } from '../provider-cli.mjs'

test('provider add saves hidden key then selects only named provider without printing secrets',async()=>{
 const events=[],messages=[]
 const deps={
  env:{},getKey:async()=> 'FAKE_PROVIDER_SECRET_NOT_REAL',
  save:(id,key)=>events.push(['save',id,key]),select:id=>events.push(['use',id]),
  out:text=>messages.push(text),
 }
 assert.equal(await runProviderCommand(['add','openrouter'],deps),0)
 assert.deepEqual(events,[['save','openrouter','FAKE_PROVIDER_SECRET_NOT_REAL'],['use','openrouter']])
 assert.equal(messages.join(' ').includes('FAKE_PROVIDER_SECRET_NOT_REAL'),false)
 assert.match(messages.join(' '),/no AI request/i)
})

test('provider list is informational, never returns stored API keys',async()=>{
 const messages=[]
 const deps={
  env:{},
  configured:(id)=>id==='openrouter',
  active:()=> 'openrouter',
  out:text=>messages.push(text),
 }
 assert.equal(await runProviderCommand(['list'],deps),0)
 const text=messages.join('\n')
 assert.match(text,/openrouter.*configured.*ACTIVE/)
 assert.match(text,/botconnector.*no key/)
 assert.doesNotMatch(text,/sk-or-|FAKE_PROVIDER_SECRET/)
 assert.match(text,/bccli provider add openrouter/)
 assert.match(text,/bccli provider use openrouter/)
 assert.doesNotMatch(text,/bccli-preview provider/)
})

test('provider use and remove operate only with explicitly validated IDs',async()=>{
 const events=[],out=[]
 const deps={
  env:{},select:(id)=>events.push('use:'+id),remove:id=>events.push('remove:'+id),
  out:msg=>out.push(msg),
 }
 assert.equal(await runProviderCommand(['use','openai'],deps),0)
 assert.equal(await runProviderCommand(['remove','openai'],deps),0)
 assert.deepEqual(events,['use:openai','remove:openai'])
 await assert.rejects(runProviderCommand(['add','https://evil.example'],deps),/Unknown provider/)
 await assert.rejects(runProviderCommand(['add','botconnector'],deps),/"bccli-legacy login/)
 await assert.rejects(runProviderCommand(['add','openrouter','--key','LEAKED'],deps),/Use: provider/)
 await assert.rejects(runProviderCommand(['remove'],deps),/Use: provider/)
 await assert.rejects(runProviderCommand(['use','openai','other'],deps),/Use: provider/)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveProviderKey, storedProviderKey, resolveProvider, isConfigured, botConnectorProviderStatus } from '../providers.mjs'
import { startupMenu } from '../startup-menu.mjs'
import { GATEWAY } from '../gateway.mjs'

// Fake DPAPI runner exists ONLY in isolated tests; no real owner credential is used.
const fakeRunner = (_shell, args, opts) => {
  const script = args.at(-1)
  const encrypt = script.includes('ConvertFrom-SecureString -SecureString')
  const decrypt = script.includes('SecureStringToBSTR')
  if (!encrypt && !decrypt) throw Error('Unexpected fake DPAPI command')
  return {status:0,stdout:encrypt
    ? Buffer.from(opts.input,'utf8').toString('hex')
    : Buffer.from(opts.input.trim(),'hex').toString('utf8')}
}

test('new BCCLI key overrides but never modifies legacy login', () => {
  const root=mkdtempSync(join(tmpdir(),'bccli-new-key-test-'))
  const legacy=mkdtempSync(join(tmpdir(),'bccli-legacy-key-test-'))
  try {
    const oldPath=join(legacy,'credentials')
    const original='{"bc-cloud":"FAKE_LEGACY_KEY","other":"preserve"}'
    writeFileSync(oldPath,original)
    const env={ BCCLI_HOME:legacy, BCCLI_PREVIEW_HOME:root }
    assert.equal(resolveProvider('botconnector',{env,root,platform:'win32',runner:fakeRunner}).key,'FAKE_LEGACY_KEY')
    assert.equal(botConnectorProviderStatus({env,root}).source,'public-bccli')

    saveProviderKey('botconnector','FAKE_NEW_BC_KEY',{root,platform:'win32',runner:fakeRunner})
    const blob=readFileSync(join(root,'provider-botconnector.dpapi'),'utf8')
    assert.doesNotMatch(blob,/FAKE_NEW_BC_KEY/)
    assert.match(blob,/^[0-9a-f]+\s*$/)
    assert.equal(storedProviderKey('botconnector',{root,platform:'win32',runner:fakeRunner}),'FAKE_NEW_BC_KEY')
    assert.equal(isConfigured('botconnector',{env,root}),true)
    assert.deepEqual(botConnectorProviderStatus({env,root}),{configured:true,source:'encrypted-bccli'})
    assert.equal(resolveProvider('botconnector',{env,root,platform:'win32',runner:fakeRunner}).key,'FAKE_NEW_BC_KEY')
    assert.equal(resolveProvider('botconnector',{env:{...env,BOTCONNECTOR_API_KEY:'FAKE_STALE_ENV'},root,platform:'win32',runner:fakeRunner}).key,'FAKE_NEW_BC_KEY')
    assert.equal(readFileSync(oldPath,'utf8'),original)

    // Replacing through the owner's menu uses isolated DPAPI, not public ~/.bccli.
    saveProviderKey('botconnector','FAKE_REPLACEMENT_KEY',{root,platform:'win32',runner:fakeRunner})
    assert.equal(resolveProvider('botconnector',{env,root,platform:'win32',runner:fakeRunner}).key,'FAKE_REPLACEMENT_KEY')
    assert.equal(readFileSync(oldPath,'utf8'),original)

    // Corruption must NOT silently fall back to a legacy or environment key.
    writeFileSync(join(root,'provider-botconnector.dpapi'),'bad!')
    assert.throws(()=>resolveProvider('botconnector',{env,root,platform:'win32',runner:fakeRunner}),/invalid/i)
    assert.equal(readFileSync(oldPath,'utf8'),original)
  } finally {
    rmSync(root,{recursive:true,force:true})
    rmSync(legacy,{recursive:true,force:true})
  }
})

test('first-run BotConnector menu asks for hidden key and selects valid model',async()=>{
  const outputs=[],events=[],keys=new Set()
  const choice=await startupMenu({
    ask:(()=>{const ans=['1','']; return async()=>ans.shift()})(),
    askSecret:async()=> 'FAKE_NEW_BC_SECRET',
    configured:id=>keys.has(id),
    currentProvider:()=> 'botconnector',
    saveKey:(id,key)=>{assert.equal(key,'FAKE_NEW_BC_SECRET');keys.add(id);events.push('save:'+id)},
    use:id=>events.push('use:'+id),
    resolve:()=>({key:'FAKE_NEW_BC_SECRET',endpoint:GATEWAY}),
    list:async()=>[{id:'ling-3.0-flash'}],
    out:text=>outputs.push(text)
  })
  assert.equal(choice.providerId,'botconnector')
  assert.equal(choice.model,'ling-3.0-flash')
  assert.deepEqual(events,['save:botconnector','use:botconnector'])
  assert.ok(!outputs.join(' ').includes('FAKE_NEW_BC_SECRET'))
  assert.ok(!outputs.join(' ').includes('bccli-legacy'))
})

test('BotConnector key replacement is explicit and cancellation never overwrites',async()=>{
  const outputs=[],events=[]
  await assert.rejects(startupMenu({
    ask:async()=> '1!',
    askSecret:async()=>undefined,
    configured:id=>id==='botconnector',
    currentProvider:()=> 'botconnector',
    saveKey:()=>events.push('save'),
    use:()=>events.push('use'),
    resolve:()=>{throw Error('must not resolve')},
    out:x=>outputs.push(x)
  }),/Tidak ada API key/)
  assert.deepEqual(events,[])
  assert.ok(!outputs.join(' ').includes('bccli-legacy'))
  const events2=[]
  const choice=await startupMenu({
    ask:(()=>{const a=['1!',''];return async()=>a.shift()})(),
    askSecret:async()=> 'FAKE_REPLACEMENT_KEY',
    configured:id=>id==='botconnector',
    currentProvider:()=> 'botconnector',
    saveKey:id=>events2.push('save:'+id),
    use:id=>events2.push('use:'+id),
    resolve:()=>({key:'FAKE_REPLACEMENT_KEY',endpoint:GATEWAY}),
    list:async()=>[{id:'ling-3.0-flash'}],
    out:()=>{}
  })
  assert.equal(choice.model,'ling-3.0-flash')
  assert.deepEqual(events2,['save:botconnector','use:botconnector'])
})

test('Windows DPAPI encrypts an actual BotConnector preview credential for the current user', { skip:process.platform!=='win32' || process.env.CI==='true' }, () => {
  const root=mkdtempSync(join(tmpdir(),'bccli-botconnector-dpapi-owner-test-'))
  try {
    const secret='FAKE_TEST_ONLY_BOTCONNECTOR_KEY'
    saveProviderKey('botconnector',secret,{root})
    const onDisk=readFileSync(join(root,'provider-botconnector.dpapi'),'utf8')
    assert.doesNotMatch(onDisk,/FAKE_TEST_ONLY_BOTCONNECTOR_KEY/)
    assert.match(onDisk,/^[0-9a-f]+\\s*$/i)
    assert.equal(storedProviderKey('botconnector',{root}),secret)
  } finally { rmSync(root,{recursive:true,force:true}) }
})

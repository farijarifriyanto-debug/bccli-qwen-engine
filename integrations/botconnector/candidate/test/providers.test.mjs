import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PROVIDERS, ALLOWED_PROVIDER_ENDPOINTS, providerRoot, providerDefinition,
  saveProviderKey, storedProviderKey, isConfigured, selectedProvider,
  useProvider, removeProvider, resolveProvider, selectedModel, saveSelectedModel,
} from '../providers.mjs'
import { startGatewayProxy } from '../proxy.mjs'
import { childEnvironment, parseArgs } from '../core.mjs'

test('preset endpoints have fixed HTTPS origins and disallow arbitrary providers', () => {
  for (const [id, config] of Object.entries(PROVIDERS)) {
    assert.equal(config.endpoint.startsWith('https://'), true, id)
    assert.equal(new URL(config.endpoint).username, '')
    assert.equal(new URL(config.endpoint).password, '')
    assert.equal(ALLOWED_PROVIDER_ENDPOINTS.includes(config.endpoint), true)
  }
  assert.throws(() => providerDefinition('http://127.0.0.1'), /Unknown provider/)
  assert.throws(() => providerDefinition('__proto__'), /Unknown provider/)
  assert.throws(() => providerRoot({env:{BCCLI_PREVIEW_HOME:'relative/config'}}), /absolute/)
})

test('provider management command parses as command not a paid AI prompt', () => {
  assert.deepEqual(parseArgs(['provider','add','openrouter']), {command:'provider',model:undefined,json:false,prompt:'add openrouter'})
  assert.deepEqual(parseArgs(['provider','list']), {command:'provider',model:undefined,json:false,prompt:'list'})
  assert.equal(parseArgs(['chat','--provider','openai','-m','gpt-4.1']).provider,'openai')
  assert.equal(parseArgs(['models','--provider','openrouter']).provider,'openrouter')
  assert.throws(() => parseArgs(['provider','add','openrouter','--model','secret']), /Use: provider/)
  assert.throws(() => parseArgs(['-p','provider','add','openrouter']), /only supports a single headless run/)
  assert.throws(() => parseArgs(['-m','x','provider','add']), /No AI request was sent/)
  assert.throws(() => parseArgs(['--provider']), /requires exactly one/)
  assert.throws(() => parseArgs(['chat','--provider','--model','x']), /requires exactly one/)
})

test('Windows DPAPI encrypts key for current user; provider selection is isolated', {skip:process.platform!=='win32'||process.env.CI==='true'}, () => {
  const root=mkdtempSync(join(tmpdir(),'bccli-preview-provider-test-'))
  const secret='FAKE_TEST_PROVIDER_KEY_NEVER_REAL_123'
  const env={BCCLI_PREVIEW_HOME:root,BOTCONNECTOR_API_KEY:'FAKE_BC_TEST_ONLY'}
  try {
    assert.equal(selectedProvider({root,env}),'botconnector')
    saveProviderKey('openrouter',secret,{root})
    const ciphertext=readFileSync(join(root,'provider-openrouter.dpapi'),'utf8')
    assert.doesNotMatch(ciphertext,/FAKE_TEST_PROVIDER_KEY_NEVER_REAL_123/)
    assert.match(ciphertext,/^[0-9a-f]+\s*$/i)
    assert.equal(storedProviderKey('openrouter',{root}),secret)
    assert.equal(isConfigured('openrouter',{root,env}),true)
    useProvider('openrouter',{root,env})
    assert.equal(selectedProvider({root,env}),'openrouter')
    const resolved=resolveProvider('openrouter',{root,env})
    assert.equal(resolved.key,secret)
    assert.equal(resolveProvider('openrouter',{root,env:{...env,OPENROUTER_API_KEY:'FAKE_STALE_ENV_KEY'}}).key,secret)
    assert.equal(resolved.endpoint,PROVIDERS.openrouter.endpoint)
    const other=resolveProvider('botconnector',{env})
    assert.equal(other.key,'FAKE_BC_TEST_ONLY')
    removeProvider('openrouter',{root,env})
    assert.equal(selectedProvider({root,env}),'botconnector')
    assert.equal(isConfigured('openrouter',{root,env}),false)
    assert.throws(()=>storedProviderKey('openrouter',{root}),/not configured/)
  } finally {rmSync(root,{recursive:true,force:true})}
})

test('other-provider API key stays in local proxy and cannot route to arbitrary host',async () => {
  const observed=[]
  await assert.rejects(startGatewayProxy({key:'FAKE',endpoint:'https://attacker.example/v1'}), /Unapproved provider endpoint/)
  const proxy=await startGatewayProxy({
    key:'FAKE_OTHER_PROVIDER_SECRET',endpoint:PROVIDERS.openrouter.endpoint,token:'EPHEMERAL_SHORT_TOKEN',
    fetchImpl:async(url,options)=>{
      observed.push({url,auth:options.headers.authorization})
      return new Response('{"data":[{"id":"some-model"}]}',{status:200,headers:{'content-type':'application/json'}})
    }
  })
  try{
    const result=await fetch(proxy.baseUrl+'/models',{headers:{authorization:'Bearer '+proxy.token}})
    assert.equal(result.status,200)
    assert.deepEqual(observed,[{url:'https://openrouter.ai/api/v1/models',auth:'Bearer FAKE_OTHER_PROVIDER_SECRET'}])
    assert.equal(JSON.stringify(observed).includes('127.0.0.1'),false)
    assert.notEqual(proxy.token,'FAKE_OTHER_PROVIDER_SECRET')
  }finally{await proxy.close()}
})

test('provider subprocess env strips all inherited provider credentials and isolates session homes', () => {
  const inherited={
    BOTCONNECTOR_API_KEY:'fake-a',OPENROUTER_API_KEY:'fake-b',
    DEEPSEEK_API_KEY:'fake-c',GROQ_API_KEY:'fake-d',
    XAI_API_KEY:'fake-e',OPENAI_API_KEY:'fake-f',
    OLLAMA_API_KEY:'fake-ollama',TOGETHER_API_KEY:'fake-together',FIREWORKS_API_KEY:'fake-fireworks',
    MISTRAL_API_KEY:'fake-mistral',NVIDIA_API_KEY:'fake-nvidia',HF_TOKEN:'fake-huggingface',
  }
  const env=childEnvironment(inherited,'LOCAL_TOKEN','model-x',{providerId:'openrouter',endpoint:'http://127.0.0.1:3001/v1'})
  assert.equal(env.OPENAI_API_KEY,'LOCAL_TOKEN')
  assert.equal(env.BCCLI_ACTIVE_PROVIDER,'openrouter')
  assert.ok(env.QWEN_HOME.includes('sessions-openrouter'))
  for(const name of ['BOTCONNECTOR_API_KEY','OPENROUTER_API_KEY','DEEPSEEK_API_KEY','GROQ_API_KEY','XAI_API_KEY','OLLAMA_API_KEY','TOGETHER_API_KEY','FIREWORKS_API_KEY','MISTRAL_API_KEY','NVIDIA_API_KEY','HF_TOKEN']) {
    assert.equal(env[name],undefined,name)
  }
  const bc=childEnvironment(inherited,'LOCAL_TOKEN','model-x',{providerId:'botconnector'})
  assert.notEqual(bc.QWEN_HOME,env.QWEN_HOME)
})

test('last model is stored per provider as a harmless ID, not a credential', () => {
  const root=mkdtempSync(join(tmpdir(),'bccli-selected-model-'))
  try {
    assert.equal(selectedModel('botconnector',{root}),undefined)
    saveSelectedModel('botconnector','ling-3.0-flash',{root})
    saveSelectedModel('openrouter','example/vision-v1',{root})
    assert.equal(selectedModel('botconnector',{root}),'ling-3.0-flash')
    assert.equal(selectedModel('openrouter',{root}),'example/vision-v1')
    assert.equal(readFileSync(join(root,'active-model-openrouter'),'utf8'),'example/vision-v1\n')
    assert.throws(()=>saveSelectedModel('openrouter','not a valid model',{root}),/Invalid model ID/)
    assert.throws(()=>saveSelectedModel('botconnector','line\nbreak',{root}),/Invalid model ID/)
    writeFileSync(join(root,'active-model-botconnector'),'invalid value\n')
    assert.throws(()=>selectedModel('botconnector',{root}),/Invalid saved model selection/)
    const path=join(root,'active-model-openai')
    mkdirSync(path)
    assert.throws(()=>selectedModel('openai',{root}),/Unsafe model selection file/)
    assert.throws(()=>saveSelectedModel('openai','gpt-4.1',{root}),/Unsafe model selection path/)
  } finally { rmSync(root,{recursive:true,force:true}) }
})

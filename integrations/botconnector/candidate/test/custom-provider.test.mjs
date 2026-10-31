import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  PROVIDERS, listProviderDefinitions, registerCustomProvider, validateCustomProvider,
  approvedProviderEndpoint, providerDefinition, providerRoot,
} from '../providers.mjs'
import { startGatewayProxy } from '../proxy.mjs'

test('Ollama Cloud and extra mainstream providers appear in catalog without Qwen dependencies',()=>{
  for (const id of ['ollama-cloud','together','fireworks','mistral','cerebras','sambanova','nvidia','huggingface','moonshot','zai']) {
    assert.ok(PROVIDERS[id],id)
    assert.ok(PROVIDERS[id].endpoint.startsWith('https://'),id)
  }
  assert.equal(PROVIDERS['ollama-cloud'].env,'OLLAMA_API_KEY')
})

test('custom endpoint registration stores only public HTTPS endpoints, never secrets or local addresses',()=>{
  const root=mkdtempSync(join(tmpdir(),'bccli-custom-provider-'))
  try{
    const newProvider=registerCustomProvider('my-provider','My Provider','https://models.provider-example.net/api/v1',{root})
    assert.equal(newProvider.id,'my-provider')
    assert.equal(newProvider.endpoint,'https://models.provider-example.net/api/v1')
    const stored=readFileSync(join(root,'custom-providers.json'),'utf8')
    assert.match(stored,/my-provider/)
    assert.doesNotMatch(stored,/API[_ ]KEY|SECRET|Bearer/)
    const registry=listProviderDefinitions({root})
    assert.equal(registry['my-provider'].name,'My Provider')
    assert.equal(registry.openai.name,'OpenAI API')
    assert.equal(approvedProviderEndpoint(newProvider.endpoint,{root}),true)
    assert.throws(()=>registerCustomProvider('my-provider','Duplicate','https://models.otherprovider.com/v1',{root}),/already exists/)
  }finally{rmSync(root,{recursive:true,force:true})}
})

test('custom provider endpoint validator blocks private, loopback, credentialed and insecure destinations',()=>{
  const urls=[
    'http://example.net/v1','https://127.0.0.1/v1','https://localhost/v1',
    'https://metadata.internal/v1','https://nas.home/v1','https://10.0.0.1/v1',
    'https://[::1]/v1','https://admin:secret@example.net/v1',
    'https://example.net:8443/v1','https://example.net/v1?token=hi',
    'https://example.net/v1#secret','https://example.net/v1/../../admin',
  ]
  for(const endpoint of urls){
    assert.throws(()=>validateCustomProvider({id:'custom-xyz',name:'Custom Provider',endpoint}),undefined,endpoint)
  }
  assert.throws(()=>validateCustomProvider({id:'openai',name:'Overwrite OpenAI',endpoint:'https://api2.example.net/v1'}),/reserved/)
})

test('user confirmed Add Provider registers custom profile, list exposes it, model catalog and proxy route use it',async()=>{
  const root=mkdtempSync(join(tmpdir(),'bccli-custom-proxy-'))
  const before=process.env.BCCLI_PREVIEW_HOME
  process.env.BCCLI_PREVIEW_HOME=root
  const visited=[]
  try{
    const proxy=await startGatewayProxy({
      key:'TEST_OLD_KEY',initialProvider:'botconnector',liveProvider:true,
      endpoint:PROVIDERS.botconnector.endpoint,token:'TEST_LOCAL_SESSION_TOKEN',
      promptNewProvider:async()=>({name:'New Cloud',endpoint:'https://newcloud.example-provider.net/v1'}),
      registerNewProvider:(id,name,endpoint)=>registerCustomProvider(id,name,endpoint,{root}),
      configured:id=>id==='botconnector'||id==='new-cloud',
      resolveProfile:id=>({key:id==='new-cloud'?'TEST_NEW_KEY':'TEST_OLD_KEY',endpoint:id==='new-cloud'?'https://newcloud.example-provider.net/v1':PROVIDERS.botconnector.endpoint}),
      selectProvider:()=>{},rememberModel:()=>{},
      fetchImpl:async(url,opts)=>{
        visited.push({url,authorization:opts.headers.authorization})
        return Response.json(url.endsWith('/models')?{data:[{id:'custom-model'}]}:{choices:[]})
      },
    })
    try{
      const headers={authorization:'Bearer '+proxy.token,'content-type':'application/json'}
      const denial=await fetch(proxy.baseUrl+'/bccli/provider/custom/add',{method:'POST',headers,
        body:JSON.stringify({action:'user-confirmed-local-custom-provider-dialog',endpoint:'https://attacker.invalid/v1'})})
      assert.equal(denial.status,400)
      const added=await fetch(proxy.baseUrl+'/bccli/provider/custom/add',{method:'POST',headers,
        body:JSON.stringify({action:'user-confirmed-local-custom-provider-dialog'})})
      assert.equal(added.status,200)
      const value=await added.json()
      assert.equal(value.provider,'new-cloud')
      assert.equal(providerDefinition('new-cloud').endpoint,'https://newcloud.example-provider.net/v1')
      const listed=await fetch(proxy.baseUrl+'/bccli/providers',{headers})
      assert.ok((await listed.json()).providers.some(p=>p.id==='new-cloud'))
      const catalog=await fetch(proxy.baseUrl+'/bccli/providers/new-cloud/models',{headers})
      assert.deepEqual((await catalog.json()).models,['custom-model'])
      const selected=await fetch(proxy.baseUrl+'/bccli/provider/switch',{method:'POST',headers,
        body:JSON.stringify({action:'user-selected-provider',provider:'new-cloud',model:'custom-model'})})
      assert.equal(selected.status,200)
      const chat=await fetch(proxy.baseUrl+'/chat/completions',{method:'POST',headers,
        body:JSON.stringify({model:'custom-model',messages:[{role:'user',content:'mock'}]})})
      assert.equal(chat.status,200)
      assert.equal(visited.at(-1).url,'https://newcloud.example-provider.net/v1/chat/completions')
      assert.equal(visited.at(-1).authorization,'Bearer TEST_NEW_KEY')
    }finally{await proxy.close()}
  }finally{
    if(before===undefined)delete process.env.BCCLI_PREVIEW_HOME
    else process.env.BCCLI_PREVIEW_HOME=before
    rmSync(root,{recursive:true,force:true})
  }
})

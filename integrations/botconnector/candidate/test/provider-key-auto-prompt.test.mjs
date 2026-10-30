import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { startGatewayProxy } from '../proxy.mjs'
import { BCCLI_PROVIDER_COMMAND } from '../provider-command.mjs'

test('selecting a provider without key opens masked dialog in same chat, then shows models', async () => {
  const credentials = new Map([['botconnector','TEST_BC_KEY']])
  const prompted = []
  const proxy = await startGatewayProxy({
    key:'TEST_BC_KEY',endpoint:'https://api.botconnector.id/v1',initialProvider:'botconnector',
    liveProvider:true,token:'LOCAL_SESSION_TOKEN',
    configured:id=>credentials.has(id),
    resolveProfile:id=>({key:credentials.get(id),endpoint:id==='openai'?'https://api.openai.com/v1':'https://api.botconnector.id/v1'}),
    secureKeyPrompt:async id=>{prompted.push(id);return 'TEST_OPENAI_KEY'},
    persistKey:(id,key)=>credentials.set(id,key),
    fetchImpl:async(url,{headers})=>{
      if(url.includes('api.openai.com')){
        assert.equal(headers.authorization,'Bearer TEST_OPENAI_KEY')
        return Response.json({data:[{id:'gpt-4.1-mini'}]})
      }
      return Response.json({data:[{id:'ling-3.0-flash'}]})
    },
  })
  try {
    const command=vm.runInNewContext(BCCLI_PROVIDER_COMMAND+'\nauthCommand',{
      process:{env:{OPENAI_BASE_URL:proxy.baseUrl,OPENAI_API_KEY:proxy.token}},
      fetch,AbortSignal,JSON,Object,String,Number,RegExp,Error,__name:f=>f,
    })
    const result=await command.action({invocation:{args:'openai'},services:{}},'openai')
    assert.deepEqual(prompted,['openai'])
    assert.equal(credentials.get('openai'),'TEST_OPENAI_KEY')
    assert.match(result.content,/Models for openai/)
    assert.match(result.content,/gpt-4\.1-mini/)
    assert.doesNotMatch(JSON.stringify(result),/TEST_OPENAI_KEY|TEST_BC_KEY/)
  } finally { await proxy.close() }
})

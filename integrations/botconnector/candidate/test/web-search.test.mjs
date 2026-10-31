import assert from 'node:assert/strict'
import test from 'node:test'
import { searchWithBrave,validateSearchQuery } from '../web-search-backend.mjs'
import { startGatewayProxy } from '../proxy.mjs'
import { childEnvironment } from '../core.mjs'

test('Brave search uses fixed HTTPS endpoint, private parent key and public cited URLs only',async()=>{
  let requested=0
  const result=await searchWithBrave({query:'BCCLI search test',key:'PARENT_SEARCH_SECRET',
    fetchImpl:async(url,opts)=>{
      requested++
      assert.equal(new URL(url).origin,'https://api.search.brave.com')
      assert.equal(new URL(url).searchParams.get('q'),'BCCLI search test')
      assert.equal(new URL(url).searchParams.get('count'),'5')
      assert.equal(opts.headers['x-subscription-token'],'PARENT_SEARCH_SECRET')
      assert.equal(opts.redirect,'error')
      return new Response(JSON.stringify({web:{results:[
        {title:'Trusted Source',url:'https://docs.example.org/page',description:'Reference'},
        {title:'Local metadata',url:'http://127.0.0.1:8080/admin',description:'secret'},
        {title:'Credentials URL',url:'https://user:pass@somewhere.org/a',description:'bad'},
      ]}}),{status:200,headers:{'content-type':'application/json'}})
    }})
  assert.equal(requested,1)
  assert.deepEqual(result.results,[{title:'Trusted Source',url:'https://docs.example.org/page',snippet:'Reference'}])
  assert.doesNotMatch(JSON.stringify(result),/PARENT_SEARCH_SECRET|127\.0\.0\.1/)
})

test('Search backend rejects malformed queries, errors and oversized results',async()=>{
  for(const q of ['', 'x', 'bad\nquery', 'q'.repeat(251)])
    assert.throws(()=>validateSearchQuery(q))
  await assert.rejects(searchWithBrave({query:'valid query',key:'none',fetchImpl:async()=>new Response('{}',{status:429})}),/429/)
  await assert.rejects(searchWithBrave({query:'valid query',key:'none',fetchImpl:async()=>new Response('{',{status:200})}),/invalid JSON/)
  await assert.rejects(searchWithBrave({query:'valid query',key:'none',fetchImpl:async()=>new Response('a'.repeat(512*1024+1),{status:200})}),/safety limit/)
})

test('local search route is bearer-protected, isolated from model provider and capped',async()=>{
  const key='INTERNAL_BRAVE_KEY_DO_NOT_EXPOSE'
  let count=0
  const proxy=await startGatewayProxy({key:'MODEL_PROVIDER_SECRET',searchApiKey:key,
    searchImpl:async({query,key:received})=>{
      assert.equal(received,key)
      count++
      return {query,provider:'brave',results:[{title:'Test',url:'https://example.org/',snippet:'Snippet'}]}
    }})
  const url=proxy.baseUrl+'/bccli/web-search'
  const call=(body,token=proxy.token,method='POST')=>fetch(url,{method,
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    ...(method==='POST'?{body:JSON.stringify(body)}:{}),
    redirect:'error'})
  try{
    assert.equal((await call({query:'search topic'},'invalid')).status,401)
    assert.equal((await call(null,proxy.token,'GET')).status,405)
    assert.equal((await call({query:'search topic',extra:1})).status,400)
    const good=await call({query:'search topic'})
    assert.equal(good.status,200)
    const text=await good.text()
    assert.match(text,/https:\/\/example.org/)
    assert.doesNotMatch(text,/INTERNAL_BRAVE_KEY|MODEL_PROVIDER_SECRET/)
    assert.equal(count,1)
    for(let n=1;n<20;n++)assert.equal((await call({query:'search topic'})).status,200)
    assert.equal((await call({query:'search topic'})).status,429)
    assert.equal(count,20)
  }finally{await proxy.close()}
})

test('Brave credential never reaches Qwen engine environment',()=>{
  const env=childEnvironment({BRAVE_SEARCH_API_KEY:'SECRET_SEARCH_KEY',OPENAI_API_KEY:'REAL_PROVIDER_KEY'},'SHORT_SESSION_TOKEN','example-model',{
    endpoint:'http://127.0.0.1:3333/v1',home:'C:\\fixture',searchAvailable:true})
  assert.equal(env.BRAVE_SEARCH_API_KEY,undefined)
  assert.equal(env.OPENAI_API_KEY,'SHORT_SESSION_TOKEN')
  assert.equal(env.BCCLI_WEB_SEARCH_AVAILABLE,'1')
  const off=childEnvironment({BRAVE_SEARCH_API_KEY:'SECRET_SEARCH_KEY'},'SHORT_SESSION_TOKEN','example-model',{searchAvailable:false})
  assert.equal(off.BCCLI_WEB_SEARCH_AVAILABLE,'0')
})

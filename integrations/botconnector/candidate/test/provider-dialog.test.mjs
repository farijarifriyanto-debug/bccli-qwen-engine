import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { BCCLI_PROVIDER_DIALOG } from '../provider-dialog.mjs'

function harness() {
  let index = 0, input, didEffect = false, closed = false
  const states = []
  const calls = []
  let activeModel = 'ling-3.0-flash'
  const providers = [
    { id:'botconnector', name:'BotConnector Cloud', active:true, configured:true },
    { id:'openai', name:'OpenAI API', active:false, configured:true },
  ]
  const fakeFetch = async (url, options) => {
    calls.push({ url,method:options.method||'GET',payload:options.body?JSON.parse(options.body):null })
    if(url.endsWith('/bccli/providers'))return Response.json({providers,active:'botconnector'})
    if(url.endsWith('/bccli/providers/openai/models'))
      return Response.json({models:['gpt-4.1','gpt-4.1-mini','o3-mini']})
    if(url.endsWith('/bccli/provider/switch'))
      return Response.json({provider:options.body?JSON.parse(options.body).provider:null,model:JSON.parse(options.body).model})
    return Response.json({error:'unknown'}, {status:404})
  }
  const react={
    useState(initial) {
      const at=index++
      if(!states[at])states[at]={v:typeof initial==='function'?initial():initial}
      return [states[at].v, value => {states[at].v=typeof value==='function'?value(states[at].v):value}]
    },
    useEffect(effect) { if(!didEffect){didEffect=true;effect()} },
  }
  const jsx=(type,props,key)=>({type,props,key})
  const config={getModel:()=>activeModel,async setModel(id){activeModel=id}}
  const context={
    import_react27:react,import_jsx_runtime32:{jsx,jsxs:jsx},
    Box_default:'Box',Text:'Text',theme:{border:{default:'grey'},text:{primary:'white',secondary:'grey',link:'cyan'},status:{error:'red'}},
    useUIActions:()=>({auth:{closeAuthDialog:()=>{closed=true}}}),useConfig:()=>config,
    useKeypress:callback=>{input=callback},process:{env:{OPENAI_BASE_URL:'http://127.0.0.1:43434/v1',OPENAI_API_KEY:'EPHEMERAL_LOCAL_TEST_TOKEN'}},
    fetch:fakeFetch,AbortSignal,
  }
  const AuthDialog=vm.runInNewContext(BCCLI_PROVIDER_DIALOG+'\nAuthDialog',context)
  const render=()=>{index=0;return AuthDialog()}
  const flatten=(node,out=[])=>{
    if(node==null)return out
    if(Array.isArray(node)){node.forEach(n=>flatten(n,out));return out}
    if(typeof node==='string'||typeof node==='number'){out.push(String(node));return out}
    if(node.props&&'children' in node.props)flatten(node.props.children,out)
    return out
  }
  const wait=()=>new Promise(resolve=>setTimeout(resolve,15))
  const key=async(name,sequence='')=>{input({name,sequence,ctrl:false,meta:false});await wait();return flatten(render()).join('\n')}
  return {render,text:()=>flatten(render()).join('\n'),key,wait,calls,getClosed:()=>closed,getModel:()=>activeModel}
}

test('arrow keys navigate providers, models and actions without typing model IDs',async()=>{
  const x=harness()
  x.render();await x.wait()
  assert.match(x.text(),/Choose AI provider/)
  assert.match(x.text(),/BotConnector Cloud/)
  assert.match(await x.key('down'),/❯ OpenAI API/)
  assert.match(await x.key('return'),/Browse and select model/)
  assert.match(await x.key('return'),/Select model/)
  const filter1=await x.key('g','g')
  const filter2=await x.key('p','p')
  const filter3=await x.key('t','t')
  assert.match(filter1,/Type to filter/)
  assert.match(filter3,/gpt-4.1-mini/)
  assert.doesNotMatch(filter3,/o3-mini/)
  assert.match(await x.key('down'),/❯ gpt-4.1-mini/)
  await x.key('return')
  assert.equal(x.getClosed(),true)
  assert.equal(x.getModel(),'gpt-4.1-mini')
  assert.equal(x.calls.filter(c=>c.url.endsWith('/bccli/provider/switch')).length,1)
  assert.deepEqual(x.calls.at(-1).payload,{action:'user-selected-provider',provider:'openai',model:'gpt-4.1-mini'})
})

test('Escape from models returns to actions; Escape from provider list closes dialog',async()=>{
  const x=harness()
  x.render();await x.wait();x.text()
  await x.key('down')
  await x.key('return')
  await x.key('return')
  assert.match(x.text(),/Select model/)
  await x.key('escape')
  assert.match(x.text(),/Browse and select model/)
  await x.key('escape')
  assert.match(x.text(),/Choose AI provider/)
  await x.key('escape')
  assert.equal(x.getClosed(),true)
})

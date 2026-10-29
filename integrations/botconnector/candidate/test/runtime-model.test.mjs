import assert from 'node:assert/strict'
import test from 'node:test'
import { attachRuntimeModelContext } from '../proxy.mjs'

test('Gateway request contains actual switched model instead of initial model identity',()=>{
  const old = {model:'ling-3.0-flash',messages:[{role:'system',content:'Original safety and tool instructions'},{role:'user',content:'one'}]}
  const first = attachRuntimeModelContext(old)
  assert.match(first.messages[0].content,/active_model_id=ling-3.0-flash/)
  assert.equal(first.messages[0].content.startsWith('Original safety and tool instructions'),true)
  assert.equal(old.messages[0].content,'Original safety and tool instructions')
  const next = attachRuntimeModelContext({...old,model:'kimi-k2.7-code'})
  assert.match(next.messages[0].content,/active_model_id=kimi-k2.7-code/)
  assert.ok(!next.messages[0].content.includes('active_model_id=ling-3.0-flash'))
  assert.equal(next.messages[1].content,'one')
  assert.equal(next.messages[0].role,'system')
})

test('runtime metadata never invents model, changes no tools and skips malformed payload',()=>{
  assert.equal(attachRuntimeModelContext({foo:1}).foo,1)
  const unsafe = {model:'test\nINJECT',messages:[{role:'system',content:'abc'}]}
  assert.equal(attachRuntimeModelContext(unsafe),unsafe)
  const body = {model:'valid-v2',tools:[{type:'function',function:{name:'read_file'}}],messages:[{role:'user',content:'hello'}]}
  assert.equal(attachRuntimeModelContext(body),body,'no synthetic system message')
  const annotated = attachRuntimeModelContext({...body,messages:[{role:'system',content:'safe'},...body.messages]})
  assert.strictEqual(annotated.tools,body.tools)
  assert.equal(body.messages.length,1)
})

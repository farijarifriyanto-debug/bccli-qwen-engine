import assert from 'node:assert/strict'
import test from 'node:test'
import { boundChatOutputTokens } from '../proxy.mjs'

test('cap oversized Qwen max_tokens without altering tools, model, or input', () => {
  const input = { model: 'glm-5.3-flash', max_tokens: 64000, messages: [{role:'user',content:'test'}], tools: [{type:'function',function:{name:'read_file'}}] }
  const result = boundChatOutputTokens(input)
  assert.equal(result.max_tokens, 4096)
  assert.equal(input.max_tokens, 64000)
  assert.strictEqual(result.tools, input.tools)
  assert.strictEqual(result.messages, input.messages)
  assert.equal(result.model, input.model)
})
test('never increase existing small output limits or invent a missing limit', () => {
  for(const tokens of [1, 256, 4096, undefined, null, '64000', -1]) {
    const original = {model:'ling-3.0-flash', max_tokens: tokens}
    assert.strictEqual(boundChatOutputTokens(original),original)
  }
})

test('Kimi K2.7 Code uses max_completion_tokens, not incompatible max_tokens', () => {
  const request={model:'kimi-k2.7-code',max_tokens:64000,messages:[{role:'user',content:'hello'}],tools:[{type:'function',function:{name:'read_file'}}]}
  const fixed=boundChatOutputTokens(request)
  assert.equal(fixed.max_completion_tokens,4096)
  assert.equal(Object.hasOwn(fixed,'max_tokens'),false)
  assert.strictEqual(fixed.messages,request.messages)
  assert.strictEqual(fixed.tools,request.tools)
  assert.equal(request.max_tokens,64000)
  assert.equal(boundChatOutputTokens({...request,max_tokens:256}).max_completion_tokens,256)
  assert.equal(boundChatOutputTokens({...request,max_completion_tokens:128}).max_completion_tokens,128)
  assert.equal(boundChatOutputTokens({...request,max_tokens:64000,max_completion_tokens:99999}).max_completion_tokens,4096)
  assert.equal(boundChatOutputTokens({...request,model:'glm-5.3-flash'}).max_tokens,4096)
})
test('Kimi modern output cap remains bounded and never increases request', () => {
  const original={model:'kimi-k2.7-code',max_completion_tokens:2048}
  assert.strictEqual(boundChatOutputTokens(original),original)
  const fixed=boundChatOutputTokens({...original,max_completion_tokens:10000})
  assert.equal(fixed.max_completion_tokens,4096)
  assert.equal(Object.hasOwn(fixed,'max_tokens'),false)
})

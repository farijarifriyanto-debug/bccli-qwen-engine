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

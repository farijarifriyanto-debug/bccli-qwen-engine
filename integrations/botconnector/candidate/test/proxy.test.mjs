import assert from 'node:assert/strict'
import test from 'node:test'
import { startGatewayProxy } from '../proxy.mjs'
import { GATEWAY } from '../core.mjs'

test('proxy keeps real key upstream; Qwen gets an expiring local token', async () => {
  const seen = []
  const proxy = await startGatewayProxy({
    key: 'REAL_KEY_STAYS_HERE', token: 'LOCAL_SESSION_TOKEN',
    fetchImpl: async (url, init) => {
      seen.push({ url, auth: init.headers.authorization, method: init.method, body: init.body?.toString() })
      return new Response('data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
    },
  })
  try {
    assert.match(proxy.baseUrl, /^http:\/\/127\.0\.0\.1:\d+\/v1$/)
    assert.equal(proxy.token, 'LOCAL_SESSION_TOKEN')
    const request = { model: 'bc-poc-model', messages: [{ role: 'user', content: 'test' }], stream: true }
    const result = await fetch(proxy.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    assert.equal(result.status, 200)
    assert.equal(await result.text(), 'data: [DONE]\n\n')
    assert.deepEqual(seen, [{
      url: GATEWAY + '/chat/completions', method: 'POST',
      auth: 'Bearer REAL_KEY_STAYS_HERE', body: JSON.stringify(request),
    }])
  } finally { await proxy.close() }
})

test('proxy refuses missing token, unexpected endpoint and wrong HTTP method', async () => {
  const seen = []
  const proxy = await startGatewayProxy({ key: 'real', token: 'session',
    fetchImpl: async (...args) => { seen.push(args); return new Response('NO', { status: 200 }) } })
  try {
    const headers = { authorization: 'Bearer session', 'content-type': 'application/json' }
    assert.equal((await fetch(proxy.baseUrl + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401)
    assert.equal((await fetch(proxy.baseUrl + '/chat/completions', { method: 'POST', headers: { ...headers, authorization: 'Bearer WRONG' }, body: '{}' })).status, 401)
    assert.equal((await fetch(proxy.baseUrl + '/files', { method: 'POST', headers, body: '{}' })).status, 404)
    assert.equal((await fetch(proxy.baseUrl + '/chat/completions', { method: 'GET', headers })).status, 405)
    assert.equal(seen.length, 0)
  } finally { await proxy.close() }
})

test('proxy never follows upstream redirects or exposes upstream error details', async () => {
  let redirectOption
  const proxy = await startGatewayProxy({ key: 'real', token: 'session',
    fetchImpl: async (_url, init) => {
      redirectOption = init.redirect
      throw Error('UPSTREAM_SECRET_RESPONSE_SHOULD_NOT_APPEAR')
    } })
  try {
    const result = await fetch(proxy.baseUrl + '/chat/completions', {
      method: 'POST', headers: { authorization: 'Bearer session', 'content-type': 'application/json' }, body: '{}',
    })
    assert.equal(result.status, 502)
    assert.doesNotMatch(await result.text(), /UPSTREAM_SECRET_RESPONSE_SHOULD_NOT_APPEAR/)
    assert.equal(redirectOption, 'error')
  } finally { await proxy.close() }
})

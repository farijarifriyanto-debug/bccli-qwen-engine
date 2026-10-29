import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { DEFAULT_MODEL, childEnvironment, discoverModels, GATEWAY, launchQwen, parseArgs, qwenArguments, selectModel } from '../core.mjs'

test('accepts only deliberately supported commands and flags', () => {
  assert.deepEqual(parseArgs(['models', '--json']), { command: 'models', model: undefined, json: true, prompt: '' })
  assert.deepEqual(parseArgs(['run', '--model', 'test-model', 'hello']), { command: 'run', model: 'test-model', json: false, prompt: 'hello' })
  assert.throws(() => parseArgs(['run', '--yolo', 'x']), /Unsupported option/)
  assert.throws(() => parseArgs(['run', '--openai-base-url', 'https://evil.example', 'x']), /Unsupported option/)
  assert.throws(() => parseArgs(['run', '-m', 'a', '--model', 'b', 'hi']), /exactly once/)
  assert.throws(() => parseArgs(['models', 'anything']), /Use: models/)
  assert.deepEqual(parseArgs(['resume', '--model', 'ling-3.0-flash', 'continue']), {command:'resume',model:'ling-3.0-flash',json:false,prompt:'continue'})
})

test('authenticated discovery keeps endpoint and rejects redirects', async () => {
  let checked = false
  const models = await discoverModels({
    key: 'fake-key', fetchImpl: async (url, options) => {
      assert.equal(url, GATEWAY + '/models')
      assert.equal(options.headers.authorization, 'Bearer fake-key')
      assert.equal(options.redirect, 'error')
      checked = true
      return new Response(JSON.stringify({ data: [{ id: 'model-1' }, { id: 'model-1' }, { id: 'model/2' }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    },
  })
  assert.equal(checked, true)
  assert.deepEqual(models.map(m => m.id), ['model-1', 'model/2'])
  await assert.rejects(discoverModels({ key: 'fake-key', fetchImpl: async () => { throw new Error('redirect blocked') } }), /no fallback provider/)
})

test('discovery fails closed on invalid keys, no models and 401', async () => {
  await assert.rejects(discoverModels({ key: '', fetchImpl: () => { throw Error('should not fetch') } }), /required/)
  await assert.rejects(discoverModels({ key: 'x', fetchImpl: async () => new Response('{}', { status: 401 }) }), /HTTP 401/)
  await assert.rejects(discoverModels({ key: 'x', fetchImpl: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }) }), /No valid models/)
  const items = [{ id: 'model-1' }]
  assert.equal(selectModel(items, 'model-1'), 'model-1')
  assert.throws(() => selectModel(items, 'not-listed'), /not available/)
  assert.throws(() => selectModel(items, 'foo\nbar'), /Invalid model ID/)
  assert.throws(() => selectModel(items), /Select a model/)
})

test('upstream agent runs with locked gateway, bare mode, and default permissions', () => {
  const args = qwenArguments('model-1', 'hi')
  assert.ok(args.includes('--bare'))
  assert.deepEqual(args.slice(args.indexOf('--openai-base-url'), args.indexOf('--openai-base-url') + 2), ['--openai-base-url', GATEWAY])
  assert.deepEqual(args.slice(args.indexOf('--approval-mode'), args.indexOf('--approval-mode') + 2), ['--approval-mode', 'default'])
  assert.ok(!args.includes('--yolo'))
  const resumeArgs = qwenArguments('ling-3.0-flash', 'continue', GATEWAY, { continueSession: true })
  assert.ok(resumeArgs.includes('--continue'))
  assert.ok(resumeArgs.includes('--bare'))
  assert.ok(!qwenArguments('ling-3.0-flash', 'new').includes('--continue'))
})

test('child strips inherited competing provider keys', () => {
  const env = childEnvironment({
    PATH: 'test-path', QWEN_OAUTH: '1', ANTHROPIC_API_KEY: 'old-secret',
    OPENAI_BASE_URL: 'https://evil.example/v1', OPENAI_API_KEY: 'wrong-key',
    BOTCONNECTOR_API_KEY: 'should-not-inherit',
  }, 'test-secret', 'model-1', { home: '/tmp/bccli-qwen-candidate' })
  assert.equal(env.PATH, 'test-path')
  assert.equal(env.QWEN_OAUTH, undefined)
  assert.equal(env.BOTCONNECTOR_API_KEY, undefined)
  assert.equal(env.ANTHROPIC_API_KEY, undefined)
  assert.equal(env.OPENAI_API_KEY, 'test-secret')
  assert.equal(env.OPENAI_BASE_URL, GATEWAY)
  assert.equal(env.QWEN_HOME, '/tmp/bccli-qwen-candidate')
})

test('launcher spawns upstream node script directly without shell', async () => {
  let captured
  const spawnImpl = (exe, args, options) => {
    captured = { exe, args, options }
    const child = new EventEmitter()
    queueMicrotask(() => child.emit('exit', 0, null))
    return child
  }
  let closed = false
  const proxyFactory = async ({ key }) => {
    assert.equal(key, 'fake-key')
    return {
      token: 'short-lived-session-token',
      baseUrl: 'http://127.0.0.1:1234/v1',
      close: async () => { closed = true },
    }
  }
  const exit = await launchQwen({
    key: 'fake-key', model: 'model-1', prompt: 'hello',
    env: { PATH: 'ok', BOTCONNECTOR_API_KEY: 'fake-key' },
    entrypoint: 'qwen-entry.js', spawnImpl, proxyFactory,
  })
  assert.equal(exit, 0)
  assert.equal(captured.args[0], 'qwen-entry.js')
  assert.equal(captured.options.shell, false)
  assert.equal(captured.options.env.OPENAI_BASE_URL, 'http://127.0.0.1:1234/v1')
  assert.equal(captured.options.env.OPENAI_API_KEY, 'short-lived-session-token')
  assert.equal(captured.options.env.BOTCONNECTOR_API_KEY, undefined)
  assert.ok(closed, 'loopback proxy must be disposed on child exit')
})

test('Ling default is explicit and never falls back to another model', () => {
  assert.equal(DEFAULT_MODEL, 'ling-3.0-flash')
  assert.equal(selectModel([{ id: DEFAULT_MODEL }], DEFAULT_MODEL), DEFAULT_MODEL)
  assert.throws(() => selectModel([{ id: 'another-model' }], DEFAULT_MODEL), /not available/)
  assert.equal(selectModel([{ id: DEFAULT_MODEL }, { id: 'other-model' }], 'other-model'), 'other-model')
})

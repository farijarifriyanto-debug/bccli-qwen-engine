import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { parseArgs, qwenArguments, launchQwen } from '../core.mjs'

test('headless structured output accepts only supported formats', () => {
  for (const outputFormat of ['text', 'json', 'stream-json']) {
    const args = parseArgs(['-p', 'inspect without calling AI', '--output-format', outputFormat])
    assert.equal(args.command, 'run')
    assert.equal(args.outputFormat, outputFormat)
    assert.equal(args.prompt, 'inspect without calling AI')
  }
  assert.equal(parseArgs(['run', 'hello']).outputFormat, undefined)
  assert.throws(() => parseArgs(['chat', '--output-format', 'json']), /only supported for a headless run/)
  assert.throws(() => parseArgs(['models', '--output-format', 'json']), /only supported for a headless run/)
  assert.throws(() => parseArgs(['-p', '--output-format', 'xml', 'x']), /Unsupported output format/)
  assert.throws(() => parseArgs(['-p', '--output-format', 'json', '--output-format', 'text', 'x']), /exactly once/)
  assert.throws(() => parseArgs(['-p', '--openai-base-url', 'https://example.com', 'x']), /Unsupported option/)
  assert.throws(() => parseArgs(['login','-p']), /No AI request was sent/)
})

test('upstream structured mode preserves endpoint and approval policy', () => {
  const args = qwenArguments('unit-model', 'hello', 'http://127.0.0.1:1/v1', { outputFormat:'stream-json' })
  assert.deepEqual(args.slice(args.indexOf('--output-format'), args.indexOf('--output-format')+2), ['--output-format', 'stream-json'])
  assert.ok(args.includes('--bare'))
  assert.deepEqual(args.slice(args.indexOf('--approval-mode'), args.indexOf('--approval-mode')+2), ['--approval-mode', 'default'])
  assert.ok(!args.includes('--yolo'))
})

test('launcher never exposes original provider key in structured mode', async () => {
  let captured, closed = false
  const spawnImpl = (exe, args, options) => {
    captured = { exe, args, options }
    const child = new EventEmitter()
    queueMicrotask(() => child.emit('exit', 0, null))
    return child
  }
  const proxyFactory = async ({key}) => {
    assert.equal(key, 'dummy-owner-key')
    return { token:'ephemeral-only', baseUrl:'http://127.0.0.1:4321/v1', close:async () => { closed=true } }
  }
  const exit = await launchQwen({
    key:'dummy-owner-key', model:'unit-model', prompt:'hi', outputFormat:'json',
    entrypoint:'fake-engine.js', spawnImpl, proxyFactory,
  })
  assert.equal(exit,0)
  assert.ok(captured.args.includes('json'))
  assert.equal(captured.options.env.OPENAI_API_KEY,'ephemeral-only')
  assert.ok(!captured.args.includes('dummy-owner-key'))
  assert.ok(!JSON.stringify(captured.options.env).includes('dummy-owner-key'))
  assert.equal(closed,true)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { legacyCompatibilityMode, runLegacyCli } from '../legacy-compat.mjs'

test('only explicit legacy features route to bundled stable implementation', () => {
  for (const argv of [
    ['mcp','list'], ['connect','opencode'], ['login','bc-cloud'], ['export'],
    ['plugins','list'], ['acp'], ['serve'], ['stats'], ['pr','12'],
    ['-p','task','--output-format','json'],
    ['-p','task','--output-format=stream-json'],
    ['--reasoning','high','-p','task'], ['--allow-all','-p','task'],
    ['provider','add','custom','--url','https://example.invalid/v1'],
  ]) assert.equal(legacyCompatibilityMode(argv), true, argv.join(' '))
  for (const argv of [
    [], ['chat'], ['--choose'], ['provider','list'],
    ['provider','add','botconnector'], ['-p','describe mcp and plugins'],
    ['-p','task'], ['models'], ['-c'], ['-r'],
  ]) assert.equal(legacyCompatibilityMode(argv), false, argv.join(' '))
})

test('compatibility command invokes bundled legacy CLI through same Node without a shell', async () => {
  const events = []
  const spawnImpl = (binary, args, options) => {
    events.push({ binary, args, options })
    const child = new EventEmitter()
    queueMicrotask(() => child.emit('exit', 0, null))
    return child
  }
  assert.equal(await runLegacyCli(['mcp','list'], {
    spawnImpl, node:'/safe/node', cwd:'/safe/work', env:{BC_TEST:'FAKE'},
  }), 0)
  assert.equal(events.length, 1)
  assert.equal(events[0].binary, '/safe/node')
  assert.match(events[0].args[0], /legacy[\\/]dist[\\/]cli\.js$/)
  assert.deepEqual(events[0].args.slice(1), ['mcp','list'])
  assert.equal(events[0].options.shell, false)
  assert.equal(events[0].options.stdio, 'inherit')
  assert.equal(events[0].options.cwd, '/safe/work')
})

test('legacy errors retain a failing exit code instead of falling back to AI', async () => {
  const spawnImpl = () => {
    const child = new EventEmitter()
    queueMicrotask(() => child.emit('exit', 3, null))
    return child
  }
  assert.equal(await runLegacyCli(['mcp','list'], { spawnImpl }), 3)
})

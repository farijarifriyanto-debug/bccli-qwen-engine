import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { launchQwen, parseArgs, qwenArguments } from '../core.mjs'

const uuid = '11111111-2222-4333-8444-555555555555'

test('native -r uses upstream Qwen session picker without introducing a custom session store', () => {
  const select = parseArgs(['-r', '--provider', 'botconnector'])
  assert.equal(select.command, 'chat')
  assert.equal(select.resumeSession, null)
  const args = qwenArguments('ling-3.0-flash', '', 'http://127.0.0.1:42001/v1', {resumeSession:select.resumeSession})
  assert.equal(args.filter(x => x === '--resume').length, 1)
  assert.equal(args.includes('--continue'), false)
  assert.equal(args.includes('--bare'), false)
  assert.ok(args.includes('default'))
  assert.equal(args.at(-1), '--resume')
})

test('specific -r UUID goes directly to native Qwen and remains in provider session home', () => {
  assert.equal(parseArgs(['--resume', uuid, '-m', 'ling-3.0-flash']).resumeSession, uuid)
  assert.equal(parseArgs(['-r', '--model', 'ling-3.0-flash']).resumeSession, null)
  const args = qwenArguments('ling-3.0-flash', '', undefined, {resumeSession:uuid})
  assert.deepEqual(args.slice(-2), ['--resume', uuid])
})

test('malformed resume values and mixed modes fail before sending an AI request', () => {
  for (const argv of [
    ['-r', '../unsafe'], ['-r', 'some-session-name'], ['-r', uuid, 'untrusted-prompt'],
    ['-r', '-c'], ['--continue', '--resume'], ['-r', '-r'],
    ['provider', 'list', '-r'], ['-p', 'Hello', '-r'], ['-r', '--acp'],
  ]) {
    assert.throws(() => parseArgs(argv), undefined, argv.join(' '))
  }
  assert.throws(() => qwenArguments('model','',undefined,{continueSession:true,resumeSession:null}), /Cannot combine/)
  assert.equal(parseArgs(['-c']).command, 'resume')
})

test('native resume passthrough never exposes the provider key to the Qwen subprocess', async () => {
  const observed = {}
  const child = new EventEmitter()
  const code = await launchQwen({
    key:'FAKE_TEST_REAL_PARENT_SECRET', model:'ling-3.0-flash', prompt:'', resumeSession:uuid,
    entrypoint:'C:/test/cli-entry.js', providerId:'botconnector', env:{BOTCONNECTOR_API_KEY:'OTHER_INHERITED_SECRET'},
    proxyFactory:async () => ({
      baseUrl:'http://127.0.0.1:42001/v1', token:'TEMPORARY_LOCAL_TOKEN',
      close:async () => {observed.closed=true},
    }),
    spawnImpl:(node,args,opts) => {
      observed.args=args
      observed.env=opts.env
      queueMicrotask(() => child.emit('exit', 0))
      return child
    },
  })
  assert.equal(code, 0)
  assert.equal(observed.closed, true)
  assert.deepEqual(observed.args.slice(-2), ['--resume',uuid])
  assert.equal(observed.env.OPENAI_API_KEY, 'TEMPORARY_LOCAL_TOKEN')
  assert.equal(observed.env.BOTCONNECTOR_API_KEY, undefined)
  assert.equal(JSON.stringify(observed).includes('FAKE_TEST_REAL_PARENT_SECRET'), false)
})

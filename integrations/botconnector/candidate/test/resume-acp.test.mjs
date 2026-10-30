import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { GATEWAY, parseArgs, qwenArguments, childEnvironment, launchQwen } from '../core.mjs'

const uuid = '82c5c8b5-148b-4c11-aefe-26246c1b6d85'

test('-r picker preserves native session isolation and never becomes a prompt', () => {
  assert.deepEqual(parseArgs(['-r']), {
    command:'chat', model:undefined, json:false, prompt:'', resumeSession:true,
  })
  assert.deepEqual(parseArgs(['--resume',uuid,'--provider','openrouter','-m','example-model']), {
    command:'chat', model:'example-model', json:false, prompt:'', provider:'openrouter',
    resumeSession:true, sessionId:uuid,
  })
  assert.deepEqual(parseArgs(['-m','example-model','-r']), {
    command:'chat', model:'example-model', json:false, prompt:'', resumeSession:true,
  })
  assert.equal(parseArgs(['-c']).command,'resume')
  assert.ok(!('resumeSession' in parseArgs(['-c'])))
})

test('session selection rejects ambiguous, unsafe, and duplicate arguments', () => {
  for(const argv of [
    ['-r','../../.ssh/id_rsa'], ['-r','login'],
    ['-r','not-a-uuid'], ['-r','f'.repeat(36)], ['-r',uuid,'prompt'],
    ['-r','--resume'], ['run','-r','hello'], ['acp','-r'], ['-r','-p','hello'],
  ]) {
    assert.throws(() => parseArgs(argv), undefined, argv.join(' '))
  }
})

test('ACP is protocol-only: refuses prompts and untrusted CLI flags', () => {
  assert.deepEqual(parseArgs(['acp','--provider','botconnector','--model','ling-3.0-flash']),{
    command:'acp',model:'ling-3.0-flash',json:false,prompt:'',provider:'botconnector',
  })
  for(const argv of [
    ['acp','prompt'], ['acp','--json'], ['acp','-p','prompt'],
    ['acp','--output-format','json'], ['acp','--yolo'],
    ['acp','--openai-base-url','https://evil.example/v1'],
    ['acp','--mcp-config','https://evil.example'],
  ]) {
    assert.throws(() => parseArgs(argv), undefined, argv.join(' '))
  }
})

test('native upstream flags keep bare mode, default approvals, and model identity', () => {
  const args = qwenArguments('ling-3.0-flash','',GATEWAY,{resumeSession:true})
  assert.deepEqual(args.slice(-1),['--resume'])
  const idArgs = qwenArguments('ling-3.0-flash','',GATEWAY,{resumeSession:true,sessionId:uuid})
  assert.deepEqual(idArgs.slice(-2),['--resume',uuid])
  assert.ok(idArgs.includes('--bare'))
  assert.deepEqual(idArgs.slice(idArgs.indexOf('--approval-mode'),idArgs.indexOf('--approval-mode')+2),['--approval-mode','default'])
  assert.ok(!idArgs.includes('--yolo'))
  assert.ok(!idArgs.includes('--continue'))
  const acpArgs = qwenArguments('ling-3.0-flash','',GATEWAY,{acp:true})
  assert.equal(acpArgs.at(-1),'--acp')
  assert.ok(acpArgs.includes('--bare'))
  assert.ok(!acpArgs.includes('--yolo'))
  assert.ok(!acpArgs.includes('--resume'))
  assert.throws(()=>qwenArguments('ling','','',{continueSession:true,resumeSession:true}), /Cannot combine/)
  assert.throws(()=>qwenArguments('ling','','',{resumeSession:true,sessionId:'../bad'}), /Invalid session/)
  assert.throws(()=>qwenArguments('ling','nonprotocol',GATEWAY,{acp:true}), /ACP must start/)
  assert.throws(()=>qwenArguments('ling','',GATEWAY,{acp:true,resumeSession:true}), /ACP must start/)
})

test('provider session directories stay distinct from legacy BCCLI', () => {
  const env = { PATH: 'ok', BOTCONNECTOR_API_KEY:'do-not-inherit', OPENROUTER_API_KEY:'do-not-inherit' }
  const a = childEnvironment(env,'temporary-token','test-model',{providerId:'botconnector'})
  const b = childEnvironment(env,'temporary-token','test-model',{providerId:'openrouter'})
  assert.match(a.QWEN_HOME,/\.bccli-preview$/)
  assert.match(b.QWEN_HOME,/\.bccli-preview[\\/]sessions-openrouter$/)
  assert.notEqual(a.QWEN_HOME,b.QWEN_HOME)
  assert.ok(!a.QWEN_HOME.endsWith('.bccli'))
  assert.equal(b.BOTCONNECTOR_API_KEY,undefined)
  assert.equal(b.OPENROUTER_API_KEY,undefined)
  assert.equal(a.OPENAI_API_KEY,'temporary-token')
})

test('ACP and resume child receive ephemeral proxy auth, never provider key', async () => {
  for(const mode of ['acp','resume']) {
    let captured, closed = false
    const spawnImpl = (exe, args, options) => {
      captured={exe,args,options}
      const child = new EventEmitter()
      queueMicrotask(()=>child.emit('exit',0,null))
      return child
    }
    const proxyFactory = async ({key,endpoint}) => {
      assert.equal(key,'secret-key-do-not-forward')
      assert.equal(endpoint,GATEWAY)
      return {token:'temporary-session-token',baseUrl:'http://127.0.0.1:18427/v1',close:async()=>{closed=true}}
    }
    const exit = await launchQwen({
      key:'secret-key-do-not-forward',model:'test-model',prompt:'',
      acp:mode==='acp',resumeSession:mode==='resume',sessionId:mode==='resume'?uuid:undefined,
      env:{PATH:'ok',BOTCONNECTOR_API_KEY:'secret-key-do-not-forward'},
      entrypoint:'engine.js',spawnImpl,proxyFactory,
    })
    assert.equal(exit,0)
    assert.equal(captured.options.shell,false)
    assert.equal(captured.options.stdio,'inherit')
    assert.ok(captured.args.includes(mode==='acp'?'--acp':'--resume'))
    assert.equal(captured.options.env.OPENAI_API_KEY,'temporary-session-token')
    assert.equal(captured.options.env.BOTCONNECTOR_API_KEY,undefined)
    assert.ok(!JSON.stringify(captured).includes('secret-key-do-not-forward'))
    assert.ok(closed)
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { promptProviderKey, confirmRemoveProviderKey } from '../native-key-dialog.mjs'

function mockSpawn({ code = 0, output = '' } = {}) {
  const calls = []
  function spawnImpl(executable, args, options) {
    calls.push({ executable, args, options })
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.kill = () => {}
    queueMicrotask(() => {
      if (output) child.stdout.emit('data', Buffer.from(output))
      child.emit('close', code)
    })
    return child
  }
  return { calls, spawnImpl }
}

test('native Windows key entry is hidden, no credential enters CLI arguments or environment', async () => {
  const runner = mockSpawn({ output: 'sk-unit-test-sample' })
  const secret = await promptProviderKey('openrouter', { platform:'win32', spawnImpl:runner.spawnImpl })
  assert.equal(secret,'sk-unit-test-sample')
  const { executable,args,options }=runner.calls[0]
  assert.equal(executable,'powershell.exe')
  assert.deepEqual(args.slice(0,3),['-NoProfile','-NonInteractive','-STA'])
  assert.match(args[4],/UseSystemPasswordChar=\$true/)
  assert.match(args[4],/ShowDialog/)
  assert.equal(options.env.BCCLI_DIALOG_PROVIDER,'openrouter')
  assert.doesNotMatch(args.join(' '),/sk-unit-test-sample/)
  assert.equal(options.shell,false)
  assert.equal(options.stdio[0],'ignore')
})

test('cancelled key dialog and cancelled removal change no credentials', async () => {
  const key = mockSpawn({ code:2 })
  assert.equal(await promptProviderKey('openai',{platform:'win32',spawnImpl:key.spawnImpl}),null)
  const remove = mockSpawn({ code:2 })
  assert.equal(await confirmRemoveProviderKey('openai',{platform:'win32',spawnImpl:remove.spawnImpl}),false)
  assert.match(remove.calls[0].args[4],/MessageBoxButtons\]::YesNo/)
  assert.match(remove.calls[0].args[4],/MessageBoxDefaultButton\]::Button2/)
})

test('invalid providers and non-Windows desktop never open a dialog',async()=>{
  const no = mockSpawn()
  await assert.rejects(promptProviderKey('../../passwd',{platform:'win32',spawnImpl:no.spawnImpl}),/Unknown provider/)
  await assert.rejects(promptProviderKey('openai',{platform:'linux',spawnImpl:no.spawnImpl}),/require Windows/)
  assert.equal(no.calls.length,0)
})

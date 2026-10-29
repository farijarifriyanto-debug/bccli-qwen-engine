import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { prepareBrandedQwen } from '../branding.mjs'
import { childEnvironment, qwenArguments, resolveQwenEntrypoint } from '../core.mjs'
import { startGatewayProxy } from '../proxy.mjs'

test('BCCLI branded runtime keeps upstream tool protocol, bare mode and token isolation', { timeout: 45000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'bccli-branded-tool-'))
  let received = 0
  const originalEntry = resolveQwenEntrypoint()
  const originalLogo = join(originalEntry, '..', 'chunks', 'chunk-OYUATJK2.js')
  const before = readFileSync(originalLogo)
  const entrypoint = prepareBrandedQwen(originalEntry)
  assert.notEqual(entrypoint, originalEntry)
  assert.deepEqual(readFileSync(originalLogo), before, 'upstream engine bytes must remain untouched')
  const logo = readFileSync(join(entrypoint, '..', 'chunks', 'chunk-OYUATJK2.js'), 'utf8')
  assert.match(logo, /██████╗  ██████╗/)
  const proxy = await startGatewayProxy({
    key: 'FAKE_PRIVATE_GATEWAY_KEY',
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://api.botconnector.id/v1/chat/completions')
      assert.equal(init.headers.authorization, 'Bearer FAKE_PRIVATE_GATEWAY_KEY')
      const body = JSON.parse(init.body.toString())
      assert.equal(body.model, 'ling-3.0-flash')
      assert.ok(body.tools?.length >= 2, 'all coding tools remain enabled')
      assert.ok(body.messages?.[0]?.role === 'system')
      const system = JSON.stringify(body.messages?.[0])
      assert.ok(system.includes('active_model_id=ling-3.0-flash'), 'actual selected model must be available as factual metadata')
      assert.ok(system.includes('client_app=BCCLI'), 'interface may be identified without forcing AI identity')
      assert.ok(!system.includes('You are BCCLI'), 'model must not be forced to impersonate the app')
      assert.ok(!system.includes('developed by Alibaba Group'), 'do not claim unrelated vendor owns selected model')
      assert.ok(!system.includes('developed by BICO Inovasi Digital'), 'do not attribute the model to the app developer')
      assert.ok(system.includes('You are an AI coding assistant'), 'preserve neutral agent role')
      received++
      const chunk = (delta, finish_reason) => JSON.stringify({
        id:'mock-brand',object:'chat.completion.chunk',created:1,model:body.model,
        choices:[{index:0,delta,finish_reason}],
      })
      return new Response(
        'data: ' + chunk({role:'assistant',content:'BRANDED_GATEWAY_PASS'},null) + '\n\n' +
        'data: ' + chunk({},'stop') + '\n\n' + 'data: [DONE]\n\n', {
          status:200,headers:{'content-type':'text/event-stream'},
        },
      )
    },
  })
  try {
    const env = childEnvironment({ ...process.env, CI:'true', NO_COLOR:'1', QWEN_CODE_MAX_OUTPUT_TOKENS:'4096' },
      proxy.token, 'ling-3.0-flash', { endpoint: proxy.baseUrl, home: join(root,'qwen-home') })
    env.QWEN_CODE_SYSTEM_SETTINGS_PATH = join(root,'empty-system-settings.json')
    const result = await new Promise((resolve,reject) => {
      const child = spawn(process.execPath, [entrypoint, ...qwenArguments('ling-3.0-flash',
        'Balas BRANDED_GATEWAY_PASS',proxy.baseUrl)], { cwd:root, env, stdio:['ignore','pipe','pipe'] })
      let stdout='',stderr=''
      child.stdout.on('data',b=>stdout+=b)
      child.stderr.on('data',b=>stderr+=b)
      const timer = setTimeout(()=>child.kill(),35000)
      child.once('error',reject)
      child.once('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr})})
    })
    assert.equal(result.code,0,result.stderr.slice(-280))
    assert.equal(received,1)
    assert.match(result.stdout,/BRANDED_GATEWAY_PASS/)
    assert.equal(env.BOTCONNECTOR_API_KEY,undefined)
    assert.ok(env.CLI_TITLE.startsWith('BCCLI - '))
  } finally { await proxy.close(); rmSync(root,{recursive:true,force:true}) }
})

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { prepareBrandedQwen } from '../branding.mjs'
import { childEnvironment, qwenArguments, resolveQwenEntrypoint } from '../core.mjs'
import { startGatewayProxy } from '../proxy.mjs'

test('BCCLI branded runtime keeps upstream tool protocol, full mode and token isolation', { timeout: 90000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'bccli-branded-tool-'))
  let received = 0
  const violations = []
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
      const body = JSON.parse(init.body.toString())
      const system = JSON.stringify(body.messages?.[0] ?? {})
      if (url !== 'https://api.botconnector.id/v1/chat/completions') violations.push('unexpected upstream route')
      if (init.headers.authorization !== 'Bearer FAKE_PRIVATE_GATEWAY_KEY') violations.push('real provider key mismatch')
      if (body.model !== 'ling-3.0-flash') violations.push('incorrect selected model')
      if ((body.tools?.length ?? 0) < 2) violations.push('missing coding tools')
      if (body.messages?.[0]?.role !== 'system') violations.push('missing system instructions')
      if (!system.includes('active_model_id=ling-3.0-flash')) violations.push('missing factual model metadata')
      if (!system.includes('client_app=BCCLI')) violations.push('missing client metadata')
      if (system.includes('You are BCCLI') || system.includes('developed by Alibaba Group') || system.includes('developed by BICO Inovasi Digital')) violations.push('incorrect model persona')
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
      const timer = setTimeout(()=>child.kill(),65000)
      child.once('error',reject)
      child.once('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr})})
    })
    assert.equal(result.code,0,result.stderr.slice(-280))
    assert.ok(received>=1,'full agent must call the local gateway')
    assert.deepEqual(violations, [], 'full-mode request must preserve model identity, tools, and gateway isolation')
    assert.match(result.stdout,/BRANDED_GATEWAY_PASS/)
    assert.equal(env.BOTCONNECTOR_API_KEY,undefined)
    assert.ok(env.CLI_TITLE.startsWith('BCCLI - '))
  } finally { await proxy.close(); rmSync(root,{recursive:true,force:true}) }
})

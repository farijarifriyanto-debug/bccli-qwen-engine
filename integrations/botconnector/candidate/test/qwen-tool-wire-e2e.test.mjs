import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { childEnvironment, qwenArguments, resolveQwenEntrypoint } from '../core.mjs'
import { prepareBrandedQwen } from '../branding.mjs'
import { startGatewayProxy } from '../proxy.mjs'

test('real Qwen 0.26.3 full-registry tool schemas reach strict upstream', { timeout: 90000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bccli-qwen-tools-'))
  const seen = []
  const proxy = await startGatewayProxy({
    key: 'MOCK_ONLY_REAL_KEY',
    fetchImpl: async (url, options) => {
      assert.match(url, /\/chat\/completions$/)
      assert.equal(options.headers.authorization, 'Bearer MOCK_ONLY_REAL_KEY')
      const body = JSON.parse(options.body.toString())
      const goal = body.tools?.find((tool) => tool.function?.name === 'get_goal')
      const readFile = body.tools?.find((tool) => tool.function?.name === 'read_file')
      seen.push({ toolCount: body.tools?.length, goal, readFile })
      // Mirror strict schema validation: the first rejected tool was get_goal,
      // the next provider rejection was the read_file nullable type union.
      const typeUnions = (value) => {
        if (!value || typeof value !== 'object') return false
        if (Array.isArray(value.type)) return true
        return Object.entries(value).some(([k, v]) => k !== 'enum' && (
          Array.isArray(v) ? v.some(typeUnions) : typeUnions(v)
        ))
      }
      if ((goal && goal.function.parameters?.type !== 'object')
          || body.tools.some((tool) => typeUnions(tool.function?.parameters))) {
        return new Response(JSON.stringify({ error: { message: "Invalid request body, Failed to parse tool schema" } }), {
          status: 400, headers: { 'content-type': 'application/json' },
        })
      }
      const chunk = (delta, finish_reason) => JSON.stringify({
        id: 'mock-tools', object: 'chat.completion.chunk', created: 1, model: 'agnes-3.0-flash',
        choices: [{ index: 0, delta, finish_reason }],
      })
      return new Response(
        'data: ' + chunk({ role: 'assistant', content: 'E2E_OK' }, null) + '\n\n' +
        'data: ' + chunk({}, 'stop') + '\n\n' + 'data: [DONE]\n\n', {
          status: 200, headers: { 'content-type': 'text/event-stream' },
        },
      )
    },
  })
  try {
    const env = childEnvironment({ ...process.env, NO_COLOR: '1', CI: 'true', QWEN_CODE_MAX_OUTPUT_TOKENS: '4096' },
      proxy.token, 'agnes-3.0-flash', { endpoint: proxy.baseUrl, home: path.join(root, 'qwen-home') })
    env.QWEN_CODE_SYSTEM_SETTINGS_PATH = path.join(root, 'system-settings.json')
    const args = [prepareBrandedQwen(resolveQwenEntrypoint(), { cacheRoot: path.join(root, 'branded-engine') }), ...qwenArguments('agnes-3.0-flash', 'Balas tepat E2E_OK', proxy.baseUrl)]
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = ''
      child.stdout.on('data', (data) => { stdout += data.toString() })
      child.stderr.on('data', (data) => { stderr += data.toString() })
      const timer = setTimeout(() => child.kill(), 65000)
      child.once('error', (error) => { clearTimeout(timer); reject(error) })
      child.once('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
    })
    assert.equal(result.code, 0, result.stderr.slice(-250))
    assert.match(result.stdout, /E2E_OK/)
    assert.ok(seen.length >= 1, 'full engine must send model requests')
    assert.ok(seen[0].toolCount >= 2, 'Qwen coding tools must remain enabled')
    if (seen[0].goal) assert.deepEqual(seen[0].goal.function.parameters, { type: 'object', properties: {} })
    assert.ok(seen[0].readFile, 'read_file must remain available')
    assert.equal(seen[0].readFile.function.parameters.properties.offset.type, 'integer')
    assert.equal(seen[0].readFile.function.parameters.properties.limit.type, 'integer')
    assert.equal(seen[0].readFile.function.parameters.properties.pages.type, 'string')
  } finally {
    await proxy.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

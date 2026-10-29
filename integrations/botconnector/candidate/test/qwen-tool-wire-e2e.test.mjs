import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { childEnvironment, qwenArguments, resolveQwenEntrypoint } from '../core.mjs'
import { startGatewayProxy } from '../proxy.mjs'

test('real Qwen 0.26.3 tools reach strict upstream with valid get_goal parameters', { timeout: 30000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bccli-qwen-tools-'))
  const seen = []
  const proxy = await startGatewayProxy({
    key: 'MOCK_ONLY_REAL_KEY',
    fetchImpl: async (url, options) => {
      assert.match(url, /\/chat\/completions$/)
      assert.equal(options.headers.authorization, 'Bearer MOCK_ONLY_REAL_KEY')
      const body = JSON.parse(options.body.toString())
      const goal = body.tools?.find((tool) => tool.function?.name === 'get_goal')
      seen.push({ toolCount: body.tools?.length, goal })
      if (!goal?.function?.parameters || goal.function.parameters.type !== 'object') {
        return new Response(JSON.stringify({ error: { message: "Invalid request body, Failed to parse '.tools[1]'" } }), {
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
    const args = [resolveQwenEntrypoint(), ...qwenArguments('agnes-3.0-flash', 'Balas tepat E2E_OK', proxy.baseUrl)]
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = ''
      child.stdout.on('data', (data) => { stdout += data.toString() })
      child.stderr.on('data', (data) => { stderr += data.toString() })
      const timer = setTimeout(() => child.kill(), 22000)
      child.once('error', (error) => { clearTimeout(timer); reject(error) })
      child.once('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
    })
    assert.equal(result.code, 0, result.stderr.slice(-250))
    assert.match(result.stdout, /E2E_OK/)
    assert.equal(seen.length, 1)
    assert.ok(seen[0].toolCount >= 2, 'Qwen coding tools must remain enabled')
    assert.deepEqual(seen[0].goal.function.parameters, { type: 'object', properties: {} })
  } finally {
    await proxy.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// BCCLI candidate adapter. Intentionally outside the Qwen Code engine.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { startGatewayProxy } from './proxy.mjs'

export const GATEWAY = 'https://api.botconnector.id/v1'
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,255}$/
const ALLOWED = new Set(['models', 'run', 'chat'])

export function parseArgs(argv) {
  const args = [...argv]
  const command = ALLOWED.has(args[0]) ? args.shift() : 'chat'
  let model, json = false
  const prompt = []
  while (args.length) {
    const arg = args.shift()
    if (arg === '--model' || arg === '-m') {
      if (model !== undefined || !args.length) throw Error('Specify --model exactly once with an ID.')
      model = args.shift()
      continue
    }
    if (arg === '--json' && command === 'models') { json = true; continue }
    if (arg.startsWith('-')) throw Error('Unsupported option. POC intentionally blocks passthrough flags.')
    prompt.push(arg)
  }
  if (command === 'models' && (model || prompt.length)) throw Error('Use: models [--json].')
  if (command === 'run' && !prompt.length) throw Error('Use: run --model MODEL "prompt".')
  return { command, model, json, prompt: prompt.join(' ') }
}

export async function discoverModels({ key, fetchImpl = fetch, endpoint = GATEWAY }) {
  if (!key || !key.trim()) throw Error('BOTCONNECTOR_API_KEY is required (do not supply it as a CLI argument).')
  let response
  try {
    response = await fetchImpl(endpoint + '/models', {
      method: 'GET',
      headers: { authorization: 'Bearer ' + key, accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    })
  } catch {
    throw Error('Gateway model discovery failed; no fallback provider was used.')
  }
  if (!response.ok) throw Error('Gateway model discovery failed (HTTP ' + response.status + ').')
  let payload
  try { payload = await response.json() }
  catch { throw Error('Gateway model discovery returned invalid JSON.') }
  if (!Array.isArray(payload?.data)) throw Error('Gateway model discovery returned no model list.')
  const models = new Map()
  for (const item of payload.data) {
    if (typeof item?.id === 'string' && MODEL_ID.test(item.id)) {
      models.set(item.id, { id: item.id, name: typeof item.name === 'string' ? item.name : item.id })
    }
  }
  if (!models.size) throw Error('No valid models available to this key.')
  return [...models.values()]
}

export function selectModel(models, value) {
  if (!value) throw Error('Select a model with --model ID or BOTCONNECTOR_MODEL_ID; run models first.')
  if (!MODEL_ID.test(value)) throw Error('Invalid model ID.')
  if (!models.some((item) => item.id === value)) throw Error('Model is not available for this BotConnector API key.')
  return value
}

export function qwenArguments(model, prompt, endpoint = GATEWAY) {
  // --bare is security critical: project settings may otherwise override
  // the provider baseUrl, forwarding an API key to an attacker-controlled endpoint.
  const args = [
    '--bare', '--auth-type', 'openai',
    '--openai-base-url', endpoint,
    '--model', model, '--approval-mode', 'default',
    '--telemetry=false',
  ]
  if (prompt) args.push(prompt)
  return args
}

export function childEnvironment(base, key, model, { endpoint = GATEWAY, home } = {}) {
  const env = { ...base }
  // Prevent inherited cross-provider auth from becoming another route or key.
  for (const name of [
    'QWEN_OAUTH', 'BOTCONNECTOR_API_KEY', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL', 'QWEN_MODEL',
    'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'GEMINI_API_KEY',
    'GOOGLE_API_KEY', 'OPENROUTER_API_KEY', 'QWENCLOUD_API_KEY',
    'QWENCLOUD_TOKEN_PLAN_API_KEY',
  ]) delete env[name]
  env.OPENAI_API_KEY = key
  env.OPENAI_BASE_URL = endpoint
  env.OPENAI_MODEL = model
  env.QWEN_MODEL = model
  env.QWEN_HOME = home ?? join(homedir(), '.bccli-qwen-candidate')
  return env
}

export function resolveQwenEntrypoint() {
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve('@qwen-code/qwen-code/package.json')), 'cli-entry.js')
}

export async function launchQwen({ key, model, prompt, env = process.env, entrypoint = resolveQwenEntrypoint(), spawnImpl = spawn, proxyFactory = startGatewayProxy }) {
  // The real API key never enters Qwen, its tools, or any MCP child process.
  // Only this launcher retains it while the ephemeral proxy is running.
  const proxy = await proxyFactory({ key })
  try {
    const args = [entrypoint, ...qwenArguments(model, prompt, proxy.baseUrl)]
    const child = spawnImpl(process.execPath, args, {
      cwd: process.cwd(), env: childEnvironment(env, proxy.token, model, { endpoint: proxy.baseUrl }),
      stdio: 'inherit', windowsHide: false, shell: false,
    })
    return await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 130 : 1)))
    })
  } finally {
    await proxy.close()
  }
}

// BCCLI Preview provider keys: explicit OpenAI-compatible presets only.
// Windows stores provider API keys as per-user DPAPI encrypted blobs. The
// upstream Qwen process receives only an ephemeral loopback proxy token.
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { botConnectorCredentialStatus, botConnectorKey } from './credentials.mjs'
import { GATEWAY } from './gateway.mjs'

export const PROVIDERS = Object.freeze({
  botconnector: Object.freeze({ name: 'BotConnector Cloud', endpoint: GATEWAY }),
  openai: Object.freeze({ name: 'OpenAI API', endpoint: 'https://api.openai.com/v1', env: 'OPENAI_API_KEY' }),
  openrouter: Object.freeze({ name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1', env: 'OPENROUTER_API_KEY' }),
  deepseek: Object.freeze({ name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', env: 'DEEPSEEK_API_KEY' }),
  groq: Object.freeze({ name: 'Groq', endpoint: 'https://api.groq.com/openai/v1', env: 'GROQ_API_KEY' }),
  xai: Object.freeze({ name: 'xAI', endpoint: 'https://api.x.ai/v1', env: 'XAI_API_KEY' }),
  'ollama-cloud': Object.freeze({ name: 'Ollama Cloud', endpoint: 'https://ollama.com/v1', env: 'OLLAMA_API_KEY' }),
  together: Object.freeze({ name: 'Together AI', endpoint: 'https://api.together.xyz/v1', env: 'TOGETHER_API_KEY' }),
  fireworks: Object.freeze({ name: 'Fireworks AI', endpoint: 'https://api.fireworks.ai/inference/v1', env: 'FIREWORKS_API_KEY' }),
  mistral: Object.freeze({ name: 'Mistral AI', endpoint: 'https://api.mistral.ai/v1', env: 'MISTRAL_API_KEY' }),
  cerebras: Object.freeze({ name: 'Cerebras Cloud', endpoint: 'https://api.cerebras.ai/v1', env: 'CEREBRAS_API_KEY' }),
  sambanova: Object.freeze({ name: 'SambaNova Cloud', endpoint: 'https://api.sambanova.ai/v1', env: 'SAMBANOVA_API_KEY' }),
  nvidia: Object.freeze({ name: 'NVIDIA NIM', endpoint: 'https://integrate.api.nvidia.com/v1', env: 'NVIDIA_API_KEY' }),
  huggingface: Object.freeze({ name: 'Hugging Face Router', endpoint: 'https://router.huggingface.co/v1', env: 'HF_TOKEN' }),
  moonshot: Object.freeze({ name: 'Moonshot AI', endpoint: 'https://api.moonshot.ai/v1', env: 'MOONSHOT_API_KEY' }),
  zai: Object.freeze({ name: 'Z.AI', endpoint: 'https://api.z.ai/api/paas/v4', env: 'ZAI_API_KEY' }),

})
export const ALLOWED_PROVIDER_ENDPOINTS = Object.freeze(Object.values(PROVIDERS).map(p => p.endpoint))
const ID = /^[a-z][a-z0-9-]{0,31}$/
const MAX_BLOB_BYTES = 64 * 1024
const MAX_CATALOG_BYTES = 32 * 1024
const BAD_SUFFIX = /\.(?:local|localhost|internal|lan|home|test|invalid|example|onion)$/i
export function validateCustomProvider({ id, name, endpoint }) {
  if (!ID.test(id) || Object.hasOwn(PROVIDERS,id)) throw Error('Custom provider ID is invalid or already reserved.')
  if (typeof name !== 'string' || name.length < 2 || name.length > 64 || /[\r\n<>]/.test(name)) throw Error('Invalid custom provider name.')
  if (typeof endpoint !== 'string' || endpoint.length > 240) throw Error('Custom endpoint URL is too long.')
  let u
  try { u = new URL(endpoint) } catch { throw Error('Custom endpoint must be a valid HTTPS URL.') }
  const host = u.hostname.toLowerCase()
  if (u.protocol !== 'https:' || u.port || u.username || u.password || u.search || u.hash ||
      host.endsWith('.') || BAD_SUFFIX.test(host) ||
      !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(host) || host.split('.').some(x=>x.startsWith('-')||x.endsWith('-')) ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
      !/^\/(?:[a-zA-Z0-9_-]+\/){0,5}[a-zA-Z0-9_-]+$/.test(u.pathname) ||
      !u.pathname.endsWith('/v1') && !u.pathname.endsWith('/v4')) throw Error('Custom provider requires a public HTTPS OpenAI-compatible /v1 or /v4 endpoint.')
  return Object.freeze({ name: name.trim(), endpoint: u.origin + u.pathname, custom: true })
}
export function customProviderCatalog({ root = providerRoot() } = {}) {
  if (!ownerDirectory(root)) return {}
  const path = join(root, 'custom-providers.json')
  if (!existsSync(path)) return {}
  const meta=lstatSync(path)
  if (!meta.isFile() || meta.isSymbolicLink() || meta.size > MAX_CATALOG_BYTES) throw Error('Unsafe custom provider registry.')
  const parsed=JSON.parse(readFileSync(path,'utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('Invalid custom provider catalog.')
  const entries=Object.entries(parsed)
  if (entries.length>48) throw Error('Too many custom providers.')
  const result=Object.create(null)
  for (const [id, config] of entries) {
    if (!config || typeof config !== 'object') throw Error('Invalid provider record')
    result[id]=validateCustomProvider({id,name:config.name,endpoint:config.endpoint})
  }
  return result
}
export function listProviderDefinitions({ root = providerRoot() } = {}) {
  return { ...PROVIDERS, ...customProviderCatalog({ root }) }
}
export function registerCustomProvider(id, name, endpoint, { root = providerRoot() } = {}) {
  const config=validateCustomProvider({ id, name, endpoint })
  ownerDirectory(root,{create:true})
  const data=customProviderCatalog({root})
  if (Object.hasOwn(data,id)) throw Error('Custom provider already exists.')
  if (Object.keys(data).length>=48) throw Error('Custom provider limit reached.')
  const path=join(root,'custom-providers.json')
  if (existsSync(path) && (!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink())) throw Error('Unsafe custom provider catalog.')
  const tmp=path+'.'+randomBytes(8).toString('hex')+'.tmp'
  try {
    writeFileSync(tmp,JSON.stringify({...data,[id]:config},null,2)+'\n',{encoding:'utf8',flag:'wx',mode:0o600})
    renameSync(tmp,path)
  }finally{rmSync(tmp,{force:true})}
  return {id,...config}
}
export function approvedProviderEndpoint(endpoint, { root = providerRoot() } = {}) {
  return Object.values(listProviderDefinitions({root})).some(p=>p.endpoint===endpoint)
}

const ENC_SCRIPT = '$ErrorActionPreference="Stop"; $plain=[Console]::In.ReadToEnd().Trim(); if(-not $plain){exit 1}; $sec=ConvertTo-SecureString -String $plain -AsPlainText -Force; [Console]::Out.Write((ConvertFrom-SecureString -SecureString $sec))'
const DEC_SCRIPT = '$ErrorActionPreference="Stop"; $encoded=[Console]::In.ReadToEnd().Trim(); $sec=ConvertTo-SecureString -String $encoded; $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec); try{[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}'

export function providerRoot({ home = homedir(), env = process.env } = {}) {
  const path = env.BCCLI_PREVIEW_HOME || join(home, '.bccli-preview')
  if (!isAbsolute(path)) throw Error('BCCLI_PREVIEW_HOME must be absolute.')
  return path
}
export function providerDefinition(id) {
  const definitions=listProviderDefinitions()
  if (!Object.hasOwn(definitions,id)) throw Error('Unknown provider. Choose from: '+Object.keys(definitions).join(', '))
  return definitions[id]
}
function ownerDirectory(root, { create = false } = {}) {
  if (create) mkdirSync(root, { recursive: true, mode: 0o700 })
  if (!existsSync(root)) return false
  const info = lstatSync(root)
  if (!info.isDirectory() || info.isSymbolicLink()) throw Error('Preview credential directory is not a safe regular directory.')
  return true
}
function keyPath(root, id) {
  if (!ID.test(id)) throw Error('Provider key storage requires a supported provider.')
  return join(root, 'provider-' + id + '.dpapi')
}
function dpapi(script, input, { platform = process.platform, runner = spawnSync } = {}) {
  if (platform !== 'win32') throw Error('Persisting provider API keys currently requires Windows DPAPI. Use the provider environment variable on other systems.')
  const result = runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input, encoding: 'utf8', timeout: 15000, maxBuffer: MAX_BLOB_BYTES, windowsHide: true,
    env: { ...process.env, PSModulePath: process.env.PSModulePath },
  })
  if (result.error || result.status !== 0 || !result.stdout?.trim()) throw Error('Windows protected credential operation failed; no key was printed.')
  return result.stdout.trim()
}
export function saveProviderKey(id, key, { root = providerRoot(), platform = process.platform, runner = spawnSync } = {}) {
  providerDefinition(id)
  if (typeof key !== 'string' || !key.trim() || key.length > 8192 || /[\r\n]/.test(key)) throw Error('API key cannot be empty, multiline, or oversized.')
  if (platform !== 'win32') throw Error('On non-Windows systems, use the provider API key environment variable.')
  ownerDirectory(root, { create: true })
  const ciphertext = dpapi(ENC_SCRIPT, key.trim(), { platform, runner })
  if (ciphertext.length > MAX_BLOB_BYTES || !/^[0-9a-f]+$/i.test(ciphertext)) throw Error('Windows credential encryption returned an invalid format.')
  const path = keyPath(root, id)
  if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())) throw Error('Unsafe provider credentials path.')
  const temporary = path + '.' + randomBytes(8).toString('hex') + '.tmp'
  try {
    writeFileSync(temporary, ciphertext + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    renameSync(temporary, path)
  } finally { rmSync(temporary, { force: true }) }
}
export function storedProviderKey(id, { root = providerRoot(), platform = process.platform, runner = spawnSync } = {}) {
  providerDefinition(id)
  if (!ownerDirectory(root)) throw Error('Provider not configured. Run provider add.')
  const path = keyPath(root, id)
  let info
  try { info = lstatSync(path) }
  catch { throw Error('Provider not configured. Run provider add.') }
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BLOB_BYTES) throw Error('Unsafe provider credentials file.')
  const cipher = readFileSync(path, 'utf8')
  if (!/^[0-9a-f]+\s*$/i.test(cipher)) throw Error('Provider credentials are invalid.')
  return dpapi(DEC_SCRIPT, cipher, { platform, runner })
}
export function isConfigured(id, { env = process.env, root = providerRoot({env}) } = {}) {
  providerDefinition(id)
  if (id === 'botconnector') {
    if (env.BOTCONNECTOR_API_KEY?.trim()) return true
    try {
      if (ownerDirectory(root)) {
        const info = lstatSync(keyPath(root, id))
        if (info.isFile() && !info.isSymbolicLink() && info.size <= MAX_BLOB_BYTES) return true
      }
    } catch {}
    return botConnectorCredentialStatus({ env }).configured
  }
  if (providerDefinition(id).env && env[providerDefinition(id).env]?.trim()) return true
  try { return ownerDirectory(root) && lstatSync(keyPath(root, id)).isFile() && !lstatSync(keyPath(root, id)).isSymbolicLink() }
  catch { return false }
}
export function selectedProvider({ env = process.env, root = providerRoot({env}) } = {}) {
  if (!ownerDirectory(root)) return 'botconnector'
  const path = join(root, 'active-provider')
  if (!existsSync(path)) return 'botconnector'
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > 128) throw Error('Unsafe provider selection file.')
  const id = readFileSync(path, 'utf8').trim()
  providerDefinition(id)
  return id
}
// Model IDs are public selections, never credentials. Keep one per provider
// so a returning user goes directly to chat without repeating the model picker.
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,255}$/
export function selectedModel(id, { env = process.env, root = providerRoot({ env }) } = {}) {
  providerDefinition(id)
  if (!ownerDirectory(root)) return undefined
  const path = join(root, 'active-model-' + id)
  if (!existsSync(path)) return undefined
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > 300) throw Error('Unsafe model selection file.')
  const value = readFileSync(path, 'utf8').trim()
  if (!MODEL_ID.test(value)) throw Error('Invalid saved model selection.')
  return value
}

export function saveSelectedModel(id, model, { env = process.env, root = providerRoot({ env }) } = {}) {
  providerDefinition(id)
  if (!MODEL_ID.test(model)) throw Error('Invalid model ID.')
  ownerDirectory(root, { create: true })
  const path = join(root, 'active-model-' + id)
  if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())) {
    throw Error('Unsafe model selection path.')
  }
  const tmp = path + '.' + randomBytes(8).toString('hex') + '.tmp'
  try { writeFileSync(tmp, model + '\n', { flag: 'wx', encoding: 'utf8', mode: 0o600 }); renameSync(tmp, path) }
  finally { rmSync(tmp, { force: true }) }
}

export function useProvider(id, { env = process.env, root = providerRoot({env}) } = {}) {
  providerDefinition(id)
  if (!isConfigured(id, { env, root })) throw Error('Provider is not configured. Use: provider add ' + id + ' (or its API key environment variable).')
  ownerDirectory(root, { create: true })
  const path = join(root, 'active-provider')
  if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())) throw Error('Unsafe provider selection path.')
  const tmp = path + '.' + randomBytes(8).toString('hex') + '.tmp'
  try { writeFileSync(tmp, id + '\n', { flag: 'wx', encoding: 'utf8', mode: 0o600 }); renameSync(tmp, path) }
  finally { rmSync(tmp, { force: true }) }
}
export function removeProvider(id, { env = process.env, root = providerRoot({env}) } = {}) {
  providerDefinition(id)
  if (!ownerDirectory(root)) return
  const path = keyPath(root, id)
  if (existsSync(path)) {
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw Error('Unsafe provider credential path.')
    rmSync(path)
  }
  if (selectedProvider({env,root}) === id) {
    const active = join(root, 'active-provider')
    rmSync(active, {force:true})
  }
}
export function resolveProvider(id, { env = process.env, root = providerRoot({env}) } = {}) {
  const info = providerDefinition(id)
  if (id === 'botconnector') {
    // Saved keys take precedence; legacy credentials are read only as fallback.
    try { return { id, ...info, key: storedProviderKey(id, { root }) } }
    catch (error) {
      if (error?.message !== 'Provider not configured. Run provider add.') throw error
      return { id, ...info, key: botConnectorKey({ env }) }
    }
  }
  // An explicit key saved through "provider add" must win over stale environment
  // variables. Never silently fall back if the encrypted file is corrupted.
  let key
  try { key = storedProviderKey(id, {root}) }
  catch (error) {
    if (error?.message !== 'Provider not configured. Run provider add.') throw error
    key = info.env ? env[info.env]?.trim() : undefined
  }
  if (!key) throw Error('Provider not configured. Run provider add ' + id + ' or set ' + info.env + '.')
  return { id, ...info, key }
}

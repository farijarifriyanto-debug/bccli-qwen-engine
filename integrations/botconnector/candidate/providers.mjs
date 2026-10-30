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
})
export const ALLOWED_PROVIDER_ENDPOINTS = Object.freeze(Object.values(PROVIDERS).map(p => p.endpoint))
const ID = /^[a-z][a-z0-9-]{0,31}$/
const MAX_BLOB_BYTES = 64 * 1024
const ENC_SCRIPT = '$ErrorActionPreference="Stop"; $plain=[Console]::In.ReadToEnd().Trim(); if(-not $plain){exit 1}; $sec=ConvertTo-SecureString -String $plain -AsPlainText -Force; [Console]::Out.Write((ConvertFrom-SecureString -SecureString $sec))'
const DEC_SCRIPT = '$ErrorActionPreference="Stop"; $encoded=[Console]::In.ReadToEnd().Trim(); $sec=ConvertTo-SecureString -String $encoded; $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec); try{[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}'

export function providerRoot({ home = homedir(), env = process.env } = {}) {
  const path = env.BCCLI_PREVIEW_HOME || join(home, '.bccli-preview')
  if (!isAbsolute(path)) throw Error('BCCLI_PREVIEW_HOME must be absolute.')
  return path
}
export function providerDefinition(id) {
  if (!Object.hasOwn(PROVIDERS, id)) throw Error('Unknown provider. Choose from: ' + Object.keys(PROVIDERS).join(', '))
  return PROVIDERS[id]
}
function ownerDirectory(root, { create = false } = {}) {
  if (create) mkdirSync(root, { recursive: true, mode: 0o700 })
  if (!existsSync(root)) return false
  const info = lstatSync(root)
  if (!info.isDirectory() || info.isSymbolicLink()) throw Error('Preview credential directory is not a safe regular directory.')
  return true
}
function keyPath(root, id) {
  if (!ID.test(id) || !Object.hasOwn(PROVIDERS, id)) throw Error('Provider key storage requires a supported provider.')
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
  // An owner-bound BCCLI DPAPI key wins; preserve the older public BCCLI login
  // as read-only fallback, and never migrate or overwrite it implicitly.
  try {
    if (ownerDirectory(root) && lstatSync(keyPath(root, id)).isFile() && !lstatSync(keyPath(root, id)).isSymbolicLink()) return true
  } catch { /* No encrypted key; fall back only when absent. */ }
  if (id === 'botconnector') return botConnectorCredentialStatus({ env }).configured
  return !!env[PROVIDERS[id].env]?.trim()
}

export function botConnectorProviderStatus({ env = process.env, root = providerRoot({env}) } = {}) {
  try {
    if (ownerDirectory(root) && existsSync(keyPath(root, 'botconnector'))) {
      const info = lstatSync(keyPath(root, 'botconnector'))
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BLOB_BYTES) {
        return { configured: false, source: 'unsafe-encrypted-file' }
      }
      return { configured: true, source: 'encrypted-bccli' }
    }
  } catch { return { configured: false, source: 'invalid-preview-storage' } }
  return botConnectorCredentialStatus({env})
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
  if (id === 'botconnector') throw Error('BotConnector credentials are managed by existing public bccli.')
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
  // An explicit key saved through "provider add" must win over stale environment
  // variables. Never silently fall back if the encrypted file is corrupted.
  let key
  try { key = storedProviderKey(id, {root}) }
  catch (error) {
    if (error?.message !== 'Provider not configured. Run provider add.') throw error
    key = id === 'botconnector' ? botConnectorKey({env}) : env[info.env]?.trim()
  }
  if (!key) throw Error('Provider not configured. Run provider add ' + id + ' or set its environment API key.')
  return { id, ...info, key }
}

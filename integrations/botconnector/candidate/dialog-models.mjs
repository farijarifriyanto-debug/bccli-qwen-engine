// The upstream /model picker lists models from settings.modelProviders. BCCLI's
// engine can only reach the parent-owned loopback proxy, so publish the live
// gateway catalog into the per-provider QWEN_HOME as one OpenAI-compatible
// provider. BCCLI only supplies the eligible model set and reads back the
// persisted selection: the primary picker is BCCLI's own searchable dialog
// (see model-dialog.mjs), while the auxiliary pickers stay upstream-owned.
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'

const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,255}$/
const LOOPBACK_ENDPOINT = /^http:\/\/127\.0\.0\.1:[0-9]{1,5}\/v1$/
const MAX_SETTINGS_BYTES = 1024 * 1024

export function buildDialogProviders(models, baseUrl) {
  if (typeof baseUrl !== 'string' || !LOOPBACK_ENDPOINT.test(baseUrl)) {
    throw Error('Model picker requires the local loopback provider endpoint.')
  }
  if (!Array.isArray(models) || models.length === 0) {
    throw Error('Model picker requires a non-empty provider catalog.')
  }
  return models.map((item) => {
    const id = item?.id
    if (typeof id !== 'string' || !MODEL_ID.test(id)) {
      throw Error('Invalid provider model id for the model picker.')
    }
    const name = typeof item?.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 90) : id
    return { id, name, baseUrl, envKey: 'OPENAI_API_KEY' }
  })
}

// Keep unrelated settings and other configured providers byte-for-byte; only
// the OpenAI-compatible entry is owned by the live loopback proxy.
export function mergeDialogProviders(settings, providers) {
  const base = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {}
  const existing = base.modelProviders
  const modelProviders = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}
  return { ...base, modelProviders: { ...modelProviders, openai: providers } }
}

function readSettings(home) {
  const info = lstatSync(home)
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw Error('BCCLI session directory must not be a symlink.')
  }
  const file = join(home, 'settings.json')
  let stats
  try {
    stats = lstatSync(file)
  } catch {
    return {}
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw Error('BCCLI session settings must be a regular file.')
  }
  if (stats.size > MAX_SETTINGS_BYTES) throw Error('BCCLI session settings are too large.')
  const text = readFileSync(file, 'utf8').trim()
  if (!text) return {}
  const parsed = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Error('BCCLI session settings must contain a JSON object.')
  }
  return parsed
}

function writeSettings(home, settings) {
  const file = join(home, 'settings.json')
  const tmp = file + '.' + randomBytes(8).toString('hex') + '.tmp'
  try {
    writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', { flag: 'wx', encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, file)
  } finally {
    rmSync(tmp, { force: true })
  }
}

// A picker selection persists model.baseUrl alongside the id. The proxy port is
// ephemeral, so clear only an endpoint this module previously injected once the
// loopback port changes; unrelated endpoints are never rewritten.
function clearStalePickerEndpoint(settings, baseUrl) {
  const injected = settings.modelProviders?.openai
  if (!Array.isArray(injected)) return settings
  const previous = new Set(injected
    .map((entry) => entry?.baseUrl)
    .filter((url) => typeof url === 'string' && LOOPBACK_ENDPOINT.test(url)))
  const model = settings.model
  if (!model || typeof model !== 'object' || Array.isArray(model)) return settings
  if (typeof model.baseUrl !== 'string' || !previous.has(model.baseUrl) || model.baseUrl === baseUrl) return settings
  return { ...settings, model: { ...model, baseUrl: '' } }
}

// Returns true only when the catalog actually changed, so a normal relaunch
// does not touch the user's settings file.
export function syncDialogModelCatalog(home, { models, baseUrl }) {
  if (typeof home !== 'string' || !home.trim()) throw Error('BCCLI session home missing.')
  const providers = buildDialogProviders(models, baseUrl)
  mkdirSync(home, { recursive: true, mode: 0o700 })
  const current = clearStalePickerEndpoint(readSettings(home), baseUrl)
  const next = mergeDialogProviders(current, providers)
  if (JSON.stringify(next) === JSON.stringify(current)) return false
  writeSettings(home, next)
  return true
}

// The upstream picker persists the chosen id to settings.model.name. Read it
// back so the next launch (and the pre-launch menu) starts on the same model.
export function readDialogSelectedModel(home) {
  if (typeof home !== 'string' || !home.trim()) return undefined
  const settings = readSettings(home)
  const name = settings.model?.name
  if (typeof name !== 'string') return undefined
  const trimmed = name.trim()
  return MODEL_ID.test(trimmed) ? trimmed : undefined
}

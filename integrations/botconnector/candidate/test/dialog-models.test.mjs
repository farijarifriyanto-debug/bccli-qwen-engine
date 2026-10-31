import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  buildDialogProviders,
  mergeDialogProviders,
  readDialogSelectedModel,
  syncDialogModelCatalog,
} from '../dialog-models.mjs'

const BASE = 'http://127.0.0.1:41234/v1'
const CATALOG = [{ id: 'ling-3.0-flash', name: 'Ling Flash' }, { id: 'kimi-k2.7-code' }]

function home() {
  const dir = mkdtempSync(join(tmpdir(), 'bccli-dialog-models-'))
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) }
}

test('catalog becomes an OpenAI-compatible provider entry for the upstream picker', () => {
  const providers = buildDialogProviders(CATALOG, BASE)
  assert.deepEqual(providers[0], { id: 'ling-3.0-flash', name: 'Ling Flash', baseUrl: BASE, envKey: 'OPENAI_API_KEY' })
  assert.equal(providers[1].name, 'kimi-k2.7-code')
  assert.throws(() => buildDialogProviders(CATALOG, 'https://api.example.com/v1'), /loopback/)
  assert.throws(() => buildDialogProviders([{ id: '../../etc/passwd' }], BASE), /Invalid provider model id/)
  assert.throws(() => buildDialogProviders([], BASE), /non-empty provider catalog/)
})

test('merge keeps unrelated settings and other providers intact', () => {
  const merged = mergeDialogProviders(
    {
      $version: 4,
      permissions: { allow: ['Bash(git *)'] },
      modelProviders: { anthropic: [{ id: 'claude', envKey: 'ANTHROPIC_API_KEY' }] },
    },
    [{ id: 'ling-3.0-flash', name: 'Ling Flash', baseUrl: BASE, envKey: 'OPENAI_API_KEY' }],
  )
  assert.equal(merged.$version, 4)
  assert.deepEqual(merged.permissions, { allow: ['Bash(git *)'] })
  assert.equal(merged.modelProviders.anthropic.length, 1)
  assert.equal(merged.modelProviders.openai[0].id, 'ling-3.0-flash')
})

test('sync writes the catalog once and is idempotent on relaunch', () => {
  const { dir, done } = home()
  try {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ $version: 4, permissions: { allow: [] } }) + '\n')
    assert.equal(syncDialogModelCatalog(dir, { models: CATALOG, baseUrl: BASE }), true)
    const first = readFileSync(join(dir, 'settings.json'), 'utf8')
    const settings = JSON.parse(first)
    assert.equal(settings.$version, 4)
    assert.deepEqual(settings.permissions, { allow: [] })
    assert.equal(settings.modelProviders.openai.length, 2)
    assert.equal(syncDialogModelCatalog(dir, { models: CATALOG, baseUrl: BASE }), false)
    assert.equal(readFileSync(join(dir, 'settings.json'), 'utf8'), first)
  } finally {
    done()
  }
})

test('picker selection is read back from the engine settings', () => {
  const { dir, done } = home()
  try {
    syncDialogModelCatalog(dir, { models: CATALOG, baseUrl: BASE })
    assert.equal(readDialogSelectedModel(dir), undefined)
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({
      model: { name: 'kimi-k2.7-code', baseUrl: '' },
      modelProviders: { openai: [] },
    }) + '\n')
    assert.equal(readDialogSelectedModel(dir), 'kimi-k2.7-code')
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ model: { name: '../../escape' } }) + '\n')
    assert.equal(readDialogSelectedModel(dir), undefined)
  } finally {
    done()
  }
})

test('a stale loopback picker endpoint is cleared when the proxy port changes', () => {
  const { dir, done } = home()
  try {
    const old = 'http://127.0.0.1:40000/v1'
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({
      model: { name: 'kimi-k2.7-code', baseUrl: old },
      modelProviders: { openai: [{ id: 'kimi-k2.7-code', baseUrl: old, envKey: 'OPENAI_API_KEY' }] },
    }) + '\n')
    syncDialogModelCatalog(dir, { models: CATALOG, baseUrl: BASE })
    const settings = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))
    assert.equal(settings.model.name, 'kimi-k2.7-code')
    assert.equal(settings.model.baseUrl, '')
    assert.equal(settings.modelProviders.openai[0].baseUrl, BASE)
  } finally {
    done()
  }
})

test('unsafe session settings paths are rejected instead of written', () => {
  const { dir, done } = home()
  try {
    const file = join(dir, 'settings.json')
    try {
      symlinkSync(join(dir, 'missing.json'), file)
    } catch {
      return // Windows without symlink privileges: covered on Linux/macOS CI.
    }
    assert.throws(() => syncDialogModelCatalog(dir, { models: CATALOG, baseUrl: BASE }), /regular file/)
  } finally {
    done()
  }
})

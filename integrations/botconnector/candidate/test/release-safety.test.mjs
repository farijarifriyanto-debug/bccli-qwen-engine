import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const pack = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('isolated engine remains private and cannot replace the public BCCLI executable', () => {
  assert.equal(pack.private, true, 'candidate may not publish until legacy parity is independently approved')
  assert.equal(pack.name, '@botconnector/bccli-preview')
  assert.equal(pack.bin?.['bccli-preview'], './cli.mjs')
  assert.equal(Object.hasOwn(pack.bin || {}, 'bccli'), false, 'must not shadow existing global bccli')
  assert.equal(pack.version, '0.1.0-rc.2', 'do not impersonate the public version')
  assert.equal(pack.exports, undefined, 'candidate does not implement the public BCCLI SDK contract')
})

test('candidate tarball includes upstream attribution and pinned engine', () => {
  assert.equal(pack.license, 'Apache-2.0')
  assert.equal(pack.dependencies?.['@qwen-code/qwen-code'], '0.26.3')
  assert.ok(pack.files?.includes('LICENSE'))
  assert.ok(pack.files?.includes('THIRD_PARTY_NOTICES.md'))
  assert.ok(readFileSync(new URL('../LICENSE', import.meta.url), 'utf8').includes('Apache License'))
  assert.ok(readFileSync(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8').includes('Qwen Code'))
})

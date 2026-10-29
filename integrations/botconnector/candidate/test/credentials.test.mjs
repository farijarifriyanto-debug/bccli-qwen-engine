import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { botConnectorKey } from '../credentials.mjs'

test('reuse existing bc-cloud login from trusted BCCLI home, never from project files', () => {
  const root = mkdtempSync(join(tmpdir(), 'bccli-login-test-'))
  try {
    const credential = join(root, 'credentials')
    writeFileSync(credential, JSON.stringify({ 'bc-cloud': 'FAKE_EXISTING_KEY', 'another-provider': 'NOT_USED' }))
    assert.equal(botConnectorKey({ env: { BCCLI_HOME: root }, home: root }), 'FAKE_EXISTING_KEY')
    assert.equal(botConnectorKey({ env: { BCCLI_HOME: root, BOTCONNECTOR_API_KEY: 'FAKE_ENV_OVERRIDE' }, home: root }), 'FAKE_ENV_OVERRIDE')
    assert.throws(() => botConnectorKey({ env: { BCCLI_HOME: root + '/absent' }, home: root }), /No BotConnector login/)
    writeFileSync(credential, JSON.stringify({ 'qwencloud': 'FAKE_OTHER_PROVIDER' }))
    assert.throws(() => botConnectorKey({ env: { BCCLI_HOME: root }, home: root }), /No bc-cloud key/)
    writeFileSync(credential, 'not JSON')
    assert.throws(() => botConnectorKey({ env: { BCCLI_HOME: root }, home: root }), /not valid JSON/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('reject symlinked credential file and relative override', () => {
  const root = mkdtempSync(join(tmpdir(), 'bccli-login-symlink-'))
  try {
    const real = join(root, 'real.json')
    writeFileSync(real, JSON.stringify({ 'bc-cloud': 'FAKE_KEY' }))
    assert.throws(() => botConnectorKey({ env: { BCCLI_HOME: 'project-relative' } }), /absolute/)
    try {
      symlinkSync(real, join(root, 'credentials'))
      assert.throws(() => botConnectorKey({ env: { BCCLI_HOME: root } }), /Invalid BCCLI credentials/)
    } catch (err) {
      if (err?.code !== 'EPERM' && err?.code !== 'EACCES') throw err
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})

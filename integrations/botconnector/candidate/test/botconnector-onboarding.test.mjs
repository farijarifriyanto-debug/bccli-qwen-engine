import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startupMenu } from '../startup-menu.mjs'
import { saveProviderKey, storedProviderKey, isConfigured } from '../providers.mjs'
import { runProviderCommand } from '../provider-cli.mjs'

const fakeRunner = (_name, args, { input }) => {
  const script = args.at(-1)
  if (script.includes('ConvertFrom-SecureString'))
    return { status: 0, stdout: Buffer.from(input).toString('hex'), error: null }
  if (script.includes('SecureStringToBSTR'))
    return { status: 0, stdout: Buffer.from(input.trim(), 'hex').toString(), error: null }
  return { status: 1, stdout: '', error: Error('Unexpected operation') }
}

test('new BotConnector key is protected by DPAPI-compatible owner storage', () => {
  const root = mkdtempSync(join(tmpdir(), 'bccli-bc-firstlogin-'))
  const key = 'FAKE_NEVER_REAL_BOTCONNECTOR_KEY'
  const env = { BCCLI_PREVIEW_HOME: root, BCCLI_HOME: root }
  try {
    assert.equal(isConfigured('botconnector', { root, env }), false)
    saveProviderKey('botconnector', key, { root, platform: 'win32', runner: fakeRunner })
    assert.equal(isConfigured('botconnector', { root, env }), true)
    assert.equal(storedProviderKey('botconnector', { root, platform: 'win32', runner: fakeRunner }), key)
    const raw = readFileSync(join(root, 'provider-botconnector.dpapi'), 'utf8')
    assert.doesNotMatch(raw, /FAKE_NEVER_REAL_BOTCONNECTOR_KEY/)
    assert.match(raw, /^[a-f0-9]+\s*$/i)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('first-run Cloud menu validates live models before storing a hidden key', async () => {
  const events = []
  const answers = ['1', '1']
  const key = 'FAKE_BC_KEY_NOT_REAL'
  const result = await startupMenu({
    ask: async () => answers.shift(),
    askSecret: async () => key,
    out: msg => assert.doesNotMatch(msg, /FAKE_BC_KEY_NOT_REAL/),
    currentProvider: () => 'botconnector',
    configured: () => events.some(x => x[0] === 'save'),
    saveKey: (id, value) => events.push(['save', id, value]),
    use: id => events.push(['use', id]),
    saveModel: (id, model) => events.push(['model', id, model]),
    remembered: () => undefined,
    resolve: () => { throw Error('Unexpected legacy credential read') },
    list: async ({ key: received, endpoint }) => {
      assert.equal(received, key)
      assert.match(endpoint, /^https:\/\//)
      assert.deepEqual(events, [])
      return [{ id: 'ling-3.0-flash' }]
    },
  })
  assert.equal(result.model, 'ling-3.0-flash')
  assert.deepEqual(events, [
    ['save', 'botconnector', key],
    ['use', 'botconnector'],
    ['model', 'botconnector', 'ling-3.0-flash'],
  ])
})

test('invalid key replacement cannot overwrite previously saved credentials', async () => {
  const events = []
  await assert.rejects(startupMenu({
    ask: async () => '1!',
    askSecret: async () => 'FAKE_INVALID_REPLACEMENT',
    out: () => {},
    currentProvider: () => 'botconnector',
    configured: () => true,
    saveKey: () => events.push('save'),
    use: () => events.push('use'),
    saveModel: () => events.push('model'),
    list: async () => { throw Error('Gateway rejected key (HTTP 401)') },
  }), /401/)
  assert.deepEqual(events, [])
})

test('provider add botconnector uses hidden key input without printing it', async () => {
  const events = [], output = [], key = 'FAKE_NEW_CLOUD_KEY'
  assert.equal(await runProviderCommand(['add', 'botconnector'], {
    getKey: async () => key,
    out: msg => output.push(msg),
    save: (id, value) => events.push(['save', id, value]),
    select: id => events.push(['use', id]),
  }), 0)
  assert.deepEqual(events, [['save','botconnector',key], ['use','botconnector']])
  assert.doesNotMatch(output.join('\n'), /FAKE_NEW_CLOUD_KEY/)
})

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
const require = createRequire(import.meta.url)
const { unsafeWindowsNode, safeRuntime, selectRuntime } = require('../bccli-bootstrap.cjs')

test('Windows Node24.18 is blocked; known-safe runtime is selected', () => {
  assert.equal(unsafeWindowsNode('24.18.0', 'win32'), true)
  assert.equal(unsafeWindowsNode('24.22.0', 'win32'), true)
  assert.equal(unsafeWindowsNode('24.22.1', 'win32'), false)
  assert.equal(unsafeWindowsNode('24.18.0', 'linux'), false)
  const chosen = selectRuntime({
    platform: 'win32', nodeVersion: '24.18.0', execPath: 'C:/node24.exe',
    env: { LOCALAPPDATA: 'C:/users/example/AppData/Local' },
    exists: () => true, probe: () => 'v22.23.4',
  })
  assert.ok(chosen.includes('node.exe'))
  assert.equal(safeRuntime('v22.23.4'), true)
  assert.equal(safeRuntime('v24.22.1'), true)
  assert.equal(safeRuntime('v24.18.0'), false)
})
test('Windows guard fails closed if no supported Node is available', () => {
  assert.throws(() => selectRuntime({
    platform: 'win32', nodeVersion: '24.18.0', execPath: 'C:/node24.exe',
    env: {}, exists: () => false, probe: () => '',
  }), /No coding request was sent/)
})
test('other platforms and known-good Windows runtime retain current Node', () => {
  assert.equal(selectRuntime({platform:'linux',nodeVersion:'24.18.0',execPath:'/node'}), '/node')
  assert.equal(selectRuntime({platform:'win32',nodeVersion:'24.22.1',execPath:'C:/node'}), 'C:/node')
})

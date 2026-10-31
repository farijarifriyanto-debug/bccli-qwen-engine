import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ensureIsolatedSessionSettings } from '../session-settings.mjs'

test('initialize isolated session settings without migrating ~/.qwen user data', () => {
  const root = mkdtempSync(join(tmpdir(), 'bccli-session-settings-'))
  try {
    const session = join(root, '.bccli-preview', 'sessions-ollama-cloud')
    assert.equal(ensureIsolatedSessionSettings(session), true)
    assert.equal(readFileSync(join(session,'settings.json'),'utf8'), '{}\n')
    assert.equal(ensureIsolatedSessionSettings(session), false)
    writeFileSync(join(session,'settings.json'), '{"ui":{"hideBanner":true}}\n')
    assert.equal(ensureIsolatedSessionSettings(session), false)
    assert.equal(readFileSync(join(session,'settings.json'),'utf8'), '{"ui":{"hideBanner":true}}\n')
  } finally { rmSync(root, {recursive:true, force:true}) }
})
test('reject linked session settings directory', (t) => {
  const root=mkdtempSync(join(tmpdir(),'bccli-session-symlink-'))
  try {
    mkdirSync(join(root,'original'))
    try { symlinkSync(join(root,'original'),join(root,'linked'),'dir') }
    catch(error) { if(error.code==='EPERM'){t.skip('symlink privileges unavailable');return} throw error }
    assert.throws(() => ensureIsolatedSessionSettings(join(root,'linked')), /symlink/)
  } finally {rmSync(root,{recursive:true,force:true})}
})

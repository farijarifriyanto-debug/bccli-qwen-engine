import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveProviderKey, storedProviderKey, resolveProvider, useProvider, selectedProvider, removeProvider } from '../providers.mjs'

test('CI runner simulates DPAPI transport; real DPAPI separately verified on owner Windows', () => {
  const root=mkdtempSync(join(tmpdir(),'bccli-dpapi-simulated-'))
  const fakeKey='KEY_FAKE_SIMULATION'
  let saves=0, reads=0
  const runner=(_name,args,{input})=>{
    const script=args.at(-1)
    if (script.includes('ConvertFrom-SecureString')) {
      saves++
      return {status:0,stdout:Buffer.from(input).toString('hex'),error:null}
    }
    if (script.includes('SecureStringToBSTR')) {
      reads++
      return {status:0,stdout:Buffer.from(input.trim(),'hex').toString(),error:null}
    }
    return {status:1,stdout:'',error:Error('Unexpected operation')}
  }
  const env={BCCLI_PREVIEW_HOME:root,OPENROUTER_API_KEY:'FAKE_OLD_ENV'}
  try {
    saveProviderKey('openrouter',fakeKey,{root,platform:'win32',runner})
    const bytes=readFileSync(join(root,'provider-openrouter.dpapi'),'utf8')
    assert.doesNotMatch(bytes,/KEY_FAKE_SIMULATION/)
    assert.equal(storedProviderKey('openrouter',{root,platform:'win32',runner}),fakeKey)
    assert.equal(saves,1)
    assert.equal(reads,1)
    // A saved key must outrank old environment values; mock only validates
    // the I/O wiring, not real DPAPI cryptographic security.
    useProvider('openrouter',{root,env})
    assert.equal(selectedProvider({root,env}),'openrouter')
    removeProvider('openrouter',{root,env})
    assert.equal(selectedProvider({root,env}),'botconnector')
  } finally {rmSync(root,{recursive:true,force:true})}
})

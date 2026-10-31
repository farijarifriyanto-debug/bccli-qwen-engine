import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

test('BCCLI help advertises full engine instead of obsolete --bare policy',()=>{
  const entry=fileURLToPath(new URL('../cli.mjs',import.meta.url))
  const result=spawnSync(process.execPath,[entry,'--help'],{encoding:'utf8',timeout:10000})
  assert.equal(result.status,0,result.stderr)
  assert.match(result.stdout,/full upstream tools/)
  assert.doesNotMatch(result.stdout,/--bare/)
  assert.match(result.stdout,/workspace integrations obey trust and approval/)
})

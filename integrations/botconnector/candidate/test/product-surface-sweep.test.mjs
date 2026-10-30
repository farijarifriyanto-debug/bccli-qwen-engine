import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname,join } from 'node:path'
import { createRequire } from 'node:module'
import { patchUiChunk } from '../branding.mjs'

const require=createRequire(import.meta.url)
const root=dirname(require.resolve('@qwen-code/qwen-code/package.json'))
const cases=[
  ['chunks/acpAgent-U6TCKYWP.js','List tasks across Qwen Code WebShell','List tasks across BCCLI agent sessions'],
  ['chunks/chunk-2MB4ZSKF.js','Written by Qwen Code','Written by BCCLI'],
  ['chunks/chunk-3TK35SQL.js','Please reinstall Qwen Code','Please reinstall BCCLI'],
  ['chunks/chunk-44WSAMWG.js','Agent commands (forwarded to Qwen Code)','Agent commands (forwarded to BCCLI)'],
  ['chunks/chunk-4BFQ7QQC.js','Qwen Code Agent update','BCCLI Agent update'],
  ['chunks/chunk-55KTWTOV.js','Run Qwen Code as a local HTTP daemon','Run BCCLI as a local HTTP daemon'],
  ['chunks/chunk-B3ZFUGTC.js','This is the Qwen Code.','This is a coding assistant.'],
  ['chunks/chunk-GGVWG4SI.js','Some features may not work perfectly with Qwen Code','Some features may not work perfectly with BCCLI'],
]
for(const [name,before,after] of cases){
  test('sweep legacy product string in '+name,()=>{
    const source=readFileSync(join(root,name),'utf8')
    assert.ok(source.includes(before))
    const result=patchUiChunk(name,source)
    assert.ok(result.includes(after))
    assert.ok(!result.includes(before))
    assert.equal(result.includes('SPDX-License-Identifier: Apache-2.0'),source.includes('SPDX-License-Identifier: Apache-2.0'))
  })
}

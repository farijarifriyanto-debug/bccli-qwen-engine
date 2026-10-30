import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname,join } from 'node:path'
import { patchUiChunk } from '../branding.mjs'
const require=createRequire(import.meta.url)
const root=dirname(require.resolve('@qwen-code/qwen-code/package.json'))

test('standard AGENTS.md preferred in actual memory filename list, QWEN.md still loadable',()=>{
 const upstream=readFileSync(join(root,'chunks/chunk-Y6HHV4LC.js'),'utf8')
 assert.ok(upstream.includes('var currentMemoryFilename=[DEFAULT_CONTEXT_FILENAME,AGENT_CONTEXT_FILENAME];'))
 const branded=patchUiChunk('chunks/chunk-Y6HHV4LC.js',upstream)
 assert.ok(branded.includes('var currentMemoryFilename=[AGENT_CONTEXT_FILENAME,DEFAULT_CONTEXT_FILENAME];'))
 assert.ok(branded.includes('var DEFAULT_CONTEXT_FILENAME="QWEN.md"'))
 assert.ok(branded.includes('var AGENT_CONTEXT_FILENAME="AGENTS.md"'))
 assert.match(branded,/SPDX-License-Identifier: Apache-2\.0/)
})
test('/init gets preferred AGENTS.md filename, but asks before overwriting user files',()=>{
 const upstream=readFileSync(join(root,'chunks/chunk-7L4WTOM2.js'),'utf8')
 const branded=patchUiChunk('chunks/chunk-7L4WTOM2.js',upstream)
 assert.ok(branded.includes('Analyzes the project and creates an AGENTS.md instruction file.'))
 assert.ok(branded.includes('const contextFileName=getCurrentMemoryFilename()'))
 assert.ok(branded.includes('Do you want to regenerate it?'))
 assert.ok(branded.includes('Successfully loaded project instruction files'))
})

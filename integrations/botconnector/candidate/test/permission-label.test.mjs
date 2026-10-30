import assert from 'node:assert/strict'
import test from 'node:test'
import { patchUiChunk } from '../branding.mjs'
test('headless permission errors retain denial and never recommend bypassing approval',()=>{
 const old="Warning: Tool requires user approval.\nTo enable automatic tool execution, use the -y flag (YOLO mode):\nExample: qwen -p 'your prompt' -y\n\n"
 const clean=patchUiChunk('chunks/chunk-2PLSL3VQ.js',old)
 assert.match(clean,/BCCLI requires an interactive approval/)
 assert.ok(!clean.includes('YOLO'))
 assert.ok(!clean.includes('qwen -p'))
 assert.ok(clean.startsWith('Warning: Tool requires user approval.'))
})
test('permission denial messages are branded BCCLI without changing rule details',()=>{
 const original=Array(4).fill('Qwen Code requires permission to use ').join('|')
 const result=patchUiChunk('chunks/chunk-ERV2ECV3.js',original)
 assert.equal(result.split('BCCLI requires permission to use ').length-1,4)
 assert.equal(result.includes('Qwen Code'),false)
 assert.throws(()=>patchUiChunk('chunks/chunk-ERV2ECV3.js','different'),/unsupported/)
})

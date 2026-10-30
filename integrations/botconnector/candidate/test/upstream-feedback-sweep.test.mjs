import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { patchUiChunk } from '../branding.mjs'

const require = createRequire(import.meta.url)
const source = dirname(require.resolve('@qwen-code/qwen-code/package.json'))
function original(relative) { return readFileSync(join(source, relative), 'utf8') }

test('upstream feedback does not show on BCCLI; user-facing survey string never mentions upstream brand', () => {
  const originalUI = original('chunks/startInteractiveUI-CECFAXVK.js')
  assert.match(originalUI, /How is Qwen doing this session/)
  const result = patchUiChunk('chunks/startInteractiveUI-CECFAXVK.js', originalUI)
  assert.doesNotMatch(result, /How is Qwen doing this session/)
  assert.match(result, /How is BCCLI doing this session/)
  assert.match(result, /const BCCLI_DISABLE_UPSTREAM_FEEDBACK=true;/)
  assert.match(result, /enableUserFeedback===false\|\|BCCLI_DISABLE_UPSTREAM_FEEDBACK\|\|!lastMessageIsAIResponse/)
  assert.match(result, /@license[\s\S]*?Copyright 2025 Qwen Code/, 'upstream legal notices remain intact')
  assert.equal((result.match(/BCCLI_DISABLE_UPSTREAM_FEEDBACK/g)||[]).length, 2)
})

test('English locale translations are patched with verified source hashes and keep legal attribution', () => {
  for(const file of ['chunks/en-SBI6QJ2J.js','locales/en.js']){
    const before=original(file)
    const after=patchUiChunk(file,before)
    assert.match(before,/How is Qwen doing this session/)
    assert.doesNotMatch(after,/How is Qwen doing this session/)
    assert.match(after,/How is BCCLI doing this session/)
    assert.equal(after.includes('QWEN.md'),before.includes('QWEN.md'))
    assert.equal(after.includes('Copyright 2025 Qwen'),before.includes('Copyright 2025 Qwen'))
  }
})

test('user-facing diagnostics, GitHub generated attribution, permissions and update messages use BCCLI', () => {
  const before=original('chunks/chunk-ERV2ECV3.js')
  const after=patchUiChunk('chunks/chunk-ERV2ECV3.js',before)
  assert.ok(before.includes('Qwen Code is processing a request'))
  assert.ok(after.includes('BCCLI is processing a request'))
  assert.ok(after.includes('Generated with BCCLI'))
  assert.ok(after.includes('You can close this window and return to BCCLI'))
  assert.ok(!after.includes('You can close this window and return to Qwen Code'))
  assert.match(after,/Copyright 2025 Qwen Code/)
})

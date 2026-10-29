import assert from 'node:assert/strict'
import test from 'node:test'
import { patchUiChunk } from '../branding.mjs'

test('white-label patch changes only the ASCII logo with strict locator', () => {
  const original = 'prefix var shortAsciiLogo=' + String.fromCharCode(96) + 'QWEN' + String.fromCharCode(96) + '; suffix'
  const output = patchUiChunk('chunks/chunk-OYUATJK2.js', original)
  assert.ok(output.includes('██████'), 'BCCLI logo must render')
  assert.ok(!output.includes('QWEN'))
  assert.ok(output.startsWith('prefix '))
  assert.ok(output.endsWith(' suffix'))
  assert.throws(() => patchUiChunk('chunks/chunk-OYUATJK2.js', 'x'), /locator changed/)
})

test('Ink and OpenTUI titles update without modifying non-brand fields', () => {
  const ink = 'prefix customBannerTitle?customBannerTitle:">_ Qwen Code" Add a QWEN.md file to give Qwen Code persistent project context. You can resume a previous conversation by running qwen --continue or qwen --resume. suffix'
  const result = patchUiChunk('chunks/startInteractiveUI-CECFAXVK.js', ink)
  assert.match(result, />_ BCCLI \| BotConnector/)
  assert.match(result, /Use \/help to explore BCCLI/)
  assert.match(result, /Continue your previous BCCLI session/)
  assert.ok(!result.includes('Qwen Code'))
  const openTuiBefore = 'custom.title??">_ Qwen Code";var DEFAULT_GRADIENT=["#4796E4","#847ACE","#C3677F"];addField("Qwen Code",cliVersion'
  const openTuiAfter = patchUiChunk('chunks/start-opentui-ui-Q34XCEMN.js', openTuiBefore)
  assert.ok(openTuiAfter.includes('custom.title??">_ BCCLI | BotConnector"'))
  assert.ok(openTuiAfter.includes('var DEFAULT_GRADIENT=["#00AFA0","#22C55E","#EAB308"]'))
  assert.ok(openTuiAfter.includes('addField("BCCLI engine",cliVersion'))
  assert.throws(() => patchUiChunk('chunks/startInteractiveUI-CECFAXVK.js', 'different'), /unsupported/)
})

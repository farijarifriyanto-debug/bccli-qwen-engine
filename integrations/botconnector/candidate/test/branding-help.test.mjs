import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

test('bccli help uses the product identity without rewriting engine behavior', () => {
  const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [cli, '--help'], {
    encoding: 'utf8', timeout: 15000,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /BCCLI \| BotConnector Coding Agent/)
  assert.match(result.stdout, /\bbccli provider list\|add\|use\|remove\b/)
  assert.match(result.stdout, /\bbccli chat --provider ID --model MODEL_ID\b/)
  assert.doesNotMatch(result.stdout, /(?:^|\n)\s*bccli-preview\b|isolated coding agent candidate/i)
  assert.ok(result.stdout.includes('~/.bccli-preview/'), 'user configuration directory must not be renamed')
  assert.equal(result.stderr, '')
})

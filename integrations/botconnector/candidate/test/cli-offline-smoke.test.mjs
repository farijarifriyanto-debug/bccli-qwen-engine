import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const entry = fileURLToPath(new URL('../cli.mjs', import.meta.url))
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

function invoke(args) {
  return spawnSync(process.execPath, [entry, ...args], {
    encoding: 'utf8',
    timeout: 8000,
    env: {
      ...process.env,
      BOTCONNECTOR_API_KEY: '',
      OPENAI_API_KEY: '',
      NODE_OPTIONS: '',
    },
  })
}

test('version command is offline, silent on stderr and matches the candidate package', () => {
  for (const flag of ['-v','--version']) {
    const run = invoke([flag])
    assert.equal(run.status, 0, run.stderr)
    assert.equal(run.stdout.trim(), pkg.version)
    assert.equal(run.stderr, '')
  }
})

test('help remains offline and never impersonates the public executable', () => {
  const run = invoke(['--help'])
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /bccli-qwen-candidate -p/)
  assert.match(run.stdout, /Not a replacement/)
  assert.equal(run.stderr, '')
})

test('unsupported public command fails before authentication and makes no AI request', () => {
  const run = invoke(['provider','list'])
  assert.equal(run.status, 1)
  assert.match(run.stderr, /No AI request was sent/)
  assert.doesNotMatch(run.stderr, /BOTCONNECTOR_API_KEY is required/)
})

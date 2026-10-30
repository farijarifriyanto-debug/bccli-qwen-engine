import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

const entry = fileURLToPath(new URL('../cli.mjs', import.meta.url))
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

function invoke(args, extraEnv = {}) {
  return spawnSync(process.execPath, [entry, ...args], {
    encoding: 'utf8',
    timeout: 8000,
    env: {
      ...process.env,
      BOTCONNECTOR_API_KEY: '',
      OPENAI_API_KEY: '',
      NODE_OPTIONS: '',
      ...extraEnv,
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
  assert.match(run.stdout, /bccli-preview -p/)
  assert.match(run.stdout, /Not a replacement/)
  assert.equal(run.stderr, '')
})

test('unsupported public command fails before authentication and makes no AI request', () => {
  const run = invoke(['mcp','list'])
  assert.equal(run.status, 1)
  assert.match(run.stderr, /No AI request was sent/)
  assert.doesNotMatch(run.stderr, /BOTCONNECTOR_API_KEY is required/)
})

test('auth status checks only existing credentials and never prints them or contacts Gateway', () => {
  const home = mkdtempSync(join(tmpdir(),'bccli-auth-offline-'))
  try {
    const missing = invoke(['auth','status'],{BCCLI_HOME:home})
    assert.equal(missing.status,1)
    assert.match(missing.stderr,/credential not configured or unreadable/)
    assert.match(missing.stderr,/No credential was changed and no AI request was sent/)
    writeFileSync(join(home,'credentials'),JSON.stringify({'bc-cloud':'NOT_A_REAL_SECRET_TOKEN'}))
    const stored = invoke(['auth','status'],{BCCLI_HOME:home})
    assert.equal(stored.status,0,stored.stderr)
    assert.match(stored.stdout,/public BCCLI bc-cloud login/)
    assert.match(stored.stdout,/Not verified online/)
    assert.doesNotMatch(stored.stdout+stored.stderr,/NOT_A_REAL_SECRET_TOKEN/)
    const over = invoke(['auth','status'],{BCCLI_HOME:home,BOTCONNECTOR_API_KEY:'ALSO_FAKE_TOKEN'})
    assert.equal(over.status,0,over.stderr)
    assert.match(over.stdout,/BOTCONNECTOR_API_KEY environment variable/)
    assert.doesNotMatch(over.stdout+over.stderr,/ALSO_FAKE_TOKEN|NOT_A_REAL_SECRET_TOKEN/)
    assert.equal(readFileSync(join(home,'credentials'),'utf8'),JSON.stringify({'bc-cloud':'NOT_A_REAL_SECRET_TOKEN'}))
  } finally { rmSync(home,{recursive:true,force:true}) }
})

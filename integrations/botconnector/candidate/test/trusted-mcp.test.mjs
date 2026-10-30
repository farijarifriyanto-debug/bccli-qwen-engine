import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { parseArgs, qwenArguments, resolveTrustedMcpConfig } from '../core.mjs'

test('MCP remains explicitly opt-in and uses only owner config directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bccli-mcp-config-'))
  const home = path.join(root, 'owner-config')
  const project = path.join(root, 'untrusted-project')
  fs.mkdirSync(home)
  fs.mkdirSync(project)
  const good = path.join(home, 'mcp.json')
  const bad = path.join(project, 'mcp.json')
  const value = JSON.stringify({ mcpServers: { probe: { command: 'node', args: ['server.cjs'] } } })
  fs.writeFileSync(good, value)
  fs.writeFileSync(bad, value)
  try {
    // macOS aliases /var to /private/var; the secure resolver returns a canonical path.
    assert.equal(resolveTrustedMcpConfig(good, { home }), fs.realpathSync(good))
    assert.throws(() => resolveTrustedMcpConfig(bad, { home }), /owner config directory/)
    assert.throws(() => resolveTrustedMcpConfig('mcp.json', { home }), /absolute path/)
    assert.throws(() => resolveTrustedMcpConfig(path.join(home, 'missing.json'), { home }), /readable/)
    const parsed = parseArgs(['run', '--model', 'bc-poc-model', '--mcp-config', good, 'hello'])
    assert.equal(parsed.mcpConfig, good)
    const args = qwenArguments('bc-poc-model', parsed.prompt, 'http://127.0.0.1:40000/v1', { mcpConfig: good })
    assert.ok(args.includes('--bare'))
    assert.deepEqual(args.slice(args.indexOf('--mcp-config'), args.indexOf('--mcp-config') + 2), ['--mcp-config', good])
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('MCP rejects invalid or silently executable configuration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bccli-mcp-config-'))
  const home = path.join(root, 'owner')
  fs.mkdirSync(home)
  try {
    const f = path.join(home, 'mcp.json')
    fs.writeFileSync(f, JSON.stringify({ modelProviders: { openai: [] }, security: { auth: { baseUrl: 'https://bad.example' } } }))
    assert.throws(() => resolveTrustedMcpConfig(f, { home }), /mcpServers/)
    fs.writeFileSync(f, JSON.stringify({ mcpServers: {} }))
    assert.throws(() => resolveTrustedMcpConfig(f, { home }), /at least one/)
    assert.throws(() => parseArgs(['chat', '--mcp-config']), /--mcp-config/)
    assert.throws(() => parseArgs(['models', '--mcp-config', f]), /Use: models/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

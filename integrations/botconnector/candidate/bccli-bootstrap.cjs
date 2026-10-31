#!/usr/bin/env node
'use strict'

// This small launcher runs before importing the coding engine. npm's Windows
// shims use the system Node; on affected releases we may select a known-safe
// owner-installed Node without changing the system-wide PATH.
const { spawn, spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { pathToFileURL } = require('node:url')

function unsafeWindowsNode(version, platform = process.platform) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version))
  if (!m) return true
  const [major, minor, patch] = m.slice(1).map(Number)
  return platform === 'win32' && major === 24 && (minor < 22 || (minor === 22 && patch < 1))
}
function safeRuntime(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version))
  if (!m) return false
  const [major, minor, patch] = m.slice(1).map(Number)
  return (major === 22 && (minor > 23 || (minor === 23 && patch >= 4))) ||
    (major === 24 && (minor > 22 || (minor === 22 && patch >= 1)))
}
function selectRuntime({ platform = process.platform, nodeVersion = process.version,
  execPath = process.execPath, env = process.env,
  probe = (path) => {
    const result = spawnSync(path, ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true })
    return result.status === 0 ? result.stdout.trim() : ''
  },
  exists = existsSync } = {}) {
  if (!unsafeWindowsNode(nodeVersion, platform)) return execPath
  const candidates = [
    env.BCCLI_NODE_EXECUTABLE,
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'BotConnector', 'BCCLI-Preview', 'runtime', 'node.exe'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    const path = resolve(candidate)
    if (path === resolve(execPath) || !exists(path)) continue
    if (safeRuntime(probe(path))) return path
  }
  throw Error('BCCLI requires Node.js 24.22.1+ or 22.23.4+ on Windows. Set BCCLI_NODE_EXECUTABLE to an installed compatible node.exe, or update Node.js. No coding request was sent.')
}
async function main() {
  const exe = selectRuntime()
  const entry = join(__dirname, 'cli.mjs')
  if (exe === process.execPath) {
    await import(pathToFileURL(entry).href)
    return
  }
  const child = spawn(exe, [entry, ...process.argv.slice(2)], {
    stdio: 'inherit', cwd: process.cwd(), env: process.env, windowsHide: false, shell: false,
  })
  child.once('error', (error) => { console.error('BCCLI runtime launch failed: ' + error.message); process.exitCode = 1 })
  child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 130 : 1) })
}
if (require.main === module) main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
module.exports = { unsafeWindowsNode, safeRuntime, selectRuntime }

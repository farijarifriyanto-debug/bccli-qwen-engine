// Stable CLI compatibility bridge. There is only one user-visible executable:
// bccli. Explicit legacy commands continue to use the original BCCLI 0.4.17
// implementation bundled within the same distribution. Never reinterpret a
// legacy subcommand as a chargeable AI prompt.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const LEGACY_COMMANDS = new Set([
  'login', 'logout', 'mcp', 'connect', 'disconnect', 'integrations',
  'update', 'serve', 'acp', 'plugins', 'gh-bot', 'completion',
  'stats', 'export', 'import', 'pr',
])
const LEGACY_OPTIONS = new Set([
  '--output-format', '--fail-on-tool-error', '--allow-all',
  '--allowed-tools', '--reasoning', '--lang', '--permission-mode',
  '--worktree', '-w', '--fallback-model', '--base-url',
])

export function legacyCompatibilityMode(argv) {
  if (!Array.isArray(argv) || argv.length === 0) return false
  if (LEGACY_COMMANDS.has(argv[0])) return true
  // Explicit flags from BCCLI 0.4.17 preserve that version's exact
  // semantics, rather than silently mapping to the new engine.
  if (argv.some(arg => LEGACY_OPTIONS.has(arg) || [...LEGACY_OPTIONS].some(flag => arg.startsWith(flag + '=')))) return true
  // The old provider CLI permits custom providers, whereas the new CLI
  // accepts only fixed HTTPS presets. Keep the legacy route explicit.
  if (argv[0] === 'provider' && argv[1] === 'add' && argv.some(arg => ['--url','--name','--key-env'].includes(arg))) return true
  return false
}

export async function runLegacyCli(argv, { spawnImpl = spawn, node = process.execPath, env = process.env, cwd = process.cwd() } = {}) {
  const entrypoint = fileURLToPath(new URL('./legacy/dist/cli.js', import.meta.url))
  const child = spawnImpl(node, [entrypoint, ...argv], {
    cwd, env, stdio: 'inherit', shell: false, windowsHide: false,
  })
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 130 : 1)))
  })
}

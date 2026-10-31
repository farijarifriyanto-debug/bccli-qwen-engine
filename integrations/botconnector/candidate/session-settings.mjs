// A provider-scoped QWEN_HOME is intentionally separate from ~/.qwen.
// The upstream engine warns when the isolated directory has no settings.json;
// create only the minimal blank configuration, never migrate tokens or plugins.
import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export function ensureIsolatedSessionSettings(home) {
  if (typeof home !== 'string' || !home.trim()) throw Error('BCCLI session home missing.')
  mkdirSync(home, { recursive: true, mode: 0o700 })
  for (const dir of [dirname(home), home]) {
    const info = lstatSync(dir)
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error('BCCLI session directory must not be a symlink.')
  }
  const file = join(home, 'settings.json')
  if (existsSync(file)) {
    if (!lstatSync(file).isFile()) throw Error('BCCLI session settings must be a regular file.')
    return false
  }
  try {
    writeFileSync(file, '{}\n', { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (error.code !== 'EEXIST' || !lstatSync(file).isFile()) throw error
    return false
  }
  return true
}

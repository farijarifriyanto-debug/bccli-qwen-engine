// Credentials bridge: reuse an owner's existing BCCLI bc-cloud login without
// another provider account or a second credential store. Never log the key.
import { homedir } from 'node:os'
import { join, isAbsolute } from 'node:path'
import { lstatSync, readFileSync } from 'node:fs'

const MAX_CREDENTIAL_FILE_BYTES = 64 * 1024

export function botConnectorKey({ env = process.env, home = homedir() } = {}) {
  if (typeof env.BOTCONNECTOR_API_KEY === 'string' && env.BOTCONNECTOR_API_KEY.trim()) {
    return env.BOTCONNECTOR_API_KEY.trim()
  }
  const override = env.BCCLI_HOME
  const base = override ? override : join(home, '.bccli')
  if (!isAbsolute(base)) throw Error('BCCLI_HOME must be an absolute directory.')
  const path = join(base, 'credentials')
  let info
  try { info = lstatSync(path) }
  catch (error) {
    if (error?.code === 'ENOENT') {
      throw Error('No BotConnector login. Run bccli login to save your bc-cloud key, or set BOTCONNECTOR_API_KEY.')
    }
    throw Error('Cannot inspect the existing BCCLI credentials file.')
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_CREDENTIAL_FILE_BYTES) {
    throw Error('Invalid BCCLI credentials file; do not follow symlinks or oversized files.')
  }
  let data
  try { data = JSON.parse(readFileSync(path, 'utf8')) }
  catch { throw Error('Existing BCCLI credentials are not valid JSON.') }
  const key = data && typeof data === 'object' && !Array.isArray(data) ? data['bc-cloud'] : null
  if (typeof key !== 'string' || !key.trim()) {
    throw Error('No bc-cloud key saved. Run bccli login or set BOTCONNECTOR_API_KEY.')
  }
  return key.trim()
}

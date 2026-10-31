// BCCLI safe patch backend. A patch is atomic for ONE existing file.
// Deliberately no shell, arbitrary paths, symlink writes, creates or deletes.
import { createHash, randomBytes } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const MAX_FILE_BYTES = 1024 * 1024
const MAX_REPLACEMENTS = 32
const BOM = Buffer.from([0xef, 0xbb, 0xbf])
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = (code, detail) => { const e = new Error(detail); e.code = code; throw e }
const utf8 = new TextDecoder('utf-8', { fatal: true })

export function planAtomicPatch({ root, file_path, replacements, expected_sha256 } = {}) {
  if (!isAbsolute(root || '') || !isAbsolute(file_path || '')) fail('invalid_path', 'Absolute workspace root and file_path required')
  if (!Array.isArray(replacements) || replacements.length < 1 || replacements.length > MAX_REPLACEMENTS) {
    fail('invalid_patch', 'Provide 1-32 exact old_text/new_text replacements')
  }
  // Workspaces and file paths can use different aliases to the same root
  // (macOS /var -> /private/var). Enforce containment on canonical paths,
  // then inspect each directory beneath the workspace for symlinks. Aliases
  // in ancestors ABOVE the workspace remain allowed.
  const workspace = realpathSync(root)
  const target = resolve(file_path)
  const parent = dirname(target)
  const canonicalParent = realpathSync(parent)
  const canonicalRel = relative(workspace, resolve(canonicalParent, basename(target)))
  if (!canonicalRel || canonicalRel === '..' || canonicalRel.startsWith('..' + sep) ||
      isAbsolute(canonicalRel) || canonicalRel.split(sep).some(segment => segment.toLowerCase() === '.git')) {
    fail('path_outside_workspace', 'Patch must target a project file outside .git')
  }
  const samePath = (a, b) => process.platform === 'win32'
    ? a.toLowerCase() === b.toLowerCase() : a === b
  let cursor = parent
  while (true) {
    const resolvedCursor = realpathSync(cursor)
    if (lstatSync(cursor).isSymbolicLink()) {
      const containingDir = realpathSync(dirname(cursor))
      const inside = relative(workspace, containingDir)
      // An explicitly aliased workspace root is fine. An alias CREATED
      // under that workspace (including one pointing at its root) is not.
      if (!inside || (inside !== '..' && !inside.startsWith('..' + sep) && !isAbsolute(inside))) {
        fail('symlink_path', 'Symlinked parent directory is not writable by apply_patch')
      }
    }
    if (samePath(resolvedCursor, workspace)) break
    const up = dirname(cursor)
    if (up === cursor) fail('path_outside_workspace', 'Patch path cannot reach workspace root')
    cursor = up
  }
  const stat = lstatSync(target)
  if (!stat.isFile() || stat.isSymbolicLink()) fail('unsafe_target', 'Only existing regular files can be patched')
  if (stat.size > MAX_FILE_BYTES) fail('too_large', 'File exceeds 1 MiB patch limit')
  const beforeBytes = readFileSync(target)
  if (beforeBytes.length > MAX_FILE_BYTES) fail('too_large', 'File exceeds 1 MiB patch limit')
  const beforeHash = hash(beforeBytes)
  if (expected_sha256 && expected_sha256 !== beforeHash) fail('conflict', 'Expected SHA256 differs from current file')
  const bom = beforeBytes.subarray(0, 3).equals(BOM)
  let text = utf8.decode(bom ? beforeBytes.subarray(3) : beforeBytes)
  if (text.includes('\u0000')) fail('binary_file', 'Binary files cannot be patched')
  const lf = (text.match(/\n/g) || []).length
  const crlf = (text.match(/\r\n/g) || []).length
  if (crlf > 0 && crlf !== lf) fail('mixed_line_endings', 'Mixed LF/CRLF file requires a dedicated edit')
  const useCrlf = crlf > 0
  const original = text
  text = text.replace(/\r\n/g, '\n')
  for (const [index, item] of replacements.entries()) {
    if (!item || typeof item.old_text !== 'string' || typeof item.new_text !== 'string' || !item.old_text) {
      fail('invalid_patch', 'Replacement ' + index + ' needs nonempty old_text and string new_text')
    }
    const oldText = item.old_text.replace(/\r\n/g, '\n')
    const newText = item.new_text.replace(/\r\n/g, '\n')
    if (Buffer.byteLength(oldText) > MAX_FILE_BYTES || Buffer.byteLength(newText) > MAX_FILE_BYTES) {
      fail('too_large', 'Replacement exceeds 1 MiB')
    }
    const count = text.split(oldText).length - 1
    if (count !== 1) fail('hunk_conflict', 'Replacement ' + index + ' must match exactly once (found ' + count + ')')
    text = text.replace(oldText, newText)
  }
  const after = useCrlf ? text.replace(/\n/g, '\r\n') : text
  const afterBytes = Buffer.concat([bom ? BOM : Buffer.alloc(0), Buffer.from(after, 'utf8')])
  if (afterBytes.length > MAX_FILE_BYTES) fail('too_large', 'Result exceeds 1 MiB')
  if (beforeBytes.equals(afterBytes)) fail('no_changes', 'Patch does not change the file')
  return {
    target, root: workspace, parentCanonical: canonicalParent, beforeHash, afterHash: hash(afterBytes),
    before: original, after, beforeBytes, afterBytes, mode: stat.mode,
    replacementCount: replacements.length,
  }
}

export function commitAtomicPatch(plan, { signal } = {}) {
  if (signal?.aborted) fail('aborted', 'Patch cancelled before write')
  const { target, beforeHash, afterBytes } = plan
  const folder = dirname(target)
  if (realpathSync(folder).toLowerCase() !== plan.parentCanonical.toLowerCase()) fail('symlink_path', 'Parent path changed')
  const stat = lstatSync(target)
  if (!stat.isFile() || stat.isSymbolicLink() || hash(readFileSync(target)) !== beforeHash) {
    fail('conflict', 'File changed since patch was prepared')
  }
  const temporary = join(folder, '.bccli-patch-' + randomBytes(12).toString('hex') + '.tmp')
  let fd
  try {
    fd = openSync(temporary, 'wx', stat.mode & 0o777)
    writeFileSync(fd, afterBytes)
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    if (signal?.aborted) fail('aborted', 'Patch cancelled before commit')
    // Recheck before replacement; an external concurrent writer must not be overwritten.
    if (!existsSync(target) || lstatSync(target).isSymbolicLink() || hash(readFileSync(target)) !== beforeHash) {
      fail('conflict', 'File modified during patch staging')
    }
    renameSync(temporary, target) // Same directory: one filesystem rename, not an in-place partial write.
    return { file_path: target, sha256_before: beforeHash, sha256_after: plan.afterHash, replacements: plan.replacementCount }
  } finally {
    if (fd !== undefined) closeSync(fd)
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

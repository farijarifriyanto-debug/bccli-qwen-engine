// BCCLI white-label view overlay for the pinned upstream Qwen package.
// Never mutate the original npm dependency or weaken --bare isolation.
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const VERSION = '0.26.3'
const SOURCE_HASHES = Object.freeze({
  'chunks/chunk-OYUATJK2.js': '3fa61c12bc1cba19d70151381519be337b99e2e60dac8edf6d066107a8419a1d',
  'chunks/startInteractiveUI-CECFAXVK.js': 'd9acfeb1105032c9edccf223acfc6a8384256099883303c1622b12d92eea0b83',
  'chunks/start-opentui-ui-Q34XCEMN.js': 'e5a8d1ff1ce494f6df26b03023daf2b930cb093ebfbfbcf9e2bcd3b349e6f107',
  'chunks/chunk-OV3EBH6J.js': '3b20ea65e93e6ee00625f9d86906c3d28c45529b4b4dbe72dc050bdae3904505',
  'chunks/chunk-W3YCOEIP.js': '02828393f6e477a7f36cecff876a6af2d36ece3eb838fceb096d9245eb7fc5f7',
  'chunks/chunk-7L4WTOM2.js': '4d8053c956cc7881b7f87ae2c0e96bf1adc942a37ac37de3d76eaeb9367041fc',
})
const BRAND_REVISION = 'bccli-white-label-20261029-v3'
// Deliberately not Qwen's blue→purple→rose gradient. BotConnector-facing
// coding CLI uses a distinct teal→green→amber palette in dark/light themes.
export const BCCLI_COLORS = Object.freeze(['#00AFA0', '#22C55E', '#EAB308'])
const BCCLI_ASCII = [
  '',
  '██████╗  ██████╗  ██████╗██╗     ██╗',
  '██╔══██╗██╔════╝ ██╔════╝██║     ██║',
  '██████╔╝██║      ██║     ██║     ██║',
  '██╔══██╗██║      ██║     ██║     ██║',
  '██████╔╝╚██████╗ ╚██████╗███████╗██║',
  '╚═════╝  ╚═════╝  ╚═════╝╚══════╝╚═╝',
  '',
].join('\n')

const digest = (value) => createHash('sha256').update(value).digest('hex')

function replaceExactly(text, oldValue, newValue, expectedCount, label) {
  if (text.split(oldValue).length - 1 !== expectedCount) {
    throw Error('BCCLI branding unsupported by installed engine: ' + label)
  }
  return text.split(oldValue).join(newValue)
}

function replaceOnce(text, oldValue, newValue, label) {
  if (text.split(oldValue).length !== 2) {
    throw Error('BCCLI branding unsupported by installed engine: ' + label)
  }
  return text.replace(oldValue, newValue)
}

export function patchUiChunk(file, text) {
  if (file === 'chunks/chunk-OYUATJK2.js') {
    const pattern = /var shortAsciiLogo=\x60[\s\S]*?\x60;/
    const matches = text.match(new RegExp(pattern.source, 'g'))
    if (matches?.length !== 1) throw Error('BCCLI branding logo locator changed upstream.')
    return text.replace(pattern, () => 'var shortAsciiLogo=' + String.fromCharCode(96) + BCCLI_ASCII + String.fromCharCode(96) + ';')
  }
  if (file === 'chunks/startInteractiveUI-CECFAXVK.js') {
    let result = replaceOnce(
      text,
      'customBannerTitle?customBannerTitle:">_ Qwen Code"',
      'customBannerTitle?customBannerTitle:">_ BCCLI | BotConnector"',
      'Ink banner title',
    )
    result = replaceOnce(result,
      'Add a QWEN.md file to give Qwen Code persistent project context.',
      'Use /help to explore BCCLI tools and commands.',
      'Ink startup tip',
    )
    return replaceOnce(result,
      'You can resume a previous conversation by running qwen --continue or qwen --resume.',
      'Continue your previous BCCLI session using the resume command.',
      'Ink resume tip',
    )
  }
  if (file === 'chunks/start-opentui-ui-Q34XCEMN.js') {
    let result = replaceOnce(
      text, 'custom.title??">_ Qwen Code"', 'custom.title??">_ BCCLI | BotConnector"',
      'OpenTUI banner title',
    )
    result = replaceOnce(result,
      'var DEFAULT_GRADIENT=["#4796E4","#847ACE","#C3677F"]',
      'var DEFAULT_GRADIENT='+JSON.stringify(BCCLI_COLORS),
      'OpenTUI default gradient')
    return replaceOnce(result,
      'addField("Qwen Code",cliVersion',
      'addField("BCCLI engine",cliVersion',
      'OpenTUI diagnostic label')
  }
  if (file === 'chunks/chunk-OV3EBH6J.js') {
    return replaceOnce(text,
      'You are Qwen Code, ${role} developed by Alibaba Group, ${focus}.',
      'You are an AI coding assistant, ${role}, ${focus}.',
      'neutral core agent introduction')
  }
  if (file === 'chunks/chunk-W3YCOEIP.js') {
    let result = replaceExactly(
      text,
      'GradientColors:["#4796E4","#847ACE","#C3677F"]',
      'GradientColors:'+JSON.stringify(BCCLI_COLORS), 2,
      'Ink light/dark gradient')
    result = replaceOnce(result,'AccentPurple:"#8B5CF6"','AccentPurple:"#047857"','light brand accent')
    result = replaceOnce(result,'AccentPurple:"#CBA6F7"','AccentPurple:"#34D399"','dark brand accent')
    result = replaceOnce(result,'AccentBlue:"#3B82F6"','AccentBlue:"#0891B2"','light focus blue')
    return replaceOnce(result,'AccentBlue:"#89B4FA"','AccentBlue:"#22D3EE"','dark focus cyan')
  }
  if (file === 'chunks/chunk-7L4WTOM2.js') {
    let result = replaceOnce(text,
      'https://github.com/QwenLM/qwen-code/issues/new?template=bug_report.yml&title={title}&info={info}',
      'https://github.com/farijarifriyanto-debug/bccli/issues/new?title={title}&body={info}',
      'user-facing /bug report link')
    return replaceOnce(result,
      'You are Qwen Code, an interactive CLI agent.',
      'You are an AI coding assistant operating in a terminal.',
      'neutral project initialization prompt')
  }
  throw Error('Unrecognized BCCLI branding file.')
}

function assertSource(packageDir) {
  const metadata = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  if (metadata.name !== '@qwen-code/qwen-code' || metadata.version !== VERSION) {
    throw Error('BCCLI branding needs the pinned Qwen Code engine ' + VERSION + '.')
  }
  const patched = {}
  for (const [relative, expected] of Object.entries(SOURCE_HASHES)) {
    const original = readFileSync(join(packageDir, relative))
    if (digest(original) !== expected) {
      throw Error('Qwen Code view bundle changed: aborting BCCLI branded startup (' + relative + ').')
    }
    patched[relative] = patchUiChunk(relative, original.toString('utf8'))
  }
  return patched
}

function validCache(target, manifest) {
  if (!existsSync(join(target, '.bccli-brand-marker.json'))) return false
  try {
    const stored = JSON.parse(readFileSync(join(target, '.bccli-brand-marker.json'), 'utf8'))
    if (JSON.stringify(stored) !== JSON.stringify(manifest)) return false
    for (const [relative, hash] of Object.entries(manifest.outputHashes)) {
      if (digest(readFileSync(join(target, relative))) !== hash) return false
    }
    return existsSync(join(target, 'cli-entry.js'))
  } catch { return false }
}

/**
 * Make an isolated, revision-pinned white-label copy of the upstream package.
 * No model, provider, tool, permission, or auth logic is modified.
 * The source node_modules/@qwen-code/qwen-code package remains byte-identical.
 */
export function prepareBrandedQwen(entrypoint, { cacheRoot } = {}) {
  const packageDir = dirname(entrypoint)
  // Keep the copy within the same npm dependency tree so Node resolves native
  // and bundled imports exactly as the installed upstream runtime does.
  cacheRoot ??= join(dirname(dirname(packageDir)), '.cache', 'bccli-branded-engines')
  const patched = assertSource(packageDir)
  const outputHashes = Object.fromEntries(Object.entries(patched).map(([file, value]) => [file, digest(value)]))
  const manifest = { revision: BRAND_REVISION, version: VERSION, sourceHashes: SOURCE_HASHES, outputHashes }
  const target = join(cacheRoot, VERSION + '-' + digest(JSON.stringify(manifest)).slice(0,12))
  if (existsSync(target)) {
    if (!validCache(target, manifest)) throw Error('BCCLI branded engine cache differs from the pinned build; manual cleanup required.')
    return join(target, basename(entrypoint))
  }
  mkdirSync(cacheRoot, { recursive: true })
  const tmp = mkdtempSync(join(cacheRoot, '.building-'))
  try {
    cpSync(packageDir, tmp, { recursive: true, errorOnExist: false })
    for (const [relative, output] of Object.entries(patched)) {
      writeFileSync(join(tmp, relative), output, 'utf8')
    }
    writeFileSync(join(tmp, '.bccli-brand-marker.json'), JSON.stringify(manifest), 'utf8')
    try { renameSync(tmp, target) }
    catch (err) {
      if (!validCache(target, manifest)) throw err
    }
  } finally {
    if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true })
  }
  if (!validCache(target, manifest)) throw Error('BCCLI branded engine copy failed verification.')
  return join(target, basename(entrypoint))
}

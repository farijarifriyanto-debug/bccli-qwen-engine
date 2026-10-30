#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { DEFAULT_MODEL, assertCandidateRuntimeSupported, discoverModels, launchQwen, parseArgs, resolveQwenEntrypoint, resolveTrustedMcpConfig, selectModel } from './core.mjs'
import { prepareBrandedQwen } from './branding.mjs'
import { botConnectorKey, botConnectorCredentialStatus } from './credentials.mjs'

function help() {
  console.log([
    'BCCLI | BotConnector — isolated coding agent candidate',
    'Usage:',
    '  bccli-preview models [--json]',
    '  bccli-preview run --model MODEL "prompt" [--mcp-config OWNER_CONFIG_PATH]',
    '  bccli-preview -p "prompt" [-m MODEL]  (text-only headless alias)',
    '  bccli-preview --version',
    '  bccli-preview chat [--model MODEL] [--mcp-config OWNER_CONFIG_PATH]',
    '  bccli-preview resume [--model MODEL] [prompt]',
    '  bccli-preview -c [-m MODEL] [prompt]  (resume current project)',
    '  bccli-preview auth status  (offline; does not print API key)',
    '',
    'Credentials: existing bccli login (bc-cloud), or BOTCONNECTOR_API_KEY environment override.',
    'Model choice: --model, BOTCONNECTOR_MODEL_ID, otherwise ling-3.0-flash (must exist in Gateway /models).',
    'Security: fixed BotConnector endpoint, ephemeral local token, --bare and default approvals.',
    'MCP: explicit JSON only, directly under ~/.bccli-preview/ (no project configs).',
    'Text-only -p alias; public --output-format JSON/stream-json and -r picker are not yet supported.',
    'Not a replacement for the currently published bccli command.',
  ].join('\n'))
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 && !process.stdin.isTTY) { help(); return 2 }
  if (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') { help(); return 0 }
  if (argv.length === 1 && (argv[0] === '--version' || argv[0] === '-v')) {
    // Offline informational command: never inspect credentials or contact Gateway.
    const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
    console.log(pkg.version)
    return 0
  }
  const args = parseArgs(argv)
  if (args.command === 'auth') {
    const status = botConnectorCredentialStatus()
    if (status.configured) {
      console.log('BotConnector credential configured via ' +
        (status.source === 'environment' ? 'BOTCONNECTOR_API_KEY environment variable.' : 'existing public BCCLI bc-cloud login.') +
        ' Not verified online. No AI request was sent.')
      return 0
    }
    console.error('BotConnector credential not configured or unreadable. ' +
      'Use the existing public "bccli login bc-cloud" or set BOTCONNECTOR_API_KEY. ' +
      'No credential was changed and no AI request was sent.')
    return 1
  }
  if (args.command !== 'models') assertCandidateRuntimeSupported() // Avoid network/key reads before compatibility check.
  const key = botConnectorKey()
  const models = await discoverModels({ key })
  if (args.command === 'models') {
    if (args.json) console.log(JSON.stringify({ data: models }, null, 2))
    else models.forEach((item) => console.log(item.id))
    return 0
  }
  const model = selectModel(models, args.model ?? process.env.BOTCONNECTOR_MODEL_ID ?? DEFAULT_MODEL)
  if (!args.prompt && !process.stdin.isTTY) throw Error('Interactive mode requires a TTY; use run "prompt".')
  const mcpConfig = resolveTrustedMcpConfig(args.mcpConfig)
  const entrypoint = prepareBrandedQwen(resolveQwenEntrypoint())
  return launchQwen({ key, model, prompt: args.prompt, mcpConfig, entrypoint, continueSession: args.command === 'resume' })
}

main().then((code) => { process.exitCode = code }, (error) => {
  // Error messages deliberately never contain credentials or raw HTTP response bodies.
  console.error('BCCLI candidate: ' + (error instanceof Error ? error.message : 'Unexpected error.'))
  process.exitCode = 1
})

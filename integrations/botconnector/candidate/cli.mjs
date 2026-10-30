#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { DEFAULT_MODEL, assertCandidateRuntimeSupported, discoverModels, launchQwen, parseArgs, resolveQwenEntrypoint, resolveTrustedMcpConfig, selectModel } from './core.mjs'
import { prepareBrandedQwen } from './branding.mjs'
import { botConnectorCredentialStatus } from './credentials.mjs'
import { resolveProvider, selectedProvider, providerDefinition } from './providers.mjs'
import { runProviderCommand } from './provider-cli.mjs'
import { startupMenu, PROVIDER_SWITCH_EXIT } from './startup-menu.mjs'

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
    '  bccli-preview provider list|add|use|remove [ID]  (manage provider keys)',
    '  bccli-preview models --provider ID  (list models for provider)',
    '  bccli-preview chat --provider ID --model MODEL_ID',
    '  bccli  (new local BCCLI with interactive provider and model setup)',
    '  During chat: /provider or /auth to reopen provider and key picker.',
    '',
    'Credentials: existing BotConnector login or encrypted per-user provider API keys (Windows).',
    'Provider choices: botconnector, openai, openrouter, deepseek, groq, xai.',
    'Key entry: bccli-preview provider add openrouter (hidden terminal prompt).',
    'Model choice: --model; BotConnector defaults to ling-3.0-flash. Other providers need --model.',
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
  if (args.command === 'provider') return runProviderCommand(args.prompt.trim() ? args.prompt.trim().split(/\s+/) : [])
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
  if (args.command !== 'models') assertCandidateRuntimeSupported()
  if (args.command === 'models') {
    const profile = resolveProvider(args.provider ?? selectedProvider())
    const models = await discoverModels({ key: profile.key, endpoint: profile.endpoint })
    if (args.json) console.log(JSON.stringify({ data: models }, null, 2))
    else models.forEach((item) => console.log(item.id))
    return 0
  }
  if (!args.prompt && !process.stdin.isTTY) throw Error('Interactive mode requires a TTY; use -p "prompt".')
  const mcpConfig = resolveTrustedMcpConfig(args.mcpConfig)
  let chosen
  const showPicker = args.command === 'chat' && !args.prompt && !args.model
  if (showPicker) {
    chosen = await startupMenu({
      ...(args.provider ? { currentProvider: () => args.provider } : {}),
    })
  } else {
    const providerId = args.provider ?? selectedProvider()
    const profile = resolveProvider(providerId)
    const models = await discoverModels({ key: profile.key, endpoint: profile.endpoint })
    const requested = args.model ??
      (providerId === 'botconnector' ? (process.env.BOTCONNECTOR_MODEL_ID ?? DEFAULT_MODEL) : undefined)
    if (!requested) throw Error('Use --model MODEL_ID for ' + providerId + '.')
    chosen = { providerId, model: selectModel(models, requested), key: profile.key, endpoint: profile.endpoint }
  }
  const entrypoint = prepareBrandedQwen(resolveQwenEntrypoint())
  let continueSession = args.command === 'resume'
  for (;;) {
    console.log('BCCLI | ' + providerDefinition(chosen.providerId).name + ' | ' + chosen.model)
    const code = await launchQwen({
      key: chosen.key, model: chosen.model, prompt: args.prompt,
      mcpConfig, entrypoint, upstream: chosen.endpoint,
      providerId: chosen.providerId, continueSession,
    })
    if (code !== PROVIDER_SWITCH_EXIT) return code
    if (args.prompt || !process.stdin.isTTY) throw Error('Provider menu requires an interactive terminal.')
    // /provider and /auth close the current engine cleanly, then the parent
    // asks for a key and model. Keys never enter the Qwen agent process.
    const previousProvider = chosen.providerId
    chosen = await startupMenu()
    continueSession = previousProvider === chosen.providerId
  }
}

main().then((code) => { process.exitCode = code }, (error) => {
  // Error messages deliberately never contain credentials or raw HTTP response bodies.
  console.error('BCCLI candidate: ' + (error instanceof Error ? error.message : 'Unexpected error.'))
  process.exitCode = 1
})

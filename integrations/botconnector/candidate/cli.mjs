#!/usr/bin/env node
import { DEFAULT_MODEL, assertCandidateRuntimeSupported, discoverModels, launchQwen, parseArgs, resolveQwenEntrypoint, resolveTrustedMcpConfig, selectModel } from './core.mjs'
import { prepareBrandedQwen } from './branding.mjs'
import { botConnectorKey } from './credentials.mjs'

function help() {
  console.log([
    'BCCLI | BotConnector — isolated coding agent candidate',
    'Usage:',
    '  bccli-qwen-candidate models [--json]',
    '  bccli-qwen-candidate run --model MODEL "prompt" [--mcp-config OWNER_CONFIG_PATH]',
    '  bccli-qwen-candidate chat [--model MODEL] [--mcp-config OWNER_CONFIG_PATH]',
    '  bccli-qwen-candidate resume [--model MODEL] [prompt]',
    '',
    'Credentials: existing bccli login (bc-cloud), or BOTCONNECTOR_API_KEY environment override.',
    'Model choice: --model, BOTCONNECTOR_MODEL_ID, otherwise ling-3.0-flash (must exist in Gateway /models).',
    'Security: fixed BotConnector endpoint, ephemeral local token, --bare and default approvals.',
    'MCP: explicit JSON only, directly under ~/.bccli-qwen-candidate/ (no project configs).',
    'Not a replacement for the currently published bccli command.',
  ].join('\n'))
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 && !process.stdin.isTTY) { help(); return 2 }
  if (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') { help(); return 0 }
  const args = parseArgs(argv)
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

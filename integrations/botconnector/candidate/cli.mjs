#!/usr/bin/env node
import { discoverModels, launchQwen, parseArgs, selectModel } from './core.mjs'

function help() {
  console.log([
    'BCCLI Qwen Candidate — isolated upstream-first prototype',
    'Usage:',
    '  bccli-qwen-candidate models [--json]',
    '  bccli-qwen-candidate run --model MODEL "prompt"',
    '  bccli-qwen-candidate chat --model MODEL',
    '',
    'Credentials: set BOTCONNECTOR_API_KEY securely in your process environment.',
    'Model choice: use --model or BOTCONNECTOR_MODEL_ID (must exist in live Gateway /models).',
    'Security: fixed BotConnector endpoint, upstream --bare and default approvals.',
    'Not a replacement for the currently published bccli command.',
  ].join('\n'))
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 && !process.stdin.isTTY) { help(); return 2 }
  if (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') { help(); return 0 }
  const args = parseArgs(argv)
  const key = process.env.BOTCONNECTOR_API_KEY
  const models = await discoverModels({ key })
  if (args.command === 'models') {
    if (args.json) console.log(JSON.stringify({ data: models }, null, 2))
    else models.forEach((item) => console.log(item.id))
    return 0
  }
  const model = selectModel(models, args.model ?? process.env.BOTCONNECTOR_MODEL_ID)
  if (!args.prompt && !process.stdin.isTTY) throw Error('Interactive mode requires a TTY; use run "prompt".')
  return launchQwen({ key, model, prompt: args.prompt })
}

main().then((code) => { process.exitCode = code }, (error) => {
  // Error messages deliberately never contain credentials or raw HTTP response bodies.
  console.error('BCCLI candidate: ' + (error instanceof Error ? error.message : 'Unexpected error.'))
  process.exitCode = 1
})

// Provider management is an explicitly invoked CLI operation, not a model prompt.
import { PROVIDERS, isConfigured, providerDefinition, removeProvider, saveProviderKey, selectedProvider, useProvider } from './providers.mjs'

export async function hiddenApiKey({ input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY || typeof input.setRawMode !== 'function') throw Error('Provider add requires an interactive terminal to enter a hidden API key.')
  output.write('Paste API key (hidden; Enter to save, Ctrl+C to cancel): ')
  return new Promise((resolve, reject) => {
    let value = ''
    const finish = (error) => {
      input.off('data', onData)
      input.off('end', onEnd)
      input.setRawMode(false)
      input.pause()
      output.write('\n')
      error ? reject(error) : resolve(value)
    }
    const onEnd = () => finish(Error('API key input ended before confirmation.'))
    const onData = buffer => {
      for (const ch of buffer.toString('utf8')) {
        if (ch === '\u0003') return finish(Error('Cancelled.'))
        if (ch === '\r' || ch === '\n') return finish(value ? null : Error('Empty API key; nothing saved.'))
        if (ch === '\u007f' || ch === '\b') { value = value.slice(0, -1); continue }
        if (ch.charCodeAt(0) < 32) continue
        value += ch
        if (value.length > 8192) return finish(Error('API key is too long; nothing saved.'))
      }
    }
    input.on('data', onData)
    input.on('end', onEnd)
    input.setRawMode(true)
    input.resume()
  })
}

export async function runProviderCommand(words, {
  env = process.env,
  getKey = hiddenApiKey,
  out = text => console.log(text),
  save = saveProviderKey,
  select = useProvider,
  remove = removeProvider,
  configured = isConfigured,
  active = selectedProvider,
} = {}) {
  const [action = 'list', id, ...extra] = words
  if (!['list', 'add', 'use', 'remove'].includes(action) || (action === 'list' ? words.length > 1 : !id || extra.length)) {
    throw Error('Use: provider list | add PROVIDER | use PROVIDER | remove PROVIDER.')
  }
  if (action === 'list') {
    const current = active({env})
    for (const [name, info] of Object.entries(PROVIDERS)) {
      out(name + ' - ' + info.name + ' [' + (configured(name,{env}) ? 'configured' : 'no key') + ']' + (name === current ? ' [ACTIVE]' : ''))
    }
    out('Add: bccli provider add openrouter; select: bccli provider use openrouter')
    out('Provider keys are stored encrypted for your Windows user. Other systems: use the provider environment variable.')
    return 0
  }
  providerDefinition(id)
  if (action === 'add') {
    if (id === 'botconnector') throw Error('For BotConnector, use the existing "bccli-legacy login bc-cloud".')
    out('Provider: ' + PROVIDERS[id].name + ' (direct API; provider billing and terms apply).')
    const key = await getKey()
    save(id, key)
    select(id,{env})
    out('API key securely saved and provider selected: ' + id + '. Key was not printed. No AI request sent.')
    out('Run: bccli models, then bccli chat --model MODEL_ID')
    return 0
  }
  if (action === 'use') {
    select(id,{env})
    out('Active provider: ' + id + '. New sessions only; existing chats are unchanged.')
    return 0
  }
  remove(id,{env})
  out('Saved provider key removed for ' + id + '. Environment variables, if set, are not changed.')
  return 0
}

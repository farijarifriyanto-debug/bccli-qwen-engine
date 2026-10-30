import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { startGatewayProxy } from '../proxy.mjs'
import { BCCLI_PROVIDER_COMMAND } from '../provider-command.mjs'

function fixture() {
  const routes = []
  const changed = []
  const profiles = {
    botconnector: { id: 'botconnector', endpoint: 'https://api.botconnector.id/v1', key: 'PARENT_BC_REAL_KEY' },
    openai: { id: 'openai', endpoint: 'https://api.openai.com/v1', key: 'PARENT_OPENAI_REAL_KEY' },
  }
  const list = {
    botconnector: ['ling-3.0-flash', 'agnes-3.0-flash'],
    openai: ['gpt-4.1', 'gpt-4.1-mini'],
  }
  return {
    routes, changed, profiles,
    proxyOptions: {
      initialProvider: 'botconnector',
      key: profiles.botconnector.key,
      endpoint: profiles.botconnector.endpoint,
      token: 'TEMP_LOCAL_TOKEN',
      liveProvider: true,
      configured: id => Object.hasOwn(profiles, id),
      resolveProfile: id => profiles[id],
      selectProvider: id => changed.push(['provider', id]),
      rememberModel: (id, model) => changed.push(['model', id, model]),
      fetchImpl: async (url, opts) => {
        routes.push({ url, method: opts.method, authorization: opts.headers.authorization, body: String(opts.body ?? '') })
        if (url.endsWith('/models')) {
          const id = url.includes('api.openai.com') ? 'openai' : 'botconnector'
          return Response.json({ data: list[id].map(id => ({ id })) })
        }
        return Response.json({ id: 'completion', choices: [] })
      },
    },
  }
}

function slash(proxy, model = 'ling-3.0-flash') {
  const models = { current: model, changed: [] }
  const env = { OPENAI_BASE_URL: proxy.baseUrl, OPENAI_API_KEY: proxy.token }
  const command = vm.runInNewContext(BCCLI_PROVIDER_COMMAND + '\nauthCommand', {
    process: { env }, fetch, AbortSignal, Map, Number, RegExp, String, Error, JSON, Object,
    __name: f => f,
  })
  const config = {
    getModel: () => models.current,
    async setModel(id, meta) { models.current = id; models.changed.push([id, meta.reason]) },
  }
  return { models, env, call: async args => command.action({ invocation: { args }, services: { config } }, args) }
}

test('switch BotConnector to OpenAI in the same chat, with model and proxy routing updated', async () => {
  const f = fixture()
  const proxy = await startGatewayProxy(f.proxyOptions)
  try {
    const x = slash(proxy)
    const menu = await x.call('')
    assert.match(menu.content, /openai/)
    assert.match(menu.content, /ling-3.0-flash|botconnector/)
    const catalog = await x.call('openai')
    assert.match(catalog.content, /gpt-4\.1/)
    const selected = await x.call('openai 1')
    assert.match(selected.content, /without exiting this chat|current chat remains open/)
    assert.equal(x.models.current, 'gpt-4.1')
    assert.equal(x.models.changed[0][1], 'bccli-provider-switch')
    assert.deepEqual(f.changed, [['model', 'openai', 'gpt-4.1'], ['provider', 'openai']])
    const req = await fetch(proxy.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4.1', messages: [{ role: 'user', content: 'test' }] }),
    })
    assert.equal(req.status, 200)
    const forwarded = f.routes.at(-1)
    assert.equal(forwarded.url, 'https://api.openai.com/v1/chat/completions')
    assert.equal(forwarded.authorization, 'Bearer PARENT_OPENAI_REAL_KEY')
    assert.doesNotMatch(JSON.stringify(menu) + JSON.stringify(catalog) + JSON.stringify(selected), /PARENT_(BC|OPENAI)_REAL_KEY|TEMP_LOCAL_TOKEN/)
  } finally { await proxy.close() }
})

test('reject unconfigured provider, invalid model, wrong token; never change current billing route', async () => {
  const f = fixture()
  const proxy = await startGatewayProxy(f.proxyOptions)
  try {
    const x = slash(proxy)
    assert.match((await x.call('groq')).content, /no configured key/)
    assert.equal((await x.call('openai ../../unsafe')).messageType, 'error')
    assert.equal((await fetch(proxy.baseUrl + '/bccli/providers', { headers: { authorization: 'Bearer NOT_LOCAL' } })).status, 401)
    assert.equal((await fetch(proxy.baseUrl + '/bccli/provider/switch', {
      method: 'POST', headers: { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'openai', model: 'gpt-4.1' }),
    })).status, 400)
    assert.equal(x.models.current, 'ling-3.0-flash')
    assert.deepEqual(f.changed, [])
    const req = await fetch(proxy.baseUrl + '/chat/completions', {
      method: 'POST', headers: { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'ling-3.0-flash', messages: [{ role: 'user', content: 'test' }] }),
    })
    assert.equal(req.status, 200)
    assert.equal(f.routes.at(-1).url, 'https://api.botconnector.id/v1/chat/completions')
  } finally { await proxy.close() }
})

test('a rejected parent switch rolls back active model (never routes silently)', async () => {
  const f = fixture()
  const proxy = await startGatewayProxy({ ...f.proxyOptions, selectProvider: () => { throw Error('storage refused') } })
  try {
    const x = slash(proxy)
    const reply = await x.call('openai gpt-4.1-mini')
    assert.equal(reply.messageType, 'error')
    assert.equal(x.models.current, 'ling-3.0-flash')
    assert.deepEqual(x.models.changed.map(x => x[1]), ['bccli-provider-switch','bccli-provider-switch-rollback'])
    const list = await fetch(proxy.baseUrl + '/bccli/providers', { headers: { authorization: 'Bearer ' + proxy.token } })
    assert.equal((await list.json()).active, 'botconnector')
  } finally { await proxy.close() }
})

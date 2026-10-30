import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { GATEWAY } from './gateway.mjs'
import { ALLOWED_PROVIDER_ENDPOINTS, PROVIDERS, resolveProvider, isConfigured, useProvider, saveSelectedModel } from './providers.mjs'

// This proxy lives only for one Qwen Code session. Real provider keys remain in
// the launcher process; MCP and bash subprocesses can see only a short-lived
// local bearer token. The proxy cannot be redirected to arbitrary hosts.
const ALLOWED_PATHS = new Set(['/v1/models', '/v1/chat/completions', '/v1/responses'])
const MAX_REQUEST_BYTES = 16 * 1024 * 1024

// Qwen 0.26.3 produces get_goal without parameters and read_file with
// optional JSON-schema type unions such as ["integer", "null"]. Strict
// OpenAI-compatible providers reject both formats while parsing tools.
// Normalize only the incompatible pieces, preserving all coding tools.
function normalizeOptionalNullableSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema
  let out = schema
  if (schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)) {
    const required = new Set(Array.isArray(schema.required) ? schema.required : [])
    let properties = schema.properties
    for (const [name, field] of Object.entries(schema.properties)) {
      if (!field || typeof field !== 'object' || Array.isArray(field)) continue
      let candidate = field
      // The optional absence of a field already represents null; dropping
      // "null" from this one optional JSON-Schema union is safe. Do not rewrite
      // required nullable fields or multi-type unions (fail closed upstream).
      if (!required.has(name) && Array.isArray(field.type) && field.type.length === 2
        && field.type.includes('null')) {
        const primitive = field.type.find((type) => type !== 'null')
        if (['string', 'number', 'integer', 'boolean', 'object', 'array'].includes(primitive)) {
          candidate = { ...field, type: primitive }
        }
      }
      candidate = normalizeOptionalNullableSchema(candidate)
      if (candidate !== field) {
        if (properties === schema.properties) properties = { ...properties }
        properties[name] = candidate
      }
    }
    if (properties !== schema.properties) out = { ...out, properties }
  }
  if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
    const items = normalizeOptionalNullableSchema(schema.items)
    if (items !== schema.items) out = { ...out, items }
  }
  return out
}

export function normalizeZeroArgFunctionTools(requestBody) {
  if (!requestBody || typeof requestBody !== 'object' || !Array.isArray(requestBody.tools)) return requestBody
  let changed = false
  const tools = requestBody.tools.map((tool) => {
    const fn = tool?.type === 'function' ? tool.function : null
    if (!fn || typeof fn.name !== 'string') return tool
    const parameters = fn.parameters == null
      ? { type: 'object', properties: {} }
      : normalizeOptionalNullableSchema(fn.parameters)
    if (parameters === fn.parameters) return tool
    changed = true
    return { ...tool, function: { ...fn, parameters } }
  })
  return changed ? { ...requestBody, tools } : requestBody
}

// The model can be switched with /model without restarting the coding agent.
// Annotate each request with the ACTUAL model chosen by Qwen Config, rather
// than retaining a stale --append-system-prompt model from CLI startup.
export function attachRuntimeModelContext(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.messages)) return payload
  const model = payload.model
  if (typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,255}$/.test(model)) return payload
  const index = payload.messages.findIndex(item => item?.role === 'system' && typeof item.content === 'string')
  if (index === -1) return payload
  const runtime = '\n\nRuntime metadata (not model instructions): active_model_id=' + model + '; client_app=BCCLI; transport=local-proxy.'
  const messages = [...payload.messages]
  messages[index] = { ...messages[index], content: messages[index].content + runtime }
  return { ...payload, messages }
}

// Qwen 0.26.3 sends max_tokens=64000 for many model IDs. Several Gateway
// upstream routes reject that value (e.g. GLM Flash). Bound the requested
// output conservatively for coding-agent interoperability; never increase it.
// This does not change the context window or input-token budget.
const DEFAULT_OUTPUT_TOKEN_CEILING = 4096
export function boundChatOutputTokens(payload) {
  if (!payload || typeof payload !== 'object') return payload
  const legacy = payload.max_tokens
  const modern = payload.max_completion_tokens
  const valid = (value) => Number.isInteger(value) && value > 0

  // Real Gateway's exact Kimi route rejects legacy max_tokens. Keep parity
  // with PAYG validation for positive decimal numeric strings, without
  // changing the output-ceiling policy for any other model.
  if (payload.model === 'kimi-k2.7-code') {
    const parsed = (value) => {
      if (typeof value !== 'number' && !(typeof value === 'string' && /^[0-9]+$/.test(value))) return null
      const n = Number(value)
      return Number.isSafeInteger(n) && n > 0 ? n : null
    }
    const legacyValue = parsed(legacy)
    const modernValue = parsed(modern)
    if (legacyValue != null) {
      const requested = modernValue != null ? Math.min(legacyValue, modernValue) : legacyValue
      const { max_tokens: _ignored, ...rest } = payload
      return { ...rest, max_completion_tokens: Math.min(requested, DEFAULT_OUTPUT_TOKEN_CEILING) }
    }
    if (modernValue != null && (typeof modern !== 'number' || modernValue > DEFAULT_OUTPUT_TOKEN_CEILING)) {
      return { ...payload, max_completion_tokens: Math.min(modernValue, DEFAULT_OUTPUT_TOKEN_CEILING) }
    }
  }
  if (valid(legacy) && legacy > DEFAULT_OUTPUT_TOKEN_CEILING) {
    return { ...payload, max_tokens: DEFAULT_OUTPUT_TOKEN_CEILING }
  }
  if (valid(modern) && modern > DEFAULT_OUTPUT_TOKEN_CEILING) {
    return { ...payload, max_completion_tokens: DEFAULT_OUTPUT_TOKEN_CEILING }
  }
  return payload
}

function waitForDrainOrClose(res) {
  if (res.destroyed) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      res.off('drain', done)
      res.off('close', done)
      resolve()
    }
    res.once('drain', done)
    res.once('close', done)
  })
}

function matchesToken(auth, token) {
  if (typeof auth !== 'string') return false
  const actual = Buffer.from(auth)
  const expected = Buffer.from('Bearer ' + token)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function startGatewayProxy({ key, endpoint = GATEWAY, token = randomBytes(32).toString('hex'), fetchImpl = fetch, liveProvider = false, initialProvider = 'botconnector', resolveProfile = resolveProvider, configured = isConfigured, selectProvider = useProvider, rememberModel = saveSelectedModel } = {}) {
  if (!ALLOWED_PROVIDER_ENDPOINTS.includes(endpoint)) throw Error('Unapproved provider endpoint; local proxy refused to start.')
  if (typeof key !== 'string' || !key.trim()) throw Error('Gateway key is required for local proxy.')
  if (typeof token !== 'string' || token.length < 6 || token === key) throw Error('Invalid or non-isolated proxy token.')

  // In-process provider switching keeps the same coding-agent session and
  // approval state. Real keys never leave the parent proxy, and the configured
  // HTTPS endpoint must belong to the audited provider allowlist.
  let active = { id: initialProvider, endpoint, key }
  let inFlight = 0
  const publicProviders = () => Object.entries(PROVIDERS).map(([id, item]) => ({
    id, name: item.name, active: id === active.id, configured: configured(id),
  }))
  const getModels = async (id) => {
    if (!Object.hasOwn(PROVIDERS, id)) throw Error('Unsupported provider')
    if (!configured(id)) throw Error('Provider is not configured')
    const profile = resolveProfile(id)
    if (!ALLOWED_PROVIDER_ENDPOINTS.includes(profile.endpoint) || profile.endpoint !== PROVIDERS[id].endpoint || !profile.key) {
      throw Error('Unsafe provider profile')
    }
    const upstream = await fetchImpl(profile.endpoint + '/models', {
      method: 'GET',
      headers: { authorization: 'Bearer ' + profile.key, accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(12000),
    })
    if (!upstream.ok) throw Error('Provider catalog unavailable')
    const body = await upstream.json()
    if (!Array.isArray(body?.data)) throw Error('Invalid catalog')
    const modelId = /^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,255}$/
    const ids = [...new Set(body.data.map(x => x?.id).filter(x => typeof x === 'string' && modelId.test(x)))].sort()
    if (!ids.length) throw Error('No eligible models')
    return { profile, models: ids }
  }
  const server = createServer(async (req, res) => {
    const fail = (status, body) => {
      if (res.headersSent || res.destroyed) return
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ error: body }))
    }

    if (!matchesToken(req.headers.authorization, token)) {
      fail(401, 'Local session token is required.')
      return
    }
    // Provider management is a local-only, authenticated, explicitly user-
    // invoked slash command. The payload is never forwarded as an AI prompt.
    if (req.url === '/v1/bccli/providers' && liveProvider && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ providers: publicProviders(), active: active.id }))
      return
    }
    const modelsMatch = liveProvider && /^\/v1\/bccli\/providers\/([a-z][a-z0-9-]{0,31})\/models$/.exec(req.url ?? '')
    if (modelsMatch && req.method === 'GET') {
      try {
        const { models } = await getModels(modelsMatch[1])
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ provider: modelsMatch[1], models }))
      } catch {
        fail(400, 'Provider is not configured or its model catalog cannot be verified.')
      }
      return
    }
    if (req.url === '/v1/bccli/provider/switch' && liveProvider && req.method === 'POST') {
      if (inFlight) { fail(409, 'Finish the active AI response before switching providers.'); return }
      if (Number(req.headers['content-length'] || 0) > 1024) { fail(413, 'Invalid provider selection.'); return }
      try {
        const buffers = []
        let length = 0
        for await (const part of req) {
          length += part.length
          if (length > 1024) { fail(413, 'Invalid provider selection.'); return }
          buffers.push(part)
        }
        const selection = JSON.parse(Buffer.concat(buffers).toString('utf8'))
        const id = selection?.provider
        const model = selection?.model
        if (selection?.action !== 'user-selected-provider' ||
            typeof id !== 'string' || !Object.hasOwn(PROVIDERS, id) ||
            typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,255}$/.test(model)) {
          fail(400, 'Invalid provider/model selection.')
          return
        }
        const { profile, models } = await getModels(id)
        if (!models.includes(model)) { fail(400, 'Model is not available to the selected provider.'); return }
        // No real key or upstream metadata is sent to the coding engine.
        rememberModel(id, model)
        selectProvider(id)
        active = { id, endpoint: profile.endpoint, key: profile.key }
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ provider: id, model }))
      } catch {
        fail(400, 'Provider switch rejected; previous provider retained.')
      }
      return
    }
    if (!ALLOWED_PATHS.has(req.url ?? '')) {
      fail(404, 'Unsupported local gateway route.')
      return
    }
    const method = req.url === '/v1/models' ? 'GET' : 'POST'
    if (req.method !== method) {
      fail(405, 'Unsupported request method.')
      return
    }
    if (req.headers['content-length'] && Number(req.headers['content-length']) > MAX_REQUEST_BYTES) {
      fail(413, 'Request too large.')
      return
    }

    let counted = false
    const abort = new AbortController()
    const onClose = () => { if (!res.writableEnded) abort.abort() }
    res.once('close', onClose)
    try {
      let body
      if (method === 'POST') {
        const buffers = []
        let bytes = 0
        for await (const chunk of req) {
          bytes += chunk.length
          if (bytes > MAX_REQUEST_BYTES) {
            fail(413, 'Request too large.')
            return
          }
          buffers.push(chunk)
        }
        body = Buffer.concat(buffers)
        if (req.url === '/v1/chat/completions') {
          let parsed
          try { parsed = JSON.parse(body.toString('utf8')) }
          catch { fail(400, 'Invalid JSON request.'); return }
          const normalized = boundChatOutputTokens(attachRuntimeModelContext(normalizeZeroArgFunctionTools(parsed)))
          if (normalized !== parsed) body = Buffer.from(JSON.stringify(normalized))
        }
      }
      inFlight += 1
      counted = true
      const destination = active
      const upstream = await fetchImpl(destination.endpoint + req.url.slice(3), {
        method,
        headers: {
          authorization: 'Bearer ' + destination.key,
          accept: 'application/json, text/event-stream',
          ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
        },
        body,
        redirect: 'error',
        signal: abort.signal,
      })
      res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      })
      if (upstream.body) {
        for await (const chunk of upstream.body) {
          if (res.destroyed) break
          if (!res.write(chunk)) await waitForDrainOrClose(res)
        }
      }
      res.end()
    } catch {
      if (res.headersSent) res.destroy()
      else fail(502, 'Provider connection failed.')
    } finally {
      if (counted) inFlight -= 1
      res.off('close', onClose)
    }
  })

  await new Promise((resolve, reject) => {
    const onError = (error) => { server.off('listening', onListening); reject(error) }
    const onListening = () => { server.off('error', onError); resolve() }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(0, '127.0.0.1')
  })
  const port = server.address()?.port
  return {
    token,
    baseUrl: 'http://127.0.0.1:' + port + '/v1',
    async close() {
      server.closeAllConnections()
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    },
  }
}

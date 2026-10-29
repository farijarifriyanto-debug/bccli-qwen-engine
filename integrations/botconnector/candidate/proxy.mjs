import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { GATEWAY } from './gateway.mjs'

// This proxy lives only for one Qwen Code session. Real provider keys remain in
// the launcher process; MCP and bash subprocesses can see only a short-lived
// local bearer token. The proxy cannot be redirected to arbitrary hosts.
const ALLOWED_PATHS = new Set(['/v1/models', '/v1/chat/completions', '/v1/responses'])
const MAX_REQUEST_BYTES = 16 * 1024 * 1024

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

export async function startGatewayProxy({ key, token = randomBytes(32).toString('hex'), fetchImpl = fetch } = {}) {
  if (typeof key !== 'string' || !key.trim()) throw Error('Gateway key is required for local proxy.')
  if (typeof token !== 'string' || token.length < 6 || token === key) throw Error('Invalid or non-isolated proxy token.')

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
      }
      const upstream = await fetchImpl(GATEWAY + req.url.slice(3), {
        method,
        headers: {
          authorization: 'Bearer ' + key,
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
      else fail(502, 'Gateway connection failed.')
    } finally {
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

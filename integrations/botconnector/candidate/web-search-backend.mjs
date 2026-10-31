// Provider-neutral model tool backed by Brave Web Search.
// Only the parent BCCLI proxy owns the Brave API key; the coding engine never does.
const SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'
const MAX_BYTES = 512 * 1024
export const BRAVE_KEY_ENV = 'BRAVE_SEARCH_API_KEY'

export function validateSearchQuery(query) {
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 250 ||
      /[\x00-\x1f\x7f]/.test(query)) {
    throw Error('Search query must contain 2-250 characters without control characters.')
  }
  return query.trim()
}

function publicResultUrl(value) {
  try {
    const u = new URL(value)
    const hostname = u.hostname.toLowerCase()
    if (u.protocol !== 'https:' || u.username || u.password || u.port ||
        !hostname.includes('.') || /^\d+(?:\.\d+){3}$/.test(hostname) ||
        /^\[.*\]$/.test(hostname) ||
        /(?:^|\.)(localhost|internal|local|invalid|test)$/.test(hostname)) return null
    u.hash = ''
    return u.href
  } catch { return null }
}

export async function searchWithBrave({query,key,fetchImpl=fetch,timeoutMs=10000}={}) {
  const q = validateSearchQuery(query)
  if (typeof key !== 'string' || !key.trim() || key.length > 8192 ||
      /[\r\n]/.test(key)) throw Error('Search backend is not configured.')
  const endpoint = new URL(SEARCH_ENDPOINT)
  endpoint.searchParams.set('q',q)
  endpoint.searchParams.set('count','5')
  const response = await fetchImpl(endpoint.href,{
    method:'GET',
    headers:{
      'accept':'application/json',
      'x-subscription-token':key.trim(),
    },
    redirect:'error',
    signal:AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw Error('Search backend HTTP '+response.status)
  const size = Number(response.headers.get('content-length')||'0')
  if (size > MAX_BYTES) throw Error('Search results exceed safety limit.')
  const raw = await response.text()
  if (Buffer.byteLength(raw,'utf8') > MAX_BYTES) throw Error('Search results exceed safety limit.')
  let parsed
  try { parsed=JSON.parse(raw) } catch { throw Error('Search backend returned invalid JSON.') }
  if (!Array.isArray(parsed?.web?.results)) throw Error('Search backend returned invalid result format.')
  const results=[]
  for (const item of parsed.web.results) {
    const url=publicResultUrl(item?.url)
    if (!url) continue
    const title=typeof item.title==='string'?item.title.trim().slice(0,200):''
    const snippet=typeof item.description==='string'?item.description.trim().slice(0,650):''
    results.push({title,url,snippet})
    if (results.length===5) break
  }
  return {query:q,results,provider:'brave'}
}

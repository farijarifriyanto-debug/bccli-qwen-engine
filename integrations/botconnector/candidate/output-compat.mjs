// Translate pinned upstream headless protocol into public BCCLI 0.4.17 JSON/JSONL contracts.
// Owned by parent launcher; never executes tools, network calls, or receives provider keys.
import { once } from 'node:events'

const MAX_JSON_BYTES = 32 * 1024 * 1024
const MAX_JSONL_LINE_BYTES = 16 * 1024 * 1024

export function legacyModelRef(providerId, model) {
  return (providerId === 'botconnector' ? 'bc-cloud' : providerId) + '/' + model
}

export function legacyResult(record, { providerId, model }) {
  if (!record || record.type !== 'result') throw Error('Structured engine result is missing.')
  const failed = record.is_error === true || (record.subtype !== undefined && record.subtype !== 'success')
  return {
    status: failed ? 'failed' : 'ok',
    model: legacyModelRef(providerId, model),
    session_id: typeof record.session_id === 'string' ? record.session_id : null,
    usage: record.usage && typeof record.usage === 'object' && !Array.isArray(record.usage) ? record.usage : {},
    duration_ms: Number.isFinite(record.duration_ms) && record.duration_ms >= 0 ? record.duration_ms : 0,
    result: typeof record.result === 'string' ? record.result : '',
  }
}

export function legacyJsonDocument(document, context) {
  // Upstream Qwen v0.26.3 JSON is an array of events, not the legacy final object.
  if (document && !Array.isArray(document) && document.status && typeof document.result === 'string') {
    return document
  }
  if (!Array.isArray(document)) throw Error('Unexpected structured engine JSON document.')
  const result = document.findLast(event => event?.type === 'result')
  return legacyResult(result, context)
}

export function legacyJsonlEvents(event, state, context) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw Error('Invalid structured engine event.')
  const output = []
  if (event.type === 'stream_event') {
    const delta = event.event?.delta
    if (event.event?.type === 'content_block_delta' && delta?.type === 'text_delta' && typeof delta.text === 'string') {
      state.streamedText += delta.text
      output.push({type:'text_delta',delta:delta.text})
    }
  }
  if (event.type === 'assistant') {
    const blocks = Array.isArray(event.message?.content) ? event.message.content : []
    for (const block of blocks) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        // When upstream already emitted live deltas, emit only the unread suffix.
        const delta = state.streamedText && block.text.startsWith(state.streamedText)
          ? block.text.slice(state.streamedText.length)
          : state.streamedText ? '' : block.text
        if (delta) output.push({type:'text_delta',delta})
      }
      if (block?.type === 'tool_use') {
        if (typeof block.id === 'string' && typeof block.name === 'string') state.tools.set(block.id,block.name)
        output.push({type:'tool_use',tool:block.name, target:typeof block.input === 'string'?block.input:JSON.stringify(block.input ?? {})})
      }
    }
    state.streamedText = ''
  }
  if (event.type === 'user') {
    const blocks = Array.isArray(event.message?.content) ? event.message.content : []
    for (const block of blocks) {
      if (block?.type !== 'tool_result') continue
      const tool = state.tools.get(block.tool_use_id)
      output.push({
        type:'tool_result',tool,
        isError:block.is_error === true,
        output:typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? ''),
      })
    }
  }
  if (event.type === 'result') {
    const result = legacyResult(event,context)
    if (result.result) output.push({type:'message',text:result.result})
    output.push({
      type:'result',status:result.status,model:result.model,
      session_id:result.session_id,usage:result.usage,duration_ms:result.duration_ms,
    })
    state.sawResult = true
  }
  return output
}

async function writeLine(output, value) {
  const ok = output.write(JSON.stringify(value) + '\n')
  if (ok === false && typeof output.once === 'function') await once(output,'drain')
}

export async function writeLegacyStructuredOutput(readable, {
  outputFormat, providerId, model, output = process.stdout,
}) {
  if (!readable || typeof readable[Symbol.asyncIterator] !== 'function') {
    throw Error('Structured engine stdout is unavailable.')
  }
  const context = {providerId,model}
  if (outputFormat === 'json') {
    const chunks = []
    let total = 0
    for await (const part of readable) {
      const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part)
      total += chunk.length
      if (total > MAX_JSON_BYTES) throw Error('Structured engine output exceeds safe limit.')
      chunks.push(chunk)
    }
    let parsed
    try { parsed=JSON.parse(Buffer.concat(chunks).toString('utf8')) }
    catch { throw Error('Structured engine returned invalid JSON.') }
    await writeLine(output,legacyJsonDocument(parsed,context))
    return
  }
  if (outputFormat !== 'stream-json') throw Error('Unsupported structured output mode.')
  const state = {streamedText:'',tools:new Map(),sawResult:false}
  let buffer = ''
  for await (const chunk of readable) {
    buffer += chunk.toString('utf8')
    if (Buffer.byteLength(buffer,'utf8') > MAX_JSONL_LINE_BYTES) throw Error('Engine JSONL line exceeds safe limit.')
    let nl
    while ((nl=buffer.indexOf('\n'))>=0) {
      const line = buffer.slice(0,nl).trim()
      buffer = buffer.slice(nl+1)
      if (!line) continue
      let event
      try { event=JSON.parse(line) } catch { throw Error('Engine returned malformed JSONL.') }
      for (const item of legacyJsonlEvents(event,state,context)) await writeLine(output,item)
    }
  }
  if (buffer.trim()) throw Error('Engine returned incomplete JSONL.')
  if (!state.sawResult) throw Error('Engine JSONL stream has no final result.')
}

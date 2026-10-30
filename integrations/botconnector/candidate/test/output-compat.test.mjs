import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'
import { legacyJsonDocument, legacyJsonlEvents, legacyResult, writeLegacyStructuredOutput } from '../output-compat.mjs'

const context={providerId:'botconnector',model:'bc-poc-model'}
const upstreamResult={type:'result',subtype:'success',session_id:'dummy-session',duration_ms:15,result:'MOCK_OK',
  usage:{input_tokens:4,output_tokens:2},is_error:false}

test('native upstream JSON array maps to public BCCLI single-result object',()=>{
  const legacy=legacyJsonDocument([{type:'system'}, {type:'assistant',message:{content:[{type:'text',text:'MOCK_OK'}]}},upstreamResult],context)
  assert.deepEqual(legacy,{
    status:'ok',model:'bc-cloud/bc-poc-model',session_id:'dummy-session',usage:{input_tokens:4,output_tokens:2},
    duration_ms:15,result:'MOCK_OK',
  })
  assert.equal(legacyResult({...upstreamResult,is_error:true},context).status,'failed')
  assert.equal(legacyResult({...upstreamResult,subtype:'failure'},context).status,'failed')
  assert.throws(()=>legacyJsonDocument([],context),/result is missing/)
  assert.throws(()=>legacyJsonDocument({unexpected:'shape'},context),/Unexpected structured/)
})

test('upstream stream-json maps to legacy text_delta, tool_use, tool_result, message, result',()=>{
  const state={streamedText:'',tools:new Map(),sawResult:false}
  const records=[
    {type:'system',subtype:'init'},
    {type:'assistant',message:{content:[{type:'text',text:'MOCK_OK'}, {type:'tool_use',id:'call-1',name:'read_file',input:{file_path:'demo.txt'}}]}},
    {type:'user',message:{content:[{type:'tool_result',tool_use_id:'call-1',content:'file text',is_error:false}]}},
    upstreamResult,
  ]
  const events=records.flatMap(rec=>legacyJsonlEvents(rec,state,context))
  assert.deepEqual(events.map(x=>x.type),['text_delta','tool_use','tool_result','message','result'])
  assert.equal(events[0].delta,'MOCK_OK')
  assert.equal(events[1].tool,'read_file')
  assert.equal(events[2].tool,'read_file')
  assert.equal(events[3].text,'MOCK_OK')
  assert.equal(events[4].status,'ok')
  assert.equal(events[4].model,'bc-cloud/bc-poc-model')
  assert.equal(state.sawResult,true)
})

test('upstream partial text deltas are not duplicated by final assistant content',()=>{
  const state={streamedText:'',tools:new Map(),sawResult:false}
  const delta={type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'MOCK_'}}}
  const part=legacyJsonlEvents(delta,state,context)
  const rest=legacyJsonlEvents({type:'assistant',message:{content:[{type:'text',text:'MOCK_OK'}]}},state,context)
  assert.deepEqual([...part,...rest].map(x=>x.delta),['MOCK_','OK'])
})

test('stream formatter emits strict legacy JSONL and terminal result from mock engine events',async()=>{
  const input=[{type:'system',subtype:'init'},{type:'assistant',message:{content:[{type:'text',text:'MOCK_OK'}]}},upstreamResult]
  const readable=Readable.from(input.map(e=>Buffer.from(JSON.stringify(e)+'\n')))
  let output=''
  await writeLegacyStructuredOutput(readable,{
    outputFormat:'stream-json',...context,output:{write(x){output+=x;return true}},
  })
  const rows=output.trim().split('\n').map(x=>JSON.parse(x))
  assert.deepEqual(rows.map(x=>x.type),['text_delta','message','result'])
  assert.deepEqual(rows.at(-1),{
    type:'result',status:'ok',model:'bc-cloud/bc-poc-model',session_id:'dummy-session',
    usage:{input_tokens:4,output_tokens:2},duration_ms:15,
  })
})

test('JSON formatter emits only final object, never raw upstream array',async()=>{
  const native=[{type:'system',subtype:'init'},upstreamResult]
  const readable=Readable.from([Buffer.from(JSON.stringify(native))])
  let output=''
  await writeLegacyStructuredOutput(readable,{
    outputFormat:'json',...context,output:{write(x){output+=x;return true}},
  })
  assert.ok(output.endsWith('\n'))
  const parsed=JSON.parse(output)
  assert.equal(Array.isArray(parsed),false)
  assert.equal(parsed.result,'MOCK_OK')
  assert.equal(parsed.status,'ok')
})

test('invalid upstream JSON and incomplete JSONL fail closed without inventing result',async()=>{
  const out={write(){throw Error('Must not output malformed input')}}
  await assert.rejects(writeLegacyStructuredOutput(Readable.from([Buffer.from('not-json')]),{
    outputFormat:'json',...context,output:out,
  }),/invalid JSON/)
  await assert.rejects(writeLegacyStructuredOutput(Readable.from([Buffer.from('{"type":"assistant"}\n')]),{
    outputFormat:'stream-json',...context,output:{write(){return true}},
  }),/no final result/)
  await assert.rejects(writeLegacyStructuredOutput(Readable.from([Buffer.from('{"type":"assistant"')]),{
    outputFormat:'stream-json',...context,output:{write(){return true}},
  }),/incomplete JSONL/)
})

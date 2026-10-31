import assert from 'node:assert/strict'
import test from 'node:test'
import { BCCLI_COLORS, patchUiChunk } from '../branding.mjs'

test('core coding role is neutral without forcing product or vendor identity', () => {
  const original = 'You are Qwen Code, $'+'{role} developed by Alibaba Group, $'+'{focus}. Your primary goal is to help users safely and efficiently, adhering strictly to the following instructions and utilizing your available tools.'
  const branded = patchUiChunk('chunks/chunk-OV3EBH6J.js', original)
  assert.ok(branded.includes('You are an AI coding assistant, $'+'{role}, $'+'{focus}.'))
  assert.ok(!branded.includes('You are BCCLI'))
  assert.ok(!branded.includes('BICO Inovasi Digital'))
  assert.ok(!branded.includes('developed by Alibaba Group'))
  assert.match(branded, /primary goal is to help users safely and efficiently/)
})

test('brand logo palette uses teal, green and amber without Qwen gradient', () => {
  assert.deepEqual(BCCLI_COLORS, ['#00AFA0', '#22C55E', '#EAB308'])
  const old = 'GradientColors:["#4796E4","#847ACE","#C3677F"]'
  const original = [
    'var lightTheme={AccentBlue:"#3B82F6",AccentPurple:"#8B5CF6",'+old+'};',
    'var darkTheme={AccentBlue:"#89B4FA",AccentPurple:"#CBA6F7",'+old+'};',
  ].join('\n')
  const branded = patchUiChunk('chunks/chunk-W3YCOEIP.js', original)
  assert.equal(branded.split('GradientColors:["#00AFA0","#22C55E","#EAB308"]').length-1,2)
  assert.ok(!branded.includes('#C3677F'))
  assert.ok(!branded.includes('#8B5CF6'))
  assert.ok(!branded.includes('#CBA6F7'))
  const session = String.fromCharCode(36) + '{sessionId}'
  const statsSession = String.fromCharCode(36) + '{stats.sessionId}'
  const openTui = 'custom.title??">_ Qwen Code";var DEFAULT_GRADIENT=["#4796E4","#847ACE","#C3677F"];addField("Qwen Code",cliVersion' + ' To continue this session, run qwen --resume ' + statsSession + ' qwen --resume ' + session + ' useMouse:settings.merged.ui?.mouseTracking!==false mouseTracking:settings.merged.ui?.mouseTracking!==false'
  const changed = patchUiChunk('chunks/start-opentui-ui-Q34XCEMN.js', openTui)
  assert.match(changed, /var DEFAULT_GRADIENT=\["#00AFA0","#22C55E","#EAB308"\]/)
  assert.ok(changed.includes('addField("BCCLI engine",cliVersion'))
  assert.match(changed, /BCCLI_ENABLE_APP_MOUSE/)
})

test('BotConnector provider and release commands cannot open upstream menus', () => {
  const old = 'https://github.com/QwenLM/qwen-code/issues/new?template=bug_report.yml&title={title}&info={info}'
  const intro = 'You are Qwen Code, an interactive CLI agent.'
  const stub = [
    'var authCommand={name:"auth",action:__name(()=>({type:"dialog",dialog:"auth"}),"action")};',
    'var modelCommand={name:"model",action:__name(()=>({type:"dialog",dialog:"model"}),"action")};',
    'var updateCommand={name:"update",description:"Check for Qwen Code updates",action:__name(()=>({type:"message"}),"action")};',
    'var settingsCommand={name:"settings",action:__name(()=>({type:"dialog",dialog:"settings"}),"action")};',
    'var aboutCommand={name:"status",action:__name(()=>({type:"message",content:"Qwen Code v"}),"action"),subCommands:[{name:"paths"}]};init_esbuild_shims();',
    'var docsCommand={name:"docs",action:__name(()=>({type:"message",content:"https://qwenlm.github.io/qwen-code-docs/en"}),"action")};',
    'var helpCommand={name:"help",get description(){return t("for help on Qwen Code")},action:__name(()=>({type:"dialog",dialog:"help"}),"action")};',
  ]
  const status = String.fromCharCode(96) + 'Qwen Code v' + String.fromCharCode(36) + '{systemInfo.cliVersion}' + String.fromCharCode(96)
  const branded = patchUiChunk('chunks/chunk-7L4WTOM2.js', [old,intro,...stub,status].join('\\n'))
  assert.ok(branded.includes('github.com/farijarifriyanto-debug/bccli/issues/new'))
  assert.ok(branded.includes('You are an AI coding assistant operating in a terminal.'))
  assert.ok(branded.includes('name:"provider",altNames:["auth","connect","login"]'))
  assert.ok(branded.includes('bccli-provider-switch'), 'provider switch remains within this chat')
  assert.ok(!branded.includes('process.exit(51)'))
  // /model stays upstream-owned so the interactive picker, --global/--project
  // flags and one-off prompts keep working; BCCLI only supplies the catalog.
  assert.ok(branded.includes('var modelCommand='), 'upstream model command must remain present')
  assert.ok(branded.includes('dialog:"model"'), 'the upstream model picker must stay reachable')
  assert.ok(!branded.includes('Choose an AI model from the active provider'), 'BCCLI text picker must be removed')
  assert.ok(!branded.includes('config.setModel(item.id'), 'BCCLI text picker must be removed')
  assert.ok(branded.includes('BCCLI release information'))
  assert.ok(branded.includes('BCCLI | BotConnector Settings'))
  assert.ok(branded.includes('Show BCCLI and BotConnector session diagnostics'))
  assert.ok(branded.includes('BCCLI documentation and releases'))
  assert.ok(branded.includes('BCCLI help and keyboard shortcuts'))
  assert.ok(branded.includes('var helpCommand='), 'unrelated Help registration must remain present')
  assert.ok(branded.includes('var settingsCommand='), 'Settings registration must remain present')
  assert.ok(branded.includes('var docsCommand='), 'Docs registration must remain present')
  assert.ok(branded.includes('dialog:"auth"'), 'the BCCLI arrow-key provider dialog must be accessible')
  assert.ok(!branded.includes('Check for Qwen Code updates'))
  assert.ok(!branded.includes('You are BCCLI'))
})

test('unsupported upstream syntax fails closed instead of reverting branding', () => {
  for (const chunk of ['chunks/chunk-OV3EBH6J.js','chunks/chunk-W3YCOEIP.js','chunks/chunk-7L4WTOM2.js']) {
    assert.throws(() => patchUiChunk(chunk, 'upstream changed'), /unsupported/)
  }
})

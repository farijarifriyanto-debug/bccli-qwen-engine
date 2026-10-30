// BCCLI local file patch tool, loaded only from integrity-pinned branding overlay.
// All operations require approval; no shell or external network access.
import { basename } from 'node:path'
import { BaseDeclarativeTool, BaseToolInvocation } from './chunk-O5EKX7LG.js'
import { checkPriorRead, createPatchSmart } from './chunk-ERV2ECV3.js'
import { commitAtomicPatch, planAtomicPatch } from './bccli-atomic-patch.mjs'

const SCHEMA = {
  type: 'object',
  properties: {
    file_path: {type:'string', description:'Absolute path to an EXISTING project file. Never use for secrets, .git or outside project.'},
    replacements: {type:'array', description:'Up to 32 exact unique edits applied to one file as a single atomic replacement. Each old_text must occur exactly once.', minItems:1, maxItems:32,
      items:{type:'object',properties:{old_text:{type:'string'},new_text:{type:'string'}},required:['old_text','new_text']}},
    expected_sha256: {type:'string', description:'Optional SHA256 of file before modification, to detect conflicts; recommended if known.'},
  },
  required:['file_path','replacements'],
}
const errorResponse = error => {
  const code = typeof error?.code === 'string' ? error.code : 'patch_failed'
  const message = String(error?.message || error)
  return {llmContent: JSON.stringify({ok:false,code,message}), returnDisplay:'Patch rejected: '+message,error:{type:code,message}}
}

class ApplyPatchInvocation extends BaseToolInvocation {
  constructor(config,params) { super(params);this.config=config;this.prepared=undefined }
  toolLocations() { return [{path:this.params.file_path}] }
  getDescription() { return 'Apply exact patch to ' + this.params.file_path }
  async getDefaultPermission() { return 'ask' }
  // Honor an explicit user-selected auto-edit permission; default mode still asks.
  canAutoApproveOnAllow() { return true }
  makePlan() {
    return planAtomicPatch({
      root:this.config.getProjectRoot(),
      file_path:this.params.file_path,
      replacements:this.params.replacements,
      expected_sha256:this.params.expected_sha256,
    })
  }
  async getConfirmationDetails() {
    if (!this.config.getFileReadCacheDisabled()) {
      const prior=await checkPriorRead(this.config.getFileReadCache(),this.params.file_path,'patching')
      if (!prior.ok) throw Object.assign(new Error(prior.rawMessage),{code:prior.type})
    }
    this.prepared=this.makePlan()
    const p=this.prepared
    return {type:'edit',title:'Confirm BCCLI apply_patch: '+basename(p.target),fileName:basename(p.target),
      filePath:p.target,originalContent:p.before,newContent:p.after,
      fileDiff:createPatchSmart(basename(p.target),p.before,p.after,'Current','Proposed'),
      onConfirm:async()=>{}}
  }
  async execute(abortSignal) {
    try {
      if (!this.config.getFileReadCacheDisabled()) {
        const prior=await checkPriorRead(this.config.getFileReadCache(),this.params.file_path,'patching')
        if (!prior.ok) throw Object.assign(new Error(prior.rawMessage),{code:prior.type})
      }
      const p=this.prepared || this.makePlan()
      const result=commitAtomicPatch(p,{signal:abortSignal})
      return {llmContent:JSON.stringify({ok:true,...result}),returnDisplay:'Applied patch to '+p.target}
    } catch(error) {return errorResponse(error)}
  }
}

export class ApplyPatchTool extends BaseDeclarativeTool {
  constructor(config) {
    super('apply_patch','Apply Patch',
      'Atomically patch one existing workspace file using exact unique old_text/new_text hunks; ask the user before changing it. Never modifies files outside the current project or its .git folder. Use read_file first to inspect contents. This is a direct coding tool, not a shell command.',
      'edit',SCHEMA)
    this.config=config
  }
  createInvocation(params) { return new ApplyPatchInvocation(this.config,params) }
}

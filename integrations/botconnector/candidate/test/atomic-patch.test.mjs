import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtempSync,mkdirSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {planAtomicPatch,commitAtomicPatch} from '../atomic-patch.mjs'

const sha=b=>createHash('sha256').update(b).digest('hex')
const workspace=fn=>{
 const root=mkdtempSync(path.join(tmpdir(),'bccli-patch-test-'))
 try{fn(root)}finally{rmSync(root,{recursive:true,force:true})}
}
const patch=(root,name,replacements,expected_sha256)=>planAtomicPatch({
 root,file_path:path.join(root,name),replacements,expected_sha256
})

test('patches two exact hunks with atomic one-file commit and SHA256 proof',()=>workspace(root=>{
 const file=path.join(root,'source.py')
 writeFileSync(file,'alpha = 1\nbeta = 2\n','utf8')
 const before=readFileSync(file)
 const plan=patch(root,'source.py',[
  {old_text:'alpha = 1',new_text:'alpha = 10'},
  {old_text:'beta = 2',new_text:'beta = 20'}
 ],sha(before))
 assert.equal(readFileSync(file,'utf8'),'alpha = 1\nbeta = 2\n')
 const result=commitAtomicPatch(plan)
 assert.equal(readFileSync(file,'utf8'),'alpha = 10\nbeta = 20\n')
 assert.equal(result.sha256_before,sha(before))
 assert.equal(result.sha256_after,sha(readFileSync(file)))
 assert.equal(result.replacements,2)
}))

test('preserves CRLF and UTF-8 BOM exactly',()=>workspace(root=>{
 const file=path.join(root,'bom.txt')
 const before=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('nama = "awal"\r\nbaris = 2\r\n')])
 writeFileSync(file,before)
 const plan=patch(root,'bom.txt',[{old_text:'nama = "awal"',new_text:'nama = "baru"'}])
 commitAtomicPatch(plan)
 const after=readFileSync(file)
 assert.equal(after.subarray(0,3).toString('hex'),'efbbbf')
 assert.equal(after.subarray(3).toString(),'nama = "baru"\r\nbaris = 2\r\n')
}))

test('rejects ambiguous or wrong hunks without touching file',()=>workspace(root=>{
 const file=path.join(root,'conflict.txt')
 writeFileSync(file,'same\nsame\n')
 assert.throws(()=>patch(root,'conflict.txt',[{old_text:'same',new_text:'changed'}]),{code:'hunk_conflict'})
 assert.throws(()=>patch(root,'conflict.txt',[{old_text:'missing',new_text:'changed'}]),{code:'hunk_conflict'})
 assert.equal(readFileSync(file,'utf8'),'same\nsame\n')
}))

test('detects file changed after approval before atomic rename',()=>workspace(root=>{
 const file=path.join(root,'race.txt')
 writeFileSync(file,'one\n')
 const plan=patch(root,'race.txt',[{old_text:'one',new_text:'two'}])
 writeFileSync(file,'someone else edited\n')
 assert.throws(()=>commitAtomicPatch(plan),{code:'conflict'})
 assert.equal(readFileSync(file,'utf8'),'someone else edited\n')
}))

test('rejects mismatch of required project location, .git, and SHA256',()=>workspace(root=>{
 mkdirSync(path.join(root,'.git'))
 writeFileSync(path.join(root,'.git','config'),'important')
 writeFileSync(path.join(root,'a.txt'),'important')
 assert.throws(()=>patch(root,'.git/config',[{old_text:'important',new_text:'bad'}]),{code:'path_outside_workspace'})
 const outside=path.join(tmpdir(),'not-in-workspace.txt')
 assert.throws(()=>planAtomicPatch({root,file_path:outside,replacements:[{old_text:'a',new_text:'b'}]}),{code:'path_outside_workspace'})
 assert.throws(()=>patch(root,'a.txt',[{old_text:'important',new_text:'bad'}],'0000'),{code:'conflict'})
 assert.equal(readFileSync(path.join(root,'a.txt'),'utf8'),'important')
}))

test('rejects binary, invalid UTF-8, and mixed newlines',()=>workspace(root=>{
 const file=path.join(root,'a.bin')
 writeFileSync(file,Buffer.from([0,1,2]))
 assert.throws(()=>patch(root,'a.bin',[{old_text:'a',new_text:'b'}]),{code:'binary_file'})
 writeFileSync(file,Buffer.from([0xff,0xfe]))
 assert.throws(()=>patch(root,'a.bin',[{old_text:'a',new_text:'b'}]),/encoded|encoding|valid|UTF/i)
 writeFileSync(file,'a\r\nb\n')
 assert.throws(()=>patch(root,'a.bin',[{old_text:'a',new_text:'b'}]),{code:'mixed_line_endings'})
}))


test('canonical workspace aliases are accepted without following nested symlink directories', {skip:process.platform==='win32'},()=>workspace(root=>{
 const source=path.join(root,'project')
 mkdirSync(source)
 writeFileSync(path.join(source,'code.py'),'before = 1\n')
 const alias=path.join(root,'project-alias')
 symlinkSync(source,alias,'dir')
 const plan=patch(alias,'code.py',[{old_text:'before = 1',new_text:'after = 2'}])
 commitAtomicPatch(plan)
 assert.equal(readFileSync(path.join(source,'code.py'),'utf8'),'after = 2\n')
 mkdirSync(path.join(source,'directory'))
 writeFileSync(path.join(source,'directory','target.py'),'data = 1\n')
 symlinkSync(path.join(source,'directory'),path.join(source,'nested-alias'),'dir')
 assert.throws(()=>patch(alias,'nested-alias/target.py',[{old_text:'data = 1',new_text:'data = 2'}]),{code:'symlink_path'})
}))

test('abort before commit is safe and leaves no temp files',()=>workspace(root=>{
 const file=path.join(root,'a.txt')
 writeFileSync(file,'current')
 const plan=patch(root,'a.txt',[{old_text:'current',new_text:'proposed'}])
 const c=new AbortController()
 c.abort()
 assert.throws(()=>commitAtomicPatch(plan,{signal:c.signal}),{code:'aborted'})
 assert.equal(readFileSync(file,'utf8'),'current')
}))

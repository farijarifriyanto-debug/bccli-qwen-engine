// Secure key management for Windows console sessions. No secret goes through
// chat messages, tool calls, CLI arguments, environment variables or the
// coding engine. Only the parent proxy receives the dialog result via stdout.
import { spawn } from 'node:child_process'

const KEY_DIALOG = String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$form=New-Object System.Windows.Forms.Form
$form.Text='BCCLI - API key'
$form.Size=New-Object System.Drawing.Size(540,195)
$form.StartPosition='CenterScreen'
$form.TopMost=$true
$form.MaximizeBox=$false
$form.MinimizeBox=$false
$form.FormBorderStyle='FixedDialog'
$label=New-Object System.Windows.Forms.Label
$label.Text='Paste the API key for '+$env:BCCLI_DIALOG_PROVIDER+' (hidden, local only):'
$label.Location=New-Object System.Drawing.Point(16,18)
$label.Size=New-Object System.Drawing.Size(490,24)
$form.Controls.Add($label)
$entry=New-Object System.Windows.Forms.TextBox
$entry.UseSystemPasswordChar=$true
$entry.MaxLength=8192
$entry.Location=New-Object System.Drawing.Point(16,48)
$entry.Size=New-Object System.Drawing.Size(490,24)
$form.Controls.Add($entry)
$notice=New-Object System.Windows.Forms.Label
$notice.Text='Stored with Windows DPAPI. Never send keys in AI chat.'
$notice.Location=New-Object System.Drawing.Point(16,82)
$notice.Size=New-Object System.Drawing.Size(490,20)
$form.Controls.Add($notice)
$ok=New-Object System.Windows.Forms.Button
$ok.Text='Save key'
$ok.DialogResult=[System.Windows.Forms.DialogResult]::OK
$ok.Location=New-Object System.Drawing.Point(335,111)
$form.Controls.Add($ok)
$cancel=New-Object System.Windows.Forms.Button
$cancel.Text='Cancel'
$cancel.DialogResult=[System.Windows.Forms.DialogResult]::Cancel
$cancel.Location=New-Object System.Drawing.Point(429,111)
$form.Controls.Add($cancel)
$form.AcceptButton=$ok
$form.CancelButton=$cancel
$form.Add_Shown({[void]$entry.Focus()})
try {
  $result=$form.ShowDialog()
  if($result -eq [System.Windows.Forms.DialogResult]::OK -and $entry.Text.Trim()) {
    [Console]::Out.Write($entry.Text)
    exit 0
  }
  exit 2
} finally {$entry.Clear();$form.Dispose()}
`
const REMOVE_DIALOG = String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
$result=[System.Windows.Forms.MessageBox]::Show(
'Remove the saved Windows DPAPI key for '+$env:BCCLI_DIALOG_PROVIDER+'? This cannot revoke a key at the provider and does not remove keys set in environment variables.',
'BCCLI - Confirm API key removal',
[System.Windows.Forms.MessageBoxButtons]::YesNo,
[System.Windows.Forms.MessageBoxIcon]::Warning,
[System.Windows.Forms.MessageBoxDefaultButton]::Button2)
if($result -eq [System.Windows.Forms.DialogResult]::Yes){exit 0}else{exit 2}
`

function runDialog(script, id, { platform = process.platform, spawnImpl = spawn } = {}) {
  if (platform !== 'win32') throw Error('Secure in-session API key dialogs currently require Windows. On Linux/macOS, set the provider API key environment variable.')
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(id)) throw Error('Unknown provider')
  return new Promise((resolve, reject) => {
    const child = spawnImpl('powershell.exe', ['-NoProfile','-NonInteractive','-STA','-Command',script], {
      stdio: ['ignore','pipe','ignore'], windowsHide: false, shell: false,
      env: { ...process.env, PSModulePath: process.env.PSModulePath, BCCLI_DIALOG_PROVIDER: id },
    })
    let text = ''
    let failed = false
    const timer = setTimeout(() => { failed = true; child.kill() }, 180000)
    child.stdout.on('data', chunk => {
      if (text.length + chunk.length > 8192) { failed = true; child.kill(); return }
      text += chunk.toString('utf8')
    })
    child.once('error', () => { failed = true })
    child.once('close', code => {
      clearTimeout(timer)
      if (failed) reject(Error('Secure Windows dialog unavailable or timed out. No credentials were changed.'))
      else if (code === 2) resolve(null)
      else if (code !== 0) reject(Error('Secure Windows dialog failed. No credentials were changed.'))
      else resolve(text)
    })
  })
}
export async function promptProviderKey(id, options) {
  const value = await runDialog(KEY_DIALOG, id, options)
  if (value == null) return null
  if (!value.trim() || value.length > 8192 || /[\r\n]/.test(value)) throw Error('Invalid key. Nothing was saved.')
  return value.trim()
}
export async function confirmRemoveProviderKey(id, options) {
  const value = await runDialog(REMOVE_DIALOG, id, options)
  return value !== null
}

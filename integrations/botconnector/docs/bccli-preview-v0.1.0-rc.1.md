# BCCLI Preview 0.1.0-rc.1 — isolated Windows canary

**Release channel: preview/experimental, NOT stable/public BCCLI.** This package is
`@botconnector/bccli-preview@0.1.0-rc.1`, with executable `bccli-preview`.
It is intentionally `private:true` to block a misleading npm registry publish;
the signed-by-GitHub account prerelease artifact is a standard installable npm
tarball. The existing `@botconnector/bccli@0.4.17` and `bccli` executable
are completely separate and must not be removed or overwritten.

## Tested on owner's Windows machine, 2026-10-30

- CI source before this release: 52/52 candidate unit/security and 4/4
  upstream-backed Windows Node 22/24 integration tests PASS.
- Rebranded preview local Windows: `npm ci --ignore-scripts`,
  `npm run build`, `npm test` (**52/52 PASS**).
- Real Qwen Code 0.26.3 integration on **Node 22.23.4** (isolated runtime):
  **4/4 PASS**, including read-only tool calling, approval-denied edits,
  project session resume and branding.
- Tarball `botconnector-bccli-preview-0.1.0-rc.1.tgz` installed with npm
  into the user's local-appdata preview prefix, not global npm.
- `bccli-preview --version`: `0.1.0-rc.1` PASS.
- `bccli-preview auth status`: offline/secret-free PASS.
- Authenticated read-only `bccli-preview models`: **87 model IDs** returned.
- The public `bccli --version` remains **0.4.17**.
- **No paid live coding generation**, no npm registry publication, no
  production service updates, no old session migration.

## Installing from GitHub prerelease (Windows PowerShell)

Use **Node.js 22.23.4**, or **Node.js 24.22.1 or newer** for this engine on
Windows. A reproducible Node22-local launch is preferred (Node 24.18.0
has a known upstream tool-loop shutdown crash). No additional GUI/EXE
installer is required; Node itself is a prerequisite.

```powershell
$prefix = Join-Path $env:LOCALAPPDATA 'BotConnector\BCCLI-Preview'
$release = 'https://github.com/farijarifriyanto-debug/bccli-qwen-engine/releases/download/bccli-preview-v0.1.0-rc.1/botconnector-bccli-preview-0.1.0-rc.1.tgz'
npm install --prefix $prefix --no-save --ignore-scripts $release
# With a compatible Node.js on PATH:
node (Join-Path $prefix 'node_modules\@botconnector\bccli-preview\cli.mjs') --help
node (Join-Path $prefix 'node_modules\@botconnector\bccli-preview\cli.mjs') auth status
```

This candidate authenticates through the existing public BCCLI `bc-cloud`
key, or `BOTCONNECTOR_API_KEY`. It **does not** create or alter credentials,
and it cannot automatically import `~/.bccli` sessions. It keeps session data
under `~/.bccli-preview` and may store user prompts/tool outputs there.

Owner's local Windows installation also has a **dedicated portable Node
22.23.4** and the `bccli-preview.cmd` shim in
`%LOCALAPPDATA%\BotConnector\BCCLI-Preview`. That launcher path was added
to the owner's *user* PATH for future terminal sessions. Existing `bccli`
is not shadowed.

## Rollback

Stop any preview sessions, then remove only this separate installation:

```powershell
$prefix = Join-Path $env:LOCALAPPDATA 'BotConnector\BCCLI-Preview'
npm uninstall --prefix $prefix @botconnector/bccli-preview
# If wanted, remove the preview directory and its user-PATH entry.
# Do not delete ~/.bccli or uninstall @botconnector/bccli.
```

Removing preview session files under `~/.bccli-preview` is a separate
explicit privacy choice; never delete the owner's old BCCLI history.

## Known limitations / release HOLD

This prerelease is **not** a drop-in replacement for public BCCLI. The
existing public `bccli` supports provider management, login/logout,
`-r` session selection, programmatic JSON/stream-JSON output, SDK exports,
worktrees, plugins, ACP, and various integrations absent or not verified
in the candidate. `-p` is text-only; `-c` resumes only candidate sessions
for the active project. `auth status` proves presence, not key validity.
The upstream runtime's session privacy/retention policies and commercial
billing acceptance are not complete. No automated migration is allowed.

**Do not retag this preview as stable or npm publish to `@botconnector/bccli`
until those blockers have been independently accepted.** The upstream
Qwen Code 0.26.3 implementation retains its legally required Apache-2.0
and third-party notices in the tarball.

# BCCLI 0.5.0-rc.3 — public preview (not stable)

**Identity fix in RC.3:** removes an additional pinned Qwen Code identity clause in the bundled server agent instructions. The runtime prompt distinguishes **BCCLI as client app**, **Qwen Code as underlying software engine**, and the **current AI model** from request metadata; no AI model/provider identity or developer is hard-coded. Prior session transcripts or user-provided instructions can still affect generated prose, so use a new chat to validate.

This is a **prerelease download**, not the npm registry `latest` release. Existing `@botconnector/bccli@0.4.17` stays unchanged. The new BCCLI is a white-label wrapper over unmodified Qwen Code 0.26.3 (Apache-2.0), with BotConnector/provider menus, BCCLI-colored terminal and the native Qwen `-r` resume picker. Full original Qwen Code functionality is not yet surfaced by the BCCLI launcher.

## Install without replacing existing global BCCLI

Download `botconnector-bccli-0.5.0-rc.3.tgz` and `SHA256SUMS.txt` from this release, verify SHA-256 and install into a separate directory.

**Windows PowerShell (choose your actual local download path):**
```powershell
$dir = Join-Path $env:USERPROFILE 'bccli-rc2-test'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Set-Location $dir
npm install --ignore-scripts --no-audit --no-fund C:\path\to\botconnector-bccli-0.5.0-rc.3.tgz
.\node_modules\.bin\bccli.cmd --version
.\node_modules\.bin\bccli.cmd --help
```

**Linux/macOS (choose your actual local download path):**
```sh
mkdir -p "$HOME/bccli-rc2-test"
cd "$HOME/bccli-rc2-test"
npm install --ignore-scripts --no-audit --no-fund /path/to/botconnector-bccli-0.5.0-rc.3.tgz
./node_modules/.bin/bccli --version
./node_modules/.bin/bccli --help
```

Node.js 22+ is required. Use an isolated installation to avoid overwriting the existing global `bccli`. Never paste your API key into issue reports or terminal logs.

## Verified and limitations

- Offline-built npm tarball, signed by SHA-256 checksum; clean install and offline CLI smoke tested in CI on Windows/Linux Node 22/24.
- Branding, in-terminal provider/model menu, key-isolating localhost proxy and native `-r [UUID]` argument forwarding have automated checks.
- **Not verified / not yet exposed:** complete compatibility with old BCCLI SDK imports; original Qwen native `mcp`, `extensions`, ACP and several advanced commands; live authenticated end-to-end session resume and interactive terminal workflows across all platforms. Full parity must be established before a stable version.
- User-installed configuration/credentials remain in separate `~/.bccli-preview` storage; BotConnector credential management may still require `bccli-legacy login bc-cloud` or `BOTCONNECTOR_API_KEY`. Other providers require their own API keys.
- Linux/macOS provider key persistence currently requires environment variables; Windows supports protected DPAPI storage.
- The default `--bare` mode intentionally blocks implicit project auto-discovery for safety. MCP config is only permitted from the explicit trusted owner directory.

Apache-2.0 engine license and third-party notices are included in the npm archive.

**No npm registry publication is part of this GitHub prerelease.** `@botconnector/bccli@latest` stays on 0.4.17.

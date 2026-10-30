# BCCLI 0.5.2-rc.1 — restore the new terminal UI, without the audio-capture install hook

**Preview / canary only.** Does not change `@botconnector/bccli@latest` (0.5.1) or the user's global CLI.

This addresses the regression where 0.5.1 reverted the default interactive terminal to the older BCCLI Ink layout. The candidate restores the 0.5.0 new terminal UI, startup provider/model picker, branded banner, interactive /model and /provider commands, and coding-agent tool workflows.

## How the package works

The original unmodified `@qwen-code/qwen-code@0.26.3` upstream engine npm tarball is checked against the published SHA-512 integrity and vendored as `engine/` within the BCCLI package. Its Apache-2.0 license, source credits and original package metadata remain intact. The BCCLI UI overlay retains strict, pinned source-file hashes.

**The published package has no `@qwen-code/*` npm dependencies.** npm will therefore not try to install the upstream optional `@qwen-code/audio-capture` package or execute its install hook. This is not a claim that BCCLI no longer contains upstream Qwen Code-derived code; the *underlying licensed engine* is still included. Audio-capture functionality dependent on the omitted optional module is not part of this preview.

The existing stable BCCLI 0.4.17 SDK and legacy commands remain inside the same installation, with no separate executable. Its original MIT license is included.

## Windows preview

Download `botconnector-bccli-0.5.2-rc.1.tgz` from the GitHub prerelease, then install in a separate directory to avoid changing the working global CLI:

```powershell
mkdir "$env:TEMP\bccli-newui-preview" -Force
npm install --prefix "$env:TEMP\bccli-newui-preview" "PATH-TO-TGZ" --no-audit --no-fund
& "$env:TEMP\bccli-newui-preview\node_modules\.bin\bccli.cmd" --version
& "$env:TEMP\bccli-newui-preview\node_modules\.bin\bccli.cmd" --choose
```

Users must use Node.js 22.23.4+ or Node 24.22.1+ on Windows to avoid the previously verified upstream runtime crash.

## Verified preview gates

- SHA-512 for upstream engine and BCCLI 0.4.17 SDK source.
- Windows local installation of preview tarball: CLI returns `0.5.2-rc.1`, dependency graph for `@qwen-code/*` empty, no `allow-scripts` audio warning.
- Real Windows ConPTY probe (not a screenshot mock): provider chooser, model chooser, large BCCLI banner, new chat input field and /model hint all rendered, with **no paid prompt**.
- Source integration tests and CI are required before advancing beyond preview.
- Next stable release requires explicit feature/behavior parity and test of a coding-agent tool approval path; never promote merely on branding alone.

## State and privacy

Existing BCCLI 0.5.1 files and the 0.5.0 preview's protected credentials are not automatically migrated or deleted. User API keys stay in the owner-managed credential store or per-user Windows DPAPI storage. The provider proxy supplies a separate short-lived local token to the bundled engine.

Changes are confined to the release builder, bundled engine path resolution, owner-writable branding cache and truthful product help. The upstream source archive is not altered.

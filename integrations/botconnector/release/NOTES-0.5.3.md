# BCCLI 0.5.3 — Windows startup and session diagnostics

Fixes after 0.5.2:
- Native npm launcher `bccli-bootstrap.cjs` starts before the coding agent. On affected Windows Node.js 24.18.0 / Node 24 earlier than 24.22.1, it selects an explicitly configured `BCCLI_NODE_EXECUTABLE` or an existing compatible owner-installed Node at `%LOCALAPPDATA%\\BotConnector\\BCCLI-Preview\\runtime\\node.exe`. It does not modify the system Node.js or PATH, and fails closed if no compatible runtime exists.
- New isolated provider session `QWEN_HOME` gets an empty `settings.json` only if absent. Existing settings, tokens and `~/.qwen` are never migrated or overwritten. Session settings reject symlink paths.
- Terminal banner now identifies the upstream version as `engine v0.26.3` rather than implying the product version is 0.26.3; `bccli --version` reports the BCCLI package version.
- SDK, original compiled coding engine, upstream license notices, model provider switching, web_fetch and optional web_search remain available.

Test and release gates:
- Windows Node 24.18.0 with owner-installed Node 22.23.4: clean tarball installation, genuine generated npm PowerShell and CMD shims, automatic safe Node selection, --version and help.
- Windows and Ubuntu tests for safe-runtime selection, fail-closed behavior, provider session settings creation and preservation, plus coding-agent integration tests.
- Windows / Ubuntu / macOS CI, Node 22/24, verified engine and stable SDK, and no separately installed Qwen dependency.
- New version `0.5.3` is distinct from immutable `0.5.2`. Publish via preconfigured GitHub OIDC trusted publisher on farijarifriyanto-debug/bccli. Retain runtime source repo, commit and original SHA256 in npm provenance metadata. Do not claim npm published until public registry latest and installed tarball pass.

# BCCLI 0.5.2 — Full coding agent

## Main release
- Full Qwen Code 0.26.3 coding-agent runtime without the restrictive default `--bare` flag.
- Native tools, deferred tool discovery, filesystem read/write, atomic `apply_patch`, MCP integrations, and session resume with upstream trust/approval gates. No automatic YOLO approvals.
- Provider switching with a model picker. A short-lived localhost session proxy keeps real provider API keys out of the coding engine and MCP subprocesses. The BCCLI transport pins the proxy endpoint even if project/user `modelProviders` attempt to redirect traffic.
- `web_fetch` is enabled via upstream tool discovery. A model-independent `web_search` tool is available when the BCCLI parent process has `BRAVE_SEARCH_API_KEY`; its Brave Search API credential stays in the parent and never reaches the coding engine. Search requests use a fixed HTTPS backend, return cited URLs, and are capped at 20 per agent session.
- If Brave is not configured, the original Qwen DashScope-compatible search support may still be used where separately configured. No search results are fabricated.
- Legacy `runTask`/`streamTask` SDK, provider management, and MCP CLI commands remain packaged.

## Search configuration
Set `BRAVE_SEARCH_API_KEY` in the BCCLI parent process environment (not in chat prompts or project files). Do not share the key. The token must be valid for Brave Web Search and has provider-specific quota/billing. BCCLI does not sign up for or fund a Brave subscription.
For users with no Brave Search API key, `web_search` is unavailable unless a separately supported upstream DashScope-compatible backend is configured; `web_fetch` continues to be supported.

## Verification and limitations
- Unit/security/regression tests plus live coding-agent smoke against Ollama Cloud `gpt-oss:20b` with real read_file invocation (three model requests, HTTP 200, correct final proof token). This does not imply every model/provider accepts all coding tools.
- `web_fetch` and model-independent `web_search` performed real tool execution against HTTP/search-result fixtures and simulated model transport on Windows and Ubuntu WSL. A live Brave API request is not claimed without an owner-configured key.
- Confirm installer/build integrity, full GitHub CI matrix (Windows/Ubuntu/macOS Node 22/24), the clean installed-tarball smoke, and release SHA256 before distribution.
- The self-contained package retains original Apache-2.0 notices and integrity-pinned Qwen engine source without a separate `@qwen-code` npm dependency or optional audio-capture installation.

## Release routes
- GitHub release tag: `bccli-v0.5.2`; attach `botconnector-bccli-0.5.2.tgz` and `SHA256SUMS.txt` from the verified build.
- npm `@botconnector/bccli@0.5.2` with dist-tag `latest` only after a verified, authorized npm login or trusted-publishing configuration. A GitHub release does not imply the npm registry was updated.
- Existing npm versions and previously distributed releases remain unchanged; rollback is by installing the previous known-good package.

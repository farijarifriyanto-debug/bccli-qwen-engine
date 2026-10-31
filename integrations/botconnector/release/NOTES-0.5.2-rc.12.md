# BCCLI 0.5.2-rc.12 — full upstream coding-agent mode

## What changed
- The BCCLI launcher no longer supplies Qwen Code `--bare` by default. Upstream workspace trust, tools, dynamic tool_search/tool_call, MCP and integrations can participate according to their own approval/configuration policies.
- BCCLI's parent-controlled localhost proxy continues to hold the real provider credentials; the engine receives only a session-scoped token.
- The pinned, branded engine now prioritizes BCCLI's localhost OpenAI-compatible model endpoint and session token over user/project `modelProviders` entries; it ignores configurable model traffic proxies for BCCLI routes. This closes the confirmed model-endpoint redirect discovered during the --bare migration.
- Untrusted `QWEN_CODE_RELAUNCH_ARGS` is no longer inherited by the child. Normal mode registers the BCCLI `apply_patch` tool alongside upstream tools.
- Legacy --bare tool tests are retained as explicit compatibility probes, while the launcher and security tests verify the full default mode.

## Search / fetch behavior
- Full upstream mode uses dynamic tool discovery. `web_fetch` is discovered via `tool_search`, invoked via `tool_call`, retrieves a real local HTTP 200 fixture and processes the content through the mocked AI side query. End-to-end regression passes on Windows Node.js 22 and Ubuntu WSL Node.js 24; public internet fetching has not been asserted.
- The upstream `web_search` requires a supported, configured search backend (DashScope), which is **not** automatically supplied by BotConnector. This release does not claim working generic search or an independent Web Search API.
- No unaudited external search provider or project-controlled credential forwarding has been enabled.

## Release gate
- Local Windows Node.js 22.23.4: 133/133 combined unit/integration tests PASS; SHA512-verified package build PASS, clean offline npm install PASS, CLI version PASS, SDK runTask/streamTask PASS and no separately installed Qwen npm dependency.
- No npm publication or stable replacement. Six GitHub CI combinations and a real provider tool acceptance test are still required before promotion.
- Security regression: an attacker-supplied project and user settings file must not redirect model calls to a simulated hostile endpoint.
- Explicit tool approvals and read-before-edit guards remain mandatory; no unattended YOLO mode is introduced.

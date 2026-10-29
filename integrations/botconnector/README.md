# BCCLI × Qwen Code — isolated compatibility proof (2026-10-29)

> **Status: POC only.** This fork has not replaced the published `@botconnector/bccli` package, and no production services were changed.

## Policy

- **Engine:** Qwen Code (Apache-2.0), track `QwenLM/qwen-code` as upstream. Preserve upstream copyright and license notices.
- **Distribution target:** npm executable `bccli`, **not** a Windows EXE installer. This is a target, not a released artifact.
- **Customization:** prefer an outside-the-engine launcher / provider configuration over patching Qwen Code's internal agent, permissions, TUI, or tool runner.
- **Auth, pricing, billing, quota, and routing:** BotConnector Gateway remains authoritative. No second wallet or billing service.
- **Backward compatibility:** retain the existing Ink-based BCCLI until the new engine, package, and migration all pass acceptance.
- **Secret handling:** never commit API keys; never persist token values to repo settings or debug logs. Use an explicit environment variable; prevent project-controlled provider configuration from redirecting credentials to another host.

## Current compatibility evidence

Laptop: Windows 11 + Node 24.18.0. Isolated `npm install --prefix %TEMP%\\bccli-qwen-poc-20261029 --no-save --ignore-scripts --no-audit --no-fund @qwen-code/qwen-code@0.26.3` succeeded.

Tests passed for `--version` (0.26.3), `--help`, and a one-shot completion routed to a **loopback-only mock** at `http://127.0.0.1:18876/v1` using:
- `QWEN_HOME` pointing at an isolated temporary config folder;
- `--bare --safe-mode --auth-type openai --model bc-poc-model --approval-mode plan`;
- fake `OPENAI_API_KEY=poc-only-key` and mock endpoint `OPENAI_BASE_URL`;
- chat-completions streaming, fake authorization header, and the response `POC_OK` with process exit 0.

This proves only **OpenAI-compatible request construction, authentication-header forwarding, streaming parsing and terminal execution**. It does **not** prove compatibility with the live BotConnector API, real model tool calling, settlement, or model availability.

Direct reuse of a private BCCLI credential for unattended verification was blocked by safety controls. Do not attempt to bypass that protection. An owner-initiated auth/test flow is still required.

## Minimal live gateway setup (owner-controlled)

Use Qwen Code's built-in `openai` provider, without modifying the engine:

```powershell
# Run in a separate terminal; avoid adding credentials to shell history.
# BOTCONNECTOR_API_KEY must already be provided securely in this process environment.
if (-not $env:BOTCONNECTOR_API_KEY) { throw 'Provide BOTCONNECTOR_API_KEY before running.' }
$env:OPENAI_API_KEY = $env:BOTCONNECTOR_API_KEY
$env:OPENAI_BASE_URL = 'https://api.botconnector.id/v1'

# Choose a real, eligible model ID from the authenticated Gateway /v1/models response.
if (-not $env:BOTCONNECTOR_MODEL_ID) { throw 'Provide an eligible BOTCONNECTOR_MODEL_ID.' }
$env:OPENAI_MODEL = $env:BOTCONNECTOR_MODEL_ID
qwen --auth-type openai --model $env:OPENAI_MODEL
```

For the final package, read the key only through an approved BotConnector authentication flow. Never pass secrets as command-line arguments. The configuration file should store only the endpoint, env-key reference, and chosen model ID. The models list should come from the authenticated Gateway, not hard-coded upstream identifiers.

For an isolated test, set `QWEN_HOME` to a dedicated test directory and use `--approval-mode plan`; do not use `--yolo`.

## Release blockers (must pass before npm cutover)

- [ ] Explicitly authorized authenticated Gateway model discovery, no static model IDs or silent fallback to a different provider.
- [ ] Real low-cost inference test: streaming + nonstreaming + chat + tool-calling + tool results, and transparent 401/403/429 behavior.
- [ ] Gateway ledger reconciliation for token/cache usage and PAYG/plan quotas; no client-side price authority.
- [ ] Check project `.qwen/settings.json` cannot repoint the trusted BotConnector credential to an untrusted endpoint; fail closed if needed.
- [ ] Windows Terminal interactive UX, tool approvals, diff, undo, subagent, MCP, cancellation and session resume.
- [ ] Windows x64, Linux x64, and requested architectures build/install via npm; no executable installer requirement.
- [ ] Compatibility/opt-in migration from existing `~/.bccli` settings and sessions with rollback.
- [ ] CI tests, license/notice retention, minimal patch diff and upstream-update procedure.

**No production publish/merge/deployment authorized by this POC.**

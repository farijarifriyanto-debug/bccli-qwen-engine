# BCCLI P0 Unified Candidate — 30 October 2026

Target: keep `bccli` as the **new** coding agent engine, without falling back to legacy as the runtime. This branch combines the three individually reviewed P0 patches on top of RC.3. It is not a new npm release.

## Integrated features

1. **Headless automation:** `bccli -p "prompt" --output-format text|json|stream-json` forwards the fixed upstream format flag. The BCCLI launcher suppresses headless banners and translates upstream JSON event arrays and stream-json events into BCCLI 0.4.17's single-result JSON object and legacy JSONL event shapes, preserving scripts. A bounded output parser rejects malformed data.
2. **Native session recovery:** `bccli -r` opens the upstream session picker after provider/model selection. `bccli -r UUID` selects an ID validated as a UUID within the provider's own native session directory. `-c` keeps prior semantics. Legacy 0.4.17 sessions remain untouched and are not auto-imported.
3. **ACP editor protocol:** `bccli acp --model MODEL [--provider ID]` opens upstream ACP over stdio with no banner, preserving protocol framing. Protocol mode does not accept prompts, `--yolo`, or arbitrary endpoint override.
4. **BotConnector Cloud API key in BCCLI:** First-run menu requests a hidden key when absent; `1!` explicitly replaces it. `bccli provider add botconnector` and `bccli auth status` support the new encrypted Windows DPAPI key. Older `~/.bccli/credentials` is read-only fallback, never written or deleted.

## Preserved safety invariants

- Parent launcher controls the true provider key. The child coding agent gets a short-lived loopback proxy token.
- HTTPS preset endpoints and redirect refusal remain locked; project configuration cannot redirect credentials.
- `--bare` and `--approval-mode default` remain mandatory. MCP is explicit owner config, no automatic project commands.
- Sessions live under `~/.bccli-preview` and isolated `sessions-PROVIDER` directories. No modifications to legacy session files.
- No production Gateway, billing, Studio, OlahDokumen, GPU, npm stable, or owner launcher modifications.

## Evidence / gates

- Prior independent candidate PRs: #2 (structured output), #3 (session picker/ACP), #4 (BotConnector direct keys).
- Owner Windows Node 22.23.4 isolated unified staging: **47/47 tests PASS** with the combined output adapter, credential protection, session picker, ACP and provider tests across core, credential, provider, startup-menu, ACP/resume and structured-output cases; five changed JS files syntax checked.
- Offline upstream ACP initialization using a dummy key and loopback endpoint returned `protocolVersion:1` with clean JSON-RPC stdout; no paid AI calls.
- Windows real DPAPI test for a fake BotConnector key passed; legacy credential content preserved in tests.
- Offline mock-server contract test confirms adapter JSON emits the exact legacy keys `status,model,session_id,usage,duration_ms,result` and stream-json emits `text_delta,message,result`, both with exit code 0 and no paid API calls. Tool-call event parity still requires a separate E2E scenario.
- Required before any merge/release: GitHub Windows Node 22/24 candidate CI, authenticated terminal session-picker and ACP editor E2E with bounded cost, full tool-event streaming parity, legacy session migration design, SDK/plugins/integration audit, Linux/macOS readiness.
- **Stable release: HOLD / NO-GO** until all critical parity and safety gates PASS.

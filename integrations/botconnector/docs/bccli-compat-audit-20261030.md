# BCCLI compatibility audit P0 — 30 October 2026

Baseline: public `@botconnector/bccli@0.4.17`; candidate `@botconnector/bccli-preview@0.1.0-rc.3`
on Windows. The published stable package and gateway are out of scope. Evidence:
live `bccli --help`, `bccli-legacy --help`, installed launcher `core.mjs`,
`cli.mjs`, `providers.mjs`, upstream engine `--help`, and the candidate's tests.

| Capability | Legacy 0.4.17 | Candidate RC.3 | Assessment / next action |
|---|---|---|---|
| Interactive terminal / coding tools | Yes | Upstream agent and smoke tests PASS | Keep new engine |
| Provider picker and model search | Yes | Local smoke PASS | Retain |
| BotConnector auth | Login supported | Reads existing login; updating requires legacy | Migrate safe owner-side login UX |
| External providers | Cloud, OpenRouter, OpenAI, Gemini, DeepSeek, Groq, Ollama Cloud, Ollama, LM Studio, custom | Cloud/OpenAI/OpenRouter/DeepSeek/Groq/xAI | Add missing providers with endpoint and secret safety gates |
| Encrypted external keys | Legacy config | Windows user DPAPI + ephemeral proxy | PASS on Windows; other OS needs secure implementation |
| In-session model change | Yes | Native /model override | Preserve |
| In-session provider change | Yes | /provider restarts engine | PASS with controlled exit; cross-provider session is new |
| Headless text `-p` | Yes | Yes | Alias retained |
| Headless JSON / JSONL | Yes | Rejected by RC.3 wrapper although upstream supports both | P0 patch on feature branch; local mock tests PASS, CI pending |
| Resume `-c` | Yes | Calls upstream --continue under provider-specific home | Need real migration / recovery tests |
| Session picker `-r` | Yes | Rejected although upstream supports --resume | P0 follow-up |
| Existing legacy sessions | Yes | Not imported (separate user home) | Migration must be opt-in, non-destructive |
| MCP configuration | Management and explicit project consent | Explicit owner JSON only | Preserve trust boundary, add safe management |
| ACP | Supported | Upstream --acp exists, blocked by wrapper | P0 follow-up; protect protocol stdout |
| SDK | Root package exports SDK | No SDK exports in private candidate | Contract migration required |
| Plugins / skills | Managed via CLI | Upstream extensions available; wrapper blocks plugins | Map safe feature parity, not blindly forward |
| Import/export | Both supported | Blocked | Session schema/ownership audit first |
| Serve / IDE integrations | Commands available | Upstream daemon exists, wrapper blocks legacy commands | Needs contract review |
| Completions / stats / update | Commands available | Blocked | P1 after automation/session parity |
| Windows stable install/rollback | Stable package installed | Local shims backed up; preview override | Keep stable npm unchanged |
| Linux / macOS | Supported by legacy | Candidate not release-tested; Windows DPAPI only | Release blocker |

## Verified live probes

- `bccli` = `0.1.0-rc.3`; `bccli-preview` = `0.1.0-rc.3`; `bccli-legacy` = `0.4.17`.
- `bccli acp`, `bccli plugins`, `bccli export`, `bccli -r`, and `bccli --output-format json` returned nonzero; no AI requests sent.
- `bccli provider list` succeeds and lists six presets without exposing keys.
- Installed upstream engine's `--help` advertises `--output-format json|stream-json`, `--resume`, `--acp`, `mcp`, `extensions`, and `sessions`.
- Staged headless JSON/stream-JSON patch passed 3/3 offline Node tests with a fake provider and proxy.
- GitHub CI for feature branch is **pending**, as is authenticated paid end-to-end JSON/JSONL validation.

## Release gates

Do not replace public npm or owner launcher yet. Preserve user credentials, prior sessions,
legacy shims, Windows DPAPI, HTTPS allowlists, localhost ephemeral proxy, `--bare`,
tool approvals, and explicit MCP trust. Never silently route a rejected BCCLI
subcommand as a billable model prompt. For real calls, set a strict cost ceiling.

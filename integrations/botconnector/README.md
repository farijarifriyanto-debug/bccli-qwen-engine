# BCCLI × Qwen Code — upstream-first candidate (2026-10-29)

> **DRAFT / NO-GO for production.** Candidate code lives entirely under `integrations/botconnector/candidate/`. No upstream Qwen Code engine, TUI, model, tool or permission implementation has been edited. Do not publish this package as `@botconnector/bccli` or replace an installed `bccli`.

## Rationale

Use maintained upstream [Qwen Code](https://github.com/QwenLM/qwen-code) (Apache-2.0) as a candidate engine, retaining its tools and terminal UX. The only BotConnector-specific code is an **external Node.js adapter** and a short-lived local Gateway proxy. Keep upstream copyright/license notices. The fork tracks Qwen Code; avoid rebuilding the agent engine.

The candidate npm manifest is **private** and pins `@qwen-code/qwen-code@0.26.3`. Its command is `bccli-qwen-candidate`, not `bccli`.

## Architecture and security boundary

1. The launcher reads `BOTCONNECTOR_API_KEY` only from the **current process environment** and fetches the authenticated, live model list from `https://api.botconnector.id/v1/models`. A chosen model must exist in the returned list. 401, network failure and an empty catalog **fail closed**; no fallback provider or fabricated model ID.
2. On `run` / `chat`, the launcher starts a **per-session ephemeral HTTP proxy bound exclusively to `127.0.0.1`**. The proxy retains the real API key and forwards only the allowlisted `/v1/models`, `/v1/chat/completions` and `/v1/responses` routes to the **fixed BotConnector HTTPS Gateway**. Cross-host redirects are rejected. Requests are bounded to 16 MiB in this POC.
3. Qwen Code receives only a random short-lived proxy token and loopback endpoint. `BOTCONNECTOR_API_KEY` is removed from the Qwen child environment. Its shell and MCP subprocesses may inherit **the local token**, not the original Gateway key. The proxy closes on Qwen exit.
4. Qwen always starts with `--bare` and `--approval-mode default`. The adapter rejects arbitrary Qwen CLI flag passthrough, `--yolo`, and custom provider URLs. This prevents a cloned repository's `.qwen/settings.json` from overriding the auth endpoint.
5. MCP is **off by default**. The user may opt in with `--mcp-config ABSOLUTE_PATH` only when the JSON file is a regular non-symlink file **directly inside `~/.bccli-qwen-candidate/`**, and contains only a non-empty `mcpServers` map. Project-local MCP files are not loaded. Starting an MCP server can execute programs immediately; approve only trusted server definitions.

**Residual risk:** A child MCP/shell process that obtains the ephemeral local token may still send requests to the local proxy **while the session is active**, incurring usage. The proxy protects the long-lived key from that process but is not an OS sandbox or a substitute for Gateway quotas, ledger accounting or enterprise isolation. Do not describe this candidate as fully secure or production-ready.

`--bare` intentionally disables Qwen's implicit project-context, hooks, skills, extension and MCP discovery. Explicit MCP registration passed the test, but skills, worktrees, context parity, session resume and real tool-call execution have **not** been fully validated.

## Windows developer setup (isolated)

Use Node.js 22+ and work **only** in the candidate folder, never install over the existing `bccli`.

```powershell
cd integrations/botconnector/candidate
npm install --ignore-scripts
npm test
npm run test:security
node cli.mjs --help
```

For a **real** owner-authorized Gateway test, first set `BOTCONNECTOR_API_KEY` securely in the terminal environment (never put the value in a Git repository, command-line argument, logs or chat), then:

```powershell
node cli.mjs models
# Replace the example below with an eligible model id returned by the live command:
node cli.mjs run --model YOUR_ELIGIBLE_MODEL_ID "Reply E2E_OK"
```

For optional MCP, first create a personally reviewed JSON config in `~/.bccli-qwen-candidate/` and pass its **absolute path** to `--mcp-config`. Nothing is loaded from the repository being edited. The MCP config must not contain the BotConnector API key.

Do **not** set `OPENAI_API_KEY=BOTCONNECTOR_API_KEY` and run Qwen Code directly with untrusted MCP servers; that can expose the long-lived credential to child processes.

## Verification evidence (29 October 2026)

- Windows 11 / Node.js v24.18.0: isolated npm install of upstream Qwen Code 0.26.3 PASS; CLI `--version` and `--help` PASS.
- Mock OpenAI-compatible streaming: PASS (`POC_OK`, exit 0), with fake credential.
- Adversarial project and Qwen-home settings: **zero** requests reached the attacker endpoint in `--bare` mode.
- Explicit MCP handshake and model tool registration: PASS. A separate end-to-end test proved its subprocess **did not inherit the real Gateway key** when using the ephemeral proxy.
- Candidate adapter test suite: **13/13 PASS** (including Qwen upstream-backed regressions and proxy tests).
- `npm pack --dry-run`: PASS (no release). Existing `bccli` installation (0.4.17) unchanged.
- No live BotConnector customer key used in the tests; no paid AI inference or production billing test performed.

## Release gate (still HOLD)

- [ ] Owner-authorized **live** Gateway model discovery, one low-cost request and complete 401/403/429 failure tests.
- [ ] Tool calling, model tool results, streaming, stop/cancellation and diff safety end-to-end.
- [ ] Verify actual Gateway usage/billing ledger and plan/PAYG quota accounting; keep Gateway authoritative.
- [ ] Skills, hooks, project instructions, worktrees, session resume and subagents feature parity **without removing `--bare` security**.
- [ ] Windows/Linux npm packaging and CI, upstream version sync and regression checks, license notices.
- [ ] Explicit opt-in migration/rollback from old `bccli`, then separate owner approval for npm cutover. No merge/publish/deploy now.

Keep this PR in draft until the above conditions are verified.

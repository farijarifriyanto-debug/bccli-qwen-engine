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

## 2026-10-29 live error diagnosis: Qwen Code get_goal schema

Owner live tests with `agnes-3.0-flash` and `glm-5.3-flash` both returned HTTP 400, even after reducing `QWEN_CODE_MAX_OUTPUT_TOKENS` to 4096. A **read-only** review of the production Account API error logs confirmed the same upstream rejection in both cases:

```text
Invalid request body, Failed to parse '.tools[1]'
```

A fake-key capture of the unchanged Qwen Code 0.26.3 request identified `tools[1].function.name = get_goal` **without** `function.parameters`. Other emitted coding tools had parameter schemas. Some upstream OpenAI-compatible providers reject an absent parameters field, even for a tool that accepts no arguments.

**Fix:** `candidate/proxy.mjs` normalizes only zero-argument function tools missing `parameters` to `{ "type": "object", "properties": {} }` before forwarding to the immutable BotConnector Gateway. It does not remove or disable coding tools, adjust model IDs, modify the engine, or change Gateway code. All unrelated tools and existing schemas pass through unchanged. The first rejected schema is addressed; further upstream validation errors remain possible until an owner-controlled live retest.

**Regression verification:** 16/16 tests PASS locally on Windows/Node 24, including the **real Qwen 0.26.3** invoking a strict mock upstream which rejects missing tool parameters. Qwen emits `get_goal`, the proxy repairs its schema, and streaming ends with `E2E_OK`. No real account key was used for that verification.

**Owner live retest:** from the existing candidate folder, with `BOTCONNECTOR_API_KEY` supplied securely in the PowerShell session, run:

```powershell
$env:QWEN_CODE_MAX_OUTPUT_TOKENS = "4096"
node .\\cli.mjs run --model "agnes-3.0-flash" "Balas tepat E2E_OK"
```

The 4096-token cap is an optional conservative test configuration, **not the identified root-cause fix**. Do not echo API keys or enable full request logging. If the live request still fails, inspect only sanitized upstream errors by request ID before changing compatibility mappings again.

## 2026-10-29 follow-up: second upstream 400 at tools[3]

The owner's next live test after repairing `get_goal` still received HTTP 400. **Read-only production Account API logs** identified the next specific rejection:

```text
Invalid request body, Failed to parse '.tools[3]'
```

Tool index 3 is `read_file`. Qwen Code 0.26.3 declares optional `offset`, `limit`, and `pages` fields with JSON Schema `type: ["integer", "null"]` or `type: ["string", "null"]`. Some strict OpenAI-compatible model providers do not accept nullable type arrays in function parameter schema.

The POC proxy now normalizes **only optional** two-type `null` unions into their single non-null primitive, recursively for nested object properties, as well as the existing zero-argument `get_goal` fix. Required nullable fields, unions with more than two members, and other tool definitions remain untouched. Code remains only in the external candidate proxy; upstream Qwen Code and the production gateway are unchanged.

17/17 Windows Node.js tests PASS, including real Qwen Code 0.26.3 sending all six coding tools through a strict fake upstream that rejects missing parameters and type arrays, and a regression test that guarantees no mutation of required nullable fields.

**Owner-controlled live inference has not been retested after this second schema repair**. Do not report the live 400 as fixed until the user verifies it.


## 2026-10-29 — Ling interactive acceptance and upstream-first continuation

**Owner live acceptance:** `ling-3.0-flash` through BotConnector Gateway and Qwen Code successfully changed a sandbox `test.txt` file to `status=berhasil`. This establishes one real interactive tool-edit success, but is not a general release certification or evidence of ledger settlement.

**Default selection:** `ling-3.0-flash` is the candidate default only if the authenticated `/v1/models` catalog actually lists it. Priority: `--model` > `BOTCONNECTOR_MODEL_ID` > Ling default. A missing model fails closed; no automatic substitution or other-provider fallback.

**Native Qwen session reuse:** `cli.mjs resume [--model MODEL] [prompt]` passes `--continue` to upstream Qwen, with the same `--bare`, fixed Gateway proxy, and approval policy. This resumes the newest session **for the current working directory**, not necessarily the most recent session from another project. No second session database is implemented. Qwen stores chat/session records on disk in the candidate's isolated `~/.bccli-qwen-candidate` directory; those records can contain prompts or tool output. Treat the directory as private and include an explicit privacy/retention policy before general release.

**Windows Node compatibility:** A true local streaming `read_file` → tool result → response sequence passed inside Qwen Code 0.26.3, but Node **24.18.0** emitted `UV_HANDLE_CLOSING` and exited with code 3221226505 after printing the final answer. Repeating the same test on **Node 22.23.4**, installed only under the POC temp directory, exited cleanly with code 0. Do not claim Node24 support for headless tool loops until fixed upstream. The owner's interactive Node24 edit was reported successful, so this is a specifically observed headless shutdown issue rather than proof all Node24 workflows fail.

**Noninteractive edit approval:** With Node22 and a fake local gateway, Qwen first read a real temporary fixture. When a later model instruction requested `edit`, `--approval-mode default` declined the mutation because no interactive user could grant permission; the original file remained unchanged. Never enable `--yolo` as a workaround.

**Testing layout:** `test/*.test.mjs` is routine compatibility coverage, `test-integration/*.test.mjs` exercises the actual upstream Qwen runtime and should be executed on Windows using Node22. Verified: **18/18 routine tests**, **3/3 Node22 integration tests** (read tool loop, no-TTY edit refusal, native session resume). A Node24 headless tool-loop test is an explicitly recorded failure, not silently accepted as PASS.

Windows POC runtime, no changes to global Node or BCCLI installation:

```powershell
$root = Join-Path $env:TEMP 'bccli-qwen-poc-20261029'
$node22 = Join-Path $root 'node22-runtime\node_modules\node\bin\node.exe'
Set-Location (Join-Path $root 'candidate')
& $node22 --test 'test-integration/*.test.mjs'
# With BOTCONNECTOR_API_KEY provided securely in the current shell:
# From a chosen project directory, run:
# & $node22 (Join-Path $root 'candidate\cli.mjs') chat
# Later, from that same project directory:
# & $node22 (Join-Path $root 'candidate\cli.mjs') resume
```

**Official built-in commands to examine interactively:** `/restore` for file checkpoints and `/resume` for sessions; do not replace them with a custom diff/undo implementation. Neither checkpoint restoration nor real-session restore has been accepted in a live user workflow yet.

**Billing:** Read-only Account API logs for Ling showed `novita:ling-3.0-flash` request/tool-message routing, but the log lines alone do not establish account ledger reconciliation. Token/cost settlement, quota, cache, and possible project privacy behavior remain release blockers. No production settings or published `@botconnector/bccli` package changed.

**No-Go:** Keep this PR draft until Node compatibility, real interactive approvals, `/restore`, persisted-session privacy, MCP/tool integrations, and wallet/usage reconciliation are tested and explicitly approved.


## 2026-10-29 — Production Ling usage reconciliation and interactive checkpoint restore

**Read-only production accounting, not a write or charge test.** Five Ling request IDs from the user's acceptance session (2026-10-29 13:25:06–13:25:55 UTC) were matched against `cloud_usage_events` and `cloud_request_telemetry`. All five had `success` status through `novita:ling-3.0-flash`. Totals: **7,983 input tokens + 1,306 output tokens = 9,289 total tokens**. They belong to one account (counted without displaying the user ID).

The five request IDs have **no matching PAYG reservations or ledger entries**. For that same account, `api_billing_ledger` had **zero rows in the narrower acceptance window 13:20–13:35 UTC**. Therefore, there is no evidence of a PAYG wallet debit for those requests in this database/window. Do **not** describe provider procurement cost as USD 0: `cost` is null and `provider_cost_micros` is 0 on the corresponding usage rows, which does **not** prove an actual provider cost. Plan/free quota deduction and retail settlement outside this observed path require separate validation before commercial release.

**Interactive checkpoint restore proof (fake gateway, isolated Windows temp project):**
1. Qwen Code 0.26.3 with `--bare` and default approvals generated a readable diff (`status=awal` → `status=berhasil`), displayed **Yes, allow once**, and edited `test.txt` only after the approval was simulated.
2. Native `/restore` listed an actual `*-test.txt-edit` checkpoint.
3. Executing `/restore <checkpoint-id>` returned the file to **`status=awal`**.
4. Native Qwen attempted tool replay and **requested edit approval again**. No second approval was provided; the file remained restored.

Probe was run with Node 22.23.4 and Qwen's bundled WinPTY dependency with `useConpty:false` (the default ConPTY agent cannot attach to this remote terminal). The external PTY helper can report an `AttachConsole` error when forcibly closed; this is separate from the successful file-content assertion. A Windows-only manual regression script is saved under `candidate/test-integration/manual-restore-winpty.mjs`. It uses only fake tokens, a localhost mock and temporary files; it is intentionally **not** part of routine `npm test`, which stays stable on Node 24.

**Remaining release gates:** cross-runtime Node compatibility, authorized live MCP and subagent acceptance, explicit plan/quota reconciliation and actual provider invoicing, session-retention privacy, installer-free npm migration/rollback. Keep current `@botconnector/bccli` release unchanged. The candidate PR stays draft.

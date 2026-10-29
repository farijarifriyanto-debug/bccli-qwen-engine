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


## 2026-10-29 — mandatory candidate rebuild after any change

The candidate is **plain Node ESM**, not a separately compiled exe. To avoid stale files, run the repeatable npm rebuild before installing/test-driving a new revision:

```powershell
cd "$env:TEMP\bccli-qwen-poc-20261029\candidate"
npm.cmd ci --ignore-scripts --no-audit
npm.cmd run rebuild
# Run upstream integration tests explicitly with Node 22:
$root = Join-Path $env:TEMP 'bccli-qwen-poc-20261029'
$node22 = Join-Path $root 'node22-runtime\node_modules\node\bin\node.exe'
& $node22 --test test-integration/*.test.mjs
```

`npm run rebuild` performs syntax checks, all routine adapter tests, and creates a local npm tarball. The package manifest whitelists only `cli.mjs`, `core.mjs`, `proxy.mjs` and `gateway.mjs`; `package.json` is included automatically. `package-lock.json` pins the dependency graph. The tarball is a **private local artifact**, not a publication. Its path must not be confused with the existing `@botconnector/bccli` release.

**Verified local rebuild:** `botconnector-bccli-qwen-candidate-0.0.0.tgz`, 6,389 bytes, SHA-256 `C6D0AB4256DFB4E0ED9FD5F62115F725EAF8E63133196AB0110E941E68B64D8D`. Source checks 18/18 PASS. A separate isolated `npm install --prefix ... <tarball>` installed the package and pinned Qwen Code 0.26.3; smoke checks confirmed the candidate binary, Ling default, and fail-closed missing credentials. Installed legacy BCCLI was still 0.4.17.

The rebuilt package is under `%TEMP%\bccli-qwen-package-smoke-20261029\node_modules\@botconnector\bccli-qwen-candidate\cli.mjs` for isolated testing. Start it with the *isolated Node22 runtime* to avoid the known Node24 headless shutdown issue. **Restart an already running Qwen terminal** to pick up new launcher code; a rebuild does not hot-reload active CLI processes.

**Production release stays HOLD** until the separate blocked gates pass. Rebuild success alone does not authorize a merge, global install, npm publish, or production deployment.


## 2026-10-29 — BCCLI white-label banner with upstream `--bare` preserved

The owner reported that the terminal still displayed the large **QWEN** logo, title `Qwen Code`, and introductory tips despite previous adapter rebuilds. Changing the candidate's package name alone does **not** change upstream Qwen's TUI.

Upstream Qwen Code 0.26.3 supports native `ui.customBannerTitle`, `ui.customBannerSubtitle`, `ui.customAsciiArt`, but a **fake-key Windows PTY test proved these settings are ignored with `--bare`**. Removing `--bare` is unacceptable: earlier adversarial tests showed project configuration can redirect the provider endpoint. Therefore BCCLI retains `--bare` and does **not** fall back to reading untrusted project/user settings for appearance.

**White-label solution:** `candidate/branding.mjs` produces a private, verified copy of the installed upstream Qwen npm engine under the *same node_modules dependency tree* at `node_modules/.cache/bccli-branded-engines/`. It:
- Requires exact upstream version 0.26.3 and pinned SHA-256 of only three renderer bundles; any upstream bundle drift **fails closed** instead of silently breaking branding.
- Copies the original runtime package, modifies only the bundled logo and Ink/OpenTUI banner strings plus two startup tip messages, then checks output hashes and installs an immutable marker. No tool, gateway, auth, permissions, or model-routing code is edited.
- Leaves `node_modules/@qwen-code/qwen-code` **byte-identical** for auditing and updates; its original LICENSE and provenance remain in the copied runtime. First use makes a cached copy of roughly 148 MB, so initial launch may be slower; subsequent launches reuse it after verifying hashes.
- Sets the upstream-supported `CLI_TITLE` to `BCCLI - <working directory>`, with `--bare` and default approvals unchanged.
- Uses upstream-supported `--append-system-prompt` to tell the selected model to introduce the product as BCCLI; the prompt explicitly requires truthful disclosure of the underlying Qwen Code engine if asked. This is a model instruction, not a guarantee about every model's free-form phrasing.

**Verified in fake-key Windows PTY:** rendered logo **BCCLI**, panel title `>_ BCCLI | BotConnector (v0.26.3)`, and tip `Use /help to explore BCCLI tools and commands.`; the default `Qwen Code (v...)` title was absent. The v0.26.3 suffix is the **engine version**, not a released BCCLI version. A separate Node22 integration regression verified patched engine startup, gateway key isolation, `--bare`, complete upstream tools, and the BCCLI identity system instruction.

**Build:** `npm run rebuild` ran 20/20 routine tests and repacked the private candidate into `botconnector-bccli-qwen-candidate-0.0.0.tgz` (SHA-256 `5F80467085D6387643542DFFD11CEA931F8A379589FFD7D3A69EBB800119E511`). A separate prefix install confirmed packaged `branding.mjs`, Qwen Code 0.26.3, and BCCLI's updated help. **4/4 upstream Node22 integration tests PASS** including the new branding probe. Legacy global `bccli --version` remains 0.4.17; no publish or deployment took place.

**Owner usage:** Exit the currently open Qwen session, then start the freshly rebuilt isolated package below (with the owner-provided API key available only in their process environment):

```powershell
$root = Join-Path $env:TEMP 'bccli-qwen-poc-20261029'
$node22 = Join-Path $root 'node22-runtime\node_modules\node\bin\node.exe'
$cli = Join-Path $env:TEMP 'bccli-qwen-package-smoke-20261029\node_modules\@botconnector\bccli-qwen-candidate\cli.mjs'
Set-Location (Join-Path $env:TEMP 'bccli-qwen-tooltest')
& $node22 $cli chat
```

This is a **white-labeled entry surface**, not removal of upstream provenance or a claim that every diagnostics/settings/attribution screen has been renamed. Further UI branding coverage remains an acceptance/release gate; do not patch arbitrary Qwen strings or disable required license notices.

**Release remains HOLD** pending security, upgrade/race conditions, production accounting and Node runtime support. The new branding feature requires a fresh CLI process; rebuild does not modify a terminal that is already open.


## 2026-10-29 — BCCLI rebrand v2 built and PTY-verified (supersedes v1)

The user's interactive screenshot exposed an upstream core system-prompt sentence: `You are Qwen Code ... developed by Alibaba Group`. This overrode the product-only introduction despite an appended instruction. The runtime patch now makes the core sentence `You are BCCLI ... developed by BICO Inovasi Digital for BotConnector`, while preserving the remainder of the coding agent tool/safety prompt. The appended product instructions distinguish **Ling as the selected model**, **BCCLI as the BotConnector product**, and **Qwen Code as the open-source runtime**, disclosed only when explicitly asked about implementation. Don't misrepresent ownership of the upstream runtime or remove Apache-2.0 notices.

**Distinct UI palette:** Ink light/dark and OpenTUI use a custom `#00AFA0` teal → `#22C55E` green → `#EAB308` amber gradient; supporting accents were also adjusted. The prior upstream blue/purple/rose gradient is no longer used on the terminal's rendered logo. The runtime remains copied into a private immutable SHA256-pinned cache and the original npm dependency is not modified. Only pinned runtime bundles are patched; any upstream mismatch fails closed.

**User-facing routing:** the `/bug` issue URL and npm package metadata now point to the **independent BCCLI product** repository `https://github.com/farijarifriyanto-debug/bccli`, not the fork. The internal fork `bccli-qwen-engine` retains upstream fork provenance; this should not be presented as the product homepage.

**Verification:** `npm run rebuild` **24/24 routine tests PASS**, including identity attribution, palette, product issue links and fail-closed patching. Windows Node22 **4/4 integration tests PASS**, including actual pinned-engine streaming through a fake local Gateway, preservation of tool definitions and API key isolation, and a system prompt assertion containing BICO identity instead of Alibaba product attribution. Windows PTY rendered a BCCLI logo and panel, teal and amber truecolor ANSI sequences, with no upstream blue-purple-rose brand colors (or `Qwen Code (v...)` header). No real API key was used for the branding PTY/integration tests.

**Fresh packaged install:** `@botconnector/bccli-qwen-candidate@0.0.0` rebuilt local tarball: SHA256 `BD6695501B463453F3695AFC4A0FC4402E34A2C243013C256FA64B98FDFD559F`, 9,769 bytes. Installed in separate `%TEMP%\bccli-qwen-brand-v2-install-20261029`, confirmed bundled branding, expected private white-label cache, and correct BCCLI help. Global legacy `bccli` remains `0.4.17`.

**To test the current v2 packaged build yourself** (PowerShell; owner must provide API key securely in their shell):
```powershell
$root = Join-Path $env:TEMP 'bccli-qwen-poc-20261029'
$node22 = Join-Path $root 'node22-runtime\node_modules\node\bin\node.exe'
$cli = Join-Path $env:TEMP 'bccli-qwen-brand-v2-install-20261029\node_modules\@botconnector\bccli-qwen-candidate\cli.mjs'
Set-Location (Join-Path $env:TEMP 'bccli-qwen-tooltest')
& $node22 $cli chat
```

**Limitations:** Existing sessions preserve old assistant output and model memory. Start a **new** session (not `resume`) when testing rebrand persona. An upstream update notice or technical diagnostics may still mention Qwen; do not falsely imply that all underlying implementation/attribution strings are removed. The `/update` mechanism remains upstream-controlled and must be disabled or replaced with BotConnector release policy **before public production cutover** to prevent accidentally upgrading to Qwen upstream. The displayed v0.26.3 suffix is the pinned **engine version**, not a BCCLI release. Keep npm production release **HOLD** pending update flow, Node24, account/plan billing, privacy and wider regression testing. No merge or npm publish was done.


## 2026-10-29 — v3 correction: AI identity follows the selected model, not BCCLI branding

The owner rejected the previous forced AI introduction *“Halo! Saya adalah BCCLI ... dikembangkan oleh BICO Inovasi Digital ...”*. They want **the actual model's identity**, not a fixed app/company persona. The distinction is:

- BCCLI / BotConnector = the application's terminal UI, Gateway route, auth, model selection, tool and billing integration.
- Ling 3.0 Flash = the **currently selected** AI model by authenticated Gateway ID `ling-3.0-flash`, not the creator of the BCCLI app.
- Qwen Code 0.26.3 = attributed open-source **underlying coding-agent runtime**, not the AI being invoked through BotConnector. License and provenance remain available.

**v3 changes:** removed `IDENTITY_INSTRUCTION` and all fixed “You are BCCLI / developed by BICO Inovasi Digital” model persona strings. The immutable private overlay replaces the hardcoded Qwen/Alibaba core-persona line only with the neutral `You are an AI coding assistant, ${role}, ${focus}.` and sets the project-init prompt to a similarly neutral coding-agent instruction. No forced self-introduction is appended. The only supplementary context is dynamic, factual runtime metadata: `active_model_id=<exact selected Gateway model ID>; client_app=BCCLI; gateway=BotConnector`. It is derived from the actual model picker, not hardcoded to Ling; no requirement to say “I am BCCLI” is present. Model responses remain probabilistic and should be checked in owner-run live inference before saying actual answers are validated.

**Branding remains:** the application banner/logo, title, palette (teal/green/amber), bug-report and npm product metadata stay BCCLI; none of these are converted into a model identity. `--bare` security, default approvals, per-session proxy, real-key isolation, model availability validation and native Qwen tools are unchanged.

**Verification on Windows:** `npm run rebuild` **24/24 routine tests PASS**. Node22 real Qwen mock-Gateway tests **4/4 PASS**, including system prompt receiving `active_model_id=ling-3.0-flash`, not receiving “You are BCCLI”, while continuing to stream through the isolated key proxy. A unit test verifies an alternate model `kimi-k2.7-code` supplies its own runtime model ID instead of reusing Ling. Fresh private v3 tarball SHA256 `9478C277356F1B568306F35326897B9E1A467F9B1A67944A8BA166A53B107FBF` installed under `%TEMP%\bccli-neutral-v3-install-20261029`, where the actual copied core bundle contained the neutral role and no forced BCCLI role. Installed legacy global BCCLI remains 0.4.17.

To test v3 yourself with the API key that you explicitly provide only in PowerShell:

```powershell
$root = "$env:TEMP\bccli-qwen-poc-20261029"
$node22 = "$root\node22-runtime\node_modules\node\bin\node.exe"
$cli = "$env:TEMP\bccli-neutral-v3-install-20261029\node_modules\@botconnector\bccli-qwen-candidate\cli.mjs"
cd "$env:TEMP\bccli-qwen-tooltest"
& $node22 $cli chat
```

Start a **new** conversation, not `resume`: older transcripts may preserve the previous forced BCCLI or Alibaba answer. For acceptance, ask `Model AI apa yang aktif, dan apa perbedaan model AI, BCCLI, dan engine-nya?` The expected fact pattern is dynamically selected model ID, app identity, and engine attribution only when relevant—not a fixed “I am BCCLI” script.

**Release stays DRAFT/HOLD.** No npm publish, production deployment, merge, or global BCCLI replacement was performed.


## 2026-10-29 — provider/login, update and GitHub link sweep

Owner screenshot showed **Connect a Provider** with QwenCloud / Alibaba ModelStudio / Qwen terms and a GitHub link referring to the upstream Qwen product. For BCCLI this is the wrong onboarding surface: BCCLI uses **one BotConnector Gateway account and an authenticated model catalog**, while upstream vendors and routing are configured in BotConnector, not in Qwen.

### Product-facing changes in private branded runtime

- Upstream `/auth`, `/connect`, `/login`: disabled upstream provider modal and replaced it with a BotConnector Gateway connection notice. It explains BCCLI login and the selected Gateway credential.
- Upstream `/model`: for now disabled the upstream multi-provider picker; users select among eligible authenticated Gateway model IDs with the BCCLI candidate `models` and `chat --model ID` commands. This avoids bypassing BCCLI Gateway model verification. A proper in-session BotConnector picker remains a release gate; **do not claim it exists yet**.
- Upstream `/update`: disabled direct Qwen npm/standalone updater and instead displays BCCLI release details. Also sets upstream `QWEN_CODE_SKIP_UPDATE_CHECK_ONCE=true` on each child process, preventing automatic upstream update checks on ordinary BCCLI startup.
- `/bug` points to the independent BCCLI product GitHub `https://github.com/farijarifriyanto-debug/bccli/issues` (not engine fork); candidate package `repository`, `bugs` and homepage are product-first.
- Noninteractive `/status` says BCCLI with the **engine** version. Upstream `qwen --resume` exit hints on Ink, OpenTUI and Ink summary were rewritten to the supported BCCLI candidate `resume` workflow. These changes only affect displayed text and commands, not saved session semantics.
- The source package, backend engine, license and required upstream attribution remain intact. The upstream provider dialog code and Qwen URLs remain inside the pinned engine for audit/provenance but are *not exposed by the patched slash command*. This is not a claim that every buried diagnostic or optional settings screen contains no upstream string.

### Existing BCCLI login reuse

The candidate does **not create a second credential store**. If `BOTCONNECTOR_API_KEY` is set, it wins; otherwise it reads the existing owner's `bc-cloud` entry from `~/.bccli/credentials` (or explicit absolute `BCCLI_HOME`). Non-file/symlink/oversized/invalid credential files fail closed. Key contents are never logged, never passed on command-line argv, never sent to the Qwen child, and never included in the npm package. This is the same saved-login convention used by existing BCCLI, and it permits `bccli login` to serve as the connection flow. The prototype does not yet implement its own interactive key-writing command.

### Security and test evidence

- Pinned copies only; original `@qwen-code/qwen-code@0.26.3` source bytes unchanged; all modified bundles are verified against SHA-256 and cache revision before any branded launch. `--bare` stays on, permission policy stays `default`, and the proxy only forwards to `https://api.botconnector.id/v1`.
- Existing unit suite now contains fake-key credential tests (saved-login reuse, env precedence, missing login, symlink prevention), slash command tests and branding/release-link tests.
- Windows Node22 PTY with a **fake** Gateway key verified: `/auth` shows BotConnector managed connection and no QwenCloud/Alibaba modal; `/model` reports Gateway-based model selection; `/update` reports BotConnector release policy rather than installing Qwen. Original product GitHub bug and release paths are set to BCCLI.
- Key privacy, account-specific billing, newer Node runtime stability, model picker parity, optional Qwen settings flows, and broader diagnostics remain release verification gates. No npm publish, production deployment, global package replacement or branch merge.

### Using the latest candidate after an isolated rebuild

```powershell
$root = Join-Path $env:TEMP 'bccli-qwen-poc-20261029'
$node22 = Join-Path $root 'node22-runtime\node_modules\node\bin\node.exe'
$cli = Join-Path $env:TEMP 'bccli-qwen-provider-sweep-install-20261029\node_modules\@botconnector\bccli-qwen-candidate\cli.mjs'
cd (Join-Path $env:TEMP 'bccli-qwen-tooltest')
& $node22 $cli models
& $node22 $cli chat    # defaults to ling-3.0-flash if eligible
```

Use a new CLI process; an already-open session is not hot-reloaded.

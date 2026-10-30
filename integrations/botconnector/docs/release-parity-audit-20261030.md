# BCCLI candidate release parity audit — 2026-10-30

**Decision: NO-GO for replacing `@botconnector/bccli@0.4.17`.** This is an isolated upstream-Qwen engine candidate, not an in-place upgrade. Evidence: published BCCLI source `farijarifriyanto-debug/bccli` at `main` (`package.json`, `src/cli.ts`, `README.md`, `docs/config.md`) versus candidate `integrations/botconnector/candidate/cli.mjs`, `core.mjs`, `package.json` and tested Qwen 0.26.3 integration. An upstream engine having a similarly named interactive command does **not** establish behavior or data migration parity.

| Capability/interface | Existing BCCLI 0.4.17 | Candidate evidence | Release status |
|---|---|---|---|
| npm public executable | `@botconnector/bccli`, bin `bccli`, SDK `exports` | Private `@botconnector/bccli-qwen-candidate`, bin `bccli-qwen-candidate`; no SDK | **Not interchangeable** |
| Headless automation | `bccli -p`, `--output-format json/stream-json`, `--fail-on-tool-error` | `run "prompt"` using Qwen headless output; public flags rejected | **BREAKING** |
| Authentication | `bccli login/logout`, provider CLI and stored provider credentials | Reads existing `bc-cloud` key or env; no candidate login/logout command | **BREAKING** |
| Model/provider selection | `/provider`, `bccli provider`, multiple cloud/local custom providers | Gateway-only (intentionally); authenticated `models`, interactive `/model` proven | Partial; local providers absent |
| Reasoning/language | `--reasoning`, `/reasoning`, `--lang`, `/language` | Candidate launcher rejects public flags; native Qwen command equivalence unverified | **BREAKING/UNKNOWN** |
| Session transfer | `~/.bccli`, `-c/-r`, export/import, session metadata | Separate Qwen home; native `resume` integration passed, **no migration** | **BREAKING** |
| Project instructions and hooks | Project `.bccli/config.json`, AGENTS, hooks, skills, plugins | `--bare` blocks implicit project/user discovery to prevent credential redirects; no verified safe parity | **BREAKING/UNKNOWN** |
| Explicit MCP | `bccli mcp`, trusted project approval, MCP server integration | `--mcp-config` owner-file opt-in; mock authenticated MCP tested | Partial; management differs |
| Security approval | Default approval, edit/secret-file constraints, CLI allow rules | Default mode; tests show edit denied without consent; test-only read_file exception | Partial; policy equivalence unverified |
| Coding edits/checkpoints | File read/write/edit, `/undo`, `/redo`, `/rewind` | Real tool loop and native checkpoint restore smoke passed; not semantics/retention parity | Partial |
| Subagents, worktrees, PR review | `task`, `bccli -w`, `/pr`, `/worktree` | Qwen upstream may have related capabilities; candidate flags and workflows unverified | **UNKNOWN/BREAKING** |
| Tooling/integrations | `bccli connect/disconnect`, ACP/serve, integrations, stats, gh-bot | Not implemented in launcher; upstream substitute not verified | **BREAKING** |
| Privacy | `~/.bccli` retention settings and access rules | Qwen session records in `~/.bccli-qwen-candidate`; no candidate retention/clear migration; `--telemetry=false` | **UNRESOLVED** |
| Billing/usage | Gateway-controlled plan/PAYG, cost/status | Candidate proxy sends authenticated BotConnector requests; Kimi live response passed; no current pricing + authoritative ledger canary | **UNRESOLVED** |
| Windows runtime | Public package `node >=22` | Candidate Node 22.23.4 / 24.22.1 CI passed; known Windows Node24 <24.22.1 proactively blocked | Partial |
| Licensing | Public `MIT` | Candidate including upstream `Apache-2.0` and third-party notices | Package smoke PASS; final dependency attribution still subject to release review |

## Non-negotiable release acceptance

1. **Do not overwrite** `bccli` or the public npm package. Keep candidate `private:true` and unique bin until every mapped legacy interface is tested or an explicitly accepted incompatibility/migration strategy exists.
2. Test `login/logout`, `provider`, `-p --output-format`, `-c/-r`, `mcp`, `connect`, config precedence, SDK imports, secrets/permissions, permissions after resume, `/copy`, editing/checkpoints, native Windows/macOS/Linux behavior, and output contract using isolated homes. Test installed **tarballs**, not only source trees.
3. **No automatic transfer of old sessions** or credentials other than read-only owner `bc-cloud` key lookup. Define opt-in migration and rollback to `0.4.17`.
4. Privacy: establish Qwen session/file retention, deletion and consent; note that spawned coding tools can inherit some process environment variables (the local proxy protects the real BotConnector key, **not necessarily every unrelated environment secret**). Do not claim full OS sandbox isolation.
5. Billing: verify live retail SKU, current pricing/vendor route, reserve/dispatch/accepted/settled ledger, usage reconciliation, authorization and quota for one owner-approved low-cost canary; use mock-only tests for denial/retry cases.
6. Publish/deploy only by a separate, explicit owner decision after current CI and a non-disruptive versioned rollout. The independent Gateway Kimi PR can progress separately once its production billing checks pass.

## Evidence from 2026-10-30

- Candidate Windows Node22/Node24 CI: **39/39** unit + **4/4** integration per runner on `89c6a3a0`; known Windows Node24.18.0 shutdown crash reproduced and guarded.
- Updated Gateway PR #226: mock HTTP/ledger plus Kimi compatibility suite **20/20 PASS** after numeric-string output bound fix; latest full CI on the amended head must be rechecked.
- Historical PAYG policy snapshot was generated **2026-10-14**, with Kimi price key `openrouter:kimi-k2.7-code-streamlake`, not authoritative evidence of current prices or margin.
- Public package remains `@botconnector/bccli@0.4.17`. No npm publish, global installer change, production deployment or live wallet charge was performed during this audit.

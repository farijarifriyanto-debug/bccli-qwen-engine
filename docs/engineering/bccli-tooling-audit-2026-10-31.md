# BCCLI coding agent — tooling audit, 31 Oct 2026

Basis: 18-section user-supplied tooling contract. Tested through the pinned BCCLI engine using a mocked provider, with no real API key or billable call.

## Root cause

RC.8 launched under --bare for security. This mode has two independent limitations: a short DEFAULT_BARE_CORE_TOOLS allowlist and a smaller createToolRegistry() registration branch. Real capture of tools sent to the model showed exactly six: edit, get_goal, notebook_edit, read_file, run_shell_command and update_goal. Removing --bare in a test enabled glob, grep_search and write_file, **but doing so in production is unsafe** because project settings/hooks/provider overrides could be implicitly loaded.

RC.9 patches both bare-mode controls (integrity-pinned) and preserves --bare, --approval-mode default and private proxy authentication. Now exactly nine tools are sent, adding glob, grep_search and write_file. Real fixtures test searching a Python file; a mock agent's unapproved overwrite is denied.

Also, RC.8's AGENTS.md default was insufficient: bare mode did not load it into the LLM context. RC.9 now passes the *explicit current project directory* via --include-directories. Tests confirmed an AGENTS.md-only sentinel was absent before and present after. Legacy QWEN.md remains supported.

## Implementation coverage, not guesses

| Contract in user's attachment | RC.9 status | Remaining work |
|---|---|---|
| write_file | PARTIAL, exposed and smoke-tested | Actual tool only accepts file_path/content/record_as_artifact; overwrite policy, BOM/newlines, output hash and structured errors do not yet match |
| glob | PARTIAL, exposed and smoke-tested | Upstream pattern/path only; exclusion, max/sort and <5s benchmark unverified |
| grep_search | PARTIAL, exposed and smoke-tested | Upstream pattern/glob/path/limit; count/files modes and context output unverified |
| apply_patch | NO | Atomic multi-hunk diff+rollback must be implemented |
| web_fetch / web_search | NO | Require secure redirects, private-network denylist and provenance |
| todo_write / ask_user_question / task_list / task_stop | NO | Must support interactive lifecycle and ownership checks |
| remote_exec / secret_get | NO | Require opt-in profiles, permissions, secret handles, auth audit, no direct passwords |
| LSP / AST search | NO | Language servers and schema-verified implementation still needed |
| run_tests / lint_check | PARTIAL | Shell can execute but lacks structured counts, artifacts and interpreter selection |
| git_op | PARTIAL | Shell Git exists; no structured dry-run, PR checks or force protection contract |
| sandbox_exec | NO | Must prove real memory/CPU isolation and no network |
| notify / browser_e2e | NO | Real connectors, explicit authorization and evidence artifacts needed |

## Implementation priority

1. Release P0 safe tools and AGENTS.md loading, verify CI and real Windows UI. Do not publish npm latest until acceptance.
2. Add exact-contract atomic patch/file I/O with UTF-8, CRLF/BOM, size bounded results and structured errors.
3. Add safe, provenance-carrying web retrieval and structured test/lint tooling.
4. Add language intelligence, remote execution, secret handles and genuine sandboxing only after security reviews.
5. Add browser E2E, Git operations, tasks and notifications with explicit opt-in and real artifacts.

Do not conflate tests against a mock AI endpoint with live model/provider tests. No changes to source license attribution or provider secrets. Existing user project AGENTS.md is not overwritten.

# BCCLI 0.5.2-rc.11 — safe apply_patch in coding agent

Candidate based on RC.9, **not** published to npm latest or production.

## Changes

- Adds a real `apply_patch` tool to the model-visible registry while keeping `--bare`, default per-tool permissions and isolated credential proxy.
- Supports 1–32 exact unique replacements on a single existing UTF-8 file as one atomic rename, not an in-place partial write. Preserves BOM and CRLF; rejects ambiguous matches, stale hashes, symlinks, .git, workspace escapes, binary content and files over 1 MiB.
- Requires prior `read_file` before a patch, even with explicit auto-edit configured; tests verify refusal of blind edits.
- Includes patch implementation in the pinned, branded engine cache and the distributable package. Does not mutate the official upstream engine artifact.
- Keeps RC.9 `glob`, `grep_search`, `write_file` and AGENTS.md support.

## Validation on Windows / Node.js 22.23.4

- **124/124** candidate unit tests PASS.
- **5/5** focused real-engine integration tests PASS using a simulated API endpoint, including actual approved multi-hunk patch and denied writes.
- RC.10 was built locally before the final adapter/read-enforcement corrections. Its local artifact is superseded and must not be published.
- Cross-platform GitHub CI and independently installed RC.11 smoke remain required before release promotion. No paid cloud-model acceptance has been claimed.

## Not included

- No multi-file atomic transaction, unified diff input, AST/LSP, sandbox isolation, WinRM/SSH, secret-get or native browser E2E.
- Concurrent external edits can still race between final hash preflight and rename. The operation is atomic per file, not a multi-file database transaction.
- Windows Node.js 24.18.0 is blocked by the CLI's existing runtime guard; use tested Node 22.23.4 or verified Node >=24.22.1.

Do not merge or publish without six-platform CI and an interactive Windows acceptance check.

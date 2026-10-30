# BCCLI 0.5.2-rc.10 — Atomic single-file apply_patch (candidate)

This is an experimental prerelease built on RC.9's --bare tool allowlist and explicit AGENTS.md loading. Not npm latest. No public release, upload or production installation is implied by this source change.

## Capability

- `apply_patch` is now registered in the **actual model tool registry** under `--bare` next to `glob`, `grep_search`, `write_file`, `edit`, `read_file` and `run_shell_command`.
- Accepts a path to **one existing UTF-8 file** and 1–32 exact, uniquely matching `old_text` / `new_text` replacements. A single call updates multiple text regions.
- Stages a complete replacement in the same directory and commits via one rename. Preserves existing UTF-8 BOM and uniform CRLF/LF. No partial in-place file writes.
- Requires tool approval and a prior file read (unless engine read-cache enforcement is explicitly disabled); refuses paths outside the active workspace, .git, symbolic links, ambiguous matches, stale SHA256, binary text, and files over 1 MiB.
- Headless default approval does **not** write files; the model receives a denial.

## Explicit limitations

- This is **atomic for one file**, NOT a multi-file transaction or generic unified diff parser. No add/delete/rename. No WinRM/SSH, secrets, sandbox, web fetch/search or LSP.
- A concurrent editor between the last hash preflight and rename can still race; no OS-wide exclusive lock is claimed.
- An isolated mocked AI response validates tool advertisement and denial, not the coding quality or reliability of any live cloud model.
- Windows Node.js 24.18.0 is known to trigger a libuv assertion during tool execution; use bundled Node 22.23.4 or a fixed Node 24 (24.22.1+ per existing launcher guard).

## Local Windows evidence (31 Oct 2026)

- Node.js 22.23.4: **122/122 candidate unit tests PASS** (including five new atomic-patch tests).
- Node.js 22.23.4: **3/3 targeted real-engine integration tests PASS**, including tool inventory, existing write-file approval denial, and new apply_patch approval denial.
- Node.js 24.18.0: unit/test run has a pre-existing CLI guard mismatch and headless libuv assertion; **not a passing platform**.
- Still required: complete integration matrix Windows/Linux/macOS (Node 22/24), independently installed RC.10 package smoke, interactive approval and real cloud model E2E. Keep npm latest unchanged.

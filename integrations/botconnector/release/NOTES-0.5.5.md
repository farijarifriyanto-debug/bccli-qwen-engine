# BCCLI 0.5.5 — searchable model picker

Changes since 0.5.4:
- `/model` now opens a BCCLI picker for the primary model: a visible `🔎 Search model:` row, live filtering as you type, `/` to focus the query, `Ctrl+U` to clear, Backspace to edit, `↑↓` to move, Enter to select, and Esc clearing the search before it closes. The list shows `Search models (matched/total)` and marks the active model.
- The filter matches the model id, the same string each row prints, so `gpt-5`, `qwen3` and `glm` narrow the catalog directly.
- Selection keeps the loopback proxy: `config.setModel` refreshes the live generator and the gateway records the choice for the next launch. If the gateway refuses, the previous model is restored and the dialog says `Model selection was not saved` instead of pretending.
- The auxiliary pickers — `--fast`, `--vision`, `--voice`, `--compaction`, `--image` and `--advisor` — still open the upstream dialog, which owns their eligibility and persistence rules.
- The engine is unchanged: this is the BCCLI overlay rewriting the pinned `@qwen-code/qwen-code@0.26.3` chunk at startup, guarded by exact locators and per-chunk source hashes, with `BRAND_REVISION` bumped so a previously branded cache is rebuilt.
- Packaging: `model-dialog.mjs` ships in all three packers (`prepare-preview-ui.mjs`, `prepare-production.mjs`, `prepare-next.mjs`). The production smoke job caught a preview-only listing during review and the fix is included here.
- Corrected release note: 0.5.4 described the upstream picker as "arrow keys, type-to-filter". The pinned engine has no filter in that dialog; this release adds one in the BCCLI layer.

Test and release gates:
- Candidate suite on Windows: 132 pass, 8 pre-existing failures identical to the untouched baseline (Node 24.18 runtime guard, engine lookups, TUI-surface sweeps on this platform). New dialog tests: 10/10. Branding locator test passes.
- Repo CI on this head: `verify` 6/6 on macOS/Ubuntu/Windows × Node 22/24 in both the package and production workflows, `windows-candidate` 22/24, `Check TUI impact`, `OpenTUI no-flicker gate` (12m21s) and `TUI parity snapshots` (23m36s) all pass. `triage` remains red on every PR because the repo has no `openai_api_key` secret for that bot.
- Artifact-level proof: a package built from the merged tree applies `prepareBrandedQwen` to its own engine and the patched `startInteractiveUI` chunk contains `BccliModelPicker`, the search row, the needle filter and the preserved `UpstreamModelDialog`.
- Still manual before publication: one interactive TUI acceptance run with a real provider on a terminal. This Windows environment cannot host the TUI, so the steps in `.qwen/e2e-tests/2026-10-31-model-picker-search.md` remain to be executed.
- New version `0.5.5` is distinct from immutable `0.5.4`. GitHub release and npm publication remain separate manual steps. Publish via the preconfigured GitHub OIDC trusted publisher on `farijarifriyanto-debug/bccli`, retain runtime source repo, commit and original SHA256 in npm provenance metadata, and do not claim npm published until public registry `latest` and the installed tarball pass.

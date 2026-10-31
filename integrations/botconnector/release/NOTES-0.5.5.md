# BCCLI 0.5.5 — search in the model picker

Changes since 0.5.4:

- `/model` now has a search row (`Search:` with a `type to filter…` placeholder) using the same pattern as the Skills panel. Typing filters the list live, Backspace edits the query, and the title shows `· <matched> / <total> models` so the effect of typing is visible.
- The filter matches the model label, its id, its auth type and its runtime snapshot id — the same terms each row prints — so `gpt-5`, `openai` and `qwen3` all narrow the catalog.
- Escape clears an active search first and closes the dialog on the second press. While the search is empty, digit keys still jump to a numbered row and `j`/`k` still scroll the list; once typing starts both belong to the search field.
- The Advisor picker no longer leaves its cursor on `Off` while searching a model: that row appears only when the search names it.
- The dialog chrome grew by one row, so the visible-row cap in a short terminal shrinks by one (`MODEL_DIALOG_FIXED_ROWS` 14 → 15). Nothing else about the dialog layout changed.
- Runtime behavior is otherwise unchanged: `bccli-bootstrap.cjs` Node selection, isolated session settings, the pinned Qwen Code 0.26.3 engine, provider switching and the legacy SDK remain available.

Test and release gates:

- Unit tests: the two touched suites pass locally on Windows — `ModelDialog.test.tsx` and `DescriptiveRadioButtonSelect.test.tsx`, 96 tests — together with `eslint` on the touched files, `tsc --noEmit` for `packages/cli`, and `npm run check-i18n` (all nine locales carry the three new strings).
- Repo CI on macOS, Windows and Linux plus the TUI parity and OpenTUI no-flicker gates remain the acceptance evidence for this version; record their result in the PR thread.
- Still manual before publication: one interactive TUI acceptance run with a real provider on a terminal (`/model`, type a name, backspace, Escape twice). The authoring environment was a Windows runner without a TUI-capable terminal.
- New version `0.5.5` is distinct from immutable `0.5.4`. GitHub release and npm publication remain separate manual steps. Publish via the preconfigured GitHub OIDC trusted publisher on `farijarifriyanto-debug/bccli`, retain runtime source repo, commit and original SHA256 in npm provenance metadata, and do not claim npm published until public registry `latest` and the installed tarball pass.

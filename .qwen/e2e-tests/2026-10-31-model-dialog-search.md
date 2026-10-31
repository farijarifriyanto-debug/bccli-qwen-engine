# Search in the `/model` dialog

## Automated verification

Run the focused CLI tests:

```bash
cd packages/cli
npx vitest run src/ui/components/ModelDialog.test.tsx
npx vitest run src/ui/components/shared/DescriptiveRadioButtonSelect.test.tsx
npx vitest run src/i18n/index.test.ts
```

Then run repository verification:

```bash
npm run lint
npm run typecheck
npm run check:i18n
```

## Manual scenario

1. Configure at least two providers so the dialog lists several models.
2. Open `/model`.
3. Confirm a `Search:` row sits above the list with the `type to filter…`
   placeholder, and that no model is filtered out yet.
4. Type `gpt`. Confirm only rows whose label, id, auth type, or runtime snapshot
   contain the text remain, the highlighted row moves to the first match, and
   the title shows `· <matched> / <total> models`.
5. Press Backspace. Confirm one character is removed and the list widens again.
6. Press Escape. Confirm the search clears and the dialog stays open; press
   Escape again and confirm the dialog closes without switching the model.
7. Type a phrase that matches nothing (e.g. `zzzz`). Confirm the dialog shows
   `No models match the search.` and Enter does not switch the model.
8. Clear the search and press a number key. Confirm it still jumps to that
   numbered row instead of entering the query.
9. Type a phrase starting with `j` or `k` (e.g. `json`). Confirm the cursor does
   not step down on each keystroke while typing.
10. Open `/model --advisor`, type a model name, and confirm the `Off` row drops
    out of the list; clear the search and confirm `Off` returns.

## Regression checks

- Opening the dialog without typing keeps the previous behaviour: every eligible
  model listed, the current model highlighted, numeric jumps working.
- Esc still closes the dialog on the first press when no search is active.
- The dialog still fits a short terminal: the visible-row cap accounts for the
  added Search row (`MODEL_DIALOG_FIXED_ROWS`), no clipping of the footer.
- Auxiliary modes (`--fast`, `--voice`, `--vision`, `--compaction`, `--image`)
  filter within their own eligible set and never leak ineligible models.
- An empty catalog still shows the "No models available for the current
  authentication type" notice, not the search row.

## Baseline status

Before this change the dialog had no Search row at all: `ModelDialog.tsx` passed
the full option list straight to `DescriptiveRadioButtonSelect`, and the only
way to narrow a long catalog was to scroll. The unit tests added with this change
pin the filtered counts and the key handling; the TUI steps above need a real
terminal and were not run in the authoring environment.

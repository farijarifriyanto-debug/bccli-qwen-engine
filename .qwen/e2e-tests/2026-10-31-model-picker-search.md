# Search in the `/model` picker (BCCLI layer)

## Automated verification

The picker is BCCLI source injected into the pinned engine chunk, so it is
verified against the packaged tree, not against `packages/cli`:

```bash
cd integrations/botconnector/candidate
npm run build
node --test test/model-dialog.test.mjs
node --test test/branding.test.mjs
```

Then build a package and confirm the overlay really rewrites the engine:

```bash
node integrations/botconnector/release/prepare-preview-ui.mjs --out /tmp/bccli-picker
mkdir -p /tmp/bccli-picker/x && tar -xzf /tmp/bccli-picker/botconnector-bccli-0.5.4-rc.1.tgz -C /tmp/bccli-picker/x
# from /tmp/bccli-picker: run prepareBrandedQwen('x/package/engine/cli-entry.js', {cacheRoot})
# and grep the patched startInteractiveUI chunk for:
#   function BccliModelPicker(props)      -> the picker is injected
#   🔎 Search model:                      -> the search row survives packaging
#   function UpstreamModelDialog(         -> auxiliary pickers keep upstream
```

## Manual scenario

1. Start `bccli` with a configured gateway key.
2. Open `/model`. Confirm the header reads `BCCLI | Select model` with
   `Search models (n/n)`, and the active model is marked `[ACTIVE]`.
3. Type `gpt` (plain typing starts the search). Confirm the list narrows, the
   counter drops, and the highlight sits on the first match.
4. Press Backspace. Confirm one character leaves the query and the list widens.
5. Press Escape twice. Confirm the first clears the query and the second closes
   the dialog without switching.
6. Search a phrase that matches nothing. Confirm `No models match the search.
   Backspace to adjust.` appears and Enter does nothing.
7. Search a real model, press Enter. Confirm the dialog closes, the header shows
   the new active model on the next open, and the next prompt answers from it.
8. Open `/model --fast`, `/model --vision`, `/model --compaction`. Confirm those
   still render the upstream picker unchanged (they delegate).
9. Stop the local gateway while the dialog is open, then pick a model. Confirm
   `Model selection was not saved` appears and the previous model is restored.

## Regression checks

- Without a search, the list is the full catalog in sorted order and arrows move
  one row per press.
- `/model <id>` typed as an argument still switches directly (command unchanged).
- The persisted selection survives a restart (gateway `/bccli/provider/switch`).
- Upstream auxiliary pickers keep their own eligibility rules and persistence.
- A branded cache from before this change is discarded on startup, because the
  output hash of the patched chunk changed.

## Baseline status

Before this change the primary picker was the upstream `ModelDialog`, which lists
every eligible model with arrow keys and a number jump and has no way to type a
name; `NOTES-0.5.4.md` described it as "arrow keys, type-to-filter", which the
shipped engine does not implement. The BCCLI provider picker already shipped a
search row, so this dialog reuses that proven pattern. The manual steps above
need a real terminal and were not run in this Windows authoring environment.

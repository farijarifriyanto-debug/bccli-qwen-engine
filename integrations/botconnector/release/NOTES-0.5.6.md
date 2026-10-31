# BCCLI 0.5.6 - persistence fix for the searchable model picker

Changes since 0.5.5:
- /model: a model chosen in the BCCLI picker now survives a restart. 0.5.5 only
  switched the live generator and recorded the choice with the gateway; it did
  not persist settings.model.name, so autoSelectStartup restored the stale
  model on the next launch. The picker now calls persistModelSelection (the same
  helper the upstream dialog uses) after a successful gateway record.
- The dialog hint now matches the actual key behaviour: Esc exits editing, then
  clears the search, then closes.
- Auxiliary pickers (--fast, --vision, --voice, --compaction, --image,
  --advisor) are unchanged and still delegate to the upstream dialog.

Test and release gates:
- Candidate: model-dialog.test.mjs 12/12 (10 existing + 2 new: persist on
  success, no persist on gateway failure). branding.test.mjs 3/3. Full suite
  unchanged at the single pre-existing upstream-feedback-sweep failure.
- End-to-end (WSL, tmux): picking deepseek-v4-pro leaves settings.model.name
  set to deepseek-v4-pro and a plain relaunch starts on deepseek-v4-pro.
- Engine unchanged: @qwen-code/qwen-code@0.26.3, BRAND_REVISION bumped to v19
  so a previously branded cache is rebuilt.
- New version 0.5.6 is distinct from immutable 0.5.5. GitHub release and npm
  publication remain separate manual steps.

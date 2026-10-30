# BCCLI 0.5.2-rc.8 — AGENTS.md as first-class project instructions

BCCLI now loads AGENTS.md as its **preferred project instruction file**.
It continues to load legacy QWEN.md files, with no automatic deletion,
rewrites or migration of existing user project instructions.

The command /init now creates AGENTS.md in the current trusted project
directory by default and asks for confirmation before replacing existing
nonempty instructions. If both AGENTS.md and QWEN.md exist, both are
included in the context filename list. BCCLI uses the ordered
AGENTS.md / QWEN.md preference whenever a single instruction filename
is required. Explicit user or project context.fileName overrides remain
supported by the engine.

Both AGENTS.md and QWEN.md are case-sensitive on case-sensitive file
systems. A singular agent.md is not the standard name and is not
auto-discovered by default. The version retains source attribution,
verified engine hashes and all features from RC.7: provider model picker,
Search Provider / Search Model, custom Add Provider, secured API key
dialogs, terminal native selection, and suppressed upstream feedback.

This prerelease is for end-to-end validation before npm promotion.

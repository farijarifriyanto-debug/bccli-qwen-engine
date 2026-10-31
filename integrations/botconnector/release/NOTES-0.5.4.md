# BCCLI 0.5.4 — interactive model picker and gateway-owned provider dialogs

Changes since 0.5.3:
- `/model` opens the pinned upstream interactive picker again (arrow keys, type-to-filter, `--global`/`--project`, one-off prompts). Before the engine starts, BCCLI publishes the active provider catalog into the per-provider `QWEN_HOME` as an OpenAI-compatible `modelProviders.openai` entry pointing at the loopback proxy, so only models the active key may use are listed.
- The model chosen in the picker is persisted by the engine and restored at startup, but only while the live catalog still offers it. A stale loopback picker endpoint from an earlier ephemeral proxy port is cleared.
- OpenTUI: `/provider` and `/auth` no longer open the upstream `AuthDialog`; they use the gateway-owned text flow (list, add, remove, select model). The Ink arrow-key picker is unchanged.
- `QWEN_HOME` and the trusted MCP config root follow `BCCLI_PREVIEW_HOME` (absolute path validated), so isolated test runs no longer write settings or accept MCP files from the real user profile. The default remains `~/.bccli-preview`.
- Runtime behavior is otherwise unchanged: `bccli-bootstrap.cjs` Node selection, isolated session settings, the pinned Qwen Code 0.26.3 engine, provider switching and the legacy SDK remain available.

Test and release gates:
- Unit tests: 140 pass, 1 skip (Node 22.23.4). On Windows Node 24.18.0 one CLI test stops at the existing runtime guard before its TTY check; it passes on Node 22.23.4.
- Integration tests: 9/11 pass. The two `web_fetch`/`web_search` cases fail identically on the `0.5.3` product baseline, so they are environment/model dependent, not a 0.5.4 regression.
- TUI parity and OpenTUI no-flicker gates pass, including the three-leg acceptance (Node+Ink, Bun+Ink, Bun+OpenTUI).
- Preview `0.5.4-rc.1` and stable `0.5.4` artifacts build and clean-install with the legacy SDK; no separate `@qwen-code` npm dependency is installed.
- Still manual before publication: one interactive TUI acceptance run with a real provider; live `web_fetch` verification; live `web_search` requires `BRAVE_SEARCH_API_KEY` in the parent BCCLI process and remains unverified here.
- New version `0.5.4` is distinct from immutable `0.5.3`. GitHub release and npm publication remain separate manual steps. Publish via the preconfigured GitHub OIDC trusted publisher on `farijarifriyanto-debug/bccli`, retain runtime source repo, commit and original SHA256 in npm provenance metadata, and do not claim npm published until public registry `latest` and the installed tarball pass.

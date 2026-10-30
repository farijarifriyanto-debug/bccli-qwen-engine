# BCCLI New Engine — release gate (30 October 2026)

## What is verified

- Rebrand remains a pinned view overlay over unmodified `@qwen-code/qwen-code@0.26.3`; no forked coding engine.
- Main Windows launcher `bccli` runs `0.1.0-rc.3`; separate `bccli-legacy` remains `0.4.17`.
- BCCLI candidate integration CI checks Windows Node 22/24; no paid inference is used.
- Offline candidate packaging script `node integrations/botconnector/release/prepare-next.mjs` produces `@botconnector/bccli@0.5.0-rc.2` with executable `bccli` and `publishConfig.tag=next`. It **never publishes**.
- RC.1 previously passed owner Windows fresh offline installation and the 4-platform CI matrix. RC.2 must independently pass the same fresh-install gate before publication.
- Native upstream Qwen `-r [SESSION_UUID]` argument passthrough is merged with offline tests; actual interactive TTY resume remains a manual release gate.

## Publication policy

**Do not publish to the `latest` npm dist-tag or replace `@botconnector/bccli@0.4.17`.** `0.5.0-rc.2` is an opt-in testing artifact until the gates below pass. Even `next` publication requires explicit release sign-off and npm registry permissions. No automatic publish step is part of this repository.

## Outstanding release blockers for stable BCCLI

1. **Native functionality visibility:** Qwen Code itself exposes `mcp`, `extensions`, `sessions`, ACP, daemon tools, hooks, and more. The current BCCLI launcher rejects several of these before invoking Qwen. Do not describe full native command parity or implement replacement engines; map safe original operations through the launcher, with security tests.
2. **SDK compatibility:** the original public package exports `dist/sdk.js` and declarations. The new CLI-only tarball does not. Existing SDK consumers must not be silently broken. An opt-in prerelease must disclose this incompatibility; stable release requires a compatibility decision and regression tests.
3. **Provider onboarding:** external API keys can be added in the BCCLI menu, but BotConnector Cloud currently relies on the legacy `bccli-legacy login bc-cloud` or environment variables. Direct BotConnector key entry within BCCLI remains a product requirement.
4. **Command parity:** verify real-TTY `-r` selection, `--output-format json`, `stream-json`, `--acp`, project-session resume, `mcp` management and extension flows against the upstream runtime. `-c` is supported; do not mistake it for `-r`.
5. **Default engine experience:** `--bare` currently suppresses implicit configuration discovery. Ensure tool, MCP, hook and extension behavior is presented truthfully and does not expose credentials; no unapproved removal of safety controls.
6. **Platform testing:** Windows Node 22/24 tested; extend fresh install and real TTY checks to supported Linux/macOS. On non-Windows, provider-key persistent storage currently requires environment variables.
7. **Live E2E:** controlled authenticated prompt -> tool proposal -> approval -> tool result -> session resume, provider/model switching, model identity, all using isolated test credentials / bounded spend only after approval.
8. **Licensing and delivery:** retain Apache-2.0 attribution and third-party notices, verify complete npm tarball, semver/dist-tag, rollback plan, documentation and CHANGELOG.

## Immediate next safe action

Maintain candidate `0.1.0-rc.3` and the stable `0.4.17` without overwriting user state. Verify the scripted `0.5.0-rc.2` archive and run prerelease tests in an isolated workspace. Promote via an explicit `next` prerelease workflow only after the remaining prerelease gates pass. Stable remains **HOLD** until SDK and feature parity are resolved.

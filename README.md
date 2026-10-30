# BCCLI Runtime

**BotConnector Coding Agent** — a multi-provider coding assistant for BotConnector Cloud and direct API providers.

This repository contains the next-generation **BCCLI runtime**. The public stable CLI source remains at [bccli](https://github.com/farijarifriyanto-debug/bccli), currently version 0.4.17. The new runtime is still a prerelease and must not silently replace the stable SDK.

## Install

Stable:

~~~sh
npm install -g @botconnector/bccli@latest
bccli
~~~

Preview (opt-in; check the npm dist-tag before installing):

~~~sh
npm view @botconnector/bccli dist-tags
npm install -g @botconnector/bccli@next
bccli
~~~

**Windows first run:** BCCLI lets new users enter a BotConnector Cloud API key in the terminal, with hidden input and Windows DPAPI protection. Use `bccli --choose` for provider/model selection, or `bccli provider add botconnector` to store a new key. Enter `1!` in the provider picker to replace a Cloud key. Linux/macOS currently require the `BOTCONNECTOR_API_KEY` environment variable for first-time Cloud authentication.

See the [install guide](integrations/botconnector/INSTALL.md) and [RC.5 release notes](integrations/botconnector/release/NOTES-0.5.0-rc.5.md).

## Repository structure

- `integrations/botconnector/candidate` — provider management, model selection, CLI, safe proxy, tests.
- `integrations/botconnector/release` — immutable npm tarball builder and release notes.
- `.github/workflows/bccli-*.yml` — Windows/Linux CI and prerelease publication gates.
- The upstream-sync `main` branch remains available separately; BCCLI changes are developed on the dedicated product release branch.

## Release status

RC.5 addresses direct Cloud key onboarding and maintains the upstream-backed 4-test integration gate. Full compatibility with the stable SDK, JSON/stream-JSON automation, legacy MCP and integrations, cross-platform credential persistence and interactive live scenarios remains **unverified**. Stable promotion is blocked until those tests pass or incompatible interfaces have an approved migration plan.

## Third-party engine and licenses

BCCLI uses a version-pinned, unmodified `@qwen-code/qwen-code@0.26.3` as an internal engine dependency, licensed under Apache-2.0. Retain [LICENSE](LICENSE), [third-party notices](integrations/botconnector/candidate/THIRD_PARTY_NOTICES.md) and upstream attribution. BCCLI is the client application; the answering AI's model identity is supplied by runtime metadata, not a forced persona.

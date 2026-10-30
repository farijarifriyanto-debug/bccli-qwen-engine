# BCCLI 0.5.0 — production CLI, one installation

This release packages the **new BCCLI coding runtime and the existing BCCLI 0.4.17 SDK/command-line compatibility implementation inside one `bccli` installation**. Users do not need a second executable, legacy installer, or renamed shell command.

## Install

Use the immutable GitHub release package:

~~~sh
npm install -g https://github.com/farijarifriyanto-debug/bccli-runtime/releases/download/bccli-v0.5.0/botconnector-bccli-0.5.0.tgz
bccli
~~~

The npm registry `@botconnector/bccli@latest` is **not** modified by GitHub release publication. Its dist-tag must be verified separately before calling `npm install -g @botconnector/bccli` a 0.5.0 installation.

## Features

- Default `bccli`: BotConnector Cloud or another provider, authenticated model selection, built-in `/model` and provider selection.
- First-run BotConnector API-key entry directly in Windows terminal, with hidden input and user-bound DPAPI protection. Existing bc-cloud login stays readable as fallback.
- Legacy `bccli mcp`, `connect`, `disconnect`, `integrations`, `login`, `update`, `serve`, `acp`, `plugins`, `stats`, `export`, `import`, `pr`, `completion` and other explicit legacy operations run through the included stable implementation. No extra launcher.
- Legacy non-interactive options including `--output-format json` and `stream-json` keep stable behavior; no prompt is silently converted into a billable model call.
- Published programmatic `runTask` / `streamTask` SDK exports and their declarations remain available.
- Locked provider HTTPS routes, ephemeral loopback proxy, default tool approval policy, and pinned, unmodified engine with third-party attribution.

## Compatibility caveats

- New-engine sessions use separate storage from the older CLI; existing user sessions are **not silently migrated**. Explicit legacy session export/import commands continue to operate on the old storage.
- On Linux/macOS, the new provider menu requires API keys supplied through provider environment variables; protected interactive persistent storage is currently Windows-only.
- The compatibility SDK and commands retain the 0.4.17 implementation. Those operations do **not** silently become the new engine.
- macOS, Linux and Windows, Node.js 22/24 are verified during CI. Windows Node.js 24 versions before 24.22.1 can cause an upstream tool-loop crash and are blocked.
- Provider API use and BotConnector plans can incur charges. No paid test is part of the release matrix.

## Provenance

The legacy compatibility payload is the exact publicly released `@botconnector/bccli@0.4.17` npm archive, SHA-512 integrity-pinned during packaging. The underlying engine dependency is the unchanged `@qwen-code/qwen-code@0.26.3` under Apache-2.0; legacy BCCLI includes its MIT license. Neither upstream license nor copyright notices have been removed.

GitHub stable package includes SHA256SUMS for offline verification.

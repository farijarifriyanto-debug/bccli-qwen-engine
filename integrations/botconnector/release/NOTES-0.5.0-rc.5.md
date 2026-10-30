# BCCLI 0.5.0-rc.5 — first-run BotConnector Cloud onboarding

**Preview release, not stable.** Existing npm `@botconnector/bccli@latest` remains `0.4.17`.

## Included changes

- First-run BotConnector Cloud API-key input directly from the BCCLI provider menu on Windows (user-bound DPAPI encryption).
- `bccli provider add botconnector`, `bccli --choose` and the `1!` replacement option no longer require the legacy CLI.
- The interactive menu checks authenticated model availability and the selected model **before** writing replacement credentials. Invalid replacement keys leave existing keys untouched.
- `bccli auth status` recognizes protected Cloud keys without displaying secrets. Existing `bc-cloud` credentials and `BOTCONNECTOR_API_KEY` still work as fallback.
- Repository naming and package metadata identify BCCLI Runtime as the product; licensing and technical engine attribution remain intact.
- RC.5 builds an immutable tarball with SHA-256, Windows/Linux Node 22/24 CI and a clean installation test.

## Known limitations (stable-release blockers)

The current engine wrapper does not yet prove parity with BCCLI 0.4.17 SDK imports, full JSON/stream-JSON headless output, legacy MCP management, integrations and all original commands. Do not silently upgrade SDK consumers or use this as a drop-in stable release. Linux/macOS credential persistence still relies on environment variables. Native interactive TTY workflows and full end-to-end live billing/approval need separate acceptance.

## Opt-in installation

After the npm `next` dist-tag is independently verified:

~~~sh
npm install -g @botconnector/bccli@next
bccli
~~~

Node.js 22+ is required. Windows Node.js 24.18.0 is blocked for a known upstream tool-loop crash. Engine dependency is unmodified `@qwen-code/qwen-code@0.26.3` with Apache-2.0 attribution and third-party notices.

The GitHub prerelease is published with `botconnector-bccli-0.5.0-rc.5.tgz` and `SHA256SUMS.txt`; GitHub Actions **does not publish to npm**.

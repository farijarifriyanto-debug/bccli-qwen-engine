# BCCLI new engine 0.1.0-rc.3 — interactive provider and model selection

**Private preview on the owner's Windows machine, not a stable npm replacement.**
The public npm package `@botconnector/bccli@0.4.17` remains installed and unchanged.
This GitHub prerelease ships the isolated `@botconnector/bccli-preview` package,
which the owner's Windows `bccli` launcher can opt to run. The original
`bccli` launchers are backed up and available as `bccli-legacy`.

## User flow (inside one BCCLI terminal)

```
bccli
  -> BCCLI | Provider dan model
  -> choose BotConnector, OpenAI, OpenRouter, DeepSeek, Groq or xAI
  -> if missing: enter API key with hidden characters
  -> authenticated model list; choose model by number, ID or ?keyword
  -> new BCCLI coding-agent TUI
  -> /model switches model inside the same provider
  -> /provider or /auth switches back to the BCCLI parent menu
```

In-session switching is a controlled exit (dedicated code 51) from the
upstream Qwen user-interface slash handler, followed by a provider
selection handled by the **parent BCCLI launcher**. The launcher
restarts the coding UI with the selected provider. This is a *new engine
session*, not an instant provider swap inside the live model call.
When staying on the same provider, the launcher requests session
continuation; switching provider never reuses the other provider's
session history.

## Security and compatibility

API keys are handled exclusively by the launcher. On Windows, new
non-BotConnector keys are encrypted via user-bound Windows DPAPI.
The Qwen process gets only an ephemeral loopback proxy bearer token;
it cannot access raw provider keys from the launcher. Provider
destinations are fixed HTTPS presets. Real key input never appears in
the model prompt, terminal echo or tool arguments. The old BotConnector
`~/.bccli/credentials` file is read-only and reused.

The active provider's direct API may incur its own charges. The
initial provider/model picker only reads the authenticated model
catalog; it does not issue a paid chat request.

The new engine does NOT yet provide complete feature parity with
legacy `bccli 0.4.17` (including `-r` legacy session selection,
public SDK, JSON/stream-JSON automation and all integrations).
Use `bccli-legacy` for existing workflows that require these.
The public npm `latest` tag must not be replaced before parity.

## Validation, publish, rollback

- Unit/security tests cover provider key encryption and the parent
  startup menu, provider choices, missing-key handling, and the
  real pinned upstream slash-command alias. CI on Windows Node 22/24.
- Upstream-backed tests cover read-only tools, denial of unapproved
  edits, session resume and BCCLI branding without real paid API calls.
- Distributed as GitHub prerelease `bccli-new-v0.1.0-rc.3`,
  with npm tarball and SHA-256 checksum, **not** npm stable.
- Windows override: `%APPDATA%\npm\bccli.ps1` and `bccli.cmd`
  point to isolated `%LOCALAPPDATA%\BotConnector\BCCLI-Preview`
  which bundles Node22. The original shims are preserved as
  `bccli-legacy.ps1` and `bccli-legacy.cmd` plus backup copies.
- To roll back on the owner's laptop, copy the saved original shims
  from `%LOCALAPPDATA%\BotConnector\BCCLI-Preview\backup` back
  to `%APPDATA%\npm`. The installed npm package is never removed.

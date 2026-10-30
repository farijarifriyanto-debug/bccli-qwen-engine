# BCCLI Preview 0.1.0-rc.2 — multi-provider API keys

**Preview release, not a replacement for stable BCCLI.** Executable:
`bccli-preview`, package `@botconnector/bccli-preview` (`private:true`
for no accidental npm registry publication). Public `bccli` stays unchanged.

## What's new

- `bccli-preview provider list` — show preset providers, active provider and
  whether a key is available; never show key text
- `bccli-preview provider add openrouter` — hidden API key prompt, Windows
  DPAPI-encrypted key at `~/.bccli-preview/provider-openrouter.dpapi`;
  selects this provider for new sessions only
- `bccli-preview provider use botconnector` — switch active provider;
  `provider remove openrouter` — delete only preview's stored OpenRouter key
- `bccli-preview models --provider openrouter` — query direct provider's
  authenticated catalog; `bccli-preview chat --provider openrouter --model MODEL`
- Presets: `botconnector`, `openai`, `openrouter`, `deepseek`, `groq`,
  `xai`. Only their fixed HTTPS API endpoints are allowed. API URLs cannot
  be supplied by prompts, project configs or provider settings.
- On non-Windows systems, use preset environment variables such as
  `OPENROUTER_API_KEY` or `OPENAI_API_KEY` rather than persistent DPAPI.
- The real provider API key never goes to Qwen's subprocess/tools/MCP;
  per-session loopback proxy receives an ephemeral bearer token. External
  provider chats use separate Qwen session homes to prevent accidental
  cross-provider history disclosure; BotConnector Preview session home remains
  unchanged.

## Usage (new PowerShell terminal)

```powershell
bccli-preview provider list
bccli-preview provider add openrouter
# Paste key into the hidden prompt, press Enter.
bccli-preview models
bccli-preview chat --model openai/gpt-4.1-mini
# Or explicitly choose another provider without changing the active one:
bccli-preview models --provider botconnector
bccli-preview provider use botconnector
bccli-preview chat --model ling-3.0-flash
```

**Choose a model from the actual `models` output**, as available model IDs
vary by provider and access; the example OpenRouter ID is illustrative, not
a confirmed catalog result. Provider billing and data-handling terms apply
for requests sent directly to that provider.

The `/model` command inside chat changes the active model **within the
currently selected provider only**. To change providers, exit the chat,
run `bccli-preview provider use PROVIDER`, then start a new chat. Never
change the provider of a resumed conversation.

## Security and rollback

No key is accepted as a CLI argument. Windows key prompts do not echo input;
provider keys are stored using Windows DPAPI encryption for the current Windows
user, not plaintext JSON or project config. `provider list` reports
presence only. Changing or deleting preview provider keys never touches
the public BCCLI `~/.bccli/credentials` file.

The preview binary and versioned tarball remain separate from the public
`bccli` executable. To roll back, reinstall the previous
`bccli-preview-v0.1.0-rc.1` GitHub prerelease package; the public
`@botconnector/bccli@0.4.17` is unaffected. Remove a provider key using
`bccli-preview provider remove PROVIDER`.

Provider endpoints are included as fixed presets, not live-verified in the
unit tests. No real non-BotConnector credentials or paid inference are used
for CI. Do not promote this release to `latest` until legacy BCCLI parity
and privacy/retention requirements are independently satisfied.

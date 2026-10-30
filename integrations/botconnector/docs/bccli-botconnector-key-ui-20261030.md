# BCCLI P0 — BotConnector Cloud API Key Directly in New CLI

Date: 30 Oct 2026. Scope: private RC.3 candidate only. Public npm `@botconnector/bccli@0.4.17`, original Windows launchers and legacy credentials stay untouched.

## Owner experience

- `bccli` → choose **BotConnector Cloud** → if no key is configured, paste the API key into a hidden terminal input → choose a live model → coding agent starts.
- Choose **1!** to explicitly replace the BotConnector API key. A cancelled or empty input does not save anything or change the active provider.
- `bccli provider add botconnector` offers the same hidden input flow in new BCCLI; `bccli auth status` recognizes the new encrypted store.
- Existing BotConnector Cloud logins in `~/.bccli/credentials` are used as a **read-only fallback** if no BCCLI new-engine encrypted key exists. No migration, deletion, or modification of that file.
- The new key takes priority over an existing legacy key or an inherited `BOTCONNECTOR_API_KEY`; if the new encrypted file is malformed/unreadable, do not fall back silently.
- The new key is stored only at `~/.bccli-preview/provider-botconnector.dpapi` on Windows using per-user DPAPI. On other platforms, existing environment/legacy credentials continue to work; persisting new keys requires an OS-specific secure backend before cross-platform release.

## Security invariants

Real API keys remain in parent BCCLI. Only an ephemeral proxy token reaches the coding engine and its tools. Preset Gateway HTTPS destination stays pinned, with explicit MCP trust and default tool approvals. Invalid encrypted key files and symlinks are rejected. `provider remove botconnector` remains deliberately blocked: removing credentials from an older BCCLI installation requires a separate explicit migration/safety design.

## Validation

- Isolated Windows staging 12/12 credential/provider/UX tests PASS, including real Windows per-user DPAPI encryption/decryption of a **fake** BotConnector key.
- Mocked tests prove legacy key file is byte-for-byte unchanged after enrollment and replacement, show no real key in terminal output, and fail closed on corrupt encrypted data.
- No paid AI prompt, Gateway/billing change, npm publish or active Windows launcher modification.
- GitHub Windows Node 22/24 full candidate CI and authenticated end-to-end key entry remain separate gates; stable publication is HOLD.

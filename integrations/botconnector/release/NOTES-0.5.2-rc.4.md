# BCCLI 0.5.2-rc.4 — Manage API keys securely in chat, switch provider/model and native Windows mouse selection

**Preview / canary only.** Does not change `@botconnector/bccli@latest` (0.5.1) or the user's global CLI.

This addresses the regression where 0.5.1 reverted the default interactive terminal to the older BCCLI Ink layout. The candidate restores the 0.5.0 new terminal UI, startup provider/model picker, branded banner, interactive /model and /provider commands, and coding-agent tool workflows.

## How the package works

The original unmodified `@qwen-code/qwen-code@0.26.3` upstream engine npm tarball is checked against the published SHA-512 integrity and vendored as `engine/` within the BCCLI package. Its Apache-2.0 license, source credits and original package metadata remain intact. The BCCLI UI overlay retains strict, pinned source-file hashes.

**The published package has no `@qwen-code/*` npm dependencies.** npm will therefore not try to install the upstream optional `@qwen-code/audio-capture` package or execute its install hook. This is not a claim that BCCLI no longer contains upstream Qwen Code-derived code; the *underlying licensed engine* is still included. Audio-capture functionality dependent on the omitted optional module is not part of this preview.

The existing stable BCCLI 0.4.17 SDK and legacy commands remain inside the same installation, with no separate executable. Its original MIT license is included.

## Windows preview

Download `botconnector-bccli-0.5.2-rc.4.tgz` from the GitHub prerelease, then install in a separate directory to avoid changing the working global CLI:

```powershell
mkdir "$env:TEMP\bccli-newui-preview" -Force
npm install --prefix "$env:TEMP\bccli-newui-preview" "PATH-TO-TGZ" --no-audit --no-fund
& "$env:TEMP\bccli-newui-preview\node_modules\.bin\bccli.cmd" --version
& "$env:TEMP\bccli-newui-preview\node_modules\.bin\bccli.cmd" --choose
```

Users must use Node.js 22.23.4+ or Node 24.22.1+ on Windows to avoid the previously verified upstream runtime crash.

## Verified preview gates

- SHA-512 for upstream engine and BCCLI 0.4.17 SDK source.
- Windows local installation of preview tarball: CLI returns `0.5.2-rc.4`, dependency graph for `@qwen-code/*` empty, no `allow-scripts` audio warning.
- Real Windows ConPTY probe (not a screenshot mock): provider chooser, model chooser, large BCCLI banner, new chat input field and /model hint all rendered, with **no paid prompt**.
- Source integration tests and CI are required before advancing beyond preview.
- Next stable release requires explicit feature/behavior parity and test of a coding-agent tool approval path; never promote merely on branding alone.

## Manage API keys without leaving BCCLI

In the same chat, use \`/provider\` for the provider list, \`/provider add openrouter\` to open the masked Windows password dialog, \`/provider replace openrouter\` to replace the stored key, or \`/provider remove openrouter\` to open a delete-confirmation dialog. Numeric choices such as \`/provider add 3\` are accepted. Choosing a provider that has no saved key (for example `/provider openrouter` or `/provider 3`) automatically opens the secure password dialog, then shows available models after validation. These operations never make an AI chat prompt and the password is never entered into the chat text box. No separate PowerShell window is required.

The local proxy receives only a provider ID and opens a native Windows secure input dialog. The key stays with the parent process and is stored via the per-user DPAPI encryption in the existing BCCLI Preview credentials directory. New credentials are checked via the selected provider's HTTPS \`/models\` endpoint before replacing the old key. Invalid/cancelled input keeps the existing key unchanged. Removing the active key disables further model requests on that route and never revokes a remote provider key; keys set via environment variables or inherited legacy login may still exist and are not deleted. If an active response is running, key management is rejected until it finishes.

On Linux/macOS, the preview currently supports provider environment variables rather than interactive persistent key dialogs. The interface will report that limitation; it will not pretend to store credentials.

## Switch providers without exiting the chat

Use \`/provider\` to list available providers. Use \`/provider openrouter\` (or \`/provider 3\`) to view its model list. Use \`/provider openrouter MODEL_ID\` (or \`/provider 3 5\`) to select a valid provider/model pair **in the current chat, with no restart**. The existing tool approvals, chat memory, and terminal remain open. Only the next model request is sent through the new provider, and the active model is updated in the terminal.

The short-lived localhost proxy manages an allowlisted upstream endpoint and stored provider keys; the coding agent sees only a short-lived proxy token. Provider catalogs are validated before switching. This changes which provider will bill future usage. Providers without keys cannot be selected; configure their keys separately using \`bccli provider add PROVIDER\`, then switch from the existing chat. Never paste keys into the chat.

## Windows Terminal mouse selection and copy

The BCCLI-branded Ink renderer defaults to the main terminal screen on Windows; it no longer enters alternate-screen mode or captures mouse reporting. **Drag the mouse to select visible and older chat text**, use the terminal scrollbar or scroll wheel, and copy with **Ctrl+Shift+C**. This preserves the standard Windows Terminal scrollback. The banner, provider/model picker and keyboard tool approval UI remain available.

Set `BCCLI_ENABLE_APP_MOUSE=1` only to restore the experimental prior in-app virtual buffer/mouse interactions. Do not set it when you need normal Windows Terminal selection. Other OSes preserve existing behavior. This is a terminal compatibility change, not a provider or billing change.

## State and privacy

Existing BCCLI 0.5.1 files and the 0.5.0 preview's protected credentials are not automatically migrated or deleted. User API keys stay in the owner-managed credential store or per-user Windows DPAPI storage. The provider proxy supplies a separate short-lived local token to the bundled engine.

Changes are confined to the release builder, bundled engine path resolution, owner-writable branding cache and truthful product help. The upstream source archive is not altered.

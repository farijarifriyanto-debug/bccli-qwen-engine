# BCCLI 0.5.2-rc.9 — Safe bare-mode file tools

The prior BCCLI coding agent used the upstream engine's bare-mode
tool allowlist. This exposed only four core file/shell tools and
goal management, leaving the AI without safe file search or creation.

RC.9 restores the bundled built-in write_file, glob and grep_search
to the bare-mode allowlist. The existing read_file, edit, notebook_edit
and run_shell_command remain available. The default approval mode
is preserved: allowing a tool to be described to the model never
automatically authorizes arbitrary file writes.

Security is unchanged: --bare continues to prevent project settings
from overriding AI endpoints, permissions, hooks and MCP discovery.
No YOLO mode, credential exposure, or unrestricted remote access
is enabled.

The system-level tool usage guidance prioritizes glob, grep_search,
read_file, edit/write_file, and test-verified completion.

Additional fix: isolated bare mode previously did not load AGENTS.md despite
RC.8 setting its preferred filename. BCCLI now explicitly registers the
current workspace via --include-directories, allowing AGENTS.md to be
included in the model context while keeping implicit project configuration,
hooks, credential overrides and MCP auto-discovery disabled.
The selected provider/model identity remains independent of the app.

Remaining work from the user tool contract:
atomic apply_patch, structured run_tests, diagnostic LSP,
secret_get / remote_exec with separately approved profiles,
sandbox_exec, browser_e2e, git_op, and notifications.
Do not treat these as implemented.

The release remains a GitHub prerelease pending tests and live
Windows approval-gate confirmation. Legal upstream notices retained.

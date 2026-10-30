# BCCLI New Engine — P0 Native Session Picker and ACP (30 Oct 2026)

**Scope:** isolated RC.3 candidate; public BCCLI 0.4.17, production Gateway and local owner launchers unchanged.

## Implemented

- `bccli -r` or `bccli --resume`: user picks provider/model first (unless a model was supplied), then the upstream engine's native session picker opens.
- `bccli -r UUID`: requests that specific native session in the selected provider's session directory. Session ID must be a UUID; arbitrary paths and malformed tokens are rejected before a model request.
- Existing `bccli -c` still maps to native `--continue` and does not change semantics.
- `bccli acp --model MODEL [--provider ID]`: direct native ACP mode over stdio. ACP skips the human BCCLI banner so stdout can be used for protocol frames. ACP does not silently select credentials or prompt in an editor protocol stream.
- Keep `--bare`, `--approval-mode default`, explicit owner MCP configuration and fixed provider HTTPS routes. The original provider key remains in the parent launcher; only an ephemeral loopback proxy bearer token is passed to the agent.
- Session state is scoped to `~/.bccli-preview` for BotConnector and `~/.bccli-preview/sessions-PROVIDER` for preset providers. Legacy `~/.bccli` data is never overwritten, parsed or imported.

## Safety / scope limits

- ACP requires an already-configured provider; external providers require explicit `--model` in this phase.
- `-r` requires an interactive terminal. ACP requires protocol input over stdin.
- `-r` does **not** import BCCLI 0.4.17 session JSONL; that is a separate compatibility/migration task.
- The wrapper uses the upstream's native session picker; owner Windows TTY interactive acceptance and an external editor ACP handshake are **not yet fully validated** by the local unit tests.
- Provider switch after an interactive session resets a `-r` selection and starts a clean or same-provider continuation; it must not resume a session from another provider.
- No provider payment call, npm publish, stable version bump, local launcher replacement or production deploy is part of this patch.

## Evidence

- Source and installed upstream v0.26.3 `--help` advertise `--resume [ID]` and `--acp`.
- On the owner's Windows machine, existing BCCLI new-engine sessions include UUID-named records.
- Offline staging syntax PASS and 19/19 tests PASS, including argument ambiguity, UUID validation, protected credential forwarding, default tool approvals and per-provider session isolation.
- Offline upstream ACP initialize handshake PASS on Windows Node 22.23.4 using a dummy key and loopback endpoint: valid JSON-RPC response with `protocolVersion: 1`, no stdout contamination, no stderr errors, no paid calls. This validates the upstream ACP mechanism; full BCCLI-editor integration remains unverified.
- Candidate Windows Node 22 and Node 24 GitHub Actions required before approval; release remains HOLD.

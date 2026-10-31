# BCCLI 0.5.2-rc.7 — Product Identity Sweep and Upstream Survey Suppression

This preview fixes the feedback prompt captured on Windows Terminal as
“How is Qwen doing this session? (optional)”. That survey belongs to the
vendored upstream coding engine, not to the BotConnector product.

**BCCLI disables automatic upstream feedback prompts** so no legacy-brand
survey covers the terminal or is incorrectly presented as BCCLI feedback.
The message key and English translation are also rebranded as a defense
against accidental display. Diagnostics, tool notifications and user-facing
permission strings receive additional targeted branding updates. Each
edited UI and English localization bundle remains source-SHA256 pinned and
the bundled engine is still integrity-verified before launch.

The original upstream source, license notices and /about credits retain
accurate attribution, including Qwen Code and Apache-2.0 licensing.
Provider/model names are not altered. BCCLI still uses an independently
bundled, integrity-pinned engine; no @qwen-code npm dependencies or
optional audio-capture install scripts are introduced.

The sweep also covers pinned update hints, agent commands, PR attribution,`nemail agent labels, service help, extension notices, and background session descriptions. The source chunks and licenses remain integrity-pinned.`n`nAll RC.6 functionality is retained: native Windows Terminal mouse
selection, arrow-key provider/menu navigation, visible Search Provider and
Search Model controls, + Add Provider custom HTTPS registration,
Ollama Cloud and additional provider presets, encrypted per-user DPAPI
credentials and secure add/remove key dialogs.

This is a GitHub prerelease for human validation of the actual Windows
Terminal UI. It does not publish npm latest or modify users' global BCCLI.

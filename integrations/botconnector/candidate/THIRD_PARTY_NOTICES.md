# BCCLI Candidate — Third-party attribution

BCCLI / BotConnector candidate launcher and Gateway adapter are maintained for BotConnector by BICO Inovasi Digital.

This candidate uses **Qwen Code** (`@qwen-code/qwen-code@0.26.3`) as an upstream coding-agent engine. The upstream code and contributor notices remain subject to the **Apache License, Version 2.0**. The original upstream project's source and notices are available at https://github.com/QwenLM/qwen-code.

The candidate keeps the installed upstream npm dependency unchanged. At runtime it creates an isolated, pinned, SHA-verified copy of selected upstream compiled files for BCCLI terminal branding. This is a modified UI/runtime copy, not a claim of original authorship of the upstream engine. Keep relevant upstream copyright notices, the supplied LICENSE, and the dependency's own license/notice files when redistributing.

The model producing an answer is the actual model selected via BotConnector Gateway; BCCLI is the client application, not the AI model. Vendor/source attribution is available under `/about credits` rather than forced into the AI's self-description.

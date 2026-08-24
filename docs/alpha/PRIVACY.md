# Alpha Privacy and Security

## Research data

- Normal project data and deterministic statistics stay on the local computer.
- There is no implicit telemetry or automatic diagnostic upload.
- Diagnostic export excludes raw measurements and identifying labels/notes by default.
- Contextual Help uses a local deterministic glossary. No cloud LLM provider or API key is configured.
- Any future external Help provider must be opt-in and disclose the minimal structured context before first use. Raw measurements remain excluded by default.

## Evaluation isolation

- Evaluation mode requires both a development build and an explicit environment flag.
- The browser receives only a same-origin evaluation path; the bearer token remains in the Vite proxy process.
- The bridge binds to loopback, checks exact Origin and bearer token, limits request size, and stores blind packages outside the repository.
- Bridge responses do not expose server filesystem paths or authentication tokens.
- Cloudflare tunnel commands are development scripts and are not invoked by the production application.

## Desktop boundary

- Tauri capabilities allow core window behavior and explicit open/save dialogs only.
- A restrictive WebView CSP is configured.
- The local Python/packaged sidecar receives validated analysis requests through the Tauri command boundary.
- Diagnostic writing requires a user-selected absolute `.json` path, valid JSON, and a 1 MB limit.

## Alpha checklist

- [x] No automatic telemetry
- [x] No production evaluation activation
- [x] No token in ordinary UI
- [x] No server path in evaluation responses
- [x] Diagnostic default excludes raw data, labels, notes, paths, and secrets
- [x] External LLM Help disabled; provider-neutral opt-in boundary only
- [x] Tauri permission list reviewed
- [x] CSP enabled
- [ ] Release-bundle forbidden-string scan automated on every packaging CI run
- [ ] External security review before public distribution

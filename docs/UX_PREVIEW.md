# Browser UX preview

## Purpose

This workflow temporarily exposes only the built Web UI for browser-based UX review. It is not a production deployment and does not replace the Tauri desktop application.

The preview intentionally uses a production-style static build rather than exposing the Vite HMR development server. This prevents Vite development endpoints and workspace source modules from being reachable through the public URL.

## Selected mechanism

Use a Cloudflare Quick Tunnel (`trycloudflare.com`) from a loopback-only static preview server.

- no Cloudflare account, DNS change, token, or inbound firewall rule;
- a random HTTPS URL exists only while `cloudflared` is running;
- only `127.0.0.1:4173` is used as the tunnel origin;
- no GitHub push, release, cloud storage, or application backend;
- the URL can be opened from an external browser without local-network access.

Quick Tunnels have no SLA, a 200 concurrent-request limit, and no authentication. The generated URL must be treated as a temporary bearer link.

## One-time setup on macOS

Install the official `cloudflared` binary:

```bash
brew install cloudflared
```

No tunnel credentials or secrets are stored in this repository.

## Start a review session

From the repository root, use two terminals.

Terminal 1 — build and serve only `apps/ui/dist` on loopback:

```bash
pnpm preview:ux
```

Terminal 2 — create the temporary HTTPS URL:

```bash
pnpm preview:tunnel
```

Copy the printed `https://...trycloudflare.com` URL into ChatGPT Work. Keep both processes running during review.

This static UX preview deliberately has no Python statistics. For external AI benchmark runs that
must execute the real engine, use `pnpm dev:evaluation` plus `pnpm evaluation:tunnel` as documented
in `docs/BENCHMARK_EVALUATION_INFRASTRUCTURE.md`; do not use `preview:ux` for that purpose.

After a code edit, stop Terminal 1 with `Ctrl+C` and rerun `pnpm preview:ux`. The tunnel process and URL can remain running; reload the external browser after the build is available again. No remote deployment is created.

## Stop and disable

Press `Ctrl+C` in the tunnel terminal. The random URL then stops working. Stop the local static server with `Ctrl+C` in its terminal. No daemon, login, DNS record, or permanent public route remains.

## Browser-preview isolation

When the UI is not running inside Tauri, the application visibly enters **ブラウザUXプレビュー** mode.

- the New experiment screen exposes the normal manual flow as a browser-only temporary review
  project (Phase A), without pre-filling its design;
- deterministic complex proportion and nested Cell/ROI fixtures remain available as shortcuts
  (Phase B);
- native project Save / Save As is disabled;
- local project opening cannot access a file dialog or filesystem;
- the Python statistical sidecar is not reachable;
- Tauri commands, native package storage, and OS integration are unavailable;
- a persistent banner explains these limitations;
- manual preview projects and synthetic fixtures retain a prominent browser-review marker.

The fixtures cover multiple experiment sessions, repeated parent condition attributes, treatment −/＋, multiple time points, numerator/eligible percentages, missing and not-planned cells, long labels, nested Cell/ROI observations, experiment summaries, and layered graphs.

## Security assumptions and remaining risks

- Never paste or enter unpublished data into the public preview URL.
- Do not share the URL beyond the intended reviewer. Quick Tunnels provide TLS but no user authentication.
- Anyone who obtains the random URL while the process is running can view and interact with the synthetic UI.
- Browser requests and standard connection metadata pass through Cloudflare. No research data should be present.
- The static server is bound to loopback and the tunnel uses an outbound connection; no arbitrary port or global firewall setting is opened.
- Only compiled static assets in `apps/ui/dist` are served. Repository documents, environment files, project packages, and local filesystem paths are not served by this workflow.
- Stop the tunnel immediately after review. A new run normally receives a new random URL.

If access control or a stable hostname becomes necessary later, use a named Cloudflare Tunnel protected by Cloudflare Access. That additional account and authentication infrastructure is deliberately out of scope for this temporary review workflow.

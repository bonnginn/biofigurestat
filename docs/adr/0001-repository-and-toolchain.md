# ADR 0001: Repository and toolchain

Status: accepted for Phase 1.

## Decision

Use a pnpm workspace with React/TypeScript/Vite for the shared UI and Tauri v2 for the desktop shell. Domain packages remain framework-independent. Rust code is restricted to desktop integration and does not own statistical or project semantics.

## Boundaries

- `apps/ui`: React application.
- `apps/desktop`: Tauri shell and OS integration.
- `packages/*`: stable TypeScript contracts and shared logic.
- `engine/*`: versioned local statistical processes.

Windows and macOS share the same UI and domain logic. OS-specific behavior is limited to files, clipboard/export, updater, and engine lifecycle.

## Consequences

Tauri development requires Rust and platform prerequisites. Web build/test can proceed before the Rust toolchain is installed, but a desktop milestone cannot be accepted until both target operating systems have built and opened the app.

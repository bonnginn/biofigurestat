# ADR 0006: Phase 1 directory-package adapter

Status: accepted for the first native save/open round trip.

## Decision

Use a directory-backed `.lsa` package for the first native implementation. The TypeScript `project` package continues to own manifest validation, checksums, and package semantics. Rust provides only the OS adapter: contained relative-path reads and staged directory replacement.

A save writes a new sibling staging directory, requires `manifest.json`, preserves an existing target as a sibling backup, renames the completed staging directory into place, and restores the previous target if replacement fails. Rollback removes only the transaction's explicit staging directory.

## Boundaries

- UI code must not write project files directly.
- Rust must reject absolute, parent-traversing, and backslash package paths and must not resolve reads outside the selected package.
- The adapter does not invent project contents or bypass manifest/checksum validation.
- A validated package is not considered fully loaded until its relational state has been rehydrated into the application workspace.

## Deferred decision

Zip-compatible single-file transport remains deferred until populated-project size and save-time benchmarks exist. The manifest and recovery schema remain transport-independent.

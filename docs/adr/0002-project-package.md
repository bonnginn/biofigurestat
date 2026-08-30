# ADR 0002: Transparent project package

Status: accepted for contract development; archive transport details remain provisional.

## Decision

A project is a versioned transparent package containing a manifest, SQLite state, original/imported raw sources where available, a canonical raw export, assets, and checksums. The package is saved atomically and migrated explicitly with a pre-migration backup.

## Required invariants

- Raw measurements remain recoverable without running the application.
- User edits create revisions and provenance events rather than erasing history.
- Derived data and analysis results reference exact upstream revisions.
- A save is validated before replacing the last good project.
- `Open project`, `New from design`, and `Save as Favorite` have distinct data-copy semantics.

## Deferred decision

Whether `.lsa` is a directory package or zip-compatible single-file transport will be benchmarked after the first save/open round trip. The internal manifest and recovery contract do not depend on that choice.

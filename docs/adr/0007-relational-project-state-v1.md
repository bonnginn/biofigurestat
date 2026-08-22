# ADR 0007: Relational project state v1

Status: accepted for the first populated-project round trip.

## Decision

Persist the validated `ProjectState` contract in SQLite migration `0001_initial.sql`. The database stores project metadata and active revision pointers plus ordered relational records for design revisions, raw revisions, unit instances, observations, analysis runs, graph records, and provenance events.

The TypeScript `project` package owns runtime validation and lifecycle semantics. Rust is a local SQLite codec and OS adapter; it must not choose statistical methods, reinterpret units, or silently migrate an unknown schema.

## Integrity rules

- Raw revisions are immutable and linked through `previousRevisionId`.
- Observation identity is unique within a raw revision; historical revisions may retain the same stable observation ID.
- Unit identity is stable across revisions and its definition cannot silently change.
- Analysis runs name the exact input raw revision. A run over an older revision cannot be `current`.
- Graph records name their source analysis run and inherit stale state when upstream raw data changes.
- The recovery CSV exports the active raw revision and retains proportion numerator and denominator, not only a derived percentage.
- SQLite `user_version` is explicit. Unknown versions stop opening rather than receiving an implicit migration.

## Package boundary

`project.sqlite` is one checked payload inside the transparent directory package. `manifest.json` and `raw/exports/canonical.csv` remain readable without SQLite tooling. Package checksum validation occurs before relational rehydration.

## Deferred work

QC revisions, derived datasets, migrations beyond v1, pre-migration backups, and populated-project edit sessions will extend this schema without rewriting historical raw records.

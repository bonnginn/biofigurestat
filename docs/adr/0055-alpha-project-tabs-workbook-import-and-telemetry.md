# ADR 0055 — Alpha project tabs, workbook import, and remote usage telemetry

Date: 2026-08-30
Status: Accepted with deployment gate

## Context

Public Alpha needs familiar file handling without weakening atomic `.lsa` persistence or the
local-first research-data boundary. Researchers also requested direct Excel workbook import and
explicitly consented product-usage feedback.

## Decision

### Project tabs

The Alpha tab strip is a disk-backed list of saved `.lsa` targets. Exactly one project is loaded into
the active React workspace. Selecting another tab reopens that target through the same validated
project reader. Dirty work must pass the shared Save / Discard / Cancel guard before switching or
closing. Tabs do not create hidden in-memory copies and do not change the project schema.

### XLS/XLSX import

The native shell reads `.xls`, `.xlsx`, `.xlsm`, and `.xlsb` through the Rust `calamine` adapter and
passes rectangular worksheet values to the existing spreadsheet surface. The adapter enforces file
and cell limits, preserves internal blank cells, exposes sheet choice, and records the result as a
generic file import. Formula code is never executed. Cached values stored by Excel are imported and
the user is told how many formula cells were present; BioFigureStat does not recalculate them.

### Remote usage telemetry

Research data and researcher-entered text remain local. Remote telemetry requires all of:

1. an explicit fresh opt-in under a `remote-*` notice;
2. a credential-free HTTPS endpoint plus the public ingestion key in the build;
3. the exact fixed allowlist and bounded queue already enforced by the client;
4. independent schema validation, size/rate limits, deduplication, and retention deletion at the
   collector.

The approved collector implementation is a Cloudflare Worker with D1. It stores no source IP in
the event database and deletes events after 90 days. Cloudflare may process transport metadata.
Deployment, exact endpoint origin, CSP allowlisting, privacy-contact details, and account ownership
remain a release gate; an unconfigured build sends nothing.

## Consequences

- Unsaved work is never represented as a background tab.
- Workbook import changes the input adapter, not statistical or StructureContract semantics.
- A changed consent notice invalidates prior opt-in and discards the old unsent queue.
- A temporary review tunnel is never a production telemetry endpoint.

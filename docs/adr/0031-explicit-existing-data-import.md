# ADR 0031: Existing-data import requires explicit table mapping

Status: Accepted

## Decision

The Core import route accepts clipboard tables and local CSV/TSV/TXT files. A researcher previews the parsed table and explicitly chooses whether conditions are encoded in one column (tidy layout) or in separate numeric columns (wide Excel/Prism layout). Experiment-unit, condition, time, and value mappings are not silently inferred.

Every imported numeric observation records its source header and row. The import creates the same experiment-first draft and editable cells as manual entry; it does not introduce a second project or statistics model. Ambiguous tables, fewer than two comparison conditions, duplicate wide-layout experiment IDs, and invalid numeric mappings are refused without mutating the workspace.

## Consequences

- Excel/Sheets rectangular data, common Prism-style tables, CSV/TSV, and ImageJ-like tidy results can enter the Core workspace locally.
- Imported values retain row/column provenance through save and reopen.
- A single unlabeled value column cannot be assigned to experimental conditions without additional researcher input; the application must not guess that structure.

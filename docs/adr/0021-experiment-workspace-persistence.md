# ADR 0021: Experiment workspace persistence

Date: 2026-08-21  
Status: accepted

## Decision

Project-state schema `0.3.0` adds an optional, versioned `experimentWorkspace` record. It stores only information needed to reconstruct the researcher-facing workspace: condition-column presentation, planned time structure, experiment-session labels/dates/notes, and graph display settings.

Measurement values do not live only in this record. Proportion numerator/denominator values and nested scalar observations are converted to canonical immutable observations and unit instances. A subsequent save creates a new raw revision and keeps the previous revision recoverable.

SQLite schema version 3 stores the workspace record in a dedicated `experiment_workspace_json` column. Database versions 1 and 2 decode with no workspace record and migrate in memory to project-state `0.3.0`; saving them creates the existing durable pre-migration package backup.

Graph display state may exist without a completed analysis. When a validated local analysis has been run, saving remaps its draft observations to the active canonical raw revision, stores the request/result through the canonical analysis-run contract, and links the workspace graph to that run. Nested continuous analyses additionally materialize a versioned replicate-summary dataset with raw-observation lineage. The workspace JSON itself is not analysis provenance.

## Consequences

- New context-first projects can be saved, opened, and edited in the same experiment-session workspace.
- Raw values remain available through canonical recovery CSV and revision history.
- Completed D01, D03, and complete-factorial D05 graph analyses reopen with their executed result and canonical input lineage; changing raw data makes the prior run stale on the next save.
- Existing projects without the new workspace record continue through their compatibility editor.
- Adding or changing statistical models remains independent of this persistence adapter.

# ADR 0035: Experiment session and stable biological-unit identity

- Status: Accepted
- Date: 2026-08-22

## Context

An independently performed experiment session and the biological/statistical unit followed or
paired in an analysis are different scientific identities. Reusing a date, row number, or session
label as both can create false pairs, break real pairs after reopening, or change statistical `n`.

## Decision

The experiment workspace stores two explicit identities on every experiment-session entry:

- `sessionId`: independently performed run, date, or batch identity;
- `stableUnitId`: the real Cell, Animal, Well, Donor, Sample, or other unit that can be followed.

Pairing, repeated-measures requests, paired-dot connections, longitudinal trajectories, and
derived-metric lineage use `stableUnitId`. `sessionId` is retained as provenance/block structure
and never creates a pair by itself.

The identifiers are persisted in `ExperimentWorkspaceState.experimentSessions`, copied to canonical
unit metadata, retained through project save/open, and shown separately in the Data Sheet. Changing
either identity is an upstream data-structure change and invalidates dependent analysis state.

Existing-data import maps session and unit columns independently. The source date remains blank
when it is absent; import time is separate provenance. A repeated mapped key is an import conflict
until the researcher explicitly identifies the rows as nested raw observations. Such rows are
preserved without automatic averaging.

## Consequences

- Two units from the same session are not paired merely because their dates or batch match.
- The same stable unit can be followed across conditions, time points, or sessions.
- Independent-group analyses create condition-specific statistical identities even when workspace
  rows share a convenient display label.
- Unsupported or incomplete repeated structures stop statistical routing rather than falling back
  silently to an independent test; graph-only work remains possible.
- Old prototypes that overloaded one identifier are not a compatibility requirement.

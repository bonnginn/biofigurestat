# ADR 0030: Reusing a design starts a data-empty project

Status: Accepted

## Decision

A saved experiment workspace exposes `Reuse design as new project`. The handoff copies the experiment context, readouts, condition attributes and rows, time plan, unit-assignment decision, analysis intent, and planned experiment-session count.

It does not copy measurement cells, raw revisions, source notes, graphs, analyses, QC records, or result annotations. Experiment-session notes are cleared and dates are reset for the new work. The researcher lands on design confirmation and can jump directly to any design section before creating the new Data Sheet.

## Consequences

- Reuse is distinct from opening or duplicating a project.
- Existing raw data cannot appear in the new workspace by accidental object reuse.
- Favorites use the same data-empty boundary. They may retain Graph type/layer/basic-style defaults, but never Graph data sources, results, annotations, raw cells, or history.

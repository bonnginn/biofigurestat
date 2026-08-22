# ADR 0032: Favorites store reusable design, not research data

Status: Accepted

## Decision

Home Favorites are small local records containing an experiment design and optional Graph type/layer/basic-style defaults. They deliberately exclude measurement cells, raw revisions, source notes, analyses, p-value annotations, and project history.

Opening a Favorite applies the existing design-reuse reset: experiment-session labels, dates, and notes are renewed, then the researcher returns to design confirmation and may edit the structure before creating the Data Sheet. A Graph default is applied only when a compatible Graph type is later created; current condition/readout IDs and scientific labels always come from the new design.

Malformed local Favorite records are ignored rather than interpreted.

## Consequences

- Repetitive experimental layouts become reusable without leaking old research values into a new project.
- Favorites remain distinct from project Save/Open and from duplicating a project.

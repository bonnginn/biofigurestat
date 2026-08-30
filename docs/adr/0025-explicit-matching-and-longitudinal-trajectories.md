# ADR 0025: Explicit matching and longitudinal trajectories

## Status

Accepted — 2026-08-21

## Context

The experiment-first workspace stored session identifiers and time sampling, but condition-to-condition matching was fixed to `independent`. The graph renderer drew only a condition summary trend. This could hide real within-unit trajectories in a longitudinal experiment and could not safely support a paired graph or paired analysis.

Matching must never be inferred from a shared date, batch label, or adjacent spreadsheet row. A line between measurements is scientifically meaningful only when the same experimental unit has a stable recorded identity.

## Decision

- Add an explicit `conditionAssignment` field to the experiment draft and persisted workspace snapshot. It records `independent` or `matched` plus the researcher-facing unit label.
- Ask about the concrete operation: separate units per condition versus the same unit measured in both conditions. Do not ask the user to choose paired/unpaired terminology.
- For matched conditions, all condition observations from one experiment session share one experimental-unit ID. For independent conditions, unit IDs remain condition-specific.
- Route an explicit, complete two-condition match to the existing D02 paired-t contract. Analyze complete pairs only and retain the alternative-method explanation.
- Draw per-unit trajectories only for explicit longitudinal sampling or explicit matched conditions. Cross-sectional time courses retain summary trends without individual connecting lines.
- Keep summary trends visually stronger than individual trajectories.
- Store the graph's displayed time points separately from an optional analysis time point. A full trace can therefore remain visible while a supported single-time comparison is executed and reproduced.
- Keep statistical annotations hidden by default. Exact p-values or significance symbols can be enabled only from the graph-linked saved analysis result; stale or removed results cannot render an annotation.
- Treat the new workspace field as an additive schema default so older current-format projects remain readable. This does not preserve obsolete pre-workspace UI behavior.

## Consequences

- Saved projects can reproduce whether the same units were compared.
- Paired graphs and D02 no longer depend on row order or dates.
- Repeated/factorial combinations that require a mixed model remain blocked rather than being silently analyzed as independent.
- Tests must cover canonical unit identity, save/reopen, longitudinal trajectories, and the absence of trajectories for cross-sectional sampling.

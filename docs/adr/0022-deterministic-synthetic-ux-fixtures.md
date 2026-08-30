# ADR 0022: Deterministic synthetic UX fixtures

Date: 2026-08-21  
Status: accepted

## Decision

Phase 1 provides two deterministic synthetic fixtures from the New experiment screen: a moderately complex proportion/count dataset and a nested continuous cell/ROI dataset. They open the normal experiment workspace directly, exercise the same Data Sheet, graph, analysis, and save adapters as research data, and are always marked `synthetic_demo` in the workspace record and visible UI.

The workspace record also stores explicit not-planned cell keys. A not-planned cell is different from a planned but empty cell: it is excluded from completion and missing-cell counts, produces no canonical observation, and is not plotted or analyzed. It remains visible and reversible in the Data Sheet. Zero remains an ordinary measured numeric value.

The nested fixture intentionally has unequal cell/ROI counts. Raw distributions may be shown descriptively, but overall inferential summaries continue to give equal weight to experiment-level summaries rather than weighting experiments by their cell count.

## Consequences

- Manual UX review starts with one click and produces the same layout and broad graph structure on every run.
- Synthetic projects cannot be mistaken for unlabeled research projects after save/open.
- Fixture tests cover hierarchy, long labels, multiple times, derived percentages, missing versus not planned, and unequal nested observation counts.
- These fixtures are internal UX/debug aids, not scientific example datasets or evidence for a statistical method.

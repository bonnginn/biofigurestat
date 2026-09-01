# ADR 0060 — Worksheet rows may link explicitly to experiment-session provenance

Date: 2026-09-02

Status: Accepted

## Decision

Canonical adaptive observations may store an optional `experimentSessionId`. The identifier links
an observation to the workspace experiment-session record that owns the researcher-entered run
label, date, and note. It is provenance and blocking metadata only.

The link never establishes pairing, repeated measurement, nesting, or biological-unit identity.
Those meanings continue to come only from the declared structure contract and canonical identity
fields. In particular, equal experiment dates or equal session labels do not make observations a
matched set.

Independent worksheets use the explicit session link to keep sparse entry stable. Entering a value
on row 3 before rows 1 and 2 leaves the value on row 3; it is not compacted upward by the current
number of observations. Missing intermediate worksheet sessions remain available so their run
metadata can be edited later.

## Compatibility

The field is optional. Public Alpha `.lsa` files without it remain valid. Until an old observation
is edited, legacy unlinked independent rows retain their previous dense-order projection. A direct
edit writes the explicit session link without changing the observation ID, experimental-unit
identity, condition, readout, value, or source lineage.

Save/reopen preserves both the observation-to-session link and the session date. Graph and
Statistics projections consume the same canonical values; session provenance does not alter the
analysis design or manufacture a blocking variable.

## Consequences

- Data can be entered in any worksheet row without moving to an earlier blank row.
- Experiment run labels and dates are stored together and remain editable in the data workspace.
- Graph cells, project observations, and reopened canonical observations share the same explicit
  session identifier.
- Date-based automatic matching and automatic pairing remain prohibited.

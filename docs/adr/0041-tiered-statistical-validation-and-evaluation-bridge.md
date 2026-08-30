# ADR 0041: Tiered statistical validation and evaluation-only browser bridge

Status: Accepted, 2026-08-22

## Context

Requiring a completely independent implementation before exposing every established standard
test withheld useful Core choices even when SciPy provided a maintained public API. Browser agents
also could inspect UX but could not execute the native statistical sidecar.

## Decision

1. Established standard methods use Tier A in `docs/STATISTICAL_METHOD_CATALOG.md`: package
   pinning, application regression/edge tests, input-shaping tests, semantic documentation, and
   provenance are required. A second implementation is not mandatory.
2. Complex models remain Tier B. R is not introduced without a concrete Tier B requirement.
3. Multi-group requests store contrast intent. A control ID alone never forces Dunnett. Dunnett
   requires explicit control-vs-many intent and a stable control condition ID.
   Researcher-selected planned comparisons are limited to explicit condition-ID pairs under the
   conventional one-way equal-variance model and use Statsmodels' stable Holm adjustment. They do
   not silently expand to every pair or to arbitrary linear contrasts, and no simultaneous CI is
   claimed for this workflow.
4. The browser evaluation path is explicit, synthetic-only development mode. It sends the same
   versioned request through the same pinned `lsaa_engine.cli` boundary used by native. No
   JavaScript statistical implementation is allowed.
5. The bridge binds to loopback, requires an ephemeral token and exact origin, limits request size,
   validates artifact paths/names, and is absent from production bundles.
6. Benchmark artifacts remain separate from research project persistence.

## Consequences

Standard Core choice can expand without pretending to re-prove SciPy algorithms. Browser and
native numerical semantics can be compared at the protocol boundary. The evaluation bridge must
never be presented as secure storage for unpublished data.

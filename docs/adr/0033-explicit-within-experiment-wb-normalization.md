# ADR 0033: WB normalization is explicit and source preserving

Status: Accepted

## Decision

The generic WB workflow supports three source/derivation paths:

1. target and reference/loading values retained separately, with `target/reference` derived;
2. a reference-free continuous intensity entered and analyzed as supplied;
3. an optional second-stage within-experiment transformation, either a declared baseline/control condition equal to one or the maximum value equal to one.

The second-stage transformation is OFF by default. Its scope and denominator rule are stored in the readout/design, represented in normalization plans and derived-data lineage, and used consistently by the Data Sheet, Graph, and Graph-linked analysis. Target and reference values are never overwritten.

## Consequences

- GAPDH, total protein, custom references, and no-reference measurements share reusable Core structures.
- Baseline/max normalization cannot occur silently.
- Sophisticated lane detection, peak extraction, and image processing remain outside Core.

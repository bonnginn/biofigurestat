# ADR 0003: Generic unit hierarchy and long-form observations

Status: accepted.

## Decision

Persist experimental structure as generic `UnitLevelDefinition` and `UnitInstance` records. The design explicitly names the experimental-unit level. Raw observations are canonical long-form records linked to a unit, condition, outcome, and raw revision.

The UI may display a wide Prism/Excel-like sheet, but that sheet is a projection and must not become the persistence model.

## Proportions

Store cilia-positive and similar outcomes as numerator plus denominator at the observed unit. Derive percentages with a versioned transformation. Displaying a percentage must not discard its denominator.

## Pairing

Distinct cell-culture dishes default to an independent design. Same-unit measurements can be matched. Run/batch blocking is an explicit Advanced design and is never inferred from date or cell line alone.

## Consequences

The same model can represent animal, Western blot, microscopy, well, field, cell, and technical measurements without making cells or fields biological `n` by default.

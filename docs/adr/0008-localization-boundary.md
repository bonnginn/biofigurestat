# ADR 0008: Localization boundary

## Status

Accepted for the Japanese-first MVP.

## Context

The first daily-use release is Japanese-first, while the project is intended to support an English open-source distribution later. Reproducibility-critical project data must not change meaning when the display language changes.

## Decision

- Keep schema keys, entity IDs, analysis method IDs, graph types, provenance kinds, and engine protocol values locale-neutral and stable.
- Treat Japanese UI text as presentation, not as a persisted statistical decision.
- Preserve user-authored project names, condition labels, outcome labels, and notes exactly as entered; never translate them automatically during open or migration.
- Add English through a UI message catalog rather than duplicating statistical or persistence modules.
- Persist explicit method/template identifiers and generate localized explanatory text from those identifiers at display/export time.
- The Japanese locale remains the default until an English UI review is completed.

## Consequences

Future localization work may extract current Japanese literals into message catalogs, but it must not rename persisted IDs or create language-specific project formats. Golden numerical tests remain shared across locales; UI tests cover locale-specific wording separately.

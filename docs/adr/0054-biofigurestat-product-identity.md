# ADR 0054 — BioFigureStat product identity

Date: 2026-08-30
Status: Accepted

## Decision

The researcher-facing product name is **BioFigureStat**. Native window titles, application menus,
About, default project names, installer/bundle display names, help prompts, and current release
documentation use this name.

The application icon is the user-approved navy circular mark combining a biological cell outline
with three statistical box-and-point glyphs. Small application surfaces use the icon without the
wordmark. The full `BioFigureStat` wordmark may be used in documentation and release artwork.

The existing Tauri application identifier and `.lsa` project extension remain unchanged in the
Alpha migration. Changing the display identity must not orphan existing installations or saved
projects. Internal package names, protocol identifiers, historical benchmark IDs, and schema IDs
remain stable unless separately migrated.

## Consequences

- Historical evidence retains the former development name where it describes an older build.
- New product-facing strings use BioFigureStat; internal `LSA`/`LSAA` identifiers are not bulk
  renamed.
- Release verification expects `BioFigureStat.app` and the BioFigureStat installer display name.
- Exact-name web screening found no obvious adjacent indexed software collision on the decision
  date, but this is not trademark clearance. Public distribution still requires the ordinary legal,
  domain, and visual-similarity review.

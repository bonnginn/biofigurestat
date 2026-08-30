# ADR 0058 — MIT license for the BioFigureStat Public Alpha

Date: 2026-08-31

Status: Accepted

## Decision

BioFigureStat source code is released under the MIT License beginning with version `0.1.0` Public
Alpha. The repository-root `LICENSE` file is authoritative and uses the copyright attribution
`BioFigureStat contributors`.

The license identifier is recorded consistently in JavaScript workspace metadata, the Rust desktop
crate, and the Python statistical engine. The About panel displays `MIT License`. Windows and macOS
bundles include the root license and the maintained third-party notice as resources.

Third-party components are not relicensed. Their original licenses, copyright notices, package
metadata, and any required exceptions remain effective. Release packaging must preserve required
third-party notices and must not describe every bundled component as MIT merely because the
BioFigureStat source is MIT licensed.

## Rationale

The Public Alpha prioritizes low-friction academic and commercial evaluation, modification, and
redistribution. MIT is short, widely understood, permissive, and compatible with the principal
runtime dependencies currently used by the product. The decision intentionally does not impose a
copyleft requirement on derivative applications.

## Consequences

- Copies or substantial portions of BioFigureStat must retain the MIT copyright and permission
  notice.
- The software remains provided without warranty under the terms of the license.
- The license does not itself constitute a trademark registration or a scientific-validity claim.
- Future license changes apply prospectively and require a separate decision; already released MIT
  versions remain available under MIT.

# Public source provenance — BioFigureStat 0.1.0-alpha.1

The BioFigureStat `0.1.0-alpha.1` Windows and macOS artifacts were validated from the private
release-build commit `587930f7b9aa81f2dd63386ac2643bc3c625efce`. This public repository began as
an audited source snapshot of that commit. Product source, dependency manifests, lockfiles,
schemas, tests, licensing files, and release-facing documentation were retained.

The public snapshot intentionally excludes sealed evaluation pools, historical benchmark runtime
outputs, third-party reference figures used for internal comparison, external-review working
materials, and generated artifacts. Those exclusions do not participate in the desktop production
build or local statistical engine.

The unreferenced `packages/experiment-first-prototype` research prototype was also omitted from
the public snapshot. Mechanical import and workspace-dependency checks found no production,
build, or documentation consumer; its test suite depended directly on an excluded internal
evaluation corpus. The original package remains preserved in the private release archive. Its
omission does not change the desktop application, project schema, or statistical engine.
The corpus-coupled `packages/adaptive-input/src/production-path.test.ts` and
`apps/ui/src/app/adaptiveProductionPath.test.ts` integration harnesses were omitted for the same
reason; the adaptive-input implementation and its self-contained unit and UI tests remain
included.

Validated release artifacts:

| Artifact | SHA-256 |
| --- | --- |
| `BioFigureStat_0.1.0_x64-setup.exe` | `74D0C98124DE7319EAC623EADD99392E198E5128B4DDFF730F62015D0B615100` |
| `BioFigureStat-0.1.0-macOS-Apple-Silicon.zip` | `9C6FAE3076D1D7BD0E7F249451239675160179CBD37AA6618BE48CC9BD4208B6` |

The Windows artifact is unsigned. The macOS artifact is ad-hoc signed and not Apple-notarized.
These are documented Public Alpha limitations, not evidence of platform trust certification.

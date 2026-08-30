# Third-party software notices

BioFigureStat is distributed under the MIT License. It also uses third-party software whose
copyrights and licenses remain with their respective owners.

The principal runtime components include:

| Component                        | License                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------- |
| React, React DOM, Scheduler, Zod | MIT                                                                               |
| Tauri and Tauri dialog plugin    | MIT or Apache-2.0                                                                 |
| NumPy                            | BSD-3-Clause                                                                      |
| SciPy                            | BSD-3-Clause                                                                      |
| statsmodels                      | BSD-3-Clause                                                                      |
| PyInstaller bootloader           | GPL-2.0-or-later with the PyInstaller bootloader exception                        |
| Rust runtime dependencies        | MIT, Apache-2.0, BSD, ISC, Unicode-3.0, or another license recorded by each crate |

The exact dependency versions used by a build are pinned in `pnpm-lock.yaml`,
`apps/desktop/src-tauri/Cargo.lock`, and `engine/python/pyproject.toml`. Complete license texts and
copyright notices supplied with each dependency remain authoritative. The attributed legacy Excel
fixture used only in native tests is documented separately in
`apps/desktop/src-tauri/tests/fixtures/THIRD_PARTY_FIXTURES.md` and is not research data.

This notice does not replace or modify any third-party license.

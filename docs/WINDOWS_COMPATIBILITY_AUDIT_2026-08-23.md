# Windows benchmark development compatibility audit

Date: 2026-08-23

## Scope and classification

This is a platform adapter and reproducibility extension of the existing Core, not a new
scientific workflow. Windows and macOS continue to share the same domain contracts, project schema,
Python engine, benchmark cases, artifact contract and browser UI. No Windows-specific statistical
implementation was added.

## Audit result

| Area                     | Before migration preparation                                                                     | Current disposition                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Root pnpm scripts        | `python3` and Unix `.venv/bin/python` appeared in evaluation commands                            | Shared Node wrapper resolves `.venv\\Scripts\\python.exe` on Windows and `.venv/bin/python` on Unix                     |
| Node/pnpm                | pnpm workspace and lockfile already platform-neutral                                             | Node LTS plus pinned `pnpm@11.19.0`; no Bash required                                                                   |
| Python                   | `>=3.12,<3.15`; NumPy 2.3.5, SciPy 1.18.0, Statsmodels 0.14.6 pinned                             | Recommend CPython 3.12 x64; editable installation uses the same `pyproject.toml`                                        |
| Evaluation bridge        | Engine interpreter path was Unix-specific                                                        | Bridge now reuses the exact interpreter that launched it (`sys.executable`)                                             |
| Evaluation launcher      | Python launcher was usable but root script assumed `python3`; pnpm discovery was Unix-oriented   | Node wrapper plus `pnpm.cmd` discovery makes `pnpm dev:evaluation` Windows-safe                                         |
| Browser path             | Same-origin Vite proxy already separates browser from bridge                                     | Unchanged: browser uses `/api/evaluation`; bridge remains `127.0.0.1:43128`                                             |
| File/path handling       | Python uses `pathlib`; benchmark IDs have a strict portable character allow-list                 | Platform-neutral; artifact IDs and directory semantics are unchanged                                                    |
| Atomic artifact writes   | Temporary file in destination directory followed by `Path.replace`                               | Supported on Windows; failure remains explicit rather than silently degrading                                           |
| Benchmark verifier       | Python/pathlib implementation with PNG/SVG/JSON checks                                           | Platform-neutral and available as `pnpm benchmark:verify`                                                               |
| Numerical equivalence    | Unit/reference tests existed but there was no committed cross-OS engine envelope                 | Added 14-case macOS ARM64 engine 0.7.0 reference with tolerant numeric and exact semantic comparison                    |
| Frozen sidecar           | Build script already selects `.exe` and Windows platform tag                                     | Optional for benchmark development; not required by browser evaluation                                                  |
| Tauri development engine | Rust already resolves `.venv\\Scripts\\python.exe` on Windows                                    | Compatible by source inspection; external Windows execution remains required                                            |
| Tauri release bundle     | Only the macOS ARM64 resource bundle is configured                                               | Windows installer/sidecar resource packaging remains intentionally out of this migration scope                          |
| Native clipboard         | macOS PNG clipboard is implemented; non-macOS returns an explicit error                          | Known Windows native limitation; irrelevant to Browser Use benchmark, must be addressed before native Windows milestone |
| `.lsa` paths             | Canonical package entries require normalized forward-slash relative paths; container uses SQLite | Cross-platform by design; an actual Windows/macOS project exchange remains a later external gate                        |
| Source revision          | Run metadata had app/engine/benchmark versions but no code revision                              | Evaluation launcher now records Git SHA plus `-dirty`, or `uncommitted-working-tree`                                    |

## Current migration blockers and external gates

1. The current local repository has no initial Git commit and no configured remote. Windows cannot
   clone an attributable revision until the researcher chooses a private transfer/remote and makes
   the first commit. No commit or remote was created automatically.
2. Windows package installation and executable behavior cannot be proven from macOS. The commands
   in `WINDOWS_BENCHMARK_DEVELOPMENT_SETUP.md` must be run on Windows.
3. Migration is not complete until all 14 engine cases pass the macOS reference comparison and the
   same five visible Browser Use pilots finish on Windows.
4. Final Windows installer, signing, updater, native clipboard and public distribution remain out
   of scope.

## Scientific invariants preserved

- Engine 0.7.0 and its package pins are unchanged.
- Analysis request/result protocol versions are unchanged.
- Biological-unit, pairing, nesting and unsupported-design safeguards are unchanged.
- Benchmark fixtures and nine-file artifact contract are unchanged.
- No R runtime and no Windows-only scientific code were added.
- macOS remains the milestone native validation platform.

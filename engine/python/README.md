# Local analysis engine

This engine receives one versioned JSON request on standard input and writes one versioned JSON result on standard output. Standard analyses remain local; the process does not use network APIs or AI.

## Development environment

Create an isolated environment with Python 3.12 or later and install the pinned project:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -e .
.venv/bin/python -m unittest discover -s tests -v
```

PowerShell on Windows:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e .
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

The initial engine pins NumPy 2.3.5 and SciPy 1.18.0. Engine and package versions are returned with every result. Upgrades require a version change and renewed numerical validation.

## Current scope

- D01: two independent groups using Welch's two-sample t-test;
- D02: complete matched units using a paired t-test;
- D03 engine foundation: three or more independent groups using Welch ANOVA and Games-Howell all-pairs comparisons;
- D04 complete repeated groups using one-factor repeated-measures ANOVA, Holm-adjusted paired comparisons, and Bonferroni simultaneous pairwise intervals;
- D05 complete independent two-factor designs using sum-coded Type III interaction/main-effect tests and Holm-adjusted all-cell comparisons;
- D09 Pearson correlation with a Fisher confidence interval, or Spearman rank correlation without an asserted Core confidence interval; pairs are joined by explicit experimental-unit IDs rather than row order;
- two-sided or directional alternatives;
- estimate, standard error, confidence interval, t statistic, degrees of freedom, p-value, and effect size;
- explicit rejection of incomplete pairs, non-finite inputs, undefined zero-variance cases, duplicate independent units, and undeclared multi-group observations.

Statsmodels 0.14.6 is a pinned production dependency for Type III, repeated-measures reference
work and planned-comparison multiplicity adjustment. Release golden fixtures must retain expected
values even if a dependency is later deliberately upgraded.

## Desktop boundary

Tauri development builds invoke this environment as `python -m lsaa_engine.cli`. Release builds resolve a packaged executable named `engine/lsaa-engine` (or `lsaa-engine.exe` on Windows). Packaging and signing that executable is a separate reproducibility task; the release path must never silently fall back to an arbitrary system Python.

Build the platform-local release sidecar with the packaging-only dependency:

```sh
.venv/bin/python -m pip install -e '.[packaging]'
.venv/bin/python build_sidecar.py
```

On Windows, substitute `.\.venv\Scripts\python.exe` for `.venv/bin/python`. Windows sidecar
packaging is optional for browser benchmark development; `pnpm dev:evaluation` executes the pinned
environment directly.

The generated one-directory executable is written under `dist/<platform>-<architecture>/` and is intentionally ignored by Git. A directory bundle avoids repeatedly extracting the large SciPy runtime on every analysis. Tauri's macOS configuration includes the macOS ARM64 directory as an application resource.

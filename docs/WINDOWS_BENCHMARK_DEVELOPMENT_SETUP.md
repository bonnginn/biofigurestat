# Windows benchmark-driven development setup

## Purpose

This guide creates a temporary Windows development/evaluation environment for repeated fixed
benchmark -> review -> implementation -> rerun cycles. It does not replace macOS native milestone
validation and does not create a public Windows release.

## Prerequisites

Required for browser benchmark development:

- Windows 11 x64;
- Git for Windows;
- current Node.js LTS x64;
- pnpm 11.19.0;
- CPython 3.12 x64;
- ChatGPT Desktop/Browser Use able to reach Windows localhost.

Rust, Visual Studio Build Tools and WebView2 development prerequisites are **not required** for
the ordinary browser benchmark loop. They are needed only if a Tauri Windows development build is
later requested.

## 1. Install required tools

Open a normal PowerShell window. Administrator elevation is needed only if Windows/package-manager
policy requests it.

```powershell
winget install --id Git.Git -e --source winget
winget install --id OpenJS.NodeJS.LTS -e --source winget
winget install --id Python.Python.3.12 -e --source winget
```

Close and reopen PowerShell, then install the repository's pinned pnpm version:

```powershell
npm install --global pnpm@11.19.0
git --version
node --version
pnpm --version
py -3.12 --version
```

Expected pnpm is `11.19.0`; Python must be `3.12.x`. Do not silently upgrade the scientific
packages specified below.

## 2. Obtain the exact repository revision

The preferred path is a private Git remote after the Mac working tree has an attributable commit:

```powershell
New-Item -ItemType Directory -Force C:\src | Out-Null
Set-Location C:\src
git clone <PRIVATE_REPOSITORY_URL> life-science-analysis
Set-Location .\life-science-analysis
git rev-parse HEAD
git status --short
```

Replace `<PRIVATE_REPOSITORY_URL>` with the researcher-approved private remote. Do not publish
benchmark artifacts or unpublished data. If the working tree is transferred privately as a folder
instead, open that folder and create an attributable commit before official benchmark runs.

The following generated/local directories must not be transferred or committed:

```text
node_modules/
.pnpm-store/
engine/python/.venv/
engine/python/build/
engine/python/dist/
apps/desktop/src-tauri/target/
benchmark_runs/
```

## 3. Install JavaScript dependencies

From the repository root:

```powershell
pnpm install --frozen-lockfile
```

## 4. Create the pinned Python engine

```powershell
Set-Location .\engine\python
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -e .
Set-Location ..\..
```

The repository pins:

- `lsaa-analysis-engine==0.7.0`;
- `numpy==2.3.5`;
- `scipy==1.18.0`;
- `statsmodels==0.14.6`.

Confirm the actual environment:

```powershell
.\engine\python\.venv\Scripts\python.exe -c "import numpy, scipy, statsmodels; print(numpy.__version__, scipy.__version__, statsmodels.__version__)"
```

## 5. Validate shared code and numerical equivalence

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm engine:test
pnpm engine:reference
```

`pnpm engine:reference` executes the 14 exposed engine workflows and compares the current Windows
result envelope with the committed known-good macOS ARM64 engine 0.7.0 reference. Numeric values
use `rtol=1e-10` and `atol=1e-12`; method identities, correction labels, structure and non-numeric
semantics remain exact. Do not dismiss a failure without reviewing the reported field.

The 14 cases include Welch/Student/Mann-Whitney, paired t/Wilcoxon, Welch ANOVA/Games-Howell,
classical ANOVA/Tukey, Dunnett, planned pairs/Holm, Kruskal-Wallis, repeated measures, Type III
two-factor, Pearson and Spearman.

## 6. Start the Windows evaluation environment

From the repository root:

```powershell
pnpm dev:evaluation
```

One command starts:

- Vite evaluation UI and same-origin API proxy on `127.0.0.1:1420`;
- token-authenticated evaluation bridge on `127.0.0.1:43128`;
- the same pinned Python CLI engine used by the shared protocol.

Expected browser URL:

```text
http://127.0.0.1:1420
```

No Cloudflare Tunnel is required for normal Windows Browser Use. Keep the PowerShell process open.
Stop the UI, proxy and bridge together with `Ctrl+C`. If Windows Firewall asks about access, do not
open a public-network listener: both servers are explicitly loopback-only.

The launcher prints the source revision. A value such as `uncommitted-working-tree` or a SHA ending
in `-dirty` is not suitable for an official benchmark comparison; commit or intentionally identify
the revision first.

## 7. Run the five-pilot migration gate

Using ChatGPT Desktop/Browser Use, open `http://127.0.0.1:1420` and run in this order:

1. `pilot_independent_2group`;
2. `pilot_independent_3group`;
3. `pilot_paired_2condition`;
4. `pilot_nested_microscopy`;
5. `pilot_longitudinal_endpoint`.

For each pilot:

1. start from Home -> New experiment;
2. construct the design through the normal researcher-facing UI;
3. reach an Experiment Data tab;
4. use the pilot loader only after it reports structural compatibility;
5. execute the real Statistics workflow;
6. capture the default Graph, edit the Graph and capture the final Graph;
7. select a support outcome and finalize the run.

Use `track_A` and `run_001` for the initial migration gate unless the benchmark plan specifies
otherwise.

## 8. Verify artifacts

After all five runs:

```powershell
pnpm benchmark:verify -- --track track_A --run-id run_001
```

For one pilot during troubleshooting:

```powershell
pnpm benchmark:verify -- --track track_A --run-id run_001 --case pilot_independent_2group
```

Each completed supported run must contain exactly the established required set:

```text
run.json
default_graph.png
default_graph.svg
final_graph.png
final_graph.svg
statistics.json
methods.txt
graph_state.json
interaction_log.json
```

## 9. Compare Pilot 1 with macOS

Compare Windows `pilot_independent_2group` with the successful macOS Pilot 1 for:

- route and condition/unit interpretation;
- recommended and selected method;
- numerical estimates, intervals, statistics, degrees of freedom and p-values;
- graph family and artifact completeness.

Do not require pixel-identical Graph rendering. Scientific structure and numerical results must
agree within the documented tolerance.

## Optional native Windows development prerequisites

Only if a Tauri Windows development build is explicitly needed:

```powershell
winget install --id Rustlang.Rustup -e --source winget
winget install --id Microsoft.EdgeWebView2Runtime -e --source winget
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --source winget --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Then restart PowerShell and use `pnpm tauri:dev`. A distributable Windows installer and packaged
Windows sidecar are outside the current benchmark migration scope.

## Known Windows-specific limitations

- Five visible Windows pilots have not yet been executed; migration is not complete until they pass.
- Native Windows PNG clipboard support is not implemented. Browser Graph export remains available.
- Windows release resource bundling, installer, signing, file association and updater are not part
  of this milestone.
- A real `.lsa` exchange between Windows and macOS remains a later cross-platform native gate.
- Quick Tunnel is unnecessary for ordinary Windows localhost Browser Use and should remain off.

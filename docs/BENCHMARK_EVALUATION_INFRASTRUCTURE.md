# AI benchmark evaluation infrastructure

## Purpose and boundary

This development-only facility lets an external browser evaluator exercise the same analysis
protocol and pinned Python engine used by the native application. It is not a second statistical
implementation and it is not enabled in production builds.

- Start with `pnpm dev:evaluation` from the repository root.
- The launcher creates a per-process bearer token, starts a loopback-only bridge, and starts Vite
  with evaluation mode explicitly enabled.
- Browser code calls only the same-origin `/api/evaluation/...` path. Vite proxies that path to the
  loopback bridge and adds the bearer token and trusted internal Origin on the Mac. Neither the
  loopback address nor the token is included in browser-visible Vite environment variables.
- The bridge accepts only an explicitly configured origin, token-authenticated requests and
  synthetic-data requests carrying `mode: "evaluation"` and `syntheticOnly: true`.
- The bridge calls `python -m lsaa_engine.cli`; native and evaluation modes therefore share the
  request/result contracts and numerical implementation.
- No unpublished or measured research data may be used in this mode.

## External Work browser access

The external browser cannot use the Mac's `127.0.0.1`. Use two local Terminal windows from the
repository root. Do not expose bridge port 43128.

Terminal 1 — start the evaluation UI, same-origin proxy, loopback bridge and pinned engine:

```bash
pnpm dev:evaluation
```

Keep Terminal 1 running. It serves the UI only at `http://127.0.0.1:1420`; the bridge remains bound
to `127.0.0.1:43128`.

Terminal 2 — expose only the Vite UI through a temporary HTTPS Quick Tunnel:

```bash
pnpm evaluation:tunnel
```

Copy the printed root URL, for example `https://random-words.trycloudflare.com`, to Work. Do not
append or share a bridge address or token. Work uses that one HTTPS origin for page navigation and
`/api/evaluation/...`; Cloudflare forwards it to Vite, and Vite alone forwards API requests over
loopback to the bridge.

Both Terminal processes must remain running throughout evaluation. Stop the tunnel first with
`Ctrl+C`, then stop `pnpm dev:evaluation` with `Ctrl+C`. Quick Tunnel is a temporary bearer link:
use synthetic benchmark data only and do not share the URL beyond the evaluator.

## Run identity and output

Start a run from the compact benchmark bar before interacting with a pilot. Each run records the
benchmark version, case ID, track, run ID, timestamp, support classification and interaction log.
Finalization writes an atomic artifact set under:

`benchmark_runs/<case-id>/<track>/<run-id>/`

Required files are:

- `run.json`
- `default_graph.png` and `default_graph.svg`
- `final_graph.png` and `final_graph.svg`
- `statistics.json`
- `methods.txt`
- `graph_state.json`
- `interaction_log.json`

The output folder is ignored by Git. Artifact names and path segments are allow-listed by the
bridge to prevent arbitrary filesystem writes.

The default Graph pair is written when the graph first becomes available. Finalization is enabled
only after that capture, a support outcome and a current statistical result exist. The final write
declares the complete nine-file manifest; the bridge lists the files actually present and refuses
to report success if any required artifact is missing. The UI also verifies that returned manifest
before showing completion.

## Five-pilot gate

The deterministic pilot catalog is defined in `apps/ui/src/app/benchmarkPilotCases.ts`:

1. independent two-group continuous;
2. independent three-group continuous;
3. paired two-condition;
4. nested microscopy summarized at the experimental-unit level;
5. longitudinal stable-unit endpoint.

Automated tests verify fixture determinism, expected statistical families, biological-unit-only
counting and required artifact manifests. Before an external 100-run benchmark begins, one manual
browser run of each pilot must additionally verify the complete route, default capture, final
capture, statistics, Methods text and artifact download/write behavior.

Evaluation mode deliberately hides the ordinary direct-entry demo cards. For each pilot, the
evaluator must start at Home, choose New experiment, describe the research context and construct
the condition/time/experimental-unit design. After the design reaches an `Exp` Data tab, a compact
pilot loader appears. It enables bulk insertion only when all of the following match the selected
pilot: readout shape, condition count, experiment-unit count, independent/matched assignment,
time sampling, time points and time unit. The loader maps deterministic values onto the IDs in the
researcher-built design; it does not replace the design workflow. A mismatch remains visible with
an explanatory correction instead of coercing the design.

Recommended five-pilot procedure:

1. start the benchmark run and select the intended pilot case;
2. follow Home -> New experiment and build the design in researcher language;
3. confirm the design and open `Exp 1`;
4. use `このPilotの合成値を一括入力` only after it reports a compatible structure;
5. inspect Data, Statistics and Graph using the same controls as the native application;
6. assign one of the four support outcomes and finalize the artifact set.

After completing all five Track A pilots, verify identities, JSON structure, event ordering/counts,
Methods, PNG/SVG signatures, current statistics and the complete nine-file manifests with:

```bash
python3 scripts/verify_benchmark_runs.py --track track_A --run-id run_001
```

Use `--case pilot_independent_2group` to verify one pilot while working through the procedure. A
non-zero exit indicates the exact missing or inconsistent artifact and must not be treated as a
completed pilot.

## Support classification

The evaluator records exactly one status for each run:

- directly supported;
- supported with reasonable workaround;
- scientifically compromising workaround;
- impossible.

This is evaluation metadata, not a statistical conclusion. The application does not contain a
bespoke AI controller and no R runtime is added in this milestone.

For an unsupported case that cannot reach Graph/Statistics, `結果だけ記録` writes a metadata-only
`run.json` and `interaction_log.json`. It explicitly records `artifactCompleteness` as
`metadata_only` and does not fabricate missing graphs, statistics, or Methods artifacts.

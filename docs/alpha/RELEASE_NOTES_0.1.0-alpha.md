# BioFigureStat 0.1.0 Public Alpha

Release channel: Public Alpha

Platforms: Windows 11 x64 and Apple Silicon macOS

License: MIT

BioFigureStat 0.1.0 is an early public release for researchers who want to organize experimental
structure, enter or import data, create editable Graphs, and run a bounded set of deterministic
local statistical analyses in one project.

## Included in this Alpha

- Experiment-first setup using researcher-facing questions rather than test-name templates.
- Explicit biological `n`, experimental-unit identity, independent/matched/repeated structure,
  nested Cell/ROI observations, ordered axes, missingness, and source lineage.
- Spreadsheet-style entry, Excel workbook import, CSV/TSV/text paste, and Graph-only entry.
- Independent, paired, multi-group, repeated, independent-factorial, correlation/regression,
  proportion/contingency, Kaplan–Meier/log-rank, and bounded nonlinear X/Y workflows.
- Editable Graph appearance, authoritative statistical annotations, SVG/PNG/CSV export, and native
  PNG clipboard support.
- Versioned `.lsa` projects with multiple project tabs, save/reopen protection, migrations, and
  preservation of raw data, design, analysis, Graph, and Methods history.
- Explicit opt-in privacy-reduced usage collection and an explicit-preview problem-report form.

## Important Alpha cautions

- Keep an independent backup of every research dataset and `.lsa` project.
- Confirm the experimental unit, biological `n`, pairing/nesting, comparison scope, and censoring
  before interpreting results.
- Inspect exported Graphs and reopen saved projects before relying on them in research output.
- A recommendation is based on the declared experiment structure and comparison purpose; it does
  not replace scientific or statistical review.
- Unsupported structures stop safely. Do not substitute a nearby method merely to obtain a result.

## Known limitations

Advanced mixed-effects models, Cox/competing-risks survival models, broad dose-response/global-fit
libraries, nested X/Y inference, crossed within-unit factors, and high-dimensional workflows are
outside this Alpha. Kaplan–Meier styling and several workspace-density and preview refinements are
planned for Beta. See [Known Alpha Limitations](KNOWN_LIMITATIONS.md) for the maintained list.

## Privacy and feedback

Research measurements, project contents, filenames, clipboard contents, screenshots, and free text
are not included in usage telemetry. Participation is optional. Problem reports are sent only after
the user reviews the outbound fields and explicitly chooses to send. See [Privacy](PRIVACY.md).

## License

BioFigureStat is released under the MIT License. Third-party components retain their own licenses;
see the repository `THIRD_PARTY_NOTICES.md`.

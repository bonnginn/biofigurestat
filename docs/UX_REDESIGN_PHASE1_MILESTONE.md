# UX Redesign v0.4 — Phase 1 review milestone

Updated: 2026-08-21

## What is ready for review

- New experiment starts from the research context instead of a statistical template or measurement instrument.
- The active cell/culture path asks for the readout, condition labels and optional attributes, time structure, and experiment sessions.
- Each independent experiment session has its own tab, optional date, and note.
- Condition entry starts with ten blank spreadsheet rows. Blank trailing rows are ignored, the first scientific column can be renamed, and additional rows appear automatically when the last row is used.
- Repeated values in a scientific column remain shared descriptor levels while every row keeps its own stable condition identity.
- Time points remain exactly as typed; selecting a time-course design does not create default values.
- The confirmation screen shows only the condition/time/session structure. It does not invent data points, trends, effect sizes, or sample sizes.
- Before data entry, the app gives only a lightweight analysis expectation in researcher language. A final recommendation is deferred until actual data can be checked.
- Generic numerator/eligible data can be entered in a wide spreadsheet or pasted as a rectangular block from Excel or Google Sheets.
- Spreadsheet cells use a compact continuous grid with Enter, Tab, and arrow-key movement; calculated percentages remain subtly distinct and read-only.
- Nested continuous cell/ROI values can be pasted into a raw-data inspector and are summarized within each experiment session.
- The graph workspace separates raw observations from experiment-level summaries and uses experiment summaries—not cells or ROIs—as biological `n`.
- Graph creation and existing graph access are project-level actions visible from Overview and every experiment tab. Opening a graph from Exp 2 still proposes the selected readout across all experiments, never an Exp-2-only dataset.
- Each temporary graph keeps its own selected conditions, appearance, layers, and local result while the workspace remains open. More than one graph can be created without overwriting the previous graph.
- A restrained Prism-like graph style is the default. SD, SEM, or no error bar; color use; point size; axis weight; hierarchical labels; and nested raw/experiment/overall layers can be adjusted without changing the underlying values.
- SVG and visible-data CSV can be exported from the graph. For independent groups with sufficient experiment sessions, the graph offers a post-data Welch t or Welch ANOVA/Games–Howell recommendation and requires explicit confirmation that groups contain different experimental units before execution.
- A successful local result is linked to that graph and can be annotated on it. Changing the plotted data invalidates and removes the old result instead of silently carrying it forward.
- Typography in the new flow is at least 16 px for normal labels and supporting text.

## Deliberate Phase 1 boundary

The new workspace is a UI draft backed by temporary in-memory state. It is not connected to the versioned project save/open contract yet. This is disclosed prominently on the design confirmation screen.

Connecting it safely requires an architecture decision for persistent experiment-session identity, per-session date and note, planned time structure, missing versus not-planned cells, and optional graph state. Those facts must not be hidden in unrelated metadata or silently flattened into the old template model.

Existing saved projects and their compatibility editors remain available and unchanged. The new route does not pretend that temporary values have been saved.

## Review questions

1. Can a researcher describe their experiment without deciding whether it is D01, D03, D05, paired, or unpaired?
2. Are condition attributes such as siRNA sequence and drug −/+ understandable and compact enough?
3. Does `Overview | Exp 1 | Exp 2 | …` match the way experiments performed on different dates are recorded?
4. Is rectangular paste fast enough for positive/eligible counts?
5. Is the raw/summary inspector practical for ImageJ cell or ROI measurements?
6. Are the graph layers and labels close enough to the desired publication workflow before appearance controls are expanded?

## Known limitations after this milestone

- Only the cell/culture context is active; the other four context cards are visible as planned extensions.
- The new workspace has no project persistence or Methods output yet. Graph SVG/visible-data CSV and a limited independent-group recommendation are available, but graph settings and results remain temporary and are not saved-project history.
- Paired/repeated-measures, factorial, longitudinal, mixed-effects, and nested-model recommendations are not yet connected to the new workspace. The app does not silently substitute an independent-groups analysis for those designs.
- Browser automation against localhost is blocked by the Codex environment's administrative policy; automated DOM coverage and native app smoke testing are used instead, with researcher visual review as the final UX authority.

# UX debug audit evidence

Generated: 2026-08-25

Each named surface has PNG evidence and a JSON layout scan for narrow, ordinary, and wide desktop widths.

## Files

- `home_*`: four-route Home.
- `new_experiment_*`: ordinary New Experiment entry surface.
- `design_confirmation_*`: completed five-step design summary before data entry.
- `data_overview_*`: completed Simple 3-group Overview/data hierarchy.
- `graph_creation_*`: graph-family selection dialog.
- `graph_editor_*`: final graph editor for Simple 3-group data.
- `statistics_setup_*`: multi-group Statistics recommendation and confirmation.
- `statistics_results_*`: pinned-engine two-group result hierarchy; screenshots are viewport captures because full-page capture exceeded the browser capture deadline.
- `statistics_setup_narrow_fixed.*`: post-fix 720 px one-column Statistics validation.
- `workspace_nav_very_narrow_fixed_final.*`: post-fix 545 px non-wrapping, horizontally scrollable command-bar validation.
- `open_project_*`: browser-preview Open route and its safe explanatory alert.

## Viewport note

The first in-app-browser capture set (`home`, `new_experiment`, `data_overview`) had effective CSS widths of 545, 1,091, and 1,515 px; exact dimensions are recorded in each JSON file. The graph/statistics/open capture set used Chrome viewport overrides of 720, 1,440, and 2,000 px.

## Automated scan note

The JSON `overflow` list is a candidate detector, not an automatic defect verdict. Expected candidates include rotated SVG axis text and the intentionally clipped `.topbar-nav__label` span. Findings in the audit report were confirmed against the screenshots and DOM structure.

No Pool D data, benchmark workbook, or unpublished research data appears in this directory.

# ADR 0023: Graph canvas and contextual Inspector

## Status

Accepted.

## Decision

The experiment graph workspace uses a large central canvas and one persistent right-side Inspector. The Inspector exposes only one of Data, Layers, Appearance, Axes, or Statistics at a time. Double-clicking an axis, data point, distribution layer, summary/error-bar layer, legend, or graph background selects the corresponding Inspector section.

Graph detail listings remain available but collapsed by default. Graph export stays in the graph context. Project save stays at the project boundary through the File menu, Cmd/Ctrl+S, Save As, and a compact toolbar action with an unsaved-state indicator.

Graph state remains layer-based and keeps stable graph IDs independently from editable display names. Multiple selected time points and the experiment design's cross-sectional/longitudinal sampling metadata are preserved. This decision changes information architecture only; it does not add or alter statistical families.

Public appearance presets use neutral names (`Simple`, `Publication`, and `Presentation`) and never reference a commercial product.

## Consequences

- The plot receives most of the normal desktop viewport.
- Verification details no longer compete with the plot for space.
- Users can locate settings through the plotted object instead of knowing the settings taxonomy.
- New layer-specific controls can be added without creating one long settings page.
- Axis controls are initially descriptive and retain safe data-derived defaults; advanced axis customization remains incremental.

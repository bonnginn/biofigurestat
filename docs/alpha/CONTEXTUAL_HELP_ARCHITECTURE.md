# Contextual Help architecture

## Scope

Contextual Help explains the current screen, experiment structure, and scientific terminology. It is not an analysis engine and has no write path to the project, data sheet, analysis, Graph state, or saved project.

The first implementation uses the local deterministic provider. The application remains fully functional when no LLM provider exists.

## Boundaries

- `scientificHelpGlossary.ts` is the centralized, concise scientific glossary.
- `contextualHelp.ts` converts an explicit `ContextualHelpContext` into relevant topics.
- `readOnlyHelpProvider.ts` defines the provider-neutral explanation-only contract.
- `ContextualHelp.tsx` presents suggestions and provider explanations without project mutation callbacks.

The Help context allow-list contains only:

- current surface;
- readout type;
- experimental-unit label and biological n;
- paired, nested, and time-structure flags;
- selected method ID;
- warning code;
- selected transformation.

Raw observations, statistical result values, project notes, file paths, identities, tokens, and full project serialization are outside the boundary. `createReadOnlyHelpRequest` reconstructs the request from the allow-list rather than spreading caller input.

## Optional provider rules

A future local or remote model implements `ReadOnlyHelpProvider`; statistical contracts do not depend on that provider. A remote provider must remain disabled until the user explicitly opts in. Before first use, the UI must show the external-processing disclosure, including that selected context leaves the computer, raw data are excluded by default, Help is advisory, and authoritative statistics are local.

No vendor, API key, network dependency, or automatic provider selection is part of this foundation.

## Integration points

The reusable panel can be mounted in the application shell with route-level context. Higher-value placements can pass richer allow-listed metadata from experimental-unit confirmation, Statistics, nested-data warnings, and time-series transformation controls.

Integration must not add callbacks that mutate scientific state. Any future action suggested by Help must be presented separately and require an explicit normal product action from the researcher.
